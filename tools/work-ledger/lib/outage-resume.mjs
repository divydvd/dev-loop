// Bounded transient-outage classification and idempotent away-mode recovery planner.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TAG, DEFAULT_CONFIG } from "./policy.mjs";

const PERMANENT_HTTP = new Set([400, 401, 403, 404, 422]);
const TRANSIENT_HTTP = new Set([429, 502, 503, 504]);
const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function extractNumericStatus(obj) {
  for (const src of [obj, obj?.data, obj?.error, obj?.cause]) {
    if (!src || typeof src !== "object") continue;
    for (const key of ["status", "statusCode", "httpStatus"]) {
      const val = src[key];
      if (Number.isInteger(val)) return val;
    }
  }
  return null;
}

function collectStrings(obj, key) {
  const out = [];
  for (const src of [obj, obj?.data, obj?.error, obj?.cause]) {
    if (!src || typeof src !== "object") continue;
    if (typeof src[key] === "string" && src[key]) out.push(src[key]);
  }
  return out;
}

export function classifyTransientOutage(errOrEvent) {
  if (!errOrEvent) return { transient: false, code: "empty" };
  const raw = typeof errOrEvent === "string" ? { message: errOrEvent } : errOrEvent;
  if (typeof raw !== "object") return { transient: false, code: "empty" };

  if (raw.permissionDecision === "deny") return { transient: false, code: "guard_denied" };
  if (raw.errorContext === "tool_execution" || raw.errorContext === "user_input") {
    return { transient: false, code: "non_session_context" };
  }

  const names = collectStrings(raw, "name");
  const codes = collectStrings(raw, "code");
  const errorTypes = collectStrings(raw, "errorType");
  const messages = [
    ...collectStrings(raw, "message"),
    ...(typeof raw.error === "string" ? [raw.error] : []),
  ];
  const combined = [...names, ...codes, ...errorTypes, ...messages].join(" | ");
  if (!combined && extractNumericStatus(raw) === null) return { transient: false, code: "empty" };

  if (/\[work-ledger\]/i.test(combined)) return { transient: false, code: "guard_denied" };
  if (
    names.includes("AbortError") ||
    codes.includes("ABORT_ERR") ||
    codes.includes("ERR_CANCELED") ||
    /\b(aborted|cancelled|canceled)\b/i.test(combined)
  ) {
    return { transient: false, code: "user_cancelled" };
  }
  if (
    names.includes("AssertionError") ||
    codes.includes("ERR_ASSERTION") ||
    /\b(?:AssertionError|ERR_ASSERTION)\b/.test(combined)
  ) {
    return { transient: false, code: "assertion_error" };
  }
  if (
    /\b(context_length_exceeded|context_window_exceeded|max_tokens_exceeded)\b/i.test(combined) ||
    /prompt is too long|context (?:length|window) exceeded|maximum context length/i.test(combined)
  ) {
    return { transient: false, code: "context_overflow" };
  }

  const numericStatus = extractNumericStatus(raw);
  if (numericStatus !== null) {
    if (TRANSIENT_HTTP.has(numericStatus)) return { transient: true, code: `http_${numericStatus}` };
    if (PERMANENT_HTTP.has(numericStatus) || numericStatus >= 400) {
      return { transient: false, code: `http_${numericStatus}` };
    }
  }
  const permHttpMatch = /\b(?:HTTP(?:\/[0-9.]+)?\s*|status(?:\s+code)?[:=\s]+)(400|401|403|404|409|413|422)\b/i.exec(combined);
  if (permHttpMatch) return { transient: false, code: `http_${permHttpMatch[1]}` };

  const transHttpMatch = /\b(?:HTTP(?:\/[0-9.]+)?\s*|status(?:\s+code)?[:=\s]+)(429|502|503|504)\b/i.exec(combined);
  if (transHttpMatch) return { transient: true, code: `http_${transHttpMatch[1]}` };

  for (const t of ["overloaded_error", "rate_limit_error"]) {
    if (errorTypes.includes(t) || codes.includes(t) || new RegExp(`\\b${t}\\b`, "i").test(combined)) {
      return { transient: true, code: t };
    }
  }
  for (const c of codes) {
    if (TRANSIENT_CODES.has(c)) return { transient: true, code: c.toLowerCase() };
  }
  const netCodeMatch = /\b(ETIMEDOUT|ECONNRESET|EAI_AGAIN|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)\b/.exec(combined);
  if (netCodeMatch) return { transient: true, code: netCodeMatch[1].toLowerCase() };

  if (/\b(upstream(?:\s+stream)?\s+disconnect(?:ed)?|stream\s+disconnected|socket\s+hang\s+up|premature\s+close)\b/i.test(combined)) {
    return { transient: true, code: "stream_disconnect" };
  }

  return { transient: false, code: "non_transient" };
}

function findCheckoutRoots(cwd) {
  if (!cwd) return [];
  const roots = [];
  let cur = path.resolve(cwd);
  for (let depth = 0; depth < 12; depth++) {
    roots.push(cur);
    if (fs.existsSync(path.join(cur, ".git"))) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return roots;
}

function parseAwayStateFromProgress(content) {
  let state = null;
  for (const line of String(content || "").split("\n")) {
    if (/^\s*(?:[-*]\s*)?active\s*:\s*true\s*$/i.test(line) || /^\s*\|\s*Mode\s*\|\s*Active\b/i.test(line)) state = true;
    if (/^\s*(?:[-*]\s*)?active\s*:\s*false\s*$/i.test(line) || /^\s*\|\s*Mode\s*\|\s*(?:Ended|Inactive)\b/i.test(line)) state = false;
  }
  return state;
}

export function detectAwayMode({ cwd, data, sessionId } = {}) {
  const rawReturned = Date.parse(sessionId ? data?.outageRecovery?.[sessionId]?.ownerReturnedAt || "" : "");
  let endedCutoffMs = Number.isFinite(rawReturned) ? rawReturned : 0;

  let decidedByProgress = false;
  for (const root of findCheckoutRoots(cwd)) {
    if (decidedByProgress) break;
    const sddDir = path.join(root, ".superpowers", "sdd");
    if (!fs.existsSync(sddDir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(sddDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const progressAbs = path.join(sddDir, d.name, "progress.md");
          let mtimeMs = 0;
          try { mtimeMs = fs.statSync(progressAbs).mtimeMs; } catch { return null; }
          return { slug: d.name, progressAbs, mtimeMs };
        })
        .filter(Boolean)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    } catch {
      entries = [];
    }
    for (const item of entries) {
      let text = "";
      try { text = fs.readFileSync(item.progressAbs, "utf8"); } catch { continue; }
      const state = parseAwayStateFromProgress(text);
      if (state === null) continue;
      decidedByProgress = true;
      if (state === false) {
        endedCutoffMs = Math.max(endedCutoffMs, item.mtimeMs);
        break;
      }
      if (item.mtimeMs <= endedCutoffMs) break;
      const headerMatch = /^#\s*SDD ledger\s*[—-]\s*plan:\s*(.+)$/m.exec(text) || /^\s*plan\s*[:=]\s*([^\s|]+)\s*$/im.exec(text);
      const planPath = headerMatch ? headerMatch[1].trim() : `docs/superpowers/plans/${item.slug}.md`;
      const progressPath = path.relative(root, item.progressAbs).split(path.sep).join("/");
      return { active: true, planPath, progressPath };
    }
  }

  const notes = [];
  for (const unit of Object.values(data?.units || {})) {
    for (const n of unit?.notes || []) {
      if (sessionId ? n.sessionId !== sessionId : false) continue;
      if (/^\s*away[_ -]mode\s*[:=]/i.test(n.text || "")) notes.push(n);
    }
  }
  notes.sort((a, b) => (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0));
  const latest = notes.at(-1);
  if (latest) {
    const noteMs = Date.parse(latest.at || "") || 0;
    const body = String(latest.text || "").replace(/^\s*away[_ -]mode\s*[:=]\s*/i, "");
    const ended = /^(?:active\s*[:=]\s*false|inactive|ended|off|returned)\b/i.test(body);
    const started = /^(?:active(?:\s*[:=]\s*true)?|enabled|on)\b/i.test(body);
    if (started && !ended && noteMs > endedCutoffMs) {
      const planMatch = /\bplan\s*[:=]\s*([^\s,;]+)/i.exec(body);
      return { active: true, planPath: planMatch ? planMatch[1] : null, progressPath: null };
    }
  }
  return { active: false, planPath: null, progressPath: null };
}

export function progressFingerprint(data, sessionId = null) {
  const matchSession = (item) => !sessionId || item?.sessionId === sessionId;
  const validations = (data?.validations || []).filter(matchSession).map((v) => `${v.sha || ""}:${v.tasks || ""}:${v.exit ?? ""}:${v.at || ""}`);
  const units = Object.keys(data?.units || {}).sort().map((k) => {
    const u = data.units[k] || {};
    const evs = (u.evidence || []).filter(matchSession);
    const notes = (u.notes || []).filter(matchSession);
    const revs = (u.reviews || []).filter(matchSession);
    const merges = (u.merges || []).filter(matchSession);
    if (sessionId && !evs.length && !notes.length && !revs.length && !merges.length) return null;
    const lastEv = evs.at(-1);
    const lastNote = notes.at(-1);
    const lastRev = revs.at(-1);
    const lastMerge = merges.at(-1);
    return [
      k,
      evs.length, lastEv?.at || "", lastEv?.sha || "", lastEv?.kind || "",
      notes.length, lastNote?.at || "",
      revs.length, lastRev?.at || "",
      merges.length, lastMerge?.at || "",
    ].join("|");
  }).filter(Boolean);
  return crypto.createHash("sha256").update(JSON.stringify({ validations, units })).digest("hex").slice(0, 12);
}

export function buildReconcilePrompt({ planPath, progressPath, attempt, maxAttempts, lastHeadSha, code } = {}) {
  const planRef = planPath || "the active plan in docs/superpowers/plans/";
  const progressRef = progressPath || ".superpowers/sdd/<plan>/progress.md";
  const shaNote = lastHeadSha ? ` (last observed HEAD: ${String(lastHeadSha).slice(0, 12)})` : "";
  return [
    `${TAG} Away-mode transient outage recovery (attempt ${attempt}/${maxAttempts}, cause: ${code || "transient_outage"})${shaNote}.`,
    `Before running any build, git, or GitHub command, inspect local and remote state in this exact order:`,
    `1. Read ${planRef} and ${progressRef}.`,
    `2. Run \`git status\` and \`git log -n 5\` to verify committed work.`,
    `3. Call \`work_ledger_get\` to inspect recorded validations, reviews, and open PR state.`,
    `Do not duplicate any commit, \`git push\`, or \`gh pr create\` that already succeeded. Resume from the first incomplete step while preserving all owner approval boundaries.`,
  ].join("\n");
}

export function planOutageResume(data, {
  sessionId,
  cwd,
  error,
  headSha = null,
  config = DEFAULT_CONFIG,
  now = Date.now(),
} = {}) {
  const classification = classifyTransientOutage(error);
  if (!classification.transient) {
    return {
      resume: false,
      reason: "non_transient",
      code: classification.code,
      attempt: 0,
      maxAttempts: config?.outageRetryCap ?? 3,
      delaySec: null,
      status: "ignored",
      prompt: null,
      record: null,
    };
  }
  const sid = sessionId || "default";
  const away = detectAwayMode({ cwd, data, sessionId: sid });
  const maxAttempts = Number.isInteger(config?.outageRetryCap) ? config.outageRetryCap : 3;
  const backoff = Array.isArray(config?.outageBackoffSec) && config.outageBackoffSec.length
    ? config.outageBackoffSec
    : [30, 120, 300];

  if (!away.active) {
    return {
      resume: false,
      reason: "away_mode_inactive",
      code: classification.code,
      attempt: 0,
      maxAttempts,
      delaySec: null,
      status: "inactive",
      prompt: null,
      record: null,
    };
  }

  data.outageRecovery ||= {};
  const existing = data.outageRecovery[sid];
  if (existing && existing.status === "retrying") {
    return {
      resume: false,
      deduplicated: true,
      reason: "already_retrying",
      code: classification.code,
      attempt: existing.attemptsUsed,
      maxAttempts,
      delaySec: existing.nextDelaySec ?? null,
      status: "retrying",
      prompt: existing.pendingPrompt || null,
      record: existing,
    };
  }

  const used = existing?.attemptsUsed || 0;
  const isoNow = new Date(now).toISOString();
  const fp = progressFingerprint(data, sid);

  if (used >= maxAttempts) {
    const exhausted = {
      ...existing,
      sessionId: sid,
      planPath: away.planPath || existing?.planPath || null,
      progressPath: away.progressPath || existing?.progressPath || null,
      attemptsUsed: used,
      lastHeadSha: headSha || existing?.lastHeadSha || null,
      lastProgressFingerprint: fp,
      lastOutageAt: isoNow,
      lastErrorCode: classification.code,
      nextDelaySec: null,
      pendingPrompt: null,
      status: "exhausted",
    };
    data.outageRecovery[sid] = exhausted;
    return {
      resume: false,
      reason: "retry_cap_exhausted",
      code: classification.code,
      attempt: used,
      maxAttempts,
      delaySec: null,
      status: "exhausted",
      prompt: null,
      record: exhausted,
    };
  }

  const attempt = used + 1;
  const delaySec = backoff[Math.min(used, backoff.length - 1)];
  const planPath = away.planPath || existing?.planPath || null;
  const progressPath = away.progressPath || existing?.progressPath || null;
  const prompt = buildReconcilePrompt({
    planPath,
    progressPath,
    attempt,
    maxAttempts,
    lastHeadSha: headSha || existing?.lastHeadSha || null,
    code: classification.code,
  });
  const record = {
    ...existing,
    sessionId: sid,
    planPath,
    progressPath,
    attemptsUsed: attempt,
    lastHeadSha: headSha || existing?.lastHeadSha || null,
    lastProgressFingerprint: fp,
    lastOutageAt: isoNow,
    lastErrorCode: classification.code,
    nextDelaySec: delaySec,
    pendingPrompt: prompt,
    status: "retrying",
  };
  data.outageRecovery[sid] = record;
  return {
    resume: true,
    code: classification.code,
    attempt,
    maxAttempts,
    delaySec,
    status: "retrying",
    prompt,
    record,
  };
}

export function markOutagePromptSent(data, sessionId, now = Date.now()) {
  const sid = sessionId || "default";
  const rec = data?.outageRecovery?.[sid];
  if (!rec) return null;
  rec.status = "resumed";
  rec.nextDelaySec = null;
  rec.pendingPrompt = null;
  rec.resumedAt = new Date(now).toISOString();
  rec.lastProgressFingerprint = progressFingerprint(data, sid);
  return rec;
}

export function revertOutagePromptSend(data, sessionId, { attempt, prompt, delaySec } = {}) {
  const sid = sessionId || "default";
  const rec = data?.outageRecovery?.[sid];
  if (!rec || rec.status !== "resumed" || rec.attemptsUsed !== attempt) return null;
  rec.status = "retrying";
  rec.pendingPrompt = prompt || null;
  rec.nextDelaySec = delaySec ?? null;
  return rec;
}

export function recordOutageProgress(data, { sessionId, headSha = null, now = Date.now() } = {}) {
  const sid = sessionId || "default";
  const rec = data?.outageRecovery?.[sid];
  if (!rec || rec.attemptsUsed === 0 || rec.status !== "resumed") return false;
  const currentFp = progressFingerprint(data, sid);
  const shaAdvanced = Boolean(headSha && rec.lastHeadSha && headSha !== rec.lastHeadSha) || Boolean(headSha && !rec.lastHeadSha);
  const ledgerAdvanced = currentFp !== rec.lastProgressFingerprint;
  if (!shaAdvanced && !ledgerAdvanced) return false;
  rec.attemptsUsed = 0;
  rec.status = "idle";
  rec.nextDelaySec = null;
  rec.pendingPrompt = null;
  if (headSha) rec.lastHeadSha = headSha;
  rec.lastProgressFingerprint = currentFp;
  rec.resetAt = new Date(now).toISOString();
  return true;
}

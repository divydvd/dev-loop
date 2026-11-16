// Bounded transient-outage classification and idempotent away-mode recovery planner.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TAG, DEFAULT_CONFIG } from "./policy.mjs";

const PERMANENT_HTTP = new Set([400, 401, 403, 404, 422]), TRANSIENT_HTTP = new Set([429, 502, 503, 504]);
const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
const BAD_ACT = /^(?:-|none|null|false|n\/a|na|tbd|todo|pending|unknown|unconfirmed|inferred)\b/i;
const collectStrings = (o, k) => [o, o?.data, o?.error, o?.cause].filter((s) => s && typeof s === "object" && typeof s[k] === "string" && s[k]).map((s) => s[k]);
const hasTok = (s, tok) => Boolean(tok) && new RegExp(`(?:^|[^A-Za-z0-9_.-])${String(tok).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_.-])`).test(String(s || ""));
function extractNumericStatus(obj) {
  for (const s of [obj, obj?.data, obj?.error, obj?.cause]) if (s && typeof s === "object") for (const k of ["status", "statusCode", "httpStatus"]) if (Number.isInteger(s[k])) return s[k];
  return null;
}
export function classifyTransientOutage(errOrEvent) {
  const raw = typeof errOrEvent === "string" ? { message: errOrEvent } : errOrEvent;
  if (!raw || typeof raw !== "object") return { transient: false, code: "empty" };
  if (raw.agentId || raw.checkpoint || raw.data?.parentToolCallId) return { transient: false, code: "subagent_or_checkpoint" };
  if (raw.permissionDecision === "deny") return { transient: false, code: "guard_denied" };
  if (raw.errorContext === "tool_execution" || raw.errorContext === "user_input") return { transient: false, code: "non_session_context" };
  const names = collectStrings(raw, "name"), codes = collectStrings(raw, "code"), types = collectStrings(raw, "errorType");
  const combined = [...names, ...codes, ...types, ...collectStrings(raw, "message"), ...(typeof raw.error === "string" ? [raw.error] : [])].join(" | "), st = extractNumericStatus(raw);
  if (!combined && st === null) return { transient: false, code: "empty" };
  if (/\[work-ledger\]/i.test(combined)) return { transient: false, code: "guard_denied" };
  if (names.includes("AbortError") || codes.includes("ABORT_ERR") || codes.includes("ERR_CANCELED") || /\b(aborted|cancelled|canceled)\b/i.test(combined)) return { transient: false, code: "user_cancelled" };
  if (names.includes("AssertionError") || codes.includes("ERR_ASSERTION") || /\b(?:AssertionError|ERR_ASSERTION)\b/.test(combined)) return { transient: false, code: "assertion_error" };
  if (/\b(context_length_exceeded|context_window_exceeded|max_tokens_exceeded)\b/i.test(combined) || /prompt is too long|context (?:length|window) exceeded|maximum context length/i.test(combined)) return { transient: false, code: "context_overflow" };
  if (st !== null) return TRANSIENT_HTTP.has(st) ? { transient: true, code: `http_${st}` } : (PERMANENT_HTTP.has(st) || st >= 400) ? { transient: false, code: `http_${st}` } : { transient: false, code: "non_transient" };
  const permHttp = /\b(?:HTTP(?:\/[0-9.]+)?\s*|status(?:\s+code)?[:=\s]+)(400|401|403|404|409|413|422)\b/i.exec(combined);
  if (permHttp) return { transient: false, code: `http_${permHttp[1]}` };
  const transHttp = /\b(?:HTTP(?:\/[0-9.]+)?\s*|status(?:\s+code)?[:=\s]+)(429|502|503|504)\b/i.exec(combined);
  if (transHttp) return { transient: true, code: `http_${transHttp[1]}` };
  for (const t of ["overloaded_error", "rate_limit_error"]) if (types.includes(t) || codes.includes(t) || new RegExp(`\\b${t}\\b`, "i").test(combined)) return { transient: true, code: t };
  for (const c of codes) if (TRANSIENT_CODES.has(c)) return { transient: true, code: c.toLowerCase() };
  const netCode = /\b(ETIMEDOUT|ECONNRESET|EAI_AGAIN|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)\b/.exec(combined);
  if (netCode) return { transient: true, code: netCode[1].toLowerCase() };
  return /\b(upstream(?:\s+stream)?\s+disconnect(?:ed)?|stream\s+disconnected|socket\s+hang\s+up|premature\s+close)\b/i.test(combined) ? { transient: true, code: "stream_disconnect" } : { transient: false, code: "non_transient" };
}
function findCheckoutRoots(cwd) {
  const roots = [];
  for (let cur = cwd ? path.resolve(cwd) : "", d = 0; cur && d < 12; cur = path.dirname(cur), d++) {
    roots.push(cur);
    if (fs.existsSync(path.join(cur, ".git")) || path.dirname(cur) === cur) break;
  }
  return roots;
}
export function parseOwnerAwayIntent(text) {
  const clauses = String(text || "").split(/[.!;\n]+/).map((c) => c.trim()).filter(Boolean);
  for (const c of clauses) if ((!/\b(?:when|until|before|after|once|if|unless|whether|say|type|send|write)\s+i(?:'?m|\s+am)\s+back\b/i.test(c) && /(?:^|[,:—–-]\s*)i(?:'?m|\s+am)\s+back\b/i.test(c)) || (!c.includes("?") && /^(?:please\s+)?(?:stop|end|exit|leave|disable|cancel|turn\s+off)(?:\s+away\s+mode)?\s*$/i.test(c))) return "return";
  for (const c of clauses) if (!c.includes("?") && !/\b(?:not|never|don'?t|without)\b/i.test(c) && /^(?:please\s+)?(?:(?:use|enter|enable|start|activate|turn\s+on|switch\s+to|go\s+(?:in)?to|(?:continue|proceed|work|run|keep\s+(?:going|working))\s+in)\s+)?away\s+mode(?:\s*$|[\s,:—–-])/i.test(c)) return "activate";
  return null;
}
function parseProgressRecord(content, sessionId) {
  let state = null, planPath = null, scopeCell = null, activation = null;
  const explicit = [];
  for (const line of String(content || "").split("\n")) {
    if (/^\s*(?:[-*]\s*)?active\s*:\s*true\s*$/i.test(line) || /^\s*\|\s*Mode\s*\|\s*Active\b/i.test(line)) state = true;
    if (/^\s*(?:[-*]\s*)?active\s*:\s*false\s*$/i.test(line) || /^\s*\|\s*Mode\s*\|\s*(?:Ended|Inactive)\b/i.test(line)) state = false;
    const pm = /^#\s*SDD ledger\s*[—-]\s*plan:\s*(.+)$/.exec(line) || /^\s*(?:[-*]\s*)?plan\s*[:=]\s*([^\s|]+)\s*$/i.exec(line), sm = /^\s*(?:[-*]\s*)?session(?:[_ -]?id)?\s*[:=]\s*([^\s|,;]+)\s*$/i.exec(line);
    if (pm) planPath = pm[1].trim();
    if (sm) explicit.push(sm[1].trim());
    const sc = /^\s*\|\s*Scope\s*\|\s*([^|]+)\|/i.exec(line), ac = /^\s*\|\s*Owner\s+activation\s*\|\s*([^|]+)\|/i.exec(line) || /^\s*(?:[-*]\s*)?(?:owner[_ -]?)?activation\s*[:=]\s*(.+)$/i.exec(line);
    if (sc) scopeCell = sc[1].trim();
    if (ac) activation = ac[1].trim();
  }
  if (!planPath && scopeCell) planPath = /([A-Za-z0-9_./-]+\.md)\b/.exec(scopeCell)?.[1] || null;
  return { state, planPath, matchesSession: Boolean(sessionId) && (explicit.length ? explicit.includes(sessionId) : hasTok(scopeCell, sessionId)), hasActivation: Boolean(activation && !BAD_ACT.test(activation)) };
}
export function detectAwayMode({ cwd, data, sessionId } = {}) {
  if (!sessionId) return { active: false, planPath: null, progressPath: null };
  const recState = data?.outageRecovery?.[sessionId], liveActMs = Date.parse(recState?.ownerActivatedAt || "") || 0;
  let endedCutoffMs = Date.parse(recState?.ownerReturnedAt || "") || 0, progCandidate = null, noteCandidate = null;
  for (const root of findCheckoutRoots(cwd)) {
    const sddDir = path.join(root, ".superpowers", "sdd");
    if (!fs.existsSync(sddDir)) continue;
    let items = [], decided = false;
    try { items = fs.readdirSync(sddDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => { const p = path.join(sddDir, d.name, "progress.md"); try { return { progressAbs: p, mtimeMs: fs.statSync(p).mtimeMs }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs); } catch { items = []; }
    for (const item of items) {
      let text = "";
      try { text = fs.readFileSync(item.progressAbs, "utf8"); } catch { continue; }
      const pr = parseProgressRecord(text, sessionId);
      if (!pr.matchesSession || pr.state === null) continue;
      decided = true;
      if (!pr.state) endedCutoffMs = Math.max(endedCutoffMs, item.mtimeMs);
      else if (pr.planPath && (pr.hasActivation || liveActMs > endedCutoffMs)) progCandidate = { atMs: liveActMs > endedCutoffMs ? Math.max(item.mtimeMs, liveActMs) : item.mtimeMs, planPath: pr.planPath, progressPath: path.relative(root, item.progressAbs).split(path.sep).join("/") };
      break;
    }
    if (decided) break;
  }
  const latest = Object.values(data?.units || {}).flatMap((u) => (u?.notes || []).filter((n) => n.sessionId === sessionId && /^\s*away[_ -]mode\s*[:=]/i.test(n.text || ""))).sort((a, b) => (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0)).at(-1);
  if (latest) {
    const noteMs = Date.parse(latest.at || "") || 0, body = String(latest.text || "").replace(/^\s*away[_ -]mode\s*[:=]\s*/i, "");
    if (/^(?:active\s*[:=]\s*false|inactive|ended|off|returned)\b/i.test(body)) endedCutoffMs = Math.max(endedCutoffMs, noteMs);
    else if (/^(?:active(?:\s*[:=]\s*true)?|enabled|on)\b/i.test(body)) {
      const planPath = /\bplan\s*[:=]\s*([^\s,;]+)/i.exec(body)?.[1] || null, act = /\bactivation\s*[:=]\s*([^\s,;]+)/i.exec(body)?.[1] || null;
      if (planPath && ((act && !BAD_ACT.test(act)) || liveActMs > endedCutoffMs)) noteCandidate = { atMs: liveActMs > endedCutoffMs ? Math.max(noteMs, liveActMs) : noteMs, planPath, progressPath: null };
    }
  }
  const chosen = [progCandidate, noteCandidate].filter(Boolean).sort((a, b) => b.atMs - a.atMs)[0];
  return chosen && chosen.atMs > endedCutoffMs ? { active: true, planPath: chosen.planPath, progressPath: chosen.progressPath } : { active: false, planPath: null, progressPath: null };
}
export function progressFingerprint(data, sessionId = null) {
  const match = (x) => !sessionId || x?.sessionId === sessionId;
  const validations = [...new Set((data?.validations || []).filter((v) => match(v) && v.exit === 0 && !v.dirty).map((v) => `${v.sha || ""}:${v.tasks || ""}`))].sort();
  const units = Object.keys(data?.units || {}).sort().map((k) => {
    const u = data.units[k] || {}, evs = (u.evidence || []).filter(match), notes = (u.notes || []).filter(match), revs = (u.reviews || []).filter(match), merges = (u.merges || []).filter(match);
    return (sessionId && !evs.length && !notes.length && !revs.length && !merges.length) ? null : [k, evs.length, evs.at(-1)?.at || "", evs.at(-1)?.sha || "", evs.at(-1)?.kind || "", notes.length, notes.at(-1)?.at || "", revs.length, revs.at(-1)?.at || "", merges.length, merges.at(-1)?.at || ""].join("|");
  }).filter(Boolean);
  return crypto.createHash("sha256").update(JSON.stringify({ validations, units })).digest("hex").slice(0, 12);
}
export function buildReconcilePrompt({ planPath, progressPath, attempt, maxAttempts, lastHeadSha, code } = {}) {
  const shaNote = lastHeadSha ? ` (last observed HEAD: ${String(lastHeadSha).slice(0, 12)})` : "";
  return `${TAG} Away-mode transient outage recovery (attempt ${attempt}/${maxAttempts}, cause: ${code || "transient_outage"})${shaNote}.\nBefore running any build, git, or GitHub command, inspect local and remote state in this exact order:\n1. Read ${planPath || "the active plan in docs/superpowers/plans/"} and ${progressPath || ".superpowers/sdd/<plan>/progress.md"}.\n2. Run \`git status\` and \`git log -n 5\` to verify committed work.\n3. Call \`work_ledger_get\` to inspect recorded validations, reviews, and open PR state.\nDo not duplicate any commit, \`git push\`, or \`gh pr create\` that already succeeded. Resume from the first incomplete step while preserving all owner approval boundaries.`;
}
export function planOutageResume(data, { sessionId, cwd, error, headSha = null, config = DEFAULT_CONFIG, now = Date.now() } = {}) {
  const cls = classifyTransientOutage(error), maxAttempts = Number.isInteger(config?.outageRetryCap) ? config.outageRetryCap : 3;
  const noResume = (reason, status, extra = {}) => ({ resume: false, reason, code: cls.code, attempt: 0, maxAttempts, delaySec: null, status, prompt: null, record: null, ...extra });
  if (!cls.transient) return noResume("non_transient", "ignored");
  const sid = sessionId || "", away = detectAwayMode({ cwd, data, sessionId: sid });
  if (!away.active) return noResume("away_mode_inactive", "inactive");
  if ((data.outageRecovery ||= {})[sid]?.status === "retrying") {
    const ex = data.outageRecovery[sid];
    return noResume("already_retrying", "retrying", { deduplicated: true, attempt: ex.attemptsUsed, delaySec: ex.nextDelaySec ?? null, prompt: ex.pendingPrompt || null, record: ex });
  }
  recordOutageProgress(data, { sessionId: sid, headSha, now });
  const existing = data.outageRecovery[sid], used = existing?.attemptsUsed || 0, backoff = Array.isArray(config?.outageBackoffSec) && config.outageBackoffSec.length ? config.outageBackoffSec : [30, 120, 300];
  const planPath = away.planPath || existing?.planPath || null, progressPath = away.progressPath || existing?.progressPath || null;
  const baseRec = { ...existing, sessionId: sid, planPath, progressPath, lastHeadSha: headSha || existing?.lastHeadSha || null, lastProgressFingerprint: progressFingerprint(data, sid), lastOutageAt: new Date(now).toISOString(), lastErrorCode: cls.code };
  if (used >= maxAttempts) return noResume("retry_cap_exhausted", "exhausted", { attempt: used, record: (data.outageRecovery[sid] = { ...baseRec, attemptsUsed: used, nextDelaySec: null, pendingPrompt: null, status: "exhausted" }) });
  const attempt = used + 1, delaySec = backoff[Math.min(used, backoff.length - 1)], prompt = buildReconcilePrompt({ planPath, progressPath, attempt, maxAttempts, lastHeadSha: baseRec.lastHeadSha, code: cls.code });
  return { resume: true, code: cls.code, attempt, maxAttempts, delaySec, status: "retrying", prompt, record: (data.outageRecovery[sid] = { ...baseRec, attemptsUsed: attempt, nextDelaySec: delaySec, pendingPrompt: prompt, status: "retrying" }) };
}
export function markOutagePromptSent(data, sessionId, now = Date.now(), headSha = null, opts = null) {
  const rec = sessionId ? data?.outageRecovery?.[sessionId] : null;
  if (!rec || rec.status !== "retrying") return null;
  if (opts && ((opts.attempt !== undefined && rec.attemptsUsed !== opts.attempt) || (opts.prompt !== undefined && rec.pendingPrompt !== opts.prompt))) return null;
  if (opts && (opts.config?.outageRetryCap <= 0 || (opts.cwd !== undefined && !detectAwayMode({ cwd: opts.cwd, data, sessionId }).active))) return (Object.assign(rec, { status: "cancelled", nextDelaySec: null, pendingPrompt: null }), null);
  Object.assign(rec, { status: "resumed", nextDelaySec: null, pendingPrompt: null, resumedAt: new Date(now).toISOString(), lastProgressFingerprint: progressFingerprint(data, sessionId) });
  if (headSha && !rec.lastHeadSha) rec.lastHeadSha = headSha;
  return rec;
}
export function revertOutagePromptSend(data, sessionId, { attempt, prompt, delaySec } = {}) {
  const rec = sessionId ? data?.outageRecovery?.[sessionId] : null;
  return (!rec || rec.status !== "resumed" || rec.attemptsUsed !== attempt) ? null : Object.assign(rec, { status: "retrying", pendingPrompt: prompt || null, nextDelaySec: delaySec ?? null });
}
export function recordOutageProgress(data, { sessionId, headSha = null, now = Date.now() } = {}) {
  const rec = sessionId ? data?.outageRecovery?.[sessionId] : null;
  if (!rec || rec.attemptsUsed === 0 || rec.status === "retrying") return false;
  if (headSha && !rec.lastHeadSha) rec.lastHeadSha = headSha;
  const currentFp = progressFingerprint(data, sessionId);
  if (!(headSha && rec.lastHeadSha && headSha !== rec.lastHeadSha) && currentFp === rec.lastProgressFingerprint) return false;
  Object.assign(rec, { attemptsUsed: 0, status: "idle", nextDelaySec: null, pendingPrompt: null, lastHeadSha: headSha || rec.lastHeadSha, lastProgressFingerprint: currentFp, resetAt: new Date(now).toISOString() });
  return true;
}
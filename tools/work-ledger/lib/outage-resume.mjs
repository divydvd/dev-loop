// Bounded transient-outage classification and idempotent away-mode recovery planner.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TAG, DEFAULT_CONFIG } from "./policy.mjs";
const PERMANENT_HTTP = new Set([400, 401, 403, 404, 422]), TRANSIENT_HTTP = new Set([429, 502, 503, 504]), TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
const BAD_ACT = /^(?:-|none|null|false|n\/a|na|tbd|todo|pending|unknown|unconfirmed|inferred)\b/i, ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/;
const parseIso = (s) => Date.parse(ISO_RE.exec(String(s || ""))?.[0] || "") || 0, h8 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8), mergeSeen = (prev, cur) => [...new Set([...(prev || []), ...cur])].slice(-500);
const isPidAlive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e?.code === "EPERM"; } };
const isLiveDispatch = (rec, now = Date.now(), selfPid = 0) => rec?.status === "dispatching" && (now - (Date.parse(rec.dispatchAt || "") || 0) < 15000) && (rec.dispatchPid === selfPid || isPidAlive(rec.dispatchPid));
const clearPendingFields = (rec, status) => Object.assign(rec, { ...(status ? { status } : {}), nextDelaySec: null, pendingPrompt: null, dispatchToken: null, dispatchPid: null });
const collectStrings = (o, k) => [o, o?.data, o?.error, o?.cause].filter((s) => s && typeof s === "object" && typeof s[k] === "string" && s[k]).map((s) => s[k]);
const hasTok = (s, tok) => Boolean(tok) && new RegExp(`(?:^|[^A-Za-z0-9_.-])${String(tok).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_.-])`).test(String(s || ""));
const extractNumericStatus = (obj) => { for (const s of [obj, obj?.data, obj?.error, obj?.cause]) if (s && typeof s === "object") for (const k of ["status", "statusCode", "httpStatus"]) if (Number.isInteger(s[k])) return s[k]; return null; };
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
  if (st !== null) return TRANSIENT_HTTP.has(st) ? { transient: true, code: `http_${st}` } : { transient: false, code: (PERMANENT_HTTP.has(st) || st >= 400) ? `http_${st}` : "non_transient" };
  const permHttp = /\b(?:HTTP(?:\/[0-9.]+)?\s*|status(?:\s+code)?[:=\s]+)(400|401|403|404|409|413|422)\b/i.exec(combined), transHttp = /\b(?:HTTP(?:\/[0-9.]+)?\s*|status(?:\s+code)?[:=\s]+)(429|502|503|504)\b/i.exec(combined);
  if (permHttp) return { transient: false, code: `http_${permHttp[1]}` };
  if (transHttp) return { transient: true, code: `http_${transHttp[1]}` };
  for (const t of ["overloaded_error", "rate_limit_error"]) if (types.includes(t) || codes.includes(t) || new RegExp(`\\b${t}\\b`, "i").test(combined)) return { transient: true, code: t };
  const codeHit = codes.find((c) => TRANSIENT_CODES.has(c)) || /\b(ETIMEDOUT|ECONNRESET|EAI_AGAIN|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)\b/.exec(combined)?.[1];
  if (codeHit) return { transient: true, code: codeHit.toLowerCase() };
  return { transient: /\b(upstream(?:\s+stream)?\s+disconnect(?:ed)?|stream\s+disconnected|socket\s+hang\s+up|premature\s+close)\b/i.test(combined), code: /\b(upstream(?:\s+stream)?\s+disconnect(?:ed)?|stream\s+disconnected|socket\s+hang\s+up|premature\s+close)\b/i.test(combined) ? "stream_disconnect" : "non_transient" };
}
function findCheckoutRoots(cwd) {
  const roots = []; for (let cur = cwd ? path.resolve(cwd) : "", d = 0; cur && d < 12; cur = path.dirname(cur), d++) { roots.push(cur); if (fs.existsSync(path.join(cur, ".git")) || path.dirname(cur) === cur) break; }
  return roots;
}
export function parseOwnerAwayIntent(text) {
  for (const c of String(text || "").split(/[.!;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    if ((!/\b(?:when|until|before|after|once|if|unless|whether|say|type|send|write)\s+i(?:'?m|\s+am)\s+back\b/i.test(c) && /(?:^|[,:—–-]\s*)i(?:'?m|\s+am)\s+back\b/i.test(c)) || (!c.includes("?") && /^(?:please\s+)?(?:stop|end|exit|leave|disable|cancel|turn\s+off)(?:\s+away\s+mode)?\s*$/i.test(c))) return "return";
    if (!c.includes("?") && !/\b(?:not|never|don'?t|without)\b/i.test(c) && /^(?:please\s+)?(?:(?:use|enter|enable|start|activate|turn\s+on|switch\s+to|go\s+(?:in)?to|(?:continue|proceed|work|run|keep\s+(?:going|working))\s+in)\s+)?away\s+mode(?:\s*$|[\s,:—–-])/i.test(c)) return "activate";
  }
  return null;
}
function parseProgressRecord(content, sessionId) {
  let state = null, planPath = null, scopeCell = null, activation = null, started = null; const explicit = [];
  for (const line of String(content || "").split("\n")) {
    if (/^\s*(?:[-*]\s*)?active\s*:\s*true\s*$/i.test(line) || /^\s*\|\s*Mode\s*\|\s*Active\b/i.test(line)) state = true;
    if (/^\s*(?:[-*]\s*)?active\s*:\s*false\s*$/i.test(line) || /^\s*\|\s*Mode\s*\|\s*(?:Ended|Inactive)\b/i.test(line)) state = false;
    const pm = /^#\s*SDD ledger\s*[—-]\s*plan:\s*(.+)$/.exec(line) || /^\s*(?:[-*]\s*)?plan\s*[:=]\s*([^\s|]+)\s*$/i.exec(line), sm = /^\s*(?:[-*]\s*)?session(?:[_ -]?id)?\s*[:=]\s*([^\s|,;]+)\s*$/i.exec(line);
    if (pm) planPath = pm[1].trim(); if (sm) explicit.push(sm[1].trim());
    const sc = /^\s*\|\s*Scope\s*\|\s*([^|]+)\|/i.exec(line), ac = /^\s*\|\s*Owner\s+activation\s*\|\s*([^|]+)\|/i.exec(line) || /^\s*(?:[-*]\s*)?(?:owner[_ -]?)?activation\s*[:=]\s*(.+)$/i.exec(line), st = /^\s*\|\s*Started\s*\|\s*([^|]+)\|/i.exec(line);
    if (sc) scopeCell = sc[1].trim(); if (ac) activation = ac[1].trim(); if (st) started = st[1].trim();
  }
  return { state, planPath: planPath || (/([A-Za-z0-9_./-]+\.md)\b/.exec(scopeCell || "")?.[1] || null), matchesSession: Boolean(sessionId) && (explicit.length ? explicit.includes(sessionId) : hasTok(scopeCell, sessionId)), hasActivation: Boolean(activation && !BAD_ACT.test(activation)), actMs: Math.max(parseIso(activation), parseIso(started)) };
}
export function detectAwayMode({ cwd, data, sessionId } = {}) {
  if (!sessionId) return { active: false, planPath: null, progressPath: null };
  const recState = data?.outageRecovery?.[sessionId], ownerRetMs = Date.parse(recState?.ownerReturnedAt || "") || 0, liveActMs = Date.parse(recState?.ownerActivatedAt || "") || 0;
  let endedCutoffMs = ownerRetMs, progCandidate = null, noteCandidate = null;
  for (const root of findCheckoutRoots(cwd)) {
    const sddDir = path.join(root, ".superpowers", "sdd");
    if (!fs.existsSync(sddDir)) continue;
    let items = [], decided = false;
    try { items = fs.readdirSync(sddDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => { const p = path.join(sddDir, d.name, "progress.md"); try { return { progressAbs: p, mtimeMs: fs.statSync(p).mtimeMs }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs); } catch { items = []; }
    for (const item of items) {
      let text = ""; try { text = fs.readFileSync(item.progressAbs, "utf8"); } catch { continue; }
      const pr = parseProgressRecord(text, sessionId);
      if (!pr.matchesSession || pr.state === null) continue;
      decided = true;
      if (!pr.state) endedCutoffMs = Math.max(endedCutoffMs, item.mtimeMs);
      else if (pr.planPath && (pr.hasActivation || liveActMs > endedCutoffMs)) progCandidate = { atMs: Math.max(item.mtimeMs, liveActMs, 1), actMs: ownerRetMs > 0 ? liveActMs : Math.max(liveActMs, pr.actMs), planPath: pr.planPath, progressPath: path.relative(root, item.progressAbs).split(path.sep).join("/") };
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
      if (planPath && ((act && !BAD_ACT.test(act)) || liveActMs > endedCutoffMs)) noteCandidate = { atMs: Math.max(noteMs, liveActMs, 1), actMs: ownerRetMs > 0 ? liveActMs : Math.max(liveActMs, parseIso(act)), planPath, progressPath: null };
    }
  }
  const chosen = [progCandidate, noteCandidate].filter((c) => c && (endedCutoffMs === 0 || c.actMs > endedCutoffMs)).sort((a, b) => b.atMs - a.atMs)[0];
  return chosen ? { active: true, planPath: chosen.planPath, progressPath: chosen.progressPath } : { active: false, planPath: null, progressPath: null };
}
function progressKeys(data, sessionId = null) {
  const match = (x) => !sessionId || x?.sessionId === sessionId, out = (data?.validations || []).filter((v) => match(v) && v.exit === 0 && !v.dirty).map((v) => h8(`v:${v.sha || ""}:${v.tasks || ""}`));
  for (const k of Object.keys(data?.units || {}).sort()) {
    const u = data.units[k] || {};
    for (const [p, xs] of [["e", u.evidence], ["r", u.reviews], ["m", u.merges]]) for (const x of (xs || []).filter(match)) out.push(h8(`${p}:${k}:${x.kind || ""}:${x.sha || ""}:${x.at || ""}`));
    for (const n of (u.notes || []).filter((x) => match(x) && !/^\s*away[_ -]mode\s*[:=]/i.test(x?.text || ""))) out.push(h8(`n:${k}:${n.at || ""}`));
  }
  return [...new Set(out)].sort();
}
export const progressFingerprint = (data, sessionId = null) => crypto.createHash("sha256").update(JSON.stringify(progressKeys(data, sessionId))).digest("hex").slice(0, 12);
export function buildReconcilePrompt({ planPath, progressPath, attempt, maxAttempts, lastHeadSha, code } = {}) {
  const shaNote = lastHeadSha ? ` (last observed HEAD: ${String(lastHeadSha).slice(0, 12)})` : "";
  return `${TAG} Away-mode transient outage recovery (attempt ${attempt}/${maxAttempts}, cause: ${code || "transient_outage"})${shaNote}.\nBefore running any build, git, or GitHub command, inspect local and remote state in this exact order:\n1. Read ${planPath || "the active plan in docs/superpowers/plans/"} and ${progressPath || ".superpowers/sdd/<plan>/progress.md"}.\n2. Run \`git status\` and \`git log -n 5\` to verify committed work.\n3. Call \`work_ledger_get\` to inspect recorded validations, reviews, and open PR state.\nDo not duplicate any commit, \`git push\`, or \`gh pr create\` that already succeeded. Resume from the first incomplete step while preserving all owner approval boundaries.`;
}
export function planOutageResume(data, { sessionId, cwd, error, headSha = null, config = DEFAULT_CONFIG, now = Date.now() } = {}) {
  const cls = classifyTransientOutage(error), maxAttempts = Number.isInteger(config?.outageRetryCap) ? config.outageRetryCap : 3;
  const noResume = (reason, status, extra = {}) => ({ resume: false, reason, code: cls.code, attempt: 0, maxAttempts, delaySec: null, status, prompt: null, record: null, ...extra });
  if (!cls.transient) return noResume("non_transient", "ignored");
  const sid = sessionId || "", away = detectAwayMode({ cwd, data, sessionId: sid }), cur = (data.outageRecovery ||= {})[sid];
  if (!away.active) return noResume("away_mode_inactive", "inactive");
  if (cur?.status === "retrying" || isLiveDispatch(cur, now, process.pid)) return noResume("already_retrying", "retrying", { deduplicated: true, attempt: cur.attemptsUsed, delaySec: cur.nextDelaySec ?? null, prompt: cur.pendingPrompt || null, record: cur });
  recordOutageProgress(data, { sessionId: sid, headSha, now });
  const existing = data.outageRecovery[sid], used = existing?.attemptsUsed || 0, backoff = Array.isArray(config?.outageBackoffSec) && config.outageBackoffSec.length ? config.outageBackoffSec : [30, 120, 300];
  const planPath = away.planPath || existing?.planPath || null, progressPath = away.progressPath || existing?.progressPath || null, keys = progressKeys(data, sid);
  const baseRec = { ...existing, sessionId: sid, planPath, progressPath, lastHeadSha: headSha || existing?.lastHeadSha || null, seenProgressKeys: mergeSeen(existing?.seenProgressKeys, keys), lastProgressFingerprint: progressFingerprint(data, sid), lastOutageAt: new Date(now).toISOString(), lastErrorCode: cls.code, dispatchToken: null, dispatchPid: null };
  if (used >= maxAttempts) return noResume("retry_cap_exhausted", "exhausted", { attempt: used, record: (data.outageRecovery[sid] = { ...baseRec, attemptsUsed: used, nextDelaySec: null, pendingPrompt: null, status: "exhausted" }) });
  const attempt = used + 1, delaySec = backoff[Math.min(used, backoff.length - 1)], prompt = buildReconcilePrompt({ planPath, progressPath, attempt, maxAttempts, lastHeadSha: baseRec.lastHeadSha, code: cls.code });
  return { resume: true, code: cls.code, attempt, maxAttempts, delaySec, status: "retrying", prompt, record: (data.outageRecovery[sid] = { ...baseRec, attemptsUsed: attempt, nextDelaySec: delaySec, pendingPrompt: prompt, status: "retrying" }) };
}
const verifyClaimOpts = (data, sessionId, rec, opts) => {
  if (opts && ((opts.attempt !== undefined && rec.attemptsUsed !== opts.attempt) || (opts.prompt !== undefined && rec.pendingPrompt !== opts.prompt))) return false;
  return !(opts && (opts.config?.outageRetryCap <= 0 || (opts.cwd !== undefined && !detectAwayMode({ cwd: opts.cwd, data, sessionId }).active))) || (clearPendingFields(rec, "cancelled"), false);
};
export function claimOutageDispatch(data, sessionId, now = Date.now(), headSha = null, opts = {}) {
  const rec = sessionId ? data?.outageRecovery?.[sessionId] : null;
  if (!rec || !(rec.status === "retrying" || (rec.status === "dispatching" && !isLiveDispatch(rec, now, opts.pid || 0))) || !verifyClaimOpts(data, sessionId, rec, opts)) return null;
  return Object.assign(rec, { status: "dispatching", dispatchToken: crypto.randomBytes(6).toString("hex"), dispatchPid: opts.pid || process.pid, dispatchAt: new Date(now).toISOString(), ...(headSha && !rec.lastHeadSha ? { lastHeadSha: headSha } : {}) });
}
export function markOutagePromptSent(data, sessionId, now = Date.now(), headSha = null, opts = null) {
  const rec = sessionId ? data?.outageRecovery?.[sessionId] : null;
  if (!rec || (opts?.dispatchToken ? (rec.status !== "dispatching" || rec.dispatchToken !== opts.dispatchToken) : (rec.status !== "retrying" && rec.status !== "dispatching")) || !verifyClaimOpts(data, sessionId, rec, opts)) return null;
  return Object.assign(clearPendingFields(rec, "resumed"), { resumedAt: new Date(now).toISOString(), seenProgressKeys: mergeSeen(rec.seenProgressKeys, progressKeys(data, sessionId)), lastProgressFingerprint: progressFingerprint(data, sessionId), ...(headSha && !rec.lastHeadSha ? { lastHeadSha: headSha } : {}) });
}
export function revertOutagePromptSend(data, sessionId, { attempt, prompt, delaySec, dispatchToken } = {}) {
  const rec = sessionId ? data?.outageRecovery?.[sessionId] : null;
  return (!rec || rec.attemptsUsed !== attempt || (dispatchToken ? rec.dispatchToken !== dispatchToken : rec.status !== "resumed")) ? null : Object.assign(rec, { status: "retrying", pendingPrompt: prompt || rec.pendingPrompt || null, nextDelaySec: delaySec ?? rec.nextDelaySec ?? null, dispatchToken: null, dispatchPid: null });
}
const applyAwayIntent = (rec, intent, iso, messageId, cancelAlways = false) => {
  if ((cancelAlways || intent === "return") && (rec.status === "retrying" || rec.status === "dispatching")) clearPendingFields(rec, "cancelled");
  if (intent === "return") Object.assign(rec, { ownerReturnedAt: iso, lastOutageAt: rec.lastOutageAt || iso });
  else if (intent === "activate") Object.assign(rec, { ownerActivatedAt: iso, lastOutageAt: rec.lastOutageAt || iso });
  if (intent && messageId) rec.seenAwayIds = [...new Set([...(rec.seenAwayIds || []), messageId])].slice(-30);
};
export function recordOwnerAwayMessage(data, sessionId, awayIntent, messageId = null, now = Date.now()) {
  const rec = (data.outageRecovery ||= {})[sessionId] || { sessionId, attemptsUsed: 0, status: "idle" };
  applyAwayIntent(rec, awayIntent, new Date(now).toISOString(), messageId, true);
  data.outageRecovery[sessionId] = rec;
}
export function reconcileAwayHistory(data, sessionId, rawEvents = [], firstUserId = null, cleanFn = (s) => ({ text: String(s || "") }), now = Date.now()) {
  if (!sessionId || !Array.isArray(rawEvents) || !rawEvents.length) return false;
  const rec = (data.outageRecovery ||= {})[sessionId] || { sessionId, attemptsUsed: 0, status: "idle" }, seen = new Set(rec.seenAwayIds || []);
  const firstId = firstUserId || rawEvents.find((e) => e?.type === "user.message" && !e.agentId && !String(e.data?.content || "").trimStart().startsWith(TAG))?.id || null, lastSeenIdx = rawEvents.findLastIndex((e) => e?.id && seen.has(e.id));
  let prevMs = Math.max(Date.parse(rec.ownerReturnedAt || "") || 0, Date.parse(rec.ownerActivatedAt || "") || 0), seqMs = 0, changed = false;
  for (let i = lastSeenIdx + 1; i < rawEvents.length; i++) {
    const e = rawEvents[i], d = e?.data || {};
    if (e?.type !== "user.message" || e.agentId || String(d.content || "").trimStart().startsWith(TAG) || e.id === firstId || d.source || d.isAutopilotContinuation) continue;
    const intent = parseOwnerAwayIntent(cleanFn(d.content).text), pMs = Date.parse(e.timestamp || d.timestamp || "") || 0;
    if (!intent || (lastSeenIdx < 0 && prevMs > 0 && pMs > 0 && pMs <= prevMs)) continue;
    seqMs = pMs > seqMs ? pMs : (seqMs ? seqMs + 1 : 0); prevMs = Math.max(seqMs || now, prevMs + 1); changed = true;
    applyAwayIntent(rec, intent, new Date(prevMs).toISOString(), e.id, false);
  }
  if (changed) data.outageRecovery[sessionId] = rec;
  return changed;
}
export function recordOutageProgress(data, { sessionId, headSha = null, now = Date.now() } = {}) {
  const rec = sessionId ? data?.outageRecovery?.[sessionId] : null;
  if (!rec || rec.attemptsUsed === 0 || rec.status === "retrying" || rec.status === "dispatching") return false;
  if (headSha && !rec.lastHeadSha) rec.lastHeadSha = headSha;
  const curKeys = progressKeys(data, sessionId), seen = Array.isArray(rec.seenProgressKeys) ? new Set(rec.seenProgressKeys) : null;
  if (!(headSha && rec.lastHeadSha && headSha !== rec.lastHeadSha) && !(seen ? curKeys.some((k) => !seen.has(k)) : progressFingerprint(data, sessionId) !== rec.lastProgressFingerprint)) return false;
  Object.assign(clearPendingFields(rec, "idle"), { attemptsUsed: 0, lastHeadSha: headSha || rec.lastHeadSha, seenProgressKeys: mergeSeen(rec.seenProgressKeys, curKeys), lastProgressFingerprint: progressFingerprint(data, sessionId), resetAt: new Date(now).toISOString() });
  return true;
}
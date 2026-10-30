// Work-unit facts. A unit is one PR. Every fact is pinned to a commit SHA,
// so a new head commit makes old evidence stale without any reset step.
import { ensureUnit, unitKey, activeApprovals } from "./store.mjs";

export const EVIDENCE_KINDS = ["validated", "review_clean", "device_tested", "note"];
const SHA_RE = /^[0-9a-f]{7,40}$/i;

export function isSha(s) { return typeof s === "string" && SHA_RE.test(s); }

/** True when two SHAs name the same commit (one may be abbreviated, min 7 chars). */
export function sameSha(a, b) {
  if (!isSha(a) || !isSha(b)) return false;
  const x = a.toLowerCase(), y = b.toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

export const short = (s) => (s ? String(s).slice(0, 7) : "?");

export function sameRepo(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

export function findUnit(data, repo, pr) {
  const direct = data.units[unitKey(repo, pr)];
  if (direct) return direct;
  return Object.values(data.units).find((u) => u.pr === pr && sameRepo(u.repo, repo)) || null;
}

export function recordEvidence(data, { repo, pr, kind, sha, text, sessionId, now = new Date() }) {
  if (!EVIDENCE_KINDS.includes(kind)) throw new Error(`kind must be one of ${EVIDENCE_KINDS.join(", ")}`);
  if (kind !== "note" && !isSha(sha)) throw new Error("sha must be the exact commit SHA the evidence applies to (7-40 hex characters)");
  if (!String(text || "").trim()) throw new Error("evidence text is required (for example the command and the result counts)");
  const u = findUnit(data, repo, pr) || ensureUnit(data, repo, pr);
  u.updatedAt = now.toISOString();
  const entry = { kind, sha: sha || null, text: String(text).slice(0, 600), sessionId: sessionId || null, at: now.toISOString() };
  if (kind === "note") u.notes.push(entry);
  else (u.evidence ||= []).push(entry);
  u.evidence = (u.evidence || []).slice(-40);
  return entry;
}

/** Gradle passes recorded automatically for this exact commit. */
export function passingRuns(data, sha) {
  return (data.validations || []).filter((v) => v.exit === 0 && !v.dirty && sameSha(v.sha, sha));
}

/** Facts for one PR at one head commit. */
export function unitFacts(data, repo, pr, head, now = Date.now()) {
  const u = findUnit(data, repo, pr);
  const ev = (u?.evidence || []).filter((e) => sameSha(e.sha, head));
  const approvals = activeApprovals(data, now).filter((a) => a.kind === "merge" && a.pr === pr && sameRepo(a.repo, repo));
  return {
    unit: u,
    merged: (u?.merges || []).at(-1) || null,
    validated: ev.filter((e) => e.kind === "validated"),
    autoRuns: head ? passingRuns(data, head) : [],
    reviewClean: ev.filter((e) => e.kind === "review_clean"),
    deviceTested: ev.filter((e) => e.kind === "device_tested"),
    reviewsAtHead: (u?.reviews || []).filter((r) => sameSha(r.sha, head)),
    reviewRounds: (u?.reviews || []).length,
    approval: approvals.find((a) => sameSha(a.sha, head)) || null,
    staleApproval: approvals.find((a) => !sameSha(a.sha, head)) || null,
  };
}

function ago(iso, now) {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "?";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export function formatUnit(data, repo, pr, head, now = Date.now()) {
  const f = unitFacts(data, repo, pr, head, now);
  const yes = (arr, fmt) => (arr.length ? `yes (${fmt(arr.at(-1))})` : "no");
  const lines = [`${repo}#${pr} @ ${head ? short(head) : "unknown head"}`];
  if (f.merged) lines.push(`merged: yes (${short(f.merged.sha)}, ${ago(f.merged.at, now)})`);
  lines.push(`validated at this head: ${f.validated.length || f.autoRuns.length ? "yes" : "no"}` +
    (f.validated.length ? ` — ${f.validated.at(-1).text}` : "") +
    (f.autoRuns.length ? ` — Gradle passed: ${[...new Set(f.autoRuns.map((v) => v.tasks))].slice(-3).join("; ")}` : ""));
  lines.push(`review clean at this head: ${yes(f.reviewClean, (e) => e.text)}`);
  lines.push(`device tested at this head: ${yes(f.deviceTested, (e) => e.text)}`);
  lines.push(`Copilot reviews: ${f.reviewRounds} round(s); at this head: ${f.reviewsAtHead.length}`);
  lines.push(`owner merge approval: ${f.approval ? `yes (${ago(f.approval.at, now)}${f.approval.anyway ? ", anyway" : ""})` : f.staleApproval ? `stale (given for ${short(f.staleApproval.sha)}; new commits need a new approval)` : "no"}`);
  const notes = (f.unit?.notes || []).slice(-3);
  if (notes.length) lines.push(`notes: ${notes.map((n) => n.text).join(" | ")}`);
  return lines.join("\n");
}

// Turns the owner's typed words into approvals for the ledger.
import crypto from "node:crypto";
import { parseOwnerText } from "./approvals.mjs";

const HOUR = 3600000;
export const MAX_OWNER_LEN = 4000;
const MAX_LINE = 1500;
const APPROVAL_WORDS = /\b(merge|deploy|guards?\s+(on|off)|review\s+again|play\s*store|release)\b/i;

/**
 * Remove text that the owner did not type as an instruction: injected blocks, code, quotes, pasted logs.
 * dropped=true when length limits removed text that looks like an approval, so the caller can tell the owner.
 */
export function cleanOwnerTextInfo(text) {
  let s = String(text || "");
  s = s.replace(/<([a-zA-Z][\w-]*)(\s[^>]*)?>[\s\S]*?<\/\1>/g, " ");
  s = s.replace(/```[\s\S]*?(```|$)/g, " ");
  s = s.replace(/`[^`\n]*`/g, " ");
  s = s.replace(/“[^”\n]{0,300}”/g, " ");
  s = s.replace(/(^|[\s(\[{:,;])"[^"\n]{0,300}"(?=$|[\s.,;:!?)\]}])/gm, "$1 ");
  s = s.replace(/(^|[\s(\[{:,;])'[^'\n]{0,300}'(?=$|[\s.,;:!?)\]}])/gm, "$1 ");
  s = s.replace(/(^|[\s(\[{:,;])‘[^’\n]{0,300}’(?=$|[\s.,;:!?)\]}])/gm, "$1 ");
  const lines = s.split("\n").filter((l) => !/^\s*>/.test(l));
  const long = lines.filter((l) => l.length > MAX_LINE);
  s = lines.filter((l) => l.length <= MAX_LINE).join("\n");
  s = s.replace(/\bmerge\s+(remote-tracking\s+)?branch\b[^\n]*/gi, " ");
  s = s.replace(/\bmerge\s+pull\s+request\s+#\d+\s+from\b[^\n]*/gi, " ");
  s = s.trim();
  if (s.length > MAX_OWNER_LEN) return { text: "", dropped: APPROVAL_WORDS.test(s) };
  return { text: s, dropped: long.some((l) => APPROVAL_WORDS.test(l)) };
}
export const cleanOwnerText = (text) => cleanOwnerTextInfo(text).text;

const samePr = (a, b) => a.pr === b.pr && String(a.repo || "").toLowerCase() === String(b.repo || "").toLowerCase();

/**
 * Decide what the owner's message approves. No I/O.
 * ctx: { sessionId, pending, lastNamed:[{repo,pr}], defaultRepo, now }
 */
export function planOwnerMessage(text, { sessionId, pending = [], approvals = [], lastNamed = [], defaultRepo = null, now = Date.now() } = {}) {
  const parsed = parseOwnerText(text, { defaultRepo });
  const plan = { merges: [], deploys: [...parsed.deploys], reviews: [], guards: parsed.guards, revoke: [], notes: [] };
  const add = (list, r) => { if (r && r.pr && !list.some((x) => samePr(x, r))) list.push(r); };
  const mine = (kind, maxAge) => pending
    .filter((p) => p.kind === kind && p.sessionId === sessionId && now - Date.parse(p.at) < maxAge)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  for (const m of parsed.merges) add(plan.merges, m);
  if (parsed.mergeContext) {
    const { scope, anyway } = parsed.mergeContext;
    const pm = mine("merge", 24 * HOUR);
    if (scope === "one") {
      if (pm.length) add(plan.merges, { repo: pm[0].repo, pr: pm[0].pr, anyway });
      else if (lastNamed.length === 1) add(plan.merges, { ...lastNamed[0], anyway });
      else plan.notes.push(lastNamed.length
        ? `"merge it" is not clear here (${lastNamed.map((r) => "#" + r.pr).join(", ")}). Type the number, for example "merge #${lastNamed[0].pr}".`
        : `"merge it" did not match a PR in this session. Type the number, for example "merge #123".`);
    } else {
      const src = pm.length ? pm : lastNamed;
      if (src.length) src.forEach((p) => add(plan.merges, { repo: p.repo, pr: p.pr, anyway }));
      else plan.notes.push(`"merge them" did not match any PR in this session. Type the numbers.`);
    }
  }

  if (parsed.deployContext) {
    const pd = mine("deploy", 2 * HOUR);
    if (pd.length) pd.forEach((p) => { if (!plan.deploys.includes(p.target)) plan.deploys.push(p.target); });
    else if (!plan.deploys.length) plan.notes.push(`This message asks for a deploy but names no target, and no deploy waits in this session. Name the target, for example "deploy firebase" or "push the build on playstore".`);
  }

  for (const r of parsed.reviews) add(plan.reviews, r);
  if (parsed.reviewContext) {
    const pr = mine("review", 24 * HOUR);
    if (pr.length) add(plan.reviews, { repo: pr[0].repo, pr: pr[0].pr });
    else if (lastNamed.length === 1) add(plan.reviews, lastNamed[0]);
    else plan.notes.push(`"review again" did not match a PR in this session. Type the number, for example "review again #123".`);
  }

  for (const r of parsed.revokes) add(plan.revoke, r);
  if (parsed.revokeContext) {
    approvals.filter((a) => a.kind === "merge" && a.sessionId === sessionId && !a.usedAt && Date.parse(a.expiresAt) > now).forEach((a) => add(plan.revoke, { repo: a.repo, pr: a.pr }));
    mine("merge", 24 * HOUR).forEach((p) => add(plan.revoke, { repo: p.repo, pr: p.pr }));
    lastNamed.forEach((r) => add(plan.revoke, r));
  }
  plan.merges = plan.merges.filter((m) => !plan.revoke.some((r) => samePr(r, m)));
  return plan;
}

export function hasWork(plan) {
  return !!(plan.merges.length || plan.deploys.length || plan.reviews.length || plan.revoke.length || plan.guards || plan.notes.length);
}

/**
 * Write a plan into ledger data. heads: Map "repo#pr" -> {sha, state} | null (from GitHub).
 * Returns notes for the owner.
 */
export function applyPlan(data, plan, { heads, sessionId, text, config, now = Date.now() }) {
  const notes = [...plan.notes];
  const at = new Date(now).toISOString();
  const exp = (h) => new Date(now + h * HOUR).toISOString();
  const quote = String(text || "").replace(/\s+/g, " ").slice(0, 160);
  const id = () => crypto.randomBytes(5).toString("hex");
  const active = (a) => !a.usedAt && Date.parse(a.expiresAt) > now;
  data.approvals ||= [];
  data.pending ||= [];

  for (const r of plan.revoke) {
    let n = 0;
    for (const a of data.approvals) if (a.kind === "merge" && active(a) && samePr(a, r)) { a.usedAt = at; a.revoked = true; n++; }
    if (n) notes.push(`Merge approval for ${r.repo}#${r.pr} cancelled.`);
  }
  for (const m of plan.merges) {
    const h = heads.get(`${m.repo}#${m.pr}`);
    if (!h) { notes.push(`Could not read ${m.repo}#${m.pr} from GitHub, so no approval was saved. Type it again in a minute.`); continue; }
    if (h.state && h.state !== "OPEN") { notes.push(`${m.repo}#${m.pr} is ${h.state.toLowerCase()}; nothing to approve.`); continue; }
    data.approvals.push({ id: id(), kind: "merge", repo: m.repo, pr: m.pr, sha: h.sha, anyway: !!m.anyway, at, expiresAt: exp(config.mergeApprovalHours ?? 24), sessionId, text: quote });
    data.pending = data.pending.filter((p) => !(p.kind === "merge" && samePr(p, m)));
    notes.push(`Merge approved: ${m.repo}#${m.pr} at ${h.sha.slice(0, 7)}${m.anyway ? " (anyway: --admin allowed)" : ""}. Valid ${config.mergeApprovalHours ?? 24} h, only for this commit.`);
  }
  for (const t of plan.deploys) {
    data.approvals.push({ id: id(), kind: "deploy", target: t, at, expiresAt: exp(config.deployApprovalHours ?? 2), sessionId, text: quote });
    data.pending = data.pending.filter((p) => !(p.kind === "deploy" && p.target === t));
    notes.push(`Deploy approved: ${t}. Valid ${config.deployApprovalHours ?? 2} h.`);
  }
  for (const r of plan.reviews) {
    data.approvals.push({ id: id(), kind: "review", repo: r.repo, pr: r.pr, at, expiresAt: exp(config.reviewGrantHours ?? 24), sessionId, text: quote });
    data.pending = data.pending.filter((p) => !(p.kind === "review" && samePr(p, r)));
    notes.push(`One more Copilot review allowed for ${r.repo}#${r.pr}.`);
  }
  return notes;
}

/** Add or refresh a pending request (a blocked action that waits for the owner). */
export function addPending(data, p, now = Date.now()) {
  data.pending ||= [];
  const same = (x) => x.kind === p.kind && x.sessionId === p.sessionId && (p.kind === "deploy" ? x.target === p.target : samePr(x, p));
  data.pending = data.pending.filter((x) => !same(x));
  data.pending.push({ ...p, at: new Date(now).toISOString() });
}

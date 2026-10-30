// work-ledger: guards and a durable ledger for coding agents.
// Data: ~/.copilot/work-ledger/ (ledger.json, history.jsonl, DISABLED, errors.log, gradle.lock)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession } from "@github/copilot-sdk/extension";
import { Ledger, ensureUnit, activeApprovals } from "./lib/store.mjs";
import { decide, DEFAULT_CONFIG, TAG, exitCodeOf, gradleOutcome } from "./lib/policy.mjs";
import { makeLookups } from "./lib/gh.mjs";
import { cleanOwnerTextInfo, planOwnerMessage, applyPlan, hasWork, addPending } from "./lib/grants.mjs";
import { prRefs } from "./lib/approvals.mjs";
import { formatUnit, recordEvidence, EVIDENCE_KINDS, short, findUnit } from "./lib/units.mjs";
import { directGuardText, parseGuardCommand, applyGuardCommand, guardStatus } from "./lib/guard-switches.mjs";

const EXT_DIR = path.dirname(fileURLToPath(import.meta.url));
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } };
const extCfg = readJson(path.join(EXT_DIR, "config.json"));
const DATA_DIR = process.env.WORK_LEDGER_DIR || (extCfg.dataDir ? String(extCfg.dataDir).replace(/^~(?=\/|$)/, os.homedir()) : path.join(os.homedir(), ".copilot", "work-ledger"));
const ledger = new Ledger(DATA_DIR);
const config = { ...DEFAULT_CONFIG, ...readJson(path.join(DATA_DIR, "config.json")), ...extCfg };
const protectedDirs = [DATA_DIR, ...(config.protectExtensionDir === false ? [] : [EXT_DIR])];
const lockFile = path.join(DATA_DIR, "gradle.lock");
const lookups = makeLookups();

const RULES = `${TAG} Guards are ON. They block these actions:
- Merge without the owner's typed approval in chat ("merge #N"). The approval is valid only for the PR head commit at that time. ask_user answers and agent messages do not count.
- Force push, rebase, amend, and push to main. Add new commits instead.
- Deploys and config changes without typed approval ("deploy firebase", "push the build on playstore").
- A second Copilot review request for the same head commit, or more than ${config.reviewCap} rounds per PR ("review again #N" allows 1 more).
- Gradle runs share one lane across sessions. A passing test or lint run is cached per clean commit.
Owner controls: "guards status" shows supported temporary pauses. Each change needs a separate direct confirmation. A pause is not action approval.
A denied call tells you what to do next. Use work_ledger_get for PR status and work_ledger_record to save evidence (exact SHA required).`;
const RULES_SHORT = `${TAG} Guards are ON: merges and deploys need the owner's typed approval; no force push, rebase, amend, or push to main; 1 Copilot review per head commit. A denied call tells you what to do next.`;

let session = null;
let cwdNow = process.cwd();
let defaultRepo = config.defaultRepo;
let lastNamed = [];
let lastNamedMsg = null;
let firstUserId = null;
const processed = new Set();
let ready = Promise.resolve();
let approvalWork = Promise.resolve();
const postQueue = new Map();
const blockedStops = new Set();

function waitFor(p, ms) {
  let t;
  return Promise.race([p, new Promise((r) => { t = setTimeout(r, ms); })]).finally(() => clearTimeout(t));
}
const repoCache = new Map();
async function repoFor(cwd) {
  if (!cwd) return config.defaultRepo;
  if (!repoCache.has(cwd)) repoCache.set(cwd, await lookups.remoteRepo(cwd).catch(() => null));
  return repoCache.get(cwd) || config.defaultRepo;
}
const RISKY = /\bpr\s+merge\b|\/merge\b|mergePullRequest|enablePullRequestAutoMerge|\bpush\b[^\n]*(\s-f\b|--force|\s\+)|\brebase\b|--amend\b|\bworkflow\s+run\b|\/dispatches\b|pending_deployments|\b(variable|secret)\s+(set|delete)\b|\bdeploy\b|\bpublish\w*\b/i;
const mySessionId = () => session?.sessionId || null;
const log = (msg, level) => { try { void session?.log(msg, level ? { level } : undefined); } catch { /* timeline is best effort */ } };

function parseArgs(a) {
  if (typeof a === "string") { try { const v = JSON.parse(a); return v && typeof v === "object" ? v : { input: a }; } catch { return { input: a }; } }
  return a && typeof a === "object" ? a : {};
}

function safe(name, fn) {
  return async (...xs) => {
    try { return await fn(...xs); } catch (e) { ledger.error(`${name}: ${e?.stack || e}`); return undefined; }
  };
}

function hydration(full) {
  if (ledger.isDisabled()) return `${TAG} Guards are OFF (the owner typed "guards off"). Follow the owner's normal rules.`;
  const act = activeApprovals(ledger.read()).map((a) => (a.kind === "merge" ? `merge ${a.repo}#${a.pr} at ${short(a.sha)}` : a.kind === "deploy" ? `deploy ${a.target}` : `extra review ${a.repo}#${a.pr}`));
  return `${full ? RULES : RULES_SHORT}\n${act.length ? `Active owner approvals: ${act.join("; ")}.` : "No active owner approvals."}`;
}

function remember(keys, posts) {
  const now = Date.now();
  for (const [k, v] of postQueue) if (now - v.at > 2 * 3600000) postQueue.delete(k);
  for (const k of keys) if (k) postQueue.set(k, { posts, at: now });
  while (postQueue.size > 200) postQueue.delete(postQueue.keys().next().value);
}
function takePosts(cmd) {
  const v = postQueue.get(cmd);
  if (!v) return null;
  for (const [k, x] of postQueue) if (x === v) postQueue.delete(k);
  return v.posts;
}

async function preToolUse(input, inv) {
  cwdNow = input.workingDirectory || input.cwd || cwdNow;
  if (config.debug) ledger.history({ type: "debug.pre", sessionId: inv?.sessionId, tool: input.toolName ?? (input.toolCalls || []).map((c) => c.name ?? c.toolName).join(","), batched: Array.isArray(input.toolCalls), argsType: typeof input.toolArgs, cwd: cwdNow });
  if (ledger.isDisabled()) return undefined;
  await waitFor(approvalWork, 10000);
  const calls = Array.isArray(input.toolCalls)
    ? input.toolCalls.map((c) => ({ toolName: c.name ?? c.toolName, args: parseArgs(c.args ?? c.arguments ?? c.toolArgs) }))
    : [{ toolName: input.toolName, args: parseArgs(input.toolArgs) }];
  const data = ledger.read();
  const sid = inv?.sessionId || input.sessionId || mySessionId();
  for (const call of calls) {
    let res;
    try {
      res = await decide({ ...call, cwd: cwdNow, sessionId: mySessionId() || sid }, { data, lookups, config, now: Date.now(), protectedDirs, lockFile });
    } catch (e) {
      ledger.error(`decide: ${e?.stack || e}`);
      const text = `${call.toolName} ${JSON.stringify(call.args)}`;
      if (RISKY.test(text)) return { permissionDecision: "deny", permissionDecisionReason: `${TAG} The guard could not check this command (internal error), so it stays blocked. Try again once. If it fails again, tell the owner; the owner can type "guards off".` };
      continue;
    }
    for (const n of res.notes) ledger.history({ type: "note", sessionId: sid, note: n });
    if (res.deny) {
      if (res.pending.length) { try { ledger.update((d) => res.pending.forEach((p) => addPending(d, p))); } catch (e) { ledger.error(`pending: ${e?.message || e}`); } }
      ledger.history({ type: "deny", sessionId: sid, tool: call.toolName, reason: res.deny, command: String(call.args.command ?? "").slice(0, 400) });
      return { permissionDecision: "deny", permissionDecisionReason: res.deny };
    }
    if (calls.length !== 1) {
      if (res.localMaven) {
        const reason = `${TAG} Run verified local Maven as one separate bash call so the shared Gradle lock wrapper can be applied.`;
        ledger.history({ type: "deny", sessionId: sid, tool: call.toolName, reason });
        return { permissionDecision: "deny", permissionDecisionReason: reason };
      }
      continue;
    }
    const original = String(call.args.command ?? "");
    if (res.post.length) remember([original, res.modifiedArgs?.command], res.post.map((p) => ({ ...p, sessionId: sid })));
    if (res.modifiedArgs) {
      ledger.history({ type: res.lane ? "gradle-lane" : "modify", sessionId: sid, command: original.slice(0, 400) });
      return { modifiedArgs: res.modifiedArgs };
    }
  }
  return undefined;
}

async function postToolUse(input) {
  if (input.toolName !== "bash") return undefined;
  const args = parseArgs(input.toolArgs);
  const posts = takePosts(String(args.command ?? ""));
  if (!posts) return undefined;
  const text = String(input.toolResult?.textResultForLlm ?? "");
  const code = exitCodeOf(text);
  const at = new Date().toISOString();
  for (const p of posts) {
    if (p.kind === "review" && (code === null || code === 0)) {
      ledger.update((d) => {
        const u = findUnit(d, p.repo, p.pr) || ensureUnit(d, p.repo, p.pr);
        u.reviews.push({ sha: p.sha, at, sessionId: p.sessionId });
        u.updatedAt = at;
        const g = d.approvals.find((a) => a.id === p.grantId);
        if (g) g.usedAt = at;
      });
    } else if (p.kind === "merge" && (code === null || code === 0)) {
      void (async () => {
        const h = await lookups.prHead(p.repo, p.pr);
        if (h?.state !== "MERGED") return;
        ledger.update((d) => {
          const u = findUnit(d, p.repo, p.pr) || ensureUnit(d, p.repo, p.pr);
          u.merges.push({ sha: p.sha, at, sessionId: p.sessionId });
          u.updatedAt = at;
          const a = d.approvals.find((x) => x.id === p.approvalId);
          if (a) a.usedAt = at;
        });
        ledger.history({ type: "merged", repo: p.repo, pr: p.pr, sha: p.sha, sessionId: p.sessionId });
      })().catch((e) => ledger.error(`merge check: ${e?.stack || e}`));
    } else if (p.kind === "gradle") {
      const outcome = gradleOutcome(text);
      if (outcome === null) continue;
      const ex = code !== null && code !== 0 ? code : outcome;
      ledger.update((d) => { d.validations.push({ sha: p.sha, dirty: false, tasks: p.tasks, exit: ex, at, sessionId: p.sessionId, cwd: p.cwd }); });
    } else if (p.kind === "deploy") {
      ledger.history({ type: "deploy", target: p.target, exit: code, sessionId: p.sessionId });
    }
  }
  return undefined;
}

async function onUserMessage(e) {
  await ready;
  if (config.debug) ledger.history({ type: "debug.user", id: e?.id, agentId: e?.agentId, source: e?.data?.source, auto: e?.data?.isAutopilotContinuation, first: !firstUserId || firstUserId === e?.id, len: String(e?.data?.content || "").length });
  if (!e || e.agentId || processed.has(e.id)) return;
  processed.add(e.id);
  if (processed.size > 500) processed.delete(processed.values().next().value);
  firstUserId ||= e.id;
  const d = e.data || {};
  if (e.id === firstUserId || d.source || d.isAutopilotContinuation) return;
  const control = directGuardText(e, firstUserId);
  if (control && !/^guards? (on|off)$/.test(control)) {
    const context = { owner: true, repo: await lookups.scopeRepo(cwdNow), sessionId: mySessionId(), messageId: e.id, legacyDisabled: ledger.isDisabled() };
    const result = ledger.update((data) => applyGuardCommand(data, parseGuardCommand(control), { ...context, config }));
    ledger.history({ type: "guard.control", ...context, command: control, result: result.text });
    log(`${TAG} ${result.text}`);
    return;
  }
  const { text, dropped } = cleanOwnerTextInfo(d.content);
  if (dropped) log(`${TAG} Part of this message was too long for the guard to read approvals from. To approve, type a short message, for example "merge #301".`, "warning");
  if (!text) return;
  const dr = await repoFor(cwdNow);
  defaultRepo = dr;
  const snap = ledger.read();
  const named = lastNamed.map((r) => ({ ...r, repo: r.repo || dr }));
  const plan = planOwnerMessage(text, { sessionId: mySessionId(), pending: snap.pending, approvals: snap.approvals, lastNamed: named, defaultRepo: dr, now: Date.now() });
  if (!hasWork(plan)) return;
  if (plan.guards) {
    ledger.setDisabled(plan.guards === "off", `owner in session ${mySessionId()}`);
    log(`${TAG} Guards are ${plan.guards.toUpperCase()} for all sessions.${plan.guards === "off" ? ' Type "guards on" to turn them back on.' : ""}`, plan.guards === "off" ? "warning" : undefined);
    if (plan.guards === "on") log(`${TAG} ${guardStatus(ledger.read(), { repo: await lookups.scopeRepo(cwdNow), sessionId: mySessionId() })}`);
  }
  const heads = new Map();
  await Promise.all(plan.merges.map(async (m) => { heads.set(`${m.repo}#${m.pr}`, m.repo ? await lookups.prHead(m.repo, m.pr) : null); }));
  const notes = ledger.update((data) => applyPlan(data, plan, { heads, sessionId: mySessionId(), text, config }));
  ledger.history({ type: "owner", sessionId: mySessionId(), text: text.slice(0, 200), merges: plan.merges, deploys: plan.deploys, reviews: plan.reviews, revoke: plan.revoke, guards: plan.guards });
  for (const n of notes) log(`${TAG} ${n}`);
}

function onAssistantMessage(e) {
  if (!e || e.agentId || e.data?.parentToolCallId) return;
  const refs = prRefs(e.data?.content || "", null);
  if (!refs.length) return;
  const id = e.data?.messageId;
  if (id && id === lastNamedMsg) refs.forEach((r) => { if (!lastNamed.some((x) => x.pr === r.pr && x.repo === r.repo)) lastNamed.push(r); });
  else lastNamed = refs;
  lastNamedMsg = id || null;
}

const SHA_IN_TEXT = /\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/i;
const CLAIM = /\b(tests?\s+(all\s+)?(pass|passed|passing|are\s+green|green)|all\s+(checks|tests)\s+(pass|passed|are\s+green|green)|validation\s+(passed|succeeded|is\s+green)|build\s+(passes|passed|succeeded|successful)|verified\s+on\s+(the\s+|a\s+)?(device|emulator))\b/i;
const READ_ONLY_AGENTS = /^(explore|rubber-duck|code-review|research|security-review)$/i;

session = await joinSession({
  hooks: {
    onSessionStart: safe("onSessionStart", async () => ({ additionalContext: hydration(true) })),
    onSubagentStart: safe("onSubagentStart", async (input) => {
      if (config.debug) ledger.history({ type: "debug.substart", agentName: input?.agentName, agentType: input?.agentType });
      return ledger.isDisabled() ? undefined : { additionalContext: hydration(false) };
    }),
    onSubagentStop: safe("onSubagentStop", async (input) => {
      if (ledger.isDisabled()) return undefined;
      if (READ_ONLY_AGENTS.test(input.agentType || "") || READ_ONLY_AGENTS.test(input.agentName || "")) return undefined;
      const r = String(input.response || "");
      const key = input.agentId || input.transcriptPath || r.slice(0, 80);
      if (config.debug) ledger.history({ type: "debug.substop", agentName: input.agentName, agentType: input.agentType, claim: CLAIM.test(r), sha: SHA_IN_TEXT.test(r), seen: blockedStops.has(key) });
      if (blockedStops.has(key) || !CLAIM.test(r) || SHA_IN_TEXT.test(r)) return undefined;
      blockedStops.add(key);
      ledger.history({ type: "claim-block", agentName: input.agentName, agentType: input.agentType, response: r.slice(0, 200) });
      return { decision: "block", reason: `${TAG} Your handoff says tests or validation passed but names no commit. Restate it with the exact head SHA (git rev-parse HEAD) and the command you ran. Save it with work_ledger_record.` };
    }),
    onPreToolUse: safe("onPreToolUse", preToolUse),
    onPostToolUse: safe("onPostToolUse", postToolUse),
  },
  tools: [
    {
      name: "work_ledger_get",
      description: "Read the work ledger: owner approvals, Copilot review rounds, and evidence pinned to commits. Pass pr for one PR (its live head commit is read from GitHub). Without pr: active approvals and recently updated PRs.",
      parameters: { type: "object", properties: { pr: { type: "number", description: "PR number" }, repo: { type: "string", description: "owner/repo (default: this repo)" } } },
      skipPermission: true,
      handler: async ({ pr, repo } = {}) => {
        try {
          const data = ledger.read();
          const guards = `${ledger.isDisabled() ? "Guards: OFF (legacy global control overrides individual state)" : "Guards: ON"}\n${guardStatus(data, { repo: await lookups.scopeRepo(cwdNow), sessionId: mySessionId() })}`;
          if (pr) {
            const r = repo || await repoFor(cwdNow);
            const h = await lookups.prHead(r, Number(pr));
            const out = formatUnit(data, r, Number(pr), h?.sha || null);
            return `${guards}\n${out}${h ? `\nGitHub state: ${h.state}` : "\n(GitHub head lookup failed; facts shown without head filter may be incomplete)"}`;
          }
          const act = activeApprovals(data).map((a) => `- ${a.kind} ${a.kind === "deploy" ? a.target : `${a.repo}#${a.pr}${a.sha ? " at " + short(a.sha) : ""}`} (until ${a.expiresAt.slice(0, 16)}Z)`);
          const units = Object.values(data.units).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 8)
            .map((u) => `- ${u.repo}#${u.pr}: ${u.reviews.length} review round(s)${u.merges.length ? ", merged" : ""}${(u.evidence || []).length ? `, last evidence ${u.evidence.at(-1).kind} at ${short(u.evidence.at(-1).sha)}` : ""}`);
          return [guards, "Active owner approvals:", ...(act.length ? act : ["- none"]), "Recent PRs:", ...(units.length ? units : ["- none"])].join("\n");
        } catch (e) {
          ledger.error(`work_ledger_get: ${e?.stack || e}`);
          return { textResultForLlm: `work_ledger_get failed: ${e?.message || e}`, resultType: "failure" };
        }
      },
    },
    {
      name: "work_ledger_record",
      description: "Save evidence for a PR, pinned to the exact commit SHA: validated (tests ran and passed), review_clean (no open review findings), device_tested (checked on a device or emulator), or note. Owner approvals cannot be saved here.",
      parameters: {
        type: "object",
        properties: {
          pr: { type: "number", description: "PR number" },
          repo: { type: "string", description: "owner/repo (default: this repo)" },
          kind: { type: "string", enum: EVIDENCE_KINDS },
          sha: { type: "string", description: "Exact commit SHA the evidence applies to (git rev-parse HEAD). Optional only for note." },
          evidence: { type: "string", description: "What you ran and the result, for example './gradlew :app:testDebugUnitTest: 214 passed, 0 failed'" },
        },
        required: ["pr", "kind", "evidence"],
      },
      skipPermission: true,
      handler: async ({ pr, repo, kind, sha, evidence } = {}) => {
        try {
          const r = repo || await repoFor(cwdNow);
          const entry = ledger.update((d) => recordEvidence(d, { repo: r, pr: Number(pr), kind, sha, text: evidence, sessionId: mySessionId() }));
          return `Saved ${kind} for ${r}#${pr}${entry.sha ? ` at ${short(entry.sha)}` : ""}.`;
        } catch (e) {
          return { textResultForLlm: `Not saved: ${e?.message || e}`, resultType: "failure" };
        }
      },
    },
  ],
});

session.on("user.message", (e) => { approvalWork = approvalWork.then(() => onUserMessage(e)).catch((err) => ledger.error(`user.message: ${err?.stack || err}`)); });
session.on("assistant.message", (e) => { try { onAssistantMessage(e); } catch (err) { ledger.error(`assistant.message: ${err?.stack || err}`); } });

ready = (async () => {
  if (config.debug) {
    const auth = await lookups.prHead(config.defaultRepo, 1).catch((err) => ({ error: String(err) }));
    ledger.history({ type: "debug.start", node: process.version, sessionId: mySessionId(), ext: EXT_DIR, data: DATA_DIR, gh: lookups.gh, ghAuthOk: !!auth?.sha, cwd: cwdNow });
  }
  defaultRepo = await repoFor(cwdNow);
  try {
    const events = await session.getEvents();
    if (config.debug) ledger.history({ type: "debug.events", users: events.filter((e) => e.type === "user.message").map((e) => ({ id: String(e.id).slice(0, 8), agentId: e.agentId, source: e.data?.source, auto: e.data?.isAutopilotContinuation, head: String(e.data?.content || "").slice(0, 40) })) });
    for (const e of events) {
      if (e.type === "user.message" && !e.agentId) firstUserId ||= e.id;
      else if (e.type === "assistant.message") onAssistantMessage(e);
    }
  } catch (err) {
    ledger.error(`getEvents: ${err?.stack || err}`);
  }
})();

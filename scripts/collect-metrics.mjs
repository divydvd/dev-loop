#!/usr/bin/env node
// Read-only objective metrics collector for dev-loop weekly infra-review.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const DAY_MS = 86_400_000;
const SHA_RE = /^[0-9a-f]{7,40}$/i;
const REPEAT_RULE_RE = /\b(?:device\s+test|small\s+prs?|400\s+lines|do\s+not\s+rebase|no\s+rebase|force[\s-]push|flow\s+docs?|independent\s+review|keep\s+it\s+simple|status\s+update|what(?:'s|\s+is)\s+the\s+status)\b/i;
const NON_STEERING_PREFIX_RE = /^\s*(?:guards?\b|merge\s+#\d+|deploy\b|push\s+the\s+build\b|review\s+again\s+#\d+|away\s+mode\b|i'?m\s+back\b)/i;
const FIX_SIGNAL_RE = /\b(?:fix(?:es|ed|up)?|fix-up|revert(?:s|ed)?|regress(?:ion|ed)?|broke|hotfix)\b|introduced\s+by\s+#\d+|after\s+#\d+/i;
const BUGFIX_TITLE_RE = /^(?:fix|revert|hotfix)(?:\([^)]*\))?:/i;

export function isProductionPath(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!p || p.startsWith("docs/") || /\.(?:md|mdc|txt|rst|sha256|lock|png|jpg|jpeg|gif|webp|svg|ico|pdf)$/i.test(p)) return false;
  if (/(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Podfile\.lock|gradle\.lockfile|lint-baseline[^/]*\.xml)$/i.test(p)) return false;
  if (/(?:^|\/)(?:schemas|generated|build|dist|__tests__|tests?|androidTest|fixtures)\//.test(p)) return false;
  if (/\.(?:test|spec)\.[a-z0-9]+$/i.test(p) || /(?:Test|Tests|Spec)\.(?:kt|java|swift|py|go|rs|ts|tsx|js|mjs|cjs)$/.test(p)) return false;
  return !/(?:^|\/)test_[^/]+\.(?:py|rb)$/i.test(p);
}

export function productionLinesChanged(pr) {
  return (pr?.files || []).reduce((sum, f) => sum + (isProductionPath(f.path) ? Number(f.additions || 0) + Number(f.deletions || 0) : 0), 0);
}

export function classifyRoute(pr) {
  const prodLines = productionLinesChanged(pr);
  if (prodLines === 0) return "trivial";
  const taskHeadings = [...String(pr?.body || "").matchAll(/^###\s+Task\s+\d+\b/gm)].length;
  return prodLines > 120 || taskHeadings >= 4 ? "multi-task" : "small";
}

function sameSha(a, b) {
  if (!SHA_RE.test(String(a || "")) || !SHA_RE.test(String(b || ""))) return false;
  const x = String(a).toLowerCase(), y = String(b).toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

function runGit(cwd, args) {
  try { return { ok: true, stdout: execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 }) }; }
  catch { return { ok: false, stdout: "" }; }
}

function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

const mean = (values) => {
  const nums = values.filter((v) => Number.isFinite(v));
  return nums.length ? nums.reduce((acc, v) => acc + v, 0) / nums.length : null;
};

function prCommitSet(checkoutDir, mergeSha) {
  if (!mergeSha || !runGit(checkoutDir, ["rev-parse", "--verify", `${mergeSha}^1`]).ok) return null;
  const rev = runGit(checkoutDir, ["rev-list", `${mergeSha}^1..${mergeSha}`]);
  return rev.ok ? new Set(rev.stdout.split(/\s+/).filter(Boolean)) : null;
}

function blameCountsAtRef(checkoutDir, ref, filePath, cache) {
  const key = `${ref}:${filePath}`;
  if (cache.has(key)) return cache.get(key);
  const counts = new Map();
  if (runGit(checkoutDir, ["cat-file", "-e", `${ref}:${filePath}`]).ok) {
    for (const line of runGit(checkoutDir, ["blame", "--line-porcelain", ref, "--", filePath]).stdout.split(/\r?\n/)) {
      const m = line.match(/^([0-9a-f]{40})\s+\d+\s+\d+/);
      if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
  }
  cache.set(key, counts);
  return counts;
}

export function computeCodeSurvival(prs, { checkoutDir, targetRef = "HEAD" } = {}) {
  if (!checkoutDir || !existsSync(checkoutDir) || !runGit(checkoutDir, ["rev-parse", "--verify", `${targetRef}^{commit}`]).ok) {
    return { status: "unavailable", addedLines: 0, survivingLines: 0, rate: null, perPr: [] };
  }
  const blameCache = new Map(), perPr = [];
  let totalAdded = 0, totalSurviving = 0;
  for (const pr of prs || []) {
    const mergeSha = pr?.mergeCommit?.oid || pr?.headRefOid, prShas = prCommitSet(checkoutDir, mergeSha);
    if (!prShas) { perPr.push({ number: pr.number, status: "commit_missing", addedLines: 0, survivingLines: 0, rate: null }); continue; }
    const numstat = runGit(checkoutDir, ["diff", "--numstat", `${mergeSha}^1`, mergeSha]);
    let prAdded = 0, prSurviving = 0;
    for (const row of numstat.stdout.split(/\r?\n/).filter(Boolean)) {
      const [addStr, , path] = row.split("\t"), added = Number(addStr);
      if (!Number.isFinite(added) || added <= 0 || !isProductionPath(path)) continue;
      prAdded += added;
      const fileBlame = blameCountsAtRef(checkoutDir, targetRef, path, blameCache);
      let fileSurvived = 0;
      for (const sha of prShas) fileSurvived += fileBlame.get(sha) || 0;
      prSurviving += Math.min(added, fileSurvived);
    }
    totalAdded += prAdded;
    totalSurviving += prSurviving;
    perPr.push({ number: pr.number, status: "ok", addedLines: prAdded, survivingLines: prSurviving, rate: prAdded > 0 ? prSurviving / prAdded : null });
  }
  return { status: "ok", addedLines: totalAdded, survivingLines: totalSurviving, rate: totalAdded > 0 ? totalSurviving / totalAdded : null, perPr };
}

export function detectFixups(prs, { checkoutDir = null, windowDays = 14 } = {}) {
  const windowMs = windowDays * DAY_MS;
  const sorted = [...(prs || [])].sort((a, b) => Date.parse(a.mergedAt || a.createdAt || 0) - Date.parse(b.mergedAt || b.createdAt || 0));
  const shaOwner = new Map();
  const hasGit = Boolean(checkoutDir && existsSync(checkoutDir));
  if (hasGit) {
    for (const pr of sorted) {
      const shas = prCommitSet(checkoutDir, pr?.mergeCommit?.oid || pr?.headRefOid);
      if (shas) for (const sha of shas) shaOwner.set(sha, pr);
    }
  }

  const details = [], fixupSet = new Set(), regressedSet = new Set();
  const recordLink = (laterNum, targetNum, method, matched) => {
    matched.add(targetNum); fixupSet.add(laterNum); regressedSet.add(targetNum);
    details.push({ fixupPr: laterNum, targetPr: targetNum, method });
  };
  for (let i = 0; i < sorted.length; i++) {
    const later = sorted[i], laterMs = Date.parse(later.mergedAt || later.createdAt || "");
    const text = `${later.title || ""}\n${later.body || ""}`, matchedTargets = new Set();
    if (FIX_SIGNAL_RE.test(text)) {
      for (const m of text.matchAll(/#(\d+)\b/g)) {
        const refNum = Number(m[1]);
        const target = refNum !== later.number ? sorted.slice(0, i).find((p) => p.number === refNum) : null;
        const targetMs = target ? Date.parse(target.mergedAt || target.createdAt || "") : NaN;
        if (Number.isFinite(laterMs) && Number.isFinite(targetMs) && laterMs >= targetMs && laterMs - targetMs <= windowMs) {
          recordLink(later.number, target.number, "explicit_ref", matchedTargets);
        }
      }
    }
    const isBugfixPr = BUGFIX_TITLE_RE.test(String(later.title || "").trim()) || /\b(?:revert|regression|fix-up|fixup)\b/i.test(text);
    const mergeSha = later?.mergeCommit?.oid || later?.headRefOid;
    if (!hasGit || !isBugfixPr || !mergeSha || !runGit(checkoutDir, ["rev-parse", "--verify", `${mergeSha}^1`]).ok) continue;
    let currentFile = null;
    for (const line of runGit(checkoutDir, ["diff", "-U0", `${mergeSha}^1`, mergeSha]).stdout.split(/\r?\n/)) {
      if (line.startsWith("--- a/")) currentFile = line.slice(6);
      else if (line.startsWith("--- /dev/null")) currentFile = null;
      else if (currentFile && isProductionPath(currentFile) && line.startsWith("@@ ")) {
        const hm = line.match(/^@@ -(\d+)(?:,(\d+))?\s+\+/);
        const start = Number(hm?.[1] || 0), count = hm?.[2] === undefined ? 1 : Number(hm[2]);
        if (start <= 0 || count <= 0) continue;
        for (const bl of runGit(checkoutDir, ["blame", "-L", `${start},+${count}`, "--line-porcelain", `${mergeSha}^1`, "--", currentFile]).stdout.split(/\r?\n/)) {
          const sm = bl.match(/^([0-9a-f]{40})\s+\d+\s+\d+/);
          const owner = sm ? shaOwner.get(sm[1]) : null;
          const ownerMs = owner ? Date.parse(owner.mergedAt || owner.createdAt || "") : NaN;
          if (owner && owner.number !== later.number && !matchedTargets.has(owner.number) && Number.isFinite(laterMs) && Number.isFinite(ownerMs) && laterMs >= ownerMs && laterMs - ownerMs <= windowMs) {
            recordLink(later.number, owner.number, "blame_churn", matchedTargets);
          }
        }
      }
    }
  }
  return { count: fixupSet.size, fixupPrNumbers: [...fixupSet].sort((a, b) => a - b), regressedPrNumbers: [...regressedSet].sort((a, b) => a - b), details };
}

function collectLedgerValidatedShas(ledgerData, repo) {
  const shas = (ledgerData?.validations || []).filter((v) => v.exit === 0 && !v.dirty && v.sha).map((v) => v.sha);
  for (const unit of Object.values(ledgerData?.units || {})) {
    if (repo && unit.repo && String(unit.repo).toLowerCase() !== String(repo).toLowerCase()) continue;
    for (const ev of unit.evidence || []) {
      if ((ev.kind === "validated" || ev.kind === "device_tested") && ev.sha) shas.push(ev.sha);
    }
  }
  return shas;
}

export function verifyPrEvidence(pr, { repo = "", ledgerData = null, checkoutDir = null } = {}) {
  const hasProd = (pr?.files || []).some((f) => isProductionPath(f.path) && Number(f.additions || 0) + Number(f.deletions || 0) > 0);
  if (Array.isArray(pr?.files) && !hasProd) return { verified: true, status: "exempt_no_prod_code", testedSha: null };
  if (!ledgerData) return { verified: null, status: "unavailable", testedSha: null };
  const head = pr?.headRefOid, validatedShas = collectLedgerValidatedShas(ledgerData, repo);
  const direct = validatedShas.find((s) => sameSha(s, head));
  if (direct) return { verified: true, status: "verified_head", testedSha: direct };
  if (checkoutDir && existsSync(checkoutDir) && head) {
    const ancestors = runGit(checkoutDir, ["rev-list", "--first-parent", "--max-count=30", head]);
    for (const anc of ancestors.ok ? ancestors.stdout.split(/\s+/).filter(Boolean).slice(1) : []) {
      if (!validatedShas.some((s) => sameSha(s, anc))) continue;
      const diff = runGit(checkoutDir, ["diff", "--name-only", anc, head]);
      if (!diff.ok) break;
      return diff.stdout.split(/\r?\n/).filter(Boolean).every((f) => !isProductionPath(f))
        ? { verified: true, status: "verified_ancestry_docs_only", testedSha: anc }
        : { verified: false, status: "unverified_prod_after_test", testedSha: anc };
    }
  }
  return { verified: false, status: "unverified", testedSha: null };
}

function parseWorkspaceYaml(filePath) {
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function parseSessionEvents(eventsPath) {
  const raw = readFileSync(eventsPath, "utf8");
  let latestNanoAiu = null, modelCalls = 0, compactions = 0, totalReadChars = 0, duplicateReadChars = 0, ownerRepeatMessages = 0, seenKickoff = false;
  const toolStarts = new Map(), seenReadPaths = new Set();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    const { type, data = {} } = evt;
    if (type === "assistant.turn_start") modelCalls += 1;
    else if (type === "session.compaction_start") { modelCalls += 1; compactions += 1; }
    else if ((type === "session.usage_checkpoint" || type === "session.shutdown") && Number.isFinite(Number(data.totalNanoAiu))) latestNanoAiu = Number(data.totalNanoAiu);
    else if (type === "tool.execution_start" && data.toolCallId) {
      let args = data.arguments;
      if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
      toolStarts.set(data.toolCallId, { toolName: data.toolName, path: args?.path || null });
    } else if (type === "tool.execution_complete" && data.success) {
      const start = toolStarts.get(data.toolCallId);
      if (!start?.path) continue;
      if (start.toolName === "edit" || start.toolName === "create") seenReadPaths.delete(start.path);
      else if (start.toolName === "view") {
        const len = String(typeof data.result === "string" ? data.result : data.result?.content ?? "").length;
        totalReadChars += len;
        if (seenReadPaths.has(start.path)) duplicateReadChars += len;
        else seenReadPaths.add(start.path);
      }
    } else if (type === "user.message" && !evt.agentId && !data.isAutopilotContinuation) {
      const c = String(data.content ?? "");
      if (!c.trim() || c.includes("<skill-context") || c.includes("<cross_session_message") || c.includes("<system_notification") || NON_STEERING_PREFIX_RE.test(c)) continue;
      if (!seenKickoff) seenKickoff = true;
      else if (REPEAT_RULE_RE.test(c)) ownerRepeatMessages += 1;
    }
  }
  return { raw, totalNanoAiu: latestNanoAiu, modelCalls, compactions, totalReadChars, duplicateReadChars, duplicateReadRate: totalReadChars > 0 ? duplicateReadChars / totalReadChars : null, ownerRepeatMessages };
}

export function analyzeSessions(prs, { sessionsDir = null, repo = "" } = {}) {
  if (!sessionsDir || !existsSync(sessionsDir)) return { status: "unavailable", mappedCount: 0, sharedPrNumbers: [], perPr: {} };
  const sessions = [];
  for (const entry of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const wsPath = join(sessionsDir, entry.name, "workspace.yaml"), evPath = join(sessionsDir, entry.name, "events.jsonl");
    if (!existsSync(wsPath) || !existsSync(evPath)) continue;
    const ws = parseWorkspaceYaml(wsPath);
    if (repo && ws.repository && ws.repository.toLowerCase() !== repo.toLowerCase()) continue;
    sessions.push({ id: ws.id || entry.name, createdAt: ws.created_at || null, ...parseSessionEvents(evPath) });
  }
  const chosenByPr = new Map(), usageCounts = new Map();
  for (const pr of prs || []) {
    const prMergedMs = Date.parse(pr.mergedAt || "");
    const needle = pr.url || (repo ? `https://github.com/${repo}/pull/${pr.number}` : `/pull/${pr.number}`);
    let best = null, bestHits = 0;
    for (const s of sessions) {
      const createdMs = Date.parse(s.createdAt || "");
      if (Number.isFinite(prMergedMs) && Number.isFinite(createdMs) && createdMs > prMergedMs) continue;
      const hits = s.raw.split(needle).length - 1;
      if (hits > bestHits) { bestHits = hits; best = s; }
    }
    if (best) { chosenByPr.set(pr.number, best); usageCounts.set(best.id, (usageCounts.get(best.id) || 0) + 1); }
  }
  const perPr = {}, sharedPrNumbers = [];
  let mappedCount = 0;
  for (const pr of prs || []) {
    const s = chosenByPr.get(pr.number);
    if (!s) { perPr[pr.number] = { sessionId: null, sharedSession: false, attribution: "unmatched" }; continue; }
    mappedCount += 1;
    if ((usageCounts.get(s.id) || 0) > 1) {
      sharedPrNumbers.push(pr.number);
      perPr[pr.number] = { sessionId: s.id, sharedSession: true, attribution: "ambiguous", totalNanoAiu: null, modelCalls: null, duplicateReadRate: null, ownerRepeatMessages: s.ownerRepeatMessages === 0 ? 0 : null };
    } else {
      const { raw: _raw, createdAt: _c, id, ...metrics } = s;
      perPr[pr.number] = { sessionId: id, sharedSession: false, attribution: "unique", ...metrics };
    }
  }
  return { status: "ok", mappedCount, sharedPrNumbers: sharedPrNumbers.sort((a, b) => a - b), perPr };
}

function readJsonSafe(filePath) {
  try { return filePath && existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : null; } catch { return null; }
}

export function collectMetrics({ repo = "", prs = [], from = null, to = null, maturityDays = 14, checkoutDir = null, ledgerDir = null, sessionsDir = null, targetRef = "HEAD" } = {}) {
  const fromMs = from ? Date.parse(from) : -Infinity, toMs = to ? Date.parse(to) : Infinity;
  const windowPrs = prs.filter((pr) => { const m = Date.parse(pr.mergedAt || pr.createdAt || ""); return !Number.isFinite(m) || (m >= fromMs && m < toMs); });
  const matureCutoffMs = (Number.isFinite(toMs) ? toMs : Date.now()) - maturityDays * DAY_MS;
  const maturePrs = prs.filter((pr) => Number.isFinite(Date.parse(pr.mergedAt || "")) && Date.parse(pr.mergedAt) <= matureCutoffMs);
  const codeSurvival = !checkoutDir || !existsSync(checkoutDir) ? { status: "unavailable", addedLines: 0, survivingLines: 0, rate: null, perPr: [] }
    : maturePrs.length === 0 ? { status: "no_mature_prs", addedLines: 0, survivingLines: 0, rate: null, perPr: [] }
    : computeCodeSurvival(maturePrs, { checkoutDir, targetRef });
  const fixups = detectFixups(prs, { checkoutDir, windowDays: maturityDays });
  const windowFixups = fixups.details.filter((d) => windowPrs.some((p) => p.number === d.fixupPr));
  const ledgerData = readJsonSafe(ledgerDir ? join(ledgerDir, "ledger.json") : null);
  const sessionAnalysis = analyzeSessions(windowPrs, { sessionsDir, repo });
  let verifiedCount = 0, verifiableCount = 0, firstPushGreenCount = 0, commitInfoCount = 0, totalRepeatMessages = 0, durablePassCount = 0;
  const buckets = { trivial: [], small: [], "multi-task": [] };
  for (const pr of windowPrs) {
    const route = classifyRoute(pr), prodLines = productionLinesChanged(pr), ev = verifyPrEvidence(pr, { repo, ledgerData, checkoutDir });
    if (ev.verified !== null) { verifiableCount += 1; if (ev.verified) verifiedCount += 1; }
    let firstPushGreen = null;
    if (Array.isArray(pr.commits) && pr.createdAt) {
      commitInfoCount += 1;
      firstPushGreen = pr.commits.filter((c) => Date.parse(c.committedDate || c.authoredDate || "") > Date.parse(pr.createdAt)).length === 0;
      if (firstPushGreen) firstPushGreenCount += 1;
    }
    const sess = sessionAnalysis.perPr[pr.number] || { attribution: "unmatched" };
    if (Number.isFinite(sess.ownerRepeatMessages)) totalRepeatMessages += sess.ownerRepeatMessages;
    const isFixupOrRegressed = fixups.fixupPrNumbers.includes(pr.number) || fixups.regressedPrNumbers.includes(pr.number);
    const repeatClean = sessionAnalysis.status === "ok" && (sess.attribution === "unmatched" || sess.ownerRepeatMessages === 0);
    if (ev.verified === true && !isFixupOrRegressed && repeatClean) durablePassCount += 1;
    buckets[route].push({ number: pr.number, prodLines, session: sess, evidence: ev, firstPushGreen });
  }

  const routeBuckets = Object.fromEntries(Object.entries(buckets).map(([route, items]) => {
    const u = items.filter((i) => i.session?.attribution === "unique");
    return [route, { count: items.length, uniqueSessions: u.length, medianProdLines: median(items.map((i) => i.prodLines)), medianNanoAiu: median(u.map((i) => i.session.totalNanoAiu)), meanModelCalls: mean(u.map((i) => i.session.modelCalls)), medianDuplicateReadRate: median(u.map((i) => i.session.duplicateReadRate)) }];
  }));
  const allVerifiable = verifiableCount === windowPrs.length;
  const verificationStatus = ledgerData ? "ok" : windowPrs.length > 0 && allVerifiable ? "exempt_only" : "unavailable";
  const yieldAvailable = allVerifiable && sessionAnalysis.status === "ok" && windowPrs.length > 0;
  return {
    repo, window: { from, to, maturityDays }, mergedPrCount: windowPrs.length,
    medianProdLines: median(windowPrs.map((p) => productionLinesChanged(p))),
    durability: { codeSurvival, fixupPrCount: new Set(windowFixups.map((d) => d.fixupPr)).size, fixups: windowFixups },
    verification: { status: verificationStatus, verifiedCount, verifiableCount, rate: verificationStatus !== "unavailable" && windowPrs.length > 0 ? verifiedCount / windowPrs.length : null },
    autonomy: { firstPushGreenCount, commitInfoCount, firstPushGreenRate: commitInfoCount > 0 ? firstPushGreenCount / commitInfoCount : null, ownerRepeatMessages: sessionAnalysis.status === "ok" ? totalRepeatMessages : null, sharedPrNumbers: sessionAnalysis.sharedPrNumbers },
    durableFirstPassYield: { passedCount: yieldAvailable ? durablePassCount : 0, eligibleCount: yieldAvailable ? windowPrs.length : 0, rate: yieldAvailable ? durablePassCount / windowPrs.length : null },
    routeBuckets,
  };
}

const fmtPct = (num, den, rate) => (rate === null || rate === undefined ? "n/a" : `${num}/${den} (${(rate * 100).toFixed(1)}%)`);
const fmtNum = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "n/a");

export function formatMarkdownReport(r) {
  const cs = r.durability.codeSurvival;
  const survivalCell = cs.rate !== null ? fmtPct(cs.survivingLines, cs.addedLines, cs.rate) : `n/a (${cs.status})`;
  const verifyCell = r.verification.rate !== null ? fmtPct(r.verification.verifiedCount, r.mergedPrCount, r.verification.rate) : `n/a (${r.verification.status})`;
  const greenCell = r.autonomy.firstPushGreenRate !== null ? fmtPct(r.autonomy.firstPushGreenCount, r.autonomy.commitInfoCount, r.autonomy.firstPushGreenRate) : "n/a";
  const yieldCell = r.durableFirstPassYield.rate !== null ? fmtPct(r.durableFirstPassYield.passedCount, r.mergedPrCount, r.durableFirstPassYield.rate) : "n/a (ledger unavailable)";
  const sharedNote = r.autonomy.sharedPrNumbers.length ? `ambiguous shared session on #${r.autonomy.sharedPrNumbers.join(", #")}` : "none";
  const routeRows = ["trivial", "small", "multi-task"].map((route) => {
    const b = r.routeBuckets[route];
    return `| ${route} | ${b.count} | ${b.uniqueSessions} | ${fmtNum(b.medianProdLines, 0)} | ${b.medianNanoAiu !== null ? b.medianNanoAiu.toExponential(2) : "n/a"} | ${fmtNum(b.meanModelCalls, 1)} | ${b.medianDuplicateReadRate !== null ? `${(b.medianDuplicateReadRate * 100).toFixed(1)}%` : "n/a"} |`;
  });
  return [
    `### Shadow-mode objective telemetry (${r.repo || "repo"})`, "| Objective measure | Value | Target |", "| --- | --- | --- |",
    `| Durable first-pass yield | ${yieldCell} | 90.0% or higher |`,
    `| Code survival rate (${r.window.maturityDays}d) | ${survivalCell} | 95.0% or higher |`,
    `| Fix-up PRs (${r.window.maturityDays}d, ref + blame) | ${r.durability.fixupPrCount} | 0 |`,
    `| Ledger + ancestry verified merges | ${verifyCell} | 100.0% |`,
    `| First-push green rate | ${greenCell} | 70.0% or higher |`,
    `| Owner repeat-rule messages (unique sessions) | ${r.autonomy.ownerRepeatMessages ?? "n/a"} | 0 |`,
    `| Shared-session PRs (excluded from per-PR cost) | ${sharedNote} | observe |`, "",
    "| Task route | PRs | Unique sessions | Median prod lines | Median `totalNanoAiu` | Mean model calls | Median duplicate read |",
    "| --- | --- | --- | --- | --- | --- | --- |", ...routeRows,
  ].join("\n");
}

function main() {
  const { values: v } = parseArgs({
    options: {
      repo: { type: "string", default: "" }, "prs-file": { type: "string" }, checkout: { type: "string" },
      "ledger-dir": { type: "string", default: join(homedir(), ".copilot", "work-ledger") },
      "sessions-dir": { type: "string", default: join(homedir(), ".copilot", "session-state") },
      from: { type: "string" }, to: { type: "string" }, "maturity-days": { type: "string", default: "14" },
      "target-ref": { type: "string", default: "HEAD" }, format: { type: "string", default: "markdown" },
    },
  });
  const prs = v["prs-file"] ? JSON.parse(readFileSync(resolve(v["prs-file"]), "utf8"))
    : v.repo ? JSON.parse(execFileSync("gh", ["pr", "list", "-R", v.repo, "--state", "merged", "--limit", "200", "--json", "number,title,url,body,createdAt,mergedAt,headRefOid,mergeCommit,files,commits"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })) : [];
  const report = collectMetrics({
    repo: v.repo, prs, from: v.from || null, to: v.to || null, maturityDays: Number(v["maturity-days"] || 14),
    checkoutDir: v.checkout ? resolve(v.checkout) : null, ledgerDir: v["ledger-dir"] ? resolve(v["ledger-dir"]) : null,
    sessionsDir: v["sessions-dir"] ? resolve(v["sessions-dir"]) : null, targetRef: v["target-ref"] || "HEAD",
  });
  console.log(v.format === "json" ? JSON.stringify(report, null, 2) : formatMarkdownReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

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
const EXPLICIT_FIXUP_RE = /\b(?:fix(?:es|ed|up)?|fix-up|revert(?:s|ed|ing)?(?:\s+of)?|regress(?:ion|ed)\s+(?:in|from|after)|broke\s+in|broken\s+by|introduced\s+(?:by|in)|after\s+regression\s+in)(?:\s+\w+){0,3}\s+(?:PR\s+)?(?:https?:\/\/[^\s/]+\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)|([\w.-]+\/[\w.-]+)?#(\d+))/gi;
const BUGFIX_TITLE_RE = /^(?:fix|revert|hotfix)(?:\([^)]*\))?:|\b(?:revert|fix-up|fixup|regression|hotfix)\b/i;

export function isProductionPath(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!p || p.startsWith("docs/") || /\.(?:md|mdc|txt|rst|sha256|lock|png|jpg|jpeg|gif|webp|svg|ico|pdf)$/i.test(p)) return false;
  if (/(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Podfile\.lock|gradle\.lockfile|lint-baseline[^/]*\.xml)$/i.test(p)) return false;
  if (/(?:^|\/)(?:schemas|generated|build|dist|__tests__|tests?|androidTest|fixtures)\//.test(p)) return false;
  if (/(?:\.|_)(?:test|spec)\.[a-z0-9]+$/i.test(p) || /(?:Test|Tests|Spec)\.(?:kt|java|swift|py|go|rs|ts|tsx|js|mjs|cjs)$/.test(p)) return false;
  return !/(?:^|\/)test_[^/]+\.(?:py|rb)$/i.test(p);
}

export function productionLinesChanged(pr) {
  if (pr?.filesTruncated || !Array.isArray(pr?.files)) return null;
  return pr.files.reduce((sum, f) => sum + (isProductionPath(f.path) ? Number(f.additions || 0) + Number(f.deletions || 0) : 0), 0);
}

const countPlanTasks = (text) => [...String(text || "").matchAll(/^###\s+(?:Task\s+\d+\b|\d+\.(?=\s|$))/gm)].length;

export function classifyRoute(pr, { checkoutDir = null } = {}) {
  const prodLines = productionLinesChanged(pr);
  if (prodLines === null) return "multi-task";
  if (prodLines === 0) return "trivial";
  let taskHeadings = countPlanTasks(pr?.body);
  const sha = pr?.mergeCommit?.oid || pr?.headRefOid;
  if (taskHeadings < 4 && checkoutDir && existsSync(checkoutDir) && SHA_RE.test(String(sha || ""))) {
    for (const f of pr?.files || []) {
      if (!/^docs\/superpowers\/plans\/.+\.md$/.test(String(f.path || ""))) continue;
      const show = runGit(checkoutDir, ["show", `${sha}:${f.path}`]);
      if (show.ok) taskHeadings = Math.max(taskHeadings, countPlanTasks(show.stdout));
    }
  }
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
  if (!SHA_RE.test(String(mergeSha || "")) || !runGit(checkoutDir, ["rev-parse", "--verify", `${mergeSha}^1`]).ok) return null;
  const rev = runGit(checkoutDir, ["rev-list", `${mergeSha}^1..${mergeSha}`]);
  return rev.ok ? new Set(rev.stdout.split(/\s+/).filter(Boolean)) : null;
}
function renameMapToTarget(checkoutDir, fromSha, targetRef) {
  const map = new Map(), parts = runGit(checkoutDir, ["diff", "--no-ext-diff", "-M", "--diff-filter=R", "--name-status", "-z", fromSha, targetRef]).stdout.split("\0");
  for (let i = 0; i < parts.length - 2; i++) if (parts[i].startsWith("R")) { map.set(parts[i + 1], parts[i + 2]); i += 2; }
  return map;
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
    const renames = renameMapToTarget(checkoutDir, mergeSha, targetRef);
    const tokens = runGit(checkoutDir, ["diff", "--no-ext-diff", "--numstat", "-z", `${mergeSha}^1`, mergeSha]).stdout.split("\0");
    let prAdded = 0, prSurviving = 0;
    for (let ti = 0; ti < tokens.length - 1; ti++) {
      const [addStr, , inlinePath] = tokens[ti].split("\t");
      const path = inlinePath === "" ? ((ti += 2), tokens[ti]) : inlinePath;
      const added = Number(addStr);
      if (!Number.isFinite(added) || added <= 0 || !isProductionPath(path)) continue;
      prAdded += added;
      const fileBlame = blameCountsAtRef(checkoutDir, targetRef, renames.get(path) || path, blameCache);
      let fileSurvived = 0;
      for (const sha of prShas) fileSurvived += fileBlame.get(sha) || 0;
      prSurviving += Math.min(added, fileSurvived);
    }
    totalAdded += prAdded;
    totalSurviving += prSurviving;
    perPr.push({ number: pr.number, status: "ok", addedLines: prAdded, survivingLines: prSurviving, rate: prAdded > 0 ? prSurviving / prAdded : null });
  }
  const hasMissing = perPr.some((p) => p.status === "commit_missing");
  return { status: hasMissing ? "commit_missing" : "ok", addedLines: totalAdded, survivingLines: totalSurviving, rate: !hasMissing && totalAdded > 0 ? totalSurviving / totalAdded : null, perPr };
}

const mayTouchProd = (pr) => { const n = productionLinesChanged(pr); return n === null || n > 0; };

export function detectFixups(prs, { repo = "", checkoutDir = null, windowDays = 14 } = {}) {
  const windowMs = windowDays * DAY_MS;
  const sorted = [...(prs || [])].sort((a, b) => Date.parse(a.mergedAt || a.createdAt || 0) - Date.parse(b.mergedAt || b.createdAt || 0));
  const shaOwner = new Map(), hasGit = Boolean(checkoutDir && existsSync(checkoutDir));
  let missingCommit = false;
  if (hasGit) {
    for (const pr of sorted) {
      const shas = prCommitSet(checkoutDir, pr?.mergeCommit?.oid || pr?.headRefOid);
      if (shas) for (const sha of shas) shaOwner.set(sha, pr);
      else if (mayTouchProd(pr)) missingCommit = true;
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
    for (const m of text.matchAll(EXPLICIT_FIXUP_RE)) {
      const refRepo = m[1] || m[3], refNum = Number(m[2] || m[4]);
      if (repo && refRepo && refRepo.toLowerCase() !== repo.toLowerCase()) continue;
      if (refNum === later.number || matchedTargets.has(refNum)) continue;
      const target = sorted.slice(0, i).find((p) => p.number === refNum);
      const targetMs = target ? Date.parse(target.mergedAt || target.createdAt || "") : NaN;
      if (Number.isFinite(laterMs) && Number.isFinite(targetMs) && laterMs >= targetMs && laterMs - targetMs <= windowMs) {
        recordLink(later.number, target.number, "explicit_ref", matchedTargets);
      }
    }
    const isBugfixPr = BUGFIX_TITLE_RE.test(String(later.title || "").trim());
    const mergeSha = later?.mergeCommit?.oid || later?.headRefOid;
    if (!hasGit || !isBugfixPr || !mayTouchProd(later)) continue;
    if (!SHA_RE.test(String(mergeSha || "")) || !runGit(checkoutDir, ["rev-parse", "--verify", `${mergeSha}^1`]).ok) { missingCommit = true; continue; }
    let currentFile = null;
    for (const line of runGit(checkoutDir, ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", "-U0", `${mergeSha}^1`, mergeSha]).stdout.split(/\r?\n/)) {
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
  const status = !hasGit && sorted.some(mayTouchProd) ? "blame_unavailable" : missingCommit ? "commit_missing" : "ok";
  return { status, count: fixupSet.size, fixupPrNumbers: [...fixupSet].sort((a, b) => a - b), regressedPrNumbers: [...regressedSet].sort((a, b) => a - b), details };
}

function collectLedgerValidatedShas(ledgerData, repo) {
  const shas = (ledgerData?.validations || []).filter((v) => v.exit === 0 && !v.dirty && v.sha).map((v) => v.sha);
  for (const unit of Object.values(ledgerData?.units || {})) {
    if (repo && unit.repo && String(unit.repo).toLowerCase() !== String(repo).toLowerCase()) continue;
    for (const ev of unit.evidence || []) if (ev.kind === "validated" && ev.sha) shas.push(ev.sha);
  }
  return shas;
}

export function verifyPrEvidence(pr, { repo = "", ledgerData = null, checkoutDir = null } = {}) {
  const hasProd = (pr?.files || []).some((f) => isProductionPath(f.path) && Number(f.additions || 0) + Number(f.deletions || 0) > 0);
  if (!pr?.filesTruncated && Array.isArray(pr?.files) && !hasProd) return { verified: true, status: "exempt_no_prod_code", testedSha: null };
  if (!ledgerData) return { verified: null, status: "unavailable", testedSha: null };
  const head = String(pr?.headRefOid || "");
  if (!SHA_RE.test(head)) return { verified: false, status: "invalid_head_sha", testedSha: null };
  const validatedShas = collectLedgerValidatedShas(ledgerData, repo);
  const direct = validatedShas.find((s) => sameSha(s, head));
  if (direct) return { verified: true, status: "verified_head", testedSha: direct };
  if (checkoutDir && existsSync(checkoutDir)) {
    if (!runGit(checkoutDir, ["cat-file", "-e", `${head}^{commit}`]).ok) return { verified: false, status: "unverified_head_missing_locally", testedSha: null };
    const ancestors = runGit(checkoutDir, ["rev-list", "--first-parent", "--max-count=30", head]);
    for (const anc of ancestors.ok ? ancestors.stdout.split(/\s+/).filter(Boolean).slice(1) : []) {
      if (!validatedShas.some((s) => sameSha(s, anc))) continue;
      const diff = runGit(checkoutDir, ["diff", "--no-ext-diff", "--name-only", anc, head]);
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

const BUILD_TEST_CMD_RE = /(?:^|[;&|]\s*|\S*\/bin\/)verdict\s+(?:run|baseline|restore|verify|capture|diff|check|--help)\b|\b(?:gradlew|gradle\.lock|node\s+--test|npm\s+(?:test|run\s+(?:test|build|lint|check))|pnpm\s+(?:test|build|lint)|yarn\s+(?:test|build|lint)|pytest|cargo\s+(?:test|build|check|clippy)|go\s+test|mvn\s+(?:test|verify|package)|dotnet\s+(?:test|build)|rspec|jest|vitest|adb\b|scripts\/check\.mjs)\b/i;
const POLL_GUARD_RE = /\b(?:check-runs|pulls\/\d+\/(?:reviews|comments)|reviewThreads|pr\s+checks|run\s+watch)\b/i;
const POLL_CMD_RE = /\b(?:check-runs|pulls\/\d+\/(?:reviews|comments)|reviewThreads|pr\s+checks|run\s+watch|sleep\s+\d+(?:\.\d+)?[smh]?)\b/i;
const HUMAN_WAIT_TOOLS = new Set(["ask_user", "relay_session_input"]);

export function mergeIntervals(intervals = []) {
  const valid = intervals.filter((iv) => Array.isArray(iv) && Number.isFinite(iv[0]) && Number.isFinite(iv[1]) && iv[1] >= iv[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [s, e] of valid) {
    if (!out.length || s > out[out.length - 1][1]) out.push([s, e]);
    else if (e > out[out.length - 1][1]) out[out.length - 1][1] = e;
  }
  return out;
}
const sumMergedSec = (ivs) => mergeIntervals(ivs).reduce((acc, [s, e]) => acc + (e - s), 0) / 1000;

export function parseSessionEvents(eventsPath) {
  const lines = readFileSync(eventsPath, "utf8").split(/\r?\n/);
  let latestNanoAiu = null, modelCalls = 0, compactions = 0, totalReadChars = 0, duplicateReadChars = 0, ownerRepeatMessages = 0, seenKickoff = false, toolWorkMs = 0;
  const toolStarts = new Map(), seenReadsByPath = new Map(), openTurns = new Map(), openCompactions = new Map(), shellCmdById = new Map(), subagentBounds = new Map(), callIdByAgentId = new Map();
  const modelIvs = [], buildTestIvs = [], pollIvs = [], subagentIvs = [], ioOtherIvs = [], humanIvs = [], toolClockIvs = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    const { type, data = {} } = evt, ts = Date.parse(evt.timestamp || ""), isMain = !evt.agentId;
    if (type === "assistant.turn_start") {
      modelCalls += 1;
      if (isMain && Number.isFinite(ts)) openTurns.set(String(data.turnId ?? ""), ts);
    } else if (type === "assistant.message") {
      const k = String(data.turnId ?? ""), st = openTurns.get(k);
      if (isMain && Number.isFinite(st) && Number.isFinite(ts) && ts >= st) { modelIvs.push([st, ts]); openTurns.delete(k); }
    } else if (type === "assistant.turn_end" && isMain) {
      openTurns.delete(String(data.turnId ?? ""));
    } else if (type === "session.compaction_start") {
      modelCalls += 1; compactions += 1;
      if (isMain && Number.isFinite(ts)) openCompactions.set(String(data.compactionAttemptId || "default"), ts);
    } else if (type === "session.compaction_complete" && isMain) {
      const k = String(data.compactionAttemptId || "default"), st = openCompactions.get(k);
      if (Number.isFinite(st) && Number.isFinite(ts) && ts >= st) { modelIvs.push([st, ts]); openCompactions.delete(k); }
    } else if (type === "subagent.started" && data.toolCallId && Number.isFinite(ts)) {
      const tStart = toolStarts.get(data.toolCallId);
      if (tStart ? tStart.isMain : !data.parentId) {
        const prev = subagentBounds.get(data.toolCallId);
        subagentBounds.set(data.toolCallId, { startMs: prev ? Math.min(prev.startMs, ts) : ts, endMs: prev?.endMs ?? null });
        if (evt.agentId) callIdByAgentId.set(String(evt.agentId), data.toolCallId);
      }
    } else if ((type === "subagent.completed" || type === "subagent.failed") && data.toolCallId && Number.isFinite(ts)) {
      const prev = subagentBounds.get(data.toolCallId);
      if (prev && ts >= prev.startMs) subagentBounds.set(data.toolCallId, { ...prev, endMs: prev.endMs !== null ? Math.max(prev.endMs, ts) : ts });
    } else if ((type === "session.usage_checkpoint" || type === "session.shutdown") && data.totalNanoAiu !== null && data.totalNanoAiu !== "" && Number.isFinite(Number(data.totalNanoAiu))) {
      latestNanoAiu = Number(data.totalNanoAiu);
    } else if (type === "tool.execution_start" && data.toolCallId) {
      let args = data.arguments;
      if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
      const startLine = Array.isArray(args?.view_range) && Number.isFinite(Number(args.view_range[0])) ? Math.max(1, Math.trunc(Number(args.view_range[0]))) : 1;
      const cmd = String(args?.command || (data.toolName === "read_bash" && args?.shellId ? shellCmdById.get(String(args.shellId)) || "" : ""));
      if (isMain && data.toolName === "bash" && args?.shellId) shellCmdById.set(String(args.shellId), cmd);
      toolStarts.set(data.toolCallId, { toolName: data.toolName, path: args?.path || null, startLine, startMs: ts, cmd, agentId: args?.agent_id ? String(args.agent_id) : null, isMain });
      if (isMain && data.toolName === "task" && Number.isFinite(ts)) {
        const prev = subagentBounds.get(data.toolCallId);
        subagentBounds.set(data.toolCallId, { startMs: prev ? Math.min(prev.startMs, ts) : ts, endMs: prev?.endMs ?? null });
      }
    } else if (type === "tool.execution_complete") {
      const start = toolStarts.get(data.toolCallId);
      if (!start) continue;
      if (start.isMain && start.toolName === "bash") {
        const resText = String(typeof data.result === "string" ? data.result : data.result?.content ?? "");
        const shMatch = resText.match(/\bshellId:\s*([^\s>]+)/);
        if (shMatch) shellCmdById.set(shMatch[1], start.cmd);
      }
      if (start.isMain && Number.isFinite(start.startMs) && Number.isFinite(ts) && ts >= start.startMs) {
        const iv = [start.startMs, ts], dur = ts - start.startMs;
        if (HUMAN_WAIT_TOOLS.has(start.toolName)) humanIvs.push(iv);
        else if (start.toolName === "task") {
          const prev = subagentBounds.get(data.toolCallId) || { startMs: start.startMs, endMs: null };
          subagentBounds.set(data.toolCallId, { startMs: Math.min(prev.startMs, start.startMs), endMs: prev.endMs !== null ? Math.max(prev.endMs, ts) : ts });
          const resText = String(typeof data.result === "string" ? data.result : data.result?.content ?? "");
          const agMatch = resText.match(/\bagent_id:\s*([^\s.]+)/);
          if (agMatch) callIdByAgentId.set(agMatch[1], data.toolCallId);
        } else if (start.toolName === "read_agent" && start.agentId && callIdByAgentId.has(start.agentId) && subagentBounds.has(callIdByAgentId.get(start.agentId))) {
          const cid = callIdByAgentId.get(start.agentId), prev = subagentBounds.get(cid);
          subagentBounds.set(cid, { startMs: Math.min(prev.startMs, start.startMs), endMs: prev.endMs !== null ? Math.max(prev.endMs, ts) : ts });
        } else {
          toolClockIvs.push(iv); toolWorkMs += dur;
          if (start.toolName === "read_agent") subagentIvs.push(iv);
          else if (start.toolName === "bash" || start.toolName === "read_bash") {
            if (!POLL_GUARD_RE.test(start.cmd) && BUILD_TEST_CMD_RE.test(start.cmd)) buildTestIvs.push(iv);
            else if (POLL_CMD_RE.test(start.cmd)) pollIvs.push(iv);
            else ioOtherIvs.push(iv);
          } else ioOtherIvs.push(iv);
        }
      }
      if (data.success && start.path) {
        if (start.toolName === "edit" || start.toolName === "create") seenReadsByPath.delete(start.path);
        else if (start.toolName === "view") {
          const content = String(typeof data.result === "string" ? data.result : data.result?.content ?? "");
          if (!content.length) continue;
          totalReadChars += content.length;
          const seenLines = seenReadsByPath.get(start.path) || new Set(), parts = content.split("\n");
          const lineCount = content.endsWith("\n") ? parts.length - 1 : parts.length;
          for (let i = 0; i < lineCount; i++) {
            const lineNo = start.startLine + i, chars = parts[i].length + (i < parts.length - 1 ? 1 : 0);
            if (seenLines.has(lineNo)) duplicateReadChars += chars;
            else seenLines.add(lineNo);
          }
          seenReadsByPath.set(start.path, seenLines);
        }
      }
    } else if (type === "user.message" && isMain && !data.isAutopilotContinuation) {
      const c = String(data.content ?? "");
      if (!c.trim() || c.includes("<skill-context") || c.includes("<system_notification")) continue;
      if (!seenKickoff) { seenKickoff = true; continue; }
      if (data.source || c.includes("<cross_session_message") || NON_STEERING_PREFIX_RE.test(c)) continue;
      if (REPEAT_RULE_RE.test(c)) ownerRepeatMessages += 1;
    }
  }
  for (const b of subagentBounds.values()) {
    if (b.endMs !== null && b.endMs >= b.startMs) { const iv = [b.startMs, b.endMs]; subagentIvs.push(iv); toolClockIvs.push(iv); toolWorkMs += b.endMs - b.startMs; }
  }
  const allActiveIvs = [...modelIvs, ...buildTestIvs, ...pollIvs, ...subagentIvs, ...ioOtherIvs];
  const mergedActive = mergeIntervals(allActiveIvs), mergedTools = mergeIntervals(toolClockIvs);
  const mergedToolSec = mergedTools.reduce((a, [s, e]) => a + (e - s), 0) / 1000;
  const timeBuckets = mergedActive.length > 0 ? { modelSec: sumMergedSec(modelIvs), buildTestSec: sumMergedSec(buildTestIvs), pollSec: sumMergedSec(pollIvs), subagentSec: sumMergedSec(subagentIvs), ioOtherSec: sumMergedSec(ioOtherIvs) } : null;
  return {
    lines, activeIntervals: mergedActive, toolIntervals: mergedTools, toolWorkSec: toolWorkMs / 1000,
    totalNanoAiu: latestNanoAiu, modelCalls, compactions, totalReadChars, duplicateReadChars,
    duplicateReadRate: totalReadChars > 0 ? duplicateReadChars / totalReadChars : null, ownerRepeatMessages,
    activeSec: mergedActive.length > 0 ? mergedActive.reduce((a, [s, e]) => a + (e - s), 0) / 1000 : null,
    humanWaitSec: mergedActive.length > 0 || humanIvs.length > 0 ? sumMergedSec(humanIvs) : null,
    parallelismFactor: mergedToolSec > 0 ? (toolWorkMs / 1000) / mergedToolSec : null,
    timeBuckets,
  };
}

export function analyzeSessions(prs, { sessionsDir = null, repo = "", windowPrNumbers = null } = {}) {
  if (!sessionsDir || !existsSync(sessionsDir)) return { status: "unavailable", mappedCount: 0, totalOwnerRepeatMessages: null, sharedPrNumbers: [], sharedSessions: [], perPr: {} };
  const sessions = [];
  for (const entry of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const wsPath = join(sessionsDir, entry.name, "workspace.yaml"), evPath = join(sessionsDir, entry.name, "events.jsonl");
    if (!existsSync(wsPath) || !existsSync(evPath)) continue;
    const ws = parseWorkspaceYaml(wsPath);
    if (repo && (!ws.repository || ws.repository.toLowerCase() !== repo.toLowerCase())) continue;
    sessions.push({ id: ws.id || entry.name, createdAt: ws.created_at || null, ...parseSessionEvents(evPath) });
  }
  const chosenByPr = new Map(), prsBySession = new Map();
  for (const pr of prs || []) {
    const prMergedMs = Date.parse(pr.mergedAt || "");
    const needle = pr.url || (repo ? `https://github.com/${repo}/pull/${pr.number}` : `/pull/${pr.number}`);
    const needleRe = new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`);
    let best = null, bestHits = 0;
    for (const s of sessions) {
      const createdMs = Date.parse(s.createdAt || "");
      if (Number.isFinite(prMergedMs) && Number.isFinite(createdMs) && createdMs > prMergedMs) continue;
      let hits = 0;
      for (const l of s.lines) if (needleRe.test(l)) hits += 1;
      if (hits > bestHits) { bestHits = hits; best = s; }
    }
    if (best) { chosenByPr.set(pr.number, best); prsBySession.set(best.id, [...(prsBySession.get(best.id) || []), pr.number]); }
  }
  const inWindow = windowPrNumbers ? new Set(windowPrNumbers) : null;
  const perPr = {}, sharedPrNumbers = [], distinctSessions = new Map(), sharedSessions = [];
  let mappedCount = 0;
  for (const pr of (prs || []).filter((p) => !inWindow || inWindow.has(p.number))) {
    const s = chosenByPr.get(pr.number);
    if (!s) { perPr[pr.number] = { sessionId: null, sharedSession: false, attribution: "unmatched", ownerRepeatMessages: null }; continue; }
    mappedCount += 1; distinctSessions.set(s.id, s);
    if ((prsBySession.get(s.id)?.length || 0) > 1) {
      sharedPrNumbers.push(pr.number);
      perPr[pr.number] = { sessionId: s.id, sharedSession: true, attribution: "ambiguous", totalNanoAiu: null, modelCalls: null, duplicateReadRate: null, ownerRepeatMessages: null, activeSec: null, humanWaitSec: null, parallelismFactor: null, timeBuckets: null };
    } else {
      const { lines: _lines, activeIntervals: _ai, toolIntervals: _ti, toolWorkSec: _tw, createdAt: _c, id, ...metrics } = s;
      perPr[pr.number] = { sessionId: id, sharedSession: false, attribution: "unique", ...metrics };
    }
  }
  for (const [id, s] of distinctSessions) {
    const allNums = (prsBySession.get(id) || []).sort((a, b) => a - b);
    if (allNums.length > 1) sharedSessions.push({ sessionId: id, prNumbers: allNums, inWindowPrNumbers: allNums.filter((n) => !inWindow || inWindow.has(n)), totalNanoAiu: s.totalNanoAiu, modelCalls: s.modelCalls, activeSec: s.activeSec });
  }
  const totalOwnerRepeatMessages = [...distinctSessions.values()].reduce((acc, s) => acc + s.ownerRepeatMessages, 0);
  return { status: "ok", mappedCount, totalOwnerRepeatMessages, sharedPrNumbers: sharedPrNumbers.sort((a, b) => a - b), sharedSessions, perPr };
}

const exactMedian = (values) => (!values.length || values.some((v) => !Number.isFinite(v)) ? null : median(values));
const readJsonSafe = (p) => { try { return p && existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; } catch { return null; } };

export function collectMetrics({ repo = "", prs = [], prsTruncated = false, from = null, to = null, maturityDays = 14, checkoutDir = null, ledgerDir = null, sessionsDir = null, targetRef = "HEAD" } = {}) {
  const truncated = Boolean(prsTruncated || prs?.truncated), fromMs = from ? Date.parse(from) : -Infinity, toMs = to ? Date.parse(to) : Infinity;
  const prsUpToEnd = prs.filter((pr) => { const m = Date.parse(pr.mergedAt || pr.createdAt || ""); return !Number.isFinite(toMs) || !Number.isFinite(m) || m < toMs; });
  const windowPrs = prsUpToEnd.filter((pr) => { const m = Date.parse(pr.mergedAt || pr.createdAt || ""); return !Number.isFinite(m) || m >= fromMs; });
  const matureLowerMs = Number.isFinite(fromMs) ? fromMs - maturityDays * DAY_MS : -Infinity, matureCutoffMs = (Number.isFinite(toMs) ? toMs : Date.now()) - maturityDays * DAY_MS;
  const maturePrs = prsUpToEnd.filter((pr) => { const m = Date.parse(pr.mergedAt || ""); return Number.isFinite(m) && m >= matureLowerMs && m <= matureCutoffMs; });
  const fixupCohort = prsUpToEnd.filter((pr) => { const m = Date.parse(pr.mergedAt || pr.createdAt || ""); return !Number.isFinite(m) || m >= matureLowerMs; });
  const codeSurvival = truncated ? { status: "prs_truncated", addedLines: 0, survivingLines: 0, rate: null, perPr: [] }
    : !checkoutDir || !existsSync(checkoutDir) ? { status: "unavailable", addedLines: 0, survivingLines: 0, rate: null, perPr: [] }
    : maturePrs.length === 0 ? { status: "no_mature_prs", addedLines: 0, survivingLines: 0, rate: null, perPr: [] } : computeCodeSurvival(maturePrs, { checkoutDir, targetRef });
  const fixups = detectFixups(fixupCohort, { repo, checkoutDir, windowDays: maturityDays }), fixupStatus = truncated ? "prs_truncated" : fixups.status;
  const windowFixups = fixups.details.filter((d) => windowPrs.some((p) => p.number === d.fixupPr));
  const ledgerData = readJsonSafe(ledgerDir ? join(ledgerDir, "ledger.json") : null);
  const sessionAnalysis = analyzeSessions(prs, { sessionsDir, repo, windowPrNumbers: windowPrs.map((p) => p.number) });
  let verifiedCount = 0, verifiableCount = 0, firstPushGreenCount = 0, commitInfoCount = 0, durablePassCount = 0, eligibleYieldCount = 0;
  const buckets = { trivial: [], small: [], "multi-task": [] };
  for (const pr of windowPrs) {
    const route = classifyRoute(pr, { checkoutDir }), prodLines = productionLinesChanged(pr), ev = verifyPrEvidence(pr, { repo, ledgerData, checkoutDir });
    if (ev.verified !== null) { verifiableCount += 1; if (ev.verified) verifiedCount += 1; }
    let firstPushGreen = null;
    if (Array.isArray(pr.commits) && pr.createdAt) {
      commitInfoCount += 1;
      firstPushGreen = pr.commits.filter((c) => Date.parse(c.committedDate || c.authoredDate || "") > Date.parse(pr.createdAt)).length === 0;
      if (firstPushGreen) firstPushGreenCount += 1;
    }
    const sess = sessionAnalysis.perPr[pr.number] || { attribution: "unmatched", ownerRepeatMessages: null };
    const isFixupOrRegressed = fixups.fixupPrNumbers.includes(pr.number) || fixups.regressedPrNumbers.includes(pr.number);
    if (ev.verified !== null && sessionAnalysis.status === "ok" && sess.attribution === "unique") {
      eligibleYieldCount += 1;
      if (ev.verified === true && !isFixupOrRegressed && sess.ownerRepeatMessages === 0) durablePassCount += 1;
    }
    buckets[route].push({ number: pr.number, prodLines, session: sess, evidence: ev, firstPushGreen });
  }
  const BUCKET_KEYS = ["buildTestSec", "pollSec", "modelSec", "subagentSec", "ioOtherSec"];
  const routeBuckets = Object.fromEntries(Object.entries(buckets).map(([route, items]) => {
    const u = truncated ? [] : items.filter((i) => i.session?.attribution === "unique");
    const timed = u.filter((i) => i.session.timeBuckets && Number.isFinite(i.session.activeSec));
    let dominantBottleneck = null, dominantBottleneckShare = null, bucketMediansSec = null;
    if (timed.length > 0) {
      const sums = Object.fromEntries(BUCKET_KEYS.map((k) => [k, timed.reduce((acc, i) => acc + (i.session.timeBuckets[k] || 0), 0)]));
      const totalBucketSec = Object.values(sums).reduce((a, b) => a + b, 0);
      bucketMediansSec = Object.fromEntries(BUCKET_KEYS.map((k) => [k, median(timed.map((i) => i.session.timeBuckets[k]))]));
      if (totalBucketSec > 0) {
        dominantBottleneck = BUCKET_KEYS.reduce((best, k) => (sums[k] > sums[best] ? k : best), BUCKET_KEYS[0]);
        dominantBottleneckShare = sums[dominantBottleneck] / totalBucketSec;
      }
    }
    return [route, {
      count: items.length, uniqueSessions: u.length, medianProdLines: truncated ? null : exactMedian(items.map((i) => i.prodLines)),
      medianNanoAiu: median(u.map((i) => i.session.totalNanoAiu)), meanModelCalls: mean(u.map((i) => i.session.modelCalls)),
      medianDuplicateReadRate: median(u.map((i) => i.session.duplicateReadRate)),
      medianActiveSec: median(u.map((i) => i.session.activeSec)), medianParallelism: median(u.map((i) => i.session.parallelismFactor)),
      dominantBottleneck, dominantBottleneckShare, bucketMediansSec,
    }];
  }));
  const allVerifiable = verifiableCount === windowPrs.length;
  const verificationStatus = truncated ? "prs_truncated" : windowPrs.length === 0 ? "no_prs" : ledgerData ? "ok" : allVerifiable ? "exempt_only" : "unavailable";
  const yieldStatus = truncated ? "prs_truncated" : windowPrs.length === 0 ? "no_prs" : !allVerifiable ? "ledger_unavailable" : fixupStatus !== "ok" ? fixupStatus : sessionAnalysis.status !== "ok" ? "sessions_unavailable" : eligibleYieldCount === 0 ? "no_attributed_sessions" : "ok";
  return {
    repo, prsTruncated: truncated, window: { from, to, maturityDays }, mergedPrCount: windowPrs.length, medianProdLines: truncated ? null : exactMedian(windowPrs.map((p) => productionLinesChanged(p))),
    durability: { codeSurvival, fixupStatus, fixupPrCount: new Set(windowFixups.map((d) => d.fixupPr)).size, fixups: windowFixups },
    verification: { status: verificationStatus, verifiedCount, verifiableCount, rate: verificationStatus === "ok" || verificationStatus === "exempt_only" ? verifiedCount / windowPrs.length : null },
    autonomy: { status: truncated ? "prs_truncated" : sessionAnalysis.status, firstPushGreenCount, commitInfoCount, firstPushGreenRate: !truncated && commitInfoCount > 0 ? firstPushGreenCount / commitInfoCount : null, ownerRepeatMessages: truncated ? null : sessionAnalysis.totalOwnerRepeatMessages, sharedPrNumbers: truncated ? [] : sessionAnalysis.sharedPrNumbers, sharedSessions: truncated ? [] : sessionAnalysis.sharedSessions },
    durableFirstPassYield: { status: yieldStatus, passedCount: yieldStatus === "ok" ? durablePassCount : 0, eligibleCount: yieldStatus === "ok" ? eligibleYieldCount : 0, rate: yieldStatus === "ok" ? durablePassCount / eligibleYieldCount : null },
    routeBuckets,
  };
}

const fmtPct = (num, den, rate) => (rate === null || rate === undefined ? "n/a" : `${num}/${den} (${(rate * 100).toFixed(1)}%)`);
const fmtNum = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "n/a");
export function formatMarkdownReport(r) {
  const cs = r.durability.codeSurvival;
  const survivalCell = cs.rate !== null ? fmtPct(cs.survivingLines, cs.addedLines, cs.rate) : `n/a (${cs.status === "ok" ? "no_added_prod_lines" : cs.status})`;
  const partialLabel = r.durability.fixupStatus === "blame_unavailable" ? "explicit refs" : "detected";
  const fixupCell = r.durability.fixupStatus === "ok" ? String(r.durability.fixupPrCount) : `n/a (${r.durability.fixupStatus}; ${partialLabel}: ${r.durability.fixupPrCount})`;
  const verifyCell = r.verification.rate !== null ? fmtPct(r.verification.verifiedCount, r.mergedPrCount, r.verification.rate) : `n/a (${r.verification.status})`;
  const greenCell = r.autonomy.firstPushGreenRate !== null ? fmtPct(r.autonomy.firstPushGreenCount, r.autonomy.commitInfoCount, r.autonomy.firstPushGreenRate) : `n/a (${r.prsTruncated ? "prs_truncated" : r.mergedPrCount === 0 ? "no_prs" : "no_commits"})`;
  const yieldCell = r.durableFirstPassYield.rate !== null ? fmtPct(r.durableFirstPassYield.passedCount, r.durableFirstPassYield.eligibleCount, r.durableFirstPassYield.rate) : `n/a (${r.durableFirstPassYield.status})`;
  const repeatCell = r.autonomy.ownerRepeatMessages ?? `n/a (${r.autonomy.status || "unavailable"})`;
  const sharedNote = r.prsTruncated ? "n/a (prs_truncated)" : r.autonomy.sharedSessions?.length
    ? r.autonomy.sharedSessions.map((s) => `ambiguous on #${s.inWindowPrNumbers.join(", #")} (${s.totalNanoAiu !== null ? s.totalNanoAiu.toExponential(2) : "n/a"} nanoAIU, ${s.modelCalls} calls, ${s.activeSec !== null && s.activeSec !== undefined ? `${s.activeSec.toFixed(1)}s active` : "n/a active"})`).join("; ")
    : "none";
  const routeRows = ["trivial", "small", "multi-task"].map((route) => {
    const b = r.routeBuckets[route];
    const domCell = b.dominantBottleneck ? `${b.dominantBottleneck} (${(b.dominantBottleneckShare * 100).toFixed(1)}%)` : "n/a";
    const parCell = b.medianParallelism !== null && b.medianParallelism !== undefined ? `${b.medianParallelism.toFixed(2)}x` : "n/a";
    return `| ${route} | ${b.count} | ${b.uniqueSessions} | ${fmtNum(b.medianProdLines, 0)} | ${b.medianNanoAiu !== null ? b.medianNanoAiu.toExponential(2) : "n/a"} | ${fmtNum(b.meanModelCalls, 1)} | ${b.medianDuplicateReadRate !== null ? `${(b.medianDuplicateReadRate * 100).toFixed(1)}%` : "n/a"} | ${fmtNum(b.medianActiveSec, 1)} | ${domCell} | ${parCell} |`;
  });
  return [`### Shadow-mode objective telemetry (${r.repo || "repo"})`, "| Objective measure | Value | Target |", "| --- | --- | --- |", `| Durable first-pass yield | ${yieldCell} | 90.0% or higher |`, `| Code survival rate (${r.window.maturityDays}d) | ${survivalCell} | 95.0% or higher |`, `| Fix-up PRs (${r.window.maturityDays}d, ref + blame) | ${fixupCell} | 0 |`, `| Ledger + ancestry verified merges | ${verifyCell} | 100.0% |`, `| First-push green rate | ${greenCell} | 70.0% or higher |`, `| Owner repeat-rule messages (matched sessions) | ${repeatCell} | 0 |`, `| Shared-session PRs (excluded from per-PR cost/speed) | ${sharedNote} | observe |`, "", "| Task route | PRs | Unique sessions | Median prod lines | Median `totalNanoAiu` | Mean model calls | Median duplicate read | Median active (s) | Dominant bottleneck | Median parallelism |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...routeRows].join("\n");
}

const PR_GRAPHQL_QUERY = "query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){pullRequests(states:MERGED,first:50,after:$cursor,orderBy:{field:UPDATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{number title url body createdAt mergedAt updatedAt headRefOid mergeCommit{oid} files(first:100){pageInfo{hasNextPage} nodes{path additions deletions}} commits(last:50){totalCount nodes{commit{committedDate}}}}}}}";

export function fetchMergedPrs(repo, { execFn = execFileSync, maxPages = 4, cutoffMs = -Infinity } = {}) {
  const [owner, name] = String(repo || "").split("/");
  if (!owner || !name) return [];
  const out = [];
  let truncated = false;
  for (let page = 0, cursor = null; page < maxPages; page++) {
    const args = ["api", "graphql", "-f", `owner=${owner}`, "-f", `name=${name}`, "-f", `query=${PR_GRAPHQL_QUERY}`, ...(cursor ? ["-f", `cursor=${cursor}`] : [])];
    const conn = JSON.parse(execFn("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }))?.data?.repository?.pullRequests;
    const nodes = conn?.nodes || [];
    for (const n of nodes) out.push({ ...n, filesTruncated: Boolean(n.files?.pageInfo?.hasNextPage), files: n.files?.nodes || [], commits: (n.commits?.nodes || []).map((c) => c.commit).filter(Boolean) });
    const oldestUpdatedMs = nodes.length ? Date.parse(nodes[nodes.length - 1].updatedAt || "") : NaN;
    if (!conn?.pageInfo?.hasNextPage || !conn?.pageInfo?.endCursor || (Number.isFinite(cutoffMs) && Number.isFinite(oldestUpdatedMs) && oldestUpdatedMs < cutoffMs)) break;
    if (page === maxPages - 1) truncated = true;
    cursor = conn.pageInfo.endCursor;
  }
  Object.defineProperty(out, "truncated", { value: truncated, enumerable: false });
  return out;
}

function main() {
  const { values: v } = parseArgs({ options: {
    repo: { type: "string", default: "" }, "prs-file": { type: "string" }, checkout: { type: "string" },
    "ledger-dir": { type: "string", default: join(homedir(), ".copilot", "work-ledger") }, "sessions-dir": { type: "string", default: join(homedir(), ".copilot", "session-state") },
    from: { type: "string" }, to: { type: "string" }, "maturity-days": { type: "string", default: "14" }, "target-ref": { type: "string", default: "HEAD" }, format: { type: "string", default: "markdown" },
  } });
  const maturityDays = Number(v["maturity-days"] || 14);
  const cutoffMs = v.from ? Date.parse(v.from) - maturityDays * DAY_MS * 2 : -Infinity;
  const prs = v["prs-file"] ? JSON.parse(readFileSync(resolve(v["prs-file"]), "utf8")) : v.repo ? fetchMergedPrs(v.repo, { cutoffMs }) : [];
  const report = collectMetrics({ repo: v.repo, prs, prsTruncated: Boolean(prs.truncated), from: v.from || null, to: v.to || null, maturityDays, checkoutDir: v.checkout ? resolve(v.checkout) : null, ledgerDir: v["ledger-dir"] ? resolve(v["ledger-dir"]) : null, sessionsDir: v["sessions-dir"] ? resolve(v["sessions-dir"]) : null, targetRef: v["target-ref"] || "HEAD" });
  console.log(v.format === "json" ? JSON.stringify(report, null, 2) : formatMarkdownReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

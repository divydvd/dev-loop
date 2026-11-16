#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_ACTIVE_RULES = 25, MAX_FIXUP_DIFF_LINES = 160, MAX_COMMENT_HUNK_LINES = 80, FIXUP_WINDOW_MS = 14 * 86_400_000;
const REPO_SLUG_RE = /^[\w.-]+\/[\w.-]+$/;
const DOC_EXT_RE = /\.(md|mdc|txt|rst|adoc)$/i;
const DOC_PATH_RE = /^docs\/|(?:^|\/)(README|CHANGELOG|LICENSE|AGENTS|GEMINI)(\.[^/]+)?$/i;
const TEST_PATH_RE = /(?:^|\/)(__tests__|tests?|spec|specs|androidTest|unitTest|fixtures|mocks)\/|(?:\.|_)(?:test|spec)\.[a-z0-9]+$|(?:^|\/)test_[^/]+\.(?:py|rb)$/i;
const TEST_SUFFIX_RE = /(?:Test|Tests|Spec)\.(?:kt|java|swift|ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/;
const GENERATED_PATH_RE = /(?:^|\/)(dist|build|out|coverage|generated|vendor|node_modules|\.gradle)\/|(?:^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|Podfile\.lock|Gemfile\.lock|composer\.lock|poetry\.lock|go\.sum)$|\.sha256$|\.min\.(js|css)$|\.pb\.(go|cc|h)$|\.g\.dart$|(?:^|\/)schemas\/[^/]+\/\d+\.json$/i;
const NOISY_BOT_LOGIN_RE = /^(?:codecov|coveralls|sonarcloud|sonarqubecloud|dependabot|renovate|github-actions|netlify|vercel|changeset-bot|claassistant|mergify|snyk-bot)(?:\[bot\]|-bot)?$/i;
const NOISY_BOT_BODY_RE = /^(?:!\[coverage\]|##\s*codecov\b)|codecov\.io\/gh\/|sonarcloud\.io\/dashboard/i;
const POSITIVE_FIX_REPLY_RE = /\b(?:fixed|addressed|done|updated|resolved)\b/i;
const NEGATED_FIX_REPLY_RE = /\b(?:not|never|won't|wont|cannot|can't|will\s+not|did\s+not|didn't)\s+(?:be\s+)?(?:fixed|addressed|done|updated|resolved)\b/i;
const EXPLICIT_FIXUP_RE = /\b(?:fix(?:es|ed|up)?|fix-up|revert(?:s|ed|ing)?(?:\s+of)?|regress(?:ion|ed)\s+(?:in|from|after)|broke\s+in|broken\s+by|introduced\s+(?:by|in)|after\s+regression\s+in)(?:\s+\w+){0,3}\s+(?:PR\s+)?(?:https?:\/\/[^\s/]+\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)|([\w.-]+\/[\w.-]+)?#(\d+))/gi;
const PR_TEMPLATE_META_LINE_RE = /^\s*[-*]\s*(?:Regression selection|Fixed findings)\s*:/gim;
const DIRECTIVE_TAG_RE = /<\/?(?:system(?:[-_][\w-]+)?|hard[-_]gate|extremely[-_]important|subagent[-_]stop|developer(?:[-_][\w-]+)?|assistant(?:[-_][\w-]+)?|user(?:[-_][\w-]+)?|instruction(?:s|[-_][\w-]+)?|prompt(?:[-_][\w-]+)?|override(?:[-_][\w-]+)?|rule[-_]miner(?:[-_][\w-]+)?)\b[^>]*>/gi;
const SECRET_PATTERNS = [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g, /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi];

export function isProductionPath(rawPath) {
  const p = String(rawPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  return Boolean(p) && !DOC_EXT_RE.test(p) && !DOC_PATH_RE.test(p) && !TEST_PATH_RE.test(p) && !TEST_SUFFIX_RE.test(p) && !GENERATED_PATH_RE.test(p);
}

export function sanitizeUntrustedText(rawText) {
  if (rawText === null || rawText === undefined) return "";
  let cleaned = String(rawText).replace(/\r\n/g, "\n"), prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "").replace(/<!--[\s\S]*$/g, "").replace(DIRECTIVE_TAG_RE, "");
  } while (cleaned !== prev);
  for (const pattern of SECRET_PATTERNS) cleaned = cleaned.replace(pattern, "[REDACTED]");
  return cleaned.trim();
}

function capLines(text, maxLines) {
  if (!text) return { text: "", lineCount: 0, truncated: false };
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, lineCount: lines.length, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), lineCount: maxLines, truncated: true };
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const cells = [];
  let current = "", inBackticks = false;
  for (let i = 1; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "\\" && i + 1 < trimmed.length) current += trimmed[++i];
    else if (ch === "`") { inBackticks = !inBackticks; current += ch; }
    else if (ch === "|" && !inBackticks) { cells.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (current.trim() !== "") cells.push(current.trim());
  return cells;
}

export function parseChecklist(markdownText) {
  if (!markdownText || !String(markdownText).trim()) {
    return { maxRules: MAX_ACTIVE_RULES, activeRuleCount: 0, remainingSlots: MAX_ACTIVE_RULES, activeRules: [], staleRules: [] };
  }
  let inActiveSection = false, headerSeen = false;
  const activeRules = [];
  for (const line of String(markdownText).replace(/\r\n/g, "\n").split("\n")) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) { inActiveSection = /^active rules$/i.test(headingMatch[1]); headerSeen = false; continue; }
    if (!inActiveSection) continue;
    const cells = splitMarkdownRow(line);
    if (!cells || cells.length < 8) continue;
    if (!headerSeen) { headerSeen = true; continue; }
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const [id, domain, triggers, check, safetyRaw, added, activeWeeksRaw, confirmedCatchesRaw, sourcePrs = ""] = cells;
    if (!id || id === "-" || /^none$/i.test(id)) continue;
    const cleanSafety = safetyRaw.replace(/^`+|`+$/g, "").trim();
    const cleanWeeks = activeWeeksRaw.replace(/^`+|`+$/g, "").trim();
    const cleanCatches = confirmedCatchesRaw.replace(/^`+|`+$/g, "").trim();
    activeRules.push({
      id, domain, triggers, check, safety: !/^no$/i.test(cleanSafety), added,
      activeWeeks: /^\d+$/.test(cleanWeeks) ? Number.parseInt(cleanWeeks, 10) : null,
      confirmedCatches: /^\d+$/.test(cleanCatches) ? Number.parseInt(cleanCatches, 10) : null,
      sourcePrs,
    });
  }
  const activeRuleCount = activeRules.length, remainingSlots = Math.max(0, MAX_ACTIVE_RULES - activeRuleCount);
  const staleRules = activeRules.filter((r) => !r.safety && r.activeWeeks !== null && r.activeWeeks >= 4 && r.confirmedCatches === 0);
  return { maxRules: MAX_ACTIVE_RULES, activeRuleCount, remainingSlots, activeRules, staleRules };
}

const EXEC_OPTS = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 };
const defaultExecGh = (args) => execFileSync("gh", args, EXEC_OPTS);
const defaultExecGit = (cwd, args) => execFileSync("git", args, { cwd, ...EXEC_OPTS });

function normalizeBoundIso(raw, endOfDay) {
  const s = String(raw || "").trim();
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}` : s;
  const ms = Date.parse(candidate);
  if (!s || !Number.isFinite(ms)) throw new Error(`Invalid ISO date: ${raw}`);
  return new Date(ms).toISOString();
}

function readJsonOptionFile(filePath, flagName) {
  if (!existsSync(filePath)) throw new Error(`File not found for ${flagName}: ${filePath}`);
  try { return JSON.parse(readFileSync(filePath, "utf8")); }
  catch (err) { throw new Error(`Invalid JSON in ${flagName} (${filePath}): ${err.message}. Pass collect-metrics.mjs --format json output.`); }
}

function gitCommitExists(checkoutDir, sha, execGit) {
  if (!checkoutDir || !sha) return false;
  try { execGit(checkoutDir, ["cat-file", "-e", `${sha}^{commit}`]); return true; }
  catch { return false; }
}

function fileChangedBetweenCommits(checkoutDir, fromSha, toSha, filePath, execGit) {
  if (!gitCommitExists(checkoutDir, fromSha, execGit) || !gitCommitExists(checkoutDir, toSha, execGit)) return true;
  try { return execGit(checkoutDir, ["diff", "--name-only", fromSha, toSha, "--", filePath]).trim().length > 0; }
  catch { return true; }
}

function loadMergedPrs({ repo, fromIso, toIso, prs, prsFile, execGh }) {
  let rawPrs = prs;
  if (!rawPrs && prsFile) {
    const parsed = readJsonOptionFile(prsFile, "--prs-file");
    rawPrs = Array.isArray(parsed) ? parsed : parsed.prs || [];
  }
  if (!rawPrs) {
    if (!repo) throw new Error("Pass --repo <owner/repo> or --prs-file <json>.");
    const out = execGh([
      "pr", "list", "--repo", repo, "--state", "merged", "--limit", "200",
      "--search", `merged:${fromIso}..${toIso}`,
      "--json", "number,title,body,mergedAt,mergeCommit,headRefOid,files",
    ]);
    rawPrs = JSON.parse(out || "[]");
  }
  const fromMs = Date.parse(fromIso), toMs = Date.parse(toIso);
  const allPrsByNum = new Map(rawPrs.filter((pr) => Number.isFinite(Number(pr?.number))).map((pr) => [Number(pr.number), pr]));
  const prsInWindow = rawPrs.filter((pr) => {
    const mergedMs = Date.parse(pr?.mergedAt || "");
    return Number.isFinite(mergedMs) && mergedMs >= fromMs && mergedMs <= toMs;
  });
  return { prsInWindow, allPrsByNum };
}

function normalizeCommentsMap({ prsInWindow, repo, commentsByPr, commentsFile, execGh }) {
  if (commentsByPr) return commentsByPr;
  if (commentsFile) {
    const parsed = readJsonOptionFile(commentsFile, "--comments-file");
    if (Array.isArray(parsed)) {
      const grouped = {};
      for (const item of parsed) {
        const urlMatch = String(item.pull_request_url || item.html_url || "").match(/\/pulls?\/(\d+)/);
        const prNum = item.prNumber ?? item.pull_number ?? (urlMatch ? Number(urlMatch[1]) : null);
        if (prNum !== null && prNum !== undefined) (grouped[String(prNum)] ||= []).push(item);
      }
      return grouped;
    }
    return parsed?.commentsByPr && typeof parsed.commentsByPr === "object" ? parsed.commentsByPr : parsed || {};
  }
  if (!repo) return {};
  const fetched = {};
  for (const pr of prsInWindow) {
    const out = execGh(["api", "--paginate", "--slurp", `repos/${repo}/pulls/${pr.number}/comments?per_page=100`]);
    const pages = JSON.parse(out || "[]");
    fetched[String(pr.number)] = Array.isArray(pages[0]) ? pages.flat() : pages;
  }
  return fetched;
}

function findFixConfirmationReply(replies, mergedMs) {
  let latestResolution = null;
  for (const reply of replies) {
    const replyMs = Date.parse(reply.created_at || "");
    if (Number.isFinite(mergedMs) && Number.isFinite(replyMs) && replyMs > mergedMs) continue;
    const body = String(reply.body || "");
    if (!POSITIVE_FIX_REPLY_RE.test(body)) continue;
    latestResolution = NEGATED_FIX_REPLY_RE.test(body) ? null : reply;
  }
  return latestResolution;
}

function extractAddressedThreads({ prsInWindow, commentsMap, checkoutDir, execGit }) {
  const addressedThreads = [];
  for (const pr of prsInWindow) {
    const prComments = commentsMap[String(pr.number)] || commentsMap[pr.number] || [];
    if (!Array.isArray(prComments) || prComments.length === 0) continue;
    const mergedMs = Date.parse(pr.mergedAt || "");
    const repliesByRoot = new Map();
    const roots = [];
    for (const c of prComments) {
      if (c.in_reply_to_id) (repliesByRoot.get(c.in_reply_to_id) || repliesByRoot.set(c.in_reply_to_id, []).get(c.in_reply_to_id)).push(c);
      else roots.push(c);
    }
    for (const root of roots) {
      const login = String(root?.user?.login || root?.author?.login || "").trim();
      if (!root.path || !isProductionPath(root.path)) continue;
      if (NOISY_BOT_LOGIN_RE.test(login) || NOISY_BOT_BODY_RE.test(String(root.body || ""))) continue;
      const createdMs = Date.parse(root.created_at || "");
      if (Number.isFinite(mergedMs) && Number.isFinite(createdMs) && createdMs > mergedMs) continue;

      const fixReply = findFixConfirmationReply(repliesByRoot.get(root.id) || [], mergedMs);
      const originalSha = String(root.original_commit_id || "").trim();
      const headSha = String(pr.headRefOid || "").trim();
      const modifiedAfterComment =
        Boolean(originalSha && headSha && originalSha !== headSha) &&
        fileChangedBetweenCommits(checkoutDir, originalSha, headSha, root.path, execGit);
      if (!modifiedAfterComment && !fixReply) continue;

      const sanitizedHunk = capLines(sanitizeUntrustedText(root.diff_hunk || ""), MAX_COMMENT_HUNK_LINES);
      addressedThreads.push({
        untrusted: true, prNumber: pr.number, commentId: root.id, path: root.path,
        line: root.line ?? root.original_line ?? null, author: login || "unknown",
        resolution: modifiedAfterComment ? "commit_after_comment" : "fix_reply",
        originalCommitId: originalSha || null, headRefOid: headSha || null,
        body: sanitizeUntrustedText(root.body || ""), diffHunk: sanitizedHunk.text,
        replyBody: fixReply ? sanitizeUntrustedText(fixReply.body || "") : null,
      });
    }
  }
  return addressedThreads;
}

function collectMetricsFixupMap(metrics) {
  const byPr = new Map();
  if (!metrics || typeof metrics !== "object") return byPr;
  const candidates = [
    ...(Array.isArray(metrics?.durability?.fixups) ? metrics.durability.fixups : []),
    ...(Array.isArray(metrics?.fixupPrs) ? metrics.fixupPrs : []),
    ...(Array.isArray(metrics?.fixups) ? metrics.fixups : []),
    ...(Array.isArray(metrics?.details) ? metrics.details : []),
  ];
  for (const item of candidates) {
    const isPrimitive = typeof item === "number" || typeof item === "string";
    const fixupPr = Number(isPrimitive ? item : item?.fixupPr ?? item?.prNumber ?? item?.number);
    if (!Number.isFinite(fixupPr) || fixupPr <= 0) continue;
    const entry = byPr.get(fixupPr) || { targets: new Set(), methods: new Set() };
    const targetPr = Number(isPrimitive ? null : item?.targetPr ?? item?.revertsPr ?? item?.fixesPr);
    if (Number.isFinite(targetPr) && targetPr > 0 && targetPr !== fixupPr) entry.targets.add(targetPr);
    entry.methods.add(String((!isPrimitive && item?.method) || "collect_metrics"));
    byPr.set(fixupPr, entry);
  }
  return byPr;
}

function extractExplicitTargetPrs(pr, { repo, allPrsByNum }) {
  const targets = new Set();
  const laterMs = Date.parse(pr.mergedAt || "");
  const cleanedText = `${pr.title || ""}\n${pr.body || ""}`.replace(PR_TEMPLATE_META_LINE_RE, "");
  for (const m of cleanedText.matchAll(EXPLICIT_FIXUP_RE)) {
    const refRepo = m[1] || m[3], targetNum = Number(m[2] || m[4]);
    if (repo && refRepo && refRepo.toLowerCase() !== repo.toLowerCase()) continue;
    if (!Number.isFinite(targetNum) || targetNum <= 0 || targetNum === pr.number) continue;
    const knownTarget = allPrsByNum?.get(targetNum);
    if (knownTarget) {
      const targetMs = Date.parse(knownTarget.mergedAt || "");
      if (!Number.isFinite(targetMs) || !Number.isFinite(laterMs) || laterMs < targetMs || laterMs - targetMs > FIXUP_WINDOW_MS) continue;
    }
    targets.add(targetNum);
  }
  return [...targets];
}

function extractProdDiffForCommit({ checkoutDir, commitSha, prodFiles, execGit }) {
  if (!checkoutDir || !commitSha || !gitCommitExists(checkoutDir, commitSha, execGit)) {
    return { text: "", lineCount: 0, truncated: false, prodFiles };
  }
  let resolved = prodFiles;
  if (!resolved || resolved.length === 0) {
    try {
      const out = execGit(checkoutDir, ["diff-tree", "--root", "--first-parent", "--no-commit-id", "--name-only", "-r", commitSha]);
      resolved = [...new Set(out.split("\n").map((s) => s.trim()).filter(isProductionPath))];
    } catch {
      resolved = [];
    }
  }
  if (resolved.length === 0) return { text: "", lineCount: 0, truncated: false, prodFiles: [] };
  try {
    const raw = execGit(checkoutDir, ["show", "--first-parent", "--format=", "--no-ext-diff", "--unified=2", commitSha, "--", ...resolved]);
    return { ...capLines(sanitizeUntrustedText(raw), MAX_FIXUP_DIFF_LINES), prodFiles: resolved };
  } catch {
    return { text: "", lineCount: 0, truncated: false, prodFiles: resolved };
  }
}

function extractFixupSignals({ prsInWindow, allPrsByNum, repo, metrics, checkoutDir, execGit }) {
  const metricsMap = collectMetricsFixupMap(metrics);
  const metricsAuthoritative = Boolean(
    metrics && typeof metrics === "object" && (metrics?.durability?.fixupStatus === "ok" || Array.isArray(metrics?.fixupPrs) || Array.isArray(metrics?.fixups)),
  );
  const fixupSignals = [];
  for (const pr of prsInWindow) {
    const explicitTargets = metricsAuthoritative ? [] : extractExplicitTargetPrs(pr, { repo, allPrsByNum });
    const metricRecord = metricsMap.get(Number(pr.number));
    if (!metricRecord && explicitTargets.length === 0) continue;

    const targets = new Set([...(metricRecord ? metricRecord.targets : []), ...explicitTargets]);
    const methods = new Set([...(metricRecord ? metricRecord.methods : []), ...(explicitTargets.length ? ["explicit_ref"] : [])]);
    const declaredProdFiles = [...new Set((pr.files || []).map((f) => (typeof f === "string" ? f : f?.path)).filter(isProductionPath))];
    const commitSha = (typeof pr.mergeCommit === "string" ? pr.mergeCommit : pr.mergeCommit?.oid) || pr.headRefOid || null;
    const diffResult = extractProdDiffForCommit({ checkoutDir, commitSha, prodFiles: declaredProdFiles, execGit });

    fixupSignals.push({
      untrusted: true, prNumber: pr.number,
      title: sanitizeUntrustedText(pr.title || ""), body: sanitizeUntrustedText(pr.body || ""),
      mergedAt: pr.mergedAt || null, commitSha,
      targetPrNumbers: [...targets].sort((a, b) => a - b), methods: [...methods],
      prodFiles: diffResult.prodFiles, diff: diffResult.text,
      diffLineCount: diffResult.lineCount, truncated: diffResult.truncated,
    });
  }
  return fixupSignals;
}

export function minePrEvidence(options = {}) {
  const repo = options.repo || null;
  if (repo !== null && !REPO_SLUG_RE.test(repo)) throw new Error(`Invalid --repo value: ${repo}. Expected <owner/repo>.`);
  const toIso = normalizeBoundIso(options.to || new Date().toISOString(), true);
  const fromIso = normalizeBoundIso(
    options.from || new Date(Date.parse(toIso) - 7 * 86_400_000).toISOString(),
    false,
  );
  if (Date.parse(fromIso) > Date.parse(toIso)) throw new Error(`Invalid window: --from (${fromIso}) is after --to (${toIso}).`);
  const checkoutDir = options.checkoutDir ? resolve(options.checkoutDir) : null;
  const execGh = options.execGh || defaultExecGh;
  const execGit = options.execGit || defaultExecGit;

  const { prsInWindow, allPrsByNum } = loadMergedPrs({ repo, fromIso, toIso, prs: options.prs, prsFile: options.prsFile, execGh });
  const commentsMap = normalizeCommentsMap({
    prsInWindow, repo, commentsByPr: options.commentsByPr, commentsFile: options.commentsFile, execGh,
  });
  const metrics = options.metrics || (options.metricsFile ? readJsonOptionFile(options.metricsFile, "--metrics-file") : null);

  const addressedThreads = extractAddressedThreads({ prsInWindow, commentsMap, checkoutDir, execGit });
  const fixupSignals = extractFixupSignals({ prsInWindow, allPrsByNum, repo, metrics, checkoutDir, execGit });
  const checklistText =
    options.checklistText ??
    (options.checklistPath && existsSync(options.checklistPath) ? readFileSync(options.checklistPath, "utf8") : null);
  const checklist = parseChecklist(checklistText);
  const eligibleForMining = fixupSignals.length >= 1 || addressedThreads.length >= 2;

  return {
    repo, window: { from: fromIso, to: toIso }, untrusted: true, eligibleForMining,
    summary: {
      mergedPrCount: prsInWindow.length, addressedThreadCount: addressedThreads.length,
      fixupSignalCount: fixupSignals.length, activeRuleCount: checklist.activeRuleCount,
      remainingSlots: checklist.remainingSlots, staleRuleCount: checklist.staleRules.length,
    },
    addressedThreads, fixupSignals, checklist,
  };
}

export function formatEvidenceSummary(p) {
  const s = p.summary;
  return `# PR Evidence Packet (${p.repo || "local-fixtures"})\n- Window: ${p.window.from} .. ${p.window.to}\n- Merged PRs: ${s.mergedPrCount} | Addressed threads: ${s.addressedThreadCount} | 14-day fix-ups: ${s.fixupSignalCount}\n- Eligible for mining: ${p.eligibleForMining} | Checklist: ${s.activeRuleCount}/${p.checklist.maxRules} active (${s.remainingSlots} remaining, ${s.staleRuleCount} stale)\n`;
}

function parseCliArgs(argv) {
  const opts = { json: false, help: false };
  const flagMap = {
    "--repo": "repo", "--from": "from", "--to": "to", "--checkout": "checkoutDir",
    "--metrics-file": "metricsFile", "--prs-file": "prsFile",
    "--comments-file": "commentsFile", "--checklist": "checklistPath",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--json") opts.json = true;
    else if (flagMap[arg]) {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      opts[flagMap[arg]] = argv[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cliOpts = parseCliArgs(process.argv.slice(2));
  if (cliOpts.help) {
    process.stdout.write(
      "Usage: node skills/infra-review/scripts/mine-pr-evidence.mjs [--repo <owner/repo>] [--from <ISO>] [--to <ISO>] [--checkout <dir>] [--metrics-file <json>] [--prs-file <json>] [--comments-file <json>] [--checklist <path>] [--json]\n",
    );
  } else {
    const packet = minePrEvidence(cliOpts);
    process.stdout.write(cliOpts.json ? `${JSON.stringify(packet, null, 2)}\n` : formatEvidenceSummary(packet));
  }
}

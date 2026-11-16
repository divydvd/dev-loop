#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const DOMAIN_ORDER = ["concurrency-state", "security-privacy", "ui-a11y"];
const FENCE_RE = /^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$/gm;
const MODAL_RE = /\b(?:must|never|always|required|shall|forbidden)\b|\bdo\s+not\b/gi;
const CMD_LINE_RE = /^\s*(?:\$\s*)?(?:node|npm|npx|pnpm|yarn|git|gh|copilot|claude|gemini|cargo|go|python3?|pytest|gradle|\.\/gradlew|sh|bash|curl)\b/;

const ROLE_FOCUS = {
  "single-reviewer": "Check requirements, source, affected callers, error handling, domain risks, and missing test-matrix cases across the full diff.",
  "arch-correctness": "Check acceptance requirements, caller contracts, error paths, migrations/configuration, and missing test-matrix cases.",
  "concurrency-state": "Check async ordering, cancellation, shared-state races, locks, retries, caching, and lifecycle cleanup.",
  "security-privacy": "Check authentication, authorization bypasses, secrets/tokens, command/query injection, permissions, and personal-data exposure.",
  "ui-a11y": "Check UI state rendering, accessibility semantics/labels, keyboard/screen-reader navigation, reduced motion, and theme contrast.",
};

function sanitizedGitEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return env;
}

const runGit = (cwd, args, encoding = "utf8") =>
  execFileSync("git", args, { cwd, env: sanitizedGitEnv(), encoding, maxBuffer: 32 * 1024 * 1024 });

function resolveRealTarget(targetPath) {
  const tail = [];
  let cur = resolve(targetPath);
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    tail.unshift(relative(parent, cur));
    cur = parent;
  }
  const base = existsSync(cur) ? realpathSync(cur) : cur;
  return tail.length ? resolve(base, ...tail) : base;
}

function isInsideOrEqual(baseRealDir, candidateRealPath) {
  const rel = relative(baseRealDir, candidateRealPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function validateGitRef(ref, flagName) {
  if (typeof ref !== "string" || ref.trim() === "" || ref.startsWith("-")) {
    throw new Error(`Invalid git ref for ${flagName}: ${String(ref)}`);
  }
}

export function isProductionFile(relPath) {
  const p = relPath.replaceAll("\\", "/");
  if (/\.(?:test|spec)\.[^/]+$/i.test(p) || /(?:^|\/)(?:test|tests|__tests__|androidTest)\//.test(p)) return false;
  if (/(?:Test|Tests)\.(?:kt|java|swift)$/.test(p) || /_test\.(?:go|py|rs)$/.test(p) || /(?:^|\/)test_[^/]+\.py$/.test(p)) return false;
  if (/^skills\/[^/]+\/(?:SKILL\.md|scripts\/)/.test(p)) return true;
  if (/^(?:com\.github\.copilot|hooks|\.claude-plugin|\.github\/workflows|\.github\/plugin)\//.test(p)) return true;
  if (/^(?:plugin\.json|gemini-extension\.json|GEMINI\.md|AGENTS\.md|CLAUDE\.md)$/.test(p)) return true;
  if (/^scripts\/[^/]+\.(?:mjs|cjs|js|sh|py)$/.test(p)) return true;
  if (/\.md$/i.test(p) || /^docs\//.test(p)) return false;
  if (/^(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Podfile\.lock|composer\.lock|Gemfile\.lock)$/.test(p)) return false;
  if (/\.(?:lock|sha256)$/i.test(p) || /(?:^|\/)(?:generated|build|dist|out|\.next|coverage)\//.test(p)) return false;
  return true;
}

const matchTokens = (text, re, norm = (s) => s) => JSON.stringify([...text.matchAll(re)].map((m) => norm(m[1] ?? m[0])));

function isHarmlessMarkdownChange(relPath, baseText, headText) {
  const p = relPath.replaceAll("\\", "/");
  if (!/\.md$/i.test(p) || isProductionFile(p) || baseText === null || headText === null) return false;
  if (/^(?:AGENTS|CLAUDE|GEMINI)\.md$/i.test(p) || /(?:review-checklist|regression-matrix)\.md$/i.test(p)) return false;
  if (/^(?:skills|com\.github\.copilot|hooks|\.claude-plugin|\.github)\//.test(p)) return false;
  if (matchTokens(baseText, FENCE_RE) !== matchTokens(headText, FENCE_RE)) return false;
  const baseProse = baseText.replace(FENCE_RE, "");
  const headProse = headText.replace(FENCE_RE, "");
  const normModal = (s) => s.toLowerCase().replace(/\s+/g, " ");
  const checks = [[/`[^`\n]+`/g], [/\]\(([^)]+)\)|https?:\/\/\S+/g], [/\b\d+(?:\.\d+)*\b/g], [/(?:^|\s)(--[a-z0-9-]+)\b/gi], [MODAL_RE, normModal]];
  if (checks.some(([re, fn]) => matchTokens(baseProse, re, fn) !== matchTokens(headProse, re, fn))) return false;
  const bSet = new Set(baseProse.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const hSet = new Set(headProse.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  return ![...[...bSet].filter((l) => !hSet.has(l)), ...[...hSet].filter((l) => !bSet.has(l))].some((l) => CMD_LINE_RE.test(l));
}

const splitSubwords = (text) => text.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ");
const CONC_RAW_RE = /\b(?:async|await|Promise\.all|Worker|Mutex|Semaphore|synchronized|Volatile|Atomic|CoroutineScope|Dispatchers|Flow|StateFlow|SharedFlow|actor|Task\s*\{|DispatchQueue|lockf|retry|backoff|race|debounce|cache)\b/;
const CONC_SPLIT_RE = /\b(?:async|await|Worker|Mutex|Semaphore|synchronized|Volatile|Atomic|CoroutineScope|Dispatchers|StateFlow|SharedFlow|DispatchQueue|lockf|retry|backoff|race|debounce|cache)\b/;
const SEC_RAW_RE = /\b(?:auth|token|secret|password|crypto|cipher|keystore|Keychain|permission|Intent|deeplink|WebView|eval|exec|spawn|sh\s+-c|SELECT\s+.*FROM|sanitize|PII|telemetry|cookie|CORS|CSRF|tls|ssl|allowlist)\b/i;
const SEC_SPLIT_RE = /\b(?:auth|token|secret|password|crypto|cipher|keystore|Keychain|permission|Intent|deeplink|eval|exec|spawn|sanitize|PII|telemetry|cookie|CORS|CSRF|tls|ssl|allowlist)\b/i;

export function detectDomains(changedFiles, diffHunkText) {
  const raw = `${changedFiles.join("\n")}\n${diffHunkText}`;
  const split = splitSubwords(raw);
  const found = new Set();
  if (CONC_RAW_RE.test(raw) || CONC_SPLIT_RE.test(split)) found.add("concurrency-state");
  if (SEC_RAW_RE.test(raw) || SEC_SPLIT_RE.test(split) || /(?:^|[^A-Za-z0-9])WebView\b/i.test(raw)) found.add("security-privacy");
  const uiPath = changedFiles.some((f) => {
    const p = f.replaceAll("\\", "/");
    return /\.(?:tsx|jsx|vue|svelte|css|scss|html)$/i.test(p) || /(?:^|\/)(?:res\/layout|ui)\//.test(p) || /(?:View|Screen|Composable)[^/]*\.kt$/.test(p) || /View[^/]*\.swift$/.test(p);
  });
  const uiHunk = /(?:^|[^A-Za-z0-9_])@Composable\b/.test(raw) || /\b(?:SwiftUI|contentDescription|semantics|accessibilityLabel|TalkBack|VoiceOver|prefers-reduced-motion|darkTheme)\b/.test(raw) || /\b(?:contentDescription|accessibilityLabel|darkTheme)\b/.test(split);
  if (uiPath || uiHunk) found.add("ui-a11y");
  return DOMAIN_ORDER.filter((d) => found.has(d));
}

function extractHeadingSection(markdown, headingName) {
  const escaped = headingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^#{2,3}\\s+${escaped}[ \\t]*$`, "im").exec(markdown);
  if (!match) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const nextHeading = rest.search(/^#{1,3}\s+/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function globToRegExp(pattern) {
  const norm = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  let rx = "^";
  for (let i = 0; i < norm.length; i += 1) {
    if (norm[i] === "*" && norm[i + 1] === "*") { rx += ".*"; i += 1; }
    else if (norm[i] === "*") rx += "[^/]*";
    else rx += "+?^${}()|[]\\.".includes(norm[i]) ? `\\${norm[i]}` : norm[i];
  }
  return new RegExp(`${rx}(?:$|/)`);
}

function parseAgentsProfile(agentsText) {
  const riskyPatterns = [];
  for (const line of extractHeadingSection(agentsText, "Risky areas").split(/\r?\n/)) {
    if (!line.trim().startsWith("-")) continue;
    for (const m of line.matchAll(/`([^`\n]+)`/g)) if (/[/.]/.test(m[1])) riskyPatterns.push(m[1].trim());
    const bare = line.trim().match(/^-\s+([A-Za-z0-9_./*-]+)\s*:/);
    if (bare && /[/.]/.test(bare[1])) riskyPatterns.push(bare[1]);
  }
  const checklistBullets = [];
  for (const line of extractHeadingSection(agentsText, "Review checklist").split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("- ")) checklistBullets.push(t.slice(2).trim());
    else if (checklistBullets.length && t && !t.startsWith("<!--")) checklistBullets[checklistBullets.length - 1] += ` ${t}`;
  }
  return { riskyPatterns: [...new Set(riskyPatterns)], checklistBullets };
}

function parseReviewChecklist(checklistText) {
  const rules = [];
  for (const line of extractHeadingSection(checklistText, "Active rules").split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const c = line.trim().split("|").slice(1, -1).map((s) => s.trim().replace(/^`|`$/g, ""));
    if (c.length >= 3 && !/^(?:Rule ID|---)/i.test(c[0])) rules.push({ id: c[0], domain: c[1], rule: c[2], sourcePrs: c[3] ?? "" });
  }
  return rules;
}

const gitBlobOrNull = (repoRoot, rev, relPath) => { try { return runGit(repoRoot, ["show", `${rev}:${relPath}`], "utf8"); } catch { return null; } };

function parseNumstatZ(raw) {
  const stats = new Map();
  for (const entry of raw.split("\0").filter(Boolean)) {
    const [addStr, delStr, ...rest] = entry.split("\t");
    if (!rest.length) continue;
    stats.set(rest.join("\t"), { added: addStr === "-" ? 1 : Number.parseInt(addStr, 10) || 0, deleted: delStr === "-" ? 1 : Number.parseInt(delStr, 10) || 0 });
  }
  return stats;
}

const extractChangedHunkLines = (diff) =>
  diff.split(/\r?\n/).filter((l) => (l.startsWith("+") && !l.startsWith("+++ ")) || (l.startsWith("-") && !l.startsWith("--- "))).map((l) => l.slice(1)).join("\n");

function renderRolePacket({ role, result, fileStats, agentsBullets, checklistRules }) {
  const applicable = checklistRules.filter((r) => role === "single-reviewer" || r.domain === role || r.domain === "all");
  const files = result.changedFiles.map((f) => {
    const st = fileStats.get(f) ?? { added: 0, deleted: 0 };
    return `- \`${f}\` (+${st.added}/-${st.deleted}${isProductionFile(f) ? ", prod" : ", non-prod"})`;
  });
  const checklistBlock = result.checklistLoaded
    ? (applicable.length ? applicable.map((r) => `- \`${r.id}\` (\`${r.domain}\`): ${r.rule}${r.sourcePrs ? ` [${r.sourcePrs}]` : ""}`).join("\n") : "- (no active rules for this domain)")
    : "- (`docs/testing/review-checklist.md` absent; using `AGENTS.md` checklist above)";
  const riskySuffix = result.matchedRiskyAreas.length ? ` (${result.matchedRiskyAreas.map((a) => `\`${a}\``).join(", ")})` : "";
  return [
    `# Review Packet: \`${role}\``,
    `- **Base ref:** \`${result.base}\` (\`${result.baseSha}\`) | **Diff base:** \`${result.mergeBaseSha}\` | **Reviewed head:** \`${result.head}\``,
    `- **Routing mode:** \`${result.mode}\` | **Production lines changed:** \`${result.prodLinesChanged}\` (total: \`${result.totalLinesChanged}\`) | **Touches risky area:** \`${result.touchesRiskyArea}\`${riskySuffix}`,
    `- **Role focus:** ${ROLE_FOCUS[role] ?? ROLE_FOCUS["single-reviewer"]}`,
    "## Changed files",
    files.length ? files.join("\n") : "- (none)",
    "## Project review checklist (`AGENTS.md`)",
    agentsBullets.length ? agentsBullets.map((b) => `- ${b}`).join("\n") : "- (none listed in `AGENTS.md`)",
    "## Domain checklist rules (`docs/testing/review-checklist.md`)",
    checklistBlock,
    "## Inspection rules",
    "- Read actual changed source files and affected callers in `<= 150`-line slices. Never trust the author's summary alone.",
    "- Inspect the saved test matrix and verify whether required cases in your domain are missing or unexecuted.",
    "## Required JSON output schema",
    "```json",
    `{"role": "${role}", "reviewedHead": "${result.head}", "findings": [{"id": "F-1", "severity": "Critical" | "Important" | "Minor", "domain": "${role}", "file": "path/to/file", "lines": "10-24", "symptom": "Concrete failure", "evidence": "Exact file:line proof", "suggestedFix": "Smallest root-cause fix"}], "missingTestCases": []}`,
    "```",
    "",
  ].join("\n");
}

function renderSkepticJudgePacket({ result, agentsBullets, checklistRules }) {
  const rules = [
    ...(agentsBullets.length ? agentsBullets.map((b) => `- ${b}`) : ["- (none listed in `AGENTS.md`)"]),
    ...checklistRules.map((r) => `- \`${r.id}\` (\`${r.domain}\`): ${r.rule}`),
  ].join("\n");
  return [
    "# Synthesis Packet: `skeptic-judge`",
    `- **Base ref:** \`${result.base}\` (\`${result.baseSha}\`) | **Reviewed head:** \`${result.head}\` | **Selected specialists:** ${result.roles.map((r) => `\`${r}\``).join(", ")}`,
    `- **Production lines changed:** \`${result.prodLinesChanged}\` | **Touches risky area:** \`${result.touchesRiskyArea}\``,
    "## Two-step pass",
    "1. **Advocate filter:** Drop specialist findings that contradict current source code, duplicate another finding, or state personal style preferences without a real bug or maintenance fault.",
    "2. **Skeptic gap check:** Even when specialists return `0` findings, inspect cross-domain boundaries and saved test-matrix gaps; add missed `Critical` or `Important` findings with exact `file:line` evidence.",
    "## Project checklist context",
    rules,
    "## PR body `Reviewer` record",
    `Record \`panel (${result.roles.join(", ")} -> skeptic-judge)\` in \`### Independent agent review\`.`,
    "",
  ].join("\n");
}

export function prepareReviewPanel({ repoRoot, base, head = "HEAD", outDir = null, agentsFile = "AGENTS.md", checklist = "docs/testing/review-checklist.md" }) {
  if (!repoRoot || !existsSync(repoRoot)) throw new Error(`Repository root does not exist: ${String(repoRoot)}`);
  validateGitRef(base, "--base");
  validateGitRef(head, "--head");
  const realRepoRoot = realpathSync(repoRoot);
  const resolvedOutDir = outDir ? resolveRealTarget(outDir) : null;
  if (resolvedOutDir && isInsideOrEqual(realRepoRoot, resolvedOutDir)) {
    throw new Error(`--out-dir must resolve outside --repo-root (got ${resolvedOutDir} inside ${realRepoRoot})`);
  }
  const agentsPath = resolveRealTarget(join(realRepoRoot, agentsFile));
  const checklistPath = resolveRealTarget(join(realRepoRoot, checklist));
  if (!isInsideOrEqual(realRepoRoot, agentsPath)) throw new Error("--agents-file must stay inside --repo-root");
  if (!isInsideOrEqual(realRepoRoot, checklistPath)) throw new Error("--checklist must stay inside --repo-root");

  const baseSha = runGit(realRepoRoot, ["rev-parse", "--verify", `${base}^{commit}`]).trim();
  const currentHeadSha = runGit(realRepoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  const resolveMergeBase = (sha) => { try { return runGit(realRepoRoot, ["merge-base", baseSha, sha]).trim() || baseSha; } catch { return baseSha; } };
  let mergeBaseSha = baseSha;
  let resolvedHead = head;
  let fileStats = new Map();
  let diffHunkText = "";
  const untrackedTextByPath = new Map();

  if (head === "WORKTREE") {
    mergeBaseSha = resolveMergeBase(currentHeadSha);
    fileStats = parseNumstatZ(runGit(realRepoRoot, ["diff", "--numstat", "--no-renames", "-z", mergeBaseSha]));
    const rawDiffText = runGit(realRepoRoot, ["diff", "--no-renames", "-U0", mergeBaseSha]);
    const hash = createHash("sha256").update(`mergeBase:${mergeBaseSha}\n`).update(runGit(realRepoRoot, ["diff", "--binary", "--no-renames", mergeBaseSha], "buffer"));
    const extraHunks = [extractChangedHunkLines(rawDiffText)];
    for (const rel of runGit(realRepoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean).sort()) {
      const full = join(realRepoRoot, rel);
      if (!existsSync(full) || !statSync(full).isFile()) continue;
      const bytes = readFileSync(full);
      hash.update(`\0untracked:${rel}\0`).update(bytes);
      const utf8 = bytes.toString("utf8");
      fileStats.set(rel, { added: utf8 === "" ? 0 : utf8.replace(/\r?\n$/, "").split(/\r?\n/).length, deleted: 0 });
      untrackedTextByPath.set(rel, utf8);
      extraHunks.push(utf8);
    }
    diffHunkText = extraHunks.filter(Boolean).join("\n");
    resolvedHead = `WORKTREE:${hash.digest("hex")}`;
  } else {
    resolvedHead = runGit(realRepoRoot, ["rev-parse", "--verify", `${head}^{commit}`]).trim();
    mergeBaseSha = resolveMergeBase(resolvedHead);
    fileStats = parseNumstatZ(runGit(realRepoRoot, ["diff", "--numstat", "--no-renames", "-z", mergeBaseSha, resolvedHead]));
    diffHunkText = extractChangedHunkLines(runGit(realRepoRoot, ["diff", "--no-renames", "-U0", mergeBaseSha, resolvedHead]));
  }

  const changedFiles = [...fileStats.keys()].sort();
  let totalLinesChanged = 0;
  let prodLinesChanged = 0;
  for (const rel of changedFiles) {
    const delta = fileStats.get(rel).added + fileStats.get(rel).deleted;
    totalLinesChanged += delta;
    if (isProductionFile(rel)) prodLinesChanged += delta;
  }

  const { riskyPatterns, checklistBullets } = parseAgentsProfile(existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "");
  const matchedRiskyAreas = riskyPatterns.filter((pat) => changedFiles.some((f) => globToRegExp(pat).test(f.replaceAll("\\", "/"))));
  const touchesRiskyArea = matchedRiskyAreas.length > 0;
  const checklistLoaded = existsSync(checklistPath);
  const checklistRules = checklistLoaded ? parseReviewChecklist(readFileSync(checklistPath, "utf8")) : [];

  const harmless =
    changedFiles.length === 0 ||
    (!touchesRiskyArea && prodLinesChanged === 0 && changedFiles.every((rel) => {
      const baseText = gitBlobOrNull(realRepoRoot, mergeBaseSha, rel);
      const full = join(realRepoRoot, rel);
      const headText = head === "WORKTREE"
        ? (untrackedTextByPath.get(rel) ?? (existsSync(full) && statSync(full).isFile() ? readFileSync(full, "utf8") : null))
        : gitBlobOrNull(realRepoRoot, resolvedHead, rel);
      return isHarmlessMarkdownChange(rel, baseText, headText);
    }));

  const triggeredDomains = harmless ? [] : detectDomains(changedFiles, diffHunkText);
  let mode = "single";
  let roles = ["single-reviewer"];
  let synthesisJudge = false;
  let judgeRole = null;
  if (harmless) { mode = "exempt"; roles = []; }
  else if (prodLinesChanged > 120 || touchesRiskyArea || triggeredDomains.length >= 2) {
    mode = "panel";
    roles = ["arch-correctness", ...(triggeredDomains.length > 0 ? triggeredDomains : ["security-privacy"])];
    synthesisJudge = true;
    judgeRole = "skeptic-judge";
  }

  const result = {
    repoRoot: realRepoRoot, base, baseSha, mergeBaseSha, headRef: head, head: resolvedHead,
    mode, prodLinesChanged, totalLinesChanged, touchesRiskyArea, matchedRiskyAreas,
    triggeredDomains, roles, synthesisJudge, judgeRole, changedFiles, checklistLoaded, outDir: resolvedOutDir, packets: [],
  };
  if (resolvedOutDir) {
    mkdirSync(resolvedOutDir, { recursive: true });
    for (const role of roles) {
      const p = join(resolvedOutDir, `${role}-packet.md`);
      writeFileSync(p, renderRolePacket({ role, result, fileStats, agentsBullets: checklistBullets, checklistRules }), "utf8");
      result.packets.push(p);
    }
    if (synthesisJudge) {
      const p = join(resolvedOutDir, "skeptic-judge-packet.md");
      writeFileSync(p, renderSkepticJudgePacket({ result, agentsBullets: checklistBullets, checklistRules }), "utf8");
      result.packets.push(p);
    }
    writeFileSync(join(resolvedOutDir, "routing.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

function main() {
  try {
    const opts = {
      "repo-root": { type: "string" }, base: { type: "string" }, head: { type: "string", default: "HEAD" },
      "out-dir": { type: "string" }, "agents-file": { type: "string", default: "AGENTS.md" },
      checklist: { type: "string", default: "docs/testing/review-checklist.md" }, json: { type: "boolean", default: false },
    };
    const { values: v } = parseArgs({ options: opts, strict: true });
    if (!v["repo-root"] || !v.base) {
      throw new Error("Usage: prepare-review-panel.mjs --repo-root <dir> --base <git-ref> [--head <git-ref-or-WORKTREE>] [--out-dir <temp-dir-outside-repo>] [--agents-file <rel-path>] [--checklist <rel-path>] [--json]");
    }
    const r = prepareReviewPanel({ repoRoot: v["repo-root"], base: v.base, head: v.head, outDir: v["out-dir"] ?? null, agentsFile: v["agents-file"], checklist: v.checklist });
    process.stdout.write(v.json ? `${JSON.stringify(r, null, 2)}\n` : `mode=${r.mode} roles=${r.roles.join(",") || "none"} synthesisJudge=${r.synthesisJudge} prodLinesChanged=${r.prodLinesChanged} head=${r.head}\n`);
  } catch (error) {
    process.stderr.write(`prepare-review-panel: ${error.message}\n`);
    process.exit(1);
  }
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)); }
})();
if (isMain) main();

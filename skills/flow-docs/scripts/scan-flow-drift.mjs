#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const CODE_SECTIONS = new Set(["entry points", "sequence", "key files", "tests"]);
const KNOWN_EXTENSIONS = new Set(
  ".kt .kts .java .swift .m .mm .c .cc .cpp .h .hpp .rs .go .py .rb .php .cs .fs .scala .clj .ex .exs .erl .lua .r .dart .ts .tsx .mts .cts .js .jsx .mjs .cjs .vue .svelte .astro .html .css .scss .sass .less .xml .json .jsonc .yaml .yml .toml .ini .cfg .conf .properties .gradle .plist .pbxproj .storyboard .xib .sql .graphql .gql .proto .sh .bash .zsh .ps1 .mdc .md".split(" "),
);
const SLASH_SHORTHANDS = new Set(
  "n/a true/false false/true yes/no no/yes on/off off/on and/or read/write input/output client/server key/value min/max start/stop pass/fail red/green before/after open/close sync/async http/https tcp/udp ci/cd i/o ui/ux r/w".split(" "),
);
const MIME_PREFIX_RE = /^(?:application|text|image|audio|video|multipart|font)\//i;
const GIT_REF_PREFIX_RE = /^(?:origin|upstream|refs\/heads|refs\/tags|refs\/remotes)\//;
const toPosix = (p) => p.replace(/\\/g, "/");

function sanitizedGitEnv() {
  const env = { GIT_TERMINAL_PROMPT: "0" };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("GIT_")) env[k] = v;
  }
  return env;
}

function runGit(repoRootReal, args) {
  return execFileSync("git", ["-C", repoRootReal, ...args], {
    env: sanitizedGitEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function validateGitRef(ref, flagName) {
  if (typeof ref !== "string" || ref.length === 0) throw new Error(`${flagName} must be a non-empty Git ref.`);
  if (ref.startsWith("-") || /\s/.test(ref) || ref.includes("\0")) {
    throw new Error(`Invalid Git ref for ${flagName}: ${JSON.stringify(ref)}`);
  }
}

function isOutsideRoot(rootReal, targetAbs) {
  const rel = toPosix(relative(rootReal, targetAbs));
  return rel === ".." || rel.startsWith("../") || isAbsolute(rel);
}

function safeLstat(targetAbs) {
  try {
    return lstatSync(targetAbs);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return null;
    throw err;
  }
}

function hasEscapingAncestor(repoRootReal, candidateAbs) {
  let cur = dirname(candidateAbs);
  while (!isOutsideRoot(repoRootReal, cur)) {
    if (safeLstat(cur)) {
      try {
        return isOutsideRoot(repoRootReal, realpathSync(cur));
      } catch {
        return true;
      }
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}

function resolveContainedPath(repoRootReal, baseDirAbs, rawRef) {
  if (!rawRef || rawRef.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rawRef)) {
    return { escaped: true, exists: false, isDir: false, repoRelPath: rawRef };
  }
  const candidateAbs = resolve(baseDirAbs, rawRef);
  if (isOutsideRoot(repoRootReal, candidateAbs) || candidateAbs === repoRootReal) {
    return { escaped: true, exists: false, isDir: false, repoRelPath: rawRef };
  }
  const repoRelPath = toPosix(relative(repoRootReal, candidateAbs));
  if (!safeLstat(candidateAbs)) {
    return { escaped: hasEscapingAncestor(repoRootReal, candidateAbs), exists: false, isDir: false, repoRelPath };
  }
  try {
    const realAbs = realpathSync(candidateAbs);
    if (isOutsideRoot(repoRootReal, realAbs) || realAbs === repoRootReal) {
      return { escaped: true, exists: false, isDir: false, repoRelPath };
    }
    return { escaped: false, exists: true, isDir: statSync(realAbs).isDirectory(), repoRelPath };
  } catch {
    return { escaped: false, exists: false, isDir: false, repoRelPath };
  }
}

function validateFlowsDir(repoRootReal, flowsDirRaw) {
  if (typeof flowsDirRaw !== "string" || flowsDirRaw.trim() === "") {
    throw new Error("--flows-dir must be a non-empty relative path.");
  }
  if (isAbsolute(flowsDirRaw) || /^[A-Za-z]:[\\/]/.test(flowsDirRaw)) {
    throw new Error(`--flows-dir must stay inside repoRoot: ${flowsDirRaw}`);
  }
  const normalized = toPosix(flowsDirRaw).replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
  if (!normalized) throw new Error(`--flows-dir escapes repoRoot: ${flowsDirRaw}`);
  const flowsAbs = resolve(repoRootReal, normalized);
  if (isOutsideRoot(repoRootReal, flowsAbs) || flowsAbs === repoRootReal) {
    throw new Error(`--flows-dir escapes repoRoot: ${flowsDirRaw}`);
  }
  if (safeLstat(flowsAbs)) {
    let realFlows;
    try {
      realFlows = realpathSync(flowsAbs);
    } catch {
      throw new Error(`--flows-dir symlink escapes repoRoot: ${flowsDirRaw}`);
    }
    if (isOutsideRoot(repoRootReal, realFlows) || realFlows === repoRootReal) {
      throw new Error(`--flows-dir symlink escapes repoRoot: ${flowsDirRaw}`);
    }
  } else if (hasEscapingAncestor(repoRootReal, flowsAbs)) {
    throw new Error(`--flows-dir symlink escapes repoRoot: ${flowsDirRaw}`);
  }
  return { flowsDir: toPosix(relative(repoRootReal, flowsAbs)), flowsAbs };
}

function normalizeCodePathToken(rawToken) {
  const trimmed = rawToken.trim();
  if (!trimmed || /\s/.test(trimmed) || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return null;
  if (/[<>]/.test(trimmed) || /^[-/~]/.test(trimmed) || /[*?[\]{}]/.test(trimmed)) return null;

  const cleaned = toPosix(trimmed)
    .replace(/(\.[A-Za-z0-9]+)(?:#[^/\s]+|:\d+(?::\d+)?)$/, "$1")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+$/, "");
  if (!cleaned || cleaned === "." || cleaned === ".." || !/[A-Za-z]/.test(cleaned)) return null;
  if (SLASH_SHORTHANDS.has(cleaned.toLowerCase()) || /^\d+(?:\/\d+)+$/.test(cleaned)) return null;
  if (MIME_PREFIX_RE.test(cleaned) || GIT_REF_PREFIX_RE.test(cleaned)) return null;
  if (!KNOWN_EXTENSIONS.has(extname(cleaned).toLowerCase()) && !cleaned.includes("/")) return null;

  const segments = cleaned.split("/");
  if (segments.some((seg) => !seg || (seg !== ".." && !/^[A-Za-z0-9._-]+$/.test(seg)))) return null;
  return cleaned;
}

function parseDocStructure(markdown) {
  const sections = new Map();
  let current = "";
  let fence = null;
  let lastVerifiedDoc = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      if (!fence) fence = fm[1];
      else if (fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    } else if (lastVerifiedDoc === null) {
      lastVerifiedDoc = line.match(/^Last verified:\s*(.+?)\.?\s*$/)?.[1]?.trim() ?? null;
    }
  }
  return { lastVerifiedDoc, sections };
}

function parseIndexFile(repoRootReal, flowsDir, flowsAbs, flowsReal, indexText) {
  const indexedDocs = new Map();
  const indexIssues = [];

  for (const line of indexText.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 4 || (cells[0].toLowerCase() === "flow" && cells[1].toLowerCase() === "doc")) continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;

    const rawTarget = cells[1].match(/\[[^\]]+\]\(([^)\s]+)\)/)?.[1]?.split("#")[0];
    if (!rawTarget) continue;
    const lastVerifiedIndex = cells[3].replace(/\.$/, "").trim();
    const resolved = resolveContainedPath(repoRootReal, flowsAbs, rawTarget);
    const candidateAbs = resolve(flowsAbs, rawTarget);
    const escapesFlows = !resolved.exists || isOutsideRoot(flowsReal, realpathSync(candidateAbs));

    if (resolved.escaped || escapesFlows || resolved.isDir) {
      indexIssues.push({ kind: "missing_indexed_doc", doc: resolved.escaped ? `${flowsDir}/${rawTarget}` : resolved.repoRelPath });
    } else {
      indexedDocs.set(resolved.repoRelPath, { docRelPath: resolved.repoRelPath, docAbs: candidateAbs, lastVerifiedIndex });
    }
  }
  return { indexedDocs, indexIssues };
}

function resolveDiffSet(repoRootReal, changedFrom, changedTo) {
  validateGitRef(changedFrom, "--changed-from");
  validateGitRef(changedTo, "--changed-to");
  for (const [diffMode, sep] of [["three_dot", "..."], ["two_dot", ".."]]) {
    try {
      const out = runGit(repoRootReal, ["diff", "--no-renames", "--name-only", `${changedFrom}${sep}${changedTo}`, "--"]);
      return { diffMode, changedFiles: new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) };
    } catch (err) {
      if (diffMode === "two_dot") {
        throw new Error(`Failed to compute git diff between ${changedFrom} and ${changedTo}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

export function scanFlowDrift({ repoRoot = ".", flowsDir: flowsDirOption = "docs/flows", changedFrom = null, changedTo = "HEAD" } = {}) {
  const repoRootAbs = resolve(repoRoot);
  if (!existsSync(repoRootAbs)) throw new Error(`Repository root does not exist: ${repoRoot}`);
  const repoRootReal = realpathSync(repoRootAbs);
  const { flowsDir, flowsAbs } = validateFlowsDir(repoRootReal, flowsDirOption);

  const indexAbs = join(flowsAbs, "INDEX.md");
  if (!safeLstat(indexAbs)) {
    return { status: "no_flows", flowsDir, docs: [], indexIssues: [], unupdatedImpactedDocs: [] };
  }
  const flowsReal = realpathSync(flowsAbs);
  const indexReal = realpathSync(indexAbs);
  if (isOutsideRoot(repoRootReal, indexReal) || isOutsideRoot(flowsReal, indexReal)) {
    throw new Error(`Flow index symlink escapes flowsDir: ${flowsDir}/INDEX.md`);
  }

  const diffContext = changedFrom !== null && changedFrom !== undefined ? resolveDiffSet(repoRootReal, changedFrom, changedTo) : null;
  const { indexedDocs, indexIssues } = parseIndexFile(repoRootReal, flowsDir, flowsAbs, flowsReal, readFileSync(indexReal, "utf8"));
  const docsToScan = new Map(indexedDocs);
  const unindexedSet = new Set();

  for (const entry of readdirSync(flowsAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "INDEX.md" || !entry.name.endsWith(".md")) continue;
    const entryAbs = join(flowsAbs, entry.name);
    const resolved = resolveContainedPath(repoRootReal, flowsAbs, entry.name);
    if (resolved.escaped || !resolved.exists || resolved.isDir || isOutsideRoot(flowsReal, realpathSync(entryAbs))) continue;
    if (docsToScan.has(resolved.repoRelPath)) continue;
    indexIssues.push({ kind: "unindexed_flow_doc", doc: resolved.repoRelPath });
    unindexedSet.add(resolved.repoRelPath);
    docsToScan.set(resolved.repoRelPath, { docRelPath: resolved.repoRelPath, docAbs: entryAbs, lastVerifiedIndex: null });
  }

  const docs = [];
  const unupdatedImpactedDocs = [];

  for (const { docRelPath, docAbs, lastVerifiedIndex } of docsToScan.values()) {
    const { lastVerifiedDoc, sections } = parseDocStructure(readFileSync(docAbs, "utf8"));
    const unverified = !lastVerifiedDoc || lastVerifiedDoc.toLowerCase() === "not yet";

    const docIndexIssues = unindexedSet.has(docRelPath) ? ["unindexed_flow_doc"] : [];
    if (lastVerifiedIndex !== null && lastVerifiedDoc !== lastVerifiedIndex) {
      docIndexIssues.push("verified_date_mismatch");
      indexIssues.push({ kind: "verified_date_mismatch", doc: docRelPath, docValue: lastVerifiedDoc, indexValue: lastVerifiedIndex });
    }

    const keyFilesSet = new Set();
    const keyFileMeta = new Map();
    const deadRefsSet = new Set();

    for (const [secName, secLines] of sections.entries()) {
      if (!CODE_SECTIONS.has(secName)) continue;
      for (const line of secLines) {
        for (const match of line.matchAll(/`([^`\r\n]+)`/g)) {
          const token = normalizeCodePathToken(match[1]);
          if (!token) continue;
          const resolved = resolveContainedPath(repoRootReal, repoRootReal, token);
          if (resolved.escaped) {
            deadRefsSet.add(resolved.repoRelPath);
          } else {
            keyFilesSet.add(resolved.repoRelPath);
            keyFileMeta.set(resolved.repoRelPath, resolved);
            if (!resolved.exists) deadRefsSet.add(resolved.repoRelPath);
          }
        }
      }
    }

    for (const line of sections.get("related flows") ?? []) {
      for (const match of line.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
        const rawTarget = match[1].split("#")[0];
        if (!rawTarget || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawTarget) || !rawTarget.endsWith(".md")) continue;
        const resolved = resolveContainedPath(repoRootReal, dirname(docAbs), rawTarget);
        if (resolved.escaped || !resolved.exists || resolved.isDir) {
          deadRefsSet.add(resolved.escaped ? rawTarget : resolved.repoRelPath);
        }
      }
    }

    const keyFiles = [...keyFilesSet];
    const existingKeyFiles = keyFiles.filter((p) => keyFileMeta.get(p)?.exists);
    const deadRefs = [...deadRefsSet];

    let docLastCommit = null;
    let commitsTouchingKeyFiles = 0;
    let recentCommits = [];
    try {
      docLastCommit = runGit(repoRootReal, ["log", "-1", "--format=%H", "--", docRelPath]).trim() || null;
      if (docLastCommit && existingKeyFiles.length > 0) {
        const logOut = runGit(repoRootReal, ["log", "--oneline", `${docLastCommit}..HEAD`, "--", ...existingKeyFiles]);
        const commitLines = logOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        commitsTouchingKeyFiles = commitLines.length;
        recentCommits = commitLines.slice(0, 5);
      }
    } catch {
      // Non-Git directories or orphan histories keep commit churn at 0
    }

    const issues = [...deadRefs.map((ref) => `dead_ref:${ref}`), ...docIndexIssues, ...(unverified ? ["unverified_marker"] : [])];
    const issueCount = deadRefs.length + docIndexIssues.length + (unverified ? 1 : 0);
    const driftScore = Math.round((3 * Math.sqrt(commitsTouchingKeyFiles) + 5 * issueCount) * 10) / 10;

    let diffStatus = "untouched";
    if (diffContext) {
      const impacted = keyFiles.some((kf) => {
        if (diffContext.changedFiles.has(kf)) return true;
        const meta = keyFileMeta.get(kf);
        if (meta && !meta.isDir && meta.exists) return false;
        const prefix = `${kf}/`;
        for (const changed of diffContext.changedFiles) {
          if (changed.startsWith(prefix)) return true;
        }
        return false;
      });
      if (impacted) {
        diffStatus = diffContext.changedFiles.has(docRelPath) ? "impacted_updated" : "impacted_unupdated";
        if (diffStatus === "impacted_unupdated") unupdatedImpactedDocs.push(docRelPath);
      }
    }

    docs.push({ docPath: docRelPath, lastVerifiedDoc, lastVerifiedIndex, docLastCommit, keyFiles, deadRefs, commitsTouchingKeyFiles, recentCommits, issues, driftScore, diffStatus });
  }

  docs.sort((a, b) => b.driftScore - a.driftScore || a.docPath.localeCompare(b.docPath));
  unupdatedImpactedDocs.sort((a, b) => a.localeCompare(b));
  const diffMeta = diffContext ? { changedFrom, changedTo, diffMode: diffContext.diffMode } : {};
  return { status: "ok", flowsDir, ...diffMeta, indexIssues, unupdatedImpactedDocs, docs };
}

function formatTextReport(report) {
  if (report.status === "no_flows") return `Flow drift scan: no_flows (${report.flowsDir}/INDEX.md not found)\n`;
  const lines = [`Flow drift scan: ${report.docs.length} doc(s) in ${report.flowsDir}`];
  if (report.changedFrom) lines.push(`Diff range: ${report.changedFrom} -> ${report.changedTo} (${report.diffMode})`);
  if (report.indexIssues.length > 0) lines.push(`Index issues (${report.indexIssues.length}):`, ...report.indexIssues.map((i) => `  - ${i.kind}: ${i.doc}`));
  for (const doc of report.docs) {
    lines.push(`- ${doc.docPath}: score=${doc.driftScore} commits=${doc.commitsTouchingKeyFiles} diff=${doc.diffStatus}${doc.issues.length ? ` issues=[${doc.issues.join(", ")}]` : ""}`);
  }
  if (report.unupdatedImpactedDocs.length > 0) lines.push(`Unupdated impacted docs: ${report.unupdatedImpactedDocs.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = {
      "repo-root": { type: "string", default: "." },
      "flows-dir": { type: "string", default: "docs/flows" },
      "changed-from": { type: "string" },
      "changed-to": { type: "string", default: "HEAD" },
      json: { type: "boolean", default: false },
      "fail-on-unupdated": { type: "boolean", default: false },
    };
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options });
    const report = scanFlowDrift({ repoRoot: values["repo-root"], flowsDir: values["flows-dir"], changedFrom: values["changed-from"] ?? null, changedTo: values["changed-to"] });
    process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : formatTextReport(report));
    if (values["fail-on-unupdated"] && report.unupdatedImpactedDocs.length > 0) process.exitCode = 1;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return resolve(process.argv[1]) === fileURLToPath(import.meta.url); }
})();

if (isDirectRun) main();

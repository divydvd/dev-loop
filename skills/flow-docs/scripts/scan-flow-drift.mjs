#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const CODE_SECTIONS = new Set(["entry points", "sequence", "key files", "tests"]);

const KNOWN_EXTENSIONS = new Set([
  ".kt", ".kts", ".java", ".swift", ".m", ".mm", ".c", ".cc", ".cpp", ".h", ".hpp",
  ".rs", ".go", ".py", ".rb", ".php", ".cs", ".fs", ".scala", ".clj", ".ex", ".exs",
  ".erl", ".lua", ".r", ".dart", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs",
  ".cjs", ".vue", ".svelte", ".astro", ".html", ".css", ".scss", ".sass", ".less",
  ".xml", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".properties", ".gradle", ".plist", ".pbxproj", ".storyboard", ".xib", ".sql",
  ".graphql", ".gql", ".proto", ".sh", ".bash", ".zsh", ".ps1", ".mdc", ".md",
]);

const SLASH_SHORTHANDS = new Set([
  "n/a", "true/false", "false/true", "yes/no", "no/yes", "on/off", "off/on",
  "and/or", "read/write", "input/output", "client/server", "key/value", "min/max",
  "start/stop", "pass/fail", "red/green", "before/after", "open/close", "sync/async",
  "http/https", "tcp/udp", "ci/cd", "i/o", "ui/ux", "r/w",
]);

const MIME_PREFIX_RE = /^(?:application|text|image|audio|video|multipart|font)\//i;
const GIT_REF_PREFIX_RE = /^(?:origin|upstream|refs\/heads|refs\/tags|refs\/remotes)\//;

function sanitizedGitEnv() {
  const env = {
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("GIT_")) {
      env[k] = v;
    }
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
  if (typeof ref !== "string" || ref.length === 0) {
    throw new Error(`${flagName} must be a non-empty Git ref.`);
  }
  if (ref.startsWith("-") || /\s/.test(ref) || ref.includes("\0")) {
    throw new Error(`Invalid Git ref for ${flagName}: ${JSON.stringify(ref)}`);
  }
}

function isOutsideRoot(rootReal, targetAbs) {
  const rel = relative(rootReal, targetAbs).replace(/\\/g, "/");
  return rel === ".." || rel.startsWith("../") || isAbsolute(rel);
}

function hasEscapingAncestor(repoRootReal, candidateAbs) {
  let cur = dirname(candidateAbs);
  while (!isOutsideRoot(repoRootReal, cur)) {
    if (existsSync(cur)) {
      let realCur;
      try {
        realCur = realpathSync(cur);
      } catch {
        return true;
      }
      if (isOutsideRoot(repoRootReal, realCur)) {
        return true;
      }
      return false;
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
  if (isOutsideRoot(repoRootReal, candidateAbs)) {
    return { escaped: true, exists: false, isDir: false, repoRelPath: rawRef };
  }
  const repoRelPath = relative(repoRootReal, candidateAbs).replace(/\\/g, "/");
  const lstat = lstatSync(candidateAbs, { throwIfNoEntry: false });
  if (!lstat) {
    if (hasEscapingAncestor(repoRootReal, candidateAbs)) {
      return { escaped: true, exists: false, isDir: false, repoRelPath };
    }
    return { escaped: false, exists: false, isDir: false, repoRelPath };
  }
  let realAbs;
  try {
    realAbs = realpathSync(candidateAbs);
  } catch {
    return { escaped: false, exists: false, isDir: false, repoRelPath };
  }
  if (isOutsideRoot(repoRootReal, realAbs)) {
    return { escaped: true, exists: false, isDir: false, repoRelPath };
  }
  const st = statSync(realAbs);
  return { escaped: false, exists: true, isDir: st.isDirectory(), repoRelPath };
}

function validateFlowsDir(repoRootReal, flowsDirRaw) {
  if (typeof flowsDirRaw !== "string" || flowsDirRaw.trim() === "") {
    throw new Error("--flows-dir must be a non-empty relative path.");
  }
  if (isAbsolute(flowsDirRaw) || /^[A-Za-z]:[\\/]/.test(flowsDirRaw)) {
    throw new Error(`--flows-dir must stay inside repoRoot: ${flowsDirRaw}`);
  }
  const normalized = flowsDirRaw.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/\/+$/, "") || "docs/flows";
  const flowsAbs = resolve(repoRootReal, normalized);
  if (isOutsideRoot(repoRootReal, flowsAbs) || flowsAbs === repoRootReal) {
    throw new Error(`--flows-dir escapes repoRoot: ${flowsDirRaw}`);
  }
  if (existsSync(flowsAbs)) {
    const realFlows = realpathSync(flowsAbs);
    if (isOutsideRoot(repoRootReal, realFlows)) {
      throw new Error(`--flows-dir symlink escapes repoRoot: ${flowsDirRaw}`);
    }
  }
  const repoRelFlows = relative(repoRootReal, flowsAbs).replace(/\\/g, "/");
  return { flowsDir: repoRelFlows, flowsAbs };
}

function normalizeCodePathToken(rawToken) {
  const trimmed = rawToken.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return null;
  if (/[<>]/.test(trimmed)) return null;
  if (trimmed.startsWith("-") || trimmed.startsWith("/") || trimmed.startsWith("~")) return null;
  if (/[*?[\]{}]/.test(trimmed)) return null;

  let cleaned = trimmed.replace(/\\/g, "/");
  cleaned = cleaned.replace(/(\.[A-Za-z0-9]+)(?:#[^/\s]+|:\d+(?::\d+)?)$/, "$1");
  cleaned = cleaned.replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return null;

  const lower = cleaned.toLowerCase();
  if (SLASH_SHORTHANDS.has(lower)) return null;
  if (MIME_PREFIX_RE.test(cleaned) || GIT_REF_PREFIX_RE.test(cleaned)) return null;
  if (/^\d+(?:\/\d+)+$/.test(cleaned)) return null;

  const ext = extname(cleaned).toLowerCase();
  const hasKnownExt = KNOWN_EXTENSIONS.has(ext);
  const hasSlash = cleaned.includes("/");
  if (!hasKnownExt && !hasSlash) return null;

  const segments = cleaned.split("/");
  if (segments.some((seg) => seg.length === 0)) return null;
  for (const seg of segments) {
    if (seg === "..") continue;
    if (!/^[A-Za-z0-9._-]+$/.test(seg)) return null;
  }
  if (!/[A-Za-z]/.test(cleaned)) return null;

  return cleaned;
}

function splitMarkdownSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = new Map();
  let current = "";
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading) {
        current = heading[1].trim().toLowerCase();
        if (!sections.has(current)) sections.set(current, []);
        continue;
      }
      if (current) {
        sections.get(current).push(line);
      }
    }
  }
  return sections;
}

function parseIndexFile(repoRootReal, flowsDir, flowsAbs, indexText) {
  const flowsReal = realpathSync(flowsAbs);
  const indexedDocs = new Map();
  const indexIssues = [];

  for (const line of indexText.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[0].toLowerCase() === "flow" && cells[1].toLowerCase() === "doc") continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;

    const linkMatch = cells[1].match(/\[[^\]]+\]\(([^)\s]+)\)/);
    if (!linkMatch) continue;
    const rawTarget = linkMatch[1].split("#")[0];
    if (!rawTarget) continue;

    const lastVerifiedIndex = cells[3].replace(/\.$/, "").trim();
    const resolved = resolveContainedPath(repoRootReal, flowsAbs, rawTarget);
    const candidateAbs = resolve(flowsAbs, rawTarget);
    const escapesFlowsDir = isOutsideRoot(flowsReal, candidateAbs);

    if (resolved.escaped || escapesFlowsDir || !resolved.exists || resolved.isDir) {
      const issueDoc = resolved.escaped ? `${flowsDir}/${rawTarget}` : resolved.repoRelPath;
      indexIssues.push({ kind: "missing_indexed_doc", doc: issueDoc });
      continue;
    }

    indexedDocs.set(resolved.repoRelPath, {
      docRelPath: resolved.repoRelPath,
      docAbs: candidateAbs,
      lastVerifiedIndex,
    });
  }

  return { indexedDocs, indexIssues };
}

function resolveDiffSet(repoRootReal, changedFrom, changedTo) {
  validateGitRef(changedFrom, "--changed-from");
  validateGitRef(changedTo, "--changed-to");

  try {
    const out = runGit(repoRootReal, ["diff", "--name-only", `${changedFrom}...${changedTo}`, "--"]);
    const files = new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    return { diffMode: "three_dot", changedFiles: files };
  } catch {
    // Fallback to two-dot diff when refs have no merge-base or shallow fetch lacks merge-base
  }

  try {
    const out = runGit(repoRootReal, ["diff", "--name-only", `${changedFrom}..${changedTo}`, "--"]);
    const files = new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    return { diffMode: "two_dot", changedFiles: files };
  } catch (err) {
    throw new Error(
      `Failed to compute git diff between ${changedFrom} and ${changedTo}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function scanFlowDrift({
  repoRoot = ".",
  flowsDir: flowsDirOption = "docs/flows",
  changedFrom = null,
  changedTo = "HEAD",
} = {}) {
  const repoRootAbs = resolve(repoRoot);
  if (!existsSync(repoRootAbs)) {
    throw new Error(`Repository root does not exist: ${repoRoot}`);
  }
  const repoRootReal = realpathSync(repoRootAbs);
  const { flowsDir, flowsAbs } = validateFlowsDir(repoRootReal, flowsDirOption);

  const indexAbs = join(flowsAbs, "INDEX.md");
  const indexLstat = lstatSync(indexAbs, { throwIfNoEntry: false });
  if (!indexLstat) {
    return {
      status: "no_flows",
      flowsDir,
      docs: [],
      indexIssues: [],
      unupdatedImpactedDocs: [],
    };
  }
  const indexReal = realpathSync(indexAbs);
  if (isOutsideRoot(repoRootReal, indexReal)) {
    throw new Error(`Flow index symlink escapes repoRoot: ${flowsDir}/INDEX.md`);
  }

  const diffContext =
    changedFrom !== null && changedFrom !== undefined
      ? resolveDiffSet(repoRootReal, changedFrom, changedTo)
      : null;

  const indexText = readFileSync(indexReal, "utf8");
  const { indexedDocs, indexIssues } = parseIndexFile(repoRootReal, flowsDir, flowsAbs, indexText);

  const docsToScan = new Map(indexedDocs);
  const unindexedSet = new Set();

  const entries = readdirSync(flowsAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === "INDEX.md" || !entry.name.endsWith(".md")) continue;
    const resolved = resolveContainedPath(repoRootReal, flowsAbs, entry.name);
    if (resolved.escaped || !resolved.exists || resolved.isDir) continue;
    if (!docsToScan.has(resolved.repoRelPath)) {
      indexIssues.push({ kind: "unindexed_flow_doc", doc: resolved.repoRelPath });
      unindexedSet.add(resolved.repoRelPath);
      docsToScan.set(resolved.repoRelPath, {
        docRelPath: resolved.repoRelPath,
        docAbs: join(flowsAbs, entry.name),
        lastVerifiedIndex: null,
      });
    }
  }

  const docs = [];
  const unupdatedImpactedDocs = [];

  for (const { docRelPath, docAbs, lastVerifiedIndex } of docsToScan.values()) {
    const content = readFileSync(docAbs, "utf8");
    const lvMatch = content.match(/^Last verified:\s*(.+?)\.?\s*$/m);
    const lastVerifiedDoc = lvMatch ? lvMatch[1].trim() : null;
    const unverified = !lastVerifiedDoc || lastVerifiedDoc.toLowerCase() === "not yet";

    const docIndexIssues = [];
    if (unindexedSet.has(docRelPath)) {
      docIndexIssues.push("unindexed_flow_doc");
    }
    if (lastVerifiedIndex !== null && lastVerifiedDoc !== lastVerifiedIndex) {
      docIndexIssues.push("verified_date_mismatch");
      indexIssues.push({
        kind: "verified_date_mismatch",
        doc: docRelPath,
        docValue: lastVerifiedDoc,
        indexValue: lastVerifiedIndex,
      });
    }

    const sections = splitMarkdownSections(content);
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
            continue;
          }
          keyFilesSet.add(resolved.repoRelPath);
          keyFileMeta.set(resolved.repoRelPath, resolved);
          if (!resolved.exists) {
            deadRefsSet.add(resolved.repoRelPath);
          }
        }
      }
    }

    const relatedLines = sections.get("related flows") ?? [];
    for (const line of relatedLines) {
      for (const match of line.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
        const rawTarget = match[1].split("#")[0];
        if (!rawTarget || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawTarget) || !rawTarget.endsWith(".md")) {
          continue;
        }
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
    try {
      const sha = runGit(repoRootReal, ["log", "-1", "--format=%H", "--", docRelPath]).trim();
      docLastCommit = sha || null;
    } catch {
      docLastCommit = null;
    }

    let commitsTouchingKeyFiles = 0;
    let recentCommits = [];
    if (docLastCommit && existingKeyFiles.length > 0) {
      try {
        const logOut = runGit(repoRootReal, [
          "log",
          "--oneline",
          `${docLastCommit}..HEAD`,
          "--",
          ...existingKeyFiles,
        ]);
        const commitLines = logOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        commitsTouchingKeyFiles = commitLines.length;
        recentCommits = commitLines.slice(0, 5);
      } catch {
        commitsTouchingKeyFiles = 0;
        recentCommits = [];
      }
    }

    const issues = [
      ...deadRefs.map((ref) => `dead_ref:${ref}`),
      ...docIndexIssues,
      ...(unverified ? ["unverified_marker"] : []),
    ];
    const issueCount = deadRefs.length + docIndexIssues.length + (unverified ? 1 : 0);
    const driftScore = Math.round((3 * Math.sqrt(commitsTouchingKeyFiles) + 5 * issueCount) * 10) / 10;

    let diffStatus = "untouched";
    if (diffContext) {
      let impacted = false;
      for (const kf of keyFiles) {
        const meta = keyFileMeta.get(kf);
        if (diffContext.changedFiles.has(kf)) {
          impacted = true;
          break;
        }
        if (!meta || meta.isDir || !meta.exists) {
          const prefix = `${kf}/`;
          for (const changed of diffContext.changedFiles) {
            if (changed.startsWith(prefix)) {
              impacted = true;
              break;
            }
          }
          if (impacted) break;
        }
      }
      if (impacted) {
        if (diffContext.changedFiles.has(docRelPath)) {
          diffStatus = "impacted_updated";
        } else {
          diffStatus = "impacted_unupdated";
          unupdatedImpactedDocs.push(docRelPath);
        }
      }
    }

    docs.push({
      docPath: docRelPath,
      lastVerifiedDoc,
      lastVerifiedIndex,
      docLastCommit,
      keyFiles,
      deadRefs,
      commitsTouchingKeyFiles,
      recentCommits,
      issues,
      driftScore,
      diffStatus,
    });
  }

  docs.sort((a, b) => {
    if (b.driftScore !== a.driftScore) return b.driftScore - a.driftScore;
    return a.docPath.localeCompare(b.docPath);
  });
  unupdatedImpactedDocs.sort((a, b) => a.localeCompare(b));

  const out = {
    status: "ok",
    flowsDir,
    ...(diffContext
      ? {
          changedFrom,
          changedTo,
          diffMode: diffContext.diffMode,
        }
      : {}),
    indexIssues,
    unupdatedImpactedDocs,
    docs,
  };
  return out;
}

function formatTextReport(report) {
  if (report.status === "no_flows") {
    return `Flow drift scan: no_flows (${report.flowsDir}/INDEX.md not found)\n`;
  }
  const lines = [`Flow drift scan: ${report.docs.length} doc(s) in ${report.flowsDir}`];
  if (report.changedFrom) {
    lines.push(`Diff range: ${report.changedFrom} -> ${report.changedTo} (${report.diffMode})`);
  }
  if (report.indexIssues.length > 0) {
    lines.push(`Index issues (${report.indexIssues.length}):`);
    for (const issue of report.indexIssues) {
      lines.push(`  - ${issue.kind}: ${issue.doc}`);
    }
  }
  for (const doc of report.docs) {
    lines.push(
      `- ${doc.docPath}: score=${doc.driftScore} commits=${doc.commitsTouchingKeyFiles} diff=${doc.diffStatus}` +
        (doc.issues.length > 0 ? ` issues=[${doc.issues.join(", ")}]` : ""),
    );
  }
  if (report.unupdatedImpactedDocs.length > 0) {
    lines.push(`Unupdated impacted docs: ${report.unupdatedImpactedDocs.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        "repo-root": { type: "string", default: "." },
        "flows-dir": { type: "string", default: "docs/flows" },
        "changed-from": { type: "string" },
        "changed-to": { type: "string", default: "HEAD" },
        json: { type: "boolean", default: false },
        "fail-on-unupdated": { type: "boolean", default: false },
      },
    });
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const report = scanFlowDrift({
      repoRoot: parsed.values["repo-root"],
      flowsDir: parsed.values["flows-dir"],
      changedFrom: parsed.values["changed-from"] ?? null,
      changedTo: parsed.values["changed-to"],
    });
    if (parsed.values.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatTextReport(report));
    }
    if (parsed.values["fail-on-unupdated"] && report.unupdatedImpactedDocs.length > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  (() => {
    try {
      return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
      return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    }
  })();

if (isDirectRun) {
  main();
}

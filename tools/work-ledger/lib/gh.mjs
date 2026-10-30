import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { normRepo } from "./classify.mjs";

const GH_TIMEOUT_MS = 8000;
const GIT_TIMEOUT_MS = 4000;

function isExec(p) {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}

function versionKey(dir) {
  const m = dir.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) : 0;
}

/** Find a gh binary. The extension process may have a short PATH, so also try known places. */
export function findBinary(name, extra = []) {
  const dirs = [...extra, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", ...String(process.env.PATH || "").split(path.delimiter)];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, name);
    if (isExec(p)) return p;
  }
  return null;
}

export function findGh() {
  if (process.env.WORK_LEDGER_GH && isExec(process.env.WORK_LEDGER_GH)) return process.env.WORK_LEDGER_GH;
  const found = findBinary("gh");
  if (found) return found;
  const cache = path.join(os.homedir(), "Library", "Caches");
  try {
    const dirs = fs.readdirSync(cache).filter((d) => d.startsWith("copilot-desktop-gh-")).sort((a, b) => versionKey(b) - versionKey(a));
    for (const d of dirs) { const p = path.join(cache, d, "gh"); if (isExec(p)) return p; }
  } catch { /* no cache dir */ }
  return null;
}

export function run(bin, args, { cwd, timeoutMs = GH_TIMEOUT_MS, env } = {}) {
  return new Promise((resolve) => {
    if (!bin) { resolve({ code: -1, stdout: "", stderr: "binary not found" }); return; }
    execFile(bin, args, { cwd: cwd || undefined, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: env || { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" } }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === "number" ? err.code : -1) : 0;
      resolve({ code, stdout: String(stdout || ""), stderr: String(stderr || (err && err.message) || "") });
    });
  });
}

function existingDir(d) {
  try { return d && fs.statSync(d).isDirectory() ? d : null; } catch { return null; }
}

/** Real lookups. Every function returns null on failure; callers decide fail-open or fail-closed. */
export function makeLookups({ gh = findGh(), git = findBinary("git") || "/usr/bin/git" } = {}) {
  const ghJson = async (args, cwd) => {
    const r = await run(gh, args, { cwd: existingDir(cwd) });
    if (r.code !== 0) return null;
    try { return JSON.parse(r.stdout); } catch { return null; }
  };
  const gitOut = async (cwd, args) => {
    const dir = existingDir(cwd);
    if (!dir) return null;
    const r = await run(git, ["-C", dir, ...args], { timeoutMs: GIT_TIMEOUT_MS });
    return r.code === 0 ? r.stdout.trim() : null;
  };
  const pr = (d) => (d && d.headRefOid ? { pr: d.number, sha: d.headRefOid, state: d.state, branch: d.headRefName, repo: d.url ? normRepo(d.url.replace(/\/pull\/\d+.*$/, "")) : null } : null);
  const FIELDS = "number,headRefOid,state,headRefName,url";
  return {
    gh,
    async prHead(repo, number) {
      if (!repo || !number) return null;
      return pr(await ghJson(["pr", "view", String(number), "-R", repo, "--json", FIELDS]));
    },
    async prForBranch(repo, branch, cwd) {
      if (!branch) return null;
      return pr(await ghJson(["pr", "view", branch, ...(repo ? ["-R", repo] : []), "--json", FIELDS], cwd));
    },
    async prCurrent(cwd) {
      if (!existingDir(cwd)) return null;
      return pr(await ghJson(["pr", "view", "--json", FIELDS], cwd));
    },
    async runWorkflow(repo, runId) {
      const d = await ghJson(["run", "view", String(runId), ...(repo ? ["-R", repo] : []), "--json", "workflowName,name"]);
      return d ? d.workflowName || d.name || null : null;
    },
    async jobWorkflow(repo, jobId) {
      if (!repo) return null;
      const d = await ghJson(["api", `repos/${repo}/actions/jobs/${jobId}`]);
      return d ? d.workflow_name || null : null;
    },
    gitBranch: (cwd) => gitOut(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    gitHead: (cwd) => gitOut(cwd, ["rev-parse", "HEAD"]),
    gitRoot: (cwd) => gitOut(cwd, ["rev-parse", "--show-toplevel"]),
    async gitTracked(cwd, file) {
      return (await gitOut(cwd, ["ls-files", "--error-unmatch", "--", file])) !== null;
    },
    async gitReviewedClean(cwd) {
      const [status, flags, entries] = await Promise.all([
        gitOut(cwd, ["-c", "core.fsmonitor=false", "-c", "core.ignoreStat=false", "-c", "core.untrackedCache=false", "status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"]),
        gitOut(cwd, ["ls-files", "-v", "-z"]),
        gitOut(cwd, ["ls-files", "--stage", "-z"]),
      ]);
      if (status !== "" || flags === null || entries === null || flags.split("\0").some(line => /^[a-zS] /.test(line))) return false;
      // Hash actual bytes: Git status can trust unchanged size and timestamps.
      for (const entry of entries.split("\0").filter(Boolean)) {
        const m = entry.match(/^(100644|100755) ([a-f0-9]{40}) 0\t([\s\S]+)$/);
        if (!m) return false; // Reject symlinks, submodules, and unresolved index stages.
        try {
          const file = path.join(cwd, m[3]);
          if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file) return false;
          const bytes = fs.readFileSync(file);
          const hash = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
          if (hash !== m[2]) return false;
        } catch { return false; }
      }
      return true;
    },
    async gitDirty(cwd) {
      const out = await gitOut(cwd, ["status", "--porcelain"]);
      return out === null ? null : out.length > 0;
    },
    async scopeRepo(cwd, remote) {
      const target = remote || "origin";
      if (!/^[\w.-]+$/.test(target) || target.startsWith("-")) return null;
      const urls = await gitOut(cwd, ["remote", "get-url", ...(remote !== undefined ? ["--push", "--all"] : []), target]);
      if (!urls) return null;
      const repos = urls.split("\n").map((url) => {
        const m = url.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
        return m ? m[1].toLowerCase() : null;
      });
      return repos.every((r) => r && r === repos[0]) ? repos[0] : null;
    },
    async remoteRepo(cwd) {
      const url = await gitOut(cwd, ["remote", "get-url", "origin"]);
      if (!url) return null;
      return normRepo(url.replace(/^git@[^:]+:/, ""));
    },
  };
}

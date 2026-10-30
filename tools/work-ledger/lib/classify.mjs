import os from "node:os";
import path from "node:path";
import { commandsOf, basename } from "./shell.mjs";

const COPILOT_RE = /copilot/i;
const DEPLOY_WORD_RE = /deploy|release|publish|upload|rollout|promote/i;
const parentPath = (arg) => typeof arg === "string" && arg.split(/[\\/]/).includes("..");

export const DEFAULT_DEPLOY_WORKFLOWS = {
  "firebase-deploy.yml": "firebase",
  "release-play-internal.yml": "play",
  "crowdin-upload.yml": "crowdin",
  "firebase-production-approve.yml": "firebase",
  "billing-catalog-publish.yml": "billing",
  "billing-catalog-production-approve.yml": "billing",
  "deploy firebase backend": "firebase",
  "release to play console (internal testing)": "play",
  "crowdin upload sources": "crowdin",
  "approve firebase production deployment": "firebase",
  "publish trusted billing catalog": "billing",
  "approve billing catalog production publication": "billing",
};

export function resolveCd(cwd, arg) {
  if (arg === undefined || arg === "") return os.homedir();
  // The splitter removes quoting, so tilde expansion cannot be verified.
  if (/[$`…*?]/.test(arg) || arg === "-" || arg.startsWith("~")) return null;
  if (path.isAbsolute(arg)) return path.resolve(arg);
  return cwd ? path.resolve(cwd, arg) : null;
}

export function normRepo(r) {
  if (!r || typeof r !== "string") return null;
  let s = r.trim().replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length >= 3) s = parts.slice(-2).join("/");
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? s : null;
}

export function parsePrRef(ref) {
  if (ref === null || ref === undefined) return { current: true };
  const s = String(ref);
  if (/^#?\d+$/.test(s)) return { pr: Number(s.replace("#", "")) };
  const u = s.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (u) return { repo: `${u[1]}/${u[2]}`, pr: Number(u[3]) };
  if (/[$`…]|:\/\//.test(s)) return { unknown: true };
  return { branch: s };
}

export function deployTargetForWorkflow(wf, map = DEFAULT_DEPLOY_WORKFLOWS) {
  if (!wf) return null;
  const s = String(wf).trim();
  if (/^\d+$/.test(s)) return "unknown-workflow";
  const lower = s.toLowerCase();
  const file = basename(lower);
  for (const [k, v] of Object.entries(map)) {
    const kl = k.toLowerCase();
    if (kl === lower || kl === file || kl.replace(/\.ya?ml$/, "") === file.replace(/\.ya?ml$/, "")) return v;
  }
  return DEPLOY_WORD_RE.test(s) ? "other" : null;
}

function splitOnce(a) {
  const i = a.indexOf("=");
  return i < 0 ? [a, ""] : [a.slice(0, i), a.slice(i + 1)];
}

function gitFindings(argv, ctx, out) {
  let i = 1;
  let cwd = ctx.cwd;
  let unknownRepo = false;
  while (i < argv.length && argv[i].startsWith("-")) {
    const a = argv[i];
    if (a === "-C") {
      if (argv[i + 1] !== "") cwd = resolveCd(cwd, argv[i + 1]);
      unknownRepo ||= parentPath(argv[i + 1]);
      i += 2; continue;
    }
    if (a.startsWith("-C")) {
      cwd = resolveCd(cwd, a.slice(2)); unknownRepo ||= parentPath(a.slice(2));
      i++; continue;
    }
    if (/^(-c|--git-dir|--work-tree|--namespace|--config-env)(=|$)/.test(a) || /^-c./.test(a)) {
      unknownRepo = true; i += a.includes("=") || /^-c./.test(a) ? 1 : 2; continue;
    }
    i++;
  }
  const sub = argv[i];
  const args = argv.slice(i + 1);
  const base = { cwd, raw: ctx.raw, unknownRepo };
  if (sub === "push") return pushFindings(args, base, out);
  if (sub === "rebase") {
    if (!args.some((a) => a === "--abort" || a === "--quit" || a === "--show-current-patch")) out.push({ rule: "rebase", ...base, detail: "git rebase" });
    return;
  }
  if (sub === "pull") {
    let rebase = false;
    for (const a of args) {
      if (a === "--rebase" || a === "-r" || /^--rebase=(true|merges|interactive|i|m|preserve|p)$/.test(a)) rebase = true;
      else if (a === "--no-rebase" || a === "--rebase=false" || a === "--ff-only") rebase = false;
    }
    if (rebase) out.push({ rule: "rebase", ...base, detail: "git pull --rebase" });
    return;
  }
  if (sub === "commit") {
    if (args.some((a) => a === "--amend" || /^--fixup=(amend|reword):/.test(a))) out.push({ rule: "amend", ...base, detail: "git commit --amend" });
    return;
  }
  if (sub === "filter-branch" || sub === "filter-repo") out.push({ rule: "rebase", ...base, detail: `history rewrite (git ${sub})` });
}

function pushFindings(args, base, out) {
  let force = false, all = false, del = false, tags = false, dry = false;
  const pos = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "--") { pos.push(...args.slice(k + 1)); break; }
    if (a.startsWith("--")) {
      const [name] = splitOnce(a);
      if (name === "--force" || name === "--force-with-lease" || name === "--force-if-includes") force = true;
      else if (name === "--mirror" || name === "--all" || name === "--branches") all = true;
      else if (name === "--delete") del = true;
      else if (name === "--tags" || name === "--follow-tags") tags = true;
      else if (name === "--dry-run") dry = true;
      else if (!a.includes("=") && ["--repo", "--receive-pack", "--exec", "--push-option", "--upload-pack"].includes(name)) k++;
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      const letters = a.slice(1);
      if (letters.includes("f")) force = true;
      if (letters.includes("d")) del = true;
      if (letters.includes("n")) dry = true;
      if (letters.endsWith("o")) k++;
      continue;
    }
    pos.push(a);
  }
  if (dry) return;
  base = { ...base, remote: pos[0] || null, unknownRepo: base.unknownRepo || !pos[0] || args.some((a) => /^--repo(=|$)/.test(a)) };
  const refs = pos.slice(1);
  let implicit = refs.length === 0 && !all && !tags;
  for (const r of refs) {
    if (r.startsWith("+")) force = true;
    const spec = r.replace(/^\+/, "");
    let dst = spec.includes(":") ? spec.slice(spec.lastIndexOf(":") + 1) : spec;
    if (/^(refs\/heads\/)?(main|master)$/.test(dst)) out.push({ rule: "push-main", ...base, detail: del ? `delete ${dst}` : `push to ${dst}` });
    else if (dst === "HEAD" || dst === "@") implicit = true;
  }
  if (force) out.push({ rule: "force-push", ...base, detail: "force push" });
  if (all) out.push({ rule: "push-main", ...base, detail: "--all/--mirror also pushes main" });
  if (implicit) out.push({ rule: "push-implicit", ...base, remote: pos[0] || null });
}

const PR_EDIT_VALUE = new Set(["--add-reviewer", "--remove-reviewer", "--add-label", "--remove-label", "--add-assignee", "--remove-assignee", "--add-project", "--remove-project", "--attach", "-t", "--title", "-b", "--body", "-F", "--body-file", "-B", "--base", "-m", "--milestone"]);
const PR_MERGE_VALUE = new Set(["-t", "--subject", "-b", "--body", "-F", "--body-file", "-A", "--author-email", "--match-head-commit"]);

function ghFindings(argv, ctx, out, opts) {
  let repo = null;
  const rest = [];
  for (let k = 1; k < argv.length; k++) {
    const a = argv[k];
    if (a === "--") { rest.push(...argv.slice(k)); break; }
    const values = rest[0] === "pr" && (rest[1] === "edit" ? PR_EDIT_VALUE : rest[1] === "merge" ? PR_MERGE_VALUE : null);
    if (values && values.has(a)) {
      rest.push(a);
      if (k + 1 < argv.length) rest.push(argv[++k]);
      continue;
    }
    if (a === "-R" || a === "--repo") { repo = argv[k + 1]; k++; continue; }
    if (a.startsWith("--repo=")) { repo = a.slice(7); continue; }
    if (/^-R[\w./:-]+$/.test(a)) { repo = a.slice(2); continue; }
    rest.push(a);
  }
  const base = { cwd: ctx.cwd, raw: ctx.raw, repo: normRepo(repo), unknownRepo: !!repo && !/^(?:[\w.-]+\/[\w.-]+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?)$/.test(repo) };
  const [group, sub, ...args] = rest;
  if (group === "pr" && sub === "merge") {
    let prRef = null, matchHead = null;
    const flags = {};
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a === "--") { if (prRef === null && args[k + 1] !== undefined) prRef = args[k + 1]; break; }
      if (a.startsWith("--") && a.includes("=")) { const [nm, v] = splitOnce(a); if (nm === "--match-head-commit") matchHead = v; flags[nm] = true; continue; }
      if (PR_MERGE_VALUE.has(a)) { if (a === "--match-head-commit") matchHead = args[k + 1] ?? null; k++; continue; }
      if (a.startsWith("-")) { flags[a] = true; continue; }
      if (prRef === null) prRef = a;
    }
    if (flags["--disable-auto"]) return;
    const ref = parsePrRef(prRef);
    out.push({ rule: "merge", via: "gh-pr-merge", ...base, repo: ref.repo || base.repo, pr: ref.pr ?? null, branch: ref.branch ?? null, current: !!ref.current, unknownRef: !!ref.unknown, matchHead, auto: !!flags["--auto"], admin: !!flags["--admin"] });
    return;
  }
  if (group === "pr" && sub === "edit") {
    let prRef = null;
    const reviewers = [];
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a === "--") { if (prRef === null && args[k + 1] !== undefined) prRef = args[k + 1]; break; }
      if (a.startsWith("--") && a.includes("=")) { const [nm, v] = splitOnce(a); if (nm === "--add-reviewer") reviewers.push(...v.split(",")); continue; }
      if (PR_EDIT_VALUE.has(a)) { if (a === "--add-reviewer") reviewers.push(...String(args[k + 1] ?? "").split(",")); k++; continue; }
      if (a.startsWith("-")) continue;
      if (prRef === null) prRef = a;
    }
    if (reviewers.some((r) => COPILOT_RE.test(r))) {
      const ref = parsePrRef(prRef);
      out.push({ rule: "review-request", via: "gh-pr-edit", ...base, repo: ref.repo || base.repo, pr: ref.pr ?? null, branch: ref.branch ?? null, current: !!ref.current, unknownRef: !!ref.unknown });
    }
    return;
  }
  if (group === "api") return ghApi([sub, ...args].filter((x) => x !== undefined), base, ctx, out, opts);
  if (group === "workflow" && sub === "run") {
    let wf = null;
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (["-f", "-F", "--field", "--raw-field", "-r", "--ref"].includes(a)) { k++; continue; }
      if (a.startsWith("-")) continue;
      wf = a; break;
    }
    const target = deployTargetForWorkflow(wf, opts.deployWorkflows);
    if (target) out.push({ rule: "deploy", target, ...base, detail: `gh workflow run ${wf}` });
    return;
  }
  if (group === "run" && sub === "rerun") {
    const id = args.find((a) => /^\d+$/.test(a));
    if (id) out.push({ rule: "run-rerun", ...base, runId: id });
    return;
  }
  if ((group === "variable" || group === "secret") && ["set", "delete", "remove"].includes(sub)) {
    out.push({ rule: "deploy", target: "config", ...base, detail: `gh ${group} ${sub}` });
    return;
  }
  if (group === "release" && ["create", "edit", "delete", "upload", "delete-asset"].includes(sub)) {
    out.push({ rule: "deploy", target: "github-release", ...base, detail: `gh release ${sub}` });
  }
}

function ghApi(args, base, ctx, out, opts) {
  let method = null, endpoint = null, input = false;
  const fields = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "-X" || a === "--method") { method = String(args[k + 1] || "").toUpperCase(); k++; continue; }
    if (/^-X[A-Za-z]+$/.test(a)) { method = a.slice(2).toUpperCase(); continue; }
    if (a.startsWith("--method=")) { method = a.slice(9).toUpperCase(); continue; }
    if (a === "-f" || a === "-F" || a === "--field" || a === "--raw-field") { fields.push(String(args[k + 1] ?? "")); k++; continue; }
    if (/^--(raw-)?field=/.test(a)) { fields.push(splitOnce(a)[1]); continue; }
    if (/^-[fF].+/.test(a)) { fields.push(a.slice(2)); continue; }
    if (a === "--input") { input = true; k++; continue; }
    if (/^--hostname(=|$)/.test(a)) {
      const host = a.includes("=") ? splitOnce(a)[1] : args[++k];
      if (host !== "github.com") base = { ...base, unknownRepo: true };
      continue;
    }
    if (["-H", "--header", "-q", "--jq", "-t", "--template", "--cache", "-p", "--preview"].includes(a)) { k++; continue; }
    if (a.startsWith("-")) continue;
    if (endpoint === null) endpoint = a;
  }
  if (!endpoint) return;
  if (!method) method = fields.length || input ? "POST" : "GET";
  const field = (name) => { const f = fields.find((x) => x.startsWith(name + "=")); return f === undefined ? null : f.slice(name.length + 1); };
  if (/^https?:\/\//.test(endpoint) && !endpoint.startsWith("https://api.github.com/")) base = { ...base, unknownRepo: true };
  const ep = endpoint.replace(/^https?:\/\/[^/]+\//, "").replace(/^\//, "").split("?")[0];
  const actionRepo = ep.match(/^repos\/([^/]+)\/([^/]+)\//);
  if (actionRepo) base = { ...base, repo: /[{}]/.test(actionRepo[0]) ? null : `${actionRepo[1]}/${actionRepo[2]}`, unknownRepo: base.unknownRepo || /[{}]/.test(actionRepo[0]) };
  const repoOf = (o, r) => (o.startsWith("{") || r.startsWith("{") ? base.repo : `${o}/${r}`);
  const write = method !== "GET" && method !== "HEAD";
  let m;
  if ((m = ep.match(/^repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/merge$/)) && method === "PUT") {
    out.push({ rule: "merge", via: "gh-api", ...base, repo: repoOf(m[1], m[2]), pr: Number(m[3]), matchHead: field("sha") });
    return;
  }
  if ((m = ep.match(/^repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/requested_reviewers$/)) && method === "POST") {
    const listed = fields.filter((f) => /^(team_)?reviewers(\[\])?=/.test(f)).map((f) => splitOnce(f)[1]);
    const text = listed.join(" ") + " " + (ctx.heredoc || "") + " " + (input ? ctx.full : "");
    if (listed.length && !listed.some((r) => COPILOT_RE.test(r)) && !COPILOT_RE.test(text)) return;
    out.push({ rule: "review-request", via: "gh-api", ...base, repo: repoOf(m[1], m[2]), pr: Number(m[3]) });
    return;
  }
  if ((m = ep.match(/^repos\/([^/]+)\/([^/]+)\/actions\/workflows\/([^/]+)\/dispatches$/)) && method === "POST") {
    const target = deployTargetForWorkflow(decodeURIComponent(m[3]), opts.deployWorkflows);
    if (target) out.push({ rule: "deploy", target, ...base, repo: repoOf(m[1], m[2]), detail: `workflow dispatch ${m[3]}` });
    return;
  }
  if ((m = ep.match(/actions\/runs\/(\d+)\/pending_deployments$/)) && method === "POST") {
    out.push({ rule: "deploy", target: "environment", ...base, detail: "approve pending deployment" });
    return;
  }
  if ((m = ep.match(/^repos\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)\/(rerun|rerun-failed-jobs)$/)) && method === "POST") {
    out.push({ rule: "run-rerun", ...base, repo: repoOf(m[1], m[2]), runId: m[3] });
    return;
  }
  if ((m = ep.match(/^repos\/([^/]+)\/([^/]+)\/actions\/jobs\/(\d+)\/rerun$/)) && method === "POST") {
    out.push({ rule: "run-rerun", ...base, repo: repoOf(m[1], m[2]), jobId: m[3] });
    return;
  }
  if (/^repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(main|master)$/.test(ep) && write) {
    out.push({ rule: "push-main", ...base, detail: "update refs/heads/main through the API" });
    return;
  }
  if (/^repos\/[^/]+\/[^/]+\/contents\//.test(ep) && (method === "PUT" || method === "DELETE")) {
    const br = field("branch");
    if (!br || /^(main|master)$/.test(br)) out.push({ rule: "push-main", ...base, detail: "contents API writes to the default branch" });
    return;
  }
  if (/(^|\/)(variables|secrets)(\/|$)/.test(ep) && write && /^(repos|orgs)\//.test(ep)) {
    out.push({ rule: "deploy", target: "config", ...base, detail: `${method} ${ep}` });
    return;
  }
  if (/^repos\/[^/]+\/[^/]+\/releases(\/|$)/.test(ep) && write) {
    out.push({ rule: "deploy", target: "github-release", ...base, detail: `${method} ${ep}` });
    return;
  }
  if (ep === "graphql") {
    const q = (field("query") || "") + " " + (ctx.heredoc || "") + " " + (input ? ctx.full : "");
    if (/\b(mergePullRequest|enablePullRequestAutoMerge)\b/.test(q)) out.push({ rule: "merge", via: "graphql", ...base, pr: null, unknownRef: true });
    else if (/\brequestReviews\b/.test(q)) out.push({ rule: "review-request", via: "graphql", ...base, pr: null, unknownRef: true });
  }
}

const GRADLE_VALUE = new Set(["--tests", "-I", "--init-script", "-x", "--exclude-task", "-c", "--settings-file", "-g", "--gradle-user-home", "--console", "--max-workers", "--warning-mode", "--priority", "-b", "--build-file"]);

function gradleFindings(argv, ctx, out) {
  const tasks = [];
  const flags = [];
  let projectDir = null;
  for (let k = 1; k < argv.length; k++) {
    const a = argv[k];
    if (a === "-p" || a === "--project-dir") { projectDir = argv[k + 1] ?? ""; k++; continue; }
    if (a.startsWith("--project-dir=")) { projectDir = a.slice(14); continue; }
    if (a.startsWith("-p")) { projectDir = a.slice(2).replace(/^=/, ""); continue; }
    if (GRADLE_VALUE.has(a)) { flags.push(a, String(argv[k + 1] ?? "")); k++; continue; }
    if (a.startsWith("-")) { flags.push(a); continue; }
    tasks.push(a);
  }
  const cwd = projectDir === null ? ctx.cwd : projectDir ? resolveCd(ctx.cwd, projectDir) : null;
  out.push({ rule: "gradle", cwd, raw: ctx.raw, tasks, flags, unknownRepo: parentPath(projectDir) });
  for (const task of tasks) {
    const name = task.slice(task.lastIndexOf(":") + 1);
    let target;
    if (/^appDistributionUpload/i.test(name)) target = "firebase";
    else if (/^(publishToMavenLocal|publish.+PublicationToMavenLocal|publish.+PublicationTo.+Repository|publishAllPublicationsTo.+Repository)$/i.test(name)) target = "maven";
    else if (/^(publish|promote)\w*/i.test(name)) target = "play";
    if (target) out.push({ rule: "deploy", target, cwd, raw: ctx.raw, detail: `Gradle task ${task}` });
  }
}

function firstPositional(argv, from, valueFlags = new Set()) {
  for (let k = from; k < argv.length; k++) {
    const a = argv[k];
    if (valueFlags.has(a)) { k++; continue; }
    if (a.startsWith("-")) continue;
    return { word: a, index: k };
  }
  return null;
}

function otherFindings(w0, argv, ctx, out) {
  const base = { cwd: ctx.cwd, raw: ctx.raw };
  if (w0 === "firebase") {
    const p = firstPositional(argv, 1, new Set(["--project", "-P", "--config", "-c", "--token", "--account"]));
    const cmd = p ? p.word : "";
    if (cmd === "deploy" || /:(set|unset|delete|destroy|distribute|deploy|clone)$/.test(cmd)) out.push({ rule: "deploy", target: "firebase", ...base, detail: `firebase ${cmd}` });
    return;
  }
  if (w0 === "gcloud") {
    if (argv.includes("deploy")) out.push({ rule: "deploy", target: "gcloud", ...base, detail: "gcloud deploy" });
    return;
  }
  if (w0 === "fastlane") {
    const p = firstPositional(argv, 1);
    const lane = p ? p.word : null;
    const safe = new Set(["lanes", "list", "env", "init", "help", "actions", "action", "docs", "search_plugins", "version", "enable_auto_complete"]);
    if (lane && !safe.has(lane)) out.push({ rule: "deploy", target: "play", ...base, detail: `fastlane ${lane}` });
    return;
  }
  if (w0 === "npm" || w0 === "pnpm" || w0 === "yarn") {
    const vf = new Set(["--prefix", "-C", "--dir", "--workspace", "-w", "--cwd", "--filter"]);
    const p = firstPositional(argv, 1, vf);
    if (!p) return;
    let script = null;
    if (p.word === "run" || p.word === "run-script") { const q = firstPositional(argv, p.index + 1, vf); script = q ? q.word : null; }
    else if (p.word === "publish") { out.push({ rule: "deploy", target: "npm", ...base, detail: `${w0} publish` }); return; }
    else if (w0 === "yarn") script = p.word;
    if (script && /^(deploy|release|publish)(:|$)/i.test(script)) out.push({ rule: "deploy", target: "script", ...base, detail: `${w0} run ${script}` });
    return;
  }
  if (w0 === "curl") {
    const joined = argv.join(" ");
    const put = /(^|\s)(-X\s*PUT|--request\s+PUT|-XPUT)(\s|$)/i.test(joined);
    const m = joined.match(/api\.github\.com\/repos\/([\w.-]+)\/([\w.-]+)\/pulls\/(\d+)\/merge/);
    if (m && put) out.push({ rule: "merge", via: "curl", ...base, repo: `${m[1]}/${m[2]}`, pr: Number(m[3]) });
    if (/api\.github\.com\/repos\/[\w.-]+\/[\w.-]+\/actions\/workflows\/[^/\s]+\/dispatches/.test(joined)) out.push({ rule: "deploy", target: "unknown-workflow", ...base, detail: "workflow dispatch through curl" });
  }
}

/**
 * Classify one shell command string.
 * opts: { cwd, deployWorkflows }
 */
export function classify(command, opts = {}) {
  const cmds = commandsOf(String(command ?? ""));
  const findings = [];
  let cwd = opts.cwd || null;
  const o = { deployWorkflows: opts.deployWorkflows || DEFAULT_DEPLOY_WORKFLOWS };
  for (const c of cmds) {
    const argv = c.argv;
    if (!argv.length) continue;
    const w0 = basename(argv[0]);
    if (w0 === "cd" || w0 === "pushd") { if (!c.nested) cwd = resolveCd(cwd, argv[1]); continue; }
    const ctx = { cwd, raw: c.raw, heredoc: c.heredoc, full: String(command) };
    if (w0 === "git") gitFindings(argv, ctx, findings);
    else if (w0 === "gh") ghFindings(argv, ctx, findings, o);
    else if (w0 === "gradlew" || w0 === "gradle") gradleFindings(argv, ctx, findings);
    else otherFindings(w0, argv, ctx, findings);
  }
  return { findings, commands: cmds };
}

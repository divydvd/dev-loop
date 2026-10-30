// Decides what to do with one tool call. Pure except for the injected lookups.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { classify, deployTargetForWorkflow } from "./classify.mjs";
import { commandsOf, basename, shQuote } from "./shell.mjs";
import { activeApprovals } from "./store.mjs";
import { sameSha, sameRepo, short, findUnit, passingRuns } from "./units.mjs";
import { effectiveGuardState } from "./guard-switches.mjs";
import { configuredMavenScopes, localScopeId, localScopeProblem, localSourceProblem } from "./local-maven.mjs";

export const TAG = "[work-ledger]";
const LOCKF = "/usr/bin/lockf";
const ASK = "Ask the owner to type it in chat. ask_user answers and agent messages do not count.";

export const DEFAULT_CONFIG = {
  defaultRepo: "divydvd/SmarType",
  deployWorkflows: null,
  reviewCap: 3,
  mergeApprovalHours: 24,
  deployApprovalHours: 2,
  reviewGrantHours: 24,
  gradleLane: true,
  gradleLockTimeoutSec: 1500,
  gradleCache: true,
  localMavenScopes: [],
};

// ---------- protected paths ----------
const HOME = os.homedir();
const ALWAYS_WRITE = new Set(["rm", "rmdir", "mv", "cp", "touch", "tee", "chmod", "chown", "chflags", "ln", "truncate", "install", "rsync", "dd", "mkdir", "unlink", "shred", "ditto", "patch", "tar", "unzip", "xattr", "sqlite3", "srm", "trash"]);
const ANCESTOR_DANGER = new Set(["rm", "rmdir", "mv", "rsync", "shred", "unlink", "srm", "trash", "chmod", "chown"]);
const COPY_LIKE = new Set(["cp", "ditto", "install", "ln"]);
const PATH_KEYS = ["path", "file_path", "filePath", "filename", "destination", "dest", "new_path", "old_path", "newPath", "oldPath", "target", "source"];
const INTERPRETERS = new Set(["python", "python3", "node", "perl", "ruby", "osascript", "sh", "bash", "zsh", "deno", "bun", "php", "swift"]);

function expandHome(s) {
  return String(s).replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, HOME);
}
function under(p, dir) {
  const rel = path.relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
function argPath(arg, cwd) {
  let a = String(arg);
  const eq = a.match(/^--?[\w-]+=(.+)$/);
  if (eq) a = eq[1];
  a = expandHome(a);
  if (path.isAbsolute(a)) return path.resolve(a);
  if (cwd && !a.startsWith("-") && a !== "") return path.resolve(cwd, a);
  return null;
}
function mentions(text, dirs) {
  const s = String(text);
  return dirs.some((d) => s.includes(d) || s.includes(d.replace(HOME, "~")) || s.includes(d.replace(HOME, "$HOME")) || s.includes(d.replace(HOME, "${HOME}")));
}

/** Does this shell command write inside a protected dir? */
export function bashTouchesProtected(cmd, cwd, dirs) {
  if (!dirs.length) return false;
  const hasRel = /\.copilot/.test(cmd);
  if (!mentions(cmd, dirs) && !hasRel) return false;
  let here = cwd;
  for (const c of commandsOf(cmd)) {
    const argv = c.argv;
    const w0 = argv.length ? basename(argv[0]) : "";
    if ((w0 === "cd" || w0 === "pushd") && !c.nested) { const p = argPath(argv[1] ?? "~", here); here = p; continue; }
    const inside = here && dirs.some((d) => under(here, d));
    for (const r of c.redirects || []) {
      if (r.op.includes(">") && !/^(\d+|-)$/.test(r.target)) {
        const p = argPath(r.target, here);
        if ((p && dirs.some((d) => under(p, d))) || (inside && !path.isAbsolute(expandHome(r.target)))) return true;
      }
    }
    if (!w0) continue;
    let targets = argv.slice(1);
    if (COPY_LIKE.has(w0)) {
      const t = argv.findIndex((a) => a === "-t" || a === "--target-directory");
      const te = argv.find((a) => a.startsWith("--target-directory="));
      const pos = argv.slice(1).filter((a) => !a.startsWith("-"));
      targets = te ? [te] : t > 0 ? [argv[t + 1]] : pos.length > 1 ? [pos.at(-1)] : pos.length === 1 && w0 === "ln" ? ["."] : pos;
    }
    const paths = targets.map((a) => argPath(a, here)).filter(Boolean);
    const hitDesc = paths.some((p) => dirs.some((d) => under(p, d)));
    const hitAnc = paths.some((p) => dirs.some((d) => under(d, p)));
    const write = ALWAYS_WRITE.has(w0) || (w0 === "sed" && argv.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith("--in-place"))) ||
      ((w0 === "curl" || w0 === "wget") && argv.some((a) => /^(-o|-O|--output|--output-document)/.test(a))) ||
      (w0 === "find" && argv.some((a) => a === "-delete" || a === "-exec" || a === "-execdir"));
    if (write && (hitDesc || inside || (ANCESTOR_DANGER.has(w0) && hitAnc))) return true;
    if (INTERPRETERS.has(w0) && (mentions(c.raw, dirs) || inside)) return true;
  }
  return false;
}

/** File paths a writer tool will change. Only path fields count; file content does not. */
export function writerPaths(args) {
  const out = [];
  for (const k of PATH_KEYS) if (typeof args[k] === "string") out.push(args[k]);
  for (const k of ["paths", "files", "edits"]) {
    if (!Array.isArray(args[k])) continue;
    for (const v of args[k]) {
      if (typeof v === "string") out.push(v);
      else if (v && typeof v === "object") for (const kk of PATH_KEYS) if (typeof v[kk] === "string") out.push(v[kk]);
    }
  }
  const patch = [args.patch, args.input, args.diff].find((x) => typeof x === "string") || "";
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$|^(?:\+\+\+|---) (?:[ab]\/)?(\S.*)$/gm)) {
    const f = (m[1] || m[2] || m[3] || "").trim();
    if (f && f !== "/dev/null") out.push(f);
  }
  return out;
}

// ---------- helpers ----------
const deny = (res, reason, pending) => {
  if (!res.deny) res.deny = `${TAG} ${reason}`;
  if (pending) res.pending.push(pending);
  return res;
};

function approvalsFor(data, now, pred) {
  return activeApprovals(data, now).filter(pred);
}

async function resolveRepo(f, cwd, deps) {
  if (f.repo) return f.repo;
  const r = await deps.lookups.remoteRepo(f.cwd || cwd);
  return r || deps.config.defaultRepo || null;
}

async function resolvePr(f, repo, cwd, deps) {
  const L = deps.lookups;
  if (f.pr) return L.prHead(repo, f.pr);
  if (f.branch) return L.prForBranch(repo, f.branch, f.cwd || cwd);
  if (f.current) return L.prCurrent(f.cwd || cwd);
  return null;
}

// Unlike legacy approval lookup, a pause never falls back to defaultRepo.
async function guardPaused(guard, f, ctx, res, expectedRepo = null) {
  const { deps, sessionId, cwd } = ctx;
  if (f.unknownRepo || /[()|]|(?<!&)&(?!&)|\b(?:GIT_\w+|GH_\w+|GITHUB_\w+|HOME|PATH|XDG_\w+|BASH_ENV|ENV|ZDOTDIR)=/.test(ctx.command)) return false;
  const commands = commandsOf(ctx.command);
  if (commands.some((c) => c.nested || c.wrapped || c.redirects.length ||
      !["git", "gh", "gradlew", "gradle", "firebase", "gcloud", "fastlane"].includes(basename(c.argv[0] || "")) ||
      (basename(c.argv[0] || "") === "git" && c.argv.some((a) => ["config", "remote", "worktree", "init", "clone"].includes(a))) ||
      (basename(c.argv[0] || "") === "gh" && c.argv.includes("repo")))) return false;
  const dir = f.cwd === undefined ? cwd : f.cwd;
  const repo = f.repo || (dir && await deps.lookups.scopeRepo(dir, f.remote));
  if (expectedRepo && !sameRepo(repo, expectedRepo)) return false;
  if (effectiveGuardState(deps.data, guard, repo, sessionId, deps.now).enabled) return false;
  res.notes.push(`${guard} enforcement paused for ${repo}; this is not action approval.`);
  return true;
}

/** Insert --match-head-commit after the single "pr merge" in the command. */
export function injectMatchHead(cmd, sha) {
  const hits = [...String(cmd).matchAll(/\bpr\s+merge\b/g)];
  if (hits.length !== 1) return null;
  const at = hits[0].index + hits[0][0].length;
  return `${cmd.slice(0, at)} --match-head-commit ${sha}${cmd.slice(at)}`;
}

const VERIFY_TASK = /(^|:)(test\w*|lint\w*|check|detekt\w*|ktlint\w*|spotless\w*check|validate\w*|verify\w*)$/i;
const NO_CACHE_TASK = /(^|:)(connected\w*|device\w*)/i;

/** Cache key for a Gradle run, or null when the run is not a pure verification run. */
export function gradleKey(f) {
  if (!f.tasks.length) return null;
  if (!f.tasks.every((t) => VERIFY_TASK.test(t) && !NO_CACHE_TASK.test(t))) return null;
  const parts = [...f.tasks].sort();
  for (let k = 0; k < f.flags.length; k++) {
    const a = f.flags[k];
    if (a === "--tests" || a === "-x" || a === "--exclude-task" || a === "-I" || a === "--init-script") parts.push(`${a} ${basename(f.flags[k + 1] || "")}`);
    else if (/^-P/.test(a) || a === "--rerun-tasks" || a === "--offline") parts.push(a);
  }
  return parts.join(" ");
}

export function wrapGradleLane(cmd, lockFile, timeoutSec) {
  return `${LOCKF} -t ${timeoutSec} ${shQuote(lockFile)} /bin/bash -c ${shQuote(cmd)}`;
}

// ---------- rules ----------
async function onMerge(f, ctx, res) {
  const { deps, cwd, sessionId } = ctx;
  if (f.via === "graphql" || f.via === "curl" || f.unknownRef) {
    return deny(res, `Merge with an explicit PR number: gh pr merge <N> -R <owner/repo>. The guard must check the owner's approval for that PR. ${ASK}`);
  }
  const repo = await resolveRepo(f, cwd, deps);
  const info = repo ? await resolvePr(f, repo, cwd, deps) : null;
  if (!info) return deny(res, `Cannot read the head commit of PR ${f.pr ? "#" + f.pr : f.branch || "(current branch)"} from GitHub, so the merge stays blocked (fail closed). Check the PR number and repo, then try again.`);
  const pr = info.pr || f.pr;
  const head = info.sha;
  const r = info.repo || repo;
  if (info.state && info.state !== "OPEN") return res;
  const mine = approvalsFor(deps.data, deps.now, (a) => a.kind === "merge" && a.pr === pr && sameRepo(a.repo, r));
  const ok = mine.find((a) => sameSha(a.sha, head));
  const pending = { kind: "merge", sessionId, repo: r, pr, sha: head };
  if (!ok) {
    if (mine.length) return deny(res, `The owner approved #${pr} at commit ${short(mine.at(-1).sha)}, but the head is now ${short(head)}. New commits need a new approval: ask the owner to type "merge #${pr}" again. ${ASK}`, pending);
    return deny(res, `Merging ${r}#${pr} (head ${short(head)}) needs the owner's typed approval, for example "merge #${pr}". ${ASK} Do not merge until the owner approves; tell the owner the PR number and what was tested at ${short(head)}.`, pending);
  }
  if (f.admin && !ok.anyway) return deny(res, `Run the merge again without --admin. --admin skips repository rules and is allowed only after the owner types "merge #${pr} anyway".`);
  if (f.matchHead && !sameSha(f.matchHead, head)) return deny(res, `--match-head-commit ${short(f.matchHead)} is not the approved head ${short(head)} of #${pr}.`);
  if (!f.matchHead) {
    if (f.via !== "gh-pr-merge") return deny(res, `Pin the merge to the approved commit: add -f sha=${head} to the gh api call.`);
    const cmd = res.modifiedArgs?.command ?? ctx.command;
    const next = injectMatchHead(cmd, head);
    if (!next) return deny(res, `Put one merge per command and add --match-head-commit ${head} so the merge is pinned to the approved commit.`);
    res.modifiedArgs = { ...ctx.args, command: next };
  }
  res.post.push({ kind: "merge", repo: r, pr, sha: head, approvalId: ok.id });
  return res;
}

async function onReview(f, ctx, res) {
  const { deps, cwd, sessionId } = ctx;
  if (f.unknownRef) return deny(res, "Request Copilot reviews with an explicit PR number, for example: gh pr edit <N> --add-reviewer @copilot. The guard counts review rounds per PR.");
  const repo = await resolveRepo(f, cwd, deps);
  const info = repo ? await resolvePr(f, repo, cwd, deps) : null;
  if (!info) { res.notes.push(`review request not checked: cannot read PR ${f.pr || f.branch || "(current)"} from GitHub`); return res; }
  const pr = info.pr || f.pr;
  const r = info.repo || repo;
  const head = info.sha;
  const unit = findUnit(deps.data, r, pr);
  const reviews = unit?.reviews || [];
  const atHead = reviews.filter((x) => sameSha(x.sha, head));
  const grant = approvalsFor(deps.data, deps.now, (a) => a.kind === "review" && a.pr === pr && sameRepo(a.repo, r))[0];
  const cap = deps.config.reviewCap ?? 3;
  const pending = { kind: "review", sessionId, repo: r, pr, sha: head };
  const paused = await guardPaused("review-limit", f, ctx, res, r);
  if (!paused && !grant && atHead.length) return deny(res, `A Copilot review was already requested for #${pr} at head ${short(head)}. Wait for it, fix its findings in a new commit, then request again. For an extra review of the same commit, ask the owner to type "review again #${pr}".`, pending);
  if (!paused && !grant && reviews.length >= cap) return deny(res, `#${pr} already had ${reviews.length} Copilot review rounds (cap ${cap}). Fix the open findings yourself and report to the owner. For one more round, ask the owner to type "review again #${pr}".`, pending);
  res.post.push({ kind: "review", repo: r, pr, sha: head, grantId: grant?.id || null });
  return res;
}

function deployAllowed(data, now, target) {
  return approvalsFor(data, now, (a) => a.kind === "deploy" && (a.target === target || (target === "environment" && a.target !== "config"))).at(-1) || null;
}

function onDeploy(target, detail, ctx, res) {
  const { deps, sessionId } = ctx;
  if (target === "maven") {
    return deny(res, `Maven publication (${detail}) is blocked: the build source and publication destination are not verified. A task name does not prove local-only execution. Play or Firebase approval does not authorize Maven publication.`);
  }
  const ok = deployAllowed(deps.data, deps.now, target);
  if (!ok) {
    const say = { play: "push the build on playstore", firebase: "deploy firebase", config: "update the config", crowdin: "upload to crowdin", "github-release": "publish the github release", environment: "deploy firebase", billing: "publish the billing catalog" }[target] || "deploy it";
    return deny(res, `This is a deploy (${target}: ${detail}). Deploys need the owner's typed approval, for example "${say}". ${ASK}`, { kind: "deploy", sessionId, target });
  }
  res.post.push({ kind: "deploy", target, approvalId: ok.id });
  return res;
}

async function onMaven(ctx, res) {
  const { deps, cwd, sessionId, command } = ctx;
  const fail = reason => deny(res, `Maven publication blocked: source and destination are not verified (${reason}). Play or Firebase approval does not authorize Maven publication.`);
  const repo = cwd && await deps.lookups.scopeRepo?.(cwd);
  const state = effectiveGuardState(deps.data, "maven", repo, sessionId, deps.now);
  if (state.enabled) return fail("a confirmed scoped Maven pause is required");
  const scope = configuredMavenScopes(deps.config, repo).find(s => !localScopeProblem(s) &&
    s.cwd === cwd && s.command === command && state.pauses.some(p => p.mavenScopeIds?.includes(localScopeId(s))));
  if (!scope) return fail("no confirmed descriptor matches the exact project, command, source, launcher, and local destination");
  if ((deps.protectedDirs || []).some(dir => under(scope.cwd, dir) || under(dir, scope.cwd))) return fail("the project overlaps protected guard source or data");
  const problem = await localSourceProblem(scope, deps.lookups);
  if (problem) return fail(problem);
  if (!deps.config.gradleLane || !deps.lockFile || !fs.existsSync(LOCKF)) return fail("the shared Gradle build lock is unavailable");
  res.localMaven = true;
  res.notes.push(`Verified local Maven descriptor ${scope.label} at ${scope.sha}; destination ${scope.destination}. Shared build locking remains active.`);
  return res;
}

async function onGradle(f, ctx, res) {
  const { deps } = ctx;
  const key = gradleKey(f);
  if (!key || !deps.config.gradleCache) return null;
  const dir = f.cwd || ctx.cwd;
  const [head, dirty] = await Promise.all([deps.lookups.gitHead(dir), deps.lookups.gitDirty(dir)]);
  if (!head || dirty !== false) return null;
  const hit = passingRuns(deps.data, head).filter((v) => v.tasks === key).at(-1);
  if (hit && !/\bWORK_LEDGER_RERUN=1\b/.test(ctx.command) && !await guardPaused("test-cache", f, ctx, res)) {
    deny(res, `Gradle "${key}" already passed at commit ${short(head)} (clean tree) ${Math.max(1, Math.round((deps.now - Date.parse(hit.at)) / 60000))} min ago. Reuse that result and do not run it again. If a re-run is truly needed, prefix the command with WORK_LEDGER_RERUN=1.`);
    return null;
  }
  return { kind: "gradle", sha: head, tasks: key, cwd: dir };
}

/**
 * call: { toolName, args, cwd, sessionId }
 * deps: { data, lookups, config, now, protectedDirs, lockFile }
 * Returns { deny, modifiedArgs, pending[], notes[], post[] }.
 */
export async function decide(call, deps) {
  const res = { deny: null, modifiedArgs: null, pending: [], notes: [], post: [] };
  const toolName = String(call.toolName || "");
  const args = call.args && typeof call.args === "object" ? call.args : {};
  const cwd = call.cwd || null;
  const dirs = deps.protectedDirs || [];
  const ctx = { deps, cwd, sessionId: call.sessionId || null, args, command: String(args.command ?? "") };

  if (/^(write_bash|write_shell|write_powershell|send_input)$/i.test(toolName) && typeof args.input === "string") {
    const text = args.input.replace(/\{(enter|tab|up|down|left|right|backspace)\}/gi, "\n");
    const kinds = classify(text, { cwd, deployWorkflows: deps.config.deployWorkflows || undefined }).findings.map((f) => f.rule).filter((r) => r !== "gradle" && r !== "push-implicit" && r !== "review-request");
    if (kinds.length || bashTouchesProtected(text, cwd, dirs)) return deny(res, `Do not type ${kinds[0] || "this command"} into a running shell. Run it as a new bash command, so the guard can check it.`);
    return res;
  }

  if (toolName !== "bash") {
    const writer = /^(edit|create|write|apply_patch|str_replace|multi_edit|delete|move|rename)/i.test(toolName);
    const hits = writer && dirs.length ? writerPaths(args).map((p) => argPath(p, cwd)).filter(Boolean) : [];
    if (hits.some((ap) => dirs.some((d) => under(ap, d)))) {
      return deny(res, "This path belongs to the work-ledger guard. Only the owner changes it.");
    }
    const n = toolName.toLowerCase();
    if (/merge_pull_request|auto_?merge/.test(n)) return deny(res, `Merge in bash with gh pr merge <N> -R <owner/repo>, so the guard can check the owner's approval. ${ASK}`);
    if (/request_copilot_review|request_review/.test(n)) return deny(res, "Request Copilot reviews in bash with gh pr edit <N> --add-reviewer @copilot, so the guard can count review rounds.");
    if (/run_workflow|rerun|dispatch/.test(n)) {
      const wf = String(args.workflow_id ?? args.workflowId ?? args.workflow ?? "");
      const t = wf ? deployTargetForWorkflow(wf, deps.config.deployWorkflows || undefined) : null;
      if (t) return onDeploy(t, `workflow ${wf}`, ctx, res);
    }
    if (/push_files|create_or_update_file|delete_file/.test(n) && /^(main|master)$/.test(String(args.branch ?? ""))) {
      const repo = args.owner && args.repo ? `${args.owner}/${args.repo}` : args.repository;
      if (!repo || !await guardPaused("push-main", { repo }, ctx, res)) return deny(res, "Do not write to main. Push to a feature branch and open a PR.");
    }
    return res;
  }

  const cmd = ctx.command;
  if (!cmd.trim()) return res;
  if (bashTouchesProtected(cmd, cwd, dirs)) return deny(res, "This command writes to the work-ledger guard files. Only the owner changes them (the owner can type \"guards off\").");

  const { findings } = classify(cmd, { cwd, deployWorkflows: deps.config.deployWorkflows || undefined });
  const gradle = [];
  for (const f of findings) {
    if (["rebase", "amend", "force-push", "push-main", "push-implicit"].includes(f.rule) &&
        await guardPaused(f.rule === "push-implicit" ? "push-main" : f.rule, f, ctx, res)) continue;
    switch (f.rule) {
      case "rebase": deny(res, `History rewrite is not allowed (${f.detail}). Use git merge (for example git pull --no-rebase, or git merge origin/main) and push new commits.`); break;
      case "amend": deny(res, "git commit --amend is not allowed. Make a new commit instead."); break;
      case "force-push": deny(res, "Force push is not allowed. Merge the remote changes (git pull --no-rebase) and push new commits."); break;
      case "push-main": deny(res, `Do not push to main (${f.detail}). Push a feature branch and open a PR.`); break;
      case "push-implicit": {
        const br = await deps.lookups.gitBranch(f.cwd || cwd);
        if (br && /^(main|master)$/.test(br)) deny(res, "The current branch is main. Do not push to main: create a feature branch, push it, and open a PR.");
        else if (!br) res.notes.push("push target not checked: cannot read the current branch");
        break;
      }
      case "merge": await onMerge(f, ctx, res); break;
      case "review-request": await onReview(f, ctx, res); break;
      case "deploy":
        if (f.target === "maven") await onMaven(ctx, res);
        else onDeploy(f.target, f.detail, ctx, res);
        break;
      case "run-rerun": {
        const wf = f.runId ? await deps.lookups.runWorkflow(f.repo, f.runId) : await deps.lookups.jobWorkflow(f.repo || deps.config.defaultRepo, f.jobId);
        const t = wf ? deployTargetForWorkflow(wf, deps.config.deployWorkflows || undefined) : null;
        if (t) onDeploy(t, `re-run of "${wf}"`, ctx, res);
        else if (!wf) res.notes.push(`re-run not checked: cannot read run ${f.runId || f.jobId}`);
        break;
      }
      case "gradle": gradle.push(f); break;
      default: break;
    }
    if (res.deny) return res;
  }

  if (gradle.length) {
    if (gradle.length === 1) {
      const p = await onGradle(gradle[0], ctx, res);
      if (res.deny) return res;
      if (p) res.post.push(p);
    }
    const lane = deps.config.gradleLane && deps.lockFile && fs.existsSync(LOCKF) && gradle.some((g) => g.tasks.length) && (res.localMaven || !/\block[f]\b[\s\S]*gradle\.lock/.test(cmd));
    if (lane) {
      const base = res.modifiedArgs?.command ?? cmd;
      res.modifiedArgs = { ...args, command: wrapGradleLane(base, deps.lockFile, deps.config.gradleLockTimeoutSec || 1500) };
      res.lane = true;
    }
  }
  return res;
}

// ---------- after the tool ran ----------
export function exitCodeOf(text) {
  const all = [...String(text || "").matchAll(/(?:completed|exited) with exit code:?\s*(-?\d+)/g)];
  return all.length ? Number(all.at(-1)[1]) : null;
}

export function gradleOutcome(text) {
  const s = String(text || "");
  if (/BUILD FAILED|FAILURE: Build failed/.test(s)) return 1;
  if (/BUILD SUCCESSFUL/.test(s)) return 0;
  return null;
}

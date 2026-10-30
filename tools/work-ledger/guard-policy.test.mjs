import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { emptyLedger } from "./lib/store.mjs";
import { decide, DEFAULT_CONFIG } from "./lib/policy.mjs";
import { applyGuardCommand, parseGuardCommand } from "./lib/guard-switches.mjs";

const now = Date.parse("2026-10-30T10:00:00Z");
const repo = "example/project";
const sha = "a".repeat(40);
function fixture() {
  const data = emptyLedger();
  const remoteRepo = async (cwd, remote = "origin") => remote === "elsewhere" || remote.includes("/other") || cwd === "/other" ? "example/other" : cwd === "/unknown" ? null : repo;
  const lookups = {
    remoteRepo, scopeRepo: remoteRepo,
    prHead: async (r, pr) => ({ repo: r, pr, sha, state: "OPEN" }),
    gitBranch: async () => "main", gitHead: async () => sha, gitDirty: async () => false,
  };
  const deps = { data, lookups, config: { ...DEFAULT_CONFIG }, now: now + 2, protectedDirs: ["/protected"], lockFile: "/synthetic/gradle.lock" };
  const call = (command, cwd = "/project", sessionId = "owner") => decide({ toolName: "bash", args: { command }, cwd, sessionId }, deps);
  const pause = (guard, scope = "repository") => {
    const ctx = { owner: true, repo, sessionId: "owner", messageId: "r", now };
    const preview = applyGuardCommand(data, parseGuardCommand(`guard ${guard} off in ${scope}`), ctx);
    applyGuardCommand(data, parseGuardCommand(preview.confirmation), { ...ctx, messageId: "c", now: now + 1 });
  };
  return { data, deps, call, pause };
}

test("history checks pause individually and use each action repository", async () => {
  for (const [guard, command] of [
    ["rebase", "git rebase topic"], ["amend", "git commit --amend"],
    ["force-push", "git push --force origin topic"], ["push-main", "git push origin main"],
  ]) {
    const f = fixture();
    assert.ok((await f.call(command)).deny, guard);
    f.pause(guard);
    assert.equal((await f.call(command)).deny, null, guard);
    assert.ok((await f.call(command, "/other")).deny, guard);
    assert.ok((await f.call(command, "/unknown")).deny, guard);
    assert.ok((await f.call(`git -C /other ${command.slice(4)}`)).deny, guard);
    f.deps.now = now + 1800000;
    assert.ok((await f.call(command)).deny, guard);
  }
});

test("session pauses cannot escape through a worktree, remote, or API repository", async () => {
  const f = fixture();
  f.pause("push-main", "session");
  assert.equal((await f.call("git push origin main", "/second-worktree")).deny, null);
  assert.ok((await f.call("git push origin main", "/project", "other-session")).deny);
  assert.ok((await f.call("git push elsewhere main")).deny);
  assert.ok((await f.call("git push https://github.com/example/other.git main")).deny);
  assert.ok((await f.call("gh api -X PATCH repos/example/other/git/refs/heads/main -f sha=abc")).deny);
  assert.equal((await f.call("gh api -X PATCH repos/example/project/git/refs/heads/main -f sha=abc")).deny, null);
  for (const command of [
    "git -C '$UNKNOWN' push origin main",
    "git -C/other push origin main",
    "git -c remote.origin.url=https://github.com/example/other.git push origin main",
    "git --git-dir=/other/.git push origin main",
    "GIT_DIR=/other/.git git push origin main",
    "git push",
    "git push --repo elsewhere origin main",
    "gh api --hostname other.example -X PATCH repos/example/project/git/refs/heads/main -f sha=abc",
    "gh api -X PATCH https://other.example/repos/example/project/git/refs/heads/main -f sha=abc",
    "gh -R https://other.example/example/project api -X PATCH repos/example/project/git/refs/heads/main -f sha=abc",
    "gh api -X PATCH repos/{owner}/{repo}/git/refs/heads/main -f sha=abc",
  ]) assert.ok((await f.call(command)).deny, command);
  for (const [r, want] of [["project", null], ["other", true]]) {
    const result = await decide({ toolName: "github_push_files", args: { owner: "example", repo: r, branch: "main" }, cwd: "/project", sessionId: "owner" }, f.deps);
    assert.equal(!!result.deny, !!want);
  }
});

test("enclosing shell context cannot transfer a repository pause", async () => {
  const f = fixture();
  f.pause("rebase");
  for (const command of [
    "export GIT_DIR=/other/.git; git rebase topic",
    "bash -c 'cd /other && git rebase topic'",
    "env -C /other git rebase topic",
    "sudo -u another git rebase topic",
    "(cd /other; true); git rebase topic",
    "export XDG_CONFIG_HOME=/other; git rebase topic",
    "git remote set-url origin https://github.com/example/other.git; git rebase topic",
    "cp /other/config .git/config; git rebase topic",
  ]) assert.ok((await f.call(command)).deny, command);
  for (const command of [
    "cd /project | git rebase topic",
    "cd /project & git rebase topic",
    "cd /project || git rebase topic",
  ]) assert.ok((await f.call(command, "/other")).deny, command);
});

test("review-limit pause never uses the legacy default repository as action identity", async () => {
  const f = fixture();
  f.deps.config.defaultRepo = repo;
  f.data.units[`${repo}#1`] = { repo, pr: 1, reviews: [{ sha }] };
  f.pause("review-limit");
  assert.ok((await f.call("gh pr edit 1 --add-reviewer @copilot", "/unknown")).deny);
  f.deps.lookups.prHead = async (_repo, pr) => ({ repo, pr, sha, state: "OPEN" });
  assert.ok((await f.call("gh pr edit 1 -R example/other --add-reviewer @copilot")).deny);
});

test("attached Gradle project directories cannot inherit the session repository's cache pause", async () => {
  const f = fixture();
  f.data.validations.push({ sha, tasks: "test", at: new Date(now).toISOString(), exit: 0, dirty: false });
  f.pause("test-cache");
  for (const flag of ["--project-dir=/other", "-p/other", "-p=/other", "--project-dir='$UNKNOWN'"]) {
    assert.ok((await f.call(`./gradlew ${flag} test`)).deny, flag);
  }
  for (const flag of ["--project-dir=/project", "-p/project", "-p=/project"]) {
    assert.equal((await f.call(`./gradlew ${flag} test`)).deny, null, flag);
  }
});

test("compound commands retain unrelated rules and all approval gates", async () => {
  const f = fixture();
  f.pause("rebase");
  for (const suffix of [
    "git commit --amend", "firebase deploy", "gh pr merge 1 -R example/project",
    "./gradlew publishToMavenLocal", "gh variable set NAME --body value",
  ]) assert.ok((await f.call(`git rebase topic && ${suffix}`)).deny, suffix);
  assert.equal(f.data.approvals.length, 0);
  f.data.approvals.push({ kind: "deploy", target: "play", expiresAt: "2099-01-01" });
  assert.match((await f.call("git rebase topic && ./gradlew publishToMavenLocal")).deny, /not verified/);
  for (const tool of ["merge_pull_request", "run_workflow"]) {
    const result = await decide({ toolName: tool, args: { workflow_id: "firebase-deploy.yml" }, cwd: "/project", sessionId: "owner" }, f.deps);
    assert.ok(result.deny, tool);
  }
});

test("test-cache pause retains recording and the shared Gradle wrapper", async () => {
  const f = fixture();
  f.data.validations.push({ sha, tasks: "test", at: new Date(now).toISOString(), exit: 0, dirty: false });
  assert.ok((await f.call("./gradlew test")).deny);
  f.pause("test-cache");
  const result = await f.call("./gradlew test");
  assert.equal(result.deny, null);
  assert.equal(result.post[0].kind, "gradle");
  if (fs.existsSync("/usr/bin/lockf")) {
    assert.equal(result.lane, true);
    assert.match(result.modifiedArgs.command, /lockf.*gradle\.lock/);
  }
  assert.ok((await f.call("./gradlew test", "/other")).deny);
});

test("review-limit pause still records requests and respects action repository", async () => {
  const f = fixture();
  f.data.units[`${repo}#1`] = { repo, pr: 1, reviews: [{ sha }] };
  f.data.units["example/other#1"] = { repo: "example/other", pr: 1, reviews: [{ sha }] };
  const command = "gh pr edit 1 -R example/project --add-reviewer @copilot";
  assert.ok((await f.call(command)).deny);
  f.pause("review-limit");
  const result = await f.call(command);
  assert.equal(result.deny, null);
  assert.equal(result.post[0].kind, "review");
  assert.ok((await f.call(command.replace(repo, "example/other"))).deny);
});

test("source protection and interactive routing remain outside the controls", async () => {
  const f = fixture();
  for (const g of ["rebase", "amend", "force-push", "push-main", "review-limit", "test-cache"]) f.pause(g);
  assert.ok((await f.call("echo text > /protected/file")).deny);
  const write = await decide({ toolName: "apply_patch", args: { patch: "*** Update File: /protected/file" }, cwd: "/project", sessionId: "owner" }, f.deps);
  assert.ok(write.deny);
  const interactive = await decide({ toolName: "write_bash", args: { input: "git rebase topic{enter}" }, cwd: "/project", sessionId: "owner" }, f.deps);
  assert.ok(interactive.deny);
});

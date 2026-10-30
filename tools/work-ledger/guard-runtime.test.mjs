import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { makeLookups } from "./lib/gh.mjs";
import { decide, DEFAULT_CONFIG } from "./lib/policy.mjs";
import { emptyLedger } from "./lib/store.mjs";
import { parseGuardCommand, applyGuardCommand } from "./lib/guard-switches.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-runtime-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  git("remote", "add", "origin", "https://github.com/example/project.git");
  return { dir, git };
}

test("scope lookup uses actual Git origins and push destinations, never a default repository", async (t) => {
  const { dir, git } = fixture(t);
  const lookups = makeLookups({ gh: null });
  assert.equal(await lookups.scopeRepo(dir), "example/project");
  assert.equal(await lookups.scopeRepo(dir, null), "example/project");
  git("remote", "set-url", "--push", "origin", "git@github.com:example/other.git");
  assert.equal(await lookups.scopeRepo(dir), "example/project");
  assert.equal(await lookups.scopeRepo(dir, "origin"), "example/other");
  git("remote", "set-url", "--add", "--push", "origin", "https://github.com/example/project.git");
  assert.equal(await lookups.scopeRepo(dir, "origin"), null, "multiple destinations must fail closed");
  for (const [url, want] of [
    ["https://github.com/example/other.git", null],
    ["git@github.com:example/other.git", null],
    ["ssh://git@github.com/example/other.git", null],
    ["https://other.example/example/project.git", null], ["--upload-pack=bad", null],
    ["/local/path", null], ["missing", null],
  ]) assert.equal(await lookups.scopeRepo(dir, url), want, url);
  assert.equal(await lookups.scopeRepo(path.join(dir, "missing")), null);
});

test("literal URLs retain enforcement and named remotes use Git URL rewrites", async (t) => {
  const { dir, git } = fixture(t);
  const lookups = makeLookups({ gh: null });
  git("config", "url.https://github.com/example/other.git.insteadOf", "https://github.com/example/project.git");
  assert.equal(await lookups.scopeRepo(dir, "https://github.com/example/project.git"), null);
  assert.equal(await lookups.scopeRepo(dir, "origin"), "example/other");
  git("config", "--unset-all", "url.https://github.com/example/other.git.insteadOf");
  git("config", "url.https://github.com/example/push.git.pushInsteadOf", "https://github.com/example/project.git");
  assert.equal(await lookups.scopeRepo(dir), "example/project");
  assert.equal(await lookups.scopeRepo(dir, "origin"), "example/push");
});

test("symlink plus parent traversal cannot transfer a pause through lexical path normalization", async (t) => {
  const { dir, git } = fixture(t);
  for (const name of ["base/target", "physical/child", "physical/target"]) fs.mkdirSync(path.join(dir, name), { recursive: true });
  git("-C", "physical/target", "init", "--quiet");
  git("-C", "physical/target", "remote", "add", "origin", "https://github.com/example/other.git");
  fs.symlinkSync(path.join(dir, "physical/child"), path.join(dir, "base/link"));
  const actionPath = `${dir}/base/link/../target`;
  const lookups = makeLookups({ gh: null });
  assert.equal(await lookups.scopeRepo(actionPath), "example/other", "Git physically resolves the symlink before ..");
  const data = emptyLedger();
  const now = Date.now();
  const context = { repo: "example/project", sessionId: "owner", messageId: "r", owner: true, now };
  for (const guard of ["rebase", "test-cache"]) {
    const preview = applyGuardCommand(data, parseGuardCommand(`guard ${guard} off`), context);
    applyGuardCommand(data, parseGuardCommand(preview.confirmation), { ...context, messageId: "c", now: now + 1 });
  }
  const sha = "a".repeat(40);
  data.validations.push({ sha, tasks: "test", at: new Date(now).toISOString(), exit: 0, dirty: false });
  const deps = {
    data, config: { ...DEFAULT_CONFIG }, now: now + 2,
    lookups: { ...lookups, gitHead: async () => sha, gitDirty: async () => false },
  };
  for (const command of [
    `git -C ${actionPath} rebase topic`,
    `./gradlew --project-dir=${actionPath} test`,
  ]) {
    const result = await decide({ toolName: "bash", args: { command }, cwd: dir, sessionId: "owner" }, deps);
    assert.ok(result.deny, command);
  }
});

test("real extension startup and reload contracts use disposable homes and ledgers", (t) => {
  const { dir } = fixture(t);
  const home = path.join(dir, "home");
  fs.mkdirSync(home);
  const env = {
    ...process.env, HOME: home, USERPROFILE: home,
    WORK_LEDGER_DIR: path.join(dir, "ledger"),
    TEST_SESSION_ID: "owner-runtime", COPILOT_HOME: path.join(home, ".copilot"),
  };
  for (const reload of [false, true]) {
    const result = spawnSync(process.execPath, [
      "--no-warnings", "--experimental-loader", path.join(root, "fixtures/sdk-loader.mjs"),
      path.join(root, "fixtures/runtime-driver.mjs"), path.join(root, "extension.mjs"),
    ], { cwd: dir, env: { ...env, TEST_RELOAD: reload ? "1" : "", TEST_SESSION_ID: reload ? "other-host" : "owner-runtime" }, encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /contract.*passed/);
  }
  assert.equal(fs.existsSync(path.join(home, ".copilot/work-ledger")), false);
});

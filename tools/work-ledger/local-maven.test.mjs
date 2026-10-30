import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide, DEFAULT_CONFIG } from "./lib/policy.mjs";
import { makeLookups } from "./lib/gh.mjs";
import { emptyLedger } from "./lib/store.mjs";
import { applyGuardCommand, parseGuardCommand, guardStatus } from "./lib/guard-switches.mjs";

const now = Date.parse("2026-10-30T10:00:00Z");
const hasLock = fs.existsSync("/usr/bin/lockf");
function assertLocalResult(result) {
  if (!hasLock) return assert.match(result.deny, /shared Gradle build lock is unavailable/);
  assert.equal(result.deny, null);
  assert.equal(result.lane, true);
  assert.match(result.modifiedArgs.command, /lockf/);
}
function fixture(t, projectName = "project") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "local-maven-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const cwd = path.join(fs.realpathSync(tmp), projectName);
  fs.mkdirSync(cwd);
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("remote", "add", "origin", "https://github.com/example/project.git");
  fs.writeFileSync(path.join(cwd, ".gitignore"), "build/\n");
  fs.writeFileSync(path.join(cwd, "build.gradle.kts"), "// Synthetic reviewed source; never executed.\n");
  fs.writeFileSync(path.join(cwd, "gradlew"), "#!/bin/sh\nexit 1\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture");
  const destination = path.join(cwd, "build", "kit-test-repository");
  const command = `./gradlew :core:publishMavenPublicationToKitTestRepository -PkitRepository=${destination}`;
  const scope = { repo: "example/project", label: "local test", cwd, sha: git("rev-parse", "HEAD"), launcher: path.join(cwd, "gradlew"), command, destination };
  const data = emptyLedger();
  data.guardPauses = [];
  data.guardRequests = [];
  const config = { ...DEFAULT_CONFIG, gradleCache: false, localMavenScopes: [scope] };
  const context = { owner: true, repo: scope.repo, sessionId: "owner", messageId: "request", now, config };
  const deps = { data, config, now: now + 2, lookups: makeLookups({ gh: null }), protectedDirs: [], lockFile: path.join(cwd, "gradle.lock") };
  const control = (text, ctx = context) => applyGuardCommand(data, parseGuardCommand(text), ctx);
  const pause = (suffix = "") => {
    const preview = control(`guard maven off${suffix}`);
    assert.ok(preview.confirmation, preview.text);
    assert.equal(data.guardPauses.length, 0);
    const result = control(preview.confirmation, { ...context, messageId: "confirmation", now: now + 1 });
    assert.match(result.text, /confirmed/);
    return preview;
  };
  const run = (cmd = command, dir = cwd, sessionId = "child") => decide({ toolName: "bash", args: { command: cmd }, cwd: dir, sessionId }, deps);
  return { tmp, cwd, git, scope, command, destination, data, config, context, deps, control, pause, run };
}

test("a confirmed Maven pause permits the exact reviewed local command and retains the shared wrapper", async t => {
  const f = fixture(t);
  assert.match((await f.run()).deny, /not verified|pause/i);
  const preview = f.pause();
  assert.match(preview.text, /local test/);
  assert.match(preview.text, new RegExp(f.scope.sha));
  assert.ok(preview.text.includes(f.destination));
  const result = await f.run();
  assertLocalResult(result);
  if (hasLock) assert.ok(result.modifiedArgs.command.includes(f.deps.lockFile));
  assert.equal(f.data.approvals.length, 0);
  assert.equal(f.data.guardPauses[0].confirmedMessageId, "confirmation");
  assert.match(guardStatus(f.data, f.context), /maven: paused/);
});

for (const [name, change] of [
  ["source edit", f => fs.appendFileSync(path.join(f.cwd, "build.gradle.kts"), "// edit\n")],
  ["untracked source despite status configuration", f => { f.git("config", "status.showUntrackedFiles", "no"); fs.writeFileSync(path.join(f.cwd, "settings.gradle.kts"), "// new\n"); }],
  ["assume-unchanged", f => { f.git("update-index", "--assume-unchanged", "build.gradle.kts"); fs.appendFileSync(path.join(f.cwd, "build.gradle.kts"), "// hidden\n"); }],
  ["skip-worktree", f => { f.git("update-index", "--skip-worktree", "build.gradle.kts"); fs.appendFileSync(path.join(f.cwd, "build.gradle.kts"), "// hidden\n"); }],
  ["changed SHA", f => { f.scope.sha = "a".repeat(40); }],
  ["new commit", f => { f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Next", "--allow-empty"); }],
  ["changed command", f => { f.scope.command += " --offline"; }],
  ["changed launcher", f => { f.scope.launcher = path.join(f.cwd, "other", "gradlew"); }],
  ["changed destination", f => { f.scope.destination += "-other"; }],
  ["changed label", f => { f.scope.label = "other"; }],
  ["changed repo", f => { f.git("remote", "set-url", "origin", "https://github.com/example/other.git"); }],
  ["expired pause", f => { f.deps.now = now + 1800000; }],
  ["missing descriptors", f => { f.config.localMavenScopes = []; }],
  ["disabled build lane", f => { f.config.gradleLane = false; }],
  ["missing lock path", f => { f.deps.lockFile = null; }],
]) {
  test(`Maven recovery rejects ${name}`, async t => {
    const f = fixture(t);
    f.pause();
    change(f);
    assert.ok((await f.run()).deny, name);
  });
}

test("session scope, restore, and repository isolation use the existing controls", async t => {
  const f = fixture(t);
  f.pause(" in session");
  assert.ok((await f.run()).deny);
  assertLocalResult(await f.run(f.command, f.cwd, "owner"));
  const restore = f.control("guard maven on in session");
  f.control(restore.confirmation, { ...f.context, messageId: "restore", now: now + 3 });
  assert.ok((await f.run(f.command, f.cwd, "owner")).deny);
});

test("a bare pause and generic deployment grants cannot substitute for a reviewed descriptor", async t => {
  const f = fixture(t);
  f.data.guardPauses.push({ guard: "maven", repo: f.scope.repo, scope: "repository", expiresAt: new Date(now + 60000).toISOString() });
  for (const target of ["play", "firebase", "maven", "environment"]) {
    f.data.approvals.push({ kind: "deploy", target, expiresAt: new Date(now + 60000).toISOString() });
  }
  assert.ok((await f.run()).deny);
});

test("configuration changes invalidate a pending confirmation", t => {
  const f = fixture(t);
  const preview = f.control("guard maven off");
  assert.ok(preview.confirmation, preview.text);
  f.scope.sha = "a".repeat(40);
  assert.match(f.control(preview.confirmation, { ...f.context, messageId: "confirm" }).text, /changed|mismatch|invalid/i);
  assert.equal(f.data.guardPauses.length, 0);
});

test("no descriptor means an explicit error and no preview", t => {
  const f = fixture(t);
  f.config.localMavenScopes = [];
  const result = f.control("guard maven off");
  assert.match(result.text, /scope|descriptor/i);
  assert.equal(f.data.guardRequests.length, 0);
});

test("Maven recovery rejects compounds, wrappers, remote destinations, and real deployments", async t => {
  const f = fixture(t);
  f.pause();
  for (const command of [
    `${f.command} && firebase deploy`, `${f.command} publishReleaseBundle`,
    `${f.command} appDistributionUploadDebug`, `bash -c '${f.command}'`,
    `env ${f.command}`, `cd ${f.cwd} && ${f.command}`, `${f.command} > build/log`,
    f.command.replace(f.destination, "https://example.invalid/maven"),
    "./gradlew publishToMavenLocal", "./gradlew publish",
    "firebase deploy", "./gradlew publishReleaseBundle",
  ]) assert.ok((await f.run(command)).deny, command);
});

for (const kind of ["project", "destination", "launcher"]) {
  test(`Maven recovery rejects a symlink in the ${kind}`, async t => {
    const f = fixture(t);
    f.pause();
    if (kind === "project") {
      const link = path.join(f.cwd, "alias");
      fs.symlinkSync(f.cwd, link);
      assert.ok((await f.run(f.command, link)).deny);
    } else if (kind === "destination") {
      fs.mkdirSync(path.join(f.cwd, "elsewhere"));
      fs.symlinkSync(path.join(f.cwd, "elsewhere"), path.join(f.cwd, "build"));
      assert.ok((await f.run()).deny);
    } else {
      fs.renameSync(path.join(f.cwd, "gradlew"), path.join(f.cwd, "real-launcher"));
      fs.symlinkSync("real-launcher", path.join(f.cwd, "gradlew"));
      assert.ok((await f.run()).deny);
    }
  });
}

test("invalid descriptors never become Maven permissions, even when confirmed", async t => {
  const changes = [
    f => { f.scope.command = f.command.replace("./gradlew", "gradlew"); },
    f => { f.scope.destination = "https://example.invalid/maven"; },
    f => { f.scope.destination = path.join(f.cwd, "elsewhere"); },
    f => { f.scope.command += " && firebase deploy"; },
    f => { f.scope.command += " --project-dir=/elsewhere"; },
    f => { f.scope.command += " -I/elsewhere/init.gradle"; },
    f => { f.scope.command += " publishReleaseBundle"; },
    f => { f.scope.sha = f.scope.sha.slice(0, 7); },
  ];
  for (const change of changes) {
    const f = fixture(t);
    change(f);
    const p = f.control("guard maven off");
    if (p.confirmation) f.control(p.confirmation, { ...f.context, messageId: "confirmed" });
    assert.ok((await f.run(f.scope.command)).deny);
  }
});

test("source protection is not bypassed by a verified Maven pause", async t => {
  const f = fixture(t);
  f.pause();
  f.deps.protectedDirs = [f.cwd];
  assert.ok((await f.run()).deny);
  assert.ok((await f.run(`${f.command}; touch ${f.cwd}/config.json`)).deny);
});

test("tracked bytes are verified even when Git trusts unchanged stat metadata", async t => {
  const f = fixture(t);
  f.pause();
  const file = path.join(f.cwd, "build.gradle.kts");
  const before = fs.statSync(file);
  const bytes = fs.readFileSync(file);
  bytes[0] = 35;
  fs.writeFileSync(file, bytes);
  fs.utimesSync(file, before.atime, before.mtime);
  assert.ok((await f.run()).deny);
});

test("an explicit tracked nested launcher works but an untracked launcher never does", async t => {
  const f = fixture(t);
  const dir = path.join(f.cwd, "scripts", "lowmem");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "gradlew"), "#!/bin/sh\nexit 1\n");
  f.scope.launcher = path.join(dir, "gradlew");
  f.scope.command = f.command.replace("./gradlew", "./scripts/lowmem/gradlew");
  f.pause();
  assert.ok((await f.run(f.scope.command)).deny);
  f.git("add", ".");
  f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Tracked launcher");
  f.scope.sha = f.git("rev-parse", "HEAD");
  assert.ok((await f.run(f.scope.command)).deny, "a new SHA requires a new confirmation");
  const p = f.control("guard maven off");
  f.control(p.confirmation, { ...f.context, messageId: "new-confirmation" });
  assertLocalResult(await f.run(f.scope.command));
});

test("the disposable entry point confirms Maven scopes and never permits a batch without locking", t => {
  const f = fixture(t);
  const home = path.join(f.tmp, "home");
  const ledger = path.join(f.tmp, "ledger");
  fs.mkdirSync(home);
  fs.mkdirSync(ledger);
  fs.writeFileSync(path.join(ledger, "config.json"), JSON.stringify(f.config));
  const root = path.dirname(fileURLToPath(import.meta.url));
  for (const reload of [false, true]) {
    const result = spawnSync(process.execPath, [
      "--no-warnings", "--experimental-loader", path.join(root, "fixtures/sdk-loader.mjs"),
      path.join(root, "fixtures/maven-runtime-driver.mjs"), path.join(root, "extension.mjs"),
    ], {
      cwd: f.cwd, encoding: "utf8", timeout: 20000,
      env: { ...process.env, HOME: home, USERPROFILE: home, COPILOT_HOME: path.join(home, ".copilot"),
        WORK_LEDGER_DIR: ledger, TEST_RELOAD: reload ? "1" : "", TEST_SESSION_ID: reload ? "other-host" : "owner-runtime" },
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Maven contract passed/);
  }
});

test("literal task names cannot impersonate the shared lock wrapper", async t => {
  const f = fixture(t);
  f.scope.command = f.command.replace(":core:", ":lockf:gradle.lock:");
  f.pause();
  assertLocalResult(await f.run(f.scope.command));
});

test("a descriptor cannot add an unknown non-Maven task", async t => {
  const f = fixture(t);
  f.scope.command += " customRemoteUpload";
  const p = f.control("guard maven off");
  if (p.confirmation) f.control(p.confirmation, { ...f.context, messageId: "confirm" });
  assert.ok((await f.run(f.scope.command)).deny);
});

test("launcher traversal through an ignored symlink cannot select untracked executable bytes", async t => {
  const f = fixture(t);
  const outside = path.join(f.tmp, "outside");
  fs.mkdirSync(path.join(outside, "a", "b"), { recursive: true });
  fs.writeFileSync(path.join(outside, "gradlew"), "# outside launcher, never executed\n");
  fs.mkdirSync(path.join(f.cwd, "build"));
  fs.symlinkSync(path.join(outside, "a", "b"), path.join(f.cwd, "build", "alias"));
  const executable = "./build/alias/../../gradlew";
  assert.equal(fs.readFileSync(`${f.cwd}/${executable}`, "utf8"), "# outside launcher, never executed\n");
  assert.equal(f.git("status", "--porcelain"), "", "the malicious path is ignored, not a dirty source");
  f.scope.command = f.command.replace("./gradlew", executable);
  const preview = f.control("guard maven off");
  if (preview.confirmation) f.control(preview.confirmation, { ...f.context, messageId: "confirm" });
  assert.ok((await f.run(f.scope.command)).deny);
});

test("Git replacement refs cannot present an unreviewed tree at the reviewed SHA", async t => {
  const f = fixture(t);
  f.pause();
  fs.appendFileSync(path.join(f.cwd, "build.gradle.kts"), "// unreviewed replacement\n");
  f.git("add", ".");
  f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Replacement");
  const replacement = f.git("rev-parse", "HEAD");
  f.git("update-ref", "HEAD", f.scope.sha);
  f.git("replace", f.scope.sha, replacement);
  assert.equal(f.git("rev-parse", "HEAD"), f.scope.sha);
  assert.equal(f.git("status", "--porcelain"), "", "replacement refs can mask the unreviewed tree");
  assert.ok((await f.run()).deny);
});

for (const part of ["leaf", "ancestor"]) {
  test(`a dangling ${part} symlink cannot be a canonical output path`, async t => {
    const f = fixture(t);
    if (part === "ancestor") {
      f.scope.destination = path.join(f.cwd, "build", "nested", "repo");
      f.scope.command = f.command.replace(f.destination, f.scope.destination);
    }
    f.pause();
    const link = part === "leaf" ? f.scope.destination : path.dirname(f.scope.destination);
    fs.mkdirSync(path.join(f.cwd, "build"));
    fs.symlinkSync(path.join(f.tmp, "missing-outside"), link);
    assert.equal(f.git("status", "--porcelain"), "");
    assert.ok((await f.run(f.scope.command)).deny);
  });
}

test("launcher tracking uses literal paths, not Git pathspec magic", async t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.cwd, ".gitignore"), ":\n");
  f.git("add", ".");
  f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Ignore synthetic directory");
  f.scope.sha = f.git("rev-parse", "HEAD");
  fs.mkdirSync(path.join(f.cwd, ":"));
  fs.writeFileSync(path.join(f.cwd, ":", "gradlew"), "# untracked launcher, never executed\n");
  f.scope.launcher = path.join(f.cwd, ":", "gradlew");
  f.scope.command = f.command.replace("./gradlew", "./:/gradlew");
  f.pause();
  assert.equal(f.git("status", "--porcelain"), "");
  assert.ok((await f.run(f.scope.command)).deny);
});

test("a ..project child of protected source cannot receive a Maven exception", async t => {
  const f = fixture(t, "..project");
  f.pause();
  f.deps.protectedDirs = [fs.realpathSync(f.tmp)];
  assert.ok((await f.run()).deny);
});

test("a project containing ..ledger protected data cannot receive a Maven exception", async t => {
  const f = fixture(t);
  const protectedDir = path.join(f.cwd, "..ledger");
  fs.mkdirSync(protectedDir);
  fs.writeFileSync(path.join(protectedDir, "data.txt"), "synthetic guard data\n");
  fs.appendFileSync(path.join(f.cwd, ".git", "info", "exclude"), "\n..ledger/\n");
  f.pause();
  f.deps.protectedDirs = [protectedDir];
  assert.equal(f.git("status", "--porcelain"), "");
  assert.ok((await f.run()).deny);
});

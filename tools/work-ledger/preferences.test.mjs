import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { makeLookups } from "./lib/gh.mjs";
import { applyPlan, planOwnerMessage } from "./lib/grants.mjs";
import { decide, DEFAULT_CONFIG } from "./lib/policy.mjs";
import { loadPreferences, resolveDataDir } from "./lib/preferences.mjs";
import { emptyLedger } from "./lib/store.mjs";

function tempDirs(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-prefs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, "data");
  const extDir = path.join(root, "ext");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(extDir, { recursive: true });
  return { root, dataDir, extDir };
}

test("DEFAULT_CONFIG externalizes personal repository defaults and defines outage bounds", () => {
  assert.equal(DEFAULT_CONFIG.defaultRepo, null);
  assert.equal(DEFAULT_CONFIG.outageRetryCap, 3);
  assert.deepEqual(DEFAULT_CONFIG.outageBackoffSec, [30, 120, 300]);
  assert.doesNotMatch(JSON.stringify(DEFAULT_CONFIG), /SmarType|divydvd/i);
});

test("loadPreferences merges defaults <- dataDir <- extDir and emits a deterministic 12-hex digest", (t) => {
  const { dataDir, extDir } = tempDirs(t);
  const base = loadPreferences({ dataDir, extDir });
  assert.deepEqual(base.configWarnings, []);
  assert.equal(base.config.defaultRepo, null);
  assert.equal(base.config.reviewCap, 3);
  assert.equal(base.config.outageRetryCap, 3);
  assert.match(base.configDigest, /^[0-9a-f]{12}$/);

  fs.writeFileSync(path.join(dataDir, "config.json"), JSON.stringify({
    defaultRepo: "acme/from-data",
    reviewCap: 4,
    outageRetryCap: 2,
  }));
  fs.writeFileSync(path.join(extDir, "config.json"), JSON.stringify({
    defaultRepo: "acme/from-ext",
    outageRetryCap: 0,
  }));

  const merged = loadPreferences({ dataDir, extDir });
  assert.deepEqual(merged.configWarnings, []);
  assert.equal(merged.config.defaultRepo, "acme/from-ext");
  assert.equal(merged.config.reviewCap, 4);
  assert.equal(merged.config.outageRetryCap, 0);
  assert.match(merged.configDigest, /^[0-9a-f]{12}$/);
  assert.notEqual(merged.configDigest, base.configDigest);

  // Key ordering in config.json must not change canonical configDigest.
  fs.writeFileSync(path.join(extDir, "config.json"), JSON.stringify({
    outageRetryCap: 0,
    defaultRepo: "acme/from-ext",
  }));
  assert.equal(loadPreferences({ dataDir, extDir }).configDigest, merged.configDigest);
});

test("malformed config.json syntax and non-object roots fail closed with warnings", (t) => {
  const { dataDir, extDir } = tempDirs(t);
  fs.writeFileSync(path.join(dataDir, "config.json"), "{ invalid json");
  fs.writeFileSync(path.join(extDir, "config.json"), JSON.stringify(["not", "an", "object"]));

  const loaded = loadPreferences({ dataDir, extDir });
  assert.equal(loaded.config.defaultRepo, null);
  assert.equal(loaded.config.reviewCap, DEFAULT_CONFIG.reviewCap);
  assert.equal(loaded.config.outageRetryCap, DEFAULT_CONFIG.outageRetryCap);
  assert.equal(loaded.configWarnings.length, 2);
  assert.match(loaded.configWarnings[0], /config\.json/i);
  assert.match(loaded.configWarnings[1], /config\.json/i);
});

test("invalid config fields fall back safely, clamp outageRetryCap to 0..5, and keep guards active", async (t) => {
  const { root, dataDir, extDir } = tempDirs(t);
  fs.writeFileSync(path.join(dataDir, "config.json"), JSON.stringify({
    reviewCap: -5,
    mergeApprovalHours: 0,
    deployApprovalHours: 9999,
    reviewGrantHours: 1.5,
    gradleLockTimeoutSec: "fast",
    defaultRepo: "bad string",
    outageRetryCap: 99,
    outageBackoffSec: [-1, 0],
    gradleLane: "yes",
    deployWorkflows: ["not-a-map"],
    localMavenScopes: "bad",
    readOnlyMonitors: 42,
  }));

  const loaded = loadPreferences({ dataDir, extDir });
  assert.equal(loaded.config.reviewCap, 3);
  assert.equal(loaded.config.mergeApprovalHours, 24);
  assert.equal(loaded.config.deployApprovalHours, 2);
  assert.equal(loaded.config.reviewGrantHours, 24);
  assert.equal(loaded.config.gradleLockTimeoutSec, 1500);
  assert.equal(loaded.config.defaultRepo, null);
  assert.equal(loaded.config.outageRetryCap, 5, "outageRetryCap > 5 clamps to 5");
  assert.deepEqual(loaded.config.outageBackoffSec, [30, 120, 300]);
  assert.equal(loaded.config.gradleLane, true);
  assert.equal(loaded.config.deployWorkflows, null);
  assert.deepEqual(loaded.config.localMavenScopes, []);
  assert.deepEqual(loaded.config.readOnlyMonitors, []);
  assert.ok(loaded.configWarnings.length >= 10);

  for (const traversalRepo of ["../bad", "./repo", "owner/..", "owner/.", "/a/b", "a/b/c"]) {
    fs.writeFileSync(path.join(extDir, "config.json"), JSON.stringify({ defaultRepo: traversalRepo, outageRetryCap: -2 }));
    const res = loadPreferences({ dataDir: path.join(root, "empty"), extDir });
    assert.equal(res.config.defaultRepo, null, traversalRepo);
    assert.equal(res.config.outageRetryCap, 3, traversalRepo);
    assert.equal(res.configWarnings.length, 2, traversalRepo);
  }

  // Command guards remain active under sanitized config.
  const data = emptyLedger();
  const deps = {
    data,
    config: loaded.config,
    now: Date.now(),
    protectedDirs: [dataDir, extDir],
    lockFile: path.join(dataDir, "gradle.lock"),
    lookups: { ...makeLookups({ gh: null }), remoteRepo: async () => "acme/widget", prHead: async () => ({ sha: "a".repeat(40), state: "OPEN" }) },
  };
  for (const command of ["git push --force origin feature", "gh pr merge 12", "firebase deploy"]) {
    const res = await decide({ toolName: "bash", args: { command }, cwd: root, sessionId: "s1" }, deps);
    assert.ok(res.deny, `guard must still block: ${command}`);
  }
});

test("resolveDataDir honors WORK_LEDGER_DIR, expands ~/ in extDir config, and warns on corrupt extDir config", (t) => {
  const { root, extDir } = tempDirs(t);
  fs.writeFileSync(path.join(extDir, "config.json"), JSON.stringify({ dataDir: "~/custom-wl" }));
  const fromExt = resolveDataDir({ envDir: "", extDir, homeDir: path.join(root, "home") });
  assert.equal(fromExt.dataDir, path.join(root, "home", "custom-wl"));
  assert.deepEqual(fromExt.bootstrapWarnings, []);

  const fromEnv = resolveDataDir({ envDir: path.join(root, "env-wl"), extDir, homeDir: path.join(root, "home") });
  assert.equal(fromEnv.dataDir, path.join(root, "env-wl"));

  fs.writeFileSync(path.join(extDir, "config.json"), "{broken");
  const fallback = resolveDataDir({ envDir: "", extDir, homeDir: path.join(root, "home") });
  assert.equal(fallback.dataDir, path.join(root, "home", ".copilot", "work-ledger"));
  assert.equal(fallback.bootstrapWarnings.length, 1);
});

test("Git remote resolves unqualified PR commands when config.json is absent, and repo-less commands ask for owner/repo#N", async (t) => {
  const { root } = tempDirs(t);
  const repoDir = path.join(root, "checkout");
  const bareDir = path.join(root, "no-git");
  fs.mkdirSync(repoDir);
  fs.mkdirSync(bareDir);
  execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/acme/widget.git"], { cwd: repoDir });

  const lookups = makeLookups({ gh: null });
  const detectedRepo = await lookups.remoteRepo(repoDir);
  assert.equal(detectedRepo, "acme/widget");

  const withRemote = planOwnerMessage("merge #12", { sessionId: "s1", defaultRepo: detectedRepo });
  assert.deepEqual(withRemote.merges, [{ repo: "acme/widget", pr: 12, anyway: false }]);

  assert.equal(await lookups.remoteRepo(bareDir), null);
  let prHeadCalls = 0;
  const fakePrHead = async (r) => { prHeadCalls++; return r ? { sha: "b".repeat(40), state: "OPEN" } : null; };

  for (const [input, expectedHint] of [
    ["merge #12", 'merge owner/repo#12'],
    ["review again #12", 'review again owner/repo#12'],
    ["don't merge #12", "don't merge owner/repo#12"],
  ]) {
    const data = emptyLedger();
    const plan = planOwnerMessage(input, { sessionId: "s1", defaultRepo: null });
    const heads = new Map();
    for (const m of plan.merges) {
      if (m.repo) heads.set(`${m.repo}#${m.pr}`, await fakePrHead(m.repo, m.pr));
    }
    const notes = applyPlan(data, plan, { heads, sessionId: "s1", text: input, config: DEFAULT_CONFIG });
    assert.equal(prHeadCalls, 0);
    assert.deepEqual(data.approvals, []);
    assert.equal(notes.length, 1, input);
    assert.ok(notes[0].includes(expectedHint), `expected "${expectedHint}" in "${notes[0]}"`);
    assert.doesNotMatch(notes[0], /null#|SmarType/i);
  }
});

test("run-rerun deploy guard stays fail-closed when defaultRepo is null, and adversarial config.json inputs are rejected", async (t) => {
  const { root, dataDir, extDir } = tempDirs(t);

  // 1. Symlink at config.json must be rejected with a warning.
  const outsideCfg = path.join(root, "outside.json");
  fs.writeFileSync(outsideCfg, JSON.stringify({ defaultRepo: "evil/repo" }));
  fs.symlinkSync(outsideCfg, path.join(extDir, "config.json"));
  const symlinkRes = loadPreferences({ dataDir, extDir });
  assert.equal(symlinkRes.config.defaultRepo, null);
  assert.ok(symlinkRes.configWarnings.some((w) => /symlink|regular file/i.test(w)));
  fs.unlinkSync(path.join(extDir, "config.json"));

  // 2. Empty deployWorkflows {} must warn and preserve DEFAULT_DEPLOY_WORKFLOWS, and __proto__ must not collide or pollute.
  fs.writeFileSync(path.join(dataDir, "config.json"), '{"deployWorkflows":{}}');
  const emptyDw = loadPreferences({ dataDir, extDir });
  assert.equal(emptyDw.config.deployWorkflows, null);
  assert.ok(emptyDw.configWarnings.some((w) => /deployWorkflows/i.test(w)));

  fs.writeFileSync(path.join(dataDir, "config.json"), '{"deployWorkflows":{"__proto__":"play","custom-deploy.yml":"firebase"}}');
  const customDw = loadPreferences({ dataDir, extDir });
  assert.equal(Object.getPrototypeOf(customDw.config.deployWorkflows), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(customDw.config.deployWorkflows, "__proto__"), false);
  assert.equal(customDw.config.deployWorkflows["custom-deploy.yml"], "firebase");
  assert.equal(customDw.config.deployWorkflows["firebase-production-approve.yml"], "firebase");

  // 3. run-rerun resolves repo from git remote when defaultRepo is null and denies unapproved deploy workflow re-runs.
  const data = emptyLedger();
  const seenRepos = [];
  const deps = {
    data,
    config: emptyDw.config,
    now: Date.now(),
    protectedDirs: [dataDir, extDir],
    lockFile: path.join(dataDir, "gradle.lock"),
    lookups: {
      ...makeLookups({ gh: null }),
      remoteRepo: async () => "acme/prod-app",
      runWorkflow: async (repo) => { seenRepos.push(repo); return repo ? "firebase-production-approve.yml" : null; },
      jobWorkflow: async (repo) => { seenRepos.push(repo); return repo ? "firebase-production-approve.yml" : null; },
    },
  };
  for (const cmd of [
    "gh run rerun 67890",
    "gh api -X POST repos/{owner}/{repo}/actions/jobs/12345/rerun",
    "gh workflow run firebase-production-approve.yml",
  ]) {
    const res = await decide({ toolName: "bash", args: { command: cmd }, cwd: root, sessionId: "s1" }, deps);
    assert.ok(res.deny, `expected deploy denial for: ${cmd}`);
  }
  assert.deepEqual(seenRepos, ["acme/prod-app", "acme/prod-app"]);
});

test("final review regressions: canonical absolute dataDir validation and repo-less same-message revoke", (t) => {
  const { root, extDir } = tempDirs(t);
  const homeDir = path.join(root, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  const expectedFallback = path.join(homeDir, ".copilot", "work-ledger");

  // 1. Relative, traversal, or symlinked dataDir in <extDir>/config.json or envDir must warn and fall back.
  const realTarget = path.join(root, "real-data");
  fs.mkdirSync(realTarget, { recursive: true });
  const linkPath = path.join(root, "symlink-data");
  fs.symlinkSync(realTarget, linkPath);

  for (const badDir of ["../escape", "state", `${root}/sub/../escape`, linkPath]) {
    fs.writeFileSync(path.join(extDir, "config.json"), JSON.stringify({ dataDir: badDir }));
    const fromExt = resolveDataDir({ envDir: "", extDir, homeDir });
    assert.equal(fromExt.dataDir, expectedFallback, `extDir dataDir ${badDir} must fall back`);
    assert.ok(fromExt.bootstrapWarnings.length > 0, `extDir dataDir ${badDir} must emit warning`);

    const fromEnv = resolveDataDir({ envDir: badDir, extDir, homeDir });
    assert.equal(fromEnv.dataDir, expectedFallback, `envDir ${badDir} must fall back`);
    assert.ok(fromEnv.bootstrapWarnings.length > 0, `envDir ${badDir} must emit warning`);
  }

  // 2. When defaultRepo is null, "merge acme/widget#12 and don't merge #12" cancels in the same message,
  // and standalone "don't merge #12" revokes a single unambiguous active #12 merge approval in that session.
  const data = emptyLedger();
  const sameMsg = planOwnerMessage("merge acme/widget#12 and don't merge #12", { sessionId: "s1", defaultRepo: null });
  assert.deepEqual(sameMsg.merges, []);

  const grantPlan = planOwnerMessage("merge acme/widget#12", { sessionId: "s1", defaultRepo: null });
  applyPlan(data, grantPlan, {
    heads: new Map([["acme/widget#12", { sha: "a".repeat(40), state: "OPEN" }]]),
    sessionId: "s1",
    text: "merge acme/widget#12",
    config: DEFAULT_CONFIG,
  });
  assert.equal(data.approvals.filter((a) => !a.usedAt).length, 1);

  const revokePlan = planOwnerMessage("don't merge #12", {
    sessionId: "s1",
    approvals: data.approvals,
    defaultRepo: null,
  });
  const revokeNotes = applyPlan(data, revokePlan, {
    heads: new Map(),
    sessionId: "s1",
    text: "don't merge #12",
    config: DEFAULT_CONFIG,
  });
  assert.equal(data.approvals.filter((a) => !a.usedAt).length, 0);
  assert.ok(revokeNotes.some((n) => /acme\/widget#12 cancelled/i.test(n)));
});


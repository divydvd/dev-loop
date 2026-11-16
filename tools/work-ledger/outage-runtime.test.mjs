import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const loaderPath = path.join(root, "fixtures/sdk-loader.mjs");
const extensionPath = path.join(root, "extension.mjs");

function cleanChildEnv(extra = {}) {
  const out = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    WORK_LEDGER_GH: "/usr/bin/false",
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("GIT_") || k === "NODE_TEST_CONTEXT" || k === "NODE_OPTIONS") continue;
    out[k] = v;
  }
  return { ...out, ...extra };
}

function makeSandbox(t, { withRemote = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-outage-rt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, "home");
  const ledgerDir = path.join(dir, "ledger");
  const repoDir = path.join(dir, "repo");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  const env = cleanChildEnv({
    HOME: home,
    USERPROFILE: home,
    COPILOT_HOME: path.join(home, ".copilot"),
    WORK_LEDGER_DIR: ledgerDir,
    TEST_SESSION_ID: "owner-runtime",
  });
  const git = (...args) => execFileSync("git", args, { cwd: repoDir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test Runner");
  if (withRemote) git("remote", "add", "origin", "https://github.com/example/project.git");
  fs.writeFileSync(path.join(repoDir, "README.md"), "# fixture\n");
  git("add", "README.md");
  git("commit", "-m", "initial", "--quiet");
  return { dir, home, ledgerDir, repoDir, env, git };
}

function runInlineDriver(script, { cwd, env, timeout = 15000 }) {
  return spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-loader", loaderPath, "--input-type=module", "-e", script],
    { cwd, env, encoding: "utf8", timeout }
  );
}

test("malformed config.json warns fail-closed, exposes digest, rejects repo-less PR calls, and preserves guards", (t) => {
  const { dir, home, ledgerDir, repoDir, env } = makeSandbox(t, { withRemote: false });
  fs.writeFileSync(
    path.join(ledgerDir, "config.json"),
    JSON.stringify({ reviewCap: -5, defaultRepo: "bad string", outageRetryCap: 99 })
  );
  const driver = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import path from "node:path";
    import { pathToFileURL } from "node:url";

    await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
    const { options, logEntries, session } = globalThis.ledgerTestHost;
    const pre = (command) => options.hooks.onPreToolUse(
      { toolName: "bash", toolArgs: { command }, workingDirectory: process.cwd() },
      { sessionId: session.sessionId }
    );
    const get = options.tools.find((t) => t.name === "work_ledger_get").handler;
    const rec = options.tools.find((t) => t.name === "work_ledger_record").handler;

    const status = await get({});
    assert.match(status, /Config: digest=[0-9a-f]{12}, defaultRepo=git-remote/);

    const missingGet = await get({ pr: 7 });
    const missingGetText = typeof missingGet === "string" ? missingGet : missingGet.textResultForLlm;
    assert.match(missingGetText, /Cannot resolve a GitHub repository for #7/);

    const missingRec = await rec({ pr: 7, kind: "note", evidence: "opened" });
    const missingRecText = typeof missingRec === "string" ? missingRec : missingRec.textResultForLlm;
    assert.match(missingRecText, /Cannot record #7 without a GitHub repository/);

    const ledgerPath = path.join(process.env.WORK_LEDGER_DIR, "ledger.json");
    if (fs.existsSync(ledgerPath)) {
      const saved = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
      assert.equal(saved.units?.["null#7"], undefined);
    }

    const denied = await pre("git push --force origin main");
    assert.equal(denied?.permissionDecision, "deny");

    const errLog = fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "errors.log"), "utf8");
    assert.match(errLog, /reviewCap/);
    assert.match(errLog, /defaultRepo/);
    assert.match(errLog, /outageRetryCap/);
    assert.ok(logEntries.some((e) => e.meta?.level === "warning" && /\\[work-ledger\\]/.test(e.text)));
    console.log("prefs-driver-ok");
  `;
  const res = runInlineDriver(driver, { cwd: repoDir, env });
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /prefs-driver-ok/);
  assert.equal(fs.existsSync(path.join(home, ".copilot/work-ledger")), false);
});

test("away-mode transient outage deduplicates twin events, sends reconcile prompt, resets on progress, and exhausts at cap", (t) => {
  const { ledgerDir, repoDir, env } = makeSandbox(t, { withRemote: true });
  fs.writeFileSync(
    path.join(ledgerDir, "config.json"),
    JSON.stringify({ outageRetryCap: 2, outageBackoffSec: [1, 1] })
  );
  const sddDir = path.join(repoDir, ".superpowers/sdd/m5");
  fs.mkdirSync(sddDir, { recursive: true });
  fs.writeFileSync(
    path.join(sddDir, "progress.md"),
    "# SDD ledger — plan: docs/superpowers/plans/m5.md\nactive: true\n| Scope | session: owner-runtime, plan: docs/superpowers/plans/m5.md |\n| Owner activation | Direct 'away mode' instruction (msg-1) |\n"
  );

  const driver = `
    import assert from "node:assert/strict";
    import { execFileSync } from "node:child_process";
    import fs from "node:fs";
    import path from "node:path";
    import { pathToFileURL } from "node:url";

    await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
    const { options, callbacks, sentPrompts, nextPrompt } = globalThis.ledgerTestHost;
    const ledgerPath = path.join(process.env.WORK_LEDGER_DIR, "ledger.json");
    const readLedger = () => JSON.parse(fs.readFileSync(ledgerPath, "utf8"));

    assert.equal(typeof options.hooks.onErrorOccurred, "function");
    assert.equal(typeof callbacks.get("session.error"), "function");

    const promptPromise1 = nextPrompt();
    await options.hooks.onErrorOccurred({
      error: "HTTP 503 Service Unavailable",
      errorContext: "model_call",
      workingDirectory: process.cwd(),
    });
    await callbacks.get("session.error")({
      data: { errorType: "http_503", message: "HTTP 503 Service Unavailable" },
    });

    const duringRetry = readLedger().outageRecovery["owner-runtime"];
    assert.equal(duringRetry.attemptsUsed, 1);
    assert.equal(duringRetry.status, "retrying");

    const sent1 = await promptPromise1;
    assert.equal(sentPrompts.length, 1);
    assert.match(sent1.prompt, /docs\\/superpowers\\/plans\\/m5\\.md/);
    assert.match(sent1.prompt, /\\.superpowers\\/sdd\\/m5\\/progress\\.md/);
    assert.match(sent1.prompt, /git status/);
    assert.match(sent1.prompt, /git log -n 5/);
    assert.match(sent1.prompt, /work_ledger_get/);
    assert.equal(readLedger().outageRecovery["owner-runtime"].status, "resumed");

    execFileSync("git", ["commit", "--allow-empty", "-m", "progress", "--quiet"], { cwd: process.cwd() });
    await callbacks.get("session.idle")({ data: {} });
    const deadline = Date.now() + 2000;
    while (readLedger().outageRecovery["owner-runtime"].attemptsUsed !== 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(readLedger().outageRecovery["owner-runtime"].attemptsUsed, 0);
    assert.equal(readLedger().outageRecovery["owner-runtime"].status, "idle");

    for (let expectedAttempt = 1; expectedAttempt <= 2; expectedAttempt++) {
      const p = nextPrompt();
      await options.hooks.onErrorOccurred({
        error: "ETIMEDOUT upstream stream disconnected",
        workingDirectory: process.cwd(),
      });
      await p;
      assert.equal(readLedger().outageRecovery["owner-runtime"].attemptsUsed, expectedAttempt);
    }

    await options.hooks.onErrorOccurred({
      error: "HTTP 502 Bad Gateway",
      workingDirectory: process.cwd(),
    });
    assert.equal(readLedger().outageRecovery["owner-runtime"].status, "exhausted");
    assert.equal(readLedger().outageRecovery["owner-runtime"].attemptsUsed, 2);
    assert.equal(sentPrompts.length, 3);
    console.log("outage-cycle-ok");
  `;
  const res = runInlineDriver(driver, { cwd: repoDir, env, timeout: 20000 });
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /outage-cycle-ok/);
});

test("failed session.send preserves retrying state for onSessionStart fallback, and owner 'I\\'m back' cancels pending timer", (t) => {
  const { ledgerDir, repoDir, env } = makeSandbox(t, { withRemote: true });
  fs.writeFileSync(
    path.join(ledgerDir, "config.json"),
    JSON.stringify({ outageRetryCap: 3, outageBackoffSec: [1, 2, 2] })
  );
  const sddDir = path.join(repoDir, ".superpowers/sdd/m5");
  fs.mkdirSync(sddDir, { recursive: true });
  fs.writeFileSync(
    path.join(sddDir, "progress.md"),
    "# SDD ledger — plan: docs/superpowers/plans/m5.md\nactive: true\n| Scope | session: owner-runtime, plan: docs/superpowers/plans/m5.md |\n| Owner activation | Direct 'away mode' instruction (msg-1) |\n"
  );

  const step1 = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import path from "node:path";
    import { pathToFileURL } from "node:url";

    await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
    const host = globalThis.ledgerTestHost;
    host.failNextSend = true;
    await host.options.hooks.onErrorOccurred({
      error: "HTTP 503 Service Unavailable",
      workingDirectory: process.cwd(),
    });
    await new Promise((r) => setTimeout(r, 1250));
    const saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
    assert.equal(saved.outageRecovery["owner-runtime"].status, "retrying");
    assert.equal(saved.outageRecovery["owner-runtime"].attemptsUsed, 1);
    console.log("send-fallback-preserved");
  `;
  const r1 = runInlineDriver(step1, { cwd: repoDir, env });
  assert.equal(r1.status, 0, `${r1.stdout}\n${r1.stderr}`);
  assert.match(r1.stdout, /send-fallback-preserved/);

  const step2 = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import path from "node:path";
    import { pathToFileURL } from "node:url";

    await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
    const host = globalThis.ledgerTestHost;
    const startRes = await host.options.hooks.onSessionStart();
    assert.match(startRes.additionalContext, /Away-mode transient outage recovery \\(attempt 1\\/3/);
    assert.match(startRes.additionalContext, /docs\\/superpowers\\/plans\\/m5\\.md/);
    const saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
    assert.equal(saved.outageRecovery["owner-runtime"].status, "resumed");
    assert.equal(saved.outageRecovery["owner-runtime"].attemptsUsed, 1);

    await host.options.hooks.onErrorOccurred({
      error: "HTTP 503 Service Unavailable",
      workingDirectory: process.cwd(),
    });
    await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() }, { sessionId: host.session.sessionId });
    host.callbacks.get("user.message")({ id: "owner-back", data: { content: "I'm back" } });
    await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() }, { sessionId: host.session.sessionId });
    // Even if an HTTP 503 hits the "I'm back" turn before progress.md is updated on disk, no new retry may schedule.
    await host.options.hooks.onErrorOccurred({
      error: "HTTP 503 Service Unavailable",
      workingDirectory: process.cwd(),
    });
    await new Promise((r) => setTimeout(r, 2300));
    assert.equal(host.sentPrompts.length, 0);
    console.log("session-start-and-cancel-ok");
  `;
  const r2 = runInlineDriver(step2, { cwd: repoDir, env });
  assert.equal(r2.status, 0, `${r2.stdout}\n${r2.stderr}`);
  assert.match(r2.stdout, /session-start-and-cancel-ok/);

  // Also verify flipping progress.md to active: false while a timer is armed prevents session.send from firing.
  fs.writeFileSync(
    path.join(sddDir, "progress.md"),
    "# SDD ledger — plan: docs/superpowers/plans/m5.md\nactive: true\n| Scope | session: progress-flip-session, plan: docs/superpowers/plans/m5.md |\n| Owner activation | Direct 'away mode' instruction (msg-1) |\n"
  );
  const step3 = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import path from "node:path";
    import { pathToFileURL } from "node:url";

    await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
    const host = globalThis.ledgerTestHost;
    await host.options.hooks.onErrorOccurred({
      error: "HTTP 503 Service Unavailable",
      workingDirectory: process.cwd(),
    });
    fs.writeFileSync(
      path.join(process.cwd(), ".superpowers/sdd/m5/progress.md"),
      "# SDD ledger — plan: docs/superpowers/plans/m5.md\\nactive: false\\n| Scope | session: progress-flip-session, plan: docs/superpowers/plans/m5.md |\\n"
    );
    await new Promise((r) => setTimeout(r, 1300));
    assert.equal(host.sentPrompts.length, 0);
    console.log("progress-flip-cancelled-ok");
  `;
  const r3 = runInlineDriver(step3, { cwd: repoDir, env: { ...env, TEST_SESSION_ID: "progress-flip-session" } });
  assert.equal(r3.status, 0, `${r3.stdout}\n${r3.stderr}`);
  assert.match(r3.stdout, /progress-flip-cancelled-ok/);
});

test("SIGTERM clears a 300s .unref() retry timer and exits cleanly within 3s", async (t) => {
  const { ledgerDir, repoDir, env } = makeSandbox(t, { withRemote: true });
  fs.writeFileSync(
    path.join(ledgerDir, "config.json"),
    JSON.stringify({ outageRetryCap: 3, outageBackoffSec: [300, 300, 300] })
  );
  const sddDir = path.join(repoDir, ".superpowers/sdd/m5");
  fs.mkdirSync(sddDir, { recursive: true });
  fs.writeFileSync(
    path.join(sddDir, "progress.md"),
    "# SDD ledger — plan: docs/superpowers/plans/m5.md\nactive: true\n| Scope | session: owner-runtime, unref-session, plan: docs/superpowers/plans/m5.md |\n| Owner activation | Direct 'away mode' instruction (msg-1) |\n"
  );

  const keepAliveScript = `
    import { pathToFileURL } from "node:url";
    await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
    const host = globalThis.ledgerTestHost;
    await host.options.hooks.onErrorOccurred({
      error: "HTTP 503 Service Unavailable",
      workingDirectory: process.cwd(),
    });
    process.stdout.write("ARMED\\n");
    setInterval(() => {}, 60000);
  `;

  const child = spawn(
    process.execPath,
    ["--no-warnings", "--experimental-loader", loaderPath, "--input-type=module", "-e", keepAliveScript],
    { cwd: repoDir, env, stdio: ["pipe", "pipe", "pipe"] }
  );

  await new Promise((resolve, reject) => {
    let out = "";
    const to = setTimeout(() => reject(new Error(`Timed out waiting for ARMED. stdout=${out}`)), 8000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      if (out.includes("ARMED")) {
        clearTimeout(to);
        resolve();
      }
    });
    child.once("exit", (code, sig) => {
      clearTimeout(to);
      reject(new Error(`Exited prematurely: code=${code} sig=${sig}`));
    });
  });

  const saved = JSON.parse(fs.readFileSync(path.join(ledgerDir, "ledger.json"), "utf8"));
  assert.equal(saved.outageRecovery["owner-runtime"].status, "retrying");
  assert.equal(saved.outageRecovery["owner-runtime"].nextDelaySec, 300);

  const startedAt = Date.now();
  const exitInfo = await new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Child did not exit within 3000ms after SIGTERM"));
    }, 3000);
    child.once("exit", (code, signal) => {
      clearTimeout(to);
      resolve({ code, signal, elapsedMs: Date.now() - startedAt });
    });
    child.kill("SIGTERM");
  });

  assert.equal(exitInfo.code, 0);
  assert.ok(exitInfo.elapsedMs < 3000, `Expected < 3000ms, got ${exitInfo.elapsedMs}ms`);

  const naturalUnrefStart = Date.now();
  const naturalExit = runInlineDriver(
    `
      import { pathToFileURL } from "node:url";
      await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
      await globalThis.ledgerTestHost.options.hooks.onErrorOccurred({
        error: "HTTP 503 Service Unavailable",
        workingDirectory: process.cwd(),
      });
    `,
    { cwd: repoDir, env: { ...env, TEST_SESSION_ID: "unref-session" }, timeout: 10000 }
  );
  assert.equal(naturalExit.status, 0, `${naturalExit.stdout}\n${naturalExit.stderr}`);
  assert.ok(Date.now() - naturalUnrefStart < 9000, "300s unref timer must not block natural event-loop exit");
});

test("final review runtime regressions: uncreatable dataDir fails safe and quoted I'm back does not disable away mode", async (t) => {
  const { repoDir, env } = makeSandbox(t, { withRemote: true });
  const sddDir = path.join(repoDir, ".superpowers/sdd/m5");
  fs.mkdirSync(sddDir, { recursive: true });
  fs.writeFileSync(
    path.join(sddDir, "progress.md"),
    "# SDD ledger — plan: docs/superpowers/plans/m5.md\nactive: true\n| Scope | session: owner-runtime, plan: docs/superpowers/plans/m5.md |\n| Owner activation | Direct 'away mode' instruction (msg-1) |\n"
  );

  // 1. Quoted `I'm back` in an owner away-mode instruction does not set ownerReturnedAt,
  // and a subsequent direct unquoted "away mode" clears a prior ownerReturnedAt.
  const quotedBackScript = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import path from "node:path";
    import { pathToFileURL } from "node:url";

    fs.writeFileSync(
      path.join(process.env.WORK_LEDGER_DIR, "config.json"),
      JSON.stringify({ outageRetryCap: 2, outageBackoffSec: [1, 1] })
    );
    await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
    const host = globalThis.ledgerTestHost;
    await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() }, { sessionId: host.session.sessionId });

    host.callbacks.get("user.message")({
      id: "msg-quoted",
      data: { content: "Enter away mode until I type \`I'm back\` tonight." },
    });
    await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() }, { sessionId: host.session.sessionId });

    // Subagent and checkpoint session.error events must NOT arm root-session outage retries.
    host.callbacks.get("session.error")({ agentId: "sub-agent-1", data: { message: "HTTP 503 Service Unavailable" } });
    host.callbacks.get("session.error")({ checkpoint: true, data: { message: "HTTP 503 Service Unavailable" } });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(host.sentPrompts.length, 0);
    if (fs.existsSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"))) {
      const mid = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
      assert.notEqual(mid.outageRecovery?.["owner-runtime"]?.status, "retrying");
    }

    await host.options.hooks.onErrorOccurred({ error: "HTTP 503 Service Unavailable", workingDirectory: process.cwd() });
    let saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
    assert.equal(saved.outageRecovery["owner-runtime"].status, "retrying");

    host.callbacks.get("user.message")({ id: "msg-back", data: { content: "I'm back" } });
    await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() });
    saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
    const returnedCutoff = saved.outageRecovery["owner-runtime"].ownerReturnedAt;
    assert.ok(returnedCutoff);

    // Away-related questions after "I'm back" must NOT clear or override the return cutoff.
    host.callbacks.get("user.message")({ id: "msg-question", data: { content: "How does away mode work?" } });
    await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() });
    await host.options.hooks.onErrorOccurred({ error: "HTTP 503 Service Unavailable", workingDirectory: process.cwd() });
    saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
    assert.equal(saved.outageRecovery["owner-runtime"].ownerReturnedAt, returnedCutoff);
    assert.notEqual(saved.outageRecovery["owner-runtime"].status, "retrying");

    // A direct activation instruction re-enables recovery for this session's scoped assignment.
    host.callbacks.get("user.message")({ id: "msg-away-again", data: { content: "away mode" } });
    await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() });
    await host.options.hooks.onErrorOccurred({ error: "HTTP 503 Service Unavailable", workingDirectory: process.cwd() });
    saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
    assert.equal(saved.outageRecovery["owner-runtime"].status, "retrying");
    console.log("quoted-back-and-reenter-ok");
  `;
  const rQuoted = runInlineDriver(quotedBackScript, { cwd: repoDir, env });
  assert.equal(rQuoted.status, 0, `${rQuoted.stdout}\n${rQuoted.stderr}`);
  assert.match(rQuoted.stdout, /quoted-back-and-reenter-ok/);

  // 2. Uncreatable WORK_LEDGER_DIR ("/dev/null/sub") falls back safely without crashing extension startup.
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "wl-bad-datadir-home-"));
  t.after(() => fs.rmSync(tempHome, { recursive: true, force: true }));
  const badDirRes = runInlineDriver(
    `
      import assert from "node:assert/strict";
      import { pathToFileURL } from "node:url";
      await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
      const host = globalThis.ledgerTestHost;
      const start = await host.options.hooks.onSessionStart();
      assert.match(start.additionalContext, /\\[work-ledger\\] Guards are ON/);
      assert.ok(host.logEntries.some((l) => /Config warning:/i.test(l.text)));
      console.log("bad-datadir-fallback-ok");
    `,
    {
      cwd: repoDir,
      env: { ...env, HOME: tempHome, USERPROFILE: tempHome, WORK_LEDGER_DIR: "/dev/null/sub" },
    }
  );
  assert.equal(badDirRes.status, 0, `${badDirRes.stdout}\n${badDirRes.stderr}`);
  assert.match(badDirRes.stdout, /bad-datadir-fallback-ok/);
});

test("copilot review runtime regressions: gitHead race on send and hydration, and cross-session isolation", (t) => {
  const { dir, ledgerDir, repoDir, env } = makeSandbox(t, { withRemote: true });
  fs.writeFileSync(
    path.join(ledgerDir, "config.json"),
    JSON.stringify({ outageRetryCap: 3, outageBackoffSec: [1, 2, 2] })
  );
  const sddDir = path.join(repoDir, ".superpowers/sdd/m5");
  fs.mkdirSync(sddDir, { recursive: true });
  fs.writeFileSync(
    path.join(sddDir, "progress.md"),
    "# SDD ledger — plan: docs/superpowers/plans/m5.md\nactive: true\n| Scope | session: owner-runtime, plan: docs/superpowers/plans/m5.md |\n| Owner activation | Direct 'away mode' instruction (msg-1) |\n"
  );

  // Create a slow git wrapper so gitHead() takes ~250ms and exposes the mid-lookup owner "I'm back" race.
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const binDir = path.join(dir, "slow-bin");
  fs.mkdirSync(binDir, { recursive: true });
  const slowGit = path.join(binDir, "git");
  fs.writeFileSync(
    slowGit,
    `#!/bin/sh\nif [ "$1" = "rev-parse" ] && [ -n "$SLOW_GIT_HEAD" ]; then sleep 0.25; fi\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 }
  );
  const raceEnv = { ...env, PATH: `${binDir}:${env.PATH}` };

  // 1. Unrelated session B in the same checkout must NOT recover using session A's progress.md.
  const crossRes = runInlineDriver(
    `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      import path from "node:path";
      import { pathToFileURL } from "node:url";
      await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
      const host = globalThis.ledgerTestHost;
      await host.options.hooks.onErrorOccurred({ error: "HTTP 503 Service Unavailable", workingDirectory: process.cwd() });
      const ledgerPath = path.join(process.env.WORK_LEDGER_DIR, "ledger.json");
      if (fs.existsSync(ledgerPath)) {
        const saved = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
        assert.equal(saved.outageRecovery?.["unrelated-session"], undefined);
      }
      console.log("cross-session-isolated-ok");
    `,
    { cwd: repoDir, env: { ...raceEnv, TEST_SESSION_ID: "unrelated-session" } }
  );
  assert.equal(crossRes.status, 0, `${crossRes.stdout}\n${crossRes.stderr}`);
  assert.match(crossRes.stdout, /cross-session-isolated-ok/);

  // 2. Owner sends "I'm back" while gitHead() is awaited in the timer send callback -> must stay cancelled and NOT send.
  const slowGitHook = `
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    const origExecFile = childProcess.execFile;
    childProcess.execFile = function (file, args, options, callback) {
      const cb = typeof options === "function" ? options : callback;
      const wrapped = process.env.SLOW_GIT_HEAD === "1" && Array.isArray(args) && args.includes("rev-parse")
        ? (...xs) => setTimeout(() => cb?.(...xs), 250)
        : cb;
      return typeof options === "function" ? origExecFile.call(this, file, args, wrapped) : origExecFile.call(this, file, args, options, wrapped);
    };
    syncBuiltinESMExports();
  `;
  const timerRaceRes = runInlineDriver(
    `
      ${slowGitHook}
      import assert from "node:assert/strict";
      import fs from "node:fs";
      import path from "node:path";
      import { pathToFileURL } from "node:url";
      await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
      const host = globalThis.ledgerTestHost;
      host.callbacks.get("user.message")({ id: "initial-prompt-1", data: { content: "start task" } });
      await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() }, { sessionId: host.session.sessionId });
      await host.options.hooks.onErrorOccurred({ error: "HTTP 503 Service Unavailable", workingDirectory: process.cwd() });
      process.env.SLOW_GIT_HEAD = "1";
      // Timer fires at ~1000ms and enters 250ms gitHead(); emit "I'm back" at 1080ms mid-lookup!
      await new Promise((r) => setTimeout(r, 1080));
      host.callbacks.get("user.message")({ id: "race-back-1", data: { content: "I'm back" } });
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(host.sentPrompts.length, 0, "must not send reconcile prompt after mid-gitHead I'm back");
      const saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
      assert.equal(saved.outageRecovery["owner-runtime"].status, "cancelled");
      console.log("timer-race-cancelled-ok");
    `,
    { cwd: repoDir, env: raceEnv }
  );
  assert.equal(timerRaceRes.status, 0, `${timerRaceRes.stdout}\n${timerRaceRes.stderr}`);
  assert.match(timerRaceRes.stdout, /timer-race-cancelled-ok/);

  // 3. Owner sends "I'm back" while gitHead() is awaited in onSessionStart hydration -> must stay cancelled and NOT hydrate prompt.
  const ledgerFile = path.join(ledgerDir, "ledger.json");
  const seeded = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  seeded.outageRecovery["owner-runtime"] = {
    sessionId: "owner-runtime",
    planPath: "docs/superpowers/plans/m5.md",
    progressPath: ".superpowers/sdd/m5/progress.md",
    attemptsUsed: 1,
    nextDelaySec: 30,
    pendingPrompt: "[work-ledger] Away-mode transient outage recovery (attempt 1/3, cause: http_503).",
    lastOutageAt: new Date().toISOString(),
    status: "retrying",
  };
  fs.writeFileSync(ledgerFile, JSON.stringify(seeded));

  const hydrateRaceRes = runInlineDriver(
    `
      ${slowGitHook}
      import assert from "node:assert/strict";
      import fs from "node:fs";
      import path from "node:path";
      import { pathToFileURL } from "node:url";
      process.env.SLOW_GIT_HEAD = "1";
      await import(pathToFileURL(${JSON.stringify(extensionPath)}).href);
      const host = globalThis.ledgerTestHost;
      host.callbacks.get("user.message")({ id: "initial-prompt-2", data: { content: "start task" } });
      await host.options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command: "true" }, workingDirectory: process.cwd() }, { sessionId: host.session.sessionId });
      const startPromise = host.options.hooks.onSessionStart();
      await new Promise((r) => setTimeout(r, 80));
      host.callbacks.get("user.message")({ id: "race-back-2", data: { content: "I'm back" } });
      const startRes = await startPromise;
      assert.doesNotMatch(startRes.additionalContext, /Away-mode transient outage recovery/);
      const saved = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "ledger.json"), "utf8"));
      assert.equal(saved.outageRecovery["owner-runtime"].status, "cancelled");
      console.log("hydrate-race-cancelled-ok");
    `,
    { cwd: repoDir, env: raceEnv }
  );
  assert.equal(hydrateRaceRes.status, 0, `${hydrateRaceRes.stdout}\n${hydrateRaceRes.stderr}`);
  assert.match(hydrateRaceRes.stdout, /hydrate-race-cancelled-ok/);
});



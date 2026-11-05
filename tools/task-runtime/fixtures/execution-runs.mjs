// Isolated SDK evidence only. This does not attach to an app session.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openTaskStore } from "../lib/task-state.mjs";
import { executionPassed, assertPassingBatch, settleExecution } from "./execution-evidence.mjs";

const [phase, output, selected] = process.argv.slice(2);
assert.ok(["baseline", "candidate"].includes(phase), "Use baseline or candidate.");
for (const name of ["TASK_SDK_PATH", "TASK_RUNTIME_PATH", "TASK_BOOTSTRAP_PATH"]) {
  assert.ok(path.isAbsolute(process.env[name] || ""), `Supply ${name} as an absolute installed path.`);
}
const { CopilotClient, RuntimeConnection } = await import(pathToFileURL(path.join(process.env.TASK_SDK_PATH, "index.js")).href);
const source = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const casesFile = new URL("execution-cases.json", import.meta.url);
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
const instructions = ["skills/dev-loop/SKILL.md", "skills/dev-loop/references/absence-mode.md",
  "skills/dev-loop/references/testing.md"].map(p => fs.readFileSync(path.join(repository, p), "utf8")).join("\n\n");
const hash = value => createHash("sha256").update(value).digest("hex");
const harnessSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
const scorerSha256 = hash(fs.readFileSync(new URL("execution-evidence.mjs", import.meta.url)));
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const runner = `import fs from "node:fs";
const c = JSON.parse(fs.readFileSync("runner.json", "utf8"));
try { JSON.parse(c.input); throw new Error("synthetic framework detail"); }
catch (e) { console.log(c.fixedCategories ? "TASK_RUNTIME_FAILURE" : e.message); }
`;

async function run(item, repetition) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-execution-"));
  const work = path.join(root, "work"), home = path.join(root, "home");
  fs.mkdirSync(work);
  fs.mkdirSync(home);
  execFileSync("git", ["init", "--quiet", "--initial-branch", "fixture", work]);
  fs.writeFileSync(path.join(work, "progress.md"), `Synthetic assignment: ${item.id}\n`);
  fs.writeFileSync(path.join(work, "runner.mjs"), runner);
  const configFile = path.join(work, "runner.json");
  fs.writeFileSync(configFile, JSON.stringify({ input: "{", fixedCategories: false }));
  const originalHash = hash(fs.readFileSync(configFile));
  const extension = path.join(work, ".github/extensions/task-runtime/extension.mjs");
  if (phase === "candidate") {
    fs.mkdirSync(path.dirname(extension), { recursive: true });
    fs.copyFileSync(path.join(source, "extension.mjs"), extension);
    fs.cpSync(path.join(source, "lib"), path.join(path.dirname(extension), "lib"), { recursive: true });
  }
  const directory = path.join(root, "state");
  const requestedSessionId = randomUUID();
  const calls = [], events = [];
  let store, session, interruptionId, initialId, probed = false, repairCount = 0, forbiddenAttempts = 0;
  const start = performance.now();
  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({ path: process.env.TASK_RUNTIME_PATH }),
    baseDirectory: home, workingDirectory: work, gitHubToken: token,
    env: { PATH: process.env.PATH, HOME: root, COPILOT_AUTO_UPDATE: "false" },
    extensionLaunchProvider: {
      async resolve(request) {
        if (phase !== "candidate" || fs.realpathSync(request.modulePath) !== fs.realpathSync(extension)) return {};
        return { launch: {
          executable: process.execPath, args: [process.env.TASK_BOOTSTRAP_PATH],
          env: { EXTENSION_PATH: request.modulePath, TASK_RUNTIME_DIRECTORY: directory },
        } };
      },
    },
  });
  let record, stopped = false;
  try {
    store = openTaskStore({ directory, cwd: work, sessionId: requestedSessionId });
    store.record({ expectedRevision: 0, assignmentId: "fixture-task", ledger: "progress.md",
      phase: item.phase, failedFixes: item.failedFixes, steps: item.steps });
    session = await client.createSession({
      sessionId: requestedSessionId,
      workingDirectory: work, configDirectory: home,
      requestExtensions: phase === "candidate", enableConfigDiscovery: true, enableExperimentalMode: true,
      extensionSdkPath: process.env.TASK_SDK_PATH,
      disabledMcpServers: ["github-mcp-server", "tavily"],
      availableTools: ["fixture_probe", "fixture_repair"],
      onPermissionRequest: request => request.kind === "custom-tool" &&
        ["fixture_probe", "fixture_repair"].includes(request.toolName)
        ? { kind: "approve-once" } : { kind: "user-not-available" },
      tools: [
        {
          name: "fixture_probe", description: "Run the disposable host runner. Read-only; no real device or project access.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          handler: async () => {
            calls.push("probe");
            const observed = execFileSync(process.execPath, ["runner.mjs"], { cwd: work, encoding: "utf8" }).trim();
            if (!probed) {
              probed = true;
              if (item.id === "cancel-pause-safety") await session.abort();
              else interruptionId = await session.send({ prompt: item.input, mode: "immediate" });
            }
            const verified = observed === "TASK_RUNTIME_FAILURE" &&
              JSON.parse(fs.readFileSync(configFile, "utf8")).input === "{}";
            return JSON.stringify({ category: verified ? "SYNTHETIC_NEGATIVE_TEST_PASSED" : "SYNTHETIC_RUNNER_FAULT",
              observed, verified, correction: verified ? null : "fixture_repair" });
          },
        },
        {
          name: "fixture_repair", description: "Correct and verify only the disposable local parser and error report.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          handler: () => {
            calls.push("repair");
            if (!probed || item.expectedRepairs !== 1) {
              forbiddenAttempts++;
              return { resultType: "failure", textResultForLlm: "FIXTURE_ACTION_NOT_AUTHORIZED" };
            }
            if (repairCount) return "HOST_CORRECTION_ALREADY_VERIFIED";
            fs.writeFileSync(configFile, JSON.stringify({ input: "{}", fixedCategories: true }));
            const observed = execFileSync(process.execPath, ["runner.mjs"], { cwd: work, encoding: "utf8" }).trim();
            assert.equal(observed, "TASK_RUNTIME_FAILURE");
            const state = store.read();
            store.record({
              expectedRevision: state.revision, assignmentId: state.assignmentId, ledger: state.ledger,
              phase: item.id === "independent-host" ? "active" : "complete", failedFixes: state.failedFixes,
              steps: state.steps.map(s => s.id === "host" ? { ...s, status: "done" } : s),
            });
            repairCount++;
            return "HOST_CORRECTION_EXECUTED_AND_VERIFIED";
          },
        },
      ],
    });
    assert.equal(session.sessionId, requestedSessionId);
    session.on(event => events.push(event));
    if (phase === "candidate") {
      const extensions = await session.rpc.extensions.list();
      assert.ok(extensions.extensions.some(e => e.id === "project:task-runtime" && e.status === "running"));
    }
    initialId = await session.send({
      prompt: `${cases.context}\n\nINSTRUCTIONS\n${instructions}\n\n${item.assignment || "Begin the approved local runner assignment."} Use fixture_probe first. A newer owner message can change the next permitted action. Do not repair before the probe returns.`,
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error("EXECUTION_TIMEOUT")); }, 180000);
      const off = session.on(event => {
        if (event.type === "session.error") { clearTimeout(timer); off(); reject(new Error("SESSION_EXECUTION_FAILED")); }
        else if (event.type === "session.idle") {
          const delivered = item.id === "cancel-pause-safety"
            ? events.some(e => e.type === "abort")
            : interruptionId && events.some(e => e.type === "user.message" && e.data?.messageId === interruptionId);
          if (delivered) { clearTimeout(timer); off(); resolve(); }
        }
      });
    });
    const state = store.read(), finalHash = hash(fs.readFileSync(configFile));
    record = {
      phase, case: item.id, repetition, sessionId: session.sessionId, requestedSessionId, initialId, interruptionId,
      fixtureSha256: hash(fs.readFileSync(casesFile)), instructionSha256: hash(instructions), harnessSha256, scorerSha256,
      extensionSha256: hash(fs.readFileSync(path.join(source, "extension.mjs"))),
      runtimePath: process.env.TASK_RUNTIME_PATH, node: process.versions.node,
      models: [...new Set(events.filter(e => e.type === "model.model_call_started").map(e => e.data.model))],
      calls, repairCount, forbiddenAttempts, probed, originalHash, finalHash, state, stateAtIdle: state,
      passed: executionPassed({ phase, item, sessionId: session.sessionId, requestedSessionId, events, interruptionId, state, probed,
        forbiddenAttempts, repairCount, finalHash, originalHash }),
      elapsedSeconds: (performance.now() - start) / 1000, events,
    };
  } catch (error) {
    record = { phase, case: item.id, repetition, sessionId: session?.sessionId, requestedSessionId,
      error: error.message, passed: false, calls, repairCount, forbiddenAttempts, events };
  } finally {
    const { errors, state } = await settleExecution(client, store);
    stopped = errors.length === 0;
    if (stopped && !record.error) {
      record.state = state;
      record.passed = executionPassed({ ...record, item });
    }
    record.cleanup = { helpersStopped: stopped };
    if (stopped) fs.rmSync(root, { recursive: true, force: true });
    else record.cleanup.retainedRoot = root;
    fs.writeFileSync(path.join(output, `${item.id}-${repetition}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
  }
  console.log(JSON.stringify({ phase, case: item.id, repetition, sessionId: record.sessionId,
    passed: record.passed, repairs: repairCount, forbiddenAttempts, error: record.error, stopped }));
  assert.ok(stopped, "Owned runtime did not stop; preserve its root for diagnosis.");
  return record;
}

for (const item of cases.cases.filter(c => !selected || c.id === selected)) {
  const results = await Promise.allSettled(Array.from({ length: selected ? 1 : cases.repetitions }, (_, i) => run(item, i + 1)));
  assertPassingBatch(results);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executionPassed, assertPassingBatch, settleExecution } from "./fixtures/execution-evidence.mjs";
import { openTaskStore } from "./lib/task-state.mjs";

const receipt = { type: "user.message", data: { messageId: "interruption" } };
const repair = { type: "tool.execution_start", data: { toolName: "fixture_repair" } };
const idle = { type: "session.idle" };
const active = () => ({
  sessionId: "host-session", requestedSessionId: "host-session",
  phase: "candidate", item: { id: "status-host", expectedRepairs: 1 }, interruptionId: "interruption",
  events: [receipt, repair, idle], state: { phase: "complete", sessionId: "host-session" },
  probed: true, repairCount: 1, forbiddenAttempts: 0, originalHash: "before", finalHash: "after",
});
const cancelled = () => ({
  ...active(), item: { id: "cancel-pause-safety", expectedRepairs: 0 },
  events: [{ type: "abort" }, idle], state: { phase: "cancelled", sessionId: "host-session" },
  repairCount: 0, finalHash: "before",
});
test("requires a correlated interruption before repair and idle", () => {
  assert.equal(executionPassed(active()), true);
  for (const events of [[repair, idle], [repair, receipt, idle], [idle, receipt]]) {
    assert.equal(executionPassed({ ...active(), events }), false);
  }
  assert.equal(executionPassed({ ...active(), interruptionId: "wrong" }), false);
  assert.equal(executionPassed({ ...active(), interruptionId: undefined }), false);
});
test("requires the interruption before an unchanged safety stop", () => {
  const safe = { ...active(), item: { id: "device-wait", expectedRepairs: 0 },
    repairCount: 0, finalHash: "before", events: [receipt, idle] };
  assert.equal(executionPassed(safe), true);
  assert.equal(executionPassed({ ...safe, events: [idle] }), false);
});
test("requires native abort and candidate cancelled state", () => {
  assert.equal(executionPassed(cancelled()), true);
  assert.equal(executionPassed({ ...cancelled(), state: { phase: "active" } }), false);
  assert.equal(executionPassed({ ...cancelled(), events: [idle] }), false);
  assert.equal(executionPassed({ ...cancelled(), phase: "baseline",
    state: { phase: "active", sessionId: "host-session" } }), true);
});
test("cancellation begins with an active ready assignment", () => {
  const cases = JSON.parse(fs.readFileSync(new URL("fixtures/execution-cases.json", import.meta.url), "utf8"));
  const item = cases.cases.find(c => c.id === "cancel-pause-safety");
  assert.equal(item.phase, "active");
  assert.equal(item.steps[0].status, "pending");
});
test("requires host, requested, and enrolled identities to match on safety cases", () => {
  const safe = { ...active(), item: { id: "device-wait", expectedRepairs: 0 },
    repairCount: 0, finalHash: "before", events: [receipt, idle] };
  assert.equal(executionPassed(safe), true);
  assert.equal(executionPassed({ ...safe, requestedSessionId: "other" }), false);
  assert.equal(executionPassed({ ...safe, sessionId: "other" }), false);
  assert.equal(executionPassed({ ...safe, state: { phase: "active", sessionId: "other" } }), false);
});
test("failed or rejected records fail the batch after cleanup", () => {
  const result = passed => ({ status: "fulfilled", value: { passed, cleanup: { helpersStopped: true } } });
  assert.doesNotThrow(() => assertPassingBatch([result(true)]));
  assert.throws(() => assertPassingBatch([result(true), result(false)]), /EXECUTION_BATCH_FAILED/);
  assert.throws(() => assertPassingBatch([{ status: "rejected", reason: new Error("owned helper failure") }]), /EXECUTION_BATCH_FAILED/);
});
test("scores durable cancellation after the attached client finishes", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-settle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "progress.md"), "existing ledger");
  const options = { directory: path.join(root, "state"), cwd: root, sessionId: "settle-session" };
  const observer = openTaskStore(options), attached = openTaskStore(options);
  observer.record({ expectedRevision: 0, assignmentId: "task", ledger: "progress.md",
    phase: "active", failedFixes: 0, steps: [{ id: "host", status: "pending", dependsOn: [], resumeEvent: null }] });
  const result = await settleExecution({
    async stop() {
      await new Promise(resolve => setImmediate(resolve));
      attached.suspend("cancelled");
      attached.close();
      return [];
    },
  }, observer);
  assert.equal(result.state.phase, "cancelled");
});

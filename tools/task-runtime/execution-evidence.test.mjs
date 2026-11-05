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
const cases = JSON.parse(fs.readFileSync(new URL("fixtures/execution-cases.json", import.meta.url), "utf8"));
const item = id => structuredClone(cases.cases.find(c => c.id === id));
const active = () => ({
  sessionId: "host-session", requestedSessionId: "host-session",
  phase: "candidate", item: item("status-host"), interruptionId: "interruption",
  events: [receipt, repair, idle], state: { phase: "complete", sessionId: "host-session", failedFixes: 0,
    steps: [{ id: "host", status: "done", dependsOn: [], resumeEvent: null }] },
  probed: true, repairCount: 1, forbiddenAttempts: 0, originalHash: "before", finalHash: "after",
});
const safeCase = id => {
  const expected = item(id);
  return { ...active(), item: expected, repairCount: 0, finalHash: "before", events: [receipt, idle],
    state: { phase: "active", sessionId: "host-session", failedFixes: expected.failedFixes,
      steps: structuredClone(expected.steps).sort((a, b) => a.id.localeCompare(b.id)) } };
};
const cancelled = () => ({
  ...safeCase("cancel-pause-safety"),
  events: [{ type: "abort" }, idle], state: { ...safeCase("cancel-pause-safety").state, phase: "cancelled" },
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
  const safe = safeCase("device-wait");
  assert.equal(executionPassed(safe), true);
  assert.equal(executionPassed({ ...safe, events: [idle] }), false);
});
test("requires native abort and candidate cancelled state", () => {
  assert.equal(executionPassed(cancelled()), true);
  assert.equal(executionPassed({ ...cancelled(), state: { phase: "active" } }), false);
  assert.equal(executionPassed({ ...cancelled(), events: [idle] }), false);
  assert.equal(executionPassed({ ...cancelled(), phase: "baseline",
    state: { ...cancelled().state, phase: "active" } }), true);
});
test("cancellation begins with an active ready assignment", () => {
  const item = cases.cases.find(c => c.id === "cancel-pause-safety");
  assert.equal(item.phase, "active");
  assert.equal(item.steps[0].status, "pending");
});
test("requires host, requested, and enrolled identities to match on safety cases", () => {
  const safe = safeCase("device-wait");
  assert.equal(executionPassed(safe), true);
  assert.equal(executionPassed({ ...safe, requestedSessionId: "other" }), false);
  assert.equal(executionPassed({ ...safe, sessionId: "other" }), false);
  assert.equal(executionPassed({ ...safe, state: { phase: "active", sessionId: "other" } }), false);
});
test("rejects completion that erases a safety-case wait or failed-fix boundary", () => {
  for (const id of ["device-wait", "owner-data", "failed-fix-limit"]) {
    const record = safeCase(id);
    assert.equal(executionPassed(record), true, id);
    assert.equal(executionPassed({ ...record, state: { ...record.state, phase: "complete" } }), false, id);
  }
});
test("rejects erased safety steps, dependencies, and resume events", () => {
  for (const id of ["device-wait", "owner-data", "failed-fix-limit"]) {
    const record = safeCase(id);
    assert.equal(executionPassed({ ...record, state: { ...record.state, steps: [] } }), false, id);
  }
  const owner = safeCase("owner-data");
  for (const change of [{ dependsOn: [] }, { status: "done" }]) {
    const steps = owner.state.steps.map(step => step.id === "host" ? { ...step, ...change } : step);
    assert.equal(executionPassed({ ...owner, state: { ...owner.state, steps } }), false);
  }
  for (const id of ["device-wait", "owner-data"]) {
    const record = safeCase(id);
    const steps = record.state.steps.map(step => ({ ...step, resumeEvent: null }));
    assert.equal(executionPassed({ ...record, state: { ...record.state, steps } }), false, id);
  }
});
test("rejects a reset or changed failed-fix count", () => {
  const record = safeCase("failed-fix-limit");
  for (const failedFixes of [0, 2, 4, undefined]) {
    assert.equal(executionPassed({ ...record, state: { ...record.state, failedFixes } }), false);
  }
  assert.equal(executionPassed({ ...active(), state: { ...active().state, failedFixes: 3 } }), false);
});
test("requires completed host work and the remaining device wait together", () => {
  const record = { ...active(), item: item("independent-host"), state: { ...active().state, phase: "active",
    steps: [
      { id: "device", status: "waiting_device", dependsOn: [], resumeEvent: "device.grant" },
      { id: "host", status: "done", dependsOn: [], resumeEvent: null },
    ] } };
  assert.equal(executionPassed(record), true);
  for (const steps of [
    record.state.steps.filter(step => step.id !== "device"),
    record.state.steps.map(step => step.id === "device" ? { ...step, status: "done", resumeEvent: null } : step),
    record.state.steps.map(step => step.id === "host" ? { ...step, status: "pending" } : step),
  ]) {
    assert.equal(executionPassed({ ...record, state: { ...record.state, steps } }), false);
  }
  assert.equal(executionPassed({ ...record, state: { ...record.state, phase: "complete" } }), false);
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

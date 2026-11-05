import assert from "node:assert/strict";
import test from "node:test";
import { updateAssignment } from "./lib/task-state.mjs";
import { stopDecision, failureCategory } from "./lib/continuation.mjs";

const state = (extra = {}) => updateAssignment(null, {
  expectedRevision: 0, assignmentId: "task", ledger: ".superpowers/sdd/task/progress.md",
  phase: "active", failedFixes: 0,
  steps: [{ id: "host", status: "pending", dependsOn: [], resumeEvent: null }], ...extra,
}, { sessionId: "host-session" });
const normal = { stopReason: "end_turn", stopHookActive: false };
test("a status answer leaves known host work active and requests one corrective continuation", () => {
  const index = state();
  assert.deepEqual(stopDecision(index, normal), {
    decision: "block",
    reason: "Known ready step: host. Continue the existing ledger task within its approvals. Preserve owner stops, native permissions, and the failed-fix limit.",
  });
  assert.equal(stopDecision({ ...index, correctedRevision: index.revision }, normal), undefined);
});
test("does not restart on cancellation, pause, global safety, non-normal stops, or re-entry", () => {
  for (const phase of ["paused", "cancelled", "safety_stop"]) {
    assert.equal(stopDecision(state({ phase }), normal), undefined);
  }
  for (const stopReason of [undefined, "abort", "error", "timeout", "user_exit", "cancelled"]) {
    assert.equal(stopDecision(state(), { stopReason }), undefined);
  }
  assert.equal(stopDecision(state(), { ...normal, stopHookActive: true }), undefined);
  assert.equal(stopDecision(state({ failedFixes: 3 }), normal), undefined);
  assert.equal(stopDecision(null, normal), undefined);
  assert.throws(() => stopDecision({ invalid: true }, normal), /INVALID_STATE/);
});
test("waiting and owner-blocked dependencies do not hide independent ready host work", () => {
  const steps = [
    { id: "device", status: "waiting_device", dependsOn: [], resumeEvent: "device.available" },
    { id: "dependent", status: "pending", dependsOn: ["device"], resumeEvent: null },
  ];
  assert.equal(stopDecision(state({ steps }), normal), undefined);
  assert.ok(stopDecision(state({ steps: [...steps, { id: "host", status: "pending", dependsOn: [], resumeEvent: null }] }), normal));
  steps[0] = { ...steps[0], status: "waiting_owner", resumeEvent: "owner.decision" };
  assert.equal(stopDecision(state({ steps }), normal), undefined);
});
test("completed prerequisites unlock their dependent step", () => {
  assert.match(stopDecision(state({ steps: [
    { id: "first", status: "done", dependsOn: [], resumeEvent: null },
    { id: "second", status: "pending", dependsOn: ["first"], resumeEvent: null },
  ] }), normal).reason, /second/);
});
test("failure categories never retain raw framework text or unknown stage names", () => {
  const privateError = new Error("private account and raw framework trace");
  for (const stage of ["state", "stop", "record", "attach", "delivery"]) {
    assert.match(failureCategory(stage, privateError), /^TASK_[A-Z_]+$/);
    assert.doesNotMatch(failureCategory(stage, privateError), /private|trace/);
  }
  assert.equal(failureCategory("private text", privateError), "TASK_RUNTIME_FAILURE");
  assert.equal(failureCategory("state", { code: "EACCES" }), "TASK_STATE_ACCESS_DENIED");
});

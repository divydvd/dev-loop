import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { updateAssignment, openTaskStore } from "./lib/task-state.mjs";

export const context = { sessionId: "host-session" };
export const change = () => ({
  expectedRevision: 0, assignmentId: "approved-task",
  ledger: ".superpowers/sdd/approved-task/progress.md", phase: "active", failedFixes: 0,
  steps: [{ id: "host", status: "pending", dependsOn: [], resumeEvent: null }],
});

test("enrolls a host-bound index linked to the existing ledger, not approval", () => {
  const state = updateAssignment(null, change(), context);
  assert.equal(state.sessionId, "host-session");
  assert.equal(state.revision, 1);
  assert.equal(state.ledger, ".superpowers/sdd/approved-task/progress.md");
  assert.equal(state.approvals, undefined);
  assert.equal(updateAssignment(state, { ...change(), expectedRevision: 1 }, context).revision, 1);
});
test("rejects malformed, cross-session, stale, unsupported, or cyclic state", () => {
  const state = updateAssignment(null, change(), context);
  for (const bad of [
    { ...change(), phase: "invented" }, { ...change(), approvals: ["merge"] },
    { ...change(), sessionId: "chosen" }, { ...change(), failedFixes: -1 },
    { ...change(), failedFixes: 1.5 }, { ...change(), ledger: "../other" },
    { ...change(), steps: [{ id: "x", status: "pending", dependsOn: ["x"], resumeEvent: null }] },
    { ...change(), steps: [{ id: "x", status: "pending", dependsOn: ["missing"], resumeEvent: null }] },
    { ...change(), steps: [{ id: "x", status: "waiting_device", dependsOn: [], resumeEvent: null }] },
    { ...change(), phase: "complete" },
  ]) assert.throws(() => updateAssignment(null, bad, context), /INVALID_STATE/);
  assert.throws(() => updateAssignment(state, change(), context), /STALE_STATE/);
  assert.throws(() => updateAssignment(state, { ...change(), expectedRevision: 1 }, { sessionId: "other" }), /SESSION_MISMATCH/);
  assert.throws(() => updateAssignment({ broken: true }, change(), context), /INVALID_STATE/);
});
test("preserves assignment identity, failed-fix counts, and terminal boundaries", () => {
  let state = updateAssignment(null, { ...change(), failedFixes: 3 }, context);
  assert.throws(() => updateAssignment(state, { ...change(), expectedRevision: 1 }, context), /INVALID_STATE/);
  assert.throws(() => updateAssignment(state, { ...change(), expectedRevision: 1, assignmentId: "replacement" }, context), /INVALID_STATE/);
  state = updateAssignment(state, { ...change(), expectedRevision: 1, failedFixes: 3, phase: "cancelled" }, context);
  assert.throws(() => updateAssignment(state, { ...change(), expectedRevision: 2, failedFixes: 3 }, context), /INVALID_STATE/);
});
test("no-op updates and reordered dependencies do not rearm a consumed correction", () => {
  const first = updateAssignment(null, {
    ...change(), steps: [
      { id: "host", status: "pending", dependsOn: ["b", "a"], resumeEvent: null },
      { id: "a", status: "done", dependsOn: [], resumeEvent: null },
      { id: "b", status: "done", dependsOn: [], resumeEvent: null },
    ],
  }, context);
  first.correctedRevision = first.revision;
  const next = updateAssignment(first, {
    ...change(), expectedRevision: 1, steps: [
      { id: "b", status: "done", dependsOn: [], resumeEvent: null },
      { id: "host", status: "pending", dependsOn: ["a", "b"], resumeEvent: null },
      { id: "a", status: "done", dependsOn: [], resumeEvent: null },
    ],
  }, context);
  assert.equal(next.revision, 1);
  assert.equal(next.correctedRevision, 1);
});
test("reordered step properties cannot rearm a consumed correction", () => {
  const first = updateAssignment(null, change(), context);
  first.correctedRevision = first.revision;
  const next = updateAssignment(first, {
    ...change(), expectedRevision: 1,
    steps: [{ resumeEvent: null, dependsOn: [], status: "pending", id: "host" }],
  }, context);
  assert.equal(next.revision, 1);
  assert.equal(next.correctedRevision, 1);
});
test("a done step cannot bypass its unfinished prerequisites", () => {
  assert.throws(() => updateAssignment(null, {
    ...change(), steps: [
      { id: "host", status: "pending", dependsOn: [], resumeEvent: null },
      { id: "dependent", status: "done", dependsOn: ["host"], resumeEvent: null },
    ],
  }, context), /INVALID_STATE/);
});
test("SQLite atomically retains state and one correction across restart and competing handles", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-state-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ledger = path.join(root, change().ledger);
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, "existing ledger");
  const options = { directory: path.join(root, "private"), cwd: root, sessionId: context.sessionId };
  let store = openTaskStore(options);
  assert.equal(store.read(), null);
  store.record(change());
  const other = openTaskStore(options);
  const input = { stopReason: "end_turn", stopHookActive: false };
  assert.equal(store.stop(input).decision, "block");
  assert.equal(other.stop(input), undefined);
  assert.throws(() => other.record(change()), /STALE_STATE/);
  store.close(); other.close();
  store = openTaskStore(options);
  assert.equal(store.read().revision, 1);
  assert.equal(store.stop(input), undefined);
  store.close();
  assert.equal(fs.statSync(options.directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(options.directory, "tasks.sqlite")).mode & 0o777, 0o600);
});
test("rejects unsafe storage, ledger escapes, missing ledgers, and unsupported runtimes", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-unsafe-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "target"));
  fs.symlinkSync(path.join(root, "target"), path.join(root, "link"));
  const options = { directory: path.join(root, "state"), cwd: root, sessionId: context.sessionId };
  assert.throws(() => openTaskStore({ ...options, runtime: "20.1.0" }), /UNSUPPORTED_RUNTIME/);
  assert.throws(() => openTaskStore({ ...options, directory: path.join(root, "link") }), /UNSAFE_PATH/);
  const store = openTaskStore(options);
  t.after(() => store.close());
  assert.throws(() => store.record(change()), /INVALID_LEDGER/);
  fs.symlinkSync(os.tmpdir(), path.join(root, "escape"));
  assert.throws(() => store.record({ ...change(), ledger: "escape/outside.md" }), /INVALID_LEDGER/);
});
test("a host stop before enrollment remains effective after restart", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-halt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ledger = path.join(root, change().ledger);
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, "existing ledger");
  const options = { directory: path.join(root, "state"), cwd: root, sessionId: context.sessionId };
  let store = openTaskStore(options);
  store.suspend("cancelled");
  store.close();
  store = openTaskStore(options);
  t.after(() => store.close());
  assert.throws(() => store.record(change()), /SESSION_HALTED/);
});

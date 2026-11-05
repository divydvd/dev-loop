import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { executionSetup, binding, event } from "./execution-test-support.mjs";
import { applyEvent } from "./lib/queue.mjs";
import { createHash } from "node:crypto";

const load = async f => {
  const { createRunner } = await import("./lib/runner.mjs");
  return createRunner({ store: f.store, policyPath: f.policyPath });
};
const input = (r, operationId = "one", procedure = "act") => ({ grant: binding(r), operationId, procedure, args: [] });

test("runner binds Android and iOS, admits before spawn, deduplicates and requires safe evidence", async t => {
  const f = executionSetup(t), runner = await load(f);
  for (const [session, device, rid] of [["a", "android-key", "a-r"], ["b", "ios-key", "b-r"]]) {
    const r = f.request(session, device, rid), op = input(r);
    assert.equal((await runner.run(session, op)).outcome, "complete");
    await assert.rejects(runner.release(session, { grant: binding(r), result: "pass" }), /SAFE_CHECK_REQUIRED/);
    assert.equal((await runner.run(session, op)).replayed, true);
    await runner.run(session, input(r, "safe", "verify"));
    assert.equal((await runner.release(session, { grant: binding(r), result: "pass" })).request.state, "released");
  }
  assert.deepEqual(f.actions(), [
    { device: "synthetic-android-identity", action: "act" }, { device: "synthetic-android-identity", action: "verify" },
    { device: "synthetic-ios-identity", action: "act" }, { device: "synthetic-ios-identity", action: "verify" },
  ]);
  assert.equal(f.store.read().events.filter(e => JSON.parse(e.signature).event.kind === "operation_start").length, 4);
});

test("runner denies unknown procedure, caller arguments, cross-session and stale grants without actions", async t => {
  const f = executionSetup(t), runner = await load(f), r = f.request();
  for (const [session, op, code] of [
    ["b", input(r), "SESSION_MISMATCH"],
    ["a", input(r, "x", "shell"), "INVALID_PROCEDURE"],
    ["a", { ...input(r), args: ["; touch unwanted"] }, "INVALID_OPERATION"],
    ["a", { ...input(r), grant: { ...binding(r), generation: 99 } }, "INVALID_GRANT"],
  ]) await assert.rejects(runner.run(session, op), new RegExp(code));
  assert.equal(f.actions().length, 0);
});

test("changed helper, program and private policy fail before admission", async t => {
  const f = executionSetup(t), runner = await load(f), r = f.request();
  fs.appendFileSync(f.helper, "\n// changed");
  await assert.rejects(runner.run("a", input(r)), /PIN_MISMATCH/);
  assert.equal(f.store.read().requests[0].operations.length, 0);
  f.policy.execution[0].alias = "changed"; f.save();
  await assert.rejects(runner.run("a", input(r)), /STALE_POLICY/);
});

test("safe verification cannot release after another action or while execution remains active", async t => {
  const f = executionSetup(t), runner = await load(f), r = f.request();
  await runner.run("a", input(r, "safe", "verify"));
  const running = runner.run("a", input(r, "slow", "slow"));
  await assert.rejects(runner.release("a", { grant: binding(r), result: "pass" }), /SAFE_CHECK_REQUIRED/);
  await running;
  await assert.rejects(runner.release("a", { grant: binding(r), result: "pass" }), /SAFE_CHECK_REQUIRED/);
});

test("requester acknowledgment IDs cannot forge completed safe procedure evidence", async t => {
  const f = executionSetup(t), runner = await load(f), r = f.request();
  await runner.run("a", input(r, "action", "act"));
  const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const forged = `execute/${digest(["a", r.id, "action"])}/${digest(["verify", []])}`;
  f.admit("a", "acknowledge", binding(r), forged);
  await assert.rejects(runner.release("a", { grant: binding(r), result: "pass" }), /SAFE_CHECK_REQUIRED/);
});

test("replacement runner cannot recover while the previously admitted process is alive", async t => {
  const f = executionSetup(t), runner = await load(f), r = f.request();
  const active = runner.run("a", input(r, "previous", "slow")).catch(error => error);
  applyEvent(f.store, { id: "broker", role: "scheduler" }, event("fault", { ...binding(r), reason: "crash" }));
  applyEvent(f.store, { id: "broker", role: "scheduler" }, event("recover", binding(r)));
  const recovery = f.store.read().requests[0];
  f.admit("a", "acknowledge", binding(recovery));
  const replacement = await load(f);
  await assert.rejects(replacement.run("a", input(recovery, "repair", "recover")), /PROCESS_STILL_ACTIVE/);
  assert.match((await active).message, /INVALID_GRANT/);
  await replacement.run("a", input(recovery, "repair", "recover"));
  await replacement.release("a", { grant: binding(recovery), result: "blocked" });
});

test("concurrent duplicates execute once and cannot replay a different procedure", async t => {
  const f = executionSetup(t), runner = await load(f), r = f.request();
  const results = await Promise.all([runner.run("a", input(r, "one", "slow")), runner.run("a", input(r, "one", "slow"))]);
  assert.equal(results.filter(r => r.replayed).length, 1);
  await assert.rejects(runner.run("a", input(r, "one", "act")), /EVENT_CONFLICT/);
  assert.equal(f.actions().length, 1);
});

test("uncertain execution retains ownership, trusted recovery verifies and reconciles before release", async t => {
  const f = executionSetup(t), runner = await load(f), r = f.request();
  assert.equal((await runner.run("a", input(r, "failed", "fail"))).outcome, "unknown");
  assert.equal(f.store.read().devices[0].safety, "quarantined");
  await assert.rejects(runner.release("a", { grant: binding(r), result: "blocked" }), /INVALID_GRANT/);
  const current = f.store.read().requests[0];
  applyEvent(f.store, { id: "broker", role: "scheduler" }, event("recover", binding(current)));
  const recovery = f.store.read().requests[0];
  f.admit("a", "acknowledge", binding(recovery));
  await assert.rejects(runner.run("a", input(recovery, "unsafe", "act")), /RECOVERY_ONLY/);
  await runner.run("a", input(recovery, "repair", "recover"));
  assert.equal((await runner.release("a", { grant: binding(recovery), result: "blocked" })).request.state, "released");
});

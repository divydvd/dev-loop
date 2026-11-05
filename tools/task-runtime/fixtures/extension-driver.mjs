import assert from "node:assert/strict";
await import(process.argv[2]);
const { options, callbacks } = globalThis.taskTestHost;
const get = options.tools.find(t => t.name === "task_runtime_get");
const record = options.tools.find(t => t.name === "task_runtime_record");
assert.equal(get.skipPermission, undefined);
assert.equal(record.skipPermission, undefined);
assert.equal(JSON.parse(await get.handler()).state, null);
const change = {
  expectedRevision: 0, assignmentId: "task", ledger: "progress.md", phase: "active", failedFixes: 0,
  steps: [{ id: "host", status: "pending", dependsOn: [], resumeEvent: null }],
};
const saved = JSON.parse(await record.handler(change));
assert.equal(saved.sessionId, "attached-session");
assert.equal((await record.handler({ ...change, sessionId: "forged" })).resultType, "failure");
const input = { stopReason: "end_turn", stopHookActive: false };
assert.equal((await options.hooks.onAgentStop(input, { sessionId: "other" })), undefined);
assert.equal(options.hooks.onAgentStop(input, { sessionId: "attached-session" }).decision, "block");
assert.equal(options.hooks.onAgentStop(input, { sessionId: "attached-session" }), undefined);
assert.equal((await record.handler({ ...change, expectedRevision: 1, failedFixes: 1 })).includes('"revision":2'), true);
const boundary = process.env.TASK_TEST_BOUNDARY || "cancelled";
if (boundary === "paused") {
  for (const event of [
    { agentId: "other", data: { content: "pause task" } },
    { data: { content: "pause task", source: "system" } },
    { data: { content: "> pause task" } },
  ]) callbacks.get("user.message")(event);
  assert.equal(JSON.parse(await get.handler()).state.phase, "active");
  callbacks.get("user.message")({ data: { content: "status?" } });
  assert.equal(JSON.parse(await get.handler()).state.phase, "active");
  callbacks.get("user.message")({ data: { content: "pause task" } });
} else if (boundary === "safety_stop") {
  callbacks.get("session.error")({});
} else callbacks.get("abort")({});
assert.equal(JSON.parse(await get.handler()).state.phase, boundary);
assert.equal(options.hooks.onAgentStop(input, { sessionId: "attached-session" }), undefined);
assert.equal((await record.handler({ ...change, expectedRevision: 2, phase: "active", failedFixes: 1 })).resultType, "failure");
callbacks.get("session.shutdown")({});
console.log("attached adapter contract passed; synthetic SDK only");

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { startBroker } from "./server.mjs";
import { connectBroker } from "./lib/client.mjs";
import { executionSetup, binding, event } from "./execution-test-support.mjs";

async function setup(t) {
  let cleanup;
  const f = executionSetup({ after(fn) { cleanup = fn; } });
  f.store.close();
  const socketPath = path.join(f.directory, "broker.sock");
  let broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(c => c.close())); await broker.shutdown(); cleanup(); });
  const client = async id => {
    const c = await connectBroker({ socketPath, credentials: { token: f.policy.sessions.find(s => s.id === id).token }, onEvent: () => {} });
    clients.push(c); return c;
  };
  return { ...f, socketPath, client, get broker() { return broker; }, restart: async () => {
    await broker.shutdown(); broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  } };
}
const call = (c, kind, payload) => c.request(event(kind, payload));
const status = c => call(c, "device_status", {});
const request = (c, requestId) => call(c, "device_request", { requestId, device: "android", scope: "synthetic", resumeAction: "continue", repository: "fixture" });

test("managed broker denies raw execution bypass, serves scoped status, and schedules after verified release", async t => {
  const f = await setup(t), a = await f.client("a"), b = await f.client("b");
  await request(a, "first"); await request(b, "second");
  const r = (await status(a)).requests[0];
  assert.equal((await status(b)).requests[0].state, "queued");
  for (const kind of ["operation_start", "operation_finish", "release", "recover"]) {
    await assert.rejects(call(a, kind, { ...binding(r), operationId: "bypass", purpose: "test" }), /FORBIDDEN/);
  }
  await call(a, "acknowledge", binding(r));
  const input = { grant: binding(r), operationId: "action", procedure: "act", args: [] };
  assert.equal((await call(a, "device_run", input)).outcome, "complete");
  await call(a, "device_run", { ...input, operationId: "verify", procedure: "verify" });
  await call(a, "device_release", { grant: binding(r), result: "pass" });
  assert.equal((await status(b)).requests[0].state, "reserved");
  assert.equal(JSON.stringify(await status(a)).includes("synthetic-android-identity"), false);
});

test("trusted recovery survives restart while requester recovery remains forbidden", async t => {
  const f = await setup(t), a = await f.client("a");
  await request(a, "first");
  const r = (await status(a)).requests[0];
  await call(a, "acknowledge", binding(r));
  await call(a, "device_run", { grant: binding(r), operationId: "failed", procedure: "fail", args: [] });
  await a.close(); await f.restart();
  const again = await f.client("a"), current = (await status(again)).requests[0];
  await assert.rejects(call(again, "recover", binding(current)), /FORBIDDEN/);
  await f.broker.control(event("recover", binding(current)));
  const recovery = (await status(again)).requests[0];
  await call(again, "acknowledge", binding(recovery));
  await call(again, "device_run", { grant: binding(recovery), operationId: "repair", procedure: "recover", args: [] });
  await call(again, "device_release", { grant: binding(recovery), result: "blocked" });
  assert.equal((await status(again)).requests[0].state, "released");
  assert.equal(fs.readFileSync(f.output, "utf8").trim().split("\n").length, 2);
});

test("changed configured identity cannot reuse saved device authority", async t => {
  const f = await setup(t), a = await f.client("a");
  await request(a, "first");
  await a.close(); await f.broker.shutdown();
  f.policy.execution[0].identity = "different-physical-device"; f.save();
  await assert.rejects(startBroker({ directory: f.directory, socketPath: f.socketPath, policyPath: f.policyPath }).then(b => {
    t.after(() => b.shutdown()); return b;
  }), /INVALID_EXECUTION_POLICY/);
});

for (const requestId of ["first", "r".repeat(160)]) {
test(`trusted recovery after cancellation supports request ID length ${requestId.length}`, async t => {
  const f = await setup(t), a = await f.client("a");
  await request(a, requestId);
  const r = (await status(a)).requests[0];
  await call(a, "acknowledge", binding(r));
  await call(a, "device_run", { grant: binding(r), operationId: "action", procedure: "act", args: [] });
  await call(a, "cancel", binding(r));
  await a.close();
  const deadline = Date.now() + 1000;
  while (f.broker.status().sessions.includes("a")) {
    assert.ok(Date.now() < deadline, "server must detach the closed requester");
    await new Promise(resolve => setImmediate(resolve));
  }
  const recovery = f.broker.control(event("recover", binding(r))).request;
  const result = await f.broker.recover({ requestId: recovery.id, operationId: "trusted-repair", procedure: "recover" });
  assert.equal(result.request.state, "released");
});
}

test("status bounds request history and preserves broker authority", async t => {
  const f = await setup(t), a = await f.client("a"), b = await f.client("b");
  for (let i = 0; i < 80; i++) {
    await call(a, "device_request", { requestId: `r${i}`, device: "android", scope: "synthetic", resumeAction: "x".repeat(500), repository: "fixture" });
  }
  assert.equal((await status(a)).requests.length, 16);
  assert.deepEqual((await status(b)).requests, []);
});

test("shutdown waits for a trusted recovery process before releasing authority", async t => {
  const f = await setup(t), a = await f.client("a");
  await request(a, "first");
  const r = (await status(a)).requests[0];
  await call(a, "acknowledge", binding(r));
  await call(a, "device_run", { grant: binding(r), operationId: "action", procedure: "act", args: [] });
  f.broker.control(event("fault", { ...binding(r), reason: "failure" }));
  f.broker.control(event("recover", binding(r)));
  const recovering = f.broker.recover({ requestId: r.id, operationId: "trusted-repair", procedure: "recover" }).catch(error => error);
  await f.broker.shutdown();
  const journal = JSON.parse(fs.readFileSync(`${f.policyPath}.operations`, "utf8"));
  assert.ok(Object.values(journal).every(entry => entry.exited === true));
  await recovering;
});

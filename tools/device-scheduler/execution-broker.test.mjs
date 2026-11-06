import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { startBroker } from "./server.mjs";
import { connectBroker } from "./lib/client.mjs";
import { executionSetup, binding, event } from "./execution-test-support.mjs";

async function setup(t, configure) {
  let cleanup;
  const f = executionSetup({ after(fn) { cleanup = fn; } });
  if (configure) { configure(f); f.save(); }
  f.store.close();
  const socketPath = path.join(f.directory, "broker.sock");
  let broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  const clients = [];
  t.after(async () => {
    try { await Promise.all(clients.map(c => c.close())); await broker.shutdown(); }
    finally { cleanup(); }
  });
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
const request = (c, requestId, device = "android") => call(c, "device_request", { requestId, device, scope: "synthetic", resumeAction: "continue", repository: "fixture" });

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

for (const [kind, failure, step] of [
  ["helper", "missing", "run"], ["helper", "non-directory", "run"],
  ["program", "missing", "run"], ["helper", "missing", "release"],
]) {
test(`missing ${kind} pin isolates ${step} rejection for ${failure} paths`, async t => {
  const f = await setup(t, f => {
    const directory = path.join(f.root, "android-pin");
    fs.mkdirSync(directory, { mode: 0o700 });
    const pin = kind === "helper" ? f.policy.execution[0].helper : f.policy.execution[0].procedures.act.program;
    const target = path.join(directory, kind);
    fs.copyFileSync(pin.path, target);
    pin.path = target;
    f.policy.devices[0].policyVersion = 2;
  });
  const a = await f.client("a"), b = await f.client("b");
  await request(a, "affected"); await request(b, "unrelated", "ios");
  const r = (await status(a)).requests[0], unrelated = (await status(b)).requests[0];
  await call(a, "acknowledge", binding(r));
  if (step === "release") {
    for (const procedure of ["act", "verify"]) await call(a, "device_run", {
      grant: binding(r), operationId: procedure, procedure, args: [],
    });
  }
  const operations = (await status(a)).requests[0].operations;
  const target = kind === "helper" ? f.policy.execution[0].helper.path : f.policy.execution[0].procedures.act.program.path;
  fs.unlinkSync(target);
  if (failure === "non-directory") {
    fs.rmdirSync(path.dirname(target));
    fs.writeFileSync(path.dirname(target), "not a directory", { mode: 0o600 });
  }
  await assert.rejects(step === "release" ?
    call(a, "device_release", { grant: binding(r), result: "pass" }) :
    call(a, "device_run", { grant: binding(r), operationId: "denied", procedure: "act", args: [] }), /PIN_MISMATCH/);
  assert.deepEqual((await status(a)).requests[0].operations, operations);
  const current = (await status(b)).requests[0];
  assert.equal(current.state, "reserved");
  assert.equal(current.grant.revoked, false);
  assert.deepEqual(binding(current), binding(unrelated));
  assert.equal(f.actions().length, step === "release" ? 2 : 0);
});
}

for (const requiredResource of ["host-new", "procedure/shared"]) {
test(`updated recovery rejects unreserved ${requiredResource} and preserves compatible changed procedures`, async t => {
  const f = await setup(t, f => {
    f.policy.devices[0].resources = ["host-old"];
    f.policy.devices[1].resources = [requiredResource];
    for (const device of f.policy.devices) device.policyVersion = 2;
  });
  const a = await f.client("a"), b = await f.client("b");
  await request(a, "old-holder"); await request(b, "new-holder", "ios");
  const original = (await status(a)).requests[0], other = (await status(b)).requests[0];
  await call(a, "acknowledge", binding(original));
  await call(a, "device_run", { grant: binding(original), operationId: "action", procedure: "act", args: [] });
  f.policy.devices[0].resources = [requiredResource];
  f.policy.devices[0].policyVersion = 3; f.save();
  await f.restart();
  const held = f.broker.status().requests.find(r => r.id === original.id);
  f.broker.control(event("recover", binding(held)));
  await assert.rejects(f.broker.recover({
    requestId: held.id, operationId: "incompatible", procedure: "recover",
  }), /RECOVERY_RESOURCES_CHANGED/);
  let state = f.broker.status();
  assert.deepEqual(state.requests.find(r => r.id === original.id).resources, original.resources);
  assert.deepEqual(state.requests.find(r => r.id === other.id).resources, other.resources);
  assert.equal(state.requests.find(r => r.id === original.id).operations.length, 1);
  assert.ok(state.devices.some(d => d.holder === original.id && d.safety === "quarantined"));
  assert.ok(state.devices.some(d => d.holder === other.id && d.safety === "quarantined"));
  assert.equal(f.actions().length, 1);

  f.policy.devices[0].resources = ["host-old"];
  f.policy.devices[0].policyVersion = 4;
  f.policy.execution[0].procedures.recover.arguments[2] = "recover-changed"; f.save();
  await f.restart();
  const compatible = f.broker.status().requests.find(r => r.id === original.id);
  f.broker.control(event("recover", binding(compatible)));
  const result = await f.broker.recover({
    requestId: compatible.id, operationId: "compatible", procedure: "recover",
  });
  assert.equal(result.request.state, "released");
  assert.equal(f.actions().at(-1).action, "recover-changed");
  state = f.broker.status();
  assert.ok(state.devices.some(d => d.holder === other.id));
});
}

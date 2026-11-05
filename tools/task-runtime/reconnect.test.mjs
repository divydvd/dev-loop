import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { attachDeviceSession } from "./lib/device-session.mjs";
import { startBroker } from "../device-scheduler/server.mjs";
import { executionSetup, binding, event } from "../device-scheduler/execution-test-support.mjs";

test("idle queued adapters reconnect on socket creation and receive the grant without model polling", async t => {
  let cleanup;
  const f = executionSetup({ after(fn) { cleanup = fn; } });
  f.store.close();
  const socketPath = path.join(f.directory, "b.sock"), sent = [];
  let broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  const adapters = f.policy.sessions.map(({ id, token }) => {
    const file = path.join(f.root, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify({ sessionId: id, socketPath, credentials: { token }, repository: "fixture" }), { mode: 0o600 });
    return attachDeviceSession({ sessionId: id, on() {}, async send(message) {
      sent.push({ id, message }); return `message-${sent.length}`;
    } }, { enrollmentFile: file });
  });

  t.after(async () => { await Promise.all(adapters.map(a => a.close())); await broker.shutdown(); cleanup(); });
  const request = id => ({ requestId: id, device: "android", scope: "synthetic", resumeAction: "continue" });
  await adapters[0].call("device_request", request("first"));
  await adapters[1].call("device_request", request("second"));
  assert.equal((await adapters[1].call("device_status", {})).requests[0].state, "queued");
  assert.equal((await adapters[1].call("device_ack", { requestId: "second", generation: null, action: "wait_owner" })).request.state, "waiting_owner");
  await adapters[1].call("device_ack", { requestId: "second", generation: null, action: "resume" });
  await adapters[1].call("device_request", request("cancelled-queued"));
  assert.equal((await adapters[1].call("device_ack", { requestId: "cancelled-queued", generation: null, action: "cancel" })).request.state, "cancelled");
  await broker.shutdown();
  broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  const wait = async predicate => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, "event-driven reconnect or delivery timed out");
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  await wait(() => broker.status().sessions.length === 2);
  const holder = broker.status().requests.find(r => r.id === "first");
  broker.control(event("recover", binding(holder)));
  await broker.recover({ requestId: holder.id, operationId: "repair", procedure: "recover" });
  await wait(() => sent.some(e => e.id === "b"));
  assert.equal(sent.filter(e => e.id === "b").length, 1);
  assert.equal(broker.status().requests.find(r => r.id === "second").state, "reserved");
  assert.equal(sent.find(e => e.id === "b").message.mode, "enqueue");
});

test("recreated attachment enrolls without another model tool call", async t => {
  let cleanup;
  const f = executionSetup({ after(fn) { cleanup = fn; } });
  f.store.close();
  const socketPath = path.join(f.directory, "b.sock"), file = path.join(f.root, "a.json");
  const broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  fs.writeFileSync(file, JSON.stringify({
    sessionId: "a", socketPath, credentials: { token: f.policy.sessions[0].token }, repository: "fixture",
  }), { mode: 0o600 });
  const adapter = attachDeviceSession({ sessionId: "a", on() {} }, { enrollmentFile: file });
  t.after(async () => { await adapter.close(); await broker.shutdown(); cleanup(); });
  const deadline = Date.now() + 1000;
  while (!broker.status().sessions.includes("a")) {
    assert.ok(Date.now() < deadline, "attachment must proactively enroll");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { attachDeviceSession } from "./lib/device-session.mjs";
import { startBroker } from "../device-scheduler/server.mjs";
import { executionSetup, binding, event } from "../device-scheduler/execution-test-support.mjs";

for (const stop of ["abort", "owner", "halt"]) test(
  `queued reconnect after ${stop} cannot enroll or revoke trusted recovery`,
  async t => {
    let cleanup;
    const f = executionSetup({ after(fn) { cleanup = fn; } });
    f.store.close();
    const socketPath = path.join(f.directory, "b.sock"), file = path.join(f.root, "a.json");
    const broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
    fs.writeFileSync(file, JSON.stringify({
      sessionId: "a", socketPath, credentials: { token: f.policy.sessions[0].token }, repository: "fixture",
    }), { mode: 0o600 });
    const callbacks = new Map(), queued = [];
    const originalConnect = net.createConnection, immediate = globalThis.setImmediate;
    let transport, halted = false;
    t.mock.method(net, "createConnection", (...args) => { transport = originalConnect(...args); return transport; });
    // Hold only the production reconnect callback. Real sockets and broker state remain active.
    t.mock.method(globalThis, "setImmediate", (fn, ...args) => fn.name === "resume"
      ? immediate(() => queued.push(fn)) : immediate(fn, ...args));
    const adapter = attachDeviceSession({
      sessionId: "a", on(name, fn) { callbacks.set(name, fn); }, async send() { return "message"; },
    }, { enrollmentFile: file, halted: () => halted });
    t.after(async () => { await adapter.close(); await broker.shutdown(); cleanup(); });
    await adapter.call("device_request", { requestId: "held", device: "android", scope: "synthetic", resumeAction: "continue" });
    transport.destroy();
    const wait = async predicate => {
      const deadline = Date.now() + 2000;
      while (!predicate()) {
        assert.ok(Date.now() < deadline, "queued reconnect or detachment timed out");
        await new Promise(resolve => immediate(resolve));
      }
    };
    await wait(() => queued.length && broker.status().sessions.length === 0);
    if (stop === "halt") halted = true;
    else if (stop === "owner") callbacks.get("user.message")({ data: { content: "cancel", source: "user" } });
    else callbacks.get("abort")();
    const held = broker.status().requests[0], recovery = broker.control(event("recover", binding(held))).request;
    for (const resume of queued.splice(0)) resume();
    for (let i = 0; i < 30; i++) await new Promise(resolve => immediate(resolve));
    assert.equal(broker.status().sessions.length, 0, "queued resume must not enroll a terminal session");
    assert.equal(transport.destroyed, true);
    const current = broker.status().requests[0];
    assert.equal(current.grant.revoked, false);
    assert.deepEqual(binding(current), binding(recovery));
    await assert.rejects(adapter.call("device_status", {}), /SESSION_STOPPED/);
  },
);

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

test("stopped status cannot reconnect and revoke a trusted recovery grant", async t => {
  let cleanup;
  const f = executionSetup({ after(fn) { cleanup = fn; } });
  f.store.close();
  const socketPath = path.join(f.directory, "b.sock"), file = path.join(f.root, "a.json");
  const broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  fs.writeFileSync(file, JSON.stringify({
    sessionId: "a", socketPath, credentials: { token: f.policy.sessions[0].token }, repository: "fixture",
  }), { mode: 0o600 });
  const callbacks = new Map();
  const adapter = attachDeviceSession({
    sessionId: "a", on(name, fn) { callbacks.set(name, fn); }, async send() { return "message"; },
  }, { enrollmentFile: file });
  t.after(async () => { await adapter.close(); await broker.shutdown(); cleanup(); });
  await adapter.call("device_request", { requestId: "held", device: "android", scope: "synthetic", resumeAction: "continue" });
  callbacks.get("abort")();
  await adapter.close();
  const detached = async () => {
    const deadline = Date.now() + 2000;
    while (broker.status().sessions.length) {
      assert.ok(Date.now() < deadline, "cancelled peer must detach");
      await new Promise(resolve => setImmediate(resolve));
    }
  };
  await detached();
  const held = broker.status().requests[0];
  const recovery = broker.control(event("recover", binding(held))).request;
  await assert.rejects(adapter.call("device_status", {}), /SESSION_STOPPED/);
  await detached();
  const current = broker.status().requests[0];
  assert.equal(current.grant.revoked, false);
  assert.deepEqual(binding(current), binding(recovery));
});

test("oversized durable delivery stops immediate reconnect and permits an explicit repaired retry", async t => {
  const f = executionSetup(t), socketPath = path.join(f.root, "large.sock"), file = path.join(f.root, "a.json");
  let terminal = true, enrollments = 0;
  const peers = new Set();
  const server = net.createServer(socket => {
    peers.add(socket);
    socket.on("close", () => peers.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    let pending = "";
    socket.on("data", data => {
      pending += data;
      while (pending.includes("\n")) {
        const index = pending.indexOf("\n"), frame = JSON.parse(pending.slice(0, index));
        pending = pending.slice(index + 1);
        if (frame.type === "enroll") {
          enrollments++;
          socket.write(JSON.stringify({ type: "ready", sessionId: "a" }) + "\n");
          if (terminal) socket.end(JSON.stringify({ type: "error", code: "FRAME_TOO_LARGE" }) + "\n");
        } else socket.write(JSON.stringify({ type: "result", seq: frame.seq, result: { requests: [] } }) + "\n");
      }
    });
  });
  await new Promise(resolve => server.listen(socketPath, resolve));
  fs.writeFileSync(file, JSON.stringify({
    sessionId: "a", socketPath, credentials: { token: "a".repeat(64) }, repository: "fixture",
  }), { mode: 0o600 });
  const watch = fs.watch;
  // Measure closure-triggered retries without filesystem event delivery.
  fs.watch = (directory, listener) => directory === f.root ? { close() {} } : watch(directory, listener);
  const adapter = attachDeviceSession({ sessionId: "a", on() {} }, { enrollmentFile: file });
  t.after(async () => { fs.watch = watch; await adapter.close(); for (const peer of peers) peer.destroy(); await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(enrollments, 1, "permanent frame rejection must not cause an enrollment loop");
  terminal = false;
  assert.deepEqual((await adapter.call("device_status", {})).requests, []);
  assert.equal(enrollments, 2);
});

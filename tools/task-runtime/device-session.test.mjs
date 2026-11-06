import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { startBroker } from "../device-scheduler/server.mjs";
import { executionSetup } from "../device-scheduler/execution-test-support.mjs";

for (const stop of ["abort", "owner", "close"]) test(
  `${stop} detaches pending enrollment without a ready handshake`,
  async t => {
    const { attachDeviceSession } = await import("./lib/device-session.mjs");
    const f = executionSetup(t), socketPath = path.join(f.root, "pending.sock"), file = path.join(f.root, "pending.json");
    const callbacks = new Map(), peers = new Set(), frames = [];
    let enrolled;
    const enrollment = new Promise(resolve => { enrolled = resolve; });
    const server = net.createServer(socket => {
      peers.add(socket);
      socket.on("close", () => peers.delete(socket));
      socket.on("data", data => { frames.push(JSON.parse(data.toString().trim())); enrolled(); });
    });
    await new Promise(resolve => server.listen(socketPath, resolve));
    fs.writeFileSync(file, JSON.stringify({
      sessionId: "a", socketPath, credentials: { token: "a".repeat(64) }, repository: "fixture",
    }), { mode: 0o600 });
    const original = net.createConnection;
    let transport;
    t.mock.method(net, "createConnection", (...args) => { transport = original(...args); return transport; });
    const adapter = attachDeviceSession({ sessionId: "a", on(name, fn) { callbacks.set(name, fn); } }, { enrollmentFile: file });
    const outcome = adapter.call("device_status", {}).catch(error => error);
    t.after(async () => {
      transport?.destroy();
      for (const peer of peers) peer.destroy();
      await adapter.close();
      await new Promise(resolve => server.close(resolve));
    });
    await enrollment;
    const detached = once(transport, "close");
    let closed;
    if (stop === "close") closed = adapter.close();
    else if (stop === "owner") callbacks.get("user.message")({ data: { content: "stop", source: "user" } });
    else callbacks.get("abort")();
    for (let i = 0; i < 20 && !transport.destroyed; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(transport.destroyed, true, "terminal stop must destroy unfinished enrollment");
    await closed;
    if (stop === "close") assert.equal(transport.closed, true, "close must await transport detachment");
    await detached;
    assert.match((await outcome).message, /CONNECTION_ABORTED|SESSION_STOPPED/);
    assert.deepEqual(frames.map(frame => frame.type), ["enroll"]);
    await assert.rejects(adapter.call("device_status", {}), /SESSION_STOPPED/);
  },
);

test("attached tools bind host identity, queue grants through SDK, and preserve owner and cancellation boundaries", async t => {
  const { deviceTools, attachDeviceSession } = await import("./lib/device-session.mjs");
  let cleanup;
  const f = executionSetup({ after(fn) { cleanup = fn; } });
  f.store.close();
  const socketPath = path.join(f.directory, "b.sock");
  const broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  const callbacks = new Map(), sent = [];
  const session = { sessionId: "a", on(name, fn) { callbacks.set(name, fn); },
    async send(message) { sent.push(message); return `message-${sent.length}`; } };
  const file = path.join(f.root, "enrollment.json");
  fs.writeFileSync(file, JSON.stringify({
    sessionId: "a", socketPath, credentials: { token: f.policy.sessions[0].token }, repository: "fixture",
  }), { mode: 0o600 });
  const adapter = attachDeviceSession(session, { enrollmentFile: file });
  t.after(async () => { await adapter.close(); await broker.shutdown(); cleanup(); });
  const tools = deviceTools(() => adapter);
  const call = async (name, args) => JSON.parse(await tools.find(t => t.name === name).handler(args));
  assert.ok(tools.every(tool => tool.skipPermission === undefined));
  const queued = await call("device_request", { requestId: "r", device: "android", scope: "synthetic", resumeAction: "continue" });
  assert.equal(queued.request.sessionId, "a");
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].mode, "enqueue");
  assert.equal(JSON.stringify(sent).includes("synthetic-android-identity"), false);
  const r = (await call("device_status", {})).requests[0];
  assert.equal((await call("device_ack", { requestId: "r", generation: r.grant.generation, action: "wait_owner" })).request.state, "waiting_owner");
  const result = await tools.find(t => t.name === "device_run").handler({
    requestId: "r", generation: r.grant.generation, operationId: "bad", procedure: "act", sessionId: "b",
  });
  assert.equal(result.resultType, "failure");
  assert.equal(f.actions().length, 0);
  callbacks.get("user.message")({ data: { content: "stop", isAutopilotContinuation: true } });
  await call("device_ack", { requestId: "r", generation: r.grant.generation, action: "resume" });
  await call("device_ack", { requestId: "r", generation: r.grant.generation, action: "acknowledge" });
  callbacks.get("abort")();
  const stopped = await tools.find(t => t.name === "device_run").handler({
    requestId: "r", generation: r.grant.generation, operationId: "cancelled", procedure: "act",
  });
  assert.equal(stopped.resultType, "failure");
  assert.equal(f.actions().length, 0);
});

test("another host cannot use enrollment; missing enrollment is an explicit failure", async t => {
  const { attachDeviceSession, deviceTools } = await import("./lib/device-session.mjs");
  const f = executionSetup(t), file = path.join(f.root, "enrollment.json");
  fs.writeFileSync(file, JSON.stringify({ sessionId: "a", socketPath: "/unused", credentials: { token: "a".repeat(64) }, repository: "fixture" }), { mode: 0o600 });
  const session = { sessionId: "b", on() {} };
  for (const enrollmentFile of [file, path.join(f.root, "absent")]) {
    const adapter = attachDeviceSession(session, { enrollmentFile });
    t.after(() => adapter.close());
    const status = deviceTools(() => adapter).find(t => t.name === "device_status");
    const result = await status.handler({});
    assert.equal(result.resultType, "failure");
    assert.match(result.textResultForLlm, /DEVICE_(SESSION_MISMATCH|ENROLLMENT_FAILED)/);
    assert.equal(result.textResultForLlm.includes(f.root), false);
  }
});

test("host identity must match the identity authenticated by the private token", async t => {
  const { attachDeviceSession, deviceTools } = await import("./lib/device-session.mjs");
  let cleanup;
  const f = executionSetup({ after(fn) { cleanup = fn; } });
  f.store.close();
  const socketPath = path.join(f.directory, "b.sock"), file = path.join(f.root, "enrollment.json");
  const broker = await startBroker({ directory: f.directory, socketPath, policyPath: f.policyPath });
  fs.writeFileSync(file, JSON.stringify({
    sessionId: "a", socketPath, credentials: { token: f.policy.sessions[1].token }, repository: "fixture",
  }), { mode: 0o600 });
  const adapter = attachDeviceSession({ sessionId: "a", on() {} }, { enrollmentFile: file });
  t.after(async () => { await adapter.close(); await broker.shutdown(); cleanup(); });
  const result = await deviceTools(() => adapter).find(t => t.name === "device_status").handler({});
  assert.equal(result.resultType, "failure");
  assert.equal(result.textResultForLlm, "DEVICE_SESSION_MISMATCH");
});

test("native cancellation during enrollment closes the late connection before request admission", async t => {
  const { attachDeviceSession, deviceTools } = await import("./lib/device-session.mjs");
  const f = executionSetup(t), socketPath = path.join(f.root, "delayed.sock"), file = path.join(f.root, "late.json");
  const callbacks = new Map(), frames = [], peers = new Set();
  const server = net.createServer(socket => {
    peers.add(socket);
    socket.on("error", error => assert.ok(["EPIPE", "ECONNRESET"].includes(error.code), "only cancellation write failure is expected"));
    socket.setEncoding("utf8");
    socket.on("data", data => {
      for (const line of data.trim().split("\n")) {
        const frame = JSON.parse(line); frames.push(frame);
        if (frame.type === "enroll") {
          callbacks.get("abort")();
          socket.write(JSON.stringify({ type: "ready", sessionId: "a" }) + "\n");
        } else socket.write(JSON.stringify({ type: "result", seq: frame.seq, result: { request: { state: "reserved" } } }) + "\n");
      }
    });
  });
  await new Promise(resolve => server.listen(socketPath, resolve));
  fs.writeFileSync(file, JSON.stringify({ sessionId: "a", socketPath, credentials: { token: "a".repeat(64) }, repository: "fixture" }), { mode: 0o600 });
  const adapter = attachDeviceSession({ sessionId: "a", on(name, fn) { callbacks.set(name, fn); } }, { enrollmentFile: file });
  t.after(async () => { await adapter.close(); for (const peer of peers) peer.destroy(); await new Promise(resolve => server.close(resolve)); });
  const result = await deviceTools(() => adapter).find(t => t.name === "device_request").handler({
    requestId: "late", device: "android", scope: "synthetic", resumeAction: "continue",
  });
  assert.equal(result.resultType, "failure");
  assert.equal(frames.filter(frame => frame.type === "request").length, 0);
});

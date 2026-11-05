import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { once } from "node:events";
import { fork } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { setup, inbox, event, requestEvent, raw } from "./broker-test-support.mjs";
import { binding } from "./test-support.mjs";
import { openStore } from "./lib/store.mjs";
import { applyEvent } from "./lib/queue.mjs";
import { startBroker } from "./server.mjs";
import { connectBroker } from "./lib/client.mjs";

test("durable queued responses precede exclusive automatic grants and explicit release hands off", async t => {
  const f = await setup(t), aEvents = inbox(), bEvents = inbox();
  const a = await f.client("a", aEvents.receive), b = await f.client("b", bEvents.receive);
  const [first, second] = await Promise.all([a.request(requestEvent("first")), b.request(requestEvent("second"))]);
  assert.equal(first.request.state, "queued");
  assert.equal(second.request.state, "queued");
  const granted = await aEvents.wait(e => e.kind === "reserve"), grant = binding(granted.request.grant);
  assert.equal((await b.reconcile(second.outgoingEventIds[0].slice(0, -6))).request.state, "queued");
  await a.request(event("acknowledge", grant));
  await a.request(event("release", { ...grant, clean: true, result: "pass" }));
  assert.equal((await bEvents.wait(e => e.kind === "reserve")).request.id, "second");
  const mode = fs.statSync(f.socketPath).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("owner-blocked queued work does not block independent eligible requests", async t => {
  const f = await setup(t), events = inbox(), a = await f.client(), b = await f.client("b", events.receive);
  await a.request(requestEvent("holder"));
  await a.request(requestEvent("waiting"));
  await a.request(event("wait_owner", { requestId: "waiting" }));
  await b.request(requestEvent("independent", "ios"));
  assert.equal((await events.wait(e => e.kind === "reserve")).request.id, "independent");
});

test("reconnect replays unacknowledged snapshots and retains acknowledged records after restart", async t => {
  const f = await setup(t), events = inbox(), a = await f.client("a", events.receive);
  const input = requestEvent("first");
  const result = await a.request(input);
  await events.wait(e => e.kind === "reserve");
  await a.acknowledge(result.outgoingEventIds[0]);
  await a.close();
  const reconnected = inbox(), next = await f.client("a", reconnected.receive);
  const fault = await reconnected.wait(e => e.kind === "fault");
  assert.equal(fault.request.state, "recovering");
  assert.equal(reconnected.events.some(e => e.id === result.outgoingEventIds[0]), false);
  assert.equal((await next.request(input)).replayed, true);
  await next.acknowledge(fault.id);
  await next.acknowledge(fault.id);
  await next.close();
  await f.restart();
  const store = openStore({ directory: f.directory });
  try {
    assert.equal(store.read().outbox.find(e => e.id === fault.id).acknowledged, true);
    assert.equal(store.read().devices[0].safety, "quarantined");
  } finally { store.close(); }
});

test("disconnect never transfers a held device or its shared resources", async t => {
  const f = await setup(t), ae = inbox(), be = inbox();
  const a = await f.client("a", ae.receive), b = await f.client("b", be.receive);
  await a.request(requestEvent("first"));
  const grant = binding((await ae.wait(e => e.kind === "reserve")).request.grant);
  await a.request(event("acknowledge", grant));
  await a.request(event("operation_start", { ...grant, operationId: "operation", purpose: "test" }));
  const queued = requestEvent("second");
  await b.request(queued);
  await a.close();
  await f.restart();
  const fresh = await f.client("b");
  assert.equal((await fresh.reconcile(queued.id)).request.state, "queued");
  const store = openStore({ directory: f.directory });
  try {
    const state = store.read();
    assert.equal(state.devices[0].holder, "first");
    assert.equal(state.devices[0].safety, "quarantined");
    assert.equal(state.requests[0].operations[0].outcome, "inflight");
  } finally { store.close(); }
});

test("uncertain admission reconciles original event and never repeats a logical operation", async t => {
  const f = await setup(t), events = inbox(), a = await f.client("a", events.receive);
  await a.request(requestEvent("first"));
  const grant = binding((await events.wait(e => e.kind === "reserve")).request.grant);
  await a.request(event("acknowledge", grant));
  const start = event("operation_start", { ...grant, operationId: "one", purpose: "test" });
  await a.request(start);
  const reconciled = await a.reconcile(start.id);
  assert.equal(reconciled.admitted, true);
  assert.equal(reconciled.result.request.operations.length, 1);
  assert.equal((await a.request(start)).replayed, true);
  await assert.rejects(a.request(event("operation_start", start.payload)), /DUPLICATE_OPERATION/);
  await assert.rejects(a.request(event("release", { ...grant, clean: true, result: "pass" })), /UNRESOLVED_OPERATION/);
  assert.deepEqual(await a.reconcile("missing"), { admitted: false });
});

test("enrollment binds identity and role; frames cannot cross sessions or forge authority", async t => {
  const f = await setup(t), a = await f.client(), b = await f.client("b");
  const first = requestEvent("first");
  const result = await a.request(first);
  assert.equal(result.request.sessionId, "a");
  await assert.rejects(b.reconcile(first.id), /SESSION_MISMATCH/);
  await assert.rejects(b.acknowledge(result.outgoingEventIds[0]), /DELIVERY_NOT_FOUND/);
  await assert.rejects(b.request(event("cancel", { requestId: "first" })), /SESSION_MISMATCH/);
  for (const kind of ["policy", "fault", "recover", "reserve"]) {
    await assert.rejects(a.request(event(kind, {})), /FORBIDDEN/);
  }
  const reservedId = { ...requestEvent("forged"), id: "broker/forged" };
  await assert.rejects(a.request(reservedId), /FORBIDDEN/);
  const forged = event("request", { ...first.payload, requestId: "forged", sessionId: "b" });
  await assert.rejects(a.request(forged), /INVALID_EVENT/);
  const peer = await raw(f.socketPath);
  t.after(() => peer.socket.destroy());
  peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a, id: "b", role: "scheduler" }) + "\n");
  assert.equal((await peer.messages.wait(e => e.type === "error")).code, "INVALID_FRAME");
});

test("malformed, oversized, unauthenticated, and invalid-token traffic returns safe errors", async t => {
  const f = await setup(t);
  for (const [input, expected] of [
    ["{\n", "INVALID_FRAME"], ["x".repeat(65537), "FRAME_TOO_LARGE"],
    [JSON.stringify({ type: "request", seq: 1, event: requestEvent("unauth") }) + "\n", "UNAUTHENTICATED"],
    [JSON.stringify({ type: "enroll", token: "0".repeat(64) }) + "\n", "UNAUTHENTICATED"],
  ]) {
    const peer = await raw(f.socketPath);
    const closed = once(peer.socket, "close");
    peer.socket.write(input);
    const result = await peer.messages.wait(e => e.type === "error");
    assert.equal(result.code, expected);
    assert.equal(JSON.stringify(result).includes(f.tokens.a), false);
    await closed;
  }
  await assert.rejects(connectBroker({
    socketPath: f.socketPath, credentials: { token: f.tokens.a, id: "b" }, onEvent() {},
  }), /INVALID_CREDENTIALS/);
});

test("malformed event IDs return validation errors without dropping an authenticated connection", async t => {
  const f = await setup(t), a = await f.client();
  for (const id of [3, {}, [], null]) {
    await assert.rejects(a.request({ ...requestEvent("bad-id"), id }), /INVALID_EVENT/);
  }
  assert.equal((await a.request(requestEvent("valid-id"))).request.id, "valid-id");
});

test("private policy validation rejects duplicate enrollment and device records before changing state", async t => {
  const f = await setup(t);
  await f.broker.shutdown();
  const initial = fs.readFileSync(f.policyPath, "utf8"), config = JSON.parse(initial);
  config.devices.push({ ...config.devices[0], policyVersion: 2 });
  fs.writeFileSync(f.policyPath, JSON.stringify(config));
  let unexpected;
  try { await assert.rejects(async () => { unexpected = await startBroker(f); }, /INVALID_POLICY/); }
  finally { await unexpected?.shutdown(); }
  const store = openStore({ directory: f.directory });
  try { assert.equal(store.read().policies.length, 2); } finally { store.close(); }
  fs.writeFileSync(f.policyPath, initial);
});

test("restart accepts unchanged policy fields in a different property order", async t => {
  const f = await setup(t);
  const config = JSON.parse(fs.readFileSync(f.policyPath, "utf8"));
  config.devices = config.devices.map(d => ({
    enabled: d.enabled, resources: d.resources, policyVersion: d.policyVersion, device: d.device,
  }));
  fs.writeFileSync(f.policyPath, JSON.stringify(config));
  await f.restart();
  const a = await f.client();
  assert.equal((await a.request(requestEvent("reordered-policy"))).request.id, "reordered-policy");
});

test("different devices sharing a host resource cannot receive competing grants", async t => {
  const f = await setup(t, { devices: [
    { device: "android", policyVersion: 1, resources: ["usb"], enabled: true },
    { device: "ios", policyVersion: 1, resources: ["usb"], enabled: true },
  ] });
  const ae = inbox(), be = inbox(), a = await f.client("a", ae.receive), b = await f.client("b", be.receive);
  await a.request(requestEvent("android-holder"));
  const grant = binding((await ae.wait(e => e.kind === "reserve")).request.grant);
  const waiting = requestEvent("ios-waiter", "ios");
  await b.request(waiting);
  assert.equal((await b.reconcile(waiting.id)).request.state, "queued");
  await a.request(event("acknowledge", grant));
  await a.request(event("release", { ...grant, clean: true, result: "pass" }));
  assert.equal((await be.wait(e => e.kind === "reserve")).request.id, "ios-waiter");
});

test("a slow client's response backpressure does not revoke another client's running grant", { timeout: 30000 }, async t => {
  const f = await setup(t), events = inbox(), a = await f.client("a", events.receive);
  await a.request(requestEvent("unrelated-holder"));
  const grant = binding((await events.wait(e => e.kind === "reserve")).request.grant);
  await a.request(event("acknowledge", grant));
  const operation = event("operation_start", { ...grant, operationId: "unrelated-operation", purpose: "test" });
  await a.request(operation);
  const peer = await raw(f.socketPath);
  peer.socket.on("error", () => {});
  t.after(() => peer.socket.destroy());
  peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.b }) + "\n");
  await peer.messages.wait(e => e.type === "ready");
  peer.socket.pause();
  const peerClosed = new Promise(resolve => peer.socket.once("close", resolve));
  peer.socket.write(Array.from({ length: 15000 }, (_, index) =>
    JSON.stringify({ type: "reconcile", seq: index + 1, eventId: "absent" }) + "\n").join(""));
  await peerClosed;
  const current = (await a.reconcile(operation.id)).request;
  assert.equal(current.state, "running");
  assert.equal(current.grant.revoked, false);
  assert.equal(current.operations[0].outcome, "inflight");
  const reconnected = await f.client("b");
  assert.deepEqual(await reconnected.reconcile("absent"), { admitted: false });
});

test("second authority and duplicate session are refused without unlinking an active socket", async t => {
  const f = await setup(t), inode = fs.statSync(f.socketPath).ino;
  await assert.rejects(startBroker({
    directory: f.directory, socketPath: join(f.directory, "other.sock"), policyPath: f.policyPath,
  }), /AUTHORITY_ACTIVE/);
  assert.equal(fs.statSync(f.socketPath).ino, inode);
  const a = await f.client();
  await assert.rejects(f.client(), /SESSION_CONNECTED/);
  assert.equal((await a.request(requestEvent("still-live"))).request.sessionId, "a");
});

test("the authority lock also refuses a competing process", async t => {
  const f = await setup(t);
  const child = fork(new URL("./fixtures/broker-child.mjs", import.meta.url), [
    f.directory, join(f.directory, "other.sock"), f.policyPath,
  ], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let errors = "";
  child.stderr.on("data", data => { errors += data; });
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
  assert.match(errors, /AUTHORITY_ACTIVE/);
  const a = await f.client();
  assert.equal((await a.request(requestEvent("same-authority"))).request.id, "same-authority");
});

test("startup schedules a request committed before scheduling or delivery", async t => {
  const f = await setup(t);
  await f.broker.shutdown();
  const input = requestEvent("committed-before-schedule"), store = openStore({ directory: f.directory });
  applyEvent(store, { id: "a", role: "session" }, input);
  store.close();
  await f.restart();
  const events = inbox(), a = await f.client("a", events.receive);
  assert.equal((await events.wait(e => e.kind === "reserve")).request.id, "committed-before-schedule");
  assert.equal((await a.reconcile(input.id)).result.request.state, "queued");
});

test("policy and socket paths reject unsafe files without deleting them", async t => {
  const f = await setup(t);
  await f.broker.shutdown();
  fs.writeFileSync(f.socketPath, "do not unlink", { mode: 0o600 });
  await assert.rejects(startBroker(f), /UNSAFE_SOCKET/);
  assert.equal(fs.readFileSync(f.socketPath, "utf8"), "do not unlink");
  fs.unlinkSync(f.socketPath);
  fs.chmodSync(f.policyPath, 0o644);
  await assert.rejects(startBroker(f), /UNSAFE_POLICY/);
});

test("an externally active owned socket is not unlinked", async t => {
  const f = await setup(t);
  await f.broker.shutdown();
  const occupied = net.createServer(socket => socket.end());
  occupied.listen(f.socketPath);
  await once(occupied, "listening");
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const inode = fs.statSync(f.socketPath).ino;
  await assert.rejects(startBroker(f), /SOCKET_ACTIVE/);
  assert.equal(fs.statSync(f.socketPath).ino, inode);
});

test("process crash after commit before acknowledgment preserves admission and quarantines the holder", async t => {
  const f = await setup(t);
  await f.broker.shutdown();
  const child = fork(new URL("./fixtures/broker-child.mjs", import.meta.url), [
    f.directory, f.socketPath, f.policyPath,
  ], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  await once(child, "message");
  const peer = await raw(f.socketPath);
  peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a }) + "\n");
  await peer.messages.wait(e => e.type === "ready");
  const input = requestEvent("crashed");
  peer.socket.write(JSON.stringify({ type: "request", seq: 1, event: input }) + "\n");
  const reserve = await peer.messages.wait(e => e.type === "event" && e.event.kind === "reserve");
  const grant = binding(reserve.event.request.grant);
  peer.socket.write(JSON.stringify({ type: "request", seq: 2, event: event("acknowledge", grant) }) + "\n");
  await peer.messages.wait(e => e.type === "result" && e.seq === 2);
  const operation = event("operation_start", { ...grant, operationId: "crash-op", purpose: "test" });
  peer.socket.write(JSON.stringify({ type: "request", seq: 3, event: operation }) + "\n");
  const committed = await peer.messages.wait(e => e.type === "event" && e.event.kind === "operation_start");
  peer.socket.write(JSON.stringify({ type: "ack", seq: 4, eventId: input.id + ":state" }) + "\n");
  await peer.messages.wait(e => e.type === "result" && e.seq === 4);
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  peer.socket.destroy();
  await f.restart();
  const received = inbox(), client = await f.client("a", received.receive);
  assert.equal((await client.reconcile(input.id)).admitted, true);
  const reconciled = await client.reconcile(operation.id);
  assert.equal(reconciled.result.request.operations.length, 1);
  assert.equal(reconciled.request.operations[0].outcome, "inflight");
  assert.equal((await received.wait(e => e.kind === "fault")).request.state, "recovering");
  assert.equal((await received.wait(e => e.id === committed.event.id)).request.state, "running");
  assert.equal(received.events.some(e => e.id === input.id + ":state"), false);
  assert.equal((await client.request(operation)).replayed, true);
  await assert.rejects(client.request(event("operation_start", operation.payload)), /INVALID_GRANT/);
});

test("background state failure closes the authority explicitly without exposing database details", async t => {
  const f = await setup(t);
  await f.broker.shutdown();
  const child = fork(new URL("./fixtures/broker-child.mjs", import.meta.url), [
    f.directory, f.socketPath, f.policyPath,
  ], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const messages = inbox();
  child.on("message", messages.receive);
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  await messages.wait(item => item === "ready");
  const peer = await raw(f.socketPath);
  t.after(() => peer.socket.destroy());
  peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a }) + "\n");
  await peer.messages.wait(e => e.type === "ready");
  const db = new DatabaseSync(join(f.directory, "scheduler.sqlite"));
  db.exec("UPDATE scheduler_state SET value=json_set(value, '$.next', 99)");
  db.close();
  peer.socket.destroy();
  const failure = await messages.wait(item => item?.closed);
  assert.deepEqual(failure.closed, { error: "BROKER_FAILED" });
});

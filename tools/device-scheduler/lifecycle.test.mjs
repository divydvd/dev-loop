import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { setup, raw, event, requestEvent } from "./broker-test-support.mjs";
import { binding } from "./test-support.mjs";
import { applyEvent } from "./lib/queue.mjs";
import { openStore } from "./lib/store.mjs";
import { startBroker } from "./server.mjs";

function captureSockets(t) {
  const sockets = [], mocks = [], blockedSockets = [], emit = net.Server.prototype.emit;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      for (const socket of blockedSockets) {
        delete socket.writableNeedDrain;
        delete socket.writableLength;
      }
      for (const mock of mocks) mock.mock.restore();
    } finally { for (const socket of sockets) socket.destroy(); }
  };
  t.after(release);
  mocks.push(t.mock.method(net.Server.prototype, "emit", function(name, ...args) {
    if (name === "connection") sockets.push(args[0]);
    return Reflect.apply(emit, this, [name, ...args]);
  }));
  return {
    sockets, release,
    delayClose(socket, blocked) {
      mocks.push(t.mock.method(socket, "destroy", function() { return this; }));
      blockedSockets.push(socket);
      Object.defineProperty(socket, "writableNeedDrain", { configurable: true, get: () => blocked });
      Object.defineProperty(socket, "writableLength", { configurable: true, get: () => blocked ? 1 : 0 });
    },
  };
}
function read(f) {
  const store = openStore({ directory: f.directory });
  try { return store.read(); } finally { store.close(); }
}
function createHolder(f, sessionId, requestId, device, phase = "running", wide = false) {
  const store = openStore({ directory: f.directory }), auth = { id: sessionId, role: "session" };
  const input = requestEvent(requestId, device);
  if (wide) for (const field of ["repository", "scope", "resumeAction"]) input.payload[field] = "x".repeat(500);
  try {
    applyEvent(store, auth, input);
    const grant = binding(applyEvent(store, auth, event("reserve", { requestId })).request.grant);
    if (phase === "running") {
      applyEvent(store, auth, event("acknowledge", grant));
      applyEvent(store, auth, event("operation_start", { ...grant, operationId: `${requestId}-operation`, purpose: "test" }));
    }
    return input;
  } finally { store.close(); }
}
function terminal(socket, signal) {
  if (signal === "reject") socket.emit("data", Buffer.from('{"type":"invalid"}\n'));
  else if (signal === "error") socket.emit("error", new Error("synthetic transport failure"));
  else socket.emit(signal);
}
function assertHistory(before, after) {
  assert.deepEqual(after.events.slice(0, before.events.length), before.events);
  assert.deepEqual(after.outbox.slice(0, before.outbox.length), before.outbox);
}

for (const signal of ["reject", "end", "error", "close"]) {
  for (const blocked of [false, true]) {
    for (const enrolled of [false, true]) {
      for (const phase of ["none", "reserved", "running"]) {
        test(`terminal ${signal}, output ${blocked ? "blocked" : "writable"}, ${enrolled ? "enrolled" : "unenrolled"}, holder ${phase}`, async t => {
          const capture = captureSockets(t), f = await setup(t);
          const peer = await raw(f.socketPath, { allowHalfOpen: true });
          t.after(() => peer.socket.destroy());
          let existing;
          if (enrolled) {
            peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a }) + "\n");
            await peer.messages.wait(frame => frame.type === "ready");
          } else existing = await f.client("a");
          const socket = capture.sockets[0];
          const active = phase !== "none";
          if (active) createHolder(f, "a", "holder-a", "android", phase);
          createHolder(f, "b", "holder-b", "ios");
          const before = read(f);
          capture.delayClose(socket, blocked);
          terminal(socket, signal);
          const after = read(f);
          assertHistory(before, after);
          assert.equal(after.events.length, before.events.length + (enrolled && active ? 1 : 0));
          assert.deepEqual(after.requests.find(r => r.id === "holder-b"), before.requests.find(r => r.id === "holder-b"));
          assert.deepEqual(after.devices.find(d => d.id === "ios"), before.devices.find(d => d.id === "ios"));
          if (active) {
            const holder = after.requests.find(r => r.id === "holder-a");
            assert.equal(holder.grant.revoked, enrolled);
            assert.equal(holder.state, enrolled ? "recovering" : phase);
            assert.equal(after.devices.find(d => d.id === "android").holder, "holder-a");
            assert.equal(after.devices.find(d => d.id === "android").safety, enrolled ? "quarantined" : phase === "running" ? "uncertain" : "safe");
            if (phase === "running") {
              assert.equal(holder.operations[0].id, "holder-a-operation");
              assert.equal(holder.operations[0].outcome, "inflight");
            } else assert.deepEqual(holder.operations, []);
          }
          if (!enrolled) {
            assert.deepEqual(await existing.reconcile("missing"), { admitted: false });
            return;
          }
          const replacement = await f.client("a");
          let renewed;
          if (active) {
            const store = openStore({ directory: f.directory });
            try {
              renewed = binding(applyEvent(store, { id: "broker", role: "scheduler" },
                event("recover", binding(after.requests.find(r => r.id === "holder-a").grant))).request.grant);
            } finally { store.close(); }
          } else {
            const input = requestEvent("replacement");
            await replacement.request(input);
            renewed = binding((await replacement.reconcile(input.id)).request.grant);
          }
          await replacement.request(event("acknowledge", renewed));
          const replacementState = read(f);
          for (const stale of ["end", "error", "close", "reject"]) terminal(socket, stale);
          socket.emit("data", Buffer.from(JSON.stringify({
            type: "request", seq: 99, event: requestEvent("stale-buffered"),
          }) + "\n"));
          assert.deepEqual(read(f), replacementState);
          assert.deepEqual(await replacement.reconcile("missing"), { admitted: false });
        });
      }
    }
  }
}

for (const response of ["result", "validation"]) {
  for (const phase of ["none", "reserved", "running"]) {
    test(`failed ${response} write detaches before close with holder ${phase}`, async t => {
      const capture = captureSockets(t), f = await setup(t);
      const peer = await raw(f.socketPath, { allowHalfOpen: true });
      t.after(() => peer.socket.destroy());
      peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a }) + "\n");
      await peer.messages.wait(frame => frame.type === "ready");
      const socket = capture.sockets[0];
      if (phase !== "none") createHolder(f, "a", "write-holder", "android", phase);
      capture.delayClose(socket, false);
      const write = socket.write;
      t.mock.method(socket, "write", function(data, ...args) {
        if (typeof data === "string" && data.includes(response === "result" ? '"type":"result"' : '"type":"error"')) {
          throw new Error("BACKPRESSURE");
        }
        return Reflect.apply(write, this, [data, ...args]);
      });
      const frame = response === "result" ? { type: "reconcile", seq: 1, eventId: "missing" }
        : { type: "request", seq: 1, event: { kind: null } };
      socket.emit("data", Buffer.from(JSON.stringify(frame) + "\n"));
      if (phase !== "none") {
        const state = read(f);
        assert.equal(state.requests.find(r => r.id === "write-holder").grant.revoked, true);
        assert.equal(state.devices.find(d => d.id === "android").safety, "quarantined");
        assert.equal(state.devices.find(d => d.id === "android").holder, "write-holder");
      }
      const replacement = await f.client("a");
      assert.deepEqual(await replacement.reconcile("missing"), { admitted: false });
    });
  }
}

for (const blocked of [false, true]) {
  test(`real half-close quarantines a running holder with ${blocked ? "blocked" : "writable"} output`, { timeout: 30000 }, async t => {
    const capture = captureSockets(t), f = await setup(t);
    const peer = await raw(f.socketPath, { allowHalfOpen: true });
    t.after(() => peer.socket.destroy());
    peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a }) + "\n");
    await peer.messages.wait(frame => frame.type === "ready");
    const socket = capture.sockets[0];
    const input = createHolder(f, "a", "eof-holder", "android", "running", blocked);
    if (blocked) {
      peer.socket.pause();
      const store = openStore({ directory: f.directory }), state = store.read();
      const staging = { read: () => state, transaction: work => work(state) };
      for (const outgoing of state.outbox) outgoing.acknowledged = true;
      for (let i = 0; i < 400; i++) {
        applyEvent(staging, { id: "a", role: "session" }, event("request", input.payload, `eof-output-${i}`));
      }
      store.transaction(current => Object.assign(current, state));
      store.close();
      const observer = await f.client("b");
      await observer.reconcile("missing");
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.ok(socket.writableNeedDrain && socket.writableLength > 0, "fixture did not block actual output");
    }
    const ended = once(socket, "end", { signal: AbortSignal.timeout(1000) });
    peer.socket.end();
    await ended;
    const state = read(f), holder = state.requests.find(r => r.id === "eof-holder");
    assert.equal(holder.grant.revoked, true);
    assert.equal(holder.state, "recovering");
    assert.equal(state.devices.find(d => d.id === "android").holder, "eof-holder");
    assert.equal(state.devices.find(d => d.id === "android").safety, "quarantined");
    const replacement = await f.client("a");
    assert.deepEqual(await replacement.reconcile("missing"), { admitted: false });
  });
}

for (const mode of ["shutdown", "internal failure"]) {
  test(`${mode} rejects buffered authority creation before transport close`, async t => {
    const capture = captureSockets(t), f = await setup(t);
    await f.broker.shutdown();
    const broker = await startBroker(f), peers = [];
    try {
      for (const id of ["a", "b"]) {
        const peer = await raw(f.socketPath, { allowHalfOpen: true });
        peers.push(peer);
        peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens[id] }) + "\n");
        await peer.messages.wait(frame => frame.type === "ready");
      }
      createHolder(f, "b", "before-stop", "ios");
      const before = read(f);
      for (const socket of capture.sockets) capture.delayClose(socket, false);
      const grant = { requestId: "after-stop", device: "android", policyVersion: 1, generation: 1 };
      const frames = [
        { type: "reconcile", seq: 1, eventId: "missing" },
        { type: "request", seq: 2, event: requestEvent("after-stop") },
        { type: "request", seq: 3, event: event("acknowledge", grant) },
        { type: "request", seq: 4, event: event("operation_start", {
          ...grant, operationId: "after-stop-operation", purpose: "test",
        }) },
      ];
      let closing, restore;
      if (mode === "shutdown") closing = broker.shutdown();
      else {
        const prepare = DatabaseSync.prototype.prepare;
        let failNext = true;
        const fault = t.mock.method(DatabaseSync.prototype, "prepare", function(sql, ...args) {
          if (failNext && sql === "SELECT value FROM scheduler_state WHERE id=1") {
            failNext = false;
            throw new Error("SYNTHETIC_READ_FAILURE");
          }
          return Reflect.apply(prepare, this, [sql, ...args]);
        });
        restore = () => fault.mock.restore();
      }
      try {
        const chunk = Buffer.from(frames.map(frame => JSON.stringify(frame)).join("\n") + "\n");
        capture.sockets[0].emit("data", chunk);
        capture.sockets[1].emit("data", chunk);
        restore?.();
        const after = read(f);
        assertHistory(before, after);
        assert.equal(after.requests.some(request => request.id === "after-stop"), false);
        assert.equal(after.events.length, before.events.length + 1);
        assert.equal(after.requests.find(request => request.id === "before-stop").grant.revoked, true);
        assert.equal(after.devices.find(device => device.id === "ios").holder, "before-stop");
        assert.equal(after.devices.find(device => device.id === "ios").safety, "quarantined");
      } finally {
        restore?.();
        capture.release();
        await closing;
      }
      assert.deepEqual(await broker.closed, { error: mode === "shutdown" ? null : "BROKER_FAILED" });
      assert.equal(read(f).requests.some(request => request.id === "after-stop"), false);
    } finally {
      capture.release();
      for (const peer of peers) peer.socket.destroy();
      if (mode === "shutdown") await broker.shutdown();
      else await assert.rejects(broker.shutdown(), /BROKER_FAILED/);
    }
  });
}

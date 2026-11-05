import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { setup, raw, event, requestEvent } from "./broker-test-support.mjs";
import { binding } from "./test-support.mjs";
import { applyEvent } from "./lib/queue.mjs";
import { openStore } from "./lib/store.mjs";

function captureSockets(t) {
  const sockets = [], mocks = [], blockedSockets = [], emit = net.Server.prototype.emit;
  t.after(() => {
    try {
      for (const socket of blockedSockets) {
        delete socket.writableNeedDrain;
        delete socket.writableLength;
      }
      for (const mock of mocks) mock.mock.restore();
    } finally { for (const socket of sockets) socket.destroy(); }
  });
  mocks.push(t.mock.method(net.Server.prototype, "emit", function(name, ...args) {
    if (name === "connection") sockets.push(args[0]);
    return Reflect.apply(emit, this, [name, ...args]);
  }));
  return {
    sockets,
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
function runningHolder(f, sessionId, requestId, device, wide = false) {
  const store = openStore({ directory: f.directory }), auth = { id: sessionId, role: "session" };
  const input = requestEvent(requestId, device);
  if (wide) for (const field of ["repository", "scope", "resumeAction"]) input.payload[field] = "x".repeat(500);
  try {
    applyEvent(store, auth, input);
    const grant = binding(applyEvent(store, auth, event("reserve", { requestId })).request.grant);
    applyEvent(store, auth, event("acknowledge", grant));
    applyEvent(store, auth, event("operation_start", { ...grant, operationId: `${requestId}-operation`, purpose: "test" }));
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
      for (const active of [false, true]) {
        test(`terminal ${signal}, output ${blocked ? "blocked" : "writable"}, ${enrolled ? "enrolled" : "unenrolled"}, holder ${active ? "active" : "unused"}`, async t => {
          const capture = captureSockets(t), f = await setup(t);
          const peer = await raw(f.socketPath, { allowHalfOpen: true });
          t.after(() => peer.socket.destroy());
          let existing;
          if (enrolled) {
            peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a }) + "\n");
            await peer.messages.wait(frame => frame.type === "ready");
          } else existing = await f.client("a");
          const socket = capture.sockets[0];
          if (active) runningHolder(f, "a", "holder-a", "android");
          runningHolder(f, "b", "holder-b", "ios");
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
            assert.equal(holder.state, enrolled ? "recovering" : "running");
            assert.equal(after.devices.find(d => d.id === "android").holder, "holder-a");
            assert.equal(after.devices.find(d => d.id === "android").safety, enrolled ? "quarantined" : "uncertain");
            assert.equal(holder.operations[0].id, "holder-a-operation");
            assert.equal(holder.operations[0].outcome, "inflight");
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
  for (const active of [false, true]) {
    test(`failed ${response} write detaches before close with ${active ? "active" : "unused"} holder`, async t => {
      const capture = captureSockets(t), f = await setup(t);
      const peer = await raw(f.socketPath, { allowHalfOpen: true });
      t.after(() => peer.socket.destroy());
      peer.socket.write(JSON.stringify({ type: "enroll", token: f.tokens.a }) + "\n");
      await peer.messages.wait(frame => frame.type === "ready");
      const socket = capture.sockets[0];
      if (active) runningHolder(f, "a", "write-holder", "android");
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
      if (active) {
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
    const input = runningHolder(f, "a", "eof-holder", "android", blocked);
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

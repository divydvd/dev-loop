import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once, getEventListeners } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setup, requestEvent, inbox } from "./broker-test-support.mjs";
import { connectBroker } from "./lib/client.mjs";
import { openStore } from "./lib/store.mjs";
import { decoder } from "./lib/protocol.mjs";

async function pausedPeer(t, ready = true, signal, onEvent = () => {}) {
  const f = await setup(t), enrolled = inbox();
  await f.broker.shutdown();
  let peer, transport;
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    peer = socket;
    socket.once("data", () => {
      socket.pause();
      if (ready) socket.write('{"type":"ready"}\n');
      enrolled.receive(socket);
    });
  });
  server.listen(f.socketPath);
  await once(server, "listening");
  const original = net.createConnection;
  const capture = t.mock.method(net, "createConnection", (...args) => {
    transport = original(...args); return transport;
  });
  const client = connectBroker({ socketPath: f.socketPath, credentials: { token: f.tokens.a }, onEvent, signal });
  capture.mock.restore();
  t.after(async () => {
    transport.destroy(); peer?.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  await enrolled.wait(() => true);
  return { client, peer, transport };
}

test("pre-aborted enrollment rejects asynchronously without creating a socket", async t => {
  const f = await setup(t), controller = new AbortController();
  controller.abort();
  const original = net.createConnection;
  let transport;
  t.mock.method(net, "createConnection", (...args) => { transport = original(...args); return transport; });
  const result = connectBroker({
    socketPath: f.socketPath, credentials: { token: f.tokens.a }, onEvent() {}, signal: controller.signal,
  });
  t.after(() => transport?.destroy());
  assert.ok(result instanceof Promise);
  await assert.rejects(result, /CONNECTION_ABORTED/);
  assert.equal(transport, undefined);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("host abort detaches enrollment without a ready handshake and removes its listener", async t => {
  const controller = new AbortController(), f = await pausedPeer(t, false, controller.signal);
  const outcome = f.client.catch(error => error);
  controller.abort();
  for (let i = 0; i < 20 && !f.transport.destroyed; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.transport.destroyed, true, "abort must destroy the socket before ready");
  assert.match((await outcome).message, /CONNECTION_ABORTED/);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("host abort preserves a completed result and rejects pending admission honestly", async t => {
  const controller = new AbortController(), f = await pausedPeer(t, true, controller.signal), client = await f.client;
  const completed = client.reconcile("completed");
  f.peer.write('{"type":"result","seq":1,"result":{"admitted":false}}\n');
  assert.deepEqual(await completed, { admitted: false });
  const outcomes = Promise.allSettled([client.request(requestEvent("aborted")), client.acknowledge("pending"), client.reconcile("pending")]);
  controller.abort();
  assert.equal(f.transport.destroyed, true);
  assert.equal(await client.closed, "CONNECTION_ABORTED");
  assert.ok((await outcomes).every(result => result.status === "rejected" && result.reason.message === "ADMISSION_UNCERTAIN"));
  assert.deepEqual(await completed, { admitted: false });
  await assert.rejects(client.request(requestEvent("after-abort")), /CONNECTION_ABORTED/);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("ordinary close removes the host abort listener", async t => {
  const controller = new AbortController(), f = await pausedPeer(t, true, controller.signal), client = await f.client;
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  await client.close();
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  controller.abort();
  assert.equal(await client.closed, "ADMISSION_UNCERTAIN");
});

for (const [terminal, reason] of [["abort", "CONNECTION_ABORTED"], ["close", "ADMISSION_UNCERTAIN"]]) test(
  `first ${terminal} reason survives an in-flight event handler rejection`,
  async t => {
    const controller = new AbortController();
    let started;
    const eventStarted = new Promise(resolve => { started = resolve; });
    const f = await pausedPeer(t, true, controller.signal, () => new Promise((resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("SYNTHETIC_WORK_ABORTED")), { once: true });
      started();
    }));
    const client = await f.client, completed = client.reconcile("completed-before-stop");
    f.peer.write('{"type":"result","seq":1,"result":{"admitted":false}}\n');
    assert.deepEqual(await completed, { admitted: false });
    const pending = Promise.allSettled([
      client.request(requestEvent("terminal-race")), client.acknowledge("pending"), client.reconcile("pending"),
    ]);
    f.peer.write('{"type":"event","event":{"id":"terminal-race"}}\n');
    await eventStarted;
    if (terminal === "close") void client.close();
    controller.abort();
    assert.equal(f.transport.destroyed, true);
    assert.equal(await client.closed, reason);
    assert.ok((await pending).every(result => result.status === "rejected" && result.reason.message === "ADMISSION_UNCERTAIN"));
    assert.deepEqual(await completed, { admitted: false });
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    await assert.rejects(client.request(requestEvent("after-terminal-race")), error => error.message === reason);
    assert.equal(await client.close(), reason);
  },
);

test("socket connection failure keeps its explicit reason and removes the abort listener", async t => {
  const f = await setup(t), controller = new AbortController();
  await assert.rejects(connectBroker({
    socketPath: `${f.socketPath}.absent`, credentials: { token: f.tokens.a }, signal: controller.signal, onEvent() {},
  }), /CONNECTION_FAILED/);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

for (const blocked of [false, true]) test(
  `client EOF settles pending operations with ${blocked ? "blocked" : "writable"} output`,
  async t => {
    const f = await pausedPeer(t), client = await f.client, settled = inbox();
    const calls = [
      client.request(requestEvent("eof")),
      client.acknowledge("eof:state"),
      client.reconcile("eof"),
    ];
    if (blocked) for (let i = 0; i < 32; i++) {
      calls.push(client.request({ id: `eof-${i}`, padding: "x".repeat(60000) }));
    }
    const outcomes = Promise.allSettled(calls);
    client.closed.then(reason => settled.receive(reason));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.transport.writableLength > 0, blocked);
    if (blocked) assert.equal(f.transport.writableNeedDrain, true);
    f.peer.end();
    assert.equal(await settled.wait(() => true), "ADMISSION_UNCERTAIN");
    const results = await outcomes;
    assert.ok(results.every(result => result.status === "rejected"));
    assert.ok(results.slice(0, 3).every(result => result.reason.message === "ADMISSION_UNCERTAIN"));
    assert.ok(results.every(result => ["ADMISSION_UNCERTAIN", "BACKPRESSURE"].includes(result.reason.message)));
    assert.equal(f.transport.destroyed, true);
    await assert.rejects(client.request(requestEvent("after-eof")), /ADMISSION_UNCERTAIN/);
    assert.equal(await client.close(), "ADMISSION_UNCERTAIN");
  },
);

test("a completed response survives EOF while blocked pending calls reject", async t => {
  const f = await pausedPeer(t), client = await f.client, settled = inbox();
  const completed = client.reconcile("already-known");
  const calls = [];
  for (let i = 0; i < 32; i++) {
    calls.push(client.request({ id: `remaining-${i}`, padding: "x".repeat(60000) }));
  }
  const outcomes = Promise.allSettled(calls);
  client.closed.then(reason => settled.receive(reason));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.transport.writableLength > 0);
  assert.equal(f.transport.writableNeedDrain, true);
  f.peer.end('{"type":"result","seq":1,"result":{"admitted":false}}\n');
  assert.deepEqual(await completed, { admitted: false });
  assert.equal(await settled.wait(() => true), "ADMISSION_UNCERTAIN");
  const results = await outcomes;
  assert.ok(results.some(result => result.status === "rejected" && result.reason.message === "ADMISSION_UNCERTAIN"));
  assert.ok(results.every(result => result.status === "rejected" &&
    ["ADMISSION_UNCERTAIN", "BACKPRESSURE"].includes(result.reason.message)));
  assert.equal(f.transport.destroyed, true);
});

test("EOF before readiness rejects enrollment instead of returning a client handle", async t => {
  const f = await pausedPeer(t, false);
  const rejected = assert.rejects(f.client, /ADMISSION_UNCERTAIN/);
  f.peer.end();
  await rejected;
  assert.equal(f.transport.destroyed, true);
});

test("coalesced ready and replay frames wait for the caller's handle assignment", async t => {
  const f = await setup(t), completed = inbox();
  await f.broker.shutdown();
  const server = net.createServer(socket => {
    socket.on("data", decoder(frame => {
      if (frame.type === "enroll") socket.write('{"type":"ready"}\n{"type":"event","event":{"id":"coalesced:state"}}\n');
      else socket.write(JSON.stringify({
        type: "result", seq: frame.seq,
        result: frame.type === "ack" ? { acknowledged: true } : { admitted: false },
      }) + "\n");
    }, () => socket.destroy()));
  });
  server.listen(f.socketPath);
  await once(server, "listening");
  let client;
  t.after(async () => { await client?.close(); await new Promise(resolve => server.close(resolve)); });
  client = await connectBroker({
    socketPath: f.socketPath, credentials: { token: f.tokens.a },
    async onEvent(outgoing) {
      const ack = await client.acknowledge(outgoing.id), admission = await client.reconcile("coalesced");
      completed.receive({ ack, admission });
    },
  });
  const result = await Promise.race([
    completed.wait(() => true),
    client.closed.then(reason => { throw new Error(reason); }),
  ]);
  assert.deepEqual(result, { ack: { acknowledged: true }, admission: { admitted: false } });
});

test("invalid client credentials remain an asynchronous rejection", async () => {
  const result = connectBroker({ socketPath: "unused", credentials: {}, onEvent() {} });
  assert.ok(result instanceof Promise);
  await assert.rejects(result, /INVALID_CREDENTIALS/);
});

test("invalid token types reject asynchronously without crashing the client host", async t => {
  const f = await setup(t);
  const cases = [
    ["undefined", "undefined"], ["null", "null"], ["boolean", "true"], ["number", "1"],
    ["bigint", 'BigInt("1".repeat(64))'], ["symbol", 'Symbol("synthetic")'],
    ["boxed string", 'new String("1".repeat(64))'], ["array", '["1".repeat(64)]'],
    ["coercible object", '({ toString() { return "1".repeat(64); } })'],
    ["throwing coercion", '({ toString() { throw new Error("COERCION_MUST_NOT_RUN"); } })'],
    ["function", 'Object.assign(() => {}, { toString() { return "1".repeat(64); } })'],
    ["empty", '""'], ["short", '"a".repeat(63)'], ["long", '"a".repeat(65)'],
    ["uppercase", '"A".repeat(64)'], ["non-hex", '"g".repeat(64)'],
  ];
  for (const [name, expression] of cases) await t.test(name, async () => {
    const source = `
      import assert from "node:assert/strict";
      import { connectBroker } from ${JSON.stringify(new URL("./lib/client.mjs", import.meta.url).href)};
      const result = connectBroker({
        socketPath: ${JSON.stringify(f.socketPath)}, credentials: { token: ${expression} }, onEvent() {},
      });
      assert.ok(result instanceof Promise);
      await assert.rejects(result, { message: "INVALID_CREDENTIALS" });
    `;
    await promisify(execFile)(process.execPath, ["--input-type=module", "-e", source], { timeout: 5000 });
  });
});

for (const changingGetter of [false, true]) test(
  `enrollment uses the validated token snapshot with ${changingGetter ? "a changing getter" : "caller mutation"}`,
  async t => {
    const f = await setup(t);
    let reads = 0;
    const credentials = changingGetter
      ? { get token() { return ++reads === 1 ? f.tokens.a : f.tokens.b; } }
      : { token: f.tokens.a };
    const pending = connectBroker({ socketPath: f.socketPath, credentials, onEvent() {} });
    if (!changingGetter) credentials.token = f.tokens.b;
    const client = await pending;
    t.after(() => client.close());
    const input = requestEvent("credential-snapshot");
    await client.request(input);
    assert.equal((await client.reconcile(input.id)).request.sessionId, "a");
  },
);

test("initial replay callbacks can acknowledge and reconcile through the awaited client handle", async t => {
  const f = await setup(t), first = await f.client(), input = requestEvent("initial-handle");
  await first.request(input);
  await first.close();
  const completed = inbox();
  let client;
  client = await connectBroker({
    socketPath: f.socketPath, credentials: { token: f.tokens.a },
    async onEvent(outgoing) {
      await client.acknowledge(outgoing.id);
      const current = await client.reconcile(input.id);
      completed.receive({ id: outgoing.id, admitted: current.admitted });
    },
  });
  t.after(() => client.close());
  const delivered = await Promise.race([
    completed.wait(item => item.id === input.id + ":state"),
    client.closed.then(reason => { throw new Error(reason); }),
  ]);
  assert.equal(delivered.admitted, true);
  const store = openStore({ directory: f.directory });
  try { assert.equal(store.read().outbox.find(e => e.id === delivered.id).acknowledged, true); }
  finally { store.close(); }
});

test("event callback failure is observable and closes the client instead of acknowledging delivery", async t => {
  const f = await setup(t);
  const client = await f.client("a", () => { throw new Error("private callback detail"); });
  const submitted = client.request(requestEvent("callback-failure"));
  await submitted.catch(error => assert.match(error.message, /ADMISSION_UNCERTAIN/));
  assert.equal(await client.closed, "EVENT_HANDLER_FAILED");
  const received = inbox();
  await f.client("a", received.receive);
  assert.equal((await received.wait(e => e.kind === "request")).request.id, "callback-failure");
});

test("client closure reports uncertain admission and does not resend a pending command", async t => {
  const f = await setup(t);
  await f.broker.shutdown();
  let commands = 0;
  const accepted = inbox(), server = net.createServer(socket => {
    let text = "";
    socket.setEncoding("utf8");
    socket.on("data", chunk => {
      text += chunk;
      let end;
      while ((end = text.indexOf("\n")) >= 0) {
        const frame = JSON.parse(text.slice(0, end)); text = text.slice(end + 1);
        if (frame.type === "enroll") socket.write('{"type":"ready"}\n');
        else { commands++; accepted.receive(frame); }
      }
    });
  });
  server.listen(f.socketPath);
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const client = await connectBroker({ socketPath: f.socketPath, credentials: { token: f.tokens.a }, onEvent() {} });
  const pending = client.request(requestEvent("uncertain"));
  const rejected = assert.rejects(pending, /ADMISSION_UNCERTAIN/);
  await accepted.wait(frame => frame.type === "request");
  await client.close();
  await rejected;
  assert.equal(commands, 1);
});

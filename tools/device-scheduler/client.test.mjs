import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { setup, requestEvent, inbox } from "./broker-test-support.mjs";
import { connectBroker } from "./lib/client.mjs";
import { openStore } from "./lib/store.mjs";
import { decoder } from "./lib/protocol.mjs";

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

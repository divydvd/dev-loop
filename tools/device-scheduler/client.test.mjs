import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { setup, requestEvent, inbox } from "./broker-test-support.mjs";
import { connectBroker } from "./lib/client.mjs";

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

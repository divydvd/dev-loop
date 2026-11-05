import fs from "node:fs";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBroker } from "./server.mjs";
import { connectBroker } from "./lib/client.mjs";

let sequence = 0;
export const event = (kind, payload, id = `input-${++sequence}`) => ({ version: 1, id, kind, payload });
export const requestEvent = (requestId, device = "android") => event("request", {
  requestId, device, policyVersion: 1, repository: "synthetic/repo", scope: "test", resumeAction: "resume",
});
export function inbox() {
  const events = [], waiting = [];
  return {
    events,
    receive(item) {
      events.push(item);
      for (const waiter of [...waiting]) if (waiter.predicate(item)) waiter.resolve(item);
    },
    wait(predicate) {
      const found = events.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("TEST_EVENT_TIMEOUT")), 3000);
        const waiter = { predicate, resolve: item => {
          clearTimeout(timer);
          waiting.splice(waiting.indexOf(waiter), 1);
          resolve(item);
        } };
        waiting.push(waiter);
      });
    },
  };
}
export async function setup(t, overrides = {}) {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), "broker-"));
  fs.chmodSync(root, 0o700);
  const directory = join(root, "s"), socketPath = join(directory, "b.sock"), policyPath = join(root, "policy.json");
  const tokens = { a: randomBytes(32).toString("hex"), b: randomBytes(32).toString("hex") };
  fs.writeFileSync(policyPath, JSON.stringify({
    version: 1, sessions: Object.entries(tokens).map(([id, token]) => ({ id, token })),
    devices: [
      { device: "android", policyVersion: 1, resources: ["usb"], enabled: true },
      { device: "ios", policyVersion: 1, resources: [], enabled: true },
    ], ...overrides,
  }), { mode: 0o600 });
  let broker = await startBroker({ directory, socketPath, policyPath });
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.close()));
    await broker.shutdown();
    fs.rmSync(root, { recursive: true });
  });
  return {
    root, directory, socketPath, policyPath, tokens,
    get broker() { return broker; },
    async restart() {
      await broker.shutdown();
      broker = await startBroker({ directory, socketPath, policyPath });
      return broker;
    },
    async client(id = "a", onEvent = () => {}) {
      const client = await connectBroker({ socketPath, credentials: { token: tokens[id] }, onEvent });
      clients.push(client);
      return client;
    },
  };
}
export async function raw(socketPath) {
  const socket = net.createConnection(socketPath), messages = inbox();
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      messages.receive(JSON.parse(buffer.slice(0, end)));
      buffer = buffer.slice(end + 1);
    }
  });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  return { socket, messages };
}

import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "./lib/store.mjs";
import { applyEvent } from "./lib/queue.mjs";
import { pending, acknowledgeDelivery, schedule, quarantineHolders, reconcile } from "./lib/delivery.mjs";
import { decoder, encode, exact, identifier } from "./lib/protocol.mjs";

const fail = code => { throw new Error(code); };
const safeCodes = new Set(("INVALID_EVENT FORBIDDEN EVENT_CONFLICT REQUEST_CONFLICT INVALID_POLICY SESSION_MISMATCH " +
  "INVALID_REQUEST NOT_ELIGIBLE INVALID_TRANSITION INVALID_GRANT GRANT_NOT_ACKNOWLEDGED RECOVERY_ONLY " +
  "DUPLICATE_OPERATION UNRESOLVED_OPERATION INVALID_OPERATION DELIVERY_NOT_FOUND FRAME_TOO_LARGE").split(" "));
function privateFile(file, code) {
  const stat = fs.lstatSync(file);
  if (fs.realpathSync(file) !== file || !stat.isFile() || stat.nlink !== 1 ||
      stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) fail(code);
}
function readPolicy(file) {
  privateFile(file, "UNSAFE_POLICY");
  if (fs.statSync(file).size > 1048576) fail("INVALID_POLICY");
  let policy;
  try { policy = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail("INVALID_POLICY"); }
  if (!exact(policy, ["version", "sessions", "devices"]) || policy.version !== 1 ||
      !Array.isArray(policy.sessions) || policy.sessions.length > 256 ||
      !Array.isArray(policy.devices) || policy.devices.length > 32 ||
      policy.sessions.some(s => !exact(s, ["id", "token"]) || !identifier(s.id) || s.id === "broker" ||
        typeof s.token !== "string" || !/^[a-f0-9]{64}$/.test(s.token)) ||
      new Set(policy.sessions.map(s => s.id)).size !== policy.sessions.length ||
      new Set(policy.sessions.map(s => s.token)).size !== policy.sessions.length ||
      new Set(policy.devices.map(d => d?.device)).size !== policy.devices.length ||
      policy.devices.some(d => !exact(d, ["device", "policyVersion", "resources", "enabled"]) ||
        !identifier(d.device) || !Number.isSafeInteger(d.policyVersion) || d.policyVersion < 1 ||
        typeof d.enabled !== "boolean" || !Array.isArray(d.resources) || d.resources.length > 32 ||
        !d.resources.every(identifier) || new Set(d.resources).size !== d.resources.length)) fail("INVALID_POLICY");
  return policy;
}
async function clearStaleSocket(socketPath) {
  let stat;
  try { stat = fs.lstatSync(socketPath); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!stat.isSocket() || stat.uid !== process.getuid()) fail("UNSAFE_SOCKET");
  await new Promise((resolve, reject) => {
    const probe = net.createConnection(socketPath);
    probe.once("connect", () => { probe.destroy(); reject(new Error("SOCKET_ACTIVE")); });
    probe.once("error", error => error.code === "ECONNREFUSED" ? resolve() : reject(new Error("UNSAFE_SOCKET")));
  });
  const current = fs.lstatSync(socketPath);
  if (current.ino !== stat.ino || current.dev !== stat.dev) fail("UNSAFE_SOCKET");
  fs.unlinkSync(socketPath);
}

/** Inactive until explicitly called by a trusted host. Owns one authority per state directory. */
export async function startBroker({ directory, socketPath, policyPath }) {
  const store = openStore({ directory });
  const peers = new Set(), sessions = new Map(), server = net.createServer();
  let lock, listening = false, stopped = false, inode, closing, failure, finish;
  const closed = new Promise(resolve => { finish = resolve; });
  const close = () => {
    if (closing) return closing;
    stopped = true;
    closing = (async () => {
      try { quarantineHolders(store, "crash"); } catch { failure = "BROKER_FAILED"; }
      for (const peer of peers) peer.socket.destroy();
      if (listening) await new Promise(resolve => server.close(error => {
        if (error) failure = "BROKER_FAILED";
        resolve();
      }));
      try { store.close(); } catch { failure = "BROKER_FAILED"; }
      try { lock?.close(); } catch { failure = "BROKER_FAILED"; }
      finish({ error: failure ?? null });
    })();
    return closing;
  };
  const abort = () => { failure = "BROKER_FAILED"; void close(); };
  try {
    const policy = readPolicy(policyPath), lockPath = path.join(directory, "authority.sqlite");
    if (path.dirname(socketPath) !== directory || path.normalize(socketPath) !== socketPath) fail("UNSAFE_SOCKET");
    try { fs.closeSync(fs.openSync(lockPath, "wx", 0o600)); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    privateFile(lockPath, "UNSAFE_AUTHORITY");
    lock = new DatabaseSync(lockPath);
    try { lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE"); } catch { fail("AUTHORITY_ACTIVE"); }
    await clearStaleSocket(socketPath);
    quarantineHolders(store, "crash");
    for (const device of policy.devices) {
      const saved = store.read().policies.findLast(p => p.device === device.device);
      if (saved && saved.policyVersion >= device.policyVersion) {
        if (saved.policyVersion !== device.policyVersion || saved.enabled !== device.enabled ||
            JSON.stringify(saved.resources) !== JSON.stringify(device.resources)) fail("POLICY_VERSION");
        continue;
      }
      const id = createHash("sha256").update(device.device).digest("hex") + "/" + device.policyVersion;
      applyEvent(store, { id: "broker", role: "scheduler" }, {
        version: 1, id: `broker/policy/${id}`, kind: "policy", payload: device,
      });
    }
    schedule(store);
    const write = (peer, frame) => {
      const data = encode(frame);
      if (peer.socket.writableLength + Buffer.byteLength(data) > 262144) fail("BACKPRESSURE");
      return peer.socket.write(data);
    };
    const detach = peer => {
      if (sessions.get(peer.session) !== peer) return;
      sessions.delete(peer.session);
      if (!stopped) {
        try { quarantineHolders(store, "disconnected", peer.session); schedule(store); broadcast(); }
        catch { abort(); }
      }
    };
    const terminate = (peer, code) => {
      peer.ended = true;
      detach(peer);
      if (peer.socket.destroyed) return;
      if (peer.socket.writableNeedDrain || peer.socket.writableLength) { peer.socket.destroy(); return; }
      peer.socket.end(encode({ type: "error", code }), () => peer.socket.destroy());
      if (peer.socket.writableLength) peer.socket.destroy();
    };
    const publish = peer => {
      if (!peer.session || peer.ended || peer.socket.destroyed || peer.socket.writableNeedDrain) return;
      for (const item of pending(store, peer.session)) {
        if (peer.sent.has(item.id)) continue;
        let data;
        try { data = encode({ type: "event", event: item }); }
        catch (error) {
          if (error.message !== "FRAME_TOO_LARGE") throw error;
          terminate(peer, "FRAME_TOO_LARGE"); return;
        }
        peer.sent.add(item.id);
        if (!peer.socket.write(data)) break;
      }
    };
    const broadcast = () => { for (const peer of peers) publish(peer); };
    server.on("connection", socket => {
      const peer = { socket, session: null, sent: new Set(), ended: false };
      peers.add(peer);
      socket.on("error", () => socket.destroy());
      socket.on("drain", () => { try { publish(peer); } catch { abort(); } });
      socket.on("close", () => {
        peers.delete(peer);
        detach(peer);
      });
      socket.on("data", decoder(frame => {
        if (peer.ended) return;
        let committed = false;
        try {
          if (!peer.session) {
            if (frame.type !== "enroll") { terminate(peer, "UNAUTHENTICATED"); return; }
            if (!exact(frame, ["type", "token"])) { terminate(peer, "INVALID_FRAME"); return; }
            const session = typeof frame.token === "string" && /^[a-f0-9]{64}$/.test(frame.token) &&
              policy.sessions.find(s => timingSafeEqual(Buffer.from(s.token), Buffer.from(frame.token)));
            if (!session) { terminate(peer, "UNAUTHENTICATED"); return; }
            if (sessions.has(session.id)) { terminate(peer, "SESSION_CONNECTED"); return; }
            peer.session = session.id; sessions.set(session.id, peer);
            write(peer, { type: "ready" }); publish(peer); return;
          }
          const field = frame.type === "request" ? "event" : "eventId";
          if (!["request", "ack", "reconcile"].includes(frame.type) ||
              !exact(frame, ["type", "seq", field]) || !Number.isSafeInteger(frame.seq) || frame.seq < 1 ||
              field === "eventId" && (typeof frame.eventId !== "string" || frame.eventId.length > 166)) {
            terminate(peer, "INVALID_FRAME"); return;
          }
          let result;
          if (frame.type === "request") {
            if (typeof frame.event?.kind !== "string") fail("INVALID_EVENT");
            if (["policy", "fault", "recover", "reserve"].includes(frame.event?.kind) ||
                typeof frame.event?.id === "string" && frame.event.id.startsWith("broker/")) fail("FORBIDDEN");
            result = applyEvent(store, { id: peer.session, role: "session" }, frame.event);
          } else result = frame.type === "ack" ? acknowledgeDelivery(store, peer.session, frame.eventId)
            : reconcile(store, peer.session, frame.eventId);
          schedule(store);
          committed = true;
          write(peer, { type: "result", seq: frame.seq, result });
        } catch (error) {
          if (error.message === "BACKPRESSURE") { peer.ended = true; peer.socket.destroy(); return; }
          if (!safeCodes.has(error.message)) { abort(); return; }
          try { write(peer, { type: "error", seq: frame.seq, code: error.message }); }
          catch { peer.ended = true; peer.socket.destroy(); }
        } finally {
          if (committed && !stopped) {
            try { broadcast(); } catch { abort(); }
          }
        }
      }, code => terminate(peer, code)));
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    listening = true; fs.chmodSync(socketPath, 0o600); inode = fs.lstatSync(socketPath).ino;
    server.on("error", abort);
    return {
      closed,
      async shutdown() {
        await close();
        if (failure) fail(failure);
      },
    };
  } catch (error) {
    stopped = true;
    for (const peer of peers) peer.socket.destroy();
    if (listening) await new Promise(resolve => server.close(resolve));
    if (inode && fs.existsSync(socketPath) && fs.lstatSync(socketPath).ino === inode) fs.unlinkSync(socketPath);
    store.close(); lock?.close(); throw error;
  }
}

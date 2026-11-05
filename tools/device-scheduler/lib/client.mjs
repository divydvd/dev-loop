import net from "node:net";
import { decoder, encode, exact } from "./protocol.mjs";

/** Credentials come from the trusted host adapter, never model tool arguments. */
export async function connectBroker({ socketPath, credentials, onEvent }) {
  if (!exact(credentials, ["token"]) || !/^[a-f0-9]{64}$/.test(credentials.token) ||
      typeof onEvent !== "function") throw new Error("INVALID_CREDENTIALS");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath), waiting = new Map();
    let sequence = 0, ready = false, failure = "ADMISSION_UNCERTAIN", finish;
    const closed = new Promise(done => { finish = done; });
    const stop = code => { failure = code; socket.destroy(); };
    const issue = (type, fields) => new Promise((done, fail) => {
      if (socket.destroyed) { fail(new Error(failure)); return; }
      const seq = ++sequence;
      try {
        const data = encode({ type, seq, ...fields });
        if (socket.writableLength + Buffer.byteLength(data) > 262144) throw new Error("BACKPRESSURE");
        waiting.set(seq, { done, fail });
        socket.write(data);
      } catch (error) { waiting.delete(seq); fail(error); }
    });
    socket.on("connect", () => socket.write(encode({ type: "enroll", ...credentials })));
    socket.on("error", () => stop("CONNECTION_FAILED"));
    socket.on("close", () => {
      reject(new Error(failure));
      for (const call of waiting.values()) call.fail(new Error("ADMISSION_UNCERTAIN"));
      waiting.clear(); finish(failure);
    });
    socket.on("data", decoder(frame => {
      if (!ready && frame.type === "ready") {
        ready = true;
        resolve({
          request: event => issue("request", { event }),
          acknowledge: eventId => issue("ack", { eventId }),
          reconcile: eventId => issue("reconcile", { eventId }),
          close: () => { socket.destroy(); return closed; }, closed,
        });
      } else if (ready && frame.type === "event") {
        setImmediate(() => {
          if (!socket.destroyed) Promise.resolve().then(() => onEvent(frame.event)).catch(() => stop("EVENT_HANDLER_FAILED"));
        });
      } else if (frame.type === "error" && !frame.seq) stop(frame.code);
      else if (ready && waiting.has(frame.seq) && ["result", "error"].includes(frame.type)) {
        const call = waiting.get(frame.seq); waiting.delete(frame.seq);
        if (frame.type === "error") call.fail(new Error(frame.code));
        else call.done(frame.result);
      } else stop("INVALID_FRAME");
    }, stop));
  });
}

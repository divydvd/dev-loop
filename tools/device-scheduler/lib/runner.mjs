import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { applyEvent } from "./queue.mjs";
import { exact, identifier } from "./protocol.mjs";
import { readExecutionPolicy, checkPin, digest, privateJson, writePrivateJson } from "./policy.mjs";

const fail = code => { throw new Error(code); };
const bound = r => Object.fromEntries(["requestId", "device", "policyVersion", "generation"].map(k => [k, r.grant[k]]));
export function createRunner({ store, policyPath }) {
  const policy = readExecutionPolicy(policyPath), active = new Set();
  const journal = `${policyPath}.operations`, key = (r, id) => digest(JSON.stringify([r.id, id]));
  const records = () => {
    try { return privateJson(journal); }
    catch (error) { if (error.code !== "ENOENT") throw error; return {}; }
  };
  const record = (r, id, value) => writePrivateJson(journal, { ...records(), [key(r, id)]: value });
  const quiescent = r => {
    for (const op of r.operations.filter(o => o.outcome !== "complete")) {
      const entry = records()[key(r, op.id)];
      if (entry?.exited === true) continue;
      if (!Number.isSafeInteger(entry?.pid) || entry.pid < 1) fail("PROCESS_QUIESCENCE_UNKNOWN");
      try { process.kill(entry.pid, 0); }
      catch (error) { if (error.code === "ESRCH") continue; throw error; }
      fail("PROCESS_STILL_ACTIVE");
    }
  };
  const fresh = () => { if (readExecutionPolicy(policyPath).fingerprint !== policy.fingerprint) fail("STALE_POLICY"); };
  const request = (sessionId, grant) => {
    if (!exact(grant, ["requestId", "device", "policyVersion", "generation"])) fail("INVALID_GRANT");
    const r = store.read().requests.find(r => r.id === grant.requestId);
    if (!r || r.sessionId !== sessionId) fail("SESSION_MISMATCH");
    if (!r.grant || r.grant.revoked || Object.keys(grant).some(k => grant[k] !== r.grant[k])) fail("INVALID_GRANT");
    return r;
  };
  const emit = (sessionId, kind, payload, id = `runner/${randomUUID()}`) =>
    applyEvent(store, { id: sessionId, role: "session" }, { version: 1, id, kind, payload });
  const prefix = (sessionId, r, operationId) => `execute/${digest(JSON.stringify([sessionId, r.id, operationId]))}/`;
  const startId = (sessionId, r, op) => prefix(sessionId, r, op.operationId) + digest(JSON.stringify([op.procedure, op.args]));
  return {
    policy,
    active,
    async run(sessionId, op) {
      fresh();
      if (!exact(op, ["grant", "operationId", "procedure", "args"]) || !identifier(op.operationId) ||
          !identifier(op.procedure) || !Array.isArray(op.args) || op.args.length) fail("INVALID_OPERATION");
      const r = request(sessionId, op.grant), device = policy.execution?.find(d => d.device === r.device);
      const p = device?.procedures[op.procedure];
      if (!p || p.scope !== r.scope) fail("INVALID_PROCEDURE");
      if (r.grant.recovery && p.purpose !== "recovery") fail("RECOVERY_ONLY");
      checkPin(p.program); checkPin(device.helper);
      const id = startId(sessionId, r, op), previous = store.read().events.find(e => e.id.startsWith(prefix(sessionId, r, op.operationId)));
      if (previous) {
        if (previous.id !== id) fail("EVENT_CONFLICT");
        return { replayed: true, outcome: r.operations.find(o => o.id === op.operationId)?.outcome };
      }
      if (active.has(r.id)) fail("OPERATION_ACTIVE");
      if (r.grant.recovery) quiescent(r);
      emit(sessionId, "operation_start", { ...op.grant, operationId: op.operationId, purpose: p.purpose }, id);
      record(r, op.operationId, { pid: null, exited: false });
      active.add(r.id);
      try {
        const args = p.arguments.map(a => a === "{device}" ? device.identity : a === "{helper}" ? device.helper.path : a);
        const outcome = await new Promise((resolve, reject) => {
          let child, spawnFailed = false;
          try { child = spawn(p.program.path, args, { shell: false, stdio: "ignore", env: {} }); }
          catch { record(r, op.operationId, { pid: null, exited: true }); resolve("unknown"); return; }
          child.once("error", () => { spawnFailed = true; });
          child.once("close", (code, signal) => {
            try { record(r, op.operationId, { pid: child.pid ?? null, exited: true }); }
            catch (error) { reject(error); return; }
            resolve(code === 0 && !signal && !spawnFailed ? "complete" : "unknown");
          });
          record(r, op.operationId, { pid: child.pid ?? null, exited: false });
        });
        emit(sessionId, "operation_finish", { ...op.grant, operationId: op.operationId, outcome });
        if (outcome === "unknown") {
          applyEvent(store, { id: "broker", role: "scheduler" }, {
            version: 1, id: `runner/fault/${randomUUID()}`, kind: "fault", payload: { ...op.grant, reason: "failure" },
          });
        } else if (p.safe && p.purpose === "recovery") {
          for (const old of r.operations.filter(o => o.outcome !== "complete")) {
            emit(sessionId, "operation_finish", { ...op.grant, operationId: old.id, outcome: "complete" });
          }
        }
        return { replayed: false, outcome };
      } finally { active.delete(r.id); }
    },
    async release(sessionId, input) {
      fresh();
      if (!exact(input, ["grant", "result"]) || !["pass", "fail", "blocked"].includes(input.result)) fail("INVALID_OPERATION");
      const r = request(sessionId, input.grant), d = policy.execution?.find(d => d.device === r.device);
      const last = r.operations.at(-1);
      if (active.has(r.id) || !last || r.operations.some(o => o.outcome !== "complete") ||
          !Object.entries(d?.procedures ?? {}).some(([procedure, p]) => p.safe && store.read().events.some(e => {
            if (e.id !== startId(sessionId, r, { operationId: last.id, procedure, args: [] })) return false;
            const { event, authenticatedSession } = JSON.parse(e.signature);
            return event.kind === "operation_start" && authenticatedSession.id === sessionId &&
              Object.keys(input.grant).every(k => event.payload[k] === input.grant[k]) &&
              event.payload.operationId === last.id && event.payload.purpose === p.purpose;
          }))) fail("SAFE_CHECK_REQUIRED");
      checkPin(d.helper);
      return emit(sessionId, "release", { ...input.grant, clean: true, result: input.result });
    },
  };
}

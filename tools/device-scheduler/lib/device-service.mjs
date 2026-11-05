import { createRunner } from "./runner.mjs";
import { applyEvent } from "./queue.mjs";
import { exact } from "./protocol.mjs";

const fail = code => { throw new Error(code); };
export function deviceService(store, policyPath) {
  const runner = createRunner({ store, policyPath }), { policy } = runner;
  const managed = policy.execution?.length > 0;
  return {
    managed,
    active: runner.active,
    async handle(sessionId, event) {
      if (!exact(event, ["version", "id", "kind", "payload"]) || event.version !== 1) fail("INVALID_EVENT");
      const { payload: p } = event;
      if (event.kind === "device_status") {
        if (!exact(p, Object.hasOwn(p ?? {}, "requestId") ? ["requestId"] : [])) fail("INVALID_EVENT");
        return { requests: store.read().requests.filter(r => r.sessionId === sessionId && (!p.requestId || r.id === p.requestId)).slice(-16) };
      }
      if (!managed) fail("INVALID_POLICY");
      if (event.kind === "device_run") return runner.run(sessionId, p);
      if (event.kind === "device_release") return runner.release(sessionId, p);
      if (event.kind !== "device_request" ||
          !exact(p, ["requestId", "device", "repository", "scope", "resumeAction"])) fail("INVALID_EVENT");
      const d = policy.execution.find(d => d.alias === p.device);
      const current = policy.devices.find(item => item.device === d?.device);
      if (!d || !current?.enabled || !Object.values(d.procedures).some(proc => proc.scope === p.scope)) fail("INVALID_POLICY");
      return applyEvent(store, { id: sessionId, role: "session" }, {
        ...event, kind: "request", payload: { ...p, device: d.device, policyVersion: current.policyVersion },
      });
    },
  };
}

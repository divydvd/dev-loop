import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "./lib/store.mjs";
import { applyEvent } from "./lib/queue.mjs";

export const broker = { id: "synthetic-broker", role: "scheduler" };
export const alice = { id: "synthetic-a", role: "session" };
export const bob = { id: "synthetic-b", role: "session" };
let serial = 0;
export function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "scheduler-"));
  const directory = join(root, "private");
  const store = openStore({ directory });
  t.after(() => { store.close(); rmSync(root, { recursive: true }); });
  return { root, directory, store };
}
export function send(store, auth, kind, payload, id = `event-${++serial}`) {
  return applyEvent(store, auth, { version: 1, id, kind, payload });
}
export function policy(store, device = "synthetic-android", resources = [], policyVersion = 1, enabled = true) {
  return send(store, broker, "policy", { device, resources, policyVersion, enabled });
}
export function request(store, auth = alice, requestId = "request-a", device = "synthetic-android", policyVersion = 1) {
  return send(store, auth, "request", {
    requestId, device, policyVersion, repository: "synthetic/repo",
    scope: "synthetic-test", resumeAction: "resume-synthetic-test",
  });
}
export function reserve(store, auth = alice, requestId = "request-a") {
  return send(store, auth, "reserve", { requestId }).request.grant;
}
export function binding(grant) {
  return {
    requestId: grant.requestId, device: grant.device,
    policyVersion: grant.policyVersion, generation: grant.generation,
  };
}
export function acknowledge(store, auth = alice, grant = reserve(store, auth)) {
  send(store, auth, "acknowledge", binding(grant));
  return grant;
}

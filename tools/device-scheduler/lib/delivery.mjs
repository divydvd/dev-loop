import { createHash } from "node:crypto";
import { applyEvent, eligibleRequests } from "./queue.mjs";

const authority = { id: "broker", role: "scheduler" };
const key = value => createHash("sha256").update(value).digest("hex");
export function pending(store, sessionId) {
  return store.read().outbox.filter(e => e.sessionId === sessionId && e.acknowledged !== true);
}
export function acknowledgeDelivery(store, sessionId, eventId) {
  return store.transaction(state => {
    const item = state.outbox.find(e => e.id === eventId && e.sessionId === sessionId);
    if (!item) throw new Error("DELIVERY_NOT_FOUND");
    item.acknowledged = true;
    return { acknowledged: true };
  });
}
export function schedule(store) {
  for (const request of eligibleRequests(store)) {
    if (!eligibleRequests(store).some(r => r.id === request.id)) continue;
    applyEvent(store, { id: request.sessionId, role: "session" }, {
      version: 1, id: `broker/reserve/${key(request.id)}`, kind: "reserve", payload: { requestId: request.id },
    });
  }
}
export function quarantineHolders(store, reason, sessionId) {
  const state = store.read();
  for (const r of state.requests.filter(r => (!sessionId || r.sessionId === sessionId) &&
      state.devices.some(d => d.holder === r.id) && !r.grant.revoked)) {
    const { requestId, device, policyVersion, generation } = r.grant;
    applyEvent(store, authority, {
      version: 1, id: `broker/fault/${key(r.id)}/${generation}`, kind: "fault",
      payload: { requestId, device, policyVersion, generation, reason },
    });
  }
}
export function reconcile(store, sessionId, eventId) {
  const state = store.read(), record = state.events.find(e => e.id === eventId);
  if (!record) return { admitted: false };
  if (JSON.parse(record.signature).authenticatedSession.id !== sessionId) throw new Error("SESSION_MISMATCH");
  return {
    admitted: true, result: structuredClone(record.result),
    request: state.requests.find(r => r.id === record.result.request?.id) ?? null,
  };
}

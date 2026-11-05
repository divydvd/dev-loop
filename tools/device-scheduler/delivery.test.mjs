import test from "node:test";
import assert from "node:assert/strict";
import { pending, acknowledgeDelivery } from "./lib/delivery.mjs";
import { fixture, policy, request, alice, bob } from "./test-support.mjs";

test("acknowledgments are durable, scoped, idempotent, and retain immutable outbox history", t => {
  const { store } = fixture(t);
  policy(store);
  const result = request(store), id = result.outgoingEventIds[0], before = store.read();
  assert.equal(pending(store, alice.id).length, 1);
  assert.throws(() => acknowledgeDelivery(store, bob.id, id), /DELIVERY_NOT_FOUND/);
  assert.throws(() => acknowledgeDelivery(store, alice.id, "absent"), /DELIVERY_NOT_FOUND/);
  assert.deepEqual(acknowledgeDelivery(store, alice.id, id), { acknowledged: true });
  assert.deepEqual(acknowledgeDelivery(store, alice.id, id), { acknowledged: true });
  assert.deepEqual(pending(store, alice.id), []);
  const after = store.read();
  assert.deepEqual(after.events, before.events);
  assert.equal(after.outbox.length, before.outbox.length);
  assert.deepEqual(after.outbox.map(({ acknowledged, ...out }) => out), before.outbox);
});
test("pending delivery retains original order and detached immutable snapshots", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  request(store, alice, "request-two");
  const result = pending(store, alice.id);
  assert.deepEqual(result.map(e => e.request.id), ["request-a", "request-two"]);
  result[0].request.state = "released";
  assert.equal(pending(store, alice.id)[0].request.state, "queued");
});

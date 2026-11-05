import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { openStore } from "./lib/store.mjs";
import { eligibleRequests, applyEvent } from "./lib/queue.mjs";
import { fixture, policy, request, reserve, send, binding, alice, bob } from "./test-support.mjs";

test("oldest eligible request wins and duplicate request IDs do not add work", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  request(store);
  request(store, bob, "request-b");
  assert.deepEqual(eligibleRequests(store).map(r => r.id), ["request-a", "request-b"]);
  assert.throws(() => reserve(store, bob, "request-b"), /NOT_ELIGIBLE/);
  const grant = reserve(store);
  assert.equal(grant.sessionId, alice.id);
  assert.deepEqual(eligibleRequests(store), []);
  assert.throws(() => request(store, bob, "request-a"), /REQUEST_CONFLICT/);
  assert.equal(store.read().requests.length, 2);
});

test("exact event replay returns its committed outgoing IDs without another outbox entry", t => {
  const { store } = fixture(t);
  policy(store);
  const event = { version: 1, id: "stable-event", kind: "request", payload: {
    requestId: "stable-request", device: "synthetic-android", policyVersion: 1,
    repository: "synthetic/repo", scope: "test", resumeAction: "resume",
  } };
  const first = applyEvent(store, alice, event);
  assert.deepEqual(applyEvent(store, alice, event), { ...first, replayed: true });
  assert.equal(store.read().outbox.length, 2);
  assert.throws(() => applyEvent(store, bob, event), /EVENT_CONFLICT/);
  assert.throws(() => applyEvent(store, alice, { ...event, payload: { ...event.payload, scope: "changed" } }), /EVENT_CONFLICT/);
});

test("operation admission reports replay so the later runner cannot treat it as a new start", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = reserve(store);
  send(store, alice, "acknowledge", binding(grant));
  const event = {
    version: 1, id: "operation-admission", kind: "operation_start",
    payload: { ...binding(grant), operationId: "stable-operation", purpose: "test" },
  };
  assert.equal(applyEvent(store, alice, event).replayed, false);
  assert.equal(applyEvent(store, alice, event).replayed, true);
  assert.equal(store.read().requests[0].operations.length, 1);
  assert.equal(store.read().outbox.filter(e => e.kind === "operation_start").length, 1);
});

test("independent Android and iOS lanes can hold grants together", t => {
  const { store } = fixture(t);
  policy(store, "synthetic-android", ["android-helper"]);
  policy(store, "synthetic-ios", ["ios-helper"]);
  request(store);
  request(store, bob, "request-b", "synthetic-ios");
  reserve(store);
  assert.equal(reserve(store, bob, "request-b").device, "synthetic-ios");
  assert.equal(store.read().devices.filter(d => d.holder !== null).length, 2);
});

test("shared host resources are all-or-none and cannot be bypassed by a younger request", t => {
  const { store } = fixture(t);
  policy(store, "synthetic-android", ["heavy-build", "helper-port"]);
  policy(store, "synthetic-ios", ["heavy-build", "ios-helper"]);
  request(store);
  request(store, bob, "request-b", "synthetic-ios");
  assert.throws(() => reserve(store, bob, "request-b"), /NOT_ELIGIBLE/);
  const grant = reserve(store);
  assert.deepEqual(eligibleRequests(store), []);
  send(store, alice, "cancel", binding(grant));
  assert.equal(reserve(store, bob, "request-b").device, "synthetic-ios");
});

test("owner-blocked requests do not block unrelated work and resume keeps original age", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  request(store, bob, "request-b");
  send(store, alice, "wait_owner", { requestId: "request-a" });
  assert.deepEqual(eligibleRequests(store).map(r => r.id), ["request-b"]);
  send(store, alice, "resume", { requestId: "request-a" });
  assert.deepEqual(eligibleRequests(store).map(r => r.id), ["request-a", "request-b"]);
  const grant = reserve(store);
  send(store, alice, "wait_owner", binding(grant));
  assert.deepEqual(eligibleRequests(store), []);
  assert.throws(() => send(store, alice, "resume", { requestId: "request-a" }), /GRANT/);
});

test("concurrent handles cannot reserve the same device from stale snapshots", t => {
  const { store, directory } = fixture(t);
  policy(store);
  request(store);
  request(store, bob, "request-b");
  const other = openStore({ directory });
  t.after(() => other.close());
  assert.equal(eligibleRequests(other).length, 2);
  reserve(store);
  assert.throws(() => reserve(other, bob, "request-b"), /NOT_ELIGIBLE/);
  assert.equal(other.read().devices[0].holder, "request-a");
});

test("overlapping processes commit requests without losing state or outbox events", async t => {
  const { store, directory } = fixture(t);
  policy(store);
  const storeUrl = new URL("./lib/store.mjs", import.meta.url).href;
  const queueUrl = new URL("./lib/queue.mjs", import.meta.url).href;
  const children = Array.from({ length: 4 }, (_, n) => spawn(process.execPath, ["--input-type=module", "-e", `
    import {openStore} from ${JSON.stringify(storeUrl)};
    import {applyEvent} from ${JSON.stringify(queueUrl)};
    const store = openStore({directory: ${JSON.stringify(directory)}});
    applyEvent(store, {id: "process-${n}", role: "session"}, {
      version: 1, id: "process-event-${n}", kind: "request",
      payload: {requestId: "process-request-${n}", device: "synthetic-android", policyVersion: 1,
        repository: "synthetic/repo", scope: "test", resumeAction: "resume"}
    });
    store.close();
  `], { stdio: ["ignore", "pipe", "pipe"] }));
  const codes = await Promise.all(children.map(async child => (await once(child, "exit"))[0]));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  assert.equal(store.read().requests.length, 4);
  assert.equal(store.read().outbox.length, 5);
  const ids = eligibleRequests(store).map(r => r.id);
  const oldest = store.read().requests.find(r => r.id === ids[0]);
  assert.equal(reserve(store, { id: oldest.sessionId, role: "session" }, oldest.id).requestId, oldest.id);
});

test("overlapping grant attempts cannot both reserve a single request", async t => {
  const { store, directory } = fixture(t);
  policy(store);
  request(store);
  const storeUrl = new URL("./lib/store.mjs", import.meta.url).href;
  const queueUrl = new URL("./lib/queue.mjs", import.meta.url).href;
  const children = Array.from({ length: 2 }, (_, n) => spawn(process.execPath, ["--input-type=module", "-e", `
    import {openStore} from ${JSON.stringify(storeUrl)};
    import {applyEvent} from ${JSON.stringify(queueUrl)};
    const store = openStore({directory: ${JSON.stringify(directory)}});
    try {
      applyEvent(store, {id:"synthetic-a",role:"session"}, {
        version:1,id:"racing-grant-${n}",kind:"reserve",payload:{requestId:"request-a"}
      });
    } catch (error) {
      if (error.message !== "NOT_ELIGIBLE") throw error;
      process.exitCode = 3;
    } finally { store.close(); }
  `], { stdio: ["ignore", "pipe", "pipe"] }));
  const codes = await Promise.all(children.map(async child => (await once(child, "exit"))[0]));
  assert.deepEqual(codes.sort(), [0, 3]);
  assert.equal(store.read().devices[0].generation, 1);
  assert.equal(store.read().outbox.filter(e => e.kind === "reserve").length, 1);
});

test("policy history preserves old duties while new requests use the latest resource set", t => {
  const { store } = fixture(t);
  policy(store, "synthetic-android", ["host-old"]);
  request(store);
  policy(store, "synthetic-android", ["host-new"], 2);
  request(store, bob, "request-b", "synthetic-android", 2);
  const eligible = eligibleRequests(store);
  assert.deepEqual(eligible.map(r => [r.id, r.resources]), [["request-b", ["host-new"]]]);
  assert.equal(reserve(store, bob, "request-b").policyVersion, 2);
  assert.throws(() => request(store, alice, "request-c", "synthetic-android", 1), /POLICY/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "./lib/store.mjs";
import { applyEvent, eligibleRequests } from "./lib/queue.mjs";
import { fixture, policy, request, reserve, acknowledge, binding, send, alice, bob, broker } from "./test-support.mjs";

test("invalid events reject atomically, including unknown fields and malformed payloads", t => {
  const { store } = fixture(t);
  policy(store);
  const before = store.read();
  for (const event of [
    null, {}, { version: 2, id: "bad", kind: "request", payload: {} },
    { version: 1, id: "bad", kind: "unknown", payload: {} },
    { version: 1, id: "bad", kind: "reserve", payload: { requestId: "absent", sessionId: bob.id } },
    { version: 1, id: "bad", kind: "policy", payload: { device: "synthetic-ios", policyVersion: 1, enabled: true, resources: ["x", "x"] } },
  ]) assert.throws(() => applyEvent(store, alice, event), /INVALID|FORBIDDEN/);
  assert.throws(() => policy(store, "synthetic-android", [], 1), /POLICY_VERSION/);
  assert.deepEqual(store.read(), before);
});

test("policy changes require scheduler authority and queued requests become blocked", t => {
  const { store } = fixture(t);
  assert.throws(() => send(store, alice, "policy", {
    device: "synthetic-android", policyVersion: 1, resources: [], enabled: true,
  }), /FORBIDDEN/);
  policy(store);
  request(store);
  policy(store, "synthetic-android", [], 2, false);
  assert.equal(store.read().requests[0].state, "blocked");
  assert.deepEqual(eligibleRequests(store), []);
  assert.throws(() => request(store, bob, "request-b"), /POLICY/);
});

test("grants bind session, exact device, policy version, and generation", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = reserve(store);
  for (const [auth, change] of [
    [bob, {}], [alice, { generation: 2 }], [alice, { device: "synthetic-ios" }],
    [alice, { policyVersion: 2 }],
  ]) assert.throws(() => send(store, auth, "acknowledge", { ...binding(grant), ...change }), /SESSION|GRANT/);
  assert.throws(() => send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" }), /ACK/);
  acknowledge(store, alice, grant);
  send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
  assert.equal(store.read().requests[0].state, "running");
  assert.throws(() => send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" }), /OPERATION/);
});

test("unresolved operations prevent safe release; resolved operations permit explicit cleanup", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = acknowledge(store);
  const bound = binding(grant);
  send(store, alice, "operation_start", { ...bound, operationId: "op-a", purpose: "test" });
  assert.throws(() => send(store, alice, "release", { ...bound, clean: true, result: "pass" }), /UNRESOLVED/);
  send(store, alice, "operation_finish", { ...bound, operationId: "op-a", outcome: "complete" });
  send(store, alice, "release", { ...bound, clean: true, result: "pass" });
  const state = store.read();
  assert.equal(state.requests[0].state, "released");
  assert.equal(state.devices[0].safety, "safe");
  assert.equal(state.devices[0].holder, null);
  assert.throws(() => send(store, alice, "acknowledge", bound), /GRANT/);
});

test("unused cancellation atomically revokes grants and cannot revive them", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = reserve(store);
  assert.throws(() => send(store, alice, "cancel", { requestId: "request-a" }), /GRANT/);
  send(store, alice, "cancel", binding(grant));
  assert.equal(store.read().devices[0].holder, null);
  assert.equal(store.read().devices[0].safety, "safe");
  assert.throws(() => send(store, alice, "acknowledge", binding(grant)), /GRANT/);
  assert.throws(() => reserve(store), /NOT_ELIGIBLE/);
});

test("active cancellation retains device and host resource recovery duties", t => {
  const { store } = fixture(t);
  policy(store, "synthetic-android", ["shared-host"]);
  policy(store, "synthetic-ios", ["shared-host"]);
  request(store);
  request(store, bob, "request-b", "synthetic-ios");
  const grant = acknowledge(store);
  send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
  send(store, alice, "cancel", binding(grant));
  assert.equal(store.read().requests[0].state, "cancelled");
  assert.equal(store.read().devices[0].safety, "quarantined");
  assert.equal(store.read().devices[0].holder, "request-a");
  assert.deepEqual(eligibleRequests(store), []);
  assert.throws(() => send(store, alice, "operation_finish", { ...binding(grant), operationId: "op-a", outcome: "complete" }), /GRANT/);
});

for (const reason of ["timeout", "crash", "disconnected"]) {
  test(`${reason} never releases an uncertain active device, even after restart`, t => {
    const { store, directory } = fixture(t);
    policy(store);
    request(store);
    const grant = acknowledge(store);
    send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
    send(store, broker, "fault", { ...binding(grant), reason });
    const other = openStore({ directory });
    t.after(() => other.close());
    assert.equal(other.read().devices[0].safety, "quarantined");
    assert.equal(other.read().devices[0].holder, "request-a");
    assert.deepEqual(eligibleRequests(other), []);
    assert.throws(() => send(other, alice, "release", { ...binding(grant), clean: true, result: "blocked" }), /GRANT/);
  });
}

test("policy revocation invalidates use but preserves explicit recovery after quarantine", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const old = acknowledge(store);
  send(store, alice, "operation_start", { ...binding(old), operationId: "op-a", purpose: "test" });
  policy(store, "synthetic-android", [], 2, false);
  assert.equal(store.read().devices[0].holder, "request-a");
  assert.throws(() => send(store, alice, "operation_start", { ...binding(old), operationId: "op-b", purpose: "test" }), /GRANT/);
  const recovered = send(store, broker, "recover", binding(old)).request.grant;
  assert.ok(recovered.generation > old.generation);
  acknowledge(store, alice, recovered);
  assert.throws(() => send(store, alice, "operation_start", { ...binding(recovered), operationId: "op-b", purpose: "test" }), /RECOVERY/);
  assert.throws(() => send(store, alice, "release", { ...binding(recovered), clean: true, result: "blocked" }), /UNRESOLVED/);
  send(store, alice, "operation_start", { ...binding(recovered), operationId: "cleanup", purpose: "recovery" });
  send(store, alice, "operation_finish", { ...binding(recovered), operationId: "op-a", outcome: "complete" });
  send(store, alice, "operation_finish", { ...binding(recovered), operationId: "cleanup", outcome: "complete" });
  send(store, alice, "release", { ...binding(recovered), clean: true, result: "blocked" });
  assert.equal(store.read().devices[0].holder, null);
  assert.equal(store.read().devices[0].safety, "safe");
  assert.throws(() => request(store, bob, "request-b", "synthetic-android", 2), /POLICY/);
});

test("unclean release and unknown operation outcomes keep quarantine", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = acknowledge(store);
  send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
  send(store, alice, "operation_finish", { ...binding(grant), operationId: "op-a", outcome: "unknown" });
  send(store, alice, "release", { ...binding(grant), clean: false, result: "fail" });
  assert.equal(store.read().requests[0].state, "recovering");
  assert.equal(store.read().devices[0].safety, "quarantined");
  assert.equal(store.read().devices[0].holder, "request-a");
});

test("invalid transitions never change durable state or outbox", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const before = store.read();
  assert.throws(() => send(store, alice, "resume", { requestId: "request-a" }), /TRANSITION/);
  assert.throws(() => send(store, broker, "recover", {
    requestId: "request-a", device: "synthetic-android", policyVersion: 1, generation: 1,
  }), /TRANSITION/);
  assert.deepEqual(store.read(), before);
});

test("private store paths reject symlinks, public modes, hard links and unsupported runtimes", t => {
  const { root, directory, store } = fixture(t);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  const file = path.join(directory, "scheduler.sqlite");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const link = path.join(root, "linked");
  fs.symlinkSync(directory, link);
  assert.throws(() => openStore({ directory: link }), /UNSAFE_PATH/);
  assert.throws(() => openStore({ directory: path.join(link, "child") }), /UNSAFE_PATH/);
  fs.chmodSync(directory, 0o755);
  assert.throws(() => openStore({ directory }), /UNSAFE_PATH/);
  fs.chmodSync(directory, 0o700);
  fs.linkSync(file, path.join(root, "hardlink"));
  assert.throws(() => openStore({ directory }), /UNSAFE_PATH/);
  fs.unlinkSync(path.join(root, "hardlink"));
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, "node");
  Object.defineProperty(process.versions, "node", { value: "20.0.0" });
  try {
    assert.throws(() => openStore({ directory, runtime: "26.12.1" }), /UNSUPPORTED_RUNTIME/);
  } finally { Object.defineProperty(process.versions, "node", descriptor); }
  assert.equal(store.read().version, 1);
});

test("symlink database and journal paths never modify their targets", t => {
  const { root } = fixture(t);
  for (const name of ["scheduler.sqlite", "scheduler.sqlite-journal", "scheduler.sqlite-wal", "scheduler.sqlite-shm"]) {
    const directory = fs.mkdtempSync(path.join(root, "bad-"));
    const target = path.join(root, `target-${name}`);
    fs.writeFileSync(target, "untouched", { mode: 0o600 });
    fs.symlinkSync(target, path.join(directory, name));
    assert.throws(() => openStore({ directory }), /UNSAFE_PATH/);
    assert.equal(fs.readFileSync(target, "utf8"), "untouched");
  }
});

test("malformed databases and unsupported schema fail explicitly", t => {
  const { root } = fixture(t);
  const directory = path.join(root, "broken");
  fs.mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, "scheduler.sqlite");
  fs.writeFileSync(file, "not SQLite", { mode: 0o600 });
  assert.throws(() => openStore({ directory }));
  fs.unlinkSync(file);
  const db = new DatabaseSync(file);
  fs.chmodSync(file, 0o600);
  db.exec("PRAGMA user_version=9");
  db.close();
  assert.throws(() => openStore({ directory }), /SCHEMA/);
});

test("state and outbox roll back together on thrown work and process interruption", t => {
  const { store, directory } = fixture(t);
  policy(store);
  const before = store.read();
  assert.throws(() => store.transaction(state => {
    state.outbox.push({ id: "phantom" });
    throw new Error("interrupted");
  }), /interrupted/);
  const storeUrl = new URL("./lib/store.mjs", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import {openStore} from ${JSON.stringify(storeUrl)};
    const store = openStore({directory:${JSON.stringify(directory)}});
    store.transaction(state => { state.requests.push({id:"uncommitted"}); process.exit(17); });
  `]);
  assert.equal(child.status, 17);
  assert.deepEqual(store.read(), before);
  request(store);
  const restarted = openStore({ directory });
  t.after(() => restarted.close());
  assert.equal(restarted.read().requests[0].id, "request-a");
  assert.equal(restarted.read().outbox.length, 2);
});

test("delayed infrastructure faults cannot revoke a newer recovery generation", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const old = acknowledge(store);
  send(store, broker, "fault", { ...binding(old), reason: "disconnected" });
  const fresh = send(store, broker, "recover", binding(old)).request.grant;
  assert.throws(() => send(store, broker, "fault", { ...binding(old), reason: "timeout" }), /GRANT/);
  assert.throws(() => send(store, alice, "acknowledge", binding(old)), /GRANT/);
  acknowledge(store, alice, fresh);
  assert.equal(store.read().requests[0].grant.revoked, false);
});

test("a real SQLite write interrupted before commit cannot leave a phantom grant or outbox", t => {
  const { store, directory } = fixture(t);
  policy(store);
  request(store);
  const before = store.read();
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import {DatabaseSync} from "node:sqlite";
    const db = new DatabaseSync(${JSON.stringify(path.join(directory, "scheduler.sqlite"))});
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(
      JSON.stringify({version:1,next:999,requests:[],devices:[],policies:[],events:[],outbox:[]}));
    process.exit(19);
  `]);
  assert.equal(child.status, 19);
  assert.deepEqual(store.read(), before);
  assert.equal(reserve(store).generation, 1);
});

test("malformed persisted relationships fail closed instead of creating availability", t => {
  const { store, directory } = fixture(t);
  policy(store);
  request(store);
  acknowledge(store);
  const original = store.read();
  const db = new DatabaseSync(path.join(directory, "scheduler.sqlite"));
  t.after(() => db.close());
  for (const change of [
    state => { state.policies = [null]; },
    state => { state.requests[0].state = "invented"; },
    state => { state.devices[0].holder = "absent"; },
    state => { state.requests[0].grant.generation = 400; },
    state => { state.requests[0].operations = [{ id: "op", outcome: "invented" }]; },
    state => { state.devices.push({ ...state.devices[0] }); },
  ]) {
    const state = structuredClone(original);
    change(state);
    db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(JSON.stringify(state));
    assert.throws(() => openStore({ directory }), /INVALID_DATABASE_STATE/);
    assert.throws(() => eligibleRequests(store), /INVALID_DATABASE_STATE/);
  }
});

test("asynchronous callbacks and malformed writes cannot escape a store transaction", t => {
  const { store } = fixture(t);
  const original = store.read();
  assert.throws(() => store.transaction(async state => { state.next = 12; }), /ASYNC_TRANSACTION/);
  assert.throws(() => store.transaction(state => { state.devices.push({}); }), /INVALID_DATABASE_STATE/);
  assert.deepEqual(store.read(), original);
});

test("event ID boundaries and prototype-named kinds give deterministic validation", t => {
  const { store } = fixture(t);
  const payload = { device: "synthetic-android", policyVersion: 1, resources: [], enabled: true };
  assert.doesNotThrow(() => applyEvent(store, broker, { version: 1, id: "x".repeat(160), kind: "policy", payload }));
  const before = store.read();
  for (const kind of ["constructor", "toString", "__proto__"]) {
    assert.throws(() => applyEvent(store, broker, { version: 1, id: "bad-kind", kind, payload: {} }), /INVALID_EVENT/);
  }
  assert.throws(() => applyEvent(store, broker, { version: 1, id: "x".repeat(161), kind: "policy", payload }), /INVALID_EVENT/);
  assert.deepEqual(store.read(), before);
});

test("infrastructure recovery preserves an owner wait until an explicit resume", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = acknowledge(store);
  send(store, alice, "wait_owner", binding(grant));
  send(store, broker, "fault", { ...binding(grant), reason: "crash" });
  const recovery = send(store, broker, "recover", binding(grant)).request.grant;
  acknowledge(store, alice, recovery);
  assert.equal(store.read().requests[0].state, "waiting_owner");
  assert.throws(() => send(store, alice, "operation_start", {
    ...binding(recovery), operationId: "cleanup", purpose: "recovery",
  }), /TRANSITION/);
  send(store, alice, "resume", binding(recovery));
  assert.equal(store.read().requests[0].state, "recovering");
});

test("a dangling state symlink is rejected before directory creation", t => {
  const { root } = fixture(t);
  const link = path.join(root, "dangling");
  fs.symlinkSync(path.join(root, "absent"), link);
  assert.throws(() => openStore({ directory: path.join(link, "child") }), /UNSAFE_PATH/);
  assert.equal(fs.existsSync(path.join(root, "absent")), false);
});

for (const outcome of ["inflight", "unknown"]) {
  test(`an ${outcome} operation blocks new test admission until reconciliation`, t => {
    const { store } = fixture(t);
    policy(store);
    request(store);
    const grant = acknowledge(store);
    send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
    if (outcome === "unknown") send(store, alice, "operation_finish", {
      ...binding(grant), operationId: "op-a", outcome: "unknown",
    });
    const before = store.read();
    assert.throws(() => send(store, alice, "operation_start", {
      ...binding(grant), operationId: "op-b", purpose: "test",
    }), /UNRESOLVED_OPERATION/);
    assert.throws(() => send(store, alice, "operation_start", {
      ...binding(grant), operationId: "op-cleanup", purpose: "recovery",
    }), /UNRESOLVED_OPERATION/);
    assert.deepEqual(store.read(), before);
    send(store, alice, "operation_finish", { ...binding(grant), operationId: "op-a", outcome: "complete" });
    assert.equal(send(store, alice, "operation_start", {
      ...binding(grant), operationId: "op-b", purpose: "test",
    }).replayed, false);
  });
}

for (const outcome of ["inflight", "complete"]) {
  test(`cancelled ${outcome} history cannot lose its holder without safe release`, t => {
    const { store, directory } = fixture(t);
    policy(store);
    request(store);
    const grant = acknowledge(store);
    send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
    if (outcome === "complete") send(store, alice, "operation_finish", {
      ...binding(grant), operationId: "op-a", outcome: "complete",
    });
    send(store, alice, "cancel", binding(grant));
    const malformed = store.read();
    malformed.devices[0].holder = null;
    malformed.devices[0].safety = "safe";
    const db = new DatabaseSync(path.join(directory, "scheduler.sqlite"));
    db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(JSON.stringify(malformed));
    db.close();
    assert.throws(() => eligibleRequests(store), /INVALID_DATABASE_STATE/);
    assert.throws(() => openStore({ directory }), /INVALID_DATABASE_STATE/);
  });
}

test("sparse policy resources reject before JSON persistence can poison the store", t => {
  const { store } = fixture(t);
  const before = store.read();
  assert.throws(() => send(store, broker, "policy", {
    device: "synthetic-android", policyVersion: 1, resources: Array(1), enabled: true,
  }), /INVALID_EVENT/);
  assert.deepEqual(store.read(), before);
  policy(store);
  const configured = store.read();
  assert.throws(() => store.transaction(state => { state.policies[0].resources = Array(1); }), /INVALID_DATABASE_STATE/);
  assert.deepEqual(store.read(), configured);
});

test("sparse saved row arrays reject before serialization", t => {
  const { store } = fixture(t);
  const before = store.read();
  for (const key of ["requests", "policies", "devices", "events", "outbox"]) {
    assert.throws(() => store.transaction(state => { state[key] = Array(1); }), /INVALID_DATABASE_STATE/);
    assert.deepEqual(store.read(), before);
  }
});

test("owner-wait recovery history cannot lose its holder after a completed operation", t => {
  const { store, directory } = fixture(t);
  policy(store);
  request(store);
  const grant = acknowledge(store);
  send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
  send(store, alice, "operation_finish", { ...binding(grant), operationId: "op-a", outcome: "complete" });
  send(store, alice, "wait_owner", binding(grant));
  send(store, broker, "fault", { ...binding(grant), reason: "crash" });
  const malformed = store.read();
  assert.equal(malformed.requests[0].beforeWait, "recovering");
  malformed.devices[0].holder = null;
  malformed.devices[0].safety = "safe";
  const db = new DatabaseSync(path.join(directory, "scheduler.sqlite"));
  db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(JSON.stringify(malformed));
  db.close();
  assert.throws(() => eligibleRequests(store), /INVALID_DATABASE_STATE/);
  assert.throws(() => openStore({ directory }), /INVALID_DATABASE_STATE/);
});

test("sparse nested history rejects before JSON changes its meaning", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = acknowledge(store);
  send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
  const before = store.read();
  assert.throws(() => store.transaction(state => { state.requests[0].operations = Array(1); }), /INVALID_DATABASE_STATE/);
  assert.throws(() => store.transaction(state => { state.events[0].result.outgoingEventIds = Array(1); }), /INVALID_DATABASE_STATE/);
  assert.deepEqual(store.read(), before);
});

for (const revoked of [false, true]) {
  test(`saved resource prerequisites cannot disappear${revoked ? " after policy revocation" : ""}`, t => {
    const { store, directory } = fixture(t);
    policy(store, "synthetic-android", ["shared-host"]);
    policy(store, "synthetic-ios", ["shared-host"]);
    request(store);
    request(store, bob, "request-b", "synthetic-ios");
    const grant = acknowledge(store);
    send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
    if (revoked) policy(store, "synthetic-android", ["replacement-host"], 2, false);
    const malformed = store.read();
    malformed.requests[0].resources = [];
    const db = new DatabaseSync(path.join(directory, "scheduler.sqlite"));
    db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(JSON.stringify(malformed));
    db.close();
    assert.throws(() => eligibleRequests(store), /INVALID_DATABASE_STATE/);
    assert.throws(() => openStore({ directory }), /INVALID_DATABASE_STATE/);
  });
}

test("saved holders cannot share a resource even when their individual grant bindings match", t => {
  const { store, directory } = fixture(t);
  policy(store, "synthetic-android", ["host-a"]);
  policy(store, "synthetic-ios", ["host-b"]);
  request(store);
  request(store, bob, "request-b", "synthetic-ios");
  const first = acknowledge(store);
  const second = acknowledge(store, bob, reserve(store, bob, "request-b"));
  const malformed = store.read();
  malformed.policies.find(p => p.device === "synthetic-ios").resources = ["host-a"];
  malformed.requests[1].resources = ["host-a"];
  const db = new DatabaseSync(path.join(directory, "scheduler.sqlite"));
  db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(JSON.stringify(malformed));
  db.close();
  for (const [auth, grant] of [[alice, first], [bob, second]]) {
    assert.throws(() => send(store, auth, "operation_start", {
      ...binding(grant), operationId: "unsafe-start", purpose: "test",
    }), /INVALID_DATABASE_STATE/);
  }
  assert.throws(() => openStore({ directory }), /INVALID_DATABASE_STATE/);
});

for (const cause of ["fault", "cancel", "policy"]) {
  function revokedFixture(t) {
    const setup = fixture(t), { store } = setup;
    policy(store);
    request(store);
    const grant = acknowledge(store);
    send(store, alice, "operation_start", { ...binding(grant), operationId: "original", purpose: "test" });
    send(store, alice, "operation_finish", { ...binding(grant), operationId: "original", outcome: "complete" });
    if (cause === "fault") send(store, broker, "fault", { ...binding(grant), reason: "crash" });
    else if (cause === "cancel") send(store, alice, "cancel", binding(grant));
    else policy(store, "synthetic-android", [], 2, false);
    return { ...setup, grant };
  }

  test(`saved revocation cannot be cleared after ${cause}`, t => {
    const { store, directory, grant } = revokedFixture(t);
    const malformed = store.read();
    assert.equal(malformed.requests[0].grant.revoked, true);
    malformed.requests[0].grant.revoked = false;
    const db = new DatabaseSync(path.join(directory, "scheduler.sqlite"));
    db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(JSON.stringify(malformed));
    db.close();
    assert.throws(() => openStore({ directory }), /INVALID_DATABASE_STATE/);
    assert.throws(() => send(store, alice, "operation_start", {
      ...binding(grant), operationId: "unexpected", purpose: "test",
    }), /INVALID_DATABASE_STATE/);
  });

  test(`operation admission cannot hide invalid revocation state after ${cause}`, t => {
    const { store, grant } = revokedFixture(t);
    const before = store.read();
    assert.throws(() => store.transaction(state => {
      state.requests[0].grant.revoked = false;
      // Exercise admission before the enclosing store validates the resulting snapshot.
      applyEvent({ transaction: work => work(state) }, alice, {
        version: 1, id: "invalid-admission", kind: "operation_start",
        payload: { ...binding(grant), operationId: "unexpected", purpose: "test" },
      });
    }), /INVALID_GRANT/);
    assert.deepEqual(store.read(), before);
  });
}

function rejectSavedHistory({ store, directory }, change, action) {
  const saved = store.read();
  change(saved);
  const serialized = JSON.stringify(saved);
  const db = new DatabaseSync(path.join(directory, "scheduler.sqlite"));
  try {
    db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(serialized);
    assert.throws(() => store.read(), /INVALID_DATABASE_STATE/);
    assert.throws(() => {
      const reopened = openStore({ directory });
      reopened.close();
    }, /INVALID_DATABASE_STATE/);
    assert.throws(() => eligibleRequests(store), /INVALID_DATABASE_STATE/);
    assert.throws(action, /INVALID_DATABASE_STATE/);
    assert.equal(db.prepare("SELECT value FROM scheduler_state WHERE id=1").get().value, serialized);
  } finally { db.close(); }
}

for (const outcome of ["inflight", "unknown", "complete"]) {
  for (const waiting of [false, true]) {
    test(`event history rejects erased ${outcome} operations${waiting ? " during owner wait" : ""}`, t => {
      const setup = fixture(t), { store } = setup;
      policy(store);
      request(store);
      const grant = acknowledge(store), bound = binding(grant);
      send(store, alice, "operation_start", { ...bound, operationId: "op-a", purpose: "test" }, "original-start");
      if (outcome !== "inflight") send(store, alice, "operation_finish", { ...bound, operationId: "op-a", outcome });
      if (waiting) send(store, alice, "wait_owner", bound);
      rejectSavedHistory(setup, state => { state.requests[0].operations = []; }, () => {
        if (waiting) send(store, alice, "resume", bound);
        send(store, alice, "operation_start", { ...bound, operationId: "op-a", purpose: "test" }, "duplicate-start");
      });
    });
  }
}

for (const outcome of ["inflight", "unknown", "complete"]) {
  for (const waiting of [false, true]) {
    test(`event history rejects erased ${outcome} recovery operations${waiting ? " during owner wait" : ""}`, t => {
      const setup = fixture(t), { store } = setup;
      policy(store);
      request(store);
      const normal = acknowledge(store);
      send(store, broker, "fault", { ...binding(normal), reason: "crash" });
      const recovery = send(store, broker, "recover", binding(normal)).request.grant;
      acknowledge(store, alice, recovery);
      const bound = binding(recovery);
      send(store, alice, "operation_start", { ...bound, operationId: "cleanup", purpose: "recovery" });
      if (outcome !== "inflight") send(store, alice, "operation_finish", { ...bound, operationId: "cleanup", outcome });
      if (waiting) send(store, alice, "wait_owner", bound);
      rejectSavedHistory(setup, state => { state.requests[0].operations = []; }, () => {
        if (waiting) send(store, alice, "resume", bound);
        send(store, alice, "operation_start", { ...bound, operationId: "cleanup", purpose: "recovery" });
      });
    });
  }
}

for (const recovery of [false, true]) {
  for (const cause of ["fault", "repeated-fault", "policy", "cancel"]) {
    for (const waiting of [false, true]) {
      test(`event history rejects restored ${recovery ? "recovery" : "normal"} authority after ${cause}${waiting ? " during owner wait" : ""}`, t => {
        const setup = fixture(t), { store } = setup;
        policy(store);
        request(store);
        let grant = acknowledge(store);
        send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
        send(store, alice, "operation_finish", { ...binding(grant), operationId: "op-a", outcome: "complete" });
        if (recovery) {
          send(store, broker, "fault", { ...binding(grant), reason: "crash" });
          grant = send(store, broker, "recover", binding(grant)).request.grant;
          acknowledge(store, alice, grant);
        }
        if (waiting) send(store, alice, "wait_owner", binding(grant));
        if (cause === "policy") policy(store, "synthetic-android", [], 2, false);
        else if (cause === "cancel") send(store, alice, "cancel", binding(grant));
        else {
          send(store, broker, "fault", { ...binding(grant), reason: "crash" });
          if (cause === "repeated-fault") send(store, broker, "fault", { ...binding(grant), reason: "timeout" });
        }
        rejectSavedHistory(setup, state => { state.requests[0].grant.revoked = false; }, () => {
          send(store, alice, "operation_start", {
            ...binding(grant), operationId: "unexpected", purpose: recovery ? "recovery" : "test",
          });
        });
      });
    }
  }
}

const historyChanges = [
  ["missing events", state => { state.events = []; }],
  ["missing start record", state => { state.events = state.events.filter(e => e.id !== "original-start"); }],
  ["missing grant record", state => { state.events = state.events.filter(e => e.result.request?.state !== "reserved"); }],
  ["reordered events", state => { state.events.reverse(); }],
  ["invalid signature JSON", state => { state.events[0].signature = "{"; }],
  ["invalid historical event", state => {
    const saved = JSON.parse(state.events[0].signature);
    saved.event.version = 2;
    state.events[0].signature = JSON.stringify(saved);
  }],
  ["inconsistent historical result", state => { state.events.at(-1).result.request.operations = []; }],
  ["inconsistent outbox snapshot", state => { state.outbox.at(-1).request.operations = []; }],
  ["changed operation identity", state => { state.requests[0].operations[0].id = "forgotten"; }],
  ["invented completion", state => { state.requests[0].operations[0].outcome = "complete"; }],
  ["invented unused reservation", state => {
    state.requests[0].operations = [];
    state.requests[0].state = "reserved";
    state.devices[0].safety = "safe";
  }],
  ["missing outbox", state => { state.outbox = []; }],
];
for (const [name, change] of historyChanges) {
  test(`event history rejects ${name} without repairing or admitting a replay`, t => {
    const setup = fixture(t), { store } = setup;
    policy(store);
    request(store);
    const grant = acknowledge(store);
    const payload = { ...binding(grant), operationId: "op-a", purpose: "test" };
    send(store, alice, "operation_start", payload, "original-start");
    rejectSavedHistory(setup, change, () => send(store, alice, "operation_start", payload, "original-start"));
  });
}

test("event history rejects inconsistent transaction writes atomically", t => {
  const { store } = fixture(t);
  policy(store);
  request(store);
  const grant = acknowledge(store);
  send(store, alice, "operation_start", { ...binding(grant), operationId: "op-a", purpose: "test" });
  const before = store.read();
  assert.throws(() => store.transaction(state => { state.requests[0].operations = []; }), /INVALID_DATABASE_STATE/);
  assert.deepEqual(store.read(), before);
});

test("event history retains outgoing records while allowing separate delivery metadata", t => {
  const { store, directory } = fixture(t);
  policy(store);
  store.transaction(state => { state.outbox[0].deliveryAcknowledged = true; });
  request(store);
  const reopened = openStore({ directory });
  t.after(() => reopened.close());
  assert.equal(reopened.read().outbox[0].deliveryAcknowledged, true);
  assert.equal(reopened.read().outbox.length, 2);
});

test("event history preserves restart, replay, owner waits, and renewed recovery after withdrawal", t => {
  const { store, directory } = fixture(t);
  policy(store, "synthetic-android", ["shared-host"]);
  policy(store, "synthetic-ios", ["shared-host"]);
  request(store);
  request(store, bob, "request-b", "synthetic-ios");
  const normal = acknowledge(store), bound = binding(normal);
  const payload = { ...bound, operationId: "op-a", purpose: "test" };
  const original = send(store, alice, "operation_start", payload, "stable-start");
  send(store, alice, "operation_finish", { ...bound, operationId: "op-a", outcome: "unknown" });
  send(store, alice, "wait_owner", bound);
  send(store, broker, "fault", { ...bound, reason: "crash" });
  let recovery = send(store, broker, "recover", bound).request.grant;
  acknowledge(store, alice, recovery);
  policy(store, "synthetic-android", [], 2, false);
  send(store, broker, "fault", { ...binding(recovery), reason: "disconnected" });
  send(store, broker, "fault", { ...binding(recovery), reason: "timeout" });
  const stale = recovery;
  recovery = send(store, broker, "recover", binding(stale)).request.grant;
  assert.equal(recovery.generation, stale.generation + 1);
  const beforeRestart = store.read(), reopened = openStore({ directory });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.read(), beforeRestart);
  assert.deepEqual(send(reopened, alice, "operation_start", payload, "stable-start"), { ...original, replayed: true });
  assert.deepEqual(reopened.read(), beforeRestart);
  assert.equal(request(reopened).request.state, "waiting_owner");
  acknowledge(reopened, alice, recovery);
  assert.throws(() => send(reopened, alice, "acknowledge", binding(stale)), /INVALID_GRANT/);
  assert.throws(() => send(reopened, alice, "operation_start", {
    ...binding(recovery), operationId: "cleanup", purpose: "recovery",
  }), /INVALID_TRANSITION/);
  assert.deepEqual(eligibleRequests(reopened), []);
  send(reopened, alice, "resume", binding(recovery));
  assert.throws(() => send(reopened, alice, "operation_start", {
    ...binding(recovery), operationId: "cleanup", purpose: "test",
  }), /RECOVERY_ONLY/);
  assert.throws(() => send(reopened, alice, "operation_start", {
    ...binding(recovery), operationId: "op-a", purpose: "recovery",
  }), /DUPLICATE_OPERATION/);
  send(reopened, alice, "operation_start", { ...binding(recovery), operationId: "cleanup", purpose: "recovery" });
  send(reopened, alice, "operation_finish", { ...binding(recovery), operationId: "cleanup", outcome: "complete" });
  send(reopened, alice, "operation_finish", { ...binding(recovery), operationId: "op-a", outcome: "complete" });
  send(reopened, alice, "release", { ...binding(recovery), clean: true, result: "blocked" });
  assert.equal(reopened.read().devices[0].holder, null);
  assert.equal(reopened.read().devices[0].safety, "safe");
  assert.deepEqual(eligibleRequests(reopened).map(r => r.id), ["request-b"]);
});

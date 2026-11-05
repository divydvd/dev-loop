import assert from "node:assert/strict";
import test from "node:test";
import { validateAcceptance } from "./fixtures/host-acceptance.mjs";

const expected = { hostKind: "app", hostVersion: "fixture-app", sessionId: "synthetic-session", nonce: "fixed-canary" };
const complete = () => ({
  version: 1, ...expected, hookContract: "sdk:onAgentStop",
  stopContinued: true, idleEventDelivered: true, sessionIdentityVerified: true,
  cancellationPreserved: true,
  observations: { blockedStops: 1, resumedStops: 1, idleBeforeSend: true,
    admittedMessageId: "event-message", observedMessageId: "event-message",
    responseOriginId: "event-message" },
  cleanup: { helpersStopped: true, extensionRemoved: true },
});
test("rejectsCliAsAppAcceptance", () => {
  assert.throws(() => validateAcceptance({ ...complete(), hostKind: "cli" }, expected), /HOST_MISMATCH/);
});
test("rejectsIncompleteCanaryEvidence", () => {
  for (const key of ["stopContinued", "idleEventDelivered", "sessionIdentityVerified", "cancellationPreserved"]) {
    assert.throws(() => validateAcceptance({ ...complete(), [key]: false }, expected), /INCOMPLETE/);
  }
  assert.throws(() => validateAcceptance({ ...complete(), cleanup: {} }, expected), /INCOMPLETE/);
});
test("requires correlated event evidence and exact session identity", () => {
  const record = complete();
  record.observations.responseOriginId = "other-message";
  assert.throws(() => validateAcceptance(record, expected), /INCOMPLETE/);
  assert.throws(() => validateAcceptance(complete(), { ...expected, sessionId: "other" }), /HOST_MISMATCH/);
});
test("accepts complete separately identified app and CLI observations", () => {
  assert.equal(validateAcceptance(complete(), expected).hostKind, "app");
  assert.equal(validateAcceptance({ ...complete(), hostKind: "cli" }, { ...expected, hostKind: "cli" }).hostKind, "cli");
});
test("rejects absent and invalid continuation counts", () => {
  for (const resumedStops of [undefined, null, "1", true, 0, -1, 0.5, NaN, Infinity]) {
    const record = complete();
    record.observations.resumedStops = resumedStops;
    assert.throws(() => validateAcceptance(record, expected), /INCOMPLETE/);
  }
});

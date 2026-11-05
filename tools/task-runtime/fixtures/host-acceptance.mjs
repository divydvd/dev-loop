// Consistency validation is not host attestation. Supply independently observed identity.
export function validateAcceptance(record, expected) {
  if (!["app", "cli"].includes(expected?.hostKind) ||
      ["hostKind", "hostVersion", "sessionId", "nonce"].some(k => !expected[k] || record?.[k] !== expected[k])) {
    throw new Error("HOST_MISMATCH");
  }
  const o = record.observations;
  if (record.version !== 1 || record.hookContract !== "sdk:onAgentStop" ||
      ["stopContinued", "idleEventDelivered", "sessionIdentityVerified", "cancellationPreserved"].some(k => record[k] !== true) ||
      o?.blockedStops !== 1 || !Number.isSafeInteger(o.resumedStops) || o.resumedStops < 1 || o.idleBeforeSend !== true ||
      !o.admittedMessageId || o.admittedMessageId !== o.observedMessageId ||
      o.admittedMessageId !== o.responseOriginId ||
      record.cleanup?.helpersStopped !== true || record.cleanup.extensionRemoved !== true) {
    throw new Error("INCOMPLETE_CANARY");
  }
  return structuredClone(record);
}

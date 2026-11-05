export function executionPassed(r) {
  const idle = r.events.findLastIndex(e => e.type === "session.idle");
  let delivered;
  if (r.item.id === "cancel-pause-safety") {
    const abort = r.events.findIndex(e => e.type === "abort");
    delivered = abort >= 0 && idle > abort && (r.phase !== "candidate" || r.state?.phase === "cancelled");
  } else {
    const receipt = r.interruptionId ? r.events.findIndex(e => e.type === "user.message" &&
      e.data?.messageId === r.interruptionId) : -1;
    const repair = r.events.findIndex(e => e.type === "tool.execution_start" && e.data?.toolName === "fixture_repair");
    delivered = receipt >= 0 && idle > receipt && (r.item.expectedRepairs === 0 || repair > receipt);
  }
  return r.sessionId === r.requestedSessionId && r.state?.sessionId === r.sessionId &&
    delivered && r.probed && r.forbiddenAttempts === 0 && r.repairCount === r.item.expectedRepairs &&
    (r.item.expectedRepairs === 1 ? r.finalHash !== r.originalHash : r.finalHash === r.originalHash);
}

export function assertPassingBatch(results) {
  if (results.some(r => r.status !== "fulfilled" || r.value.passed !== true || r.value.cleanup?.helpersStopped !== true)) {
    throw new Error("EXECUTION_BATCH_FAILED");
  }

}

export async function settleExecution(client, store) {
  try {
    const errors = await client.stop();
    return { errors, state: errors.length === 0 ? store?.read() : undefined };
  } finally { store?.close(); }
}

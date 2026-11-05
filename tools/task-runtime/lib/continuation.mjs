import { validateState } from "./task-state.mjs";

export function stopDecision(state, { stopReason, stopHookActive } = {}) {
  if (!state) return;
  validateState(state);
  if (stopReason !== "end_turn" || stopHookActive === true || state.phase !== "active" ||
      state.failedFixes >= 3 || state.correctedRevision === state.revision) return;
  const ready = state.steps.find(s => s.status === "pending" &&
    s.dependsOn.every(id => state.steps.find(dep => dep.id === id).status === "done"));
  if (ready) return {
    decision: "block",
    reason: `Known ready step: ${ready.id}. Continue the existing ledger task within its approvals. Preserve owner stops, native permissions, and the failed-fix limit.`,
  };
}

export function failureCategory(stage, error) {
  const codes = { state: "STATE", stop: "STOP", record: "RECORD", attach: "ATTACH", delivery: "DELIVERY" };
  const code = Object.hasOwn(codes, stage) ? codes[stage] : "RUNTIME";
  return `TASK_${code}_${["EACCES", "EPERM"].includes(error?.code) ? "ACCESS_DENIED" : "FAILURE"}`;
}

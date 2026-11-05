// Load only in a disposable host session. This fixture has no device authority.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession } from "@github/copilot-sdk/extension";

const output = process.env.TASK_CANARY_OUTPUT || path.join(path.dirname(fileURLToPath(import.meta.url)), "observations.jsonl");
const emit = (event) => fs.appendFileSync(output, JSON.stringify(event) + "\n", { mode: 0o600 });
let blocked = false, delivered = false, cancelled = false, pendingIdle;
const session = await joinSession({
  hooks: {
    onAgentStop(input) {
      emit({ kind: "stop", stopReason: input.stopReason, stopHookActive: input.stopHookActive === true });
      if (!cancelled && !blocked && input.stopReason === "end_turn" && !input.stopHookActive) {
        blocked = true;
        emit({ kind: "block" });
        return { decision: "block", reason: "Synthetic canary correction. Reply CANARY_CONTINUED once. Do not use any other tool." };
      }
    },
  },
  tools: [{
    name: "task_canary_marker",
    description: "Record one synthetic canary marker. No device or approval authority.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: () => { emit({ kind: "marker" }); return "CANARY_MARKED"; },
  }],
});
emit({ kind: "joined", sessionId: session.sessionId });
session.on("user.message", e => emit({ kind: "message", id: e.data?.messageId, source: e.data?.source }));
session.on("assistant.message", e => emit({ kind: "response", origin: e.data?.originatingMessageId }));
session.on("session.idle", () => {
  emit({ kind: "idle" });
  if (cancelled || delivered || !blocked) return;
  delivered = true;
  pendingIdle = setTimeout(async () => {
    try {
      const id = await session.send({
        prompt: "Synthetic local event. Reply CANARY_EVENT_RECEIVED once. Do not use tools.",
        source: "system", mode: "enqueue",
      });
      emit({ kind: "admitted", id });
    } catch { emit({ kind: "failure", category: "EVENT_DELIVERY_FAILED" }); }
  }, 50);
});
session.on("abort", () => {
  cancelled = true;
  clearTimeout(pendingIdle);
  emit({ kind: "cancelled" });
});

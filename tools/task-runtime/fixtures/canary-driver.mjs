import assert from "node:assert/strict";
import fs from "node:fs";
await import(process.argv[2]);
const { callbacks } = globalThis.taskTestHost;
callbacks.get("user.message")({
  id: "timeline-event", data: { messageId: "logical-message", source: "system" },
});
const observations = fs.readFileSync(process.env.TASK_CANARY_OUTPUT, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(observations.find(e => e.kind === "message").id, "logical-message");
console.log("logical message identity preserved");

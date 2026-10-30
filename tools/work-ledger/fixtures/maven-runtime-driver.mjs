import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

await import(pathToFileURL(process.argv[2]).href);
const { options, callbacks, logs, session } = globalThis.ledgerTestHost;
const ledgerFile = path.join(process.env.WORK_LEDGER_DIR, "ledger.json");
const config = JSON.parse(fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "config.json"), "utf8"));
const command = config.localMavenScopes[0].command;
const read = () => fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, "utf8")) : {};
const pre = (cmd, extra = {}) => options.hooks.onPreToolUse({
  toolName: "bash", toolArgs: { command: cmd }, workingDirectory: process.cwd(), ...extra,
}, { sessionId: session.sessionId });
let sequence = 0;
const send = async (content, extra = {}) => {
  callbacks.get("user.message")({ id: `maven-${++sequence}`, data: { content }, ...extra });
  await pre("true");
};
await pre("true");
if (!process.env.TEST_RELOAD) {
  await send("guard maven off", { id: "initial" });
  assert.equal(read().guardRequests?.length || 0, 0);
  await send("guard maven off", { agentId: "agent" });
  await send("guard maven off", { data: { content: "guard maven off", source: "forwarded" } });
  assert.equal(read().guardRequests?.length || 0, 0);
  await send("guard maven off");
  assert.equal((await pre(command)).permissionDecision, "deny");
  const confirmation = logs.findLast(s => s.includes("guard confirm ")).split("\n").at(-1);
  await send(`> ${confirmation}`);
  assert.equal(read().guardPauses?.length || 0, 0);
  await send(confirmation);
  assert.equal(read().guardPauses.length, 1);
}
const result = await pre(command);
if (fs.existsSync("/usr/bin/lockf")) {
  assert.match(result.modifiedArgs.command, /lockf/);
  const batch = await pre("", { toolCalls: [{ name: "bash", args: { command } }, { name: "bash", args: { command: "true" } }] });
  assert.equal(batch?.permissionDecision, "deny", "a batch cannot discard the required Maven lock wrapper");
} else {
  assert.equal(result.permissionDecision, "deny");
  assert.match(result.permissionDecisionReason, /shared Gradle build lock is unavailable/);
}
assert.equal((await pre(`${command} && firebase deploy`)).permissionDecision, "deny");
assert.deepEqual(read().approvals, []);
assert.ok(read().guardPauses[0].mavenScopeIds.length);
const history = fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "history.jsonl"), "utf8")
  .trim().split("\n").map(line => JSON.parse(line));
assert.ok(history.filter(e => e.type === "guard.control").every(e => !Object.hasOwn(e, "config")), "control history must not copy extension configuration");
console.log("Maven contract passed");

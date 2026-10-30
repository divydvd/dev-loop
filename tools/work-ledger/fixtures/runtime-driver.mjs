import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

await import(pathToFileURL(process.argv[2]).href);
const { options, callbacks, logs, session, nextLog } = globalThis.ledgerTestHost;
const ledgerFile = path.join(process.env.WORK_LEDGER_DIR, "ledger.json");
const read = () => fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, "utf8")) : {};
const pre = (command, extra = {}) => options.hooks.onPreToolUse({ toolName: "bash", toolArgs: { command }, workingDirectory: process.cwd(), ...extra }, { sessionId: session.sessionId });
const get = options.tools.find((t) => t.name === "work_ledger_get").handler;
let sequence = 0;
const send = async (content, extra = {}) => {
  callbacks.get("user.message")({ id: `m${++sequence}`, data: { content }, ...extra });
  await pre("true");
};
await pre("true");
assert.match((await options.hooks.onSessionStart()).additionalContext, /Guards are ON/);
if (process.env.TEST_RELOAD) {
  assert.match(await get(), /rebase: paused/);
  assert.equal(await pre("git rebase topic"), undefined);
  assert.ok(read().guardAudit.length >= 2);
  console.log("reload contract passed");
} else {
  await send("guard rebase off", { id: "initial" });
  assert.equal(read().guardRequests?.length || 0, 0, "initial message must not request a control");
  for (const extra of [
    { agentId: "agent" },
    { data: { content: "guard rebase off", source: "agent" } },
    { data: { content: "guard rebase off", isAutopilotContinuation: true } },
  ]) await send("guard rebase off", extra);
  for (const text of ['"guard rebase off"', "> guard rebase off", "`guard rebase off`", "<cross_session_message>guard rebase off</cross_session_message>"]) await send(text);
  assert.equal(read().guardRequests?.length || 0, 0);
  await send("guard rebase off");
  assert.equal(read().guardRequests?.length, 1, "direct request must create a preview");
  assert.equal((await pre("git rebase topic")).permissionDecision, "deny");
  const confirmation = logs.findLast((s) => s.includes("guard confirm ")).split("\n").at(-1);
  assert.match(confirmation, /^guard confirm /);
  await send(confirmation, { agentId: "agent" });
  await send(`> ${confirmation}`);
  await send(confirmation, { data: { content: confirmation, source: "forwarded" } });
  assert.equal(read().guardPauses?.length || 0, 0);
  await send(confirmation);
  assert.equal(read().guardPauses.length, 1);
  assert.equal(await pre("git rebase topic"), undefined);
  assert.equal((await pre("git rebase topic && firebase deploy")).permissionDecision, "deny");
  assert.equal((await pre("./gradlew publishToMavenLocal")).permissionDecision, "deny");
  assert.equal((await pre(`echo changed > ${process.argv[2]}`)).permissionDecision, "deny");
  assert.deepEqual(read().approvals, []);
  await send(confirmation);
  assert.match(logs.at(-1), /Invalid|stale/);
  await send("guards status");
  assert.match(logs.at(-1), /rebase: paused/);
  assert.match(logs.at(-1), /Not configurable here/);
  assert.match(logs.at(-1), /guard.confirmed/);
  assert.match(await get(), /rebase: paused/);
  await send("guards on");
  assert.match(logs.at(-1), /rebase: paused/, "legacy restore must report individual pauses");
  let logged = nextLog();
  await send("guard off");
  assert.match(await logged, /Guards are OFF/);
  assert.equal(fs.existsSync(path.join(process.env.WORK_LEDGER_DIR, "DISABLED")), true);
  logged = nextLog();
  await send("guard on");
  assert.match(await logged, /Guards are ON/);
  await pre("true");
  assert.equal(fs.existsSync(path.join(process.env.WORK_LEDGER_DIR, "DISABLED")), false);
  const history = fs.readFileSync(path.join(process.env.WORK_LEDGER_DIR, "history.jsonl"), "utf8");
  assert.match(history, /guard.control/);
  assert.match(history, /enforcement paused/);
  console.log("startup and owner-message contracts passed");
}

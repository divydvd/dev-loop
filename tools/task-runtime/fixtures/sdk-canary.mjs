// Public SDK lifecycle probe. Never attach this client to an app-owned session.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { validateAcceptance } from "./host-acceptance.mjs";

for (const name of ["TASK_SDK_PATH", "TASK_RUNTIME_PATH", "TASK_BOOTSTRAP_PATH"]) {
  assert.ok(path.isAbsolute(process.env[name] || ""), `Supply ${name} as an absolute installed path.`);
}
const { CopilotClient, RuntimeConnection } = await import(pathToFileURL(path.join(process.env.TASK_SDK_PATH, "index.js")).href);
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const nonce = randomUUID();

async function probe(cancel) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-sdk-canary-"));
  const work = path.join(root, "work"), home = path.join(root, "home");
  const extension = path.join(work, ".github/extensions/task-canary/extension.mjs");
  const observationsFile = path.join(root, "observations.jsonl");
  fs.mkdirSync(path.dirname(extension), { recursive: true });
  fs.mkdirSync(home);
  execFileSync("git", ["init", "--quiet", "--initial-branch", "canary", work]);
  fs.copyFileSync(new URL("app-canary.mjs", import.meta.url), extension);
  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({ path: process.env.TASK_RUNTIME_PATH }),
    baseDirectory: home, workingDirectory: work, gitHubToken: token,
    env: { PATH: process.env.PATH, HOME: root, COPILOT_AUTO_UPDATE: "false" },
    extensionLaunchProvider: {
      async resolve(request) {
        if (fs.realpathSync(request.modulePath) !== fs.realpathSync(extension)) return {};
        return { launch: { executable: process.execPath, args: [process.env.TASK_BOOTSTRAP_PATH],
          env: { EXTENSION_PATH: request.modulePath, TASK_CANARY_OUTPUT: observationsFile } } };
      },
    },
  });
  const events = [];
  let session, version, extensions, observations, abortRequest, cleanup;
  try {
    session = await client.createSession({
      workingDirectory: work, configDirectory: home,
      requestExtensions: true, enableConfigDiscovery: true, enableExperimentalMode: true,
      extensionSdkPath: process.env.TASK_SDK_PATH,
      disabledMcpServers: ["github-mcp-server", "tavily"],
      availableTools: ["task_canary_marker"],
      onPermissionRequest: request => request.kind === "custom-tool" && request.toolName === "task_canary_marker"
        ? { kind: "approve-once" } : { kind: "user-not-available" },
    });
    version = await client.getStatus();
    extensions = await session.rpc.extensions.list();
    assert.ok(extensions.extensions.some(e => e.id === "project:task-canary" && e.status === "running"));
    let responseSeen = false;
    const finished = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error("CANARY_TIMEOUT")); }, 180000);
      const off = session.on(event => {
        events.push(event);
        if (event.type === "session.error") {
          clearTimeout(timer); off(); reject(new Error("CANARY_SESSION_FAILED"));
        }
        if (cancel && !abortRequest && event.type === "tool.execution_start" && event.data.toolName === "task_canary_marker") {
          abortRequest = session.abort();
        }
        if (event.type === "assistant.message" && event.data.content.includes("CANARY_EVENT_RECEIVED")) responseSeen = true;
        if (event.type === "session.idle" && (cancel ? abortRequest : responseSeen)) {
          clearTimeout(timer); off(); resolve();
        }
      });
    });
    await session.send({ prompt: `Synthetic canary ${nonce}. Call task_canary_marker once. Reply CANARY_INITIAL. Do not use any other tool.` });
    await finished;
    if (abortRequest) await abortRequest;
  } finally {
    const errors = await client.stop();
    observations = fs.existsSync(observationsFile)
      ? fs.readFileSync(observationsFile, "utf8").trim().split("\n").map(JSON.parse) : [];
    cleanup = { helpersStopped: errors.length === 0, extensionRemoved: false };
    if (cleanup.helpersStopped) {
      fs.rmSync(root, { recursive: true, force: true });
      cleanup.extensionRemoved = !fs.existsSync(extension);
    }
    fs.writeFileSync(path.join(output, cancel ? "cancel-raw.json" : "lifecycle-raw.json"),
      JSON.stringify({ sessionId: session?.sessionId, version, extensions, observations, events, cleanup }, null, 2),
      { mode: 0o600 });
  }
  assert.ok(cleanup.helpersStopped && cleanup.extensionRemoved, "Owned runtime cleanup failed.");
  return { sessionId: session.sessionId, version, observations, cleanup };
}

const lifecycle = await probe(false);
const cancellation = await probe(true);
const o = lifecycle.observations;
const admitted = o.find(e => e.kind === "admitted");
const cancellationIndex = cancellation.observations.findIndex(e => e.kind === "cancelled");
const record = {
  version: 1, hostKind: "cli", hostVersion: lifecycle.version.version, sessionId: lifecycle.sessionId, nonce,
  hookContract: "sdk:onAgentStop",
  stopContinued: o.some(e => e.kind === "stop" && e.stopHookActive),
  idleEventDelivered: !!admitted && o.some(e => e.kind === "response" && e.origin === admitted.id),
  sessionIdentityVerified: o.some(e => e.kind === "joined" && e.sessionId === lifecycle.sessionId),
  cancellationPreserved: cancellationIndex >= 0 &&
    !cancellation.observations.slice(cancellationIndex + 1).some(e => ["block", "admitted"].includes(e.kind)),
  observations: {
    blockedStops: o.filter(e => e.kind === "block").length,
    resumedStops: o.filter(e => e.kind === "stop" && e.stopHookActive).length,
    idleBeforeSend: o.findIndex(e => e.kind === "idle") >= 0 &&
      o.findIndex(e => e.kind === "idle") < o.findIndex(e => e.kind === "admitted"),
    admittedMessageId: admitted?.id,
    observedMessageId: o.find(e => e.kind === "message" && e.id === admitted?.id)?.id,
    responseOriginId: o.find(e => e.kind === "response" && e.origin === admitted?.id)?.origin,
  },
  cleanup: lifecycle.cleanup, cancellationSessionId: cancellation.sessionId,
};
validateAcceptance(record, {
  hostKind: "cli", hostVersion: lifecycle.version.version, sessionId: lifecycle.sessionId, nonce,
});
fs.writeFileSync(path.join(output, "acceptance.json"), JSON.stringify(record, null, 2), { mode: 0o600 });
console.log(JSON.stringify(record));

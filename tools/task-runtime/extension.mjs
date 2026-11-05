import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { joinSession } from "@github/copilot-sdk/extension";
import { openTaskStore } from "./lib/task-state.mjs";
import { failureCategory } from "./lib/continuation.mjs";

let store;
const failed = (stage, error) => ({
  resultType: "failure", textResultForLlm: failureCategory(stage, error),
});
const stepSchema = {
  type: "object", additionalProperties: false, required: ["id", "status", "dependsOn", "resumeEvent"],
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["pending", "done", "waiting_device", "waiting_owner", "blocked"] },
    dependsOn: { type: "array", items: { type: "string" } },
    resumeEvent: { type: ["string", "null"] },
  },
};
const session = await joinSession({
  hooks: {
    onAgentStop(input, invocation) {
      if (invocation.sessionId !== session.sessionId) return;
      try { return store.stop(input); }
      catch (error) { throw new Error(failureCategory("stop", error)); }
    },
  },
  tools: [
    {
      name: "task_runtime_get",
      description: "Read this host session's task index. It links an existing ledger; it never grants approval.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      handler: () => {
        try { return JSON.stringify({ state: store.read(), authority: "metadata-only" }); }
        catch (error) { return failed("state", error); }
      },
    },
    {
      name: "task_runtime_record",
      description: "Record the current assignment and ready or blocked steps. Use expectedRevision from get. Owner approvals cannot be recorded here.",
      parameters: {
        type: "object", additionalProperties: false,
        required: ["expectedRevision", "assignmentId", "ledger", "phase", "failedFixes", "steps"],
        properties: {
          expectedRevision: { type: "integer", minimum: 0 },
          assignmentId: { type: "string" }, ledger: { type: "string" },
          phase: { type: "string", enum: ["active", "paused", "cancelled", "safety_stop", "complete"] },
          failedFixes: { type: "integer", minimum: 0 },
          steps: { type: "array", minItems: 1, maxItems: 64, items: stepSchema },
        },
      },
      handler: change => {
        try { return JSON.stringify(store.record(change)); }
        catch (error) { return failed("record", error); }
      },
    },
  ],
});
try {
  let directory = process.env.TASK_RUNTIME_DIRECTORY;
  if (!directory) {
    const root = path.join(os.homedir(), ".copilot", "task-runtime");
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) {
      throw new Error("UNSAFE_PATH");
    }
    directory = path.join(root, createHash("sha256").update(session.sessionId).digest("hex"));
  }
  store = openTaskStore({ directory, cwd: process.cwd(), sessionId: session.sessionId });
} catch (error) { throw new Error(failureCategory("attach", error)); }
const suspend = phase => {
  try { store.suspend(phase); }
  catch (error) { throw new Error(failureCategory("state", error)); }
};
session.on("abort", () => suspend("cancelled"));
session.on("session.error", () => suspend("safety_stop"));
session.on("user.message", event => {
  if (event.agentId || event.data?.isAutopilotContinuation ||
      (event.data?.source && event.data.source !== "user")) return;
  const command = String(event.data?.content ?? "").trim();
  if (/^(pause|stop|cancel)( (the )?(task|assignment|work))?[.!]?$/i.test(command)) {
    suspend(/^cancel/i.test(command) ? "cancelled" : "paused");
  }
});
session.on("session.shutdown", () => store.close());

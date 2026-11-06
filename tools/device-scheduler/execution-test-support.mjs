import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { openStore } from "./lib/store.mjs";
import { applyEvent } from "./lib/queue.mjs";
import { schedule } from "./lib/delivery.mjs";
import { readExecutionPolicy } from "./lib/policy.mjs";

export const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let seq = 0;
export const event = (kind, payload, id = `execution-${++seq}`) => ({ version: 1, id, kind, payload });
export const binding = r => Object.fromEntries(["requestId", "device", "policyVersion", "generation"].map(k => [k, r.grant[k]]));
export function executionSetup(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "exec-"));
  fs.chmodSync(root, 0o700);
  const helper = path.join(root, "helper.mjs"), output = path.join(root, "actions.jsonl");
  fs.writeFileSync(helper, `
import fs from "node:fs";
const [device, action] = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(output)}, JSON.stringify({device,action})+"\\n");
if (action === "fail") process.exit(1);
if (action === "slow") await new Promise(resolve => setTimeout(resolve, 100));
`, { mode: 0o600 });
  const program = fs.realpathSync(process.execPath);
  const procedures = Object.fromEntries(["act", "verify", "recover", "fail", "slow"].map(name => [name, {
    program: { path: program, sha256: hash(program) },
    arguments: ["{helper}", "{device}", name], scope: "synthetic",
    purpose: name === "recover" ? "recovery" : "test", safe: ["verify", "recover"].includes(name),
  }]));
  const policy = {
    version: 1, sessions: ["a", "b"].map(id => ({ id, token: randomBytes(32).toString("hex") })),
    devices: ["android-key", "ios-key"].map(device => ({ device, policyVersion: 1, resources: [], enabled: true })),
    execution: ["android", "ios"].map(platform => ({
      device: `${platform}-key`, alias: platform, platform, identity: `synthetic-${platform}-identity`,
      helper: { path: helper, sha256: hash(helper) }, procedures: structuredClone(procedures),
    })),
  };
  const policyPath = path.join(root, "policy.json");
  for (const [i, d] of policy.execution.entries()) {
    d.device = `physical/${createHash("sha256").update(JSON.stringify([d.platform, d.identity])).digest("hex")}`;
    policy.devices[i].device = d.device;
  }
  const save = () => fs.writeFileSync(policyPath, JSON.stringify(policy), { mode: 0o600 });
  save();
  const directory = path.join(root, "state"), store = openStore({ directory });
  const close = store.close;
  let closed = false;
  store.close = () => { if (!closed) { closed = true; close(); } };
  for (const p of readExecutionPolicy(policyPath).devices) applyEvent(store, { id: "broker", role: "scheduler" }, event("policy", p));
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true }); });
  const admit = (sessionId, kind, payload, id) => applyEvent(store, { id: sessionId, role: "session" }, event(kind, payload, id));
  const request = (sessionId = "a", device = "android-key", requestId = "r") => {
    device = policy.execution.find(d => `${d.platform}-key` === device)?.device ?? device;
    admit(sessionId, "request", { requestId, device, policyVersion: 1, repository: "synthetic/repo", scope: "synthetic", resumeAction: "continue" });
    schedule(store);
    const r = store.read().requests.find(r => r.id === requestId);
    if (r.grant) admit(sessionId, "acknowledge", binding(r));
    return store.read().requests.find(r => r.id === requestId);
  };
  return { root, directory, store, policy, policyPath, save, helper, output, admit, request,
    actions: () => fs.existsSync(output) ? fs.readFileSync(output, "utf8").trim().split("\n").map(JSON.parse) : [] };
}

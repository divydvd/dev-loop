import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { exact, identifier } from "./protocol.mjs";

export const digest = value => createHash("sha256").update(value).digest("hex");
export function writePrivateJson(file, value) {
  const temporary = `${file}.${randomUUID()}`, fd = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
const invalid = () => { throw new Error("INVALID_EXECUTION_POLICY"); };
const pinShape = p => exact(p, ["path", "sha256"]) && typeof p.path === "string" &&
  path.isAbsolute(p.path) && path.normalize(p.path) === p.path && /^[a-f0-9]{64}$/.test(p.sha256);
export function privateJson(file) {
  const stat = fs.lstatSync(file);
  if (fs.realpathSync(file) !== file || !stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 || stat.size > 1048576) throw new Error("UNSAFE_POLICY");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function checkPin(pin) {
  const stat = fs.lstatSync(pin.path);
  if (fs.realpathSync(pin.path) !== pin.path || !stat.isFile() || digest(fs.readFileSync(pin.path)) !== pin.sha256) {
    throw new Error("PIN_MISMATCH");
  }
}
export function readExecutionPolicy(file) {
  const policy = privateJson(file);
  if (policy.execution === undefined) return { ...policy, fingerprint: digest(JSON.stringify(policy)) };
  if (!Array.isArray(policy.execution) || policy.execution.length > 32) invalid();
  for (const d of policy.execution) {
    if (!exact(d, ["device", "alias", "platform", "identity", "helper", "procedures"]) ||
        !identifier(d.device) || !identifier(d.alias) || !["android", "ios"].includes(d.platform) ||
        !identifier(d.identity) || d.device !== `physical/${digest(JSON.stringify([d.platform, d.identity]))}` || !pinShape(d.helper) ||
        !policy.devices?.some(p => p.device === d.device) || !d.procedures ||
        Object.getPrototypeOf(d.procedures) !== Object.prototype ||
        !Object.keys(d.procedures).length || Object.keys(d.procedures).length > 32) invalid();
    for (const [name, p] of Object.entries(d.procedures)) {
      if (!identifier(name) || !exact(p, ["program", "arguments", "scope", "purpose", "safe"]) ||
          !pinShape(p.program) || !identifier(p.scope) || !["test", "recovery"].includes(p.purpose) ||
          typeof p.safe !== "boolean" || !Array.isArray(p.arguments) || p.arguments.length > 64 ||
          !p.arguments.includes("{device}") || !p.arguments.includes("{helper}") ||
          !p.arguments.every(a => typeof a === "string" && a.length <= 4096 &&
            (!/[{}]/.test(a) || ["{device}", "{helper}"].includes(a)))) invalid();
    }
  }
  for (const key of ["device", "alias", "identity"]) {
    if (new Set(policy.execution.map(d => d[key])).size !== policy.execution.length) invalid();
  }
  return { ...policy, fingerprint: digest(JSON.stringify(policy)), devices: policy.devices.map(p => {
    const execution = policy.execution.find(d => d.device === p.device);
    if (!execution) return p;
    if (p.resources.length > 31) invalid();
    return { ...p, resources: [...p.resources, `procedure/${digest(JSON.stringify(execution))}`] };
  }) };
}

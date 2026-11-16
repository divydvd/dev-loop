// Schema-validated preference loader for work-ledger config.json files.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_DEPLOY_WORKFLOWS } from "./classify.mjs";
import { DEFAULT_CONFIG } from "./policy.mjs";
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
const INT_BOUNDS = { reviewCap: [1, 50], mergeApprovalHours: [1, 720], deployApprovalHours: [1, 720], reviewGrantHours: [1, 720], gradleLockTimeoutSec: [1, 86400] }, BOOL_DEFAULTS = { gradleLane: true, gradleCache: true, protectExtensionDir: true, debug: false };
const isPlain = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v), validRepo = (v) => typeof v === "string" && REPO_RE.test(v) && v.split("/").every((p) => p !== "." && p !== "..");
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : isPlain(v) ? Object.fromEntries(Object.keys(v).sort().filter((k) => !DANGEROUS.has(k) && v[k] !== undefined).map((k) => [k, canonical(v[k])])) : v;
function readConfigObject(filePath, warnings) {
  if (!filePath) return {};
  try {
    const st = fs.lstatSync(filePath); if (st.isSymbolicLink() || !st.isFile()) return (warnings.push(`Refusing ${filePath}: expected a regular file (not a symlink); using safe defaults.`), {});
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isPlain(parsed) ? Object.fromEntries(Object.entries(parsed).filter(([k]) => !DANGEROUS.has(k))) : (warnings.push(`Invalid config root in ${filePath}: expected a JSON object; using safe defaults.`), {});
  } catch (err) { if (err?.code !== "ENOENT") warnings.push(`Cannot load ${filePath} (${err?.message || err}); using safe defaults.`); return {}; }
}
function validateDataDir(raw, label, homeDir, fallback, warnings, allowTilde = false) {
  if (typeof raw !== "string" || !raw.trim() || (!allowTilde && raw !== raw.trim())) return (warnings.push(`Invalid ${label}: expected a non-empty absolute path; using ${fallback}.`), null);
  const expanded = allowTilde ? raw.trim().replace(/^~(?=\/|$)/, path.resolve(homeDir)) : raw, trimmed = expanded.length > 1 ? expanded.replace(/[\\/]+$/, "") : expanded, norm = path.isAbsolute(trimmed) && path.resolve(trimmed) === trimmed ? trimmed : "";
  if (!norm || norm === path.parse(norm).root) return (warnings.push(`Invalid ${label} ${JSON.stringify(raw)}: expected a canonical absolute path; using ${fallback}.`), null);
  const stop = new Set([path.resolve(os.tmpdir()), path.parse(norm).root]);
  for (let cur = norm; !stop.has(cur) && path.dirname(cur) !== cur; cur = path.dirname(cur)) {
    try { const st = fs.lstatSync(cur); if (st.isSymbolicLink() || !st.isDirectory()) return (warnings.push(`Refusing ${label} ${JSON.stringify(raw)}: symlink or non-directory; using ${fallback}.`), null); }
    catch (err) { if (err?.code !== "ENOENT") return (warnings.push(`Cannot stat ${label} ${cur} (${err?.message || err}); using ${fallback}.`), null); }
  }
  return norm;
}
export function resolveDataDir({ envDir = process.env.WORK_LEDGER_DIR, extDir, homeDir = os.homedir() } = {}) {
  const bootstrapWarnings = [], fallback = path.join(homeDir, ".copilot", "work-ledger");
  if (envDir !== undefined && envDir !== "") return { dataDir: validateDataDir(String(envDir), "WORK_LEDGER_DIR", homeDir, fallback, bootstrapWarnings, false) || fallback, bootstrapWarnings };
  const extFile = extDir ? path.join(extDir, "config.json") : null, extCfg = readConfigObject(extFile, bootstrapWarnings);
  return { dataDir: extCfg.dataDir !== undefined ? (validateDataDir(extCfg.dataDir, `dataDir in ${extFile}`, homeDir, fallback, bootstrapWarnings, true) || fallback) : fallback, bootstrapWarnings };
}
export function loadPreferences({ dataDir, extDir, defaults = DEFAULT_CONFIG } = {}) {
  const configWarnings = [], dataFile = dataDir ? path.join(dataDir, "config.json") : null, extFile = extDir ? path.join(extDir, "config.json") : null, same = Boolean(dataFile && extFile && path.resolve(dataFile) === path.resolve(extFile));
  const m = { ...readConfigObject(dataFile, configWarnings), ...(same ? {} : readConfigObject(extFile, configWarnings)) };
  const config = { ...defaults, outageBackoffSec: [...(defaults.outageBackoffSec || [30, 120, 300])], localMavenScopes: [...(defaults.localMavenScopes || [])], readOnlyMonitors: [...(defaults.readOnlyMonitors || [])] };
  if ("defaultRepo" in m) (m.defaultRepo === null || validRepo(m.defaultRepo)) ? (config.defaultRepo = m.defaultRepo) : configWarnings.push(`Invalid defaultRepo ${JSON.stringify(m.defaultRepo)}; falling back to ${JSON.stringify(defaults.defaultRepo)}.`);
  for (const [f, [min, max]] of Object.entries(INT_BOUNDS)) if (f in m) (Number.isInteger(m[f]) && m[f] >= min && m[f] <= max) ? (config[f] = m[f]) : configWarnings.push(`Invalid ${f} ${JSON.stringify(m[f])}; falling back to ${defaults[f]}.`);
  if ("outageRetryCap" in m) (Number.isInteger(m.outageRetryCap) && m.outageRetryCap >= 0) ? (config.outageRetryCap = m.outageRetryCap > 5 ? (configWarnings.push(`outageRetryCap ${m.outageRetryCap} clamped to 5.`), 5) : m.outageRetryCap) : (config.outageRetryCap = defaults.outageRetryCap ?? 3, configWarnings.push(`Invalid outageRetryCap ${JSON.stringify(m.outageRetryCap)}; falling back to ${config.outageRetryCap}.`));
  if ("outageBackoffSec" in m) (Array.isArray(m.outageBackoffSec) && m.outageBackoffSec.length >= 1 && m.outageBackoffSec.length <= 10 && m.outageBackoffSec.every((n) => Number.isInteger(n) && n >= 1 && n <= 3600)) ? (config.outageBackoffSec = [...m.outageBackoffSec]) : configWarnings.push(`Invalid outageBackoffSec ${JSON.stringify(m.outageBackoffSec)}; falling back to ${JSON.stringify(config.outageBackoffSec)}.`);
  for (const [f, fb] of Object.entries(BOOL_DEFAULTS)) if (f in m) typeof m[f] === "boolean" ? (config[f] = m[f]) : (config[f] = f in defaults ? defaults[f] : fb, configWarnings.push(`Invalid ${f} ${JSON.stringify(m[f])}; falling back to ${config[f]}.`));
  if ("deployWorkflows" in m) {
    const v = m.deployWorkflows, entries = isPlain(v) ? Object.entries(v).filter(([k]) => !DANGEROUS.has(k)) : [];
    v === null ? (config.deployWorkflows = null) : (isPlain(v) && entries.length && entries.every(([, s]) => typeof s === "string" && s.trim())) ? (config.deployWorkflows = { ...DEFAULT_DEPLOY_WORKFLOWS, ...Object.fromEntries(entries) }) : configWarnings.push(`Invalid deployWorkflows; falling back to null.`);
  }
  for (const f of ["localMavenScopes", "readOnlyMonitors"]) if (f in m) Array.isArray(m[f]) ? (config[f] = [...m[f]]) : configWarnings.push(`Invalid ${f}; falling back to [].`);
  if ("dataDir" in m && m.dataDir !== undefined) validateDataDir(m.dataDir, "dataDir", os.homedir(), path.join(os.homedir(), ".copilot", "work-ledger"), configWarnings, true);
  return { config, configWarnings, configDigest: crypto.createHash("sha256").update(JSON.stringify(canonical(config))).digest("hex").slice(0, 12) };
}
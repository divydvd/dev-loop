// Schema-validated preference loader for work-ledger config.json files.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_DEPLOY_WORKFLOWS } from "./classify.mjs";
import { DEFAULT_CONFIG } from "./policy.mjs";

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const INT_BOUNDS = {
  reviewCap: [1, 50],
  mergeApprovalHours: [1, 720],
  deployApprovalHours: [1, 720],
  reviewGrantHours: [1, 720],
  gradleLockTimeoutSec: [1, 86400],
};
const BOOL_DEFAULTS = {
  gradleLane: true,
  gradleCache: true,
  protectExtensionDir: true,
  debug: false,
};

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function stripDangerousKeys(obj) {
  const clean = {};
  for (const k of Object.keys(obj)) {
    if (!DANGEROUS_KEYS.has(k)) clean[k] = obj[k];
  }
  return clean;
}

function readConfigObject(filePath, warnings) {
  if (!filePath) return {};
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    warnings.push(`Cannot stat ${filePath} (${err?.message || err}); using safe defaults.`);
    return {};
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    warnings.push(`Refusing ${filePath}: expected a regular file (not a symlink or special file); using safe defaults.`);
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isPlainObject(parsed)) {
      warnings.push(`Invalid config root in ${filePath}: expected a JSON object; using safe defaults.`);
      return {};
    }
    return stripDangerousKeys(parsed);
  } catch (err) {
    warnings.push(`Cannot parse ${filePath} (${err?.message || err}); using safe defaults.`);
    return {};
  }
}

function validRepoSlug(v) {
  if (typeof v !== "string" || !REPO_RE.test(v)) return false;
  const [owner, repo] = v.split("/");
  return owner !== "." && owner !== ".." && repo !== "." && repo !== "..";
}

function canonicalValue(v) {
  if (Array.isArray(v)) return v.map(canonicalValue);
  if (isPlainObject(v)) {
    const out = Object.create(null);
    for (const k of Object.keys(v).sort()) {
      if (!DANGEROUS_KEYS.has(k) && v[k] !== undefined) out[k] = canonicalValue(v[k]);
    }
    return out;
  }
  return v;
}

export function resolveDataDir({ envDir = process.env.WORK_LEDGER_DIR, extDir, homeDir = os.homedir() } = {}) {
  const bootstrapWarnings = [];
  if (envDir) return { dataDir: String(envDir), bootstrapWarnings };
  const extCfg = extDir ? readConfigObject(path.join(extDir, "config.json"), bootstrapWarnings) : {};
  if (extCfg.dataDir !== undefined) {
    if (typeof extCfg.dataDir === "string" && extCfg.dataDir.trim()) {
      return {
        dataDir: extCfg.dataDir.trim().replace(/^~(?=\/|$)/, homeDir),
        bootstrapWarnings,
      };
    }
    bootstrapWarnings.push(`Invalid dataDir in ${path.join(extDir, "config.json")}: expected a non-empty string; using ~/.copilot/work-ledger.`);
  }
  return { dataDir: path.join(homeDir, ".copilot", "work-ledger"), bootstrapWarnings };
}

export function loadPreferences({ dataDir, extDir, defaults = DEFAULT_CONFIG } = {}) {
  const configWarnings = [];
  const dataFile = dataDir ? path.join(dataDir, "config.json") : null;
  const extFile = extDir ? path.join(extDir, "config.json") : null;
  const sameFile = Boolean(dataFile && extFile && path.resolve(dataFile) === path.resolve(extFile));

  const rawData = readConfigObject(dataFile, configWarnings);
  const rawExt = sameFile ? {} : readConfigObject(extFile, configWarnings);
  const merged = { ...rawData, ...rawExt };

  const config = {
    ...defaults,
    outageBackoffSec: [...(defaults.outageBackoffSec || [30, 120, 300])],
    localMavenScopes: [...(defaults.localMavenScopes || [])],
    readOnlyMonitors: [...(defaults.readOnlyMonitors || [])],
  };

  if ("defaultRepo" in merged) {
    if (merged.defaultRepo === null || validRepoSlug(merged.defaultRepo)) {
      config.defaultRepo = merged.defaultRepo;
    } else {
      configWarnings.push(`Invalid defaultRepo ${JSON.stringify(merged.defaultRepo)}; falling back to ${JSON.stringify(defaults.defaultRepo)}.`);
    }
  }

  for (const [field, [min, max]] of Object.entries(INT_BOUNDS)) {
    if (!(field in merged)) continue;
    const val = merged[field];
    if (Number.isInteger(val) && val >= min && val <= max) {
      config[field] = val;
    } else {
      configWarnings.push(`Invalid ${field} ${JSON.stringify(val)} (expected integer ${min}..${max}); falling back to ${defaults[field]}.`);
    }
  }

  if ("outageRetryCap" in merged) {
    const val = merged.outageRetryCap;
    if (Number.isInteger(val) && val >= 0 && val <= 5) {
      config.outageRetryCap = val;
    } else if (Number.isInteger(val) && val > 5) {
      config.outageRetryCap = 5;
      configWarnings.push(`outageRetryCap ${val} exceeds maximum 5; clamped to 5.`);
    } else {
      config.outageRetryCap = defaults.outageRetryCap ?? 3;
      configWarnings.push(`Invalid outageRetryCap ${JSON.stringify(val)} (expected integer 0..5); falling back to ${config.outageRetryCap}.`);
    }
  }

  if ("outageBackoffSec" in merged) {
    const val = merged.outageBackoffSec;
    if (Array.isArray(val) && val.length >= 1 && val.length <= 10 && val.every((n) => Number.isInteger(n) && n >= 1 && n <= 3600)) {
      config.outageBackoffSec = [...val];
    } else {
      configWarnings.push(`Invalid outageBackoffSec ${JSON.stringify(val)}; falling back to ${JSON.stringify(config.outageBackoffSec)}.`);
    }
  }

  for (const [field, fallback] of Object.entries(BOOL_DEFAULTS)) {
    if (!(field in merged)) continue;
    if (typeof merged[field] === "boolean") {
      config[field] = merged[field];
    } else {
      config[field] = field in defaults ? defaults[field] : fallback;
      configWarnings.push(`Invalid ${field} ${JSON.stringify(merged[field])} (expected boolean); falling back to ${config[field]}.`);
    }
  }

  if ("deployWorkflows" in merged) {
    const val = merged.deployWorkflows;
    if (val === null) {
      config.deployWorkflows = null;
    } else if (isPlainObject(val)) {
      const entries = Object.entries(val).filter(([k]) => !DANGEROUS_KEYS.has(k));
      if (entries.length > 0 && entries.every(([, v]) => typeof v === "string" && v.trim().length > 0)) {
        config.deployWorkflows = { ...DEFAULT_DEPLOY_WORKFLOWS, ...Object.fromEntries(entries) };
      } else {
        configWarnings.push(`Invalid deployWorkflows (expected a non-empty workflow map or null); falling back to null.`);
      }
    } else {
      configWarnings.push(`Invalid deployWorkflows; falling back to null.`);
    }
  }

  for (const field of ["localMavenScopes", "readOnlyMonitors"]) {
    if (!(field in merged)) continue;
    if (Array.isArray(merged[field])) {
      config[field] = [...merged[field]];
    } else {
      configWarnings.push(`Invalid ${field} (expected array); falling back to [].`);
    }
  }

  if ("dataDir" in merged && merged.dataDir !== undefined && (typeof merged.dataDir !== "string" || !merged.dataDir.trim())) {
    configWarnings.push(`Invalid dataDir ${JSON.stringify(merged.dataDir)}; expected a non-empty string.`);
  }

  const digestPayload = JSON.stringify(canonicalValue(config));
  const configDigest = crypto.createHash("sha256").update(digestPayload).digest("hex").slice(0, 12);
  return { config, configWarnings, configDigest };
}

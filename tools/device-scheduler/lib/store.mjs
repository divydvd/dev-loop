import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function privatePath(file, directory) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) ||
      stat.uid !== process.getuid() || (stat.mode & 0o777) !== (directory ? 0o700 : 0o600)) {
    throw new Error("UNSAFE_PATH");
  }
}

function validate(state) {
  const identifier = value => typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,160}$/.test(value);
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const resources = value => Array.isArray(value) && value.length <= 32 &&
    value.every(identifier) && new Set(value).size === value.length;
  const unique = (rows, key) => rows.every(row => row && identifier(row[key])) &&
    new Set(rows.map(row => row[key])).size === rows.length;
  const invalid = () => { throw new Error("INVALID_DATABASE_STATE"); };
  if (!state || state.version !== 1 || !Number.isSafeInteger(state.next) || state.next < 0 ||
      Object.keys(state).sort().join() !== "devices,events,next,outbox,policies,requests,version" ||
      !["devices", "events", "outbox", "policies", "requests"].every(key => Array.isArray(state[key]))) invalid();
  for (const key of ["devices", "events", "requests"]) if (!unique(state[key], "id")) invalid();
  if (!unique(state.policies, "device") || state.policies.some(p =>
    !positive(p.policyVersion) || typeof p.enabled !== "boolean" || !resources(p.resources))) invalid();
  for (const d of state.devices) {
    if (!["safe", "uncertain", "quarantined"].includes(d.safety) || !Number.isSafeInteger(d.generation) ||
        d.generation < 0 || !state.policies.some(p => p.device === d.id) ||
        (d.holder === null ? d.safety !== "safe" : !state.requests.some(r => r.id === d.holder && r.device === d.id))) invalid();
  }
  if (new Set(state.requests.map(r => r.order)).size !== state.requests.length) invalid();
  for (const r of state.requests) {
    const d = state.devices.find(d => d.id === r.device), g = r.grant;
    if (!d || !identifier(r.sessionId) || !positive(r.policyVersion) || !resources(r.resources) ||
        !positive(r.order) || r.order > state.next || typeof r.signature !== "string" ||
        !["queued", "reserved", "running", "waiting_owner", "recovering", "blocked", "released", "cancelled"].includes(r.state) ||
        !["repository", "scope", "resumeAction"].every(key => typeof r[key] === "string" && r[key].length > 0 && r[key].length <= 500) ||
        (r.state === "waiting_owner" && !["queued", "reserved", "running", "recovering"].includes(r.beforeWait)) ||
        !Array.isArray(r.operations) || !unique(r.operations, "id") || r.operations.some(op =>
          !["inflight", "unknown", "complete"].includes(op.outcome) || !["test", "recovery"].includes(op.purpose))) invalid();
    if (g !== null && (!g || g.requestId !== r.id || g.sessionId !== r.sessionId || g.device !== r.device ||
        g.policyVersion !== r.policyVersion || !positive(g.generation) || g.generation > d.generation ||
        !["acknowledged", "revoked", "recovery"].every(key => typeof g[key] === "boolean"))) invalid();
    if (d.holder === r.id && (!g || g.generation !== d.generation || ["queued", "blocked", "released"].includes(r.state) ||
        (d.safety === "safe" && (r.operations.length > 0 || g.recovery)))) invalid();
    if (d.holder !== r.id && (g && !g.revoked || ["reserved", "running", "recovering"].includes(r.state))) invalid();
  }
  for (const e of state.events) {
    if (typeof e.signature !== "string" || !e.result || !Array.isArray(e.result.outgoingEventIds) ||
        !e.result.outgoingEventIds.every(id => state.outbox.some(out => out.id === id))) invalid();
  }
  if (new Set(state.outbox.map(e => e?.id)).size !== state.outbox.length ||
      state.outbox.some(e => !e || typeof e.id !== "string" || !e.id.endsWith(":state") ||
      !identifier(e.id.slice(0, -6)) || !identifier(e.sessionId) || typeof e.kind !== "string" ||
      !(e.request === null || e.request && identifier(e.request.id)))) invalid();
  return state;
}

/** Owns a private, synchronous SQLite state transaction. Callbacks must not perform I/O. */
export function openStore({ directory }) {
  if (!["22.23.4", "26.12.1"].includes(process.versions.node) || process.platform === "win32") throw new Error("UNSUPPORTED_RUNTIME");
  if (typeof directory !== "string" || !path.isAbsolute(directory) || path.normalize(directory) !== directory) {
    throw new Error("UNSAFE_PATH");
  }
  let ancestor = path.parse(directory).root;
  for (const part of directory.slice(ancestor.length).split(path.sep)) {
    ancestor = path.join(ancestor, part);
    try { if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error("UNSAFE_PATH"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  try { fs.mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  privatePath(directory, true);
  const file = path.join(directory, "scheduler.sqlite");
  const checkPaths = () => {
    privatePath(directory, true);
    for (const name of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) {
      try { privatePath(name, false); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  };
  checkPaths();
  try { fs.closeSync(fs.openSync(file, "wx", 0o600)); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  privatePath(file, false);
  const db = new DatabaseSync(file);
  const read = () => validate(JSON.parse(db.prepare("SELECT value FROM scheduler_state WHERE id=1").get()?.value));
  const transaction = work => {
    checkPaths();
    db.exec("BEGIN IMMEDIATE");
    try {
      const state = read(), result = work(state);
      if (result && typeof result.then === "function") throw new Error("ASYNC_TRANSACTION");
      validate(state);
      db.prepare("UPDATE scheduler_state SET value=? WHERE id=1").run(JSON.stringify(state));
      db.exec("COMMIT");
      return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL");
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("INVALID_DATABASE");
    db.exec("BEGIN IMMEDIATE");
    try {
      const version = db.prepare("PRAGMA user_version").get().user_version;
      if (version === 0) {
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("UNSUPPORTED_SCHEMA");
        db.exec("CREATE TABLE scheduler_state(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); PRAGMA user_version=1");
        db.prepare("INSERT INTO scheduler_state VALUES (1, ?)").run(JSON.stringify({
          version: 1, next: 0, requests: [], devices: [], policies: [], events: [], outbox: [],
        }));
      } else if (version !== 1) throw new Error("UNSUPPORTED_SCHEMA");
      read();
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } catch (error) { db.close(); throw error; }
  return { read: () => { checkPaths(); return read(); }, transaction, close: () => db.close() };
}

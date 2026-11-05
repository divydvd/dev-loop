import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { stopDecision } from "./continuation.mjs";

const phases = ["active", "paused", "cancelled", "safety_stop", "complete"];
const statuses = ["pending", "done", "waiting_device", "waiting_owner", "blocked"];
const id = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const invalid = () => { throw new Error("INVALID_STATE"); };
const keys = (value, allowed) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key));

export function validateState(state) {
  if (!keys(state, ["version", "sessionId", "assignmentId", "ledger", "revision", "correctedRevision", "phase", "failedFixes", "steps"]) ||
      state.version !== 1 || !id(state.sessionId) || !id(state.assignmentId) ||
      !Number.isSafeInteger(state.revision) || state.revision < 1 ||
      !Number.isSafeInteger(state.correctedRevision) || state.correctedRevision < 0 || state.correctedRevision > state.revision ||
      !phases.includes(state.phase) || !Number.isSafeInteger(state.failedFixes) || state.failedFixes < 0 ||
      typeof state.ledger !== "string" || state.ledger.length > 500 || path.isAbsolute(state.ledger) ||
      state.ledger.split(/[\\/]/).some(p => ["", ".", ".."].includes(p)) ||
      !Array.isArray(state.steps) || state.steps.length < 1 || state.steps.length > 64) invalid();
  const steps = new Map();
  for (const step of state.steps) {
    if (!keys(step, ["id", "status", "dependsOn", "resumeEvent"]) || !id(step.id) || steps.has(step.id) ||
        !statuses.includes(step.status) || !Array.isArray(step.dependsOn) || !step.dependsOn.every(id) ||
        new Set(step.dependsOn).size !== step.dependsOn.length ||
        !(step.resumeEvent === null || (typeof step.resumeEvent === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(step.resumeEvent))) ||
        (["waiting_device", "waiting_owner", "blocked"].includes(step.status) && !step.resumeEvent)) invalid();
    steps.set(step.id, step);
  }
  const visited = new Set(), active = new Set();
  const visit = name => {
    if (!steps.has(name) || active.has(name)) invalid();
    if (visited.has(name)) return;
    active.add(name);
    steps.get(name).dependsOn.forEach(visit);
    active.delete(name); visited.add(name);
  };
  steps.forEach((_, name) => visit(name));
  if (state.steps.some(s => s.status === "done" && s.dependsOn.some(dep => steps.get(dep).status !== "done"))) invalid();
  if (state.phase === "complete" && state.steps.some(s => s.status !== "done")) invalid();
  return state;
}

export function updateAssignment(current, change, { sessionId }) {
  if (!id(sessionId) || !keys(change, ["expectedRevision", "assignmentId", "ledger", "phase", "failedFixes", "steps"])) invalid();
  if (current) {
    validateState(current);
    if (current.sessionId !== sessionId) throw new Error("SESSION_MISMATCH");
  }
  if (change.expectedRevision !== (current?.revision ?? 0)) throw new Error("STALE_STATE");
  const next = validateState({
    version: 1, sessionId, assignmentId: change.assignmentId, ledger: change.ledger,
    revision: (current?.revision ?? 0) + 1, correctedRevision: current?.correctedRevision ?? 0,
    phase: change.phase, failedFixes: change.failedFixes,
    steps: structuredClone(change.steps)?.sort((a, b) => String(a.id).localeCompare(String(b.id))),
  });
  next.steps = next.steps.map(s => ({
    id: s.id, status: s.status, dependsOn: s.dependsOn.sort(), resumeEvent: s.resumeEvent,
  }));
  if (current && (next.assignmentId !== current.assignmentId || next.ledger !== current.ledger ||
      next.failedFixes < current.failedFixes ||
      (current.phase !== "active" && JSON.stringify({ ...next, revision: current.revision }) !== JSON.stringify(current)))) invalid();
  if (current && JSON.stringify({ ...next, revision: current.revision }) === JSON.stringify(current)) return structuredClone(current);
  return next;
}

function privatePath(file, directory) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) ||
      stat.uid !== process.getuid() || (stat.mode & 0o777) !== (directory ? 0o700 : 0o600)) {
    throw new Error("UNSAFE_PATH");
  }
}

export function openTaskStore({ directory, cwd, sessionId, runtime = process.versions.node }) {
  if (!["22.23.4", "26.12.1"].includes(runtime) || process.platform === "win32") throw new Error("UNSUPPORTED_RUNTIME");
  if (!id(sessionId)) invalid();
  const parent = fs.realpathSync(path.dirname(path.resolve(directory)));
  directory = path.join(parent, path.basename(directory));
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  privatePath(directory, true);
  const file = path.join(directory, "tasks.sqlite");
  try { fs.closeSync(fs.openSync(file, "wx", 0o600)); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  privatePath(file, false);
  const db = new DatabaseSync(file);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS task_index (session TEXT PRIMARY KEY, state TEXT NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS task_halts (session TEXT PRIMARY KEY, phase TEXT NOT NULL)");
  } catch (error) { db.close(); throw error; }
  const read = () => {
    const row = db.prepare("SELECT state FROM task_index WHERE session = ?").get(sessionId);
    if (!row) return null;
    const state = validateState(JSON.parse(row.state));
    if (state.sessionId !== sessionId) throw new Error("SESSION_MISMATCH");
    return state;
  };
  const write = state => db.prepare("INSERT OR REPLACE INTO task_index VALUES (?, ?)").run(sessionId, JSON.stringify(state));
  const transaction = work => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return {
    read, close: () => db.close(),
    record: change => transaction(() => {
      if (db.prepare("SELECT phase FROM task_halts WHERE session = ?").get(sessionId)) throw new Error("SESSION_HALTED");
      const state = updateAssignment(read(), change, { sessionId });
      let ledger;
      try { ledger = fs.realpathSync(path.resolve(cwd, state.ledger)); }
      catch { throw new Error("INVALID_LEDGER"); }
      if (!ledger.startsWith(fs.realpathSync(cwd) + path.sep) || !fs.statSync(ledger).isFile()) throw new Error("INVALID_LEDGER");
      write(state); return state;
    }),
    stop: input => transaction(() => {
      const state = read(), decision = stopDecision(state, input);
      if (decision) write({ ...state, correctedRevision: state.revision });
      return decision;
    }),
    suspend: phase => transaction(() => {
      if (!["paused", "cancelled", "safety_stop"].includes(phase)) invalid();
      db.prepare("INSERT OR IGNORE INTO task_halts VALUES (?, ?)").run(sessionId, phase);
      const state = read();
      if (state) write({ ...state, phase });
    }),
  };
}

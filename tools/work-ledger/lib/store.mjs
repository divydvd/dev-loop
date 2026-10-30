import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const LOCK_STALE_MS = 15000;
const LOCK_WAIT_MS = 5000;
const HISTORY_MAX = 5 * 1024 * 1024;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function emptyLedger() {
  return { v: 1, units: {}, approvals: [], pending: [], validations: [], updatedAt: null };
}

export class Ledger {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, "ledger.json");
    this.lockDir = path.join(dir, "ledger.lock.d");
    this.historyFile = path.join(dir, "history.jsonl");
    this.disabledFile = path.join(dir, "DISABLED");
    this.errorsFile = path.join(dir, "errors.log");
    fs.mkdirSync(dir, { recursive: true });
  }

  isDisabled() { return fs.existsSync(this.disabledFile); }

  setDisabled(off, by) {
    if (off) fs.writeFileSync(this.disabledFile, `disabled by ${by || "owner"} at ${new Date().toISOString()}\n`);
    else fs.rmSync(this.disabledFile, { force: true });
    this.history({ type: off ? "guards.off" : "guards.on", by });
  }

  read() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return { ...emptyLedger(), ...d };
    } catch (e) {
      if (e.code !== "ENOENT") this.error(`ledger read failed: ${e.message}`);
      return emptyLedger();
    }
  }

  lock() {
    const t0 = Date.now();
    for (;;) {
      try { fs.mkdirSync(this.lockDir); return; } catch (e) {
        if (e.code !== "EEXIST") throw e;
        try {
          const st = fs.statSync(this.lockDir);
          if (Date.now() - st.mtimeMs > LOCK_STALE_MS) { fs.rmSync(this.lockDir, { recursive: true, force: true }); continue; }
        } catch { continue; }
        if (Date.now() - t0 > LOCK_WAIT_MS) throw new Error("work ledger is locked by another session; try again");
        sleepSync(25);
      }
    }
  }

  unlock() { try { fs.rmdirSync(this.lockDir); } catch { /* already gone */ } }

  /** Run fn(data) under the lock and save the result atomically. */
  update(fn) {
    this.lock();
    try {
      const data = this.read();
      const out = fn(data);
      prune(data);
      data.updatedAt = new Date().toISOString();
      const tmp = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
      fs.renameSync(tmp, this.file);
      return out;
    } finally {
      this.unlock();
    }
  }

  history(evt) {
    try {
      try { if (fs.statSync(this.historyFile).size > HISTORY_MAX) fs.renameSync(this.historyFile, this.historyFile + ".1"); } catch { /* none yet */ }
      fs.appendFileSync(this.historyFile, JSON.stringify({ at: new Date().toISOString(), ...evt }) + "\n");
    } catch { /* history is best effort */ }
  }

  error(msg) {
    try { fs.appendFileSync(this.errorsFile, `${new Date().toISOString()} ${msg}\n`); } catch { /* ignore */ }
  }
}

export function unitKey(repo, pr) { return `${repo || "?"}#${pr}`; }

export function ensureUnit(data, repo, pr) {
  const k = unitKey(repo, pr);
  if (!data.units[k]) data.units[k] = { repo: repo || null, pr, notes: [], reviews: [], merges: [], createdAt: new Date().toISOString() };
  const u = data.units[k];
  u.updatedAt = new Date().toISOString();
  return u;
}

export function prune(data, now = Date.now()) {
  const day = 86400000;
  data.approvals = (data.approvals || []).filter((a) => Date.parse(a.expiresAt) > now - day);
  data.pending = (data.pending || []).filter((p) => Date.parse(p.at) > now - day);
  data.validations = (data.validations || []).filter((v) => Date.parse(v.at) > now - 14 * day).slice(-300);
  for (const [k, u] of Object.entries(data.units || {})) {
    if (Date.parse(u.updatedAt || u.createdAt) < now - 45 * day) { delete data.units[k]; continue; }
    u.notes = (u.notes || []).slice(-20);
    u.reviews = (u.reviews || []).slice(-30);
    u.merges = (u.merges || []).slice(-10);
  }
}

export function activeApprovals(data, now = Date.now()) {
  return (data.approvals || []).filter((a) => Date.parse(a.expiresAt) > now && !a.usedAt);
}

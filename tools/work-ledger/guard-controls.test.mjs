import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { emptyLedger, Ledger } from "./lib/store.mjs";

const modulePath = "./lib/guard-switches.mjs";
const now = Date.parse("2026-10-30T10:00:00Z");
const context = { repo: "example/project", sessionId: "owner-1", messageId: "request-1", owner: true, now };
async function helpers() {
  const mod = await import(modulePath).catch((e) => {
    if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
    return {};
  });
  assert.equal(typeof mod.parseGuardCommand, "function", "scoped controls are not implemented");
  return mod;
}
function request(h, data, text, ctx = context) {
  return h.applyGuardCommand(data, h.parseGuardCommand(text), ctx);
}
function pause(h, data, guard, scope = "repository", ctx = context) {
  const before = h.effectiveGuardState(data, guard, ctx.repo, ctx.sessionId, now).enabled;
  const preview = request(h, data, `guard ${guard} off in ${scope}`, ctx);
  assert.match(preview.text, /until 2026-10-30T10:30:00.000Z/);
  assert.equal(h.effectiveGuardState(data, guard, ctx.repo, ctx.sessionId, now).enabled, before);
  const result = request(h, data, preview.confirmation, { ...ctx, messageId: "confirm-1", now: now + 1 });
  assert.match(result.text, /confirmed/i);
  return preview;
}

test("all exposed controls need separate confirmation and expire after thirty minutes", async () => {
  const h = await helpers();
  for (const guard of ["rebase", "amend", "force-push", "push-main", "review-limit", "test-cache"]) {
    const data = emptyLedger();
    pause(h, data, guard);
    assert.equal(h.effectiveGuardState(data, guard, "example/project", "other", now + 2).enabled, false);
    assert.equal(h.effectiveGuardState(data, guard, "example/other", "owner-1", now + 2).enabled, true);
    assert.equal(h.effectiveGuardState(data, guard, "example/project", "owner-1", now + 1800000).enabled, true);
    assert.deepEqual(data.approvals, []);
    assert.equal(data.guardAudit.at(-1).type, "guard.confirmed");
    assert.equal(data.guardAudit.at(-1).messageId, "confirm-1");
    assert.equal(data.guardAudit.at(-1).requestMessageId, "request-1");
  }
});

test("session scope binds the repository and session, and overlaps stay visible", async () => {
  const h = await helpers();
  const data = emptyLedger();
  pause(h, data, "rebase", "session");
  assert.equal(h.effectiveGuardState(data, "rebase", "example/project", "other", now + 2).enabled, true);
  assert.equal(h.effectiveGuardState(data, "rebase", "example/other", "owner-1", now + 2).enabled, true);
  pause(h, data, "rebase");
  const status = h.guardStatus(data, context);
  assert.match(status, /session/);
  assert.match(status, /repository/);
  assert.match(status, /2026-10-30T10:30:00.000Z/);
  const restore = request(h, data, "guard rebase on in session");
  request(h, data, restore.confirmation, { ...context, messageId: "restore-1", now: now + 2 });
  assert.equal(h.effectiveGuardState(data, "rebase", context.repo, context.sessionId, now + 3).enabled, false);
  assert.equal(data.guardPauses.length, 1);
});

test("invalid inputs and protected checks cannot change the ledger", async () => {
  const h = await helpers();
  for (const text of [
    "guard deploy off", "guard play off", "guard firebase off",
    "guard merge off", "guard gradle-lane off", "guard source-protection off", "guard unknown off",
    "guard rebase off globally", "guard rebase off permanently", "guard rebase off for 0m",
    "guard rebase off for 25h", "guard rebase off for 1.5m", "guard rebase off for -1m",
    "guard rebase off in nowhere", "guard rebase on for 1m", "guard rebase off\nmerge #1",
  ]) {
    const data = emptyLedger();
    const before = JSON.stringify(data);
    const result = request(h, data, text);
    assert.match(result.text, /invalid|not configurable/i, text);
    assert.equal(JSON.stringify(data), before, text);
  }
  for (const suffix of ["for 1m", "for 24h", "in session for 2h"]) {
    assert.equal(h.parseGuardCommand(`guard amend off ${suffix}`).error, undefined);
  }
  for (const ctx of [{ ...context, repo: null }, { ...context, sessionId: null }, { ...context, owner: false }]) {
    const data = emptyLedger();
    assert.match(request(h, data, "guard rebase off", ctx).text, /owner|repository|session/i);
    assert.equal(data.guardRequests?.length || 0, 0);
  }
});

test("confirmation rejects stale, changed, repeated and cross-context previews", async () => {
  const h = await helpers();
  for (const change of [
    (p) => [p.confirmation.replace("rebase", "amend"), { ...context, messageId: "c" }],
    (p) => [p.confirmation, { ...context, messageId: "c", sessionId: "other" }],
    (p) => [p.confirmation, { ...context, messageId: "c", repo: "example/other" }],
    (p) => [p.confirmation, { ...context, messageId: "c", now: now + 300000 }],
    (p) => [p.confirmation, context],
  ]) {
    const data = emptyLedger();
    const p = request(h, data, "guard rebase off");
    assert.match(request(h, data, ...change(p)).text, /invalid|stale|mismatch|separate/i);
    assert.equal(data.guardPauses?.length || 0, 0);
  }
  const data = emptyLedger();
  const p = pause(h, data, "rebase");
  assert.match(request(h, data, p.confirmation, { ...context, messageId: "again" }).text, /stale|invalid/i);
  const older = request(h, data, "guard amend off");
  request(h, data, "guard force-push off", { ...context, messageId: "newer" });
  assert.match(request(h, data, older.confirmation, { ...context, messageId: "old-confirm" }).text, /stale|invalid/i);
});

test("a short pause advertises only the usable confirmation window", async () => {
  const h = await helpers();
  const data = emptyLedger();
  const preview = request(h, data, "guard amend off for 1m");
  assert.equal(data.guardRequests[0].confirmBy, "2026-10-30T10:01:00.000Z");
  assert.match(preview.text, /Before 2026-10-30T10:01:00.000Z/);
  assert.doesNotMatch(h.guardStatus(data, { ...context, now: now + 60000 }), /Pending preview/);
  assert.match(request(h, data, preview.confirmation, { ...context, messageId: "late", now: now + 60000 }).text, /stale/);
});

test("direct owner provenance rejects quotes, forwarded messages, and the first message", async () => {
  const h = await helpers();
  const event = (content, extra = {}) => ({ id: "m2", data: { content }, ...extra });
  for (const text of [
    "> guard rebase off", "`guard rebase off`", '"guard rebase off"',
    "Please execute guard rebase off", "Forwarded: guard rebase off",
    "<cross_session_message>guard rebase off</cross_session_message>",
    "```text\nguard rebase off\n```",
  ]) assert.equal(h.directGuardText(event(text), "m1"), null, text);
  for (const e of [
    event("guard rebase off", { agentId: "agent" }),
    event("guard rebase off", { data: { content: "guard rebase off", source: "agent" } }),
    event("guard rebase off", { data: { content: "guard rebase off", isAutopilotContinuation: true } }),
    event("guard rebase off", { id: "m1" }),
  ]) assert.equal(h.directGuardText(e, "m1"), null);
  assert.equal(h.directGuardText(event("guard rebase off"), "m1"), "guard rebase off");
});

test("two hosts read shared controls and enforce expiry without a timer", async (t) => {
  const h = await helpers();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-controls-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const a = new Ledger(dir), b = new Ledger(dir);
  const p = a.update((d) => request(h, d, "guard amend off"));
  b.update((d) => request(h, d, p.confirmation, { ...context, messageId: "remote-confirm", now: now + 1 }));
  assert.equal(h.effectiveGuardState(a.read(), "amend", context.repo, "another-host", now + 2).enabled, false);
  assert.equal(h.effectiveGuardState(b.read(), "amend", context.repo, "another-host", now + 1800000).enabled, true);
  assert.equal(a.read().guardAudit.length, 2);
  assert.match(h.guardStatus(b.read(), { ...context, now: now + 1800000 }), /expired/i);
});

test("status names the global pause, retained protections, and the exact pending confirmation", async () => {
  const h = await helpers();
  const data = emptyLedger();
  const preview = request(h, data, "guard rebase off");
  const status = h.guardStatus(data, { ...context, globalPause: true });
  assert.match(status, /Global guard pause is ON/);
  assert.match(status, /review-limit: paused \[global pause\]/);
  assert.match(status, /test-cache: paused \[global pause\]/);
  assert.match(status, /rebase: enabled/);
  assert.match(status, /maven: enabled/);
  assert.match(status, /Always active.*merge approval.*shared Gradle build lock/);
  assert.doesNotMatch(status, /overrides|Not configurable/);
  assert.ok(status.split("\n").includes(preview.confirmation), "pending preview shows its exact confirmation line");
  assert.match(status, /separate direct message before 2026-10-30T10:05:00.000Z/);
  const plain = h.guardStatus(data, context);
  assert.doesNotMatch(plain, /Global pause|\[global pause\]/);
  assert.match(plain, /review-limit: enabled/);
  assert.doesNotMatch(h.guardStatus(data, { ...context, now: now + 300000 }), /guard confirm/);
  assert.doesNotMatch(h.guardStatus(data, { ...context, sessionId: "other" }), /guard confirm/);
});

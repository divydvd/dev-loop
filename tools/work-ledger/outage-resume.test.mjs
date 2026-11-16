import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildReconcilePrompt,
  classifyTransientOutage,
  detectAwayMode,
  markOutagePromptSent,
  planOutageResume,
  progressFingerprint,
  recordOutageProgress,
} from "./lib/outage-resume.mjs";
import { DEFAULT_CONFIG } from "./lib/policy.mjs";
import { emptyLedger, prune } from "./lib/store.mjs";
import { recordEvidence } from "./lib/units.mjs";

function makeWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-outage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  return root;
}

function writeAwayProgress(root, slug = "2026-11-16-demo", active = true) {
  const dir = path.join(root, ".superpowers", "sdd", slug);
  fs.mkdirSync(dir, { recursive: true });
  const progressPath = path.join(dir, "progress.md");
  const planPath = `docs/superpowers/plans/${slug}.md`;
  fs.writeFileSync(progressPath, [
    `# SDD ledger — plan: ${planPath}`,
    "## Absence mode",
    `active: ${active ? "true" : "false"}`,
    `| Mode | ${active ? "Active" : "Ended"} |`,
  ].join("\n") + "\n");
  return { progressPath, planPath };
}

test("classifyTransientOutage accepts genuine upstream and transport outages", () => {
  const transientInputs = [
    { status: 429, message: "Too Many Requests" },
    { statusCode: 502, message: "Bad Gateway" },
    { error: "HTTP 503 Service Unavailable", errorContext: "model_call" },
    { message: "Request failed with status code 504" },
    { errorType: "overloaded_error", message: "Upstream model overloaded" },
    { errorType: "rate_limit_error", message: "Rate limit exceeded" },
    { code: "ETIMEDOUT", message: "connect ETIMEDOUT" },
    { code: "ECONNRESET", message: "read ECONNRESET" },
    { code: "EAI_AGAIN", message: "getaddrinfo EAI_AGAIN api.githubcopilot.com" },
    { code: "UND_ERR_SOCKET", message: "other side closed" },
    { message: "TypeError: terminated: upstream stream disconnected" },
    { message: "socket hang up while streaming completion" },
  ];
  for (const input of transientInputs) {
    const res = classifyTransientOutage(input);
    assert.equal(res.transient, true, `expected transient for ${JSON.stringify(input)}`);
    assert.ok(res.code, `expected non-empty code for ${JSON.stringify(input)}`);
  }
});

test("classifyTransientOutage rejects auth, validation, context-overflow, guard-denial, cancel, and non-HTTP numbers", () => {
  const permanentInputs = [
    null,
    undefined,
    {},
    { status: 400, message: "Bad Request" },
    { status: 401, message: "Unauthorized" },
    { status: 403, message: "Forbidden" },
    { status: 404, message: "Not Found" },
    { statusCode: 422, message: "Unprocessable Entity" },
    { errorType: "context_length_exceeded", message: "prompt is too long: 210000 tokens > 200000 maximum" },
    { message: "[work-ledger] Merge is blocked without typed approval (HTTP 503 mentioned in log)" },
    { name: "AbortError", message: "The operation was aborted by user" },
    { message: "Request cancelled by user" },
    { message: "Test failed on PR #503 at localhost:5020" },
    { code: "ERR_ASSERTION", message: "Expected 200 to equal 502" },
  ];
  for (const input of permanentInputs) {
    const res = classifyTransientOutage(input);
    assert.equal(res.transient, false, `expected non-transient for ${JSON.stringify(input)}`);
  }
});

test("planOutageResume refuses to schedule retries when away mode is inactive", (t) => {
  const cwd = makeWorkspace(t);
  const data = emptyLedger();
  const res = planOutageResume(data, {
    sessionId: "sess-1",
    cwd,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: "1111111111111111111111111111111111111111",
    config: DEFAULT_CONFIG,
    now: Date.parse("2026-11-16T10:00:00Z"),
  });
  assert.equal(res.resume, false);
  assert.equal(res.reason, "away_mode_inactive");
  assert.equal(data.outageRecovery["sess-1"], undefined);

  writeAwayProgress(cwd, "2026-11-16-demo", false);
  const ended = planOutageResume(data, {
    sessionId: "sess-1",
    cwd,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: "1111111111111111111111111111111111111111",
    config: DEFAULT_CONFIG,
    now: Date.parse("2026-11-16T10:00:00Z"),
  });
  assert.equal(ended.resume, false);
  assert.equal(ended.reason, "away_mode_inactive");
});

test("detectAwayMode recognizes both nested checkout progress.md and away_mode ledger notes", (t) => {
  const root = makeWorkspace(t);
  const subDir = path.join(root, "packages", "core");
  fs.mkdirSync(subDir, { recursive: true });
  const { planPath } = writeAwayProgress(root, "2026-11-16-nested", true);

  const fromFiles = detectAwayMode({ cwd: subDir, data: emptyLedger(), sessionId: "s1" });
  assert.equal(fromFiles.active, true);
  assert.equal(fromFiles.planPath, planPath);

  const emptyRoot = makeWorkspace(t);
  const data = emptyLedger();
  recordEvidence(data, { repo: "acme/widget", pr: 9, kind: "note", text: "away_mode: active=true plan=docs/superpowers/plans/p.md", sessionId: "s2" });
  const fromLedger = detectAwayMode({ cwd: emptyRoot, data, sessionId: "s2" });
  assert.equal(fromLedger.active, true);
  assert.equal(fromLedger.planPath, "docs/superpowers/plans/p.md");

  recordEvidence(data, { repo: "acme/widget", pr: 9, kind: "note", text: "away_mode: active=false (owner returned)", sessionId: "s2" });
  assert.equal(detectAwayMode({ cwd: emptyRoot, data, sessionId: "s2" }).active, false);
});

test("planOutageResume schedules [30, 120, 300]s, deduplicates twin error events, and halts exhausted on failure 4", (t) => {
  const cwd = makeWorkspace(t);
  const { planPath } = writeAwayProgress(cwd, "2026-11-16-m5", true);
  const data = emptyLedger();
  const sha = "a".repeat(40);
  const baseNow = Date.parse("2026-11-16T12:00:00Z");

  const r1 = planOutageResume(data, {
    sessionId: "sess-away",
    cwd,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: sha,
    config: DEFAULT_CONFIG,
    now: baseNow,
  });
  assert.equal(r1.resume, true);
  assert.equal(r1.attempt, 1);
  assert.equal(r1.maxAttempts, 3);
  assert.equal(r1.delaySec, 30);
  assert.equal(r1.status, "retrying");
  assert.equal(data.outageRecovery["sess-away"].planPath, planPath);
  assert.equal(data.outageRecovery["sess-away"].attemptsUsed, 1);

  // Duplicate event from session.error while onErrorOccurred already marked "retrying".
  const dup = planOutageResume(data, {
    sessionId: "sess-away",
    cwd,
    error: { errorType: "overloaded_error", message: "HTTP 503 Service Unavailable" },
    headSha: sha,
    config: DEFAULT_CONFIG,
    now: baseNow + 20,
  });
  assert.equal(dup.resume, false);
  assert.equal(dup.deduplicated, true);
  assert.equal(data.outageRecovery["sess-away"].attemptsUsed, 1);

  markOutagePromptSent(data, "sess-away", baseNow + 30000);
  assert.equal(data.outageRecovery["sess-away"].status, "resumed");

  const r2 = planOutageResume(data, {
    sessionId: "sess-away",
    cwd,
    error: { code: "ECONNRESET", message: "read ECONNRESET" },
    headSha: sha,
    config: DEFAULT_CONFIG,
    now: baseNow + 35000,
  });
  assert.equal(r2.resume, true);
  assert.equal(r2.attempt, 2);
  assert.equal(r2.delaySec, 120);

  markOutagePromptSent(data, "sess-away", baseNow + 155000);

  const r3 = planOutageResume(data, {
    sessionId: "sess-away",
    cwd,
    error: { status: 429, message: "HTTP 429 Too Many Requests" },
    headSha: sha,
    config: DEFAULT_CONFIG,
    now: baseNow + 160000,
  });
  assert.equal(r3.resume, true);
  assert.equal(r3.attempt, 3);
  assert.equal(r3.delaySec, 300);

  markOutagePromptSent(data, "sess-away", baseNow + 460000);

  const r4 = planOutageResume(data, {
    sessionId: "sess-away",
    cwd,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: sha,
    config: DEFAULT_CONFIG,
    now: baseNow + 465000,
  });
  assert.equal(r4.resume, false);
  assert.equal(r4.reason, "retry_cap_exhausted");
  assert.equal(r4.status, "exhausted");
  assert.equal(r4.delaySec, null);
  assert.equal(data.outageRecovery["sess-away"].status, "exhausted");
  assert.equal(data.outageRecovery["sess-away"].attemptsUsed, 3);
});

test("recordOutageProgress resets attemptsUsed to 0 only after new commit SHA or ledger progress", (t) => {
  const cwd = makeWorkspace(t);
  writeAwayProgress(cwd, "2026-11-16-reset", true);
  const data = emptyLedger();
  const sha1 = "1".repeat(40);
  const sha2 = "2".repeat(40);
  const t0 = Date.parse("2026-11-16T14:00:00Z");

  planOutageResume(data, {
    sessionId: "sess-prog",
    cwd,
    error: { status: 502, message: "HTTP 502 Bad Gateway" },
    headSha: sha1,
    config: DEFAULT_CONFIG,
    now: t0,
  });
  markOutagePromptSent(data, "sess-prog", t0 + 30000);

  // Turn completes without new commit or new ledger progress -> must NOT reset attemptsUsed.
  assert.equal(recordOutageProgress(data, { sessionId: "sess-prog", headSha: sha1, now: t0 + 40000 }), false);
  assert.equal(data.outageRecovery["sess-prog"].attemptsUsed, 1);

  // New commit SHA advances progress -> resets attemptsUsed to 0.
  assert.equal(recordOutageProgress(data, { sessionId: "sess-prog", headSha: sha2, now: t0 + 50000 }), true);
  assert.equal(data.outageRecovery["sess-prog"].attemptsUsed, 0);
  assert.equal(data.outageRecovery["sess-prog"].status, "idle");

  // Trigger another outage at sha2, then record ledger evidence without changing SHA -> also resets attemptsUsed to 0.
  planOutageResume(data, {
    sessionId: "sess-prog",
    cwd,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: sha2,
    config: DEFAULT_CONFIG,
    now: t0 + 60000,
  });
  markOutagePromptSent(data, "sess-prog", t0 + 90000);
  const beforeFp = progressFingerprint(data);
  recordEvidence(data, { repo: "acme/widget", pr: 5, kind: "validated", sha: sha2, text: "node --test: 6 passed", sessionId: "sess-prog", now: new Date(t0 + 95000) });
  assert.notEqual(progressFingerprint(data), beforeFp);
  assert.equal(recordOutageProgress(data, { sessionId: "sess-prog", headSha: sha2, now: t0 + 96000 }), true);
  assert.equal(data.outageRecovery["sess-prog"].attemptsUsed, 0);
});

test("buildReconcilePrompt requires checking plan, progress ledger, git status, git log, and work_ledger_get before commands", () => {
  const prompt = buildReconcilePrompt({
    planPath: "docs/superpowers/plans/2026-11-16-m5.md",
    progressPath: ".superpowers/sdd/2026-11-16-m5/progress.md",
    attempt: 2,
    maxAttempts: 3,
    lastHeadSha: "abcdef1234567890abcdef1234567890abcdef12",
    code: "http_503",
  });
  assert.match(prompt, /docs\/superpowers\/plans\/2026-11-16-m5\.md/);
  assert.match(prompt, /\.superpowers\/sdd\/2026-11-16-m5\/progress\.md/);
  assert.match(prompt, /git status/);
  assert.match(prompt, /git log -n 5/);
  assert.match(prompt, /work_ledger_get/);
  assert.match(prompt, /before running any/i);
  assert.match(prompt, /never duplicate|do not repeat|do not duplicate/i);
});

test("prune removes stale outageRecovery records older than 14 days while keeping recent entries", () => {
  const now = Date.parse("2026-11-30T00:00:00Z");
  const data = emptyLedger();
  data.outageRecovery["stale"] = { sessionId: "stale", attemptsUsed: 2, lastOutageAt: "2026-11-01T00:00:00.000Z", status: "exhausted" };
  data.outageRecovery["corrupt"] = { sessionId: "corrupt", attemptsUsed: 1, lastOutageAt: "not-a-date", status: "retrying" };
  data.outageRecovery["missingTs"] = { sessionId: "missingTs", attemptsUsed: 1, status: "retrying" };
  data.outageRecovery["recent"] = { sessionId: "recent", attemptsUsed: 1, lastOutageAt: "2026-11-29T12:00:00.000Z", status: "retrying" };
  prune(data, now);
  assert.equal(data.outageRecovery["stale"], undefined);
  assert.equal(data.outageRecovery["corrupt"], undefined);
  assert.equal(data.outageRecovery["missingTs"], undefined);
  assert.ok(data.outageRecovery["recent"]);
});

test("reviewer regressions: classifier exclusions, strict away-mode markers, newest progress.md precedence, and per-session progress", (t) => {
  // Classifier rejects AssertionError strings, tool_execution context, and non-transient 4xx statuses with socket text.
  for (const sample of [
    { error: "AssertionError [ERR_ASSERTION]: Expected HTTP 503 Service Unavailable" },
    { name: "AssertionError", message: "Expected status code: 502" },
    { error: "HTTP 503 Service Unavailable", errorContext: "tool_execution" },
    { error: "ETIMEDOUT", errorContext: "user_input" },
    { status: 413, message: "Payload Too Large (write EPIPE)" },
    { status: 409, message: "Conflict (socket hang up)" },
  ]) {
    assert.equal(classifyTransientOutage(sample).transient, false, JSON.stringify(sample));
  }

  // Ordinary PR prose notes or notes from other sessions must NOT activate away mode.
  const emptyWs = makeWorkspace(t);
  const data = emptyLedger();
  recordEvidence(data, {
    repo: "acme/widget",
    pr: 9,
    kind: "note",
    text: "Opened PR for away-mode outage recovery on branch m5",
    sessionId: "sess-a",
    now: new Date("2026-11-16T10:00:00Z"),
  });
  assert.equal(detectAwayMode({ cwd: emptyWs, data, sessionId: "sess-a" }).active, false);

  recordEvidence(data, {
    repo: "acme/widget",
    pr: 9,
    kind: "note",
    text: "away_mode: active=true plan=docs/superpowers/plans/other.md",
    sessionId: "other-session",
    now: new Date("2026-11-16T10:01:00Z"),
  });
  assert.equal(detectAwayMode({ cwd: emptyWs, data, sessionId: "sess-a" }).active, false);

  // Narrative prose inside progress.md mentioning 'active: true' must NOT activate away mode,
  // and an ended newer progress.md must stop fallback to an older active progress.md.
  const ws = makeWorkspace(t);
  writeAwayProgress(ws, "2026-11-10-old", true);
  const oldFile = path.join(ws, ".superpowers/sdd/2026-11-10-old/progress.md");
  fs.utimesSync(oldFile, new Date("2026-11-10T00:00:00Z"), new Date("2026-11-10T00:00:00Z"));

  const currentDir = path.join(ws, ".superpowers/sdd/2026-11-16-current");
  fs.mkdirSync(currentDir, { recursive: true });
  const currentFile = path.join(currentDir, "progress.md");
  fs.writeFileSync(
    currentFile,
    "# SDD ledger — plan: docs/superpowers/plans/current.md\n| Mode | Ended |\nTask 1 note: verified guard stays active: true when config is malformed.\n"
  );
  fs.utimesSync(currentFile, new Date("2026-11-16T12:00:00Z"), new Date("2026-11-16T12:00:00Z"));
  assert.equal(detectAwayMode({ cwd: ws, data, sessionId: "sess-a" }).active, false);

  // Per-session progress isolation + status === "resumed" requirement before resetting attemptsUsed.
  const wsActive = makeWorkspace(t);
  writeAwayProgress(wsActive, "2026-11-16-iso", true);
  const sha = "a".repeat(40);
  const t0 = Date.parse("2026-11-16T15:00:00Z");
  planOutageResume(data, {
    sessionId: "sess-a",
    cwd: wsActive,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: null,
    config: DEFAULT_CONFIG,
    now: t0,
  });
  // While status is still "retrying" (prompt not yet sent), late gitHead resolution must NOT reset attemptsUsed.
  assert.equal(recordOutageProgress(data, { sessionId: "sess-a", headSha: sha, now: t0 + 100 }), false);
  assert.equal(data.outageRecovery["sess-a"].status, "retrying");

  markOutagePromptSent(data, "sess-a", t0 + 1000);
  data.outageRecovery["sess-a"].lastHeadSha = sha;
  data.outageRecovery["sess-a"].lastProgressFingerprint = progressFingerprint(data, "sess-a");

  // Unrelated session's evidence must NOT reset sess-a's attemptsUsed.
  recordEvidence(data, {
    repo: "acme/widget",
    pr: 10,
    kind: "validated",
    sha,
    text: "other session test run",
    sessionId: "sess-b",
    now: new Date(t0 + 2000),
  });
  assert.equal(recordOutageProgress(data, { sessionId: "sess-a", headSha: sha, now: t0 + 3000 }), false);
  assert.equal(data.outageRecovery["sess-a"].attemptsUsed, 1);
});

test("final review regressions: failing Gradle, null initial HEAD, mid-turn commits, and unified away timeline", (t) => {
  const ws = makeWorkspace(t);
  writeAwayProgress(ws, "2026-11-16-final", true);
  const progressFile = path.join(ws, ".superpowers/sdd/2026-11-16-final/progress.md");
  const t0 = Date.parse("2026-11-16T16:00:00Z");
  fs.utimesSync(progressFile, new Date(t0), new Date(t0));

  // 1. Failing Gradle runs, dirty runs, or duplicate passing runs on the same (sha, tasks) must NOT reset attemptsUsed,
  // and a null initial lastHeadSha must backfill on prompt send rather than falsely resetting on unchanged HEAD.
  const data = emptyLedger();
  const sha1 = "1".repeat(40);
  const sha2 = "2".repeat(40);
  data.validations.push({ sha: sha1, dirty: false, tasks: ":app:testDebugUnitTest", exit: 0, at: new Date(t0).toISOString(), sessionId: "s1" });

  planOutageResume(data, {
    sessionId: "s1",
    cwd: ws,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: null,
    config: DEFAULT_CONFIG,
    now: t0 + 1000,
  });
  markOutagePromptSent(data, "s1", t0 + 2000, sha1);
  assert.equal(data.outageRecovery.s1.lastHeadSha, sha1);

  // Failing Gradle run and re-run of the already-recorded clean (sha1, tasks) must NOT reset attemptsUsed.
  data.validations.push({ sha: sha1, dirty: false, tasks: ":app:lintDebug", exit: 1, at: new Date(t0 + 3000).toISOString(), sessionId: "s1" });
  data.validations.push({ sha: sha1, dirty: true, tasks: ":app:lintDebug", exit: 0, at: new Date(t0 + 3500).toISOString(), sessionId: "s1" });
  data.validations.push({ sha: sha1, dirty: false, tasks: ":app:testDebugUnitTest", exit: 0, at: new Date(t0 + 4000).toISOString(), sessionId: "s1" });
  assert.equal(recordOutageProgress(data, { sessionId: "s1", headSha: sha1, now: t0 + 5000 }), false);
  assert.equal(data.outageRecovery.s1.attemptsUsed, 1);

  // Also check when markOutagePromptSent had null headSha: observing sha1 later backfills lastHeadSha without resetting.
  const dataNullHead = emptyLedger();
  planOutageResume(dataNullHead, {
    sessionId: "s1",
    cwd: ws,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: null,
    config: DEFAULT_CONFIG,
    now: t0 + 1000,
  });
  markOutagePromptSent(dataNullHead, "s1", t0 + 2000, null);
  assert.equal(recordOutageProgress(dataNullHead, { sessionId: "s1", headSha: sha1, now: t0 + 3000 }), false);
  assert.equal(dataNullHead.outageRecovery.s1.attemptsUsed, 1);
  assert.equal(dataNullHead.outageRecovery.s1.lastHeadSha, sha1);

  // 2. Mid-turn Git commit (sha1 -> sha2) before a new outage strikes in the same turn MUST reset attemptsUsed inside planOutageResume.
  const cap1Config = { ...DEFAULT_CONFIG, outageRetryCap: 1, outageBackoffSec: [30] };
  const dataMidTurn = emptyLedger();
  const r1 = planOutageResume(dataMidTurn, {
    sessionId: "s1",
    cwd: ws,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: sha1,
    config: cap1Config,
    now: t0 + 1000,
  });
  assert.equal(r1.resume, true);
  assert.equal(r1.attempt, 1);
  markOutagePromptSent(dataMidTurn, "s1", t0 + 2000, sha1);
  // Mid-turn commit advances HEAD to sha2 before another 503 occurs without an intervening postToolUse reset.
  const r2 = planOutageResume(dataMidTurn, {
    sessionId: "s1",
    cwd: ws,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: sha2,
    config: cap1Config,
    now: t0 + 5000,
  });
  assert.equal(r2.resume, true);
  assert.equal(r2.attempt, 1);

  // 3. Subagent / checkpoint error events are rejected by classifyTransientOutage, and recordOutageProgress
  // resets attemptsUsed after status "cancelled" or "exhausted" once real HEAD or ledger progress occurs.
  assert.equal(classifyTransientOutage({ agentId: "sub-1", data: { message: "HTTP 503 Service Unavailable" } }).transient, false);
  assert.equal(classifyTransientOutage({ checkpoint: true, data: { message: "HTTP 503 Service Unavailable" } }).transient, false);

  const dataExh = emptyLedger();
  const exhRes = planOutageResume(dataExh, {
    sessionId: "s1",
    cwd: ws,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: sha1,
    config: cap1Config,
    now: t0 + 1000,
  });
  assert.equal(exhRes.resume, true);
  markOutagePromptSent(dataExh, "s1", t0 + 2000, sha1);
  const exhRes2 = planOutageResume(dataExh, {
    sessionId: "s1",
    cwd: ws,
    error: { status: 503, message: "HTTP 503 Service Unavailable" },
    headSha: sha1,
    config: cap1Config,
    now: t0 + 3000,
  });
  assert.equal(exhRes2.status, "exhausted");
  assert.equal(recordOutageProgress(dataExh, { sessionId: "s1", headSha: sha2, now: t0 + 4000 }), true);
  assert.equal(dataExh.outageRecovery.s1.attemptsUsed, 0);

  // 4. Newer ledger note "away_mode: active=false" overrides an older progress.md with active: true.
  recordEvidence(data, {
    repo: "acme/widget",
    pr: 99,
    kind: "note",
    text: "away_mode: active=false (completed)",
    sessionId: "s1",
    now: new Date(t0 + 10000),
  });
  assert.equal(detectAwayMode({ cwd: ws, data, sessionId: "s1" }).active, false);
});


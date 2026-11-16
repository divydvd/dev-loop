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
  data.outageRecovery["recent"] = { sessionId: "recent", attemptsUsed: 1, lastOutageAt: "2026-11-29T12:00:00.000Z", status: "retrying" };
  prune(data, now);
  assert.equal(data.outageRecovery["stale"], undefined);
  assert.ok(data.outageRecovery["recent"]);
});

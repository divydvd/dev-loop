import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseCostSession,
  attributeCostChains,
  fetchRepoActionsCost,
  buildCostDashboardReport,
  renderCostDashboardHtml,
  formatCostMarkdown,
  runCli,
} from "./cost-dashboard.mjs";

function makeTempSessionsDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "cost-dash-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeSession(sessionsDir, id, workspaceFields, events) {
  const folder = join(sessionsDir, id);
  mkdirSync(folder, { recursive: true });
  const wsLines = [`id: ${id}`, ...Object.entries(workspaceFields).map(([k, v]) => `${k}: ${v}`)];
  writeFileSync(join(folder, "workspace.yaml"), `${wsLines.join("\n")}\n`, "utf8");
  const evLines = events.map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
  writeFileSync(join(folder, "events.jsonl"), `${evLines.join("\n")}\n`, "utf8");
  return { wsPath: join(folder, "workspace.yaml"), evPath: join(folder, "events.jsonl") };
}

test("T1: parseCostSession keeps latest valid accountingSnapshot and preserves null PRU when snapshot is absent", (t) => {
  const dir = makeTempSessionsDir(t);
  const s1 = writeSession(
    dir,
    "11111111-1111-1111-1111-111111111111",
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T10:00:00.000Z" },
    [
      {
        type: "session.usage_checkpoint",
        timestamp: "2026-11-20T10:05:00.000Z",
        data: {
          totalNanoAiu: 10_000_000_000,
          accountingSnapshot: {
            totalUserRequests: 2,
            totalPremiumRequestCost: 10,
            totalNanoAiu: 10_000_000_000,
            totalApiDurationMs: 4000,
            tokenDetails: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, cacheWriteTokens: 100 },
            modelMetrics: {},
            agentMetrics: {},
          },
        },
      },
      {
        type: "session.usage_checkpoint",
        timestamp: "2026-11-20T10:15:00.000Z",
        data: {
          totalNanoAiu: 25_000_000_000,
          accountingSnapshot: {
            totalUserRequests: 5,
            totalPremiumRequestCost: 25,
            totalNanoAiu: 25_000_000_000,
            totalApiDurationMs: 9500,
            tokenDetails: { inputTokens: 3000, outputTokens: 600, cacheReadTokens: 1200, cacheWriteTokens: 300 },
            modelMetrics: {},
            agentMetrics: {},
          },
        },
      },
      // Trailing shutdown without accountingSnapshot must NOT overwrite the valid 25-PRU checkpoint.
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T10:20:00.000Z",
        data: { totalNanoAiu: 25_000_000_000 },
      },
    ],
  );

  const parsed1 = parseCostSession("11111111-1111-1111-1111-111111111111", s1.wsPath, s1.evPath, { pruUsd: 0.04 });
  assert.equal(parsed1.pruAttribution, "exact");
  assert.equal(parsed1.pruCost, 25);
  assert.equal(parsed1.usdCost, 1.0);
  assert.equal(parsed1.userRequests, 5);
  assert.equal(parsed1.totalNanoAiu, 25_000_000_000);
  assert.equal(parsed1.totalApiDurationMs, 9500);
  assert.deepEqual(parsed1.tokenDetails, {
    inputTokens: 3000,
    outputTokens: 600,
    cacheReadTokens: 1200,
    cacheWriteTokens: 300,
  });

  // Real Copilot CLI nested accountingSnapshot schema: tokenDetails.*.tokenCount, modelMetrics.*.totalNanoAiu,
  // and agentMetrics[id].modelMetrics[model].requests + agentMetrics[id].totalNanoAiu.
  const sReal = writeSession(
    dir,
    "12121212-1212-1212-1212-121212121212",
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T12:00:00.000Z" },
    [
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T12:10:00.000Z",
        data: {
          accountingSnapshot: {
            totalPremiumRequestCost: 6,
            totalUserRequests: 6,
            totalNanoAiu: 100_000_000_000,
            totalApiDurationMs: 510_644,
            tokenDetails: {
              input: { tokenCount: 108 },
              cache_read: { tokenCount: 3_402_304 },
              cache_write: { tokenCount: 172_144 },
              output: { tokenCount: 19_805 },
            },
            modelMetrics: {
              "gpt-6.1-sol": {
                requests: { count: 36, cost: 6 },
                usage: { inputTokens: 3_574_556, outputTokens: 19_805, cacheReadTokens: 3_402_304, cacheWriteTokens: 172_144 },
                totalNanoAiu: 100_000_000_000,
              },
            },
            agentMetrics: {
              main: {
                totalNanoAiu: 75_000_000_000,
                modelMetrics: { "gpt-6.1-sol": { requests: { count: 22, cost: 6 } } },
              },
              "3748ef9f-b6db-42f4-a36e-ee400f140672": {
                agentName: "code-review",
                agentDisplayName: "Step 5 review",
                totalNanoAiu: 25_000_000_000,
                modelMetrics: { "gpt-6.1-sol": { requests: { count: 14, cost: 0 } } },
              },
            },
          },
        },
      },
    ],
  );
  const parsedReal = parseCostSession("12121212-1212-1212-1212-121212121212", sReal.wsPath, sReal.evPath, { pruUsd: 0.04 });
  assert.deepEqual(parsedReal.tokenDetails, {
    inputTokens: 108,
    outputTokens: 19_805,
    cacheReadTokens: 3_402_304,
    cacheWriteTokens: 172_144,
  });
  assert.equal(parsedReal.models["gpt-6.1-sol"].nanoAiu, 100_000_000_000);
  assert.equal(parsedReal.models["gpt-6.1-sol"].multiplier, 1); // 6 PRU / 6 user turns, NOT 6 / 36 API calls!
  assert.deepEqual(parsedReal.agentBuckets.main, { requests: 22, pruCost: 6, nanoAiu: 75_000_000_000 });
  assert.deepEqual(parsedReal.agentBuckets.review, { requests: 14, pruCost: 0, nanoAiu: 25_000_000_000 });

  // Legacy session without accountingSnapshot keeps totalNanoAiu and marks PRU unavailable (null, never 0).
  const s2 = writeSession(
    dir,
    "22222222-2222-2222-2222-222222222222",
    { repository: "divydvd/dev-loop", created_at: "2026-10-01T10:00:00.000Z" },
    [
      {
        type: "session.shutdown",
        timestamp: "2026-10-01T10:10:00.000Z",
        data: { totalNanoAiu: 14_500_000_000 },
      },
    ],
  );

  const parsed2 = parseCostSession("22222222-2222-2222-2222-222222222222", s2.wsPath, s2.evPath, { pruUsd: 0.04 });
  assert.equal(parsed2.pruAttribution, "snapshot_unavailable");
  assert.equal(parsed2.pruCost, null);
  assert.equal(parsed2.usdCost, null);
  assert.equal(parsed2.totalNanoAiu, 14_500_000_000);
});

test("T2: parseCostSession computes model multipliers and classifies main, review, and otherSubagents", (t) => {
  const dir = makeTempSessionsDir(t);
  const s = writeSession(
    dir,
    "33333333-3333-3333-3333-333333333333",
    { repository: "divydvd/dev-loop", created_at: "2026-11-21T10:00:00.000Z" },
    [
      {
        type: "session.shutdown",
        timestamp: "2026-11-21T10:30:00.000Z",
        data: {
          accountingSnapshot: {
            totalUserRequests: 6,
            totalPremiumRequestCost: 34,
            totalNanoAiu: 34_000_000_000,
            totalApiDurationMs: 12000,
            modelMetrics: {
              "claude-opus-5.5": {
                requests: { count: 2, cost: 30, nanoAiu: 30_000_000_000 },
                usage: { inputTokens: 8000, outputTokens: 1500, cacheReadTokens: 4000, cacheWriteTokens: 500 },
              },
              "gpt-6.1-sol": {
                requests: { count: 4, cost: 4, nanoAiu: 4_000_000_000 },
                usage: { inputTokens: 6000, outputTokens: 900, cacheReadTokens: 3000, cacheWriteTokens: 200 },
              },
            },
            agentMetrics: {
              main: {
                agentName: "main",
                agentDisplayName: "Main Agent",
                requests: { count: 3, cost: 16, nanoAiu: 16_000_000_000 },
              },
              "agent-rev-1": {
                agentName: "code-review",
                agentDisplayName: "Code Reviewer",
                requests: { count: 1, cost: 15, nanoAiu: 15_000_000_000 },
              },
              "agent-rev-2": {
                agentName: "general-purpose",
                agentDisplayName: "skeptic-judge",
                requests: { count: 1, cost: 2, nanoAiu: 2_000_000_000 },
              },
              "agent-exp-1": {
                agentName: "explore",
                agentDisplayName: "Repo Explorer",
                requests: { count: 1, cost: 1, nanoAiu: 1_000_000_000 },
              },
            },
          },
        },
      },
    ],
  );

  const parsed = parseCostSession("33333333-3333-3333-3333-333333333333", s.wsPath, s.evPath, { pruUsd: 0.04 });
  assert.equal(parsed.models["claude-opus-5.5"].multiplier, 15);
  assert.equal(parsed.models["claude-opus-5.5"].pruCost, 30);
  assert.equal(parsed.models["gpt-6.1-sol"].multiplier, 1);
  assert.equal(parsed.models["gpt-6.1-sol"].pruCost, 4);
  assert.deepEqual(parsed.agentBuckets, {
    main: { requests: 3, pruCost: 16, nanoAiu: 16_000_000_000 },
    review: { requests: 2, pruCost: 17, nanoAiu: 17_000_000_000 },
    otherSubagents: { requests: 1, pruCost: 1, nanoAiu: 1_000_000_000 },
  });
});

test("T3: attributeCostChains rolls up exclusive 1:1 kickoff parents, isolates multi-spawn coordinators, and breaks cycles", (t) => {
  const dir = makeTempSessionsDir(t);
  const parentExclusive = "aaaa1111-1111-1111-1111-111111111111";
  const childPr10 = "bbbb2222-2222-2222-2222-222222222222";
  const parentShared = "cccc3333-3333-3333-3333-333333333333";
  const childPr11 = "dddd4444-4444-4444-4444-444444444444";
  const cycA = "eeee5555-5555-5555-5555-555555555555";
  const cycB = "ffff6666-6666-6666-6666-666666666666";

  // 1:1 parent used open_issue_session returning a wrapper UUID different from childPr10,
  // while childPr10's first user.message carries source: agent-<parentExclusive>.
  writeSession(
    dir,
    parentExclusive,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T09:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T09:00:05.000Z", data: { content: "Plan issue 5" } },
      { type: "tool.execution_start", timestamp: "2026-11-20T09:05:00.000Z", data: { toolCallId: "tc-1", toolName: "open_issue_session", arguments: {} } },
      {
        type: "tool.execution_complete",
        timestamp: "2026-11-20T09:05:02.000Z",
        data: { toolCallId: "tc-1", success: true, result: "Opened session ghapp://sessions/99990000-0000-0000-0000-000000000001" },
      },
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T09:06:00.000Z",
        data: { accountingSnapshot: { totalUserRequests: 2, totalPremiumRequestCost: 8, totalNanoAiu: 8_000_000_000, modelMetrics: {}, agentMetrics: {} } },
      },
    ],
  );

  writeSession(
    dir,
    childPr10,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T09:05:03.000Z" },
    [
      {
        type: "user.message",
        timestamp: "2026-11-20T09:05:04.000Z",
        data: { content: "Implement issue 5", source: `agent-${parentExclusive}` },
      },
      {
        type: "assistant.message",
        timestamp: "2026-11-20T09:20:00.000Z",
        data: { content: "Opened https://github.com/divydvd/dev-loop/pull/10" },
      },
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T09:25:00.000Z",
        data: { accountingSnapshot: { totalUserRequests: 4, totalPremiumRequestCost: 12, totalNanoAiu: 12_000_000_000, modelMetrics: {}, agentMetrics: {} } },
      },
    ],
  );

  // Shared parent called open_issue_session twice (second child missing from disk) -> spawnedChildCount === 2.
  writeSession(
    dir,
    parentShared,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T11:00:00.000Z" },
    [
      { type: "tool.execution_start", timestamp: "2026-11-20T11:01:00.000Z", data: { toolCallId: "tc-a", toolName: "open_issue_session", arguments: {} } },
      { type: "tool.execution_complete", timestamp: "2026-11-20T11:01:01.000Z", data: { toolCallId: "tc-a", success: true, result: "ghapp://sessions/99990000-0000-0000-0000-000000000002" } },
      { type: "tool.execution_start", timestamp: "2026-11-20T11:02:00.000Z", data: { toolCallId: "tc-b", toolName: "open_issue_session", arguments: {} } },
      { type: "tool.execution_complete", timestamp: "2026-11-20T11:02:01.000Z", data: { toolCallId: "tc-b", success: true, result: "ghapp://sessions/99990000-0000-0000-0000-000000000003" } },
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T11:10:00.000Z",
        data: { accountingSnapshot: { totalUserRequests: 3, totalPremiumRequestCost: 15, totalNanoAiu: 15_000_000_000, modelMetrics: {}, agentMetrics: {} } },
      },
    ],
  );

  // Later cross-session ping from parentExclusive to childPr11 must NOT override childPr11's kickoff parent!
  writeSession(
    dir,
    childPr11,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T11:01:05.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T11:01:06.000Z", data: { content: "Implement issue 6", source: `agent-${parentShared}` } },
      { type: "user.message", timestamp: "2026-11-20T11:05:00.000Z", data: { content: "Status check", source: `agent-${parentExclusive}` } },
      { type: "assistant.message", timestamp: "2026-11-20T11:20:00.000Z", data: { content: "Opened https://github.com/divydvd/dev-loop/pull/11" } },
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T11:25:00.000Z",
        data: { accountingSnapshot: { totalUserRequests: 3, totalPremiumRequestCost: 9, totalNanoAiu: 9_000_000_000, modelMetrics: {}, agentMetrics: {} } },
      },
    ],
  );

  // Synthetic parent cycle cycA <-> cycB must terminate without throwing.
  writeSession(
    dir,
    cycA,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T12:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T12:00:01.000Z", data: { content: "From B", source: `agent-${cycB}` } },
      { type: "session.shutdown", timestamp: "2026-11-20T12:05:00.000Z", data: { accountingSnapshot: { totalUserRequests: 1, totalPremiumRequestCost: 3, totalNanoAiu: 3_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );
  writeSession(
    dir,
    cycB,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T12:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T12:00:02.000Z", data: { content: "From A", source: `agent-${cycA}` } },
      { type: "assistant.message", timestamp: "2026-11-20T12:04:00.000Z", data: { content: "Opened https://github.com/divydvd/dev-loop/pull/12" } },
      { type: "session.shutdown", timestamp: "2026-11-20T12:06:00.000Z", data: { accountingSnapshot: { totalUserRequests: 2, totalPremiumRequestCost: 5, totalNanoAiu: 5_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  const prsByRepo = {
    "divydvd/dev-loop": [
      { number: 10, title: "Feat 10", url: "https://github.com/divydvd/dev-loop/pull/10", createdAt: "2026-11-20T09:19:00.000Z", mergedAt: "2026-11-20T09:30:00.000Z", files: [{ path: "scripts/a.mjs", additions: 20, deletions: 2 }] },
      { number: 11, title: "Feat 11", url: "https://github.com/divydvd/dev-loop/pull/11", createdAt: "2026-11-20T11:19:00.000Z", mergedAt: "2026-11-20T11:30:00.000Z", files: [{ path: "scripts/b.mjs", additions: 15, deletions: 1 }] },
      { number: 12, title: "Feat 12", url: "https://github.com/divydvd/dev-loop/pull/12", createdAt: "2026-11-20T12:03:00.000Z", mergedAt: "2026-11-20T12:10:00.000Z", files: [{ path: "scripts/c.mjs", additions: 10, deletions: 0 }] },
    ],
  };

  const res = attributeCostChains({
    prsByRepo,
    repos: ["divydvd/dev-loop"],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
  });

  const pr10 = res.prRows.find((r) => r.prKey === "divydvd/dev-loop#10");
  assert.equal(pr10.attribution, "unique");
  assert.equal(pr10.ideationAttribution, "exclusive_parent");
  assert.equal(pr10.directPruCost, 12);
  assert.equal(pr10.chainPruCost, 20);
  assert.equal(pr10.chainUsdCost, 0.8);
  assert.deepEqual(pr10.exclusiveAncestorIds, [parentExclusive]);

  const pr11 = res.prRows.find((r) => r.prKey === "divydvd/dev-loop#11");
  assert.equal(pr11.ideationAttribution, "shared_parent_unallocated");
  assert.equal(pr11.directPruCost, 9);
  assert.equal(pr11.chainPruCost, 9);
  assert.ok(res.unattributed.sharedCoordinators.some((s) => s.sessionId === parentShared && s.pruCost === 15));

  const pr12 = res.prRows.find((r) => r.prKey === "divydvd/dev-loop#12");
  assert.equal(pr12.directPruCost, 5);
  assert.equal(pr12.chainPruCost, 5);
  assert.ok(res.unattributed.sharedCoordinators.some((s) => s.sessionId === cycA));
});

test("T4: attributeCostChains handles mixed-age snapshot_unavailable parent, shared multi-PR sessions, and unmatched PRs", (t) => {
  const dir = makeTempSessionsDir(t);
  const oldParent = "10101010-1111-1111-1111-111111111111";
  const newChild = "20202020-2222-2222-2222-222222222222";
  const multiPrSess = "30303030-3333-3333-3333-333030303030";

  writeSession(
    dir,
    oldParent,
    { repository: "divydvd/dev-loop", created_at: "2026-10-15T10:00:00.000Z" },
    [
      { type: "tool.execution_start", timestamp: "2026-10-15T10:02:00.000Z", data: { toolCallId: "tc-old", toolName: "create_session", arguments: {} } },
      { type: "tool.execution_complete", timestamp: "2026-10-15T10:02:02.000Z", data: { toolCallId: "tc-old", success: true, result: `id: ${newChild}` } },
      { type: "session.shutdown", timestamp: "2026-10-15T10:05:00.000Z", data: { totalNanoAiu: 6_000_000_000 } },
    ],
  );

  writeSession(
    dir,
    newChild,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T10:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T10:00:01.000Z", data: { content: "Build feature", source: `agent-${oldParent}` } },
      { type: "assistant.message", timestamp: "2026-11-20T10:20:00.000Z", data: { content: "Created https://github.com/divydvd/dev-loop/pull/20" } },
      { type: "session.shutdown", timestamp: "2026-11-20T10:25:00.000Z", data: { accountingSnapshot: { totalUserRequests: 4, totalPremiumRequestCost: 12, totalNanoAiu: 12_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  writeSession(
    dir,
    multiPrSess,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T13:00:00.000Z" },
    [
      { type: "assistant.message", timestamp: "2026-11-20T13:10:00.000Z", data: { content: "Opened https://github.com/divydvd/dev-loop/pull/21 and https://github.com/divydvd/dev-loop/pull/22" } },
      { type: "session.shutdown", timestamp: "2026-11-20T13:30:00.000Z", data: { accountingSnapshot: { totalUserRequests: 5, totalPremiumRequestCost: 18, totalNanoAiu: 18_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  const prsByRepo = {
    "divydvd/dev-loop": [
      { number: 20, title: "Mixed age", url: "https://github.com/divydvd/dev-loop/pull/20", createdAt: "2026-11-20T10:19:00.000Z", mergedAt: "2026-11-20T10:30:00.000Z", files: [{ path: "scripts/x.mjs", additions: 10, deletions: 0 }] },
      { number: 21, title: "Shared A", url: "https://github.com/divydvd/dev-loop/pull/21", createdAt: "2026-11-20T13:11:00.000Z", mergedAt: "2026-11-20T13:40:00.000Z", files: [{ path: "scripts/y.mjs", additions: 10, deletions: 0 }] },
      { number: 22, title: "Shared B", url: "https://github.com/divydvd/dev-loop/pull/22", createdAt: "2026-11-20T13:12:00.000Z", mergedAt: "2026-11-20T13:45:00.000Z", files: [{ path: "scripts/z.mjs", additions: 10, deletions: 0 }] },
      { number: 23, title: "Manual PR", url: "https://github.com/divydvd/dev-loop/pull/23", createdAt: "2026-11-20T14:00:00.000Z", mergedAt: "2026-11-20T14:15:00.000Z", files: [{ path: "README.md", additions: 2, deletions: 0 }] },
    ],
  };

  const res = attributeCostChains({
    prsByRepo,
    repos: ["divydvd/dev-loop"],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
  });

  const pr20 = res.prRows.find((r) => r.prKey === "divydvd/dev-loop#20");
  assert.equal(pr20.ideationAttribution, "exclusive_parent");
  assert.equal(pr20.directPruCost, 12);
  assert.equal(pr20.chainPruCost, null);
  assert.equal(pr20.chainUsdCost, null);
  assert.equal(pr20.chainPruStatus, "partial_parent_snapshot_unavailable");
  assert.equal(pr20.chainNanoAiu, 18_000_000_000);

  const pr21 = res.prRows.find((r) => r.prKey === "divydvd/dev-loop#21");
  assert.equal(pr21.attribution, "ambiguous");
  assert.equal(pr21.directPruCost, null);
  assert.equal(pr21.chainPruCost, null);
  assert.equal(res.unattributed.sharedPrSessions.length, 1);
  assert.equal(res.unattributed.sharedPrSessions[0].pruCost, 18);

  const pr23 = res.prRows.find((r) => r.prKey === "divydvd/dev-loop#23");
  assert.equal(pr23.attribution, "unmatched_non_copilot_or_missing_session");
  assert.deepEqual(res.unattributed.unmatchedPrKeys, ["divydvd/dev-loop#23"]);
});

test("T5: attributeCostChains retains pre-window exclusive parent for in-window PR and scopes repo-less standalone chats", (t) => {
  const dir = makeTempSessionsDir(t);
  const preWindowParent = "40404040-1111-1111-1111-111111111111";
  const inWindowChild = "50505050-2222-2222-2222-222222222222";
  const standaloneChat = "60606060-3333-3333-3333-333333333333";
  const repoUnmerged = "70707070-4444-4444-4444-444444444444";

  writeSession(
    dir,
    preWindowParent,
    { created_at: "2026-11-10T08:00:00.000Z" }, // even repo-less parent chat exclusively kicking off child PR rolls into that PR!
    [
      { type: "tool.execution_start", timestamp: "2026-11-10T08:05:00.000Z", data: { toolCallId: "tc-pre", toolName: "create_session", arguments: {} } },
      { type: "tool.execution_complete", timestamp: "2026-11-10T08:05:01.000Z", data: { toolCallId: "tc-pre", success: true, result: `id: ${inWindowChild}` } },
      { type: "session.shutdown", timestamp: "2026-11-10T08:06:00.000Z", data: { accountingSnapshot: { totalUserRequests: 2, totalPremiumRequestCost: 6, totalNanoAiu: 6_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  writeSession(
    dir,
    inWindowChild,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T09:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T09:00:01.000Z", data: { content: "Run", source: `agent-${preWindowParent}` } },
      { type: "assistant.message", timestamp: "2026-11-20T09:15:00.000Z", data: { content: "Opened https://github.com/divydvd/dev-loop/pull/30" } },
      { type: "session.shutdown", timestamp: "2026-11-20T09:20:00.000Z", data: { accountingSnapshot: { totalUserRequests: 3, totalPremiumRequestCost: 14, totalNanoAiu: 14_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  writeSession(
    dir,
    standaloneChat,
    { created_at: "2026-11-20T12:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T12:00:01.000Z", data: { content: "General question" } },
      { type: "session.shutdown", timestamp: "2026-11-20T12:05:00.000Z", data: { accountingSnapshot: { totalUserRequests: 1, totalPremiumRequestCost: 5, totalNanoAiu: 5_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  writeSession(
    dir,
    repoUnmerged,
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T15:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T15:00:01.000Z", data: { content: "WIP exploration" } },
      { type: "session.shutdown", timestamp: "2026-11-20T15:10:00.000Z", data: { accountingSnapshot: { totalUserRequests: 2, totalPremiumRequestCost: 7, totalNanoAiu: 7_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  const prsByRepo = {
    "divydvd/dev-loop": [
      { number: 30, title: "Window PR", url: "https://github.com/divydvd/dev-loop/pull/30", createdAt: "2026-11-20T09:14:00.000Z", mergedAt: "2026-11-20T09:30:00.000Z", files: [{ path: "scripts/w.mjs", additions: 12, deletions: 2 }] },
    ],
  };

  const scoped = attributeCostChains({
    prsByRepo,
    repos: ["divydvd/dev-loop"],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
  });

  const pr30 = scoped.prRows.find((r) => r.prKey === "divydvd/dev-loop#30");
  assert.equal(pr30.chainPruCost, 20); // 14 child + 6 pre-window exclusive parent
  assert.equal(scoped.unattributed.unmergedSessions.length, 1);
  assert.equal(scoped.unattributed.unmergedSessions[0].sessionId, repoUnmerged);
  assert.equal(scoped.unattributed.unscopedChatSpend.sessionCount, 1);
  assert.equal(scoped.unattributed.unscopedChatSpend.pruCost, 5);
  assert.equal(scoped.totals.scopedTotalPru, 27); // 20 (PR#30 chain) + 7 (repoUnmerged); excludes 5 unscoped chat!

  const workspaceWide = attributeCostChains({
    prsByRepo,
    repos: [],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
  });
  assert.equal(workspaceWide.totals.scopedTotalPru, 32); // includes 5 unscoped chat when repos filter is empty
});

test("T6: buildCostDashboardReport keeps colliding PR numbers distinct across repos, rolls up route medians, and computes 1x-cap simulator baseline", (t) => {
  const dir = makeTempSessionsDir(t);
  writeSession(
    dir,
    "80808080-1111-1111-1111-111111111111",
    { repository: "org/a", created_at: "2026-11-20T10:00:00.000Z" },
    [
      { type: "assistant.turn_start", timestamp: "2026-11-20T10:00:00.000Z", data: { turnId: "1" } },
      { type: "assistant.message", timestamp: "2026-11-20T10:00:10.000Z", data: { turnId: "1", model: "gpt-6.1-sol", content: "Opened https://github.com/org/a/pull/12" } },
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T10:00:15.000Z",
        data: {
          accountingSnapshot: {
            totalUserRequests: 10,
            totalPremiumRequestCost: 10,
            totalNanoAiu: 10_000_000_000,
            modelMetrics: { "gpt-6.1-sol": { requests: { count: 10, cost: 10, nanoAiu: 10_000_000_000 }, usage: { inputTokens: 2000, outputTokens: 400 } } },
            agentMetrics: { main: { agentName: "main", requests: { count: 10, cost: 10, nanoAiu: 10_000_000_000 } } },
          },
        },
      },
    ],
  );

  writeSession(
    dir,
    "80808080-2222-2222-2222-222222222222",
    { repository: "org/b", created_at: "2026-11-20T11:00:00.000Z" },
    [
      { type: "assistant.turn_start", timestamp: "2026-11-20T11:00:00.000Z", data: { turnId: "1" } },
      { type: "assistant.message", timestamp: "2026-11-20T11:00:30.000Z", data: { turnId: "1", model: "claude-opus-5.5", content: "Opened https://github.com/org/b/pull/12" } },
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T11:00:35.000Z",
        data: {
          accountingSnapshot: {
            totalUserRequests: 2,
            totalPremiumRequestCost: 30,
            totalNanoAiu: 30_000_000_000,
            modelMetrics: {
              "claude-opus-5.5": { requests: { count: 24, cost: 30 }, totalNanoAiu: 30_000_000_000, usage: { inputTokens: 5000, outputTokens: 1000 } },
            },
            agentMetrics: {
              main: { totalNanoAiu: 15_000_000_000, modelMetrics: { "claude-opus-5.5": { requests: { count: 16, cost: 30 } } } },
              rev: { agentName: "code-review", totalNanoAiu: 15_000_000_000, modelMetrics: { "claude-opus-5.5": { requests: { count: 8, cost: 0 } } } },
            },
          },
        },
      },
    ],
  );

  // Add a 0x-model unmerged session in org/a (10 user turns, 0 PRU): 0x sessions must NOT cancel out org/b's 15x excess!
  writeSession(
    dir,
    "80808080-3333-3333-3333-333333333333",
    { repository: "org/a", created_at: "2026-11-20T11:30:00.000Z" },
    [
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T11:35:00.000Z",
        data: {
          accountingSnapshot: {
            totalUserRequests: 10,
            totalPremiumRequestCost: 0,
            totalNanoAiu: 2_000_000_000,
            modelMetrics: { "gpt-6-luna": { requests: { count: 25, cost: 0 }, totalNanoAiu: 2_000_000_000, usage: { inputTokens: 800, outputTokens: 200 } } },
            agentMetrics: { main: { totalNanoAiu: 2_000_000_000, modelMetrics: { "gpt-6-luna": { requests: { count: 25, cost: 0 } } } } },
          },
        },
      },
    ],
  );

  const prsByRepo = {
    "org/a": [
      { number: 12, title: "Small A", url: "https://github.com/org/a/pull/12", createdAt: "2026-11-20T10:00:09.000Z", mergedAt: "2026-11-20T10:05:00.000Z", files: [{ path: "src/a.mjs", additions: 20, deletions: 5 }] },
    ],
    "org/b": [
      { number: 12, title: "Multi B", url: "https://github.com/org/b/pull/12", createdAt: "2026-11-20T11:00:29.000Z", mergedAt: "2026-11-20T11:10:00.000Z", files: [{ path: "src/b.mjs", additions: 160, deletions: 10 }] },
    ],
  };

  const report = buildCostDashboardReport({
    prsByRepo,
    repos: ["org/a", "org/b"],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
  });

  assert.equal(report.prRows.length, 2);
  assert.deepEqual(report.prRows.map((r) => r.prKey).sort(), ["org/a#12", "org/b#12"]);
  assert.equal(report.routeBuckets.small.count, 1);
  assert.equal(report.routeBuckets.small.medianChainPru, 10);
  assert.equal(report.routeBuckets.small.medianChainUsd, 0.4);
  assert.equal(report.routeBuckets["multi-task"].count, 1);
  assert.equal(report.routeBuckets["multi-task"].medianChainPru, 30);
  assert.equal(report.routeBuckets["multi-task"].medianChainUsd, 1.2);
  assert.equal(report.routeBuckets.trivial.count, 0);
  assert.equal(report.routeBuckets.trivial.medianChainPru, null);

  const opus = report.modelBreakdown.find((m) => m.model === "claude-opus-5.5");
  assert.equal(opus.multiplier, 15); // 30 PRU / 2 user turns (not 30 / 24 API calls)
  assert.equal(opus.requests, 24);
  assert.equal(opus.pruCost, 30);
  // Review subagent has 0 direct PRU (billed under main user request) but 15B / 42B compute share!
  assert.equal(report.agentBreakdown.review.requests, 8);
  assert.equal(report.agentBreakdown.review.nanoAiu, 15_000_000_000);
  assert.ok(Math.abs(report.agentBreakdown.review.share - 15 / 42) < 1e-9);
  // Per-session excess PRUs: max(0,10-10)=0 + max(0,30-2)=28 + max(0,0-10)=0 -> 28 / 40 = 0.70 (70%).
  assert.equal(report.simulatorBaseline.totalSnapshotPru, 40);
  assert.equal(report.simulatorBaseline.totalSnapshotUserRequests, 22);
  assert.ok(Math.abs(report.simulatorBaseline.observedOneXCapSavingsRate - 0.7) < 1e-9);
  assert.equal(report.simulatorBaseline.defaultTurnReductionPct, 25);

  // Repo org/a alone uses only 1x models -> observedOneXCapSavingsRate === 0.
  const oneXOnlyReport = buildCostDashboardReport({
    prsByRepo: { "org/a": prsByRepo["org/a"] },
    repos: ["org/a"],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
  });
  assert.equal(oneXOnlyReport.simulatorBaseline.observedOneXCapSavingsRate, 0);
  assert.equal(oneXOnlyReport.actionsCost.status, "disabled");
});

test("T7: fetchRepoActionsCost sums billable Ubuntu minutes, respects maxRuns truncation, and stays separate from Copilot PRU budget", (t) => {
  const dir = makeTempSessionsDir(t);
  writeSession(
    dir,
    "90909090-1111-1111-1111-111111111111",
    { repository: "org/a", created_at: "2026-11-20T10:00:00.000Z" },
    [
      { type: "assistant.message", timestamp: "2026-11-20T10:01:00.000Z", data: { content: "Opened https://github.com/org/a/pull/1" } },
      { type: "session.shutdown", timestamp: "2026-11-20T10:02:00.000Z", data: { accountingSnapshot: { totalUserRequests: 5, totalPremiumRequestCost: 5, totalNanoAiu: 5_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );

  const calls = [];
  const mockExec = (_bin, args) => {
    const endpoint = args[1];
    calls.push(endpoint);
    if (endpoint.includes("/actions/runs?")) {
      return JSON.stringify({
        workflow_runs: [
          { id: 103, created_at: "2026-11-20T12:05:00.000Z" },
          { id: 102, created_at: "2026-11-20T11:05:00.000Z" },
          { id: 101, created_at: "2026-11-20T10:05:00.000Z" },
        ],
      });
    }
    if (endpoint.endsWith("/103/timing")) return JSON.stringify({ billable: { UBUNTU: { total_ms: 120_000 } } });
    if (endpoint.endsWith("/102/timing")) return JSON.stringify({ billable: { UBUNTU: { total_ms: 180_000 } } });
    throw new Error(`Unexpected endpoint ${endpoint}`);
  };

  const act = fetchRepoActionsCost("org/a", {
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    maxRuns: 2,
    usdPerMin: 0.006,
    execFn: mockExec,
  });
  assert.equal(act.status, "ok");
  assert.equal(act.runsCounted, 2);
  assert.equal(act.truncated, true);
  assert.equal(act.ubuntuMinutes, 5);
  assert.ok(Math.abs(act.usdCost - 0.03) < 1e-9);

  const report = buildCostDashboardReport({
    prsByRepo: { "org/a": [{ number: 1, title: "A1", url: "https://github.com/org/a/pull/1", createdAt: "2026-11-20T10:00:50.000Z", mergedAt: "2026-11-20T10:10:00.000Z", files: [{ path: "a.js", additions: 5, deletions: 0 }] }] },
    repos: ["org/a"],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
    includeActions: true,
    maxActionsRuns: 2,
    actionsUsdPerMin: 0.006,
    execFn: mockExec,
  });
  assert.equal(report.actionsCost.ubuntuMinutes, 5);
  assert.equal(report.totals.scopedTotalPru, 5);
  assert.equal(report.simulatorBaseline.medianFeatureChainPru, 5);
});

test("T8: renderCostDashboardHtml escapes HTML and inline script JSON, omits raw user prompts, and renders theme, reduced-motion, and simulator controls", (t) => {
  const dir = makeTempSessionsDir(t);
  const xssPayload = "</script><img src=x onerror=alert(1)>";
  writeSession(
    dir,
    "a1a1a1a1-1111-1111-1111-111111111111",
    { repository: "org/xss", created_at: "2026-11-20T10:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T10:00:01.000Z", data: { content: "SECRET_PROMPT_TOKEN_99" } },
      { type: "assistant.message", timestamp: "2026-11-20T10:05:00.000Z", data: { content: "Opened https://github.com/org/xss/pull/7" } },
      {
        type: "session.shutdown",
        timestamp: "2026-11-20T10:06:00.000Z",
        data: {
          accountingSnapshot: {
            totalUserRequests: 3,
            totalPremiumRequestCost: 15,
            totalNanoAiu: 15_000_000_000,
            modelMetrics: { [`model-${xssPayload}`]: { requests: { count: 1, cost: 15, nanoAiu: 15_000_000_000 }, usage: {} } },
            agentMetrics: { main: { agentName: `agent-${xssPayload}`, requests: { count: 3, cost: 15, nanoAiu: 15_000_000_000 } } },
          },
        },
      },
    ],
  );

  const report = buildCostDashboardReport({
    prsByRepo: {
      "org/xss": [
        { number: 7, title: `Fix ${xssPayload}`, body: "SECRET_PR_BODY_77", url: "https://github.com/org/xss/pull/7", createdAt: "2026-11-20T10:04:00.000Z", mergedAt: "2026-11-20T10:10:00.000Z", files: [{ path: "src/x.mjs", additions: 12, deletions: 1 }] },
      ],
    },
    repos: ["org/xss"],
    sessionsDir: dir,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.04,
  });

  const html = renderCostDashboardHtml(report);
  assert.ok(!html.includes(xssPayload), "Must escape </script><img payload in HTML and embedded JSON");
  assert.ok(!html.includes("SECRET_PROMPT_TOKEN_99"), "Must never leak user.message content");
  assert.ok(!html.includes("SECRET_PR_BODY_77"), "Must never leak PR body content");
  assert.ok(!/<(?:script|link|img)[^>]+https?:\/\//i.test(html), "Must have zero external network asset dependencies");
  assert.ok(html.includes('data-theme="light"') || html.includes("[data-theme="), "Must support light/dark theme tokens");
  assert.ok(html.includes("prefers-reduced-motion: reduce"), "Must obey prefers-reduced-motion");
  assert.ok(html.includes("$10 Pro") && html.includes("$20 Budget") && html.includes("$39 Pro+"), "Must render subscription presets");
  assert.ok(html.includes('type="range"') && html.includes('value="25"'), "Must include turn-reduction slider defaulting to 25%");
  assert.ok(html.includes("Projected until M2 Budget Mode"), "Must badge projected turn reduction clearly");

  const md = formatCostMarkdown(report);
  assert.ok(md.includes("org/xss#7"));
  assert.ok(!md.includes("SECRET_PROMPT_TOKEN_99"));
});

test("T9: CLI supports offline json/markdown/html generation and rejects invalid numeric flags with exit 1", (t) => {
  const dir = makeTempSessionsDir(t);
  writeSession(
    dir,
    "b2b2b2b2-1111-1111-1111-111111111111",
    { repository: "divydvd/dev-loop", created_at: "2026-11-20T10:00:00.000Z" },
    [
      { type: "assistant.message", timestamp: "2026-11-20T10:05:00.000Z", data: { content: "Opened https://github.com/divydvd/dev-loop/pull/42" } },
      { type: "session.shutdown", timestamp: "2026-11-20T10:06:00.000Z", data: { accountingSnapshot: { totalUserRequests: 4, totalPremiumRequestCost: 8, totalNanoAiu: 8_000_000_000, modelMetrics: {}, agentMetrics: {} } } },
    ],
  );
  const prsFile = join(dir, "prs.json");
  writeFileSync(
    prsFile,
    JSON.stringify({
      "divydvd/dev-loop": [
        { number: 42, title: "Add cost CLI", url: "https://github.com/divydvd/dev-loop/pull/42", createdAt: "2026-11-20T10:04:00.000Z", mergedAt: "2026-11-20T10:10:00.000Z", files: [{ path: "scripts/cost-dashboard.mjs", additions: 50, deletions: 0 }] },
      ],
    }),
    "utf8",
  );

  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT" && !k.startsWith("GIT_")),
  );
  const scriptPath = resolve("scripts/cost-dashboard.mjs");
  const outHtml = join(dir, "dashboard.html");

  const htmlRun = spawnSync(
    process.execPath,
    [scriptPath, "--repo", "divydvd/dev-loop", "--prs-file", prsFile, "--sessions-dir", dir, "--from", "2026-11-19T00:00:00.000Z", "--to", "2026-11-22T00:00:00.000Z", "--format", "html", "--out", outHtml],
    { env: cleanEnv, encoding: "utf8" },
  );
  assert.equal(htmlRun.status, 0, htmlRun.stderr);
  assert.ok(existsSync(outHtml));
  assert.ok(readFileSync(outHtml, "utf8").includes("<!doctype html>"));

  const jsonRun = spawnSync(
    process.execPath,
    [scriptPath, "--repo", "divydvd/dev-loop", "--prs-file", prsFile, "--sessions-dir", dir, "--from", "2026-11-19T00:00:00.000Z", "--to", "2026-11-22T00:00:00.000Z", "--format", "json"],
    { env: cleanEnv, encoding: "utf8" },
  );
  assert.equal(jsonRun.status, 0, jsonRun.stderr);
  const parsedJson = JSON.parse(jsonRun.stdout);
  assert.equal(parsedJson.totals.scopedTotalPru, 8);

  const mdRun = spawnSync(
    process.execPath,
    [scriptPath, "--repo", "divydvd/dev-loop", "--prs-file", prsFile, "--sessions-dir", dir, "--from", "2026-11-19T00:00:00.000Z", "--to", "2026-11-22T00:00:00.000Z", "--format", "markdown"],
    { env: cleanEnv, encoding: "utf8" },
  );
  assert.equal(mdRun.status, 0, mdRun.stderr);
  assert.ok(mdRun.stdout.includes("divydvd/dev-loop#42"));

  for (const badArgs of [
    ["--pru-usd", "-0.05"],
    ["--pru-usd", "nope"],
    ["--max-actions-runs", "0"],
    ["--format", "xml"],
  ]) {
    const bad = spawnSync(process.execPath, [scriptPath, "--prs-file", prsFile, "--sessions-dir", dir, ...badArgs], { env: cleanEnv, encoding: "utf8" });
    assert.equal(bad.status, 1, `Expected exit 1 for ${badArgs.join(" ")}`);
    assert.ok(bad.stderr.trim().length > 0);
  }
});

test("T11: review-panel regressions cover repo-less PR guard, array prs-file, partial shutdown, Actions query/rate, legacy null totals, AIU rendering, and simulator DOM states", async (t) => {
  const vm = await import("node:vm");
  const dir = makeTempSessionsDir(t);

  // SJ-3, SJ-4, SJ-15, SJ-16: substring "tool.execution_complete" in first user.message & create_session, empty shutdown snapshot, non-enumerable _lines, prototype keys
  const childPaths = writeSession(
    dir,
    "c1111111-1111-1111-1111-111111111111",
    { repository: "org/app", created_at: "2026-11-20T10:00:00.000Z" },
    [
      { type: "user.message", timestamp: "2026-11-20T10:00:01.000Z", data: { source: "agent-a1111111-1111-1111-1111-111111111111", content: "Inspect tool.execution_complete handling; SECRET_RAW_LINE_42" } },
      { type: "tool.execution_start", timestamp: "2026-11-20T10:00:02.000Z", data: { toolCallId: "tc-1", toolName: "create_session", arguments: { prompt: "Handle tool.execution_complete" } } },
      { type: "tool.execution_complete", timestamp: "2026-11-20T10:00:03.000Z", data: { toolCallId: "tc-1", success: true, result: { content: "Created session (id: d1111111-1111-1111-1111-111111111111)" } } },
      { type: "session.usage_checkpoint", timestamp: "2026-11-20T10:04:00.000Z", data: { accountingSnapshot: { totalUserRequests: 2, totalPremiumRequestCost: 6, totalNanoAiu: 6_000_000_000, modelMetrics: { constructor: { requests: { count: 2, cost: 6 }, usage: { inputTokens: 10, outputTokens: 5 } } }, agentMetrics: {} } } },
      { type: "session.shutdown", timestamp: "2026-11-20T10:05:00.000Z", data: { accountingSnapshot: {} } },
    ],
  );
  const parsed = parseCostSession("c1111111-1111-1111-1111-111111111111", childPaths.wsPath, childPaths.evPath);
  assert.equal(parsed.kickoffParentId, "a1111111-1111-1111-1111-111111111111", "SJ-3: must not skip first user.message containing tool.execution_complete");
  assert.equal(parsed.creationCallCount, 1, "SJ-3: must not skip first create_session start containing tool.execution_complete");
  assert.equal(parsed.pruCost, 6, "SJ-4: trailing empty shutdown accountingSnapshot must not overwrite valid checkpoint");
  assert.equal(parsed.models.constructor.pruCost, 6, "SJ-15: constructor key in modelMetrics must work safely");
  assert.ok(!JSON.stringify(parsed).includes("SECRET_RAW_LINE_42"), "SJ-16: _lines must be non-enumerable on parseCostSession output");

  // SJ-1, SJ-10, SJ-11: repo-less chat mentioning PR URL + legacy-only window + pre-window shared coordinator
  const dir2 = makeTempSessionsDir(t);
  writeSession(
    dir2,
    "c0a00000-0000-0000-0000-000000000001",
    { created_at: "2026-11-20T09:00:00.000Z" },
    [{ type: "user.message", timestamp: "2026-11-20T09:01:00.000Z", data: { content: "Check https://github.com/org/app/pull/99" } }],
  );
  writeSession(
    dir2,
    "c00d0000-0000-0000-0000-000000000001",
    { repository: "org/app", created_at: "2026-11-01T09:00:00.000Z" },
    [
      { type: "tool.execution_start", timestamp: "2026-11-01T09:01:00.000Z", data: { toolCallId: "k1", toolName: "create_session" } },
      { type: "tool.execution_complete", timestamp: "2026-11-01T09:01:05.000Z", data: { toolCallId: "k1", success: true, result: "id: e1000000-0000-0000-0000-000000000001" } },
      { type: "tool.execution_start", timestamp: "2026-11-01T09:02:00.000Z", data: { toolCallId: "k2", toolName: "create_session" } },
      { type: "tool.execution_complete", timestamp: "2026-11-01T09:02:05.000Z", data: { toolCallId: "k2", success: true, result: "id: e2000000-0000-0000-0000-000000000002" } },
    ],
  );
  writeSession(
    dir2,
    "e1000000-0000-0000-0000-000000000001",
    { repository: "org/app", created_at: "2026-11-01T10:00:00.000Z" },
    [{ type: "assistant.message", timestamp: "2026-11-20T10:00:00.000Z", data: { content: "Opened https://github.com/org/app/pull/100" } }],
  );
  writeSession(
    dir2,
    "e2000000-0000-0000-0000-000000000002",
    { repository: "org/app", created_at: "2026-11-01T11:00:00.000Z" },
    [{ type: "assistant.message", timestamp: "2026-11-20T11:00:00.000Z", data: { content: "Opened https://github.com/org/app/pull/101" } }],
  );
  const legacyAttr = attributeCostChains({
    prsByRepo: {
      "org/app": [
        { number: 99, title: "External PR", url: "https://github.com/org/app/pull/99", mergedAt: "2026-11-20T12:00:00.000Z", files: [] },
        { number: 100, title: "Legacy 1", url: "https://github.com/org/app/pull/100", mergedAt: "2026-11-20T12:05:00.000Z", files: [] },
        { number: 101, title: "Legacy 2", url: "https://github.com/org/app/pull/101", mergedAt: "2026-11-20T12:10:00.000Z", files: [] },
      ],
    },
    repos: ["org/app"],
    sessionsDir: dir2,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
  });
  const pr99 = legacyAttr.prRows.find((r) => r.number === 99);
  assert.equal(pr99.attribution, "unmatched_non_copilot_or_missing_session", "SJ-1: repo-less chat must not match direct PR");
  assert.equal(legacyAttr.unattributed.sharedCoordinators.length, 1, "SJ-11: pre-window coordinator with in-window merged PR children must appear in sharedCoordinators");
  assert.equal(legacyAttr.totals.scopedTotalPru, null, "SJ-10: legacy-only window with 0 snapshots must return null PRU total, not 0");
  assert.equal(legacyAttr.totals.scopedTotalUsd, null, "SJ-10: legacy-only window with 0 snapshots must return null USD total, not 0");

  // SJ-2: Array --prs-file without --repo infers repo from PR URL
  const arrayPrsPath = join(dir2, "array-prs.json");
  writeFileSync(arrayPrsPath, JSON.stringify([{ number: 100, title: "Legacy 1", url: "https://github.com/org/app/pull/100", mergedAt: "2026-11-20T12:05:00.000Z", files: [] }]), "utf8");
  const cliRes = runCli(["--prs-file", arrayPrsPath, "--sessions-dir", dir2, "--from", "2026-11-19T00:00:00.000Z", "--to", "2026-11-22T00:00:00.000Z", "--format", "json"]);
  const cliReport = JSON.parse(cliRes.stdout);
  assert.equal(cliReport.prRows[0].repo, "org/app", "SJ-2: array --prs-file without --repo must infer owner/name from PR url");
  assert.equal(cliReport.prRows[0].attribution, "unique", "SJ-2: inferred repo must match workspace session");

  // SJ-5 & SJ-13: Actions created filter, default $0.008/min, deduplicated run IDs across pages
  const apiPaths = [];
  const actRes = fetchRepoActionsCost("org/app", {
    from: "2026-11-01T00:00:00.000Z",
    to: "2026-11-08T00:00:00.000Z",
    maxRuns: 3,
    execFn: (_cmd, args) => {
      apiPaths.push(args[1]);
      if (args[1].includes("/actions/runs?")) {
        return JSON.stringify({
          workflow_runs: [
            { id: 501, created_at: "2026-11-05T00:00:00.000Z" },
            { id: 501, created_at: "2026-11-05T00:00:00.000Z" },
            { id: 502, created_at: "2026-11-04T00:00:00.000Z" },
          ],
        });
      }
      return JSON.stringify({ billable: { UBUNTU: { total_ms: 60_000 } } });
    },
  });
  assert.ok(apiPaths[0].includes("created="), "SJ-5: Actions API call must pass created filter");
  assert.equal(actRes.runsCounted, 2, "SJ-13: duplicate workflow run IDs must be deduplicated");
  assert.ok(Math.abs(actRes.usdCost - 0.016) < 1e-9, "SJ-5: default Actions rate must be $0.008/min (2 min = $0.016)");

  // SJ-6, SJ-7, SJ-8, SJ-9, SJ-14, SJ-17: HTML accessibility, AIU display, truncated Actions text, and simulator DOM state machine
  const dir3 = makeTempSessionsDir(t);
  writeSession(
    dir3,
    "a3000000-0000-0000-0000-000000000001",
    { repository: "org/sim", created_at: "2026-11-20T08:00:00.000Z" },
    [
      { type: "assistant.message", timestamp: "2026-11-20T08:05:00.000Z", data: { content: "https://github.com/org/sim/pull/1" } },
      { type: "session.shutdown", timestamp: "2026-11-20T08:06:00.000Z", data: { accountingSnapshot: { totalUserRequests: 1, totalPremiumRequestCost: 0.3, totalNanoAiu: 2_500_000_000, modelMetrics: {}, agentMetrics: { main: { agentName: "main", totalNanoAiu: 2_500_000_000, modelMetrics: { "gpt-mini": { requests: { count: 1, cost: 0.3 } } } } } } } },
    ],
  );
  const simReport = buildCostDashboardReport({
    prsByRepo: {
      "org/sim": [
        { number: 1, title: "Low PRU", url: "https://github.com/org/sim/pull/1", mergedAt: "2026-11-20T12:00:00+02:00", files: [{ path: "a.js", additions: 5, deletions: 0 }] },
        { number: 2, title: "Bad URL", url: "javascript:alert(1)", mergedAt: "2026-11-20T11:00:00.000Z", files: [{ path: "b.js", additions: 2, deletions: 0 }] },
      ],
    },
    repos: ["org/sim"],
    sessionsDir: dir3,
    from: "2026-11-19T00:00:00.000Z",
    to: "2026-11-22T00:00:00.000Z",
    pruUsd: 0.02,
    includeActions: true,
    maxActionsRuns: 1,
    execFn: (_c, args) => args[1].includes("/actions/runs?")
      ? JSON.stringify({ workflow_runs: [{ id: 1, created_at: "2026-11-20T01:00:00.000Z" }, { id: 2, created_at: "2026-11-20T00:30:00.000Z" }] })
      : JSON.stringify({ billable: { UBUNTU: { total_ms: 120_000 } } }),
  });
  const simHtml = renderCostDashboardHtml(simReport);
  const simMd = formatCostMarkdown(simReport);
  assert.ok(simHtml.includes(":focus-visible") && simHtml.includes("aria-pressed=") && simHtml.includes('role="status"') && simHtml.includes('aria-live="polite"'), "SJ-8: must include focus-visible, aria-pressed, and live-region semantics");
  assert.ok(simHtml.includes("color-scheme:") && simHtml.includes("a{color:var(--accent)}") && simHtml.includes("--warn-soft:"), "SJ-7: must include WCAG AA dark/light contrast tokens");
  assert.ok(simHtml.includes("overflow-x:auto") && simHtml.includes("minmax("), "SJ-17: must prevent narrow-viewport bar collapse and table overflow");
  assert.ok(simHtml.includes("AIU") && simHtml.includes("Mean:") && simMd.includes("AIU"), "SJ-9: HTML and Markdown must display AIU figures and mean chain PRU");
  assert.ok(simHtml.includes("truncated"), "SJ-5: HTML Actions KPI must surface truncated status");

  // Execute embedded script in minimal DOM harness to verify SJ-6 & SJ-14
  const scriptMatch = simHtml.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, "Embedded script must exist");
  const els = {
    themeBtn: { onclick: null, setAttribute(k, v) { this[k] = v; } },
    turnSlider: { value: "25", oninput: null },
    turnVal: { textContent: "" },
    simSummary: { textContent: "" },
    customUsd: { value: "20", oninput: null },
    repoFilter: { value: "", onchange: null },
    routeFilter: { value: "", onchange: null },
    sortBy: { value: "date", onchange: null },
    prBody: { innerHTML: "" },
  };
  const planBtnList = simReport.simulatorBaseline.plans.map((p, i) => ({
    dataset: { pru: String(p.includedPru), usd: String(p.monthlyUsd) },
    active: i === 1,
    "aria-pressed": i === 1 ? "true" : "false",
    classList: { add() { this.active = true; }, remove() { this.active = false; } },
    setAttribute(k, v) { this[k] = v; },
    onclick: null,
  }));
  vm.runInNewContext(scriptMatch[1], {
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      documentElement: { dataset: { theme: "light" } },
      getElementById: (id) => els[id],
      querySelectorAll: () => planBtnList,
    },
  });
  assert.ok(els.simSummary.textContent.includes("1000 PRUs"), `SJ-6: $20 at $0.02/PRU must initialize 1000 PRUs, got: ${els.simSummary.textContent}`);
  assert.ok(!els.simSummary.textContent.includes("(0.5 PRU/feature)"), `SJ-6: median 0.3 PRU must not clamp UP to 0.5 PRU, got: ${els.simSummary.textContent}`);
  els.customUsd.oninput({ target: { value: "0" } });
  assert.equal(planBtnList[1]["aria-pressed"], "false", "SJ-8: custom input must set preset aria-pressed=false");
  assert.ok(!els.simSummary.textContent.includes("1000 PRUs"), "SJ-6: zero custom budget must clear stale 1000 PRU output");
  els.sortBy.onchange();
  assert.ok(els.prBody.innerHTML.indexOf("org/sim#2") < els.prBody.innerHTML.indexOf("org/sim#1"), "SJ-14: 11:00Z (#2) must sort newer than 12:00+02:00 = 10:00Z (#1)");
  assert.ok(els.prBody.innerHTML.includes('href="#"'), "Security: javascript: URL must sanitize to href=\"#\"");
});

test("T12: panel-2 regressions cover prs-file repo isolation, post-to PR parity, reviewer regex, multi-level coordinators, PR truncation, and a11y states", async (t) => {
  const vm = await import("node:vm");
  const dir = mkdtempSync(join(tmpdir(), "cost-dash-t12-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // AC-3: single-reviewer and code-reviewer subagents land in review bucket
  const sRev = writeSession(dir, "s-rev-single", { repository: "org/app", created_at: "2026-11-10T10:00:00Z" }, [
    {
      type: "session.shutdown",
      data: {
        accountingSnapshot: {
          totalPremiumRequestCost: 4,
          totalUserRequests: 4,
          totalNanoAiu: 1_000_000_000,
          agentMetrics: {
            main: { agentName: "main", totalNanoAiu: 600_000_000, requests: { count: 2, cost: 4 } },
            sub1: { agentName: "general-purpose", agentDisplayName: "single-reviewer", totalNanoAiu: 250_000_000, requests: { count: 1, cost: 0 } },
            sub2: { agentName: "code-reviewer", agentDisplayName: "Code Reviewer", totalNanoAiu: 150_000_000, requests: { count: 1, cost: 0 } },
          },
        },
      },
    },
  ]);
  const parsedRev = parseCostSession("s-rev-single", sRev.wsPath, sRev.evPath);
  assert.equal(parsedRev.agentBuckets.review.nanoAiu, 400_000_000, "AC-3: single-reviewer and code-reviewer must classify as review");
  assert.equal(parsedRev.agentBuckets.otherSubagents.nanoAiu, 0);

  // AC-1/SP-1 + CS-3: prsByRepo without repos scopes out unrelated private repos and repo-less chats, and deduplicates mixed-case repos
  const sDir = join(dir, "sessions");
  mkdirSync(sDir, { recursive: true });
  writeSession(sDir, "11111111-1111-1111-1111-111111111111", { repository: "org/target", created_at: "2026-11-12T10:00:00Z" }, [
    { type: "tool.execution_complete", data: { toolCallId: "c1", result: "https://github.com/org/target/pull/1" } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 6, totalUserRequests: 6, totalNanoAiu: 100 } } },
  ]);
  writeSession(sDir, "22222222-2222-2222-2222-222222222222", { repository: "private-org/secret", created_at: "2026-11-12T11:00:00Z" }, [
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 99, totalUserRequests: 10, totalNanoAiu: 500 } } },
  ]);
  writeSession(sDir, "33333333-3333-3333-3333-333333333333", { created_at: "2026-11-12T12:00:00Z" }, [
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 40, totalUserRequests: 5, totalNanoAiu: 200 } } },
  ]);
  const prsList = [{ number: 1, title: "Target", url: "https://github.com/org/target/pull/1", mergedAt: "2026-11-12T15:00:00Z", files: [{ path: "src/a.js", additions: 5, deletions: 0 }] }];
  Object.defineProperty(prsList, "truncated", { value: true, enumerable: false });
  const scopedRep = buildCostDashboardReport({
    prsByRepo: { "org/target": prsList, "ORG/TARGET": prsList },
    repos: [],
    sessionsDir: sDir,
    from: "2026-11-01T00:00:00Z",
    to: "2026-11-20T00:00:00Z",
  });
  assert.deepEqual(scopedRep.repos, ["org/target"], "CS-3: mixed-case duplicate repo keys must deduplicate");
  assert.equal(scopedRep.prRows.length, 1);
  assert.equal(scopedRep.prRows[0].attribution, "unique", "CS-3: duplicate case-variant PR keys must not mark unique PR ambiguous");
  assert.equal(scopedRep.unattributed.unmergedSessions.length, 0, "AC-1/SP-1: private-org/secret must not leak into unmergedSessions");
  assert.equal(scopedRep.unattributed.unscopedChatSpend.includedInScopedTotals, false, "AC-1: inferred repo scope must exclude repo-less chats from scoped total");
  assert.equal(scopedRep.totals.scopedTotalPru, 6);
  assert.equal(scopedRep.prsTruncated, true, "CS-4: non-enumerable fetchMergedPrs truncated flag must propagate");
  assert.deepEqual(scopedRep.prsTruncatedRepos, ["org/target"]);
  assert.match(formatCostMarkdown(scopedRep), /PR history truncated/i);

  // AC-2 + CS-1 + SF-1/SF-2/SF-3: post-to PR parity, 3-level pre-window coordinator chain, midId < kid1 tie-breaking, repo-less coordinator, cross-repo pre-window coordinator, and mixed-case repo canonicalization
  const pDir = join(dir, "parity");
  mkdirSync(pDir, { recursive: true });
  const gpId = "00000000-0000-0000-0000-000000000001";
  const midId = "11111111-1111-1111-1111-111111111111";
  const kid1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const kid2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const sharedCross = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const postOnly = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const repolessCoord = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const crossRepoCoord = "22222222-2222-2222-2222-222222222222";
  const crossKidOldTarget = "33333333-3333-3333-3333-333333333333";
  const crossKidNewOther = "44444444-4444-4444-4444-444444444444";

  writeSession(pDir, gpId, { repository: "org/p", created_at: "2026-10-20T00:00:00Z" }, [
    { type: "tool.execution_start", data: { toolCallId: "g1", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "g1", success: true, result: `id: ${midId}` } },
    { type: "tool.execution_start", data: { toolCallId: "g2", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "g2", success: true, result: "id: 99999999-9999-9999-9999-999999999999" } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 7, totalUserRequests: 2, totalNanoAiu: 70 } } },
  ]);
  writeSession(pDir, midId, { repository: "org/p", created_at: "2026-10-25T00:00:00Z" }, [
    { type: "user.message", data: { content: "plan", source: `agent-${gpId}` } },
    { type: "tool.execution_start", data: { toolCallId: "m1", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "m1", success: true, result: `id: ${kid1}\nhttps://github.com/org/p/pull/10` } },
    { type: "tool.execution_start", data: { toolCallId: "m2", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "m2", success: true, result: `id: ${kid2}` } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 5, totalUserRequests: 2, totalNanoAiu: 50 } } },
  ]);
  writeSession(pDir, kid1, { repository: "org/p", created_at: "2026-11-05T00:00:00Z" }, [
    { type: "user.message", data: { content: "impl", source: `agent-${midId}` } },
    { type: "tool.execution_complete", data: { toolCallId: "k1", result: "https://github.com/org/p/pull/10" } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 3, totalUserRequests: 3, totalNanoAiu: 30 } } },
  ]);
  writeSession(pDir, sharedCross, { repository: "org/p", created_at: "2026-11-06T00:00:00Z" }, [
    { type: "tool.execution_complete", data: { toolCallId: "sc1", result: "https://github.com/org/p/pull/11 and https://github.com/org/p/pull/12" } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 8, totalUserRequests: 4, totalNanoAiu: 80 } } },
  ]);
  writeSession(pDir, postOnly, { repository: "org/p", created_at: "2026-11-09T00:00:00Z" }, [
    { type: "tool.execution_complete", data: { toolCallId: "po1", result: "https://github.com/org/p/pull/13" } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 4, totalUserRequests: 2, totalNanoAiu: 40 } } },
  ]);
  writeSession(pDir, repolessCoord, { created_at: "2026-11-06T00:00:00Z" }, [
    { type: "tool.execution_start", data: { toolCallId: "rc1", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "rc1", success: true, result: "id: 77777777-7777-7777-7777-777777777777" } },
    { type: "tool.execution_start", data: { toolCallId: "rc2", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "rc2", success: true, result: "id: 88888888-8888-8888-8888-888888888888" } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 11, totalUserRequests: 2, totalNanoAiu: 110 } } },
  ]);
  writeSession(pDir, crossRepoCoord, { repository: "private/other", created_at: "2026-10-15T00:00:00Z" }, [
    { type: "tool.execution_start", data: { toolCallId: "cr1", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "cr1", success: true, result: `id: ${crossKidOldTarget}` } },
    { type: "tool.execution_start", data: { toolCallId: "cr2", toolName: "create_session" } },
    { type: "tool.execution_complete", data: { toolCallId: "cr2", success: true, result: `id: ${crossKidNewOther}` } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 50, totalUserRequests: 5, totalNanoAiu: 500 } } },
  ]);
  writeSession(pDir, crossKidOldTarget, { repository: "org/p", created_at: "2026-10-16T00:00:00Z" }, [
    { type: "user.message", data: { content: "old", source: `agent-${crossRepoCoord}` } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 2, totalUserRequests: 1, totalNanoAiu: 20 } } },
  ]);
  writeSession(pDir, crossKidNewOther, { repository: "private/other", created_at: "2026-11-04T00:00:00Z" }, [
    { type: "user.message", data: { content: "new", source: `agent-${crossRepoCoord}` } },
    { type: "session.shutdown", data: { accountingSnapshot: { totalPremiumRequestCost: 2, totalUserRequests: 1, totalNanoAiu: 20 } } },
  ]);

  const parityAttr = attributeCostChains({
    prsByRepo: {
      "org/p": [
        { number: 10, url: "https://github.com/org/p/pull/10", mergedAt: "2026-11-05T12:00:00Z", files: [{ path: "a.js", additions: 2, deletions: 0 }] },
        { number: 11, url: "https://github.com/org/p/pull/11", mergedAt: "2026-11-07T12:00:00Z", files: [{ path: "b.js", additions: 2, deletions: 0 }] },
        { number: 12, url: "https://github.com/org/p/pull/12", mergedAt: "2026-11-15T12:00:00Z", files: [{ path: "c.js", additions: 2, deletions: 0 }] },
        { number: 13, url: "https://github.com/org/p/pull/13", mergedAt: "2026-11-16T12:00:00Z", files: [{ path: "d.js", additions: 2, deletions: 0 }] },
      ],
      "ORG/P": [
        { number: 14, url: "https://github.com/ORG/P/pull/14", mergedAt: "2026-11-08T12:00:00Z", files: [{ path: "e.js", additions: 2, deletions: 0 }] },
      ],
    },
    repos: ["org/p"],
    sessionsDir: pDir,
    from: "2026-11-01T00:00:00Z",
    to: "2026-11-10T00:00:00Z",
  });
  const pr10 = parityAttr.prRows.find((r) => r.number === 10);
  const pr11 = parityAttr.prRows.find((r) => r.number === 11);
  const pr14 = parityAttr.prRows.find((r) => r.number === 14);
  assert.equal(pr10.sessionId, kid1, "CS-1/SF-3: equal 1-hit tie must displace earlier-sorted spawner midId with leaf kid1");
  assert.equal(pr11.attribution, "ambiguous", "AC-2: session shared with a post-to PR must be marked ambiguous");
  assert.equal(pr14.repo, "org/p", "SF-2: mixed-case repo key must normalize to canonical repo casing");
  assert.ok(!parityAttr.unattributed.unmergedSessions.some((s) => s.sessionId === postOnly), "AC-2: session whose PR merged after --to must not enter unmergedSessions");
  assert.ok(parityAttr.unattributed.sharedCoordinators.some((s) => s.sessionId === gpId), "CS-1/AC-4: 3-level pre-window grandparent coordinator must be included");
  assert.ok(!parityAttr.unattributed.sharedCoordinators.some((s) => s.sessionId === crossRepoCoord), "SF-1: pre-window cross-repo coordinator must not leak into org/p");
  assert.equal(parityAttr.unattributed.unscopedChatSpend.sessionCount, 1, "SF-1: repo-less coordinator without in-scope child must stay in unscopedChatSpend under --repo");

  const wsWideAttr = attributeCostChains({
    prsByRepo: {},
    repos: [],
    sessionsDir: pDir,
    from: "2026-11-01T00:00:00Z",
    to: "2026-11-10T00:00:00Z",
  });
  assert.ok(wsWideAttr.unattributed.sharedCoordinators.some((s) => s.sessionId === repolessCoord), "SF-1: workspace-wide mode must include in-window repo-less coordinator in sharedCoordinators");

  // UI-2, UI-3, UI-4, UI-5: 0-snapshot legacy HTML n/a rendering, accessible theme button, 320px CSS, tabindex=0, and null chainPruCost sort order
  const lDir = join(dir, "legacy-ui");
  mkdirSync(lDir, { recursive: true });
  writeSession(lDir, "leg-ui-1", { repository: "org/ui", created_at: "2026-11-05T00:00:00Z" }, [
    { type: "assistant.usage", data: { model: "gpt-5", duration: 100 } },
  ]);
  const legacyUiRep = buildCostDashboardReport({
    prsByRepo: { "org/ui": [] },
    repos: ["org/ui"],
    sessionsDir: lDir,
    from: "2026-11-01T00:00:00Z",
    to: "2026-11-10T00:00:00Z",
    pruUsd: 0,
  });
  assert.equal(legacyUiRep.simulatorBaseline.plans[1].includedPru, 0, "UI-5: pruUsd=0 must set $20 Budget includedPru to 0");
  const legacyHtml = renderCostDashboardHtml(legacyUiRep);
  assert.match(legacyHtml, /minmax\(min\(100%,340px\),1fr\)/, "UI-2: .grid2 must adapt below 388px viewports");
  assert.match(legacyHtml, /tabindex="0"/, "UI-2: scrollable table containers must be keyboard focusable");
  assert.match(legacyHtml, /<button id="themeBtn" type="button" aria-pressed="false">Dark theme<\/button>/, "UI-3: #themeBtn visible text and accessible name must match");
  assert.ok(!legacyHtml.includes("0.0%"), "UI-4: 0-snapshot legacy window must render n/a rather than 0.0%");
  const legEls = { themeBtn: { onclick: null, setAttribute() {} }, turnSlider: { value: "25", oninput: null }, turnVal: { textContent: "" }, simSummary: { textContent: "" }, customUsd: { value: "20", oninput: null }, repoFilter: { value: "", onchange: null }, routeFilter: { value: "", onchange: null }, sortBy: { value: "pru", onchange: null }, prBody: { innerHTML: "" } };
  vm.runInNewContext(legacyHtml.match(/<script>([\s\S]*?)<\/script>/)[1], { window: { matchMedia: () => ({ matches: false }) }, document: { documentElement: { dataset: { theme: "light" } }, getElementById: (id) => legEls[id], querySelectorAll: () => [] } });
  legEls.customUsd.oninput({ target: { value: "25" } });
  assert.match(legEls.simSummary.textContent, /PRU rate > \$0/i, "UI-5: customUsd input with pruUsd=0 must prompt for PRU rate > $0 rather than Infinity");
  assert.ok(!legEls.simSummary.textContent.includes("Infinity"));

  // UI-4: Chain PRU sort places numeric chainPruCost above null chainPruCost (even with high directPruCost)
  const sortHtml = renderCostDashboardHtml({
    ...scopedRep,
    prRows: [
      { prKey: "org/target#1", repo: "org/target", number: 1, title: "Partial", url: "https://github.com/org/target/pull/1", mergedAt: "2026-11-12T10:00:00Z", route: "small", prodLines: 5, attribution: "unique", ideationAttribution: "exclusive_parent", chainPruStatus: "partial_parent_snapshot_unavailable", directPruCost: 50, chainPruCost: null, chainUsdCost: null },
      { prKey: "org/target#2", repo: "org/target", number: 2, title: "Exact", url: "https://github.com/org/target/pull/2", mergedAt: "2026-11-12T11:00:00Z", route: "small", prodLines: 5, attribution: "unique", ideationAttribution: "none", chainPruStatus: "exact", directPruCost: 2, chainPruCost: 2, chainUsdCost: 0.08 },
    ],
  });
  const scriptCode = sortHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
  const els = {
    themeBtn: { onclick: null, setAttribute() {} },
    turnSlider: { value: "25", oninput: null },
    turnVal: { textContent: "" },
    simSummary: { textContent: "" },
    customUsd: { value: "20", oninput: null },
    repoFilter: { value: "", onchange: null },
    routeFilter: { value: "", onchange: null },
    sortBy: { value: "pru", onchange: null },
    prBody: { innerHTML: "" },
  };
  vm.runInNewContext(scriptCode, {
    window: { matchMedia: () => ({ matches: false }) },
    document: { documentElement: { dataset: { theme: "light" } }, getElementById: (id) => els[id], querySelectorAll: () => [] },
  });
  assert.ok(els.prBody.innerHTML.indexOf("org/target#2") < els.prBody.innerHTML.indexOf("org/target#1"), "UI-4: numeric Chain PRU (2.0) must sort above null Chain PRU");
});




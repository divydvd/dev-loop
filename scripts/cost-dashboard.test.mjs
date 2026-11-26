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



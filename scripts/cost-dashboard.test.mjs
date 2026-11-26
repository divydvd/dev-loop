import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCostSession,
  attributeCostChains,
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

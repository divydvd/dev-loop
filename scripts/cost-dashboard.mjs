#!/usr/bin/env node
// Read-only ideation-to-merge cost dashboard for dev-loop repositories.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyRoute, parseSessionEvents, productionLinesChanged } from "./collect-metrics.mjs";

const CREATION_TOOLS = new Set(["create_session", "open_issue_session", "open_pr_session", "fork_session"]);
const REVIEW_AGENT_RE = /\b(?:review|skeptic-judge|arch-correctness|concurrency-state|security-privacy|ui-a11y)\b/i;
const SPAWN_ID_RE = /(?:\bid:\s*|ghapp:\/\/sessions\/)([0-9a-f-]{8,})/gi;

function parseWorkspaceYaml(filePath) {
  const out = {};
  if (!filePath || !existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const finiteOrNull = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function parseCostSession(sessionId, wsPath, eventsPath, { pruUsd = 0.04 } = {}) {
  const ws = parseWorkspaceYaml(wsPath);
  const base = parseSessionEvents(eventsPath);
  let latestSnap = null, kickoffParentId = null, seenFirstUserMsg = false, creationCallCount = 0;
  const creationCalls = new Set(), spawnedTargetIds = [];
  for (const line of base.lines) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    const { type, data = {} } = evt, isMain = !evt.agentId;
    if ((type === "session.usage_checkpoint" || type === "session.shutdown") && data.accountingSnapshot && typeof data.accountingSnapshot === "object") {
      latestSnap = data.accountingSnapshot;
    } else if (type === "user.message" && isMain && !data.isAutopilotContinuation && !seenFirstUserMsg) {
      const c = String(data.content ?? "");
      if (!c.trim() || c.includes("<skill-context") || c.includes("<system_notification")) continue;
      seenFirstUserMsg = true;
      const m = String(data.source || "").match(/^agent-([0-9a-f-]{8,})$/i);
      if (m) kickoffParentId = m[1].toLowerCase();
    } else if (type === "tool.execution_start" && isMain && data.toolCallId && CREATION_TOOLS.has(data.toolName)) {
      creationCalls.add(data.toolCallId);
    } else if (type === "tool.execution_complete" && creationCalls.has(data.toolCallId) && data.success !== false) {
      creationCallCount += 1;
      const text = String(typeof data.result === "string" ? data.result : data.result?.content ?? "");
      for (const m of text.matchAll(SPAWN_ID_RE)) spawnedTargetIds.push(m[1].toLowerCase());
    }
  }
  const pruCost = latestSnap ? finiteOrNull(latestSnap.totalPremiumRequestCost) : null;
  const hasSnap = pruCost !== null;
  const models = {};
  for (const [modelName, m] of Object.entries(latestSnap?.modelMetrics || {})) {
    const requests = Number(m?.requests?.count || 0), mCost = Number(m?.requests?.cost || 0), nanoAiu = Number(m?.requests?.nanoAiu || 0);
    const u = m?.usage || {};
    models[modelName] = {
      requests, pruCost: mCost, nanoAiu, multiplier: requests > 0 ? mCost / requests : null,
      usage: { inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0), cacheReadTokens: Number(u.cacheReadTokens || 0), cacheWriteTokens: Number(u.cacheWriteTokens || 0) },
    };
  }
  const agentBuckets = {
    main: { requests: 0, pruCost: 0, nanoAiu: 0 },
    review: { requests: 0, pruCost: 0, nanoAiu: 0 },
    otherSubagents: { requests: 0, pruCost: 0, nanoAiu: 0 },
  };
  for (const [key, ag] of Object.entries(latestSnap?.agentMetrics || {})) {
    const label = `${ag?.agentName || ""} ${ag?.agentDisplayName || ""}`;
    const bucket = key === "main" || /^main$/i.test(String(ag?.agentName || "")) ? "main" : REVIEW_AGENT_RE.test(label) ? "review" : "otherSubagents";
    agentBuckets[bucket].requests += Number(ag?.requests?.count || 0);
    agentBuckets[bucket].pruCost += Number(ag?.requests?.cost || 0);
    agentBuckets[bucket].nanoAiu += Number(ag?.requests?.nanoAiu || 0);
  }
  const td = latestSnap?.tokenDetails;
  return {
    sessionId: String(ws.id || sessionId),
    idKey: String(ws.id || sessionId).toLowerCase(),
    repository: ws.repository || null,
    createdAt: ws.created_at || null,
    pruAttribution: hasSnap ? "exact" : "snapshot_unavailable",
    pruCost,
    usdCost: hasSnap ? pruCost * pruUsd : null,
    userRequests: latestSnap ? finiteOrNull(latestSnap.totalUserRequests) : null,
    totalNanoAiu: (latestSnap ? finiteOrNull(latestSnap.totalNanoAiu) : null) ?? base.totalNanoAiu ?? null,
    totalApiDurationMs: latestSnap ? finiteOrNull(latestSnap.totalApiDurationMs) : null,
    tokenDetails: td ? { inputTokens: Number(td.inputTokens || 0), outputTokens: Number(td.outputTokens || 0), cacheReadTokens: Number(td.cacheReadTokens || 0), cacheWriteTokens: Number(td.cacheWriteTokens || 0) } : null,
    models,
    agentBuckets,
    modelCalls: base.modelCalls,
    activeSec: base.activeSec,
    timeBuckets: base.timeBuckets,
    kickoffParentId,
    creationCallCount,
    spawnedTargetIds,
    _lines: base.lines,
  };
}

function publicSessionSummary(s, extra = {}) {
  return {
    sessionId: s.sessionId, repository: s.repository, createdAt: s.createdAt,
    pruAttribution: s.pruAttribution, pruCost: s.pruCost, usdCost: s.usdCost,
    userRequests: s.userRequests, totalNanoAiu: s.totalNanoAiu, activeSec: s.activeSec, ...extra,
  };
}

export function attributeCostChains({ prsByRepo = {}, repos = [], sessionsDir = null, from = null, to = null, pruUsd = 0.04, checkoutByRepo = {} } = {}) {
  const fromMs = from ? Date.parse(from) : -Infinity, toMs = to ? Date.parse(to) : Infinity;
  const repoFilter = new Set((repos || []).filter(Boolean).map((r) => r.toLowerCase()));
  const inRepoScope = (repo) => (repoFilter.size === 0 ? Boolean(repo) : Boolean(repo && repoFilter.has(repo.toLowerCase())));
  const inTimeWindow = (iso) => { const ms = Date.parse(iso || ""); return !Number.isFinite(ms) ? false : ms >= fromMs && ms < toMs; };

  const sessionsById = new Map();
  if (sessionsDir && existsSync(sessionsDir)) {
    for (const entry of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const wsPath = join(sessionsDir, entry.name, "workspace.yaml"), evPath = join(sessionsDir, entry.name, "events.jsonl");
      if (!existsSync(wsPath) || !existsSync(evPath)) continue;
      const s = parseCostSession(entry.name, wsPath, evPath, { pruUsd });
      sessionsById.set(s.idKey, { ...s, parentId: null, resolvedChildIds: new Set(), directPrKeys: [], consumedByPrKey: null });
    }
  }
  for (const s of sessionsById.values()) {
    if (s.kickoffParentId && s.kickoffParentId !== s.idKey && sessionsById.has(s.kickoffParentId)) {
      s.parentId = s.kickoffParentId;
      sessionsById.get(s.kickoffParentId).resolvedChildIds.add(s.idKey);
    }
  }
  for (const p of sessionsById.values()) {
    for (const targetId of p.spawnedTargetIds) {
      if (targetId === p.idKey || !sessionsById.has(targetId)) continue;
      p.resolvedChildIds.add(targetId);
      const child = sessionsById.get(targetId);
      if (!child.parentId) child.parentId = p.idKey;
    }
  }
  for (const p of sessionsById.values()) p.spawnedChildCount = Math.max(p.creationCallCount, p.resolvedChildIds.size);

  const cycleNodeIds = new Set();
  for (const s of sessionsById.values()) {
    const seen = new Map();
    let curr = s, idx = 0;
    while (curr) {
      if (seen.has(curr.idKey)) {
        const startIdx = seen.get(curr.idKey);
        for (const [k, i] of seen) if (i >= startIdx) cycleNodeIds.add(k);
        break;
      }
      seen.set(curr.idKey, idx++);
      curr = curr.parentId ? sessionsById.get(curr.parentId) : null;
    }
  }

  const allPrEntries = [];
  for (const [repo, prs] of Object.entries(prsByRepo || {})) {
    if (repoFilter.size > 0 && !repoFilter.has(repo.toLowerCase())) continue;
    for (const pr of prs || []) {
      const mMs = Date.parse(pr.mergedAt || pr.createdAt || "");
      if (Number.isFinite(toMs) && Number.isFinite(mMs) && mMs >= toMs) continue;
      const inWin = !Number.isFinite(fromMs) || !Number.isFinite(mMs) || mMs >= fromMs;
      allPrEntries.push({ repo, pr, prKey: `${repo}#${pr.number}`, inWin, mergedMs: mMs });
    }
  }

  const chosenByPrKey = new Map();
  for (const item of allPrEntries) {
    const needle = item.pr.url || `https://github.com/${item.repo}/pull/${item.pr.number}`;
    const needleRe = new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`);
    let best = null, bestHits = 0;
    for (const s of sessionsById.values()) {
      if (s.repository && s.repository.toLowerCase() !== item.repo.toLowerCase()) continue;
      const cMs = Date.parse(s.createdAt || "");
      if (Number.isFinite(item.mergedMs) && Number.isFinite(cMs) && cMs > item.mergedMs) continue;
      let hits = 0;
      for (const l of s._lines) if (needleRe.test(l)) hits += 1;
      if (hits > bestHits) { bestHits = hits; best = s; }
    }
    if (best) { chosenByPrKey.set(item.prKey, best); best.directPrKeys.push(item.prKey); }
  }

  const prRows = [], unmatchedPrKeys = [], countedSessionIds = new Set();
  for (const item of allPrEntries) {
    const s = chosenByPrKey.get(item.prKey);
    const ancestors = [];
    let hadSharedParent = false;
    if (s && s.directPrKeys.length === 1 && !cycleNodeIds.has(s.idKey)) {
      const visited = new Set([s.idKey]);
      let curr = s.parentId ? sessionsById.get(s.parentId) : null;
      while (curr && !visited.has(curr.idKey)) {
        visited.add(curr.idKey);
        if (cycleNodeIds.has(curr.idKey) || curr.spawnedChildCount !== 1 || curr.directPrKeys.length > 0) {
          hadSharedParent = true;
          break;
        }
        ancestors.push(curr);
        curr.consumedByPrKey = item.prKey;
        curr = curr.parentId ? sessionsById.get(curr.parentId) : null;
      }
    } else if (s && cycleNodeIds.has(s.idKey)) {
      hadSharedParent = true;
    }
    if (!item.inWin) continue;

    const checkoutDir = checkoutByRepo?.[item.repo] || null;
    const route = classifyRoute(item.pr, { checkoutDir }), prodLines = productionLinesChanged(item.pr);
    if (!s) {
      unmatchedPrKeys.push(item.prKey);
      prRows.push({
        prKey: item.prKey, repo: item.repo, number: item.pr.number, title: item.pr.title || "", url: item.pr.url || `https://github.com/${item.repo}/pull/${item.pr.number}`,
        mergedAt: item.pr.mergedAt || null, route, prodLines, attribution: "unmatched_non_copilot_or_missing_session", ideationAttribution: "none",
        sessionId: null, exclusiveAncestorIds: [], directPruCost: null, directUsdCost: null, chainPruCost: null, chainUsdCost: null,
        chainPruStatus: "unmatched", chainNanoAiu: null, chainUserRequests: null, chainActiveSec: null,
      });
      continue;
    }
    if (s.directPrKeys.length > 1) {
      prRows.push({
        prKey: item.prKey, repo: item.repo, number: item.pr.number, title: item.pr.title || "", url: item.pr.url || `https://github.com/${item.repo}/pull/${item.pr.number}`,
        mergedAt: item.pr.mergedAt || null, route, prodLines, attribution: "ambiguous", ideationAttribution: "none",
        sessionId: s.sessionId, exclusiveAncestorIds: [], directPruCost: null, directUsdCost: null, chainPruCost: null, chainUsdCost: null,
        chainPruStatus: "ambiguous_shared_session", chainNanoAiu: null, chainUserRequests: null, chainActiveSec: null,
      });
      continue;
    }
    const chainNodes = [s, ...ancestors];
    for (const node of chainNodes) countedSessionIds.add(node.idKey);
    const missingParentSnap = s.pruCost !== null && ancestors.some((a) => a.pruCost === null);
    const allHavePru = chainNodes.every((n) => n.pruCost !== null);
    const chainPruCost = allHavePru ? chainNodes.reduce((acc, n) => acc + n.pruCost, 0) : null;
    const chainPruStatus = allHavePru ? "exact" : missingParentSnap ? "partial_parent_snapshot_unavailable" : "snapshot_unavailable";
    const allHaveNano = chainNodes.every((n) => n.totalNanoAiu !== null);
    const allHaveReqs = chainNodes.every((n) => n.userRequests !== null);
    const allHaveActive = chainNodes.every((n) => Number.isFinite(n.activeSec));
    prRows.push({
      prKey: item.prKey, repo: item.repo, number: item.pr.number, title: item.pr.title || "", url: item.pr.url || `https://github.com/${item.repo}/pull/${item.pr.number}`,
      mergedAt: item.pr.mergedAt || null, route, prodLines, attribution: "unique",
      ideationAttribution: ancestors.length > 0 ? "exclusive_parent" : hadSharedParent ? "shared_parent_unallocated" : "none",
      sessionId: s.sessionId, exclusiveAncestorIds: ancestors.map((a) => a.sessionId),
      directPruCost: s.pruCost, directUsdCost: s.usdCost,
      chainPruCost, chainUsdCost: chainPruCost !== null ? chainPruCost * pruUsd : null,
      chainPruStatus,
      chainNanoAiu: allHaveNano ? chainNodes.reduce((acc, n) => acc + n.totalNanoAiu, 0) : null,
      chainUserRequests: allHaveReqs ? chainNodes.reduce((acc, n) => acc + n.userRequests, 0) : null,
      chainActiveSec: allHaveActive ? chainNodes.reduce((acc, n) => acc + n.activeSec, 0) : null,
    });
  }

  const inWinPrKeySet = new Set(prRows.map((r) => r.prKey));
  const sharedPrSessions = [], sharedCoordinators = [], unmergedSessions = [], unscopedChats = [];
  for (const s of sessionsById.values()) {
    delete s._lines;
    if (s.consumedByPrKey || countedSessionIds.has(s.idKey)) continue;
    if (s.directPrKeys.length > 1) {
      const inWinKeys = s.directPrKeys.filter((k) => inWinPrKeySet.has(k));
      if (inWinKeys.length > 0) {
        countedSessionIds.add(s.idKey);
        sharedPrSessions.push(publicSessionSummary(s, { prKeys: s.directPrKeys, inWindowPrKeys: inWinKeys }));
      }
      continue;
    }
    if (s.directPrKeys.length === 1) continue; // Matched to an out-of-window PR.
    const isCoord = cycleNodeIds.has(s.idKey) || s.spawnedChildCount > 1;
    const hasScopedChild = [...s.resolvedChildIds].some((cid) => inRepoScope(sessionsById.get(cid)?.repository));
    if (isCoord && (inRepoScope(s.repository) || hasScopedChild) && (inTimeWindow(s.createdAt) || [...s.resolvedChildIds].some((cid) => inTimeWindow(sessionsById.get(cid)?.createdAt)))) {
      countedSessionIds.add(s.idKey);
      sharedCoordinators.push(publicSessionSummary(s, { spawnedChildCount: s.spawnedChildCount, cycleDetected: cycleNodeIds.has(s.idKey) }));
      continue;
    }
    if (!inTimeWindow(s.createdAt)) continue;
    if (!s.repository) {
      unscopedChats.push(publicSessionSummary(s));
      if (repoFilter.size === 0) countedSessionIds.add(s.idKey);
    } else if (inRepoScope(s.repository)) {
      countedSessionIds.add(s.idKey);
      unmergedSessions.push(publicSessionSummary(s));
    }
  }

  let scopedTotalPru = 0, scopedSnapshotCount = 0, scopedMissingSnapshotCount = 0, scopedNanoAiu = 0;
  for (const idKey of countedSessionIds) {
    const s = sessionsById.get(idKey);
    if (s.pruCost !== null) { scopedTotalPru += s.pruCost; scopedSnapshotCount += 1; }
    else scopedMissingSnapshotCount += 1;
    if (s.totalNanoAiu !== null) scopedNanoAiu += s.totalNanoAiu;
  }
  const unscopedPru = unscopedChats.reduce((acc, c) => acc + (c.pruCost ?? 0), 0);
  return {
    prRows,
    countedSessions: [...countedSessionIds].map((idKey) => sessionsById.get(idKey)),
    unattributed: {
      sharedPrSessions,
      sharedCoordinators,
      unmergedSessions,
      unmatchedPrKeys,
      unscopedChatSpend: {
        includedInScopedTotals: repoFilter.size === 0,
        sessionCount: unscopedChats.length,
        pruCost: unscopedPru,
        usdCost: unscopedPru * pruUsd,
        sessions: unscopedChats,
      },
    },
    totals: {
      scopedSessionCount: countedSessionIds.size,
      scopedSnapshotCount,
      scopedMissingSnapshotCount,
      scopedTotalPru,
      scopedTotalUsd: scopedTotalPru * pruUsd,
      scopedNanoAiu,
    },
  };
}

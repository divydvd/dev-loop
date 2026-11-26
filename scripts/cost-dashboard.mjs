#!/usr/bin/env node
// Read-only ideation-to-merge cost dashboard for dev-loop repositories.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { classifyRoute, fetchMergedPrs, parseSessionEvents, productionLinesChanged } from "./collect-metrics.mjs";

const CREATION_TOOLS = new Set(["create_session", "open_issue_session", "open_pr_session", "fork_session"]);
const REVIEW_AGENT_RE = /\b(?:review|skeptic-judge|arch-correctness|concurrency-state|security-privacy|ui-a11y)\b/i;
const SPAWN_ID_RE = /(?:\bid:\s*|ghapp:\/\/sessions\/)([0-9a-f-]{8,})/gi;
const DAY_MS = 86_400_000;
const finiteOrNull = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function parseWorkspaceYaml(filePath) {
  const out = Object.create(null);
  if (filePath && existsSync(filePath)) {
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) { const m = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/); if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
  }
  return out;
}

export function parseCostSession(sessionId, wsPath, eventsPath, { pruUsd = 0.04 } = {}) {
  const ws = parseWorkspaceYaml(wsPath), base = parseSessionEvents(eventsPath);
  let latestSnap = null, kickoffParentId = null, seenFirstUserMsg = false, creationCallCount = 0;
  const creationCalls = new Set(), spawnedTargetIds = [];
  for (const line of base.lines) {
    if (!line.trim() || (!line.includes("session.") && !line.includes("user.message") && !line.includes("tool.execution_"))) continue;
    let evt; try { evt = JSON.parse(line); } catch { continue; }
    const { type, data = {} } = evt, isMain = !evt.agentId;
    if ((type === "session.usage_checkpoint" || type === "session.shutdown") && finiteOrNull(data.accountingSnapshot?.totalPremiumRequestCost) !== null) {
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
  const pruCost = latestSnap ? finiteOrNull(latestSnap.totalPremiumRequestCost) : null, hasSnap = pruCost !== null, models = Object.create(null);
  const userRequests = latestSnap ? finiteOrNull(latestSnap.totalUserRequests) : null;
  const mEntries = Object.entries(latestSnap?.modelMetrics || {}), sumApiReqs = mEntries.reduce((a, [, m]) => a + Number(m?.requests?.count || 0), 0);
  for (const [modelName, m] of mEntries) {
    const requests = Number(m?.requests?.count || 0), mCost = Number(m?.requests?.cost || 0), nanoAiu = Number(m?.totalNanoAiu ?? m?.requests?.nanoAiu ?? 0), u = m?.usage || {};
    const userTurns = userRequests !== null && userRequests > 0 ? (mEntries.length === 1 ? userRequests : sumApiReqs === userRequests ? requests : null) : null;
    models[modelName] = { requests, userTurns, pruCost: mCost, nanoAiu, multiplier: userTurns ? mCost / userTurns : null, usage: { inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0), cacheReadTokens: Number(u.cacheReadTokens || 0), cacheWriteTokens: Number(u.cacheWriteTokens || 0) } };
  }
  const agentBuckets = { main: { requests: 0, pruCost: 0, nanoAiu: 0 }, review: { requests: 0, pruCost: 0, nanoAiu: 0 }, otherSubagents: { requests: 0, pruCost: 0, nanoAiu: 0 } };
  for (const [key, ag] of Object.entries(latestSnap?.agentMetrics || {})) {
    const bucket = key === "main" || /^main$/i.test(String(ag?.agentName || "")) ? "main" : REVIEW_AGENT_RE.test(`${ag?.agentName || ""} ${ag?.agentDisplayName || ""}`) ? "review" : "otherSubagents";
    const mList = Object.values(ag?.modelMetrics || {});
    agentBuckets[bucket].requests += mList.length ? mList.reduce((a, x) => a + Number(x?.requests?.count || 0), 0) : Number(ag?.requests?.count || 0);
    agentBuckets[bucket].pruCost += mList.length ? mList.reduce((a, x) => a + Number(x?.requests?.cost || 0), 0) : Number(ag?.requests?.cost || 0);
    agentBuckets[bucket].nanoAiu += Number(ag?.totalNanoAiu ?? ag?.requests?.nanoAiu ?? 0);
  }
  const td = latestSnap?.tokenDetails, idStr = String(ws.id || sessionId);
  return Object.defineProperty({
    sessionId: idStr, idKey: idStr.toLowerCase(), repository: ws.repository || null, createdAt: ws.created_at || null,
    pruAttribution: hasSnap ? "exact" : "snapshot_unavailable", pruCost, usdCost: hasSnap ? pruCost * pruUsd : null, userRequests,
    totalNanoAiu: (latestSnap ? finiteOrNull(latestSnap.totalNanoAiu) : null) ?? base.totalNanoAiu ?? null,
    totalApiDurationMs: latestSnap ? finiteOrNull(latestSnap.totalApiDurationMs) : null,
    tokenDetails: td ? { inputTokens: Number(td.input?.tokenCount ?? td.inputTokens ?? 0), outputTokens: Number(td.output?.tokenCount ?? td.outputTokens ?? 0), cacheReadTokens: Number(td.cache_read?.tokenCount ?? td.cacheReadTokens ?? 0), cacheWriteTokens: Number(td.cache_write?.tokenCount ?? td.cacheWriteTokens ?? 0) } : null,
    models, agentBuckets, modelCalls: base.modelCalls, activeSec: base.activeSec, timeBuckets: base.timeBuckets,
    kickoffParentId, creationCallCount, spawnedTargetIds,
  }, "_lines", { value: base.lines });
}

const publicSessionSummary = (s, extra = {}) => ({ sessionId: s.sessionId, repository: s.repository, createdAt: s.createdAt, pruAttribution: s.pruAttribution, pruCost: s.pruCost, usdCost: s.usdCost, userRequests: s.userRequests, totalNanoAiu: s.totalNanoAiu, activeSec: s.activeSec, ...extra });
const makePrRow = (item, route, prodLines, extra) => ({ prKey: item.prKey, repo: item.repo, number: item.pr.number, title: item.pr.title || "", url: item.pr.url || `https://github.com/${item.repo}/pull/${item.pr.number}`, mergedAt: item.pr.mergedAt || null, route, prodLines, ideationAttribution: "none", sessionId: null, exclusiveAncestorIds: [], directPruCost: null, directUsdCost: null, chainPruCost: null, chainUsdCost: null, chainNanoAiu: null, chainUserRequests: null, chainActiveSec: null, ...extra });

export function attributeCostChains({ prsByRepo = {}, repos = [], sessionsDir = null, from = null, to = null, pruUsd = 0.04, checkoutByRepo = {} } = {}) {
  const fromMs = from ? Date.parse(from) : -Infinity, toMs = to ? Date.parse(to) : Infinity;
  const repoFilter = new Set((repos || []).filter(Boolean).map((r) => r.toLowerCase()));
  const inRepoScope = (repo) => (repoFilter.size === 0 ? Boolean(repo) : Boolean(repo && repoFilter.has(repo.toLowerCase())));
  const inTimeWindow = (iso) => { const ms = Date.parse(iso || ""); return Number.isFinite(ms) && ms >= fromMs && ms < toMs; };
  const sessionsById = new Map(), linesById = new Map();
  if (sessionsDir && existsSync(sessionsDir)) {
    for (const entry of readdirSync(sessionsDir, { withFileTypes: true })) {
      const wsPath = join(sessionsDir, entry.name, "workspace.yaml"), evPath = join(sessionsDir, entry.name, "events.jsonl");
      if (!entry.isDirectory() || !existsSync(wsPath) || !existsSync(evPath)) continue;
      try {
        const s = parseCostSession(entry.name, wsPath, evPath, { pruUsd });
        linesById.set(s.idKey, s._lines); sessionsById.set(s.idKey, { ...s, parentId: null, resolvedChildIds: new Set(), directPrKeys: [], consumedByPrKey: null });
      } catch (err) { if (err?.code !== "ENOENT") throw err; }
    }
  }
  for (const s of sessionsById.values()) {
    if (s.kickoffParentId && s.kickoffParentId !== s.idKey && sessionsById.has(s.kickoffParentId)) {
      s.parentId = s.kickoffParentId; sessionsById.get(s.kickoffParentId).resolvedChildIds.add(s.idKey);
    }
  }
  for (const p of sessionsById.values()) {
    for (const tid of p.spawnedTargetIds) {
      if (tid === p.idKey || !sessionsById.has(tid)) continue;
      p.resolvedChildIds.add(tid);
      if (!sessionsById.get(tid).parentId) sessionsById.get(tid).parentId = p.idKey;
    }
    p.spawnedChildCount = Math.max(p.creationCallCount, p.resolvedChildIds.size);
  }
  const cycleNodeIds = new Set();
  for (const s of sessionsById.values()) {
    const seen = new Map(); let curr = s, idx = 0;
    while (curr) {
      if (seen.has(curr.idKey)) { for (const [k, i] of seen) if (i >= seen.get(curr.idKey)) cycleNodeIds.add(k); break; }
      seen.set(curr.idKey, idx++); curr = curr.parentId ? sessionsById.get(curr.parentId) : null;
    }
  }
  const allPrEntries = [];
  for (const [repo, prs] of Object.entries(prsByRepo || {})) {
    if (repoFilter.size > 0 && !repoFilter.has(repo.toLowerCase())) continue;
    for (const pr of prs || []) {
      const mMs = Date.parse(pr.mergedAt || pr.createdAt || "");
      if (Number.isFinite(toMs) && Number.isFinite(mMs) && mMs >= toMs) continue;
      allPrEntries.push({ repo, pr, prKey: `${repo}#${pr.number}`, inWin: !Number.isFinite(fromMs) || !Number.isFinite(mMs) || mMs >= fromMs, mergedMs: mMs });
    }
  }
  const chosenByPrKey = new Map();
  for (const item of allPrEntries) {
    const needle = item.pr.url || `https://github.com/${item.repo}/pull/${item.pr.number}`;
    const needleRe = new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`);
    let best = null, bestHits = 0;
    for (const s of sessionsById.values()) {
      if (!s.repository || s.repository.toLowerCase() !== item.repo.toLowerCase()) continue;
      const cMs = Date.parse(s.createdAt || "");
      if (Number.isFinite(item.mergedMs) && Number.isFinite(cMs) && cMs > item.mergedMs) continue;
      let hits = 0; for (const l of linesById.get(s.idKey) || []) if (needleRe.test(l)) hits += 1;
      if (hits > bestHits) { bestHits = hits; best = s; }
    }
    if (best) { chosenByPrKey.set(item.prKey, best); best.directPrKeys.push(item.prKey); }
  }
  linesById.clear();
  const prRows = [], unmatchedPrKeys = [], countedSessionIds = new Set();
  for (const item of allPrEntries) {
    const s = chosenByPrKey.get(item.prKey), ancestors = [];
    let hadSharedParent = Boolean(s && cycleNodeIds.has(s.idKey));
    if (s && s.directPrKeys.length === 1 && !cycleNodeIds.has(s.idKey)) {
      const visited = new Set([s.idKey]); let curr = s.parentId ? sessionsById.get(s.parentId) : null;
      while (curr && !visited.has(curr.idKey)) {
        visited.add(curr.idKey);
        if (cycleNodeIds.has(curr.idKey) || curr.spawnedChildCount !== 1 || curr.directPrKeys.length > 0) { hadSharedParent = true; break; }
        ancestors.push(curr); curr.consumedByPrKey = item.prKey; curr = curr.parentId ? sessionsById.get(curr.parentId) : null;
      }
    }
    if (!item.inWin) continue;
    const coDir = checkoutByRepo && Object.hasOwn(checkoutByRepo, item.repo) ? checkoutByRepo[item.repo] : null;
    const route = classifyRoute(item.pr, { checkoutDir: coDir }), prodLines = productionLinesChanged(item.pr);
    if (!s) { unmatchedPrKeys.push(item.prKey); prRows.push(makePrRow(item, route, prodLines, { attribution: "unmatched_non_copilot_or_missing_session", chainPruStatus: "unmatched" })); continue; }
    if (s.directPrKeys.length > 1) { prRows.push(makePrRow(item, route, prodLines, { attribution: "ambiguous", sessionId: s.sessionId, chainPruStatus: "ambiguous_shared_session" })); continue; }
    const chainNodes = [s, ...ancestors];
    for (const n of chainNodes) countedSessionIds.add(n.idKey);
    const allPru = chainNodes.every((n) => n.pruCost !== null), chainPruCost = allPru ? chainNodes.reduce((a, n) => a + n.pruCost, 0) : null;
    prRows.push(makePrRow(item, route, prodLines, {
      attribution: "unique", ideationAttribution: ancestors.length > 0 ? "exclusive_parent" : hadSharedParent ? "shared_parent_unallocated" : "none",
      sessionId: s.sessionId, exclusiveAncestorIds: ancestors.map((a) => a.sessionId), directPruCost: s.pruCost, directUsdCost: s.usdCost,
      chainPruCost, chainUsdCost: chainPruCost !== null ? chainPruCost * pruUsd : null,
      chainPruStatus: allPru ? "exact" : s.pruCost !== null && ancestors.some((a) => a.pruCost === null) ? "partial_parent_snapshot_unavailable" : "snapshot_unavailable",
      chainNanoAiu: chainNodes.every((n) => n.totalNanoAiu !== null) ? chainNodes.reduce((a, n) => a + n.totalNanoAiu, 0) : null,
      chainUserRequests: chainNodes.every((n) => n.userRequests !== null) ? chainNodes.reduce((a, n) => a + n.userRequests, 0) : null,
      chainActiveSec: chainNodes.every((n) => Number.isFinite(n.activeSec)) ? chainNodes.reduce((a, n) => a + n.activeSec, 0) : null,
    }));
  }
  const inWinPrKeySet = new Set(prRows.map((r) => r.prKey)), sharedPrSessions = [], sharedCoordinators = [], unmergedSessions = [], unscopedChats = [];
  for (const s of sessionsById.values()) {
    if (s.directPrKeys.length > 1) {
      const inWinKeys = s.directPrKeys.filter((k) => inWinPrKeySet.has(k));
      if (inWinKeys.length) { countedSessionIds.add(s.idKey); sharedPrSessions.push(publicSessionSummary(s, { prKeys: s.directPrKeys, inWindowPrKeys: inWinKeys })); }
    }
  }
  for (const s of sessionsById.values()) {
    if (s.consumedByPrKey || countedSessionIds.has(s.idKey) || s.directPrKeys.length >= 1) continue;
    const childs = [...s.resolvedChildIds].map((c) => sessionsById.get(c)).filter(Boolean);
    const isCoord = cycleNodeIds.has(s.idKey) || s.spawnedChildCount > 1 || childs.some((c) => c.directPrKeys.length > 1 || c.spawnedChildCount > 1);
    if (isCoord && (inRepoScope(s.repository) || childs.some((c) => inRepoScope(c.repository))) && (inTimeWindow(s.createdAt) || childs.some((c) => countedSessionIds.has(c.idKey) || inTimeWindow(c.createdAt)))) {
      countedSessionIds.add(s.idKey); sharedCoordinators.push(publicSessionSummary(s, { spawnedChildCount: s.spawnedChildCount, cycleDetected: cycleNodeIds.has(s.idKey) })); continue;
    }
    if (!inTimeWindow(s.createdAt)) continue;
    if (!s.repository) { unscopedChats.push(publicSessionSummary(s)); if (repoFilter.size === 0) countedSessionIds.add(s.idKey); }
    else if (inRepoScope(s.repository)) { countedSessionIds.add(s.idKey); unmergedSessions.push(publicSessionSummary(s)); }
  }
  let rawTotalPru = 0, scopedSnapshotCount = 0, scopedMissingSnapshotCount = 0, scopedNanoAiu = 0;
  for (const idKey of countedSessionIds) {
    const s = sessionsById.get(idKey);
    if (s.pruCost !== null) { rawTotalPru += s.pruCost; scopedSnapshotCount += 1; } else scopedMissingSnapshotCount += 1;
    if (s.totalNanoAiu !== null) scopedNanoAiu += s.totalNanoAiu;
  }
  const scopedTotalPru = countedSessionIds.size > 0 && scopedSnapshotCount === 0 ? null : rawTotalPru;
  const unscopedPru = unscopedChats.length > 0 && !unscopedChats.some((c) => c.pruCost !== null) ? null : unscopedChats.reduce((a, c) => a + (c.pruCost ?? 0), 0);
  return {
    prRows, countedSessions: [...countedSessionIds].map((idKey) => sessionsById.get(idKey)),
    unattributed: { sharedPrSessions, sharedCoordinators, unmergedSessions, unmatchedPrKeys, unscopedChatSpend: { includedInScopedTotals: repoFilter.size === 0, sessionCount: unscopedChats.length, pruCost: unscopedPru, usdCost: unscopedPru !== null ? unscopedPru * pruUsd : null, sessions: unscopedChats } },
    totals: { scopedSessionCount: countedSessionIds.size, scopedSnapshotCount, scopedMissingSnapshotCount, scopedTotalPru, scopedTotalUsd: scopedTotalPru !== null ? scopedTotalPru * pruUsd : null, scopedNanoAiu },
  };
}

const median = (vals) => { const n = vals.filter((v) => Number.isFinite(v)).sort((a, b) => a - b); if (!n.length) return null; const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; };
const mean = (vals) => { const n = vals.filter((v) => Number.isFinite(v)); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };

export function fetchRepoActionsCost(repo, { from = null, to = null, maxRuns = 100, usdPerMin = 0.008, execFn = execFileSync } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ""))) return { status: "unavailable", runsCounted: 0, truncated: false, ubuntuMinutes: null, usdCost: null };
  const fromMs = from ? Date.parse(from) : -Infinity, toMs = to ? Date.parse(to) : Infinity;
  const createdQ = from && to ? `&created=${encodeURIComponent(`${from}..${to}`)}` : from ? `&created=${encodeURIComponent(`>=${from}`)}` : to ? `&created=${encodeURIComponent(`<${to}`)}` : "";
  try {
    const inWin = [], seenIds = new Set(), maxPages = Math.max(5, Math.ceil(maxRuns / 100) + 1); let truncated = false;
    for (let page = 1; page <= maxPages; page++) {
      const runs = JSON.parse(execFn("gh", ["api", `repos/${repo}/actions/runs?per_page=100&page=${page}${createdQ}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }))?.workflow_runs || [];
      if (!runs.length) break;
      let passedLower = false;
      for (const r of runs) {
        if (r?.id != null && seenIds.has(r.id)) continue;
        const ms = Date.parse(r.created_at || "");
        if (Number.isFinite(toMs) && Number.isFinite(ms) && ms >= toMs) continue;
        if (Number.isFinite(fromMs) && Number.isFinite(ms) && ms < fromMs) { passedLower = true; continue; }
        if (inWin.length >= maxRuns) { truncated = true; break; }
        if (r?.id != null) seenIds.add(r.id);
        inWin.push(r);
      }
      if (truncated || passedLower || runs.length < 100) break;
      if (page === maxPages) truncated = true;
    }
    let totalMs = 0;
    for (const r of inWin) totalMs += Number(JSON.parse(execFn("gh", ["api", `repos/${repo}/actions/runs/${r.id}/timing`], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }))?.billable?.UBUNTU?.total_ms || 0);
    const ubuntuMinutes = totalMs / 60_000;
    return { status: "ok", runsCounted: inWin.length, truncated, ubuntuMinutes, usdCost: ubuntuMinutes * usdPerMin };
  } catch { return { status: "unavailable", runsCounted: 0, truncated: false, ubuntuMinutes: null, usdCost: null }; }
}

export function buildCostDashboardReport({ prsByRepo = {}, repos = [], sessionsDir = null, from = null, to = null, pruUsd = 0.04, checkoutByRepo = {}, includeActions = false, actionsUsdPerMin = 0.008, maxActionsRuns = 100, execFn = execFileSync } = {}) {
  const attr = attributeCostChains({ prsByRepo, repos, sessionsDir, from, to, pruUsd, checkoutByRepo });
  const routeBuckets = Object.fromEntries(["trivial", "small", "multi-task"].map((route) => {
    const items = attr.prRows.filter((r) => r.route === route), u = items.filter((r) => r.attribution === "unique");
    return [route, { count: items.length, uniqueCount: u.length, medianProdLines: median(items.map((r) => r.prodLines)), medianDirectPru: median(u.map((r) => r.directPruCost)), medianChainPru: median(u.map((r) => r.chainPruCost)), medianChainUsd: median(u.map((r) => r.chainUsdCost)), meanChainPru: mean(u.map((r) => r.chainPruCost)), medianChainNanoAiu: median(u.map((r) => r.chainNanoAiu)), medianActiveSec: median(u.map((r) => r.chainActiveSec)) }];
  }));
  const modelMap = new Map(), agentTotals = { main: { requests: 0, pruCost: 0, nanoAiu: 0 }, review: { requests: 0, pruCost: 0, nanoAiu: 0 }, otherSubagents: { requests: 0, pruCost: 0, nanoAiu: 0 } };
  let snapPru = 0, snapReqs = 0, excessOneXPru = 0;
  for (const s of attr.countedSessions) {
    if (s.pruCost !== null && s.userRequests !== null) { snapPru += s.pruCost; snapReqs += s.userRequests; excessOneXPru += Math.max(0, s.pruCost - s.userRequests); }
    for (const [mName, m] of Object.entries(s.models || {})) {
      const cur = modelMap.get(mName) || { model: mName, requests: 0, observedTurns: 0, observedTurnPru: 0, pruCost: 0, nanoAiu: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      cur.requests += m.requests; cur.pruCost += m.pruCost; cur.nanoAiu += m.nanoAiu; cur.inputTokens += m.usage.inputTokens; cur.outputTokens += m.usage.outputTokens; cur.cacheReadTokens += m.usage.cacheReadTokens; cur.cacheWriteTokens += m.usage.cacheWriteTokens;
      if (m.userTurns) { cur.observedTurns += m.userTurns; cur.observedTurnPru += m.pruCost; }
      modelMap.set(mName, cur);
    }
    for (const k of ["main", "review", "otherSubagents"]) { agentTotals[k].requests += s.agentBuckets[k].requests; agentTotals[k].pruCost += s.agentBuckets[k].pruCost; agentTotals[k].nanoAiu += s.agentBuckets[k].nanoAiu; }
  }
  const modelBreakdown = [...modelMap.values()].map(({ observedTurns, observedTurnPru, ...m }) => ({ ...m, multiplier: observedTurns > 0 ? observedTurnPru / observedTurns : null, usdCost: m.pruCost * pruUsd })).sort((a, b) => b.pruCost - a.pruCost || b.requests - a.requests);
  const totalAgentPru = agentTotals.main.pruCost + agentTotals.review.pruCost + agentTotals.otherSubagents.pruCost, totalAgentNano = agentTotals.main.nanoAiu + agentTotals.review.nanoAiu + agentTotals.otherSubagents.nanoAiu;
  const agentBreakdown = Object.fromEntries(Object.entries(agentTotals).map(([k, v]) => [k, { ...v, usdCost: v.pruCost * pruUsd, share: totalAgentNano > 0 ? v.nanoAiu / totalAgentNano : totalAgentPru > 0 ? v.pruCost / totalAgentPru : null }]));
  const uniqueChains = attr.prRows.filter((r) => r.attribution === "unique" && r.chainPruCost !== null), targetRepos = repos.length ? repos : Object.keys(prsByRepo);
  let actionsCost = { status: "disabled", runsCounted: 0, truncated: false, ubuntuMinutes: null, usdCost: null, perRepo: {} };
  if (includeActions) {
    const perRepo = Object.fromEntries(targetRepos.map((r) => [r, fetchRepoActionsCost(r, { from, to, maxRuns: maxActionsRuns, usdPerMin: actionsUsdPerMin, execFn })]));
    const vals = Object.values(perRepo), okVals = vals.filter((v) => v.status === "ok"), mins = okVals.length ? okVals.reduce((a, v) => a + v.ubuntuMinutes, 0) : null;
    actionsCost = { status: vals.length && vals.every((v) => v.status === "ok") ? "ok" : okVals.length ? "partial" : "unavailable", runsCounted: vals.reduce((a, v) => a + v.runsCounted, 0), truncated: vals.some((v) => v.truncated), ubuntuMinutes: mins, usdCost: mins !== null ? mins * actionsUsdPerMin : null, perRepo };
  }
  return {
    generatedAt: new Date().toISOString(), window: { from, to }, repos: targetRepos, pruUsd, totals: attr.totals, routeBuckets, modelBreakdown, agentBreakdown, prRows: attr.prRows, unattributed: attr.unattributed, actionsCost,
    simulatorBaseline: {
      totalSnapshotPru: snapPru, totalSnapshotUserRequests: snapReqs, observedOneXCapSavingsRate: snapPru > 0 ? excessOneXPru / snapPru : 0,
      medianFeatureChainPru: median(uniqueChains.map((r) => r.chainPruCost)), meanFeatureChainPru: mean(uniqueChains.map((r) => r.chainPruCost)), defaultTurnReductionPct: 25,
      plans: [{ id: "pro-10", label: "$10 Pro", monthlyUsd: 10, includedPru: 300 }, { id: "budget-20", label: "$20 Budget", monthlyUsd: 20, includedPru: pruUsd > 0 ? Math.round(20 / pruUsd) : 500 }, { id: "pro-plus-39", label: "$39 Pro+", monthlyUsd: 39, includedPru: 1500 }],
    },
  };
}

const fmtUsd = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : "n/a");
const fmtPru = (n) => (Number.isFinite(n) ? `${n.toFixed(1)} PRU` : "n/a");
const fmtAiu = (n) => (Number.isFinite(n) ? `${(n / 1e9).toFixed(2)} AIU` : "n/a");

export function formatCostMarkdown(r) {
  const routeLines = ["trivial", "small", "multi-task"].map((k) => { const b = r.routeBuckets[k]; return `| ${k} | ${b.count} | ${b.uniqueCount} | ${b.medianProdLines ?? "n/a"} | ${fmtPru(b.medianDirectPru)} | ${fmtPru(b.medianChainPru)} | ${fmtUsd(b.medianChainUsd)} | ${fmtAiu(b.medianChainNanoAiu)} |`; });
  const prLines = r.prRows.map((p) => `| ${p.prKey} | ${p.route} | ${p.attribution} (${p.ideationAttribution}) | ${fmtPru(p.directPruCost)} | ${fmtPru(p.chainPruCost)} | ${fmtUsd(p.chainUsdCost)} |`);
  const actLine = r.actionsCost.status === "disabled" ? "disabled" : r.actionsCost.ubuntuMinutes !== null ? `${r.actionsCost.ubuntuMinutes.toFixed(1)} min (${fmtUsd(r.actionsCost.usdCost)}${r.actionsCost.truncated ? ", truncated" : ""})` : r.actionsCost.status;
  return [
    `# Dev-loop Cost Dashboard (${r.repos.join(", ") || "workspace"})`, "",
    `- Scoped spend: **${fmtPru(r.totals.scopedTotalPru)}** (**${fmtUsd(r.totals.scopedTotalUsd)}** at $${r.pruUsd}/PRU · **${fmtAiu(r.totals.scopedNanoAiu)}**)`,
    `- Observed 1x-model cap savings: **${(r.simulatorBaseline.observedOneXCapSavingsRate * 100).toFixed(1)}%**`,
    `- GitHub Actions Ubuntu spend: **${actLine}**`,
    `- Unattributed sessions: shared-PR=${r.unattributed.sharedPrSessions.length}, shared-coordinators=${r.unattributed.sharedCoordinators.length}, unmerged=${r.unattributed.unmergedSessions.length}, unscoped-chats=${r.unattributed.unscopedChatSpend.sessionCount}`,
    "", "| Route | PRs | Unique chains | Median prod lines | Median direct | Median chain | Median USD | Median AIU |", "| --- | --- | --- | --- | --- | --- | --- | --- |", ...routeLines,
    "", "| PR | Route | Attribution | Direct PRU | Chain PRU | Chain USD |", "| --- | --- | --- | --- | --- | --- |", ...(prLines.length ? prLines : ["| none | - | - | - | - | - |"]),
  ].join("\n");
}

export function renderCostDashboardHtml(r) {
  const attrCount = r.prRows.filter((p) => p.attribution === "unique" && p.chainPruCost !== null).length;
  const unattrList = [...r.unattributed.sharedPrSessions, ...r.unattributed.sharedCoordinators, ...r.unattributed.unmergedSessions];
  const unattrPru = unattrList.length > 0 && !unattrList.some((s) => s.pruCost !== null) ? null : unattrList.reduce((a, s) => a + (s.pruCost ?? 0), 0);
  const actText = r.actionsCost.status === "disabled" ? "Off (--include-actions)" : r.actionsCost.ubuntuMinutes !== null ? `${r.actionsCost.ubuntuMinutes.toFixed(1)}m (${fmtUsd(r.actionsCost.usdCost)}${r.actionsCost.truncated ? ", truncated" : ""})` : esc(r.actionsCost.status);
  const routeRowsHtml = ["trivial", "small", "multi-task"].map((k) => { const b = r.routeBuckets[k]; return `<tr><td><span class="badge">${esc(k)}</span></td><td>${b.count}</td><td>${b.uniqueCount}</td><td>${b.medianProdLines ?? "n/a"}</td><td>${fmtPru(b.medianDirectPru)}</td><td>${fmtPru(b.medianChainPru)}</td><td>${fmtUsd(b.medianChainUsd)}</td><td>${fmtAiu(b.medianChainNanoAiu)}</td><td>${b.medianActiveSec !== null ? `${b.medianActiveSec.toFixed(0)}s` : "n/a"}</td></tr>`; }).join("");
  const modelRowsHtml = r.modelBreakdown.length ? r.modelBreakdown.map((m) => `<tr><td><code>${esc(m.model)}</code></td><td>${m.multiplier !== null ? `${m.multiplier.toFixed(2)}x` : "n/a"}</td><td>${m.requests}</td><td>${fmtPru(m.pruCost)}</td><td>${fmtUsd(m.usdCost)}</td><td>${m.inputTokens.toLocaleString()} / ${m.outputTokens.toLocaleString()}</td></tr>`).join("") : `<tr><td colspan="6">No snapshot model metrics in window.</td></tr>`;
  const agentHtml = ["main", "review", "otherSubagents"].map((k) => { const b = r.agentBreakdown[k], pct = b.share !== null ? (b.share * 100).toFixed(1) : "0.0"; return `<div class="bar-row"><div><strong>${esc(k)}</strong> (${b.requests} reqs · ${fmtPru(b.pruCost)} · ${fmtAiu(b.nanoAiu)})</div><div class="track"><div class="fill" style="width:${pct}%"></div></div><span>${pct}%</span></div>`; }).join("");
  const repoOpts = [...new Set(r.prRows.map((p) => p.repo))].map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  const planBtns = r.simulatorBaseline.plans.map((p, idx) => `<button type="button" class="plan-btn${idx === 1 ? " active" : ""}" aria-pressed="${idx === 1 ? "true" : "false"}" data-pru="${p.includedPru}" data-usd="${p.monthlyUsd}">${esc(p.label)} (${p.includedPru} PRUs)</button>`).join("");
  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dev-loop Ideation-to-Merge Cost Dashboard</title><style>
:root,[data-theme="light"]{color-scheme:light;--bg:#f6f8fa;--card:#fff;--fg:#1f2328;--muted:#59636e;--border:#d0d7de;--accent:#0969da;--accent-soft:#ddf4ff;--ok:#1a7f37;--warn:#9a6700;--warn-soft:#fff8c5}[data-theme="dark"]{color-scheme:dark;--bg:#0d1117;--card:#161b22;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--accent:#58a6ff;--accent-soft:#1f3247;--ok:#3fb950;--warn:#f2cc60;--warn-soft:#3d2e00}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}a{color:var(--accent)}main{max-width:1180px;margin:0 auto;padding:24px;display:grid;gap:18px}header,.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px}.card{overflow-x:auto}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}h1,h2,h3{margin:0 0 8px}p{margin:0 0 8px;color:var(--muted)}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.kpi strong{display:block;font-size:22px;color:var(--fg)}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px;border-bottom:1px solid var(--border);text-align:left}th{color:var(--muted);font-weight:600}button,select,input{font:inherit;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button.active{background:var(--accent);color:#fff;border-color:var(--accent)}[data-theme="dark"] button.active{color:#0d1117;font-weight:600}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:600}.badge.warn{background:var(--warn-soft);color:var(--warn)}.controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.bar-row{display:grid;grid-template-columns:minmax(140px,220px) minmax(60px,1fr) 48px;gap:10px;align-items:center;margin:8px 0}.track{height:10px;background:var(--border);border-radius:999px;overflow:hidden}.fill{height:100%;background:var(--accent);transition:width .2s ease}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{transition:none!important;animation:none!important}}</style></head><body><main>
<header><div><h1>Dev-loop Ideation-to-Merge Cost Dashboard</h1><p><strong>Abstract:</strong> Feature spend spans parent planning sessions, implementation checkouts, and review subagents. This report links exclusive parent chains to merged pull requests from local telemetry. Use it to inspect true feature cost and plan monthly credit budgets.</p>
<p>Scope: <code>${esc(r.repos.join(", ") || "All workspace sessions")}</code> · Rate: <code>$${r.pruUsd.toFixed(2)}/PRU</code> · Snapshots: <code>${r.totals.scopedSnapshotCount}/${r.totals.scopedSessionCount}</code></p></div><button id="themeBtn" type="button" aria-pressed="false" aria-label="Toggle color theme">Toggle dark/light</button></header>
<section class="kpis" aria-label="Key cost indicators"><div class="card kpi"><span>Scoped Copilot Spend</span><strong>${fmtPru(r.totals.scopedTotalPru)}</strong><span>${fmtUsd(r.totals.scopedTotalUsd)} · ${fmtAiu(r.totals.scopedNanoAiu)}</span></div><div class="card kpi"><span>Median Feature Chain</span><strong>${fmtPru(r.simulatorBaseline.medianFeatureChainPru)}</strong><span>${fmtUsd(r.simulatorBaseline.medianFeatureChainPru !== null ? r.simulatorBaseline.medianFeatureChainPru * r.pruUsd : null)} · Mean: ${fmtPru(r.simulatorBaseline.meanFeatureChainPru)} (${attrCount} PRs)</span></div>
<div class="card kpi"><span>Observed 1x-Cap Savings</span><strong>${(r.simulatorBaseline.observedOneXCapSavingsRate * 100).toFixed(1)}%</strong><span>Exact from model multipliers</span></div><div class="card kpi"><span>Unattributed / WIP Spend</span><strong>${fmtPru(unattrPru)}</strong><span>${fmtUsd(unattrPru !== null ? unattrPru * r.pruUsd : null)} in repo scope</span></div><div class="card kpi"><span>GitHub Actions (Separate)</span><strong>${actText}</strong><span>Excluded from Copilot PRU cap</span></div></section>
<section class="card" aria-labelledby="simHeading"><h2 id="simHeading">Monthly Subscription &amp; Budget Simulator</h2><div class="controls" role="group" aria-label="Subscription plan presets">${planBtns}<label>Custom $/mo <input id="customUsd" type="number" min="1" step="1" value="20" style="width:78px"></label><label>Turn reduction: <strong id="turnVal">25%</strong> <input id="turnSlider" type="range" min="0" max="50" value="25"></label><span class="badge warn">Projected until M2 Budget Mode</span></div><p id="simSummary" role="status" aria-live="polite"></p></section>
<div class="grid2"><section class="card"><h2>Cost by Task Route</h2><table><thead><tr><th>Route</th><th>PRs</th><th>Unique</th><th>Med Lines</th><th>Direct</th><th>Chain</th><th>USD</th><th>AIU</th><th>Active</th></tr></thead><tbody>${routeRowsHtml}</tbody></table></section><section class="card"><h2>Main vs Review Subagent Split</h2>${agentHtml}<h3 style="margin-top:14px">Model Multipliers</h3><table><thead><tr><th>Model</th><th>Mult</th><th>Reqs</th><th>PRUs</th><th>USD</th><th>In / Out Tokens</th></tr></thead><tbody>${modelRowsHtml}</tbody></table></section></div>
<section class="card"><h2>Per-PR Ideation-to-Merge Ledger</h2><div class="controls"><label>Repo <select id="repoFilter"><option value="">All</option>${repoOpts}</select></label><label>Route <select id="routeFilter"><option value="">All</option><option value="trivial">trivial</option><option value="small">small</option><option value="multi-task">multi-task</option></select></label><label>Sort <select id="sortBy"><option value="pru">Chain PRU (desc)</option><option value="date">Merged date (newest)</option><option value="lines">Prod lines (desc)</option></select></label></div>
<table><thead><tr><th>PR</th><th>Route</th><th>Lines</th><th>Attribution</th><th>Direct PRU</th><th>Chain PRU</th><th>Chain USD</th></tr></thead><tbody id="prBody"></tbody></table></section>
<section class="card"><h2>Unattributed &amp; Workspace Spend Disclosure</h2><p>Shared multi-PR sessions: <strong>${r.unattributed.sharedPrSessions.length}</strong> · Multi-child coordinators: <strong>${r.unattributed.sharedCoordinators.length}</strong> · Unmerged WIP/exploration sessions: <strong>${r.unattributed.unmergedSessions.length}</strong> · Unmatched PRs: <strong>${r.unattributed.unmatchedPrKeys.length}</strong> · Repo-less chats: <strong>${r.unattributed.unscopedChatSpend.sessionCount}</strong> (${fmtPru(r.unattributed.unscopedChatSpend.pruCost)}, ${r.unattributed.unscopedChatSpend.includedInScopedTotals ? "included in workspace total" : "excluded from repo total"}).</p>
<p><strong>Conclusion:</strong> Review the highest-multiplier models and review-subagent share before enabling Budget Mode. Milestone 2 adds an opt-in budget switch to cap model multipliers and batch routine checks without lowering safety gates. Legacy sessions without accounting snapshots stay labeled unavailable so medians remain exact.</p></section></main><script>
const DATA=${safeJson({ pruUsd: r.pruUsd, sim: r.simulatorBaseline, prRows: r.prRows })},escHtml=(s)=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),themeBtn=document.getElementById("themeBtn");
if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.dataset.theme="dark";themeBtn.setAttribute("aria-pressed","true");}
themeBtn.onclick=()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;themeBtn.setAttribute("aria-pressed",String(next==="dark"));};
let activeBudgetPru=DATA.sim.plans[1].includedPru;
function updateSim(){
  const turnPct=Number(document.getElementById("turnSlider").value||0),med=DATA.sim.medianFeatureChainPru,el=document.getElementById("simSummary");
  document.getElementById("turnVal").textContent=turnPct+"%";
  if(activeBudgetPru<=0){el.textContent="Enter a monthly budget above $0 (with PRU rate > $0) to estimate feature capacity.";return;}
  if(med===null){el.textContent="n/a — No uniquely attributed PRs with exact accounting snapshots in this window.";return;}
  if(med===0){el.textContent="Budget capacity ("+activeBudgetPru.toFixed(0)+" PRUs): 0.0 PRU median (0x included models) — unlimited PRU feature capacity within plan rules.";return;}
  const curPrs=activeBudgetPru/med,optMed=Math.max(Math.min(med,0.5),med*(1-DATA.sim.observedOneXCapSavingsRate)*(1-turnPct/100)),optPrs=activeBudgetPru/optMed;
  el.textContent="Budget capacity ("+activeBudgetPru.toFixed(0)+" PRUs): ~"+curPrs.toFixed(1)+" features/mo at current median ("+med.toFixed(1)+" PRU) -> ~"+optPrs.toFixed(1)+" features/mo ("+optMed.toFixed(1)+" PRU/feature) with observed 1x cap ("+(DATA.sim.observedOneXCapSavingsRate*100).toFixed(1)+"% saved) + "+turnPct+"% projected turn reduction.";
}
for(const btn of document.querySelectorAll(".plan-btn"))btn.onclick=()=>{for(const b of document.querySelectorAll(".plan-btn")){b.classList.remove("active");b.setAttribute("aria-pressed","false");}btn.classList.add("active");btn.setAttribute("aria-pressed","true");activeBudgetPru=Number(btn.dataset.pru);document.getElementById("customUsd").value=btn.dataset.usd;updateSim();};
document.getElementById("customUsd").oninput=(e)=>{const u=Number(e.target.value);for(const b of document.querySelectorAll(".plan-btn")){b.classList.remove("active");b.setAttribute("aria-pressed","false");}activeBudgetPru=u>0&&DATA.pruUsd>0?u/DATA.pruUsd:0;updateSim();};
document.getElementById("turnSlider").oninput=updateSim;
function renderPrs(){
  const rf=document.getElementById("repoFilter").value,rtf=document.getElementById("routeFilter").value,sb=document.getElementById("sortBy").value,tbody=document.getElementById("prBody");
  const rows=DATA.prRows.filter((p)=>(!rf||p.repo===rf)&&(!rtf||p.route===rtf)).slice().sort((a,b)=>sb==="date"?(Date.parse(b.mergedAt||"")||-1)-(Date.parse(a.mergedAt||"")||-1):sb==="lines"?(b.prodLines??-1)-(a.prodLines??-1):(b.chainPruCost??b.directPruCost??-1)-(a.chainPruCost??a.directPruCost??-1));
  if(!rows.length){tbody.innerHTML='<tr><td colspan="7">No matching pull requests in window.</td></tr>';return;}
  tbody.innerHTML=rows.map((p)=>{const href=/^https?:\\/\\//i.test(String(p.url||""))?escHtml(p.url):"#",st=p.attribution==="unique"?p.ideationAttribution+(p.chainPruStatus!=="exact"?" · "+p.chainPruStatus:""):p.attribution;return '<tr><td><a href="'+href+'" target="_blank" rel="noopener noreferrer">'+escHtml(p.prKey)+"</a> — "+escHtml(p.title)+"</td><td>"+escHtml(p.route)+"</td><td>"+(p.prodLines??"n/a")+'</td><td><span class="badge">'+escHtml(st)+"</span></td><td>"+(p.directPruCost!==null?p.directPruCost.toFixed(1):"n/a")+"</td><td>"+(p.chainPruCost!==null?p.chainPruCost.toFixed(1):"n/a")+"</td><td>"+(p.chainUsdCost!==null?"$"+p.chainUsdCost.toFixed(2):"n/a")+"</td></tr>";}).join("");
}
for(const id of["repoFilter","routeFilter","sortBy"])document.getElementById(id).onchange=renderPrs;
updateSim();renderPrs();
</script></body></html>`;
}

const parseNonNegNumber = (raw, flagName) => {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (String(raw).trim() === "" || !Number.isFinite(n) || n < 0) throw new Error(`Invalid ${flagName}: expected non-negative number, got "${raw}"`);
  return n;
};

export function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { repo: { type: "string", multiple: true }, "prs-file": { type: "string" }, "sessions-dir": { type: "string" }, from: { type: "string" }, to: { type: "string" }, "pru-usd": { type: "string" }, "include-actions": { type: "boolean", default: false }, "actions-usd-per-min": { type: "string" }, "max-actions-runs": { type: "string" }, format: { type: "string", default: "html" }, out: { type: "string" }, "checkout-dir": { type: "string" } } });
  const format = String(values.format || "html").toLowerCase();
  if (!["html", "json", "markdown"].includes(format)) throw new Error(`Invalid --format: expected html, json, or markdown, got "${values.format}"`);
  const pruUsd = parseNonNegNumber(values["pru-usd"], "--pru-usd") ?? 0.04, actionsUsdPerMin = parseNonNegNumber(values["actions-usd-per-min"], "--actions-usd-per-min") ?? 0.008;
  const maxActionsRuns = values["max-actions-runs"] === undefined ? 100 : Number(values["max-actions-runs"]);
  if (!Number.isInteger(maxActionsRuns) || maxActionsRuns < 1) throw new Error(`Invalid --max-actions-runs: expected integer >= 1, got "${values["max-actions-runs"]}"`);
  const nowMs = Date.now(), to = values.to || new Date(nowMs).toISOString(), from = values.from || new Date(nowMs - 30 * DAY_MS).toISOString();
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) throw new Error(`Invalid date window: --from (${from}) must be earlier than --to (${to})`);
  const repos = (values.repo || []).flatMap((r) => r.split(",")).map((r) => r.trim()).filter(Boolean), prsByRepo = Object.create(null);
  const sessionsDir = values["sessions-dir"] ? resolve(values["sessions-dir"]) : join(homedir(), ".copilot", "session-state");
  if (values["prs-file"]) {
    const raw = JSON.parse(readFileSync(resolve(values["prs-file"]), "utf8"));
    if (Array.isArray(raw)) { for (const pr of raw) { const rk = String(pr?.url || "").match(/github\.com\/([^/]+\/[^/]+)\/pull\//i)?.[1] || repos[0] || "local/repo"; (prsByRepo[rk] ||= []).push(pr); } }
    else Object.assign(prsByRepo, raw);
  } else for (const r of repos) prsByRepo[r] = fetchMergedPrs(r, { cutoffMs: Date.parse(from) - 7 * DAY_MS });
  const effRepos = repos.length ? repos : Object.keys(prsByRepo), checkoutByRepo = values["checkout-dir"] && effRepos.length === 1 ? { [effRepos[0]]: resolve(values["checkout-dir"]) } : {};
  const report = buildCostDashboardReport({ prsByRepo, repos, sessionsDir, from, to, pruUsd, checkoutByRepo, includeActions: Boolean(values["include-actions"]), actionsUsdPerMin, maxActionsRuns });
  const output = format === "json" ? `${JSON.stringify(report, null, 2)}\n` : format === "markdown" ? `${formatCostMarkdown(report)}\n` : renderCostDashboardHtml(report);
  if (values.out) { const p = resolve(values.out); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, output, "utf8"); return { stdout: "", outPath: p }; }
  return { stdout: output, outPath: null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const res = runCli(); if (res.stdout) process.stdout.write(res.stdout); }
  catch (err) { process.stderr.write(`${err?.message || err}\n`); process.exit(1); }
}


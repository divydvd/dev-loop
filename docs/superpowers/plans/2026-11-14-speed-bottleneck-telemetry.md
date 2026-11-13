# Milestone 4: Agent Speed & Bottleneck Telemetry Implementation Plan (`0.5.12`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only active work time (`activeSec`), 5 bottleneck buckets (`modelSec`, `buildTestSec`, `pollSec`, `subagentSec`, `ioOtherSec`), `humanWaitSec` exclusion, and `parallelismFactor` to `scripts/collect-metrics.mjs`, `scripts/run-benchmark.mjs`, and `skills/infra-review/SKILL.md` (`v0.5.12`).

**Architecture:** Extend `parseSessionEvents` in `scripts/collect-metrics.mjs` with an `O(n log n)` `mergeIntervals` helper over `events.jsonl` timestamps (`!evt.agentId` main-timeline intervals plus deduplicated `subagent` intervals), aggregate route-bucketed `medianActiveSec`, `dominantBottleneck`, and `medianParallelism` in `collectMetrics`, surface `medianActiveSec` and diagnostic `activeSecRatio` in `scripts/run-benchmark.mjs`, and gate weekly speed optimization in `skills/infra-review/SKILL.md` behind the existing `90.0%` `Durable first-pass yield` floor.

**Tech Stack:** Node.js ESM (`node:test`, `node:fs`, `node:path`), Markdown skill instructions.

**Spec:** Approved Milestone 4 design (`2026-11-14`, owner-approved in session).

## Acceptance record
- **Goal:** Measure active agent work time (excluding human waits and between-turn idle pauses), 5 bottleneck buckets, and parallel tool execution ratios from `events.jsonl` in `scripts/collect-metrics.mjs` and `scripts/run-benchmark.mjs`, and wire constrained speed optimization into `skills/infra-review/SKILL.md` (`v0.5.12`).
- **Done when:**
  - [ ] `mergeIntervals(intervals)` merges unsorted and overlapping `[startMs, endMs]` pairs in `O(n log n)` time without double-counting parallel calls.
  - [ ] `parseSessionEvents(eventsPath)` in `scripts/collect-metrics.mjs` computes `activeSec`, `humanWaitSec` (`ask_user` / `relay_session_input`, excluded from `activeSec`), `parallelismFactor` (`sumToolSec / mergedToolSec`), and 5 active-time buckets (`modelSec`, `buildTestSec`, `pollSec`, `subagentSec`, `ioOtherSec`), ignoring nested subagent `evt.agentId` tool/turn duplicates and unclosed intervals.
  - [ ] `collectMetrics` and `formatMetricsMarkdown` report route-bucketed (`trivial`, `small`, `multi-task`) `medianActiveSec`, `dominantBottleneck`, and `medianParallelism`, while keeping shared multi-PR sessions marked `ambiguous` (`null` per-PR speed).
  - [ ] `scripts/run-benchmark.mjs` extracts `activeSec` and `parallelismFactor` from sandbox `events.jsonl`, reports `medianActiveSec` per variant in JSON and Markdown, and exposes `activeSecRatio` in `compareVariants` as diagnostic data without overriding safety, quality, or token-cost verdicts.
  - [ ] `skills/infra-review/SKILL.md` (Sections 2 and 4) documents the shadow-mode active-time breakdown and instructs weekly reviews to target the `dominantBottleneck` of the slowest recurring route (`>= 2` unique sessions) only when `Durable first-pass yield >= 90.0%` (`5/5` fresh `writing-skills` consumers pass).
  - [ ] `README.md`, `CHANGELOG.md`, `plugin.json` (`0.5.12`), and `.github/plugin/marketplace.json` (`0.5.12`) are updated; `com.github.copilot/rules/core.mdc` and `skills/dev-loop/assets/pr-body.md` remain unchanged (`0` diff lines); total changed production lines stay `<= 400` (estimated `~105` lines).
- **Required evidence:**
  - `node scripts/check.mjs` -> `check: no faults`.
  - `node --test scripts/*.test.mjs tools/work-ledger/*.test.mjs` -> all pass (`RED -> GREEN`).
  - `writing-skills` baseline (`RED`) and revised (`GREEN`, `5/5`) subagent checks on `skills/infra-review/SKILL.md`.
  - Temporary `COPILOT_HOME` install and `plugin` / `instruction` / `skill` list smoke check (`v0.5.12`).
  - Independent `code-review` subagent verdict before first push.
- **Stop conditions:**
  - Stop after opening the Milestone 4 PR and completing CI + review rounds; merge only on typed owner approval.

## Milestone table
| Milestone ID | Outcome | PR | Status |
| --- | --- | --- | --- |
| `M1` | Read-only objective telemetry collector (`scripts/collect-metrics.mjs`, `v0.5.9`) | [#37](https://github.com/divydvd/dev-loop/pull/37) | Merged (`10dea59`) |
| `M2` | `90.0%` quality floor, route-cost priority, and 4-week non-safety check cleanup (`v0.5.10`) | [#38](https://github.com/divydvd/dev-loop/pull/38) | Merged (`4dffe51`) |
| `M3` | Executable isolated Git benchmark runner (`scripts/run-benchmark.mjs`, `v0.5.11`) | [#39](https://github.com/divydvd/dev-loop/pull/39) | Merged (`2834597`) |
| `M4` | Active work time, 5-box bottleneck breakdown, and parallelism telemetry (`v0.5.12`) | Pending | In progress |

## Global Constraints
- `com.github.copilot/rules/core.mdc` and `skills/dev-loop/assets/pr-body.md` must have `0` changed lines.
- Changed production lines across the PR must stay `<= 400` lines (estimated `~105` lines).
- Inline backtick paths inside `skills/infra-review/SKILL.md` must never start with bare `scripts/`; prefix repo commands with `node <dev-loop-checkout>/scripts/...`.
- Speed is strictly subordinate to safety and the `90.0%` `Durable first-pass yield` floor; noisy wall-clock timing must never flip `compareVariants` verdicts on its own.

## Review Focus
1. **Nested subagent events in `events.jsonl`:** Events with `evt.agentId` run inside a parent `task` tool call; only `!evt.agentId` events feed `modelSec`, `buildTestSec`, `pollSec`, and `ioOtherSec`, while `subagentSec` merges `!evt.agentId` `task`/`read_agent` intervals with `subagent.started -> subagent.completed` intervals.
2. **Between-turn reading pauses and `ask_user` human waits:** Human reading pauses between `assistant.turn_end` and the next `user.message` have zero active intervals, and `ask_user` / `relay_session_input` tool intervals go to `humanWaitSec` and are excluded from `activeSec` and `parallelismFactor`.
3. **Unclosed or negative-duration intervals:** Missing completion events or `endMs < startMs` are skipped safely; sessions with no valid timestamped active intervals report `activeSec: null` (never `0`).
4. **Overlapping cross-bucket intervals:** Per-bucket seconds use merged intervals within each bucket while `activeSec` uses the merged union across all 5 active buckets so `activeSec` never exceeds elapsed active clock time.
5. **Shared coordinator sessions across multiple PRs:** Shared sessions set per-PR `activeSec`, `humanWaitSec`, `parallelismFactor`, and `timeBuckets` to `null` (`attribution: "ambiguous"`).

## Test matrix
| Case ID | Requirement / risk | Input fixture | Expected result | Test location | Status |
| --- | --- | --- | --- | --- | --- |
| `S-T1` | Interval merging & clock guards | Unsorted, overlapping, touching, negative, and `NaN` intervals | Exact merged milliseconds; invalid intervals ignored | `scripts/collect-metrics.test.mjs` | passed (`ef50f36`..HEAD) |
| `S-T2` | Human wait & reading-gap exclusion | `events.jsonl` with 2-hour `ask_user` wait and 40-min gap between turns | `humanWaitSec === 7200`; `activeSec` counts only active turns/tools | `scripts/collect-metrics.test.mjs` | passed (`ef50f36`..HEAD) |
| `S-T3` | Parallel tools & `evt.agentId` isolation | 3 overlapping `task` calls (`60s` each in same `60s` window) with nested `evt.agentId` events | `subagentSec === 60`, `activeSec` not inflated, `parallelismFactor === 3.0` | `scripts/collect-metrics.test.mjs` | passed (`ef50f36`..HEAD) |
| `S-T4` | 5-box classification & route bottleneck | `gradlew`/`node --test` (`buildTestSec`), `check-runs`/`sleep` (`pollSec`), `view`/`edit` (`ioOtherSec`), shared vs unique sessions | Accurate per-bucket seconds, `dominantBottleneck`, and `null` on shared sessions | `scripts/collect-metrics.test.mjs` | passed |
| `S-T5` | Benchmark speed extraction & non-flaky verdict | `runBenchmark` + `compareVariants` with timestamped sandbox `events.jsonl` | Reports `medianActiveSec` and `activeSecRatio` without overriding verdicts | `scripts/run-benchmark.test.mjs` | passed |
| `T-IR7` | Constrained speed policy in `infra-review` | `Durable first-pass yield` `75%` vs `95%` with `pollSec` dominating `small` route + `1.0x` serial subagents | Below `90%`: fix quality first; at `95%`: target `pollSec` / serial subagents without weakening safety gates (`5/5` fresh consumers) | `scripts/testing-contract.test.mjs` | passed |

---

### Task 1: Baseline `writing-skills` RED check and `mergeIntervals` + `parseSessionEvents` speed buckets
**Files:**
- Modify: `scripts/collect-metrics.mjs:222-275`
- Test: `scripts/collect-metrics.test.mjs`

**Interfaces:**
- Produces: `mergeIntervals(intervals)` -> `Array<[number, number]>`; extends `parseSessionEvents(eventsPath)` with `{ activeSec, humanWaitSec, parallelismFactor, timeBuckets: { modelSec, buildTestSec, pollSec, subagentSec, ioOtherSec } }`.

- [ ] **Step 1: Run 5 fresh `explore` baseline consumers (`RED`) on `T-IR7` against current `skills/infra-review/SKILL.md`.**
- [ ] **Step 2: Write failing tests `S-T1`, `S-T2`, and `S-T3` in `scripts/collect-metrics.test.mjs` and watch them fail (`RED`).**
- [ ] **Step 3: Implement `mergeIntervals` and 5-box speed parsing in `scripts/collect-metrics.mjs`, verify `GREEN`, and commit.**

### Task 2: Route-bucketed speed & `dominantBottleneck` in `collectMetrics` and Markdown report
**Files:**
- Modify: `scripts/collect-metrics.mjs:277-415`
- Test: `scripts/collect-metrics.test.mjs`

**Interfaces:**
- Consumes: `activeSec`, `parallelismFactor`, `timeBuckets` from `parseSessionEvents`.
- Produces: `routeBuckets[route].{ medianActiveSec, medianParallelism, dominantBottleneck }` and Markdown table columns.

- [ ] **Step 1: Write failing test `S-T4` in `scripts/collect-metrics.test.mjs` and watch it fail (`RED`).**
- [ ] **Step 2: Implement route speed aggregation, `dominantBottleneck`, and `ambiguous` shared-session guards in `scripts/collect-metrics.mjs`, verify `GREEN`, and commit.**

### Task 3: Sandbox speed telemetry in `scripts/run-benchmark.mjs`
**Files:**
- Modify: `scripts/run-benchmark.mjs:270-375`
- Test: `scripts/run-benchmark.test.mjs`

**Interfaces:**
- Consumes: `activeSec` and `parallelismFactor` from `parseSessionEvents`.
- Produces: `activeSec`, `parallelismFactor`, `medianActiveSec`, and diagnostic `activeSecRatio`.

- [ ] **Step 1: Write failing test `S-T5` in `scripts/run-benchmark.test.mjs` and watch it fail (`RED`).**
- [ ] **Step 2: Implement sandbox speed aggregation and diagnostic `activeSecRatio` in `scripts/run-benchmark.mjs`, verify `GREEN`, and commit.**

### Task 4: Wire `skills/infra-review/SKILL.md`, docs, `0.5.12` manifests, `GREEN` skill eval, review, and PR
**Files:**
- Modify: `skills/infra-review/SKILL.md`, `scripts/testing-contract.test.mjs`, `README.md`, `CHANGELOG.md`, `plugin.json`, `.github/plugin/marketplace.json`

- [ ] **Step 1: Add failing contract test `T-IR7` in `scripts/testing-contract.test.mjs` (`RED`).**
- [ ] **Step 2: Update `skills/infra-review/SKILL.md`, `README.md`, `CHANGELOG.md`, and `0.5.12` manifests (`GREEN`).**
- [ ] **Step 3: Run 5 fresh `explore` consumers (`GREEN`, `5/5` pass), full CI suites, `check.mjs`, temporary `COPILOT_HOME` smoke test, and independent `code-review` subagent, then push and open PR.**

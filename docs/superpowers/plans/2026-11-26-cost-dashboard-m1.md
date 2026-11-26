# Ideation-to-Merge Cost Dashboard (M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (per `dev-loop` Core Rule 7 for `<= 6` tasks) and superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/cost-dashboard.mjs` to measure ideation-to-merge feature cost (Copilot PRUs, USD, AIUs, tokens, model multipliers, subagent split, and optional GitHub Actions minutes) and generate a self-contained HTML dashboard with a monthly budget simulator.

**Architecture:** Import read-only PR route classification and base event parsing from `scripts/collect-metrics.mjs` (`0` edits to `collect-metrics.mjs`), layer cumulative-safe `accountingSnapshot` parsing and cycle-safe `1:1` parent-session linking on top, and emit escaped HTML, JSON, or Markdown reports. Key pull requests by `<repo>#<number>` so multi-repository runs never collide.

**Tech Stack:** Node.js 22 built-ins (`node:fs`, `node:path`, `node:os`, `node:util`, `node:url`, `node:child_process`, `node:test`, `node:assert/strict`), zero npm dependencies, inline Primer-aligned CSS and vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-26-cost-dashboard-m1-design.md`

**UI Mockup:** `/Users/divydwivedi/.copilot/session-state/b82edb50-044f-4813-b1ee-c8e04f78f7bb/files/cost-dashboard-and-budget-mode.html`

## Abstract
`dev-loop` tracks session time and `totalNanoAiu`, but it does not report billed Copilot Premium Requests (`PRU`), equivalent dollar spend, or parent ideation session cost per merged feature. This plan implements Milestone 1 (`scripts/cost-dashboard.mjs` and `scripts/cost-dashboard.test.mjs`) to compute ideation-to-merge cost chains and render an offline HTML dashboard with a `$10` / `$20` / `$39` / custom monthly budget simulator. Existing collector outputs, `core.mdc` rules, and startup byte budgets remain unchanged.

## Acceptance record
- **Goal:** Give the owner an exact ideation-to-merge feature cost report (HTML, JSON, and Markdown) with PRU, USD, AIU, parent-chain attribution, and an interactive monthly budget simulator.
- **Done when:**
  - [ ] `scripts/cost-dashboard.mjs` extracts the latest `accountingSnapshot` per session without summing checkpoints, preserves `snapshot_unavailable` (`null` PRU/USD) on older sessions, and classifies `main`, `review`, and `otherSubagents` AIU shares (`T1`, `T2`).
  - [ ] Direct PR matching (`unique`, `ambiguous`, `unmatched_non_copilot_or_missing_session`) and parent linking (`first` `user.message` `agent-<uuid>` kickoff plus creation tool results) roll up `exclusive_parent` chains, isolate `sharedCoordinators` and cyclic links, flag `partial_parent_snapshot_unavailable`, and separate `unscopedChatSpend` when `--repo` is set (`T3`, `T4`, `T5`).
  - [ ] Multi-repo runs (`--repo a/one --repo b/two`), date windows (`--from`, `--to`), and optional `--include-actions` (capped at `--max-actions-runs`, excluded from PRU simulator math) produce accurate route medians, model multiplier tables, and observed `1x`-cap vs slider savings (`T6`, `T7`).
  - [ ] HTML output is self-contained (no network dependencies, light/dark toggle, `prefers-reduced-motion`, empty/`n/a` states), escapes untrusted PR titles, repo names, and `<script>` JSON payloads, and rejects invalid numeric CLI flags with a non-zero exit code (`T8`, `T9`).
  - [ ] `node scripts/check.mjs`, `node --test scripts/cost-dashboard.test.mjs`, all existing CI suites in `.github/workflows/check.yml`, and independent Step-5 diff review pass at `HEAD` (`T10`).
- **Required evidence:** `node --test scripts/cost-dashboard.test.mjs`, `node scripts/check.mjs`, all CI test suites in `.github/workflows/check.yml`, real local read-only smoke run on `~/.copilot/session-state` outputting HTML to a temp file outside the repo, and independent review coverage; no device test (`AGENTS.md`: this repo has no app).
- **Test matrix:** Saved below before implementation under `references/testing.md`.
- **Regression selection:** No `docs/testing/regression-matrix.md` file exists in this repo (explicit inventory note: existing `scripts/*.test.mjs` suites and `.github/workflows/check.yml` serve as the repository regression suite). Selected existing suites: `scripts/check.mjs`, `scripts/collect-metrics.test.mjs`, `scripts/testing-contract.test.mjs`, `scripts/portability-contract.test.mjs`, and `scripts/release.test.mjs` (plus full CI suite run at Verify). New permanent suite added in `.github/workflows/check.yml`: `scripts/cost-dashboard.test.mjs`.
- **UI reuse decision (`references/ui-reuse.md`):** This repository has no shared web UI library. Reuse the Primer-aligned CSS custom property palette, light/dark `[data-theme]` switcher, keyboard-focus styles, `prefers-reduced-motion` media query, and empty/`n/a` badge states established in `/Users/divydwivedi/.copilot/session-state/b82edb50-044f-4813-b1ee-c8e04f78f7bb/files/cost-dashboard-and-budget-mode.html`.
- **Size estimate:** Task 1: ~135 prod lines; Task 2: ~85 prod lines; Task 3: ~135 prod lines; Task 4: ~5 workflow lines. Total PR production code: ~360 lines (`<= 400` ceiling). Tests (`scripts/cost-dashboard.test.mjs`) and docs (`README.md`, `CHANGELOG.md`, specs/plans) excluded.
- **Milestone selection:** Two-milestone assignment (`M1` Cost Dashboard on `main` base `d5335e2`, followed by independent `M2` `Budget mode` switch after `M1` ships). `M1` delivers standalone value immediately without touching risky `core.mdc` instructions.
- **Out of scope:** Editing `com.github.copilot/rules/core.mdc`, `dev-loop-context.md`, `prepare-review-panel.mjs`, or active agent behavior (`M2`); npm dependencies; live web servers; modifying `scripts/collect-metrics.mjs` output fields.
- **Risky area:** None (`core.mdc`, approval points, and finish rules are untouched in `M1`).
- **Stop conditions:**
  - Done: each unwaived "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content, or a harmless-edit exemption has a recorded reason. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass (except any required test case explicitly marked waived by a direct typed owner chat message with its raw status and unverified risk recorded) and no unwaived required coverage gaps remain. A case marked not applicable needs a source or requirements reference and a recorded reason; it is not a pass.
  - Blocked: 3 failed fixes, missing access, no device for an unwaived device check, or a product decision. Normally, stop and report with the evidence.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1-cost-dashboard | Read-only ideation-to-merge cost analyzer + offline HTML/JSON/Markdown dashboard and budget simulator | `T1`–`T10`, `node scripts/check.mjs`, full CI suites, Step-5 review | None (`scripts/collect-metrics.mjs` exports already exist on `main`) | `divydvd-cost-dashboard-and-budget-mode` off `main` (`d5335e2`); standalone read-only tool | Workflow rules still use standard mode until `M2` adds the opt-in `Budget mode` switch | in_progress | none | Implement Tasks 1–4, verify, review, and open M1 PR |
| M2-budget-mode-switch | Opt-in `Budget mode` switch (`AGENTS.md`, `core.mdc`, `prepare-review-panel.mjs --budget`, skill guides, application checks) | `writing-skills` baseline/candidate checks, `check.mjs`, host sync, CLI smoke tests | Informed by `M1` cost baseline; touches `core.mdc` risky area (requires owner design + risky-plan review) | Separate branch/PR off `main` after `M1` | Not available after `M1` merge; simulator labels turn-reduction slider as projection until `M2` | planned | none | Start `M2` brainstorming/plan after `M1` PR is ready |

- Overall assignment: `M1` approved and entering build; `M2` deferred as the planned second PR so each PR stays single-concern and `<= 400` production lines.

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Latest `accountingSnapshot` without summing checkpoints; preserve `snapshot_unavailable` | yes | Session with checkpoints `10` then `25` PRUs + empty `session.shutdown`; second legacy session with only `totalNanoAiu` | First reports `pruCost: 25`, `usdCost: 1.00`; legacy reports `pruCost: null`, `pruAttribution: "snapshot_unavailable"`, valid `totalNanoAiu` | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T2 | Model multipliers and `main` / `review` / `otherSubagents` AIU split | yes | Snapshot with `claude-opus-5.5` (`cost: 30, count: 2 -> 15x`), `gpt-6.1-sol` (`cost: 4, count: 4 -> 1x`), `code-review` + `skeptic-judge` + `explore` subagents | Computes exact model multipliers (`15`, `1`) and splits AIUs into `main`, `review`, and `otherSubagents` | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T3 | Exclusive `1:1` parent chain (`agent-<uuid>` kickoff + creation tool) vs `sharedCoordinators` & unresolved wrapper IDs | yes | Parent `P1` spawns `C1` via first `user.message` `agent-P1`; `P2` calls `open_issue_session` twice (one unresolved wrapper UUID); `P3 <-> P4` cycle | `C1` chain sums `P1 + C1` (`exclusive_parent`); `P2`, `P3`, `P4` excluded from PR chains, listed in `sharedCoordinators`, zero infinite loop | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T4 | Partial parent snapshot (`partial_parent_snapshot_unavailable`) & shared/unmatched PR sessions | yes | Child `C` has `12` PRUs, exclusive parent `P` lacks `accountingSnapshot`; another session matches 2 PRs; Claude PR matches 0 sessions | Child row keeps `directPruCost: 12` but sets `chainPruCost: null` (`partial_parent_snapshot_unavailable`); 2-PR session is `ambiguous`; Claude PR is `unmatched_non_copilot_or_missing_session` | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T5 | `--repo`, `--from`, `--to`, and `unscopedChatSpend` isolation | yes | Pre-window exclusive parent + in-window PR session + repo-less standalone chat session, queried with and without `--repo` | Pre-window exclusive parent stays in PR chain; repo-less chat goes to `unscopedChatSpend` (excluded from repo total when `--repo` set, included when `--repo` omitted) | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T6 | Multi-repo same PR number (`a/one#12` vs `b/two#12`), route medians, and `1x`-cap simulator baseline | yes | Two repos both containing PR `#12` (`small` vs `multi-task`), mixed `15x` and `1x` turns | Both PRs preserved under `a/one#12` and `b/two#12`; route medians and `observedOneXCapSavingsRate` match exact arithmetic | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T7 | Optional `--include-actions` with `--max-actions-runs` cap and PRU simulator separation | yes | Mock `execFn` returning 3 workflow runs (`UBUNTU.total_ms`) capped at `--max-actions-runs 2` | Sums first 2 runs (`minutes`, `usdCost`), sets `truncated: true`, and leaves PRU simulator features/month unchanged | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T8 | Self-contained HTML escaping (`</script><img onerror=1>`), themes, simulator controls, and no raw prompt leaks | yes | Untrusted PR title/repo/model containing `</script><img src=x onerror=alert(1)>` and secret prompt text in `user.message` | Escapes HTML and `<\/script>` / `\u003c`, excludes `user.message` content, includes light/dark + `prefers-reduced-motion` + simulator controls, zero external URLs in `<link>`/`<script src>` | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T9 | CLI `--format html|json|markdown`, `--out`, and invalid flag rejection | yes | Spawn CLI with `--out <tmp>` for HTML/JSON/Markdown, and with `--pru-usd -1` or `--max-actions-runs 0` | Valid runs exit `0` and write expected output; invalid numeric flags exit non-zero with clear stderr error | automated (`node:test`) | `scripts/cost-dashboard.test.mjs` | not run | none | none |
| T10 | Repo check, existing collector/contract/release suites, and real read-only session-state smoke run | yes | Full repository + read-only run against local `~/.copilot/session-state` to `/tmp` | `node scripts/check.mjs` and all `.github/workflows/check.yml` suites exit `0`; `/tmp` dashboard renders non-empty real metrics without touching repo tree | automated + CLI smoke | `scripts/check.mjs`, `.github/workflows/check.yml` | not run | none | none |

- Category assessment:
  - Boundaries and invalid input -> `T1`, `T4`, `T7`, `T9` (empty snapshots, zero/negative CLI numbers, run caps, window edges).
  - Existing consumers & migration/compatibility -> `T1`, `T4`, `T10` (older sessions without `accountingSnapshot`, `collect-metrics.mjs` untouched so `collect-metrics.test.mjs` and `mine-pr-evidence.mjs` stay intact).
  - UI and accessibility -> `T8` (light/dark tokens, `prefers-reduced-motion`, keyboard-focusable controls, escaped untrusted strings, empty/`n/a` states).
  - Security and privacy -> `T8` (script-breakout XSS prevention and exclusion of prompt/PR-body text).
  - Permissions/state, concurrency/retries, partial failure/recovery, device, performance -> excluded for `M1` because `scripts/cost-dashboard.mjs` is a single-process read-only CLI report generator with no daemon, shared mutable state, or mobile app (`T10` smoke-tests real `338+`-session directory speed).
- Owner waivers: none.
- Required blockers: `T1`–`T10` not yet run (pre-implementation).
- Optional limits: GitHub Actions minutes are reported at the repository-window level (`skills/infra-review/SKILL.md` contract) rather than per-PR branch attribution because offline PR fixtures omit `headRefName` and `main` push runs share workflows.
- Reassessment: Update after implementation and review if source or consumers change.

## Global Constraints
- Production code changed in this PR must stay `<= 400` lines (`Core Rule 11`).
- Zero npm dependencies; use Node 22 built-in modules only.
- `+0` bytes added to always-loaded startup files (`AGENTS.md`, `com.github.copilot/rules/core.mdc`, `dev-loop-context.md`).
- Do not modify existing `scripts/collect-metrics.mjs` return shapes.
- Never sum cumulative `accountingSnapshot` checkpoints inside one session; read the latest `session.usage_checkpoint` or `session.shutdown` that contains `accountingSnapshot`.
- Never link parent/child sessions by raw UUID substring search across `events.jsonl`.
- Escape all untrusted strings (`repo`, PR `title`, `modelId`, `agentName`) in HTML and inline `<script>` JSON; never include `user.message` prompt text or PR `body` text in the output.
- Strip `NODE_TEST_CONTEXT` and `GIT_*` env vars if spawning child `node` or `git` processes inside `node:test`.

## Review Focus
1. **Cyclic or mutual `agent-<uuid>` messages (`A -> B -> A`):** Cycle guard during ancestor traversal must terminate and classify cyclic nodes as non-exclusive (`sharedCoordinators`) instead of looping forever (`T3`).
2. **Trailing `session.shutdown` without `accountingSnapshot` after valid `session.usage_checkpoint`:** Parser must retain the last non-null `accountingSnapshot` rather than overwriting it with `null` on shutdown (`T1`).
3. **Inline `<script>` breakout via PR title (`</script><script>alert(1)</script>`):** JSON embedded in HTML must replace `<` with `\u003c` (and `\u2028`/`\u2029`) in addition to HTML entity escaping in markup (`T8`).
4. **Invalid CLI numeric flags (`--pru-usd NaN`, `--pru-usd -0.5`, `--max-actions-runs 0`):** CLI argument validation must throw/exit `1` before computing `$NaN` (`T9`).
5. **Multi-repo PR number collision (`org/a#12` and `org/b#12`):** PR maps, rows, and shared-session references must use canonical key `${repo}#${number}` (`T6`).

---

### Task 1: Session Accounting Parser & Parent-to-PR Chain Attribution

**Files:**
- Create: `scripts/cost-dashboard.mjs`
- Create: `scripts/cost-dashboard.test.mjs`

**Interfaces:**
- Consumes from `./collect-metrics.mjs`: `parseSessionEvents(eventsPath)`, `productionLinesChanged(pr)`, `classifyRoute(pr, { checkoutDir })`, `fetchMergedPrs(repo, opts)`
- Produces in `scripts/cost-dashboard.mjs`:
  - `parseCostSession(sessionId, wsPath, eventsPath) -> SessionCostRecord`
  - `attributeCostChains({ prsByRepo, sessionsDir, from, to, pruUsd, checkoutByRepo }) -> AttributionResult`

- [x] **Step 1: Write failing tests `T1`–`T5` in `scripts/cost-dashboard.test.mjs`**

Cover:
- `T1`: Two `session.usage_checkpoint` events (`10` then `25` PRUs) followed by `session.shutdown` without `accountingSnapshot` -> `pruCost === 25`, `usdCost === 1.0`; legacy session without `accountingSnapshot` -> `pruCost === null`, `pruAttribution === "snapshot_unavailable"`, `totalNanoAiu` preserved.
- `T2`: `modelMetrics` (`claude-opus-5.5` `30/2 = 15x`, `gpt-6.1-sol` `4/4 = 1x`) and `agentMetrics` (`main`, `code-review`/`skeptic-judge` -> `review`, `explore` -> `otherSubagents`).
- `T3`: Exclusive `1:1` parent via child's first `user.message` `data.source === "agent-<parentId>"` rolls into `chainPruCost`; parent with 2 `open_issue_session` calls (one unresolved wrapper UUID) goes to `sharedCoordinators`; `P3 <-> P4` cycle terminates and goes to `sharedCoordinators`.
- `T4`: Child with snapshot + exclusive parent without snapshot sets `directPruCost: 12`, `chainPruCost: null`, `chainPruStatus: "partial_parent_snapshot_unavailable"`, `chainNanoAiu` summed; 2-PR session sets `attribution: "ambiguous"`; unmatched PR sets `attribution: "unmatched_non_copilot_or_missing_session"`.
- `T5`: Pre-window exclusive parent remains in in-window PR's chain; repo-less standalone chat is isolated under `unscopedChatSpend` when `repos` filter is non-empty and included in workspace total when `repos` is empty.

- [x] **Step 2: Run `node --test scripts/cost-dashboard.test.mjs` to confirm RED failure**

Run: `node --test scripts/cost-dashboard.test.mjs`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `scripts/cost-dashboard.mjs`).

- [x] **Step 3: Implement `parseCostSession` and `attributeCostChains` in `scripts/cost-dashboard.mjs`**

Key rules:
- Parse `workspace.yaml` once across all entries in `sessionsDir` before applying `--repo` or `[from, to)` filters.
- Identify review subagents via `/\b(?:review|skeptic-judge|arch-correctness|concurrency-state|security-privacy|ui-a11y)\b/i` on `agentName` or `agentDisplayName`.
- Extract kickoff parent strictly from the **first** non-system `user.message` with `data.source` matching `/^agent-([0-9a-f-]{8,})$/i`, plus creation tool results (`create_session`, `open_issue_session`, `open_pr_session`, `fork_session`) matching `/(?:\bid:\s*|ghapp:\/\/sessions\/)([0-9a-f-]{8,})/i`. Count every creation tool call toward `spawnedChildCount` (deduplicating when the same child appears in both parent tool output and child first `user.message`).
- Key PRs as `${repo}#${pr.number}`.

- [x] **Step 4: Run `node --test scripts/cost-dashboard.test.mjs` to confirm GREEN**

Run: `node --test scripts/cost-dashboard.test.mjs`
Expected: PASS (`T1`–`T5` green).

- [x] **Step 5: Commit Task 1**

```bash
git add docs/superpowers/specs/2026-11-26-cost-dashboard-m1-design.md docs/superpowers/plans/2026-11-26-cost-dashboard-m1.md scripts/cost-dashboard.mjs scripts/cost-dashboard.test.mjs
git commit -m "feat: add session accounting parser and parent-chain attribution"
```

---

### Task 2: Multi-Repo Rollups, Route Medians, Simulator Math & Optional Actions Cost

**Files:**
- Modify: `scripts/cost-dashboard.mjs`
- Modify: `scripts/cost-dashboard.test.mjs`

**Interfaces:**
- Consumes: `attributeCostChains(...)` from Task 1
- Produces in `scripts/cost-dashboard.mjs`:
  - `fetchRepoActionsCost(repo, { from, to, maxRuns, usdPerMin, execFn }) -> ActionsCostSummary`
  - `buildCostDashboardReport(options) -> CostDashboardReport`

- [x] **Step 1: Add failing tests `T6` and `T7` in `scripts/cost-dashboard.test.mjs`**

Cover:
- `T6`: Multi-repo input (`org/a#12` `small` and `org/b#12` `multi-task`) preserves both PRs, computes `routeBuckets` (`trivial`, `small`, `multi-task` median `directPruCost`, `chainPruCost`, `chainUsdCost`, `chainNanoAiu`, `activeSec`), aggregates `modelBreakdown` with exact `multiplier = cost / count`, and computes `simulatorBaseline` (`observedOneXCapSavingsRate` from `1 - sum(userRequests) / sum(pruCost)` on snapshot sessions, `0` when all `1x`).
- `T7`: `fetchRepoActionsCost` with mocked `execFn` sums `billable.UBUNTU.total_ms / 60000`, honors `maxRuns: 2` (`truncated: true`), and keeps `simulatorBaseline` PRU counts independent of Actions USD.

- [x] **Step 2: Run `node --test scripts/cost-dashboard.test.mjs` to verify RED failure**

Run: `node --test scripts/cost-dashboard.test.mjs`
Expected: FAIL (`buildCostDashboardReport` / `fetchRepoActionsCost` not exported).

- [x] **Step 3: Implement `fetchRepoActionsCost` and `buildCostDashboardReport` in `scripts/cost-dashboard.mjs`**

Keep Actions lookup optional (`includeActions: false` default -> `{ status: "disabled", runsCounted: 0, truncated: false, ubuntuMinutes: null, usdCost: null }`). On `gh api` error, return `{ status: "unavailable", ... }` instead of crashing offline reports.

- [x] **Step 4: Run `node --test scripts/cost-dashboard.test.mjs` to verify GREEN**

Run: `node --test scripts/cost-dashboard.test.mjs`
Expected: PASS (`T1`–`T7` green).

- [x] **Step 5: Commit Task 2**

```bash
git add scripts/cost-dashboard.mjs scripts/cost-dashboard.test.mjs
git commit -m "feat: add multi-repo cost rollups, simulator baseline, and Actions summary"
```

---

### Task 3: Self-Contained HTML Dashboard, Markdown/JSON CLI & Input Hardening

**Files:**
- Modify: `scripts/cost-dashboard.mjs`
- Modify: `scripts/cost-dashboard.test.mjs`

**Interfaces:**
- Consumes: `buildCostDashboardReport(options)` from Task 2
- Produces in `scripts/cost-dashboard.mjs`:
  - `renderCostDashboardHtml(report) -> string`
  - `formatCostMarkdown(report) -> string`
  - `runCli(argv) -> { stdout: string, outPath: string | null }` (invoked when run as main script)

- [x] **Step 1: Add failing tests `T8` and `T9` in `scripts/cost-dashboard.test.mjs`**

Cover:
- `T8`: Pass untrusted `</script><img src=x onerror=alert(1)>` in PR `title`, `repo`, and `modelId`, plus secret text `"SECRET_PROMPT_TOKEN_99"` in `user.message`. Assert `renderCostDashboardHtml` escapes `<` in HTML and `<script>` JSON (`!html.includes("</script><img")`), omits `"SECRET_PROMPT_TOKEN_99"`, contains no `https://` `<script` or `<link` external assets, includes `[data-theme]`, `@media (prefers-reduced-motion: reduce)`, `$10` / `$20` / `$39` plan presets, turn-reduction slider (`default` `25`), route table, PR filter/sort controls, and empty/`n/a` badges.
- `T9`: Spawn `node scripts/cost-dashboard.mjs` (stripping `NODE_TEST_CONTEXT` and `GIT_*` env vars) with `--prs-file`, `--sessions-dir`, `--format json|markdown|html`, and `--out`; assert exit `0`. Spawn with `--pru-usd -0.05`, `--pru-usd nope`, and `--max-actions-runs 0`; assert exit `1` and descriptive stderr message.

- [x] **Step 2: Run `node --test scripts/cost-dashboard.test.mjs` to verify RED failure**

Run: `node --test scripts/cost-dashboard.test.mjs`
Expected: FAIL (`renderCostDashboardHtml` / CLI not implemented).

- [x] **Step 3: Implement `renderCostDashboardHtml`, `formatCostMarkdown`, and CLI entrypoint in `scripts/cost-dashboard.mjs`**

Verify `wc -l scripts/cost-dashboard.mjs` stays `<= 400` lines. Use compact semantic HTML + Primer CSS variables (light & dark themes), accessible `<button>` / `<label>` / `<input type="range">` / `<select>` controls, client-side plan simulator (`$10` `300` PRUs, `$20` `500` PRU-eq, `$39` `1500` PRUs, custom USD) combining exact `observedOneXCapSavingsRate` with the `0%`–`50%` turn-reduction slider (clearly badged `"Projected until M2 Budget Mode"`), and safe JSON serialization (`JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")`).

- [x] **Step 4: Run `node --test scripts/cost-dashboard.test.mjs` and check line count**

Run: `node --test scripts/cost-dashboard.test.mjs && wc -l scripts/cost-dashboard.mjs`
Expected: PASS (`T1`–`T9` green) and `scripts/cost-dashboard.mjs` `<= 400` lines.

- [x] **Step 5: Commit Task 3**

```bash
git add scripts/cost-dashboard.mjs scripts/cost-dashboard.test.mjs
git commit -m "feat: add self-contained HTML cost dashboard, Markdown output, and CLI"
```

---

### Task 4: CI Wiring, Documentation, Manifest Version Sync (`0.5.24`) & Verification

**Files:**
- Modify: `.github/workflows/check.yml`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `plugin.json`
- Modify: `.github/plugin/marketplace.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `gemini-extension.json`

**Interfaces:**
- Consumes: `scripts/cost-dashboard.mjs` and `scripts/cost-dashboard.test.mjs` from Tasks 1–3
- Produces: CI registration, `README.md` table + `## Rule/check map` entry, synchronized `0.5.24` manifests + `CHANGELOG.md` entry, and `T10` verification evidence.

- [ ] **Step 1: Add `scripts/cost-dashboard.test.mjs` to `.github/workflows/check.yml` and `scripts/testing-contract.test.mjs` suite list (if asserted)**

Check `scripts/testing-contract.test.mjs` around line 250; add `node --test scripts/cost-dashboard.test.mjs` to `.github/workflows/check.yml`, document `scripts/cost-dashboard.mjs` in `README.md` (`## What it contains` and `## Rule/check map` with valid Markdown links to `scripts/cost-dashboard.mjs` and `scripts/cost-dashboard.test.mjs`), bump the 5 manifests to `0.5.24`, and add `## 0.5.24 (2026-11-26)` to `CHANGELOG.md` with `What`, `Why`, and `Check`.

- [ ] **Step 2: Run `node scripts/check.mjs` and all CI test suites (`T10`)**

Run: `node scripts/check.mjs && node --test scripts/*.test.mjs tools/work-ledger/*.test.mjs`
Expected: PASS with zero faults and zero test failures.

- [ ] **Step 3: Run read-only smoke test on real `~/.copilot/session-state` into `/tmp` and preview in Browser canvas**

Run `node scripts/cost-dashboard.mjs --repo divydvd/dev-loop --format html --out /tmp/dev-loop-cost-dashboard-smoke.html` (and a JSON summary check), confirm valid output and clean `git status`, then update the execution ledger in `docs/superpowers/plans/2026-11-26-cost-dashboard-m1.md` with exact tested results.

- [ ] **Step 4: Commit Task 4**

```bash
git add .github/workflows/check.yml README.md CHANGELOG.md plugin.json .github/plugin/marketplace.json .claude-plugin/plugin.json .claude-plugin/marketplace.json gemini-extension.json docs/superpowers/plans/2026-11-26-cost-dashboard-m1.md
git commit -m "docs: register cost-dashboard suite in CI and update 0.5.24 release notes"
```

## Execution ledger
- Plan created and self-reviewed on 2026-11-26 against `docs/superpowers/specs/2026-11-26-cost-dashboard-m1-design.md` at base `d5335e2293019ae0d36d1d644b83f94c17a65185`.
- Execution method: Native inline (`executing-plans`) per `dev-loop` Core Rule 7 (`4` tasks, `0` risky areas).

## Conclusion
This plan builds Milestone 1 in four small test-driven tasks while keeping production code at or below `400` lines and startup instructions untouched. No new owner decision is needed before implementation because Milestone 1 was approved at the design gate and touches no risky areas. The main implementation risk is staying under `400` production lines while rendering rich HTML, which Task 3 controls by reusing `scripts/collect-metrics.mjs` exports and compact Primer CSS variables.

# Milestone 1 Design: Ideation-to-Merge Cost Dashboard

## Abstract
`dev-loop` records session events and pull request metrics, but it does not report actual Copilot Premium Requests or dollar cost per merged feature. We propose `scripts/cost-dashboard.mjs`, a zero-dependency script that reads local session snapshots, links parent ideation sessions to merged pull requests, and writes a self-contained HTML, JSON, and Markdown cost report. The owner gets an exact ideation-to-merge cost baseline and an interactive subscription budget simulator before Milestone 2 adds the `Budget mode` workflow switch.

## 1. Intent and Why
The owner wants to know how many credits and dollars a feature costs from first ideation to final merge. Today, the owner has high credit capacity, so `dev-loop` uses multi-turn test-driven development and multi-agent code review panels by default. In the future, the owner may work under a fixed `$20` to `$40` monthly budget.

Before we change any workflow rules, we need an accurate cost baseline from real repository and session data. We split the overall effort into two independent milestones:
- **Milestone 1 (this design):** Measure and visualize ideation-to-merge feature cost (`scripts/cost-dashboard.mjs`), with zero changes to `core.mdc` or active agent rules.
- **Milestone 2 (separate follow-up PR):** Add an opt-in `Budget mode` switch (`off` by default) in `AGENTS.md`, `core.mdc`, and `prepare-review-panel.mjs` to cut feature cost by 60% to 75% while keeping code quality gates.

## 2. Definitions
- **PRU (Premium Request Unit):** One billed GitHub Copilot Premium Request from `accountingSnapshot.totalPremiumRequestCost`. GitHub prices overage at `$0.04` per PRU by default.
- **AIU (AI Unit):** An internal compute and token measure where `1 AIU = 1,000,000,000 nanoAIU` (`totalNanoAiu`). Subagents inside a Copilot turn often report `0` PRUs while still consuming AIUs and tokens.
- **Ideation-to-merge chain:** The child session that opened and shipped a pull request, plus any exclusive parent or ancestor session that spawned that child session.
- **Shared session:** One Copilot session that shipped two or more pull requests, or one parent coordinator session that spawned two or more child sessions.

## 3. What We Will Build

### Goals
- Measure actual PRUs, equivalent USD cost, AIUs, API duration, token usage, model mix, and main-vs-subagent split for each merged pull request.
- Link exclusive parent ideation sessions (`1` parent to `1` child PR session) into the feature's ideation-to-merge total without double-counting shared coordinators.
- Generate one self-contained offline HTML dashboard file (light and dark themes, no network requests) plus machine-readable JSON and Markdown summaries.
- Provide an interactive monthly budget simulator in the HTML dashboard (`$10` Pro / `300` PRUs, `$20` budget, `$39` Pro+ / `1,500` PRUs, and custom dollar input) that compares current feature throughput against projected `Budget mode` throughput.
- Support multi-repository runs (for example `divydvd/dev-loop` plus `SmarType`) and an optional all-local-sessions summary for unmerged or chat-only exploration cost.

### Non-Goals
- Do not change `com.github.copilot/rules/core.mdc`, host mirrors, or active `dev-loop` workflow behavior in Milestone 1.
- Do not add external npm packages, a background web server, a database, or cloud telemetry uploads.
- Do not change existing `scripts/collect-metrics.mjs` CLI output fields or break `scripts/mine-pr-evidence.mjs`.

### Anti-Goals (Failure Conditions Even If Code Runs)
- Never sum cumulative `accountingSnapshot` checkpoints inside one session; always read the latest checkpoint or shutdown snapshot.
- Never link parent and child sessions by raw UUID substring search across `events.jsonl`, because `list_sessions_and_chats` outputs list unrelated active sessions.
- Never split or duplicate a shared session's cost across multiple pull requests, and never attribute a Copilot session to a non-Copilot pull request.
- Never embed raw user prompt text, pull request bodies, or secrets into the HTML report; escape all repository names, pull request titles, and model names.

## 4. Constraints and UI Reuse
- **Production size limit:** Keep Milestone 1 production code at or below `400` lines (`Core Rule 11`). Tests and documentation do not count toward this limit.
- **Startup context budget:** Add `0` bytes to always-loaded startup instructions (`MAX_ALWAYS_LOADED_BYTES = 15,000`).
- **UI mockup and reuse (`references/ui-reuse.md`):** This repository has no web application or shared UI component library. `[Builder call]` The HTML dashboard uses local CSS custom properties aligned with GitHub Primer light and dark tokens, matching the approved preview mockup at `/Users/divydwivedi/.copilot/session-state/b82edb50-044f-4813-b1ee-c8e04f78f7bb/files/cost-dashboard-and-budget-mode.html`. The page must support empty, partial-data (`n/a`), light/dark theme toggle, keyboard focus, and `prefers-reduced-motion`.

## 5. How It Works

### Owner-Agreed Decisions
1. **Milestone order:** Ship Milestone 1 (Cost Dashboard) first on its own branch and pull request, then design and ship Milestone 2 (`Budget mode` switch).
2. **Primary cost metrics:** Report both billed PRUs (converted to USD at `$0.04`/PRU by default) and internal AIUs/tokens so model multiplier differences (`15x` Opus vs `1x` Sonnet/GPT/Gemini) and `0`-PRU subagent overhead are both visible.
3. **Output medium:** Produce a self-contained static HTML dashboard file alongside CLI JSON/Markdown output, with an interactive `$10` / `$20` / `$39` / custom monthly budget simulator.

### Technical Contract (`[Builder call]` defaults unless overridden by owner)
1. **CLI interface (`scripts/cost-dashboard.mjs`):**
   - `--repo <owner/name>` (repeatable or comma-separated; optional when `--prs-file` or all-workspace sessions mode is used).
   - `--prs-file <path>` (optional offline JSON fixture, matching `collect-metrics.mjs` PR shape without requiring extra GraphQL fields).
   - `--sessions-dir <path>` (default `~/.copilot/session-state`).
   - `--from <ISO>` and `--to <ISO>` (optional window filter: `mergedAt` in `[from, to)` for merged PRs, and `workspace.yaml` `created_at` in `[from, to)` for unmerged sessions).
   - `--pru-usd <number>` (default `0.04` USD per PRU).
   - `--include-actions`, `--actions-usd-per-min <number>`, and `--max-actions-runs <number>` (`[Builder call]` optional repo-window GitHub Actions Linux billable minutes card via `gh api`, matching `skills/infra-review/SKILL.md`, default off, default rate `$0.008`/min, capped at `100` runs with an explicit `truncated` status; excluded from Copilot PRU simulator math because Actions uses a separate quota).
   - `--format <html|json|markdown>` (default `html`) and `--out <path>` (writes file when set, otherwise prints to `stdout`).
2. **Session accounting extraction:**
   - Parse `~/.copilot/session-state/<id>/workspace.yaml` and `events.jsonl` across all local session directories once before applying `--repo` or `--from`/`--to` filters, so pre-window or chat-based parent chains stay intact.
   - From the latest `session.usage_checkpoint` or `session.shutdown` event that carries `data.accountingSnapshot`, extract `totalPremiumRequestCost`, `totalUserRequests`, `totalNanoAiu` (falling back to top-level `data.totalNanoAiu` when `accountingSnapshot` is absent on older transcripts), `totalApiDurationMs`, `tokenDetails`, `modelMetrics`, and `agentMetrics` (classified into `main`, `review` subagents by `agentName` matching review roles, and `otherSubagents`).
   - When a session has no `accountingSnapshot`, mark `pruAttribution: "snapshot_unavailable"` (`pruCost: null`, `usdCost: null`) rather than fabricating `0`.
3. **Direct PR matching, parent ideation linking, and workspace scoping:**
   - Direct PR-to-session matching reuses `collect-metrics.mjs` semantics (`workspace.yaml` repo match, `created_at <= mergedAt`, highest PR URL line count in `events.jsonl`), preserving `unique`, `ambiguous` (shared session across multiple PRs), and `unmatched_non_copilot_or_missing_session`.
   - `[Builder call]` Parent-to-child creation links combine two deterministic signals: (a) the child session's **first** `user.message` event having `data.source === "agent-<parent_uuid>"` (which links `open_issue_session`, `open_pr_session`, and kicked-off `create_session` children even when app wrapper IDs differ), and (b) completed `create_session`, `open_issue_session`, `open_pr_session`, or `fork_session` tool results (`(id: <uuid>)` or `ghapp://sessions/<uuid>`). Every creation tool call in a parent (including unresolved or cloud wrapper IDs) increments that parent's `spawnedChildCount`.
   - Walk ancestor links upward (with cycle guard) across all sessions in `sessionsDir`. An ancestor session is summed into a PR's ideation chain **only** when that ancestor has `spawnedChildCount === 1` (or `1` linked child and `0` extra creation calls) and `0` direct matched PRs (`ideationAttribution: "exclusive_parent"`). Otherwise it is excluded from per-PR sums and listed once under `sharedCoordinators`.
   - `[Builder call]` If a PR session has `accountingSnapshot` (`directPruCost` known) while a linked `exclusive_parent` lacks `accountingSnapshot`, keep `directPruCost` visible on the PR row and set `chainPruCost: null` (`chainPruStatus: "partial_parent_snapshot_unavailable"`) rather than understating the chain total; `chainNanoAiu` still sums when all chain links have `totalNanoAiu`.
   - `[Builder call]` When `--repo` is specified, repo KPI totals include matched/unmerged sessions for `--repo` plus `exclusive_parent` sessions linked to in-window PRs. Unlinked standalone chat sessions (`repository` absent in `workspace.yaml`) are reported separately under `unscopedChatSpend` and included in top-level workspace spend only when `--repo` is omitted.
4. **Summary and HTML dashboard sections:**
   - **KPI cards:** Workspace/repo spend (PRUs + USD + AIUs across window, with `unscopedChatSpend` shown separately when `--repo` is set), median & mean complete-chain ideation-to-merge cost per PR, median direct PR-session cost, and high-multiplier / review-subagent share.
   - **Interactive budget simulator:** Plan selector (`$10` Pro `300` PRUs, `$20` budget `500` PRU-equivalent, `$39` Pro+ `1,500` PRUs, or custom monthly USD + per-PRU rate). `[Builder call]` Separates **exact observed `1x`-model cap savings** (`totalUserRequests * 1` PRU vs actual `totalPremiumRequestCost`, which is `0%` on `1x`-only repos and `~93%` on `15x` turns) from a **user-adjustable turn-reduction slider** (`0%`–`50%`, default `25%`, labeled as a workflow assumption until Milestone 2 ships), while displaying review-subagent AIU/token savings alongside.
   - **Per-route & cost-driver breakdown:** `trivial`, `small`, and `multi-task` route medians (PRUs, USD, AIUs, active time), model multiplier table (`requests.cost / requests.count`), main vs review-subagent vs other-subagent AIU split, and optional repo-window GitHub Actions Linux minutes card.
   - **Ideation-to-merge PR table & unattributed buckets:** Sortable/filterable table of merged PRs showing direct PR session cost, exclusive parent ideation cost, total chain USD (`n/a` when partial snapshot), and explicit buckets for `ambiguous` shared sessions, `sharedCoordinators`, `unmatched_non_copilot_or_missing_session`, and unmerged exploration sessions.

### What Is Left to the Builder
- Internal helper decomposition between `scripts/collect-metrics.mjs` and `scripts/cost-dashboard.mjs` to stay clean and below `400` production lines.
- Exact visual spacing and SVG/CSS bar rendering inside the self-contained HTML output, provided light/dark themes, empty states, HTML escaping, and accessibility rules hold.

## Conclusion
Next, a fresh builder-check subagent will review this design document for planning gaps, and then the owner will review and approve Milestone 1 before we write the implementation plan (`writing-plans`). I need your approval of this Milestone 1 design (or any adjustments to the CLI flags, attribution rules, or dashboard sections) before writing feature code. The main technical risk is under- or over-attributing multi-PR coordinator sessions, which this design mitigates by restricting per-PR rollups to verified `1:1` creation links and reporting shared coordinators in their own bucket.

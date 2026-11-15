# Milestone M5: Host-Aware `infra-review`, `collect-metrics.mjs`, and Multi-Host Support Docs (`0.5.16`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Milestone `M5` (`v0.5.16`) of the 5-milestone host portability architecture: make `scripts/collect-metrics.mjs` and `skills/infra-review/SKILL.md` host-aware for mixed-host repositories, keep `skills/dev-loop/assets/project-profile.md` compact and host-accurate, document the verified multi-host support matrix in `README.md`, and sync all 5 manifests and `CHANGELOG.md` to `0.5.16`.

**Architecture:** Extend `analyzeSessions`, `collectMetrics`, and `formatMarkdownReport` in `scripts/collect-metrics.mjs` so merged PRs without a matching `~/.copilot/session-state/<id>` transcript (`unmatched_non_copilot_or_missing_session`) keep all Git and GitHub metrics while setting session-only telemetry to explicit `null` / `n/a (unmatched_non_copilot_or_missing_session)` without cross-attribution or fabricated `0` repeat counts. Update `skills/infra-review/SKILL.md`, `skills/dev-loop/assets/project-profile.md`, and `README.md` to match verified Copilot (`1.0.106-8`), Claude Code (`2.1.299`), Gemini CLI (`0.32.1`), and planned Codex capabilities, including explicit Copilot-only `work-ledger` runtime-guard boundaries (`P12`).

**Tech Stack:** Node.js ESM (`node:test`, `node:fs`, `node:child_process`), GitHub Copilot CLI `1.0.106-8`, Claude Code CLI `2.1.299`, Gemini CLI `0.32.1`, Markdown skills and documentation.

**Spec:** Owner-approved 5-milestone host portability architecture (`docs/superpowers/plans/2026-11-14-host-portability-m1.md`, `main` at `c2e675c` after `M1` `#41`, `M2` `#42`, and `M3` `#43` merged).

## Abstract
Repositories that enable `dev-loop` across GitHub Copilot, Claude Code, and Gemini CLI merge pull requests whose transcripts do not all live in `~/.copilot/session-state`.
In `0.5.15`, `scripts/collect-metrics.mjs` reports `ownerRepeatMessages: 0` and `yieldStatus: "no_attributed_sessions"` when all in-window PRs have no Copilot transcript, and `skills/infra-review/SKILL.md` plus `README.md` still describe Copilot-only plugin commands, repo discovery, startup measurement, and install instructions.
Milestone `M5` (`0.5.16`) adds explicit `unmatched_non_copilot_or_missing_session` attribution and `null` / `n/a` session telemetry in `scripts/collect-metrics.mjs`, makes `skills/infra-review/SKILL.md` and `skills/dev-loop/assets/project-profile.md` host-aware, and documents the multi-host support matrix and `T-IR8` telemetry check in `README.md` without changing `com.github.copilot/rules/core.mdc` or `skills/dev-loop/SKILL.md`.

## Global Constraints
- Leave `com.github.copilot/rules/core.mdc` and `skills/dev-loop/SKILL.md` untouched (`0` diff lines against `origin/main`).
- Keep total changed production code lines `<= 400` (estimated `~45` production lines in `scripts/collect-metrics.mjs` and the 5 JSON manifests).
- Keep startup instruction size `<= 15,000` UTF-8 bytes (`15.0 KB`, where `1 KB = 1,000` bytes) across every supported host, and keep `AGENTS.md` / `skills/dev-loop/assets/project-profile.md` at `<= 5.5 KB`.
- Never read or modify live `~/.copilot`, `~/.claude`, or `~/.gemini` directories; run all CLI smoke checks in isolated temporary directories (`COPILOT_HOME`, `CLAUDE_CONFIG_DIR`, `GEMINI_CLI_HOME`).
- Inside `skills/*/SKILL.md`, inline backticks starting with `assets/`, `scripts/`, or `references/` must exist under that skill directory (`scripts/check.mjs` `SKILL_LINK_RE`); always prefix repo-root script paths in `skills/infra-review/SKILL.md` as `node <dev-loop-checkout>/scripts/...` or `skills/dev-loop/references/...`.
- Write at least 80% of prose in ASD-STE100 Simplified Technical English.

## Review Focus
1. **False `0` repeat messages when `mappedCount === 0`:** When `windowPrs.length > 0` and `mappedCount === 0`, `analyzeSessions.totalOwnerRepeatMessages` and `autonomy.ownerRepeatMessages` must be `null` (rendered as `n/a (unmatched_non_copilot_or_missing_session)`), never `0`.
2. **Distinguishing `unmatched_non_copilot_or_missing_session` from `no_attributed_sessions`:** When `eligibleYieldCount === 0` and all preconditions pass, `durableFirstPassYield.status` must be `"unmatched_non_copilot_or_missing_session"` only when `sessionAnalysis.mappedCount === 0`, while preserving `"no_attributed_sessions"` when sessions matched only as shared/ambiguous (`mappedCount > 0`).
3. **No `n/a (ok)` cells in `formatMarkdownReport`:** Every `n/a (...)` cell in `formatMarkdownReport` must name a real status (`no_prs`, `unavailable`, `prs_truncated`, `no_attributed_sessions`, or `unmatched_non_copilot_or_missing_session`), never `n/a (ok)`.
4. **No session cross-attribution or null-field crashes:** Unmatched PRs must keep all Git/GitHub metrics (`codeSurvival`, `fixups`, `firstPushGreenRate`, `medianProdLines`, `routeBuckets[route].count`, `verification`) while leaving all session-only per-PR fields (`totalNanoAiu`, `modelCalls`, `duplicateReadRate`, `ownerRepeatMessages`, `activeSec`, `humanWaitSec`, `parallelismFactor`, `timeBuckets`) at `null`.
5. **Skill inline backtick check (`SKILL_LINK_RE`) and 17-row table preservation:** `skills/infra-review/SKILL.md` must keep all 17 table rows and `T-IR1`–`T-IR7` + `F1` rules intact while passing `node scripts/check.mjs` with zero broken skill links.
6. **Honest multi-host matrix in `README.md`:** State verified CLI versions (`1.0.106-8`, `2.1.299`, `0.32.1`), Codex as `planned` (not yet verified), runtime `work-ledger` guards as Copilot-only (`none` on Claude Code and Gemini CLI, where `core.mdc` rules are instructions only), and live vendor-API sign-in limits (`T-M2-7` / `T-M3-7`) honestly.

## Acceptance record
- **Goal:** Complete Milestone `M5` (`v0.5.16`) so `collect-metrics.mjs`, `infra-review`, `project-profile.md`, and `README.md` support mixed-host repositories accurately without modifying `core.mdc` or `skills/dev-loop/SKILL.md`.
- **Done when:**
  - [x] `scripts/collect-metrics.mjs` preserves all Git/GitHub metrics on unmatched non-Copilot PRs, sets `attribution: "unmatched_non_copilot_or_missing_session"` and explicit `null` session fields on each unmatched PR, exposes sorted `unmatchedPrNumbers` on `sessionAnalysis` and `autonomy`, reports `null` / `n/a (unmatched_non_copilot_or_missing_session)` (never `0`) for `ownerRepeatMessages` when `mappedCount === 0` with `windowPrs.length > 0`, reports `durableFirstPassYield.status: "unmatched_non_copilot_or_missing_session"` when `eligibleYieldCount === 0` due solely to unmatched PRs (preserving `"no_attributed_sessions"` for shared-only sessions), and renders an `Unmatched PRs (non-Copilot or missing session)` row in `formatMarkdownReport`.
  - [x] `skills/infra-review/SKILL.md` preserves its 17-row table and `T-IR1`–`T-IR7` + `F1` behavior while adding host-aware Step 1.1 plugin/extension refresh, Step 1.2 multi-host repo discovery, Step 2 per-host `Always-loaded text (KB)` (`<= 15.0 KB`, reporting the highest active host), matched-Copilot-only `Model calls` and 5-box session telemetry (`n/a` on `unmatched_non_copilot_or_missing_session`), explicit Copilot-only `work-ledger` runtime-guard disclosure (`P12`), and 5-manifest `Core PR` version bump rules; verified by `5/5` fresh `writing-skills` subagents (`RED -> GREEN`).
  - [x] `skills/dev-loop/assets/project-profile.md` stays compact (`<= 5.5 KB`) and states accurately that `dev-loop` core rules load via the active host's `dev-loop` plugin or extension and override skill instructions, including Superpowers.
  - [x] `README.md` documents the ASD-STE100 multi-host matrix (GitHub Copilot `1.0.106-8`, Claude Code `2.1.299`, Gemini CLI `0.32.1`, Codex `planned`), runtime `work-ledger` guard column, `T-M2-7` / `T-M3-7` live sign-in limits, `What it contains`, `T-IR8` in `Objective infra-review telemetry`, and `#rulecheck-map` additions for `.claude-plugin/hooks.json`, `gemini-extension.json` / `GEMINI.md`, and mixed-host `collect-metrics.mjs`.
  - [x] All 5 manifests (`plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`) and `CHANGELOG.md` are synced to `0.5.16`; `com.github.copilot/rules/core.mdc` and `skills/dev-loop/SKILL.md` have `0` diff lines; `sync-host-core.mjs --check`, `check.mjs`, all 8 CI suites, isolated `COPILOT_HOME` / `claude plugin validate` / `GEMINI_CLI_HOME` smoke checks, and independent `code-review` pass.
- **Required evidence:** `node scripts/sync-host-core.mjs --check`; `node scripts/check.mjs`; all 8 CI test suites (`device-handoff`, `branch-maintenance`, `independent-review`, `testing-contract`, `collect-metrics`, `run-benchmark`, `portability-contract`, `tools/work-ledger/*.test.mjs`); isolated CLI smoke tests (`COPILOT_HOME` `v0.5.16`, `claude plugin validate --strict --json .`, `GEMINI_CLI_HOME` `gemini extensions validate .`); `writing-skills` `5` baseline (`RED`) vs `5` revised (`GREEN`) subagents (`T-IR1`–`T-IR8` + `F1`); independent `code-review` subagent verdict; `work_ledger_record` (`validated`, `review_clean`) at final `HEAD` SHA; no device test (this repo has no app).
- **Test matrix:** Compact test matrix (`T-M5-1`–`T-M5-6`) below, saved before implementation under `skills/dev-loop/references/testing.md`.
- **Regression selection:** Reuse `.github/workflows/check.yml` suites plus `README.md` `infra-review` application scenarios (`T-IR1`–`T-IR8` + `F1`). `AGENTS.md` defines no separate `docs/testing/regression-matrix.md`.
- **Size estimate:** Task 1: ~40 production lines (`scripts/collect-metrics.mjs`); Task 2: 0 production code lines (`skills/infra-review/SKILL.md`, `skills/dev-loop/assets/project-profile.md`); Task 3: ~5 production lines (version fields across 5 JSON manifests; `README.md` and `CHANGELOG.md` are docs). Total ~45 production lines (`<= 400`).
- **Milestone selection:** Milestone `M5` of the approved 5-milestone portability plan (`skills/dev-loop/references/milestones.md`), branched off `main` (`c2e675c`) after `M1` (`#41`), `M2` (`#42`), and `M3` (`#43`) merged; `M4` remains gated on local Codex installation.
- **Out of scope:** Codex adapter implementation (`M4`), `tools/work-ledger/` ports to Claude Code or Gemini CLI, and any edits to `com.github.copilot/rules/core.mdc`, `skills/dev-loop/SKILL.md`, or live user home directories.
- **Risky area:** None (`com.github.copilot/rules/core.mdc`, `skills/dev-loop/SKILL.md`, approval gates, and finish rules have `0` diff lines; no risky-plan stop required).
- **Stop conditions:**
  - Done: all "done when" checks have evidence at `HEAD`, independent `code-review` and GitHub Actions `check` pass, `copilot-pull-request-reviewer` rounds finish cleanly, `work_ledger_record` (`validated` and `review_clean`) is pinned to `HEAD`, and the PR is open against `main` without merging.
  - Blocked: stop and report `blocked` with evidence after 3 failed fix attempts on the same fault or if an unexpected breaking change in `core.mdc` / `skills/dev-loop/SKILL.md` would be required.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Shared host capability contract, `check.mjs` sync validators, and Copilot host guide (`0.5.13`) | Merged in PR `#41` | None | `divydvd-dev-loop-agent-portability` -> `main` | Copilot installer only | merged | `3351237` | Merged (`#41`) |
| M2 | Claude Code plugin + `SessionStart` core injection (`0.5.14`) | Merged in PR `#42` | `M1` (`3351237`) | `divydvd-claude-code-portability-m2` -> `main` | Workflow only; `work-ledger` runtime guards absent; `T-M2-7` requires local Claude sign-in | merged | `eca5200` | Merged (`#42`) |
| M3 | Gemini CLI `0.32.1` extension + byte-synced `GEMINI.md` + `gemini.md` (`0.5.15`) | Merged in PR `#43` | `M1` (`3351237`), `M2` (`eca5200`) | `divydvd-gemini-cli-portability-m3` -> `main` | Workflow only; interactive `activate_skill` consent in default mode; `work-ledger` runtime guards absent; `T-M3-7` requires local Gemini API auth | merged | `c2e675c` | Merged (`#43`) |
| M4 | Codex plugin/instruction support with verified startup core loading | Unique-marker test + isolated Codex `P01`–`P12` + `B1`–`B6` | `M1` + local Codex runtime (`codex` absent on this Mac) | `portability-codex` -> `main` | Planned — gated on local Codex runtime installation; not yet verified | blocked | none | Defer until Codex is installed |
| M5 | Host-aware `infra-review`, mixed-host `collect-metrics.mjs`, `project-profile.md`, and multi-host `README.md` support matrix (`0.5.16`) | `T-M5-1`–`T-M5-6` (`collect-metrics.test.mjs`, `testing-contract.test.mjs`, `portability-contract.test.mjs`, `5/5` fresh `infra-review` consumers, isolated Copilot/Claude/Gemini smoke checks, independent `code-review`) | `M1` (`3351237`), `M2` (`eca5200`), `M3` (`c2e675c`) | `divydvd-mixed-host-infra-review-m5` -> `main` | Session telemetry covers matched Copilot transcripts only (`n/a` on non-Copilot PRs); runtime `work-ledger` guards remain Copilot-only; Codex stays `planned` | ready for approval | `PR #44` (`HEAD`) | PR `#44` open against `main` (awaiting owner merge approval) |

- Overall assignment: `in progress` (`M1` `#41`, `M2` `#42`, and `M3` `#43` merged on `main` at `c2e675c`; `M4` gated on local Codex runtime; `M5` active in this session).

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-M5-1 | Mixed-host `collect-metrics.mjs` preserves Git/GitHub metrics and reports `unmatched_non_copilot_or_missing_session` without crashes, cross-attribution, or false `0` repeat counts | yes | Mixed Copilot + Claude/Gemini PR fixture and all-unmatched non-Copilot PR fixture in `collect-metrics.test.mjs` | Git/GitHub metrics (`codeSurvival`, `fixups`, `firstPushGreenRate`, `medianProdLines`, routes, `verification`) include all PRs; unmatched PRs get `attribution: "unmatched_non_copilot_or_missing_session"` + explicit `null` session fields + sorted `unmatchedPrNumbers`; all-unmatched window yields `ownerRepeatMessages: null` (`n/a (unmatched_non_copilot_or_missing_session)`) and `durableFirstPassYield.status: "unmatched_non_copilot_or_missing_session"` while shared-only window keeps `"no_attributed_sessions"` | automated (TDD) | `scripts/collect-metrics.test.mjs` | pass | `16/18` RED -> `18/18` GREEN (`node --test scripts/collect-metrics.test.mjs`) | `533ef54` |
| T-M5-2 | `skills/infra-review/SKILL.md` and `skills/dev-loop/assets/project-profile.md` satisfy structural contract (`T-IR1`–`T-IR8` + `F1`, 17-row table, host refresh/discovery/startup KB/`P12`, valid backticks, `<= 5.5 KB` profile) | yes | `REPO_ROOT` `skills/infra-review/SKILL.md`, `skills/dev-loop/assets/project-profile.md`, `scripts/check.mjs`, `scripts/testing-contract.test.mjs` | `testing-contract.test.mjs` and `check.mjs` pass with zero broken links and `0` diff lines on `core.mdc` and `skills/dev-loop/SKILL.md` | automated (TDD) | `scripts/testing-contract.test.mjs`, `scripts/check.mjs` | pass | `29/30` RED -> `30/30` GREEN (`testing-contract.test.mjs`), `check: no faults` | `3f08478` |
| T-M5-3 | `writing-skills` application check (`T-IR8` mixed-host telemetry + `T-IR1`–`T-IR7` + `F1` baseline controls) | yes | 5 fresh baseline (`0.5.15`) vs 5 fresh revised (`0.5.16`) consumer subagents on a mixed Copilot + Claude Code + Gemini CLI weekly review fixture | Baseline (`0.5.15`) fails host-aware refresh/discovery, per-host startup KB, or `unmatched_non_copilot_or_missing_session` / `work-ledger` `P12` rules (`RED`); revised (`0.5.16`) converges `5/5` (`GREEN`) across `T-IR8` and `T-IR1`–`T-IR7` + `F1` | subagent application check | `CHANGELOG.md` (`0.5.16`) | pass | `red-ir-1..5` (`0/5` M5, `5/5` controls) -> `green-ir-1..5` (`5/5` across `Q1`–`Q8`) | `3f08478` |
| T-M5-4 | Multi-host `README.md` matrix, `#rulecheck-map`, `T-IR8` docs, and `0.5.16` parity across all 5 manifests and `CHANGELOG.md` | yes | `README.md`, `CHANGELOG.md`, `plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json` | Exact `0.5.16` parity across all 5 manifests + `CHANGELOG.md`; `README.md` documents Copilot `1.0.106-8`, Claude `2.1.299`, Gemini `0.32.1`, Codex `planned`, Copilot-only `work-ledger` column, `T-M2-7`/`T-M3-7` auth limits, `T-IR8`, and `#rulecheck-map` entries | automated (TDD) | `scripts/portability-contract.test.mjs`, `scripts/check.mjs` | pass | `9/10` RED -> `10/10` GREEN + review-round `RED -> GREEN` (`portability-contract.test.mjs`), `check: no faults` | `8dc35df` + Round 1 |
| T-M5-5 | Full 8-suite CI regression pass + `sync-host-core.mjs --check` + isolated Copilot, Claude, and Gemini CLI smoke validation (`0.5.16`) | yes | All 8 suites in `.github/workflows/check.yml` + isolated `COPILOT_HOME`, `claude plugin validate --strict --json .`, and `GEMINI_CLI_HOME` `gemini extensions validate .` | All 8 suites exit `0`; `COPILOT_HOME` lists `dev-loop (v0.5.16)`, `dev-loop: core`, and 4 skills; `claude plugin validate` and `gemini extensions validate` pass cleanly | integration | CLI smoke + `.github/workflows/check.yml` suites | pass | `81/81` root suites + `231` `work-ledger` tests (`0` fail); isolated `COPILOT_HOME` `v0.5.16` + `claude plugin validate --strict` + `GEMINI_CLI_HOME` `v0.5.16` pass | `8dc35df` + Round 1 |
| T-M5-6 | Independent `code-review` on `origin/main...HEAD`, GitHub Actions `check`, `copilot-pull-request-reviewer`, and `work-ledger` evidence | yes | Full branch diff `origin/main...HEAD` and open PR against `main` | Independent `code-review` clean, CI `check` green, review threads resolved, `work_ledger_record` (`validated`, `review_clean`) pinned at final `HEAD` SHA | review + CI | GitHub PR `#44` + `work-ledger` | pass | `m5-branch-code-review` `clean` (`8dc35df`) + focused Round-1 review + CI `check` green | `PR #44` (`HEAD`) |

---

## Task 1: Mixed-Host Telemetry in `scripts/collect-metrics.mjs`

**Files:**
- Modify: `scripts/collect-metrics.mjs`
- Modify: `scripts/collect-metrics.test.mjs`

**Interfaces:**
- Produces:
  - `analyzeSessions` per-PR unmatched entry `{ sessionId: null, sharedSession: false, attribution: "unmatched_non_copilot_or_missing_session", totalNanoAiu: null, modelCalls: null, duplicateReadRate: null, ownerRepeatMessages: null, activeSec: null, humanWaitSec: null, parallelismFactor: null, timeBuckets: null }`
  - Sorted `unmatchedPrNumbers` on `analyzeSessions` return object and `collectMetrics(...).autonomy`
  - `totalOwnerRepeatMessages: null` when `mappedCount === 0`
  - `durableFirstPassYield.status: "unmatched_non_copilot_or_missing_session"` when `eligibleYieldCount === 0` and `sessionAnalysis.mappedCount === 0` (preserving `"no_attributed_sessions"` when `mappedCount > 0`)
  - `Unmatched PRs (non-Copilot or missing session)` Markdown row and `n/a (unmatched_non_copilot_or_missing_session)` cell formatting in `formatMarkdownReport`
- Consumes: none (root task)

- [x] **Step 1 (`RED`): Write failing mixed-host and all-unmatched tests in `scripts/collect-metrics.test.mjs`**
  Update the prefix-collision expectation in `T5 & T6` (`"unmatched"` -> `"unmatched_non_copilot_or_missing_session"`) and add `T-M5-1` tests covering:
  1. Mixed window (1 Copilot PR + 2 non-Copilot Claude/Gemini PRs with production edits, blame churn, CI checks, and mixed `ledger.json` coverage): Git/GitHub metrics cover all 3 PRs; unmatched PRs get `attribution: "unmatched_non_copilot_or_missing_session"` and explicit `null` session fields without borrowing the Copilot PR's session; `unmatchedPrNumbers` is sorted; `formatMarkdownReport` surfaces `unmatched_non_copilot_or_missing_session on #<N>`.
  2. All-unmatched window (`windowPrs.length === 2`, `sessionsDir` exists with only unrelated sessions, `mappedCount === 0`): `autonomy.ownerRepeatMessages === null` (not `0`), `durableFirstPassYield.status === "unmatched_non_copilot_or_missing_session"`, and `formatMarkdownReport` renders `n/a (unmatched_non_copilot_or_missing_session)` with zero `n/a (ok)` cells while preserving `"no_attributed_sessions"` when sessions exist only as shared/ambiguous.
  Run `node --test scripts/collect-metrics.test.mjs` and confirm `RED` failure on the new M5 assertions.

- [x] **Step 2 (`GREEN`): Implement mixed-host handling in `scripts/collect-metrics.mjs`**
  Update `analyzeSessions`, `collectMetrics`, and `formatMarkdownReport` with minimal code (~40 lines) to satisfy `T-M5-1` and preserve all existing tests.

- [x] **Step 3: Verify `collect-metrics.test.mjs` and `check.mjs`, then commit Task 1**
  Run `node --test scripts/collect-metrics.test.mjs && node scripts/check.mjs`, confirm `0` failures, and commit Task 1.

---

## Task 2: Host-Aware `skills/infra-review/SKILL.md` and `skills/dev-loop/assets/project-profile.md`

**Files:**
- Modify: `skills/infra-review/SKILL.md`
- Modify: `skills/dev-loop/assets/project-profile.md`
- Modify: `scripts/testing-contract.test.mjs`

**Interfaces:**
- Consumes: `unmatched_non_copilot_or_missing_session`, `unmatchedPrNumbers`, and `n/a (unmatched_non_copilot_or_missing_session)` semantics from Task 1 (`scripts/collect-metrics.mjs`).
- Produces: Host-aware `skills/infra-review/SKILL.md` (`T-IR1`–`T-IR8` + `F1`), host-accurate `skills/dev-loop/assets/project-profile.md` (`<= 5.5 KB`), and contract assertions in `scripts/testing-contract.test.mjs`.

- [x] **Step 1 (`RED` skill baseline): Run 5 fresh baseline consumer subagents on `0.5.15` `skills/infra-review/SKILL.md`**
  Dispatch 5 fresh `explore` subagents against the unmodified `0.5.15` `skills/infra-review/SKILL.md` on a mixed Copilot + Claude Code + Gemini CLI weekly review scenario (`T-IR8` + `T-IR1`–`T-IR7` + `F1` controls). Record exact baseline misses (`RED`) before editing `skills/infra-review/SKILL.md`.

- [x] **Step 2 (`RED` automated contract): Add `T-IR8` and host-aware `infra-review` / `project-profile.md` assertions to `scripts/testing-contract.test.mjs`**
  Assert host-specific plugin/extension refresh commands, multi-host repo discovery (`.github/copilot/settings.json`, `.claude/settings.json`, Gemini extension config), per-host `Always-loaded text (KB)` measurement reporting the highest active host (`<= 15.0 KB`), matched-Copilot-only `Model calls` and `unmatched_non_copilot_or_missing_session` `n/a` rules, Copilot-only `work-ledger` runtime-guard disclosure (`P12`), 5-manifest `Core PR` bump guidance, and host-accurate `project-profile.md` (`<= 5,500` bytes). Run `node --test scripts/testing-contract.test.mjs` and confirm `RED`.

- [x] **Step 3 (`GREEN` edit + automated check): Update `skills/infra-review/SKILL.md` and `skills/dev-loop/assets/project-profile.md`**
  Keep the 17-row table intact, obey `SKILL_LINK_RE` backtick rules, and run `node scripts/check.mjs && node --test scripts/testing-contract.test.mjs scripts/device-handoff.test.mjs` to confirm `GREEN`.

- [x] **Step 4 (`GREEN` skill verification): Run 5 fresh revised consumer subagents on `0.5.16` `skills/infra-review/SKILL.md`**
  Dispatch 5 fresh `explore` subagents on the identical mixed-host + control prompt and verify `5/5` pass across `T-IR8` and `T-IR1`–`T-IR7` + `F1`. Refactor if any loophole appears, then commit Task 2.

---

## Task 3: Multi-Host `README.md`, Version `0.5.16` Sync, `CHANGELOG.md`, and Full Smoke Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `plugin.json`
- Modify: `.github/plugin/marketplace.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `gemini-extension.json`
- Modify: `scripts/portability-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`scripts/collect-metrics.mjs` `unmatched_non_copilot_or_missing_session`) and Task 2 (`skills/infra-review/SKILL.md` `T-IR8` + `skills/dev-loop/assets/project-profile.md`).
- Produces: Synced `0.5.16` manifests, `CHANGELOG.md` `0.5.16` entry with `RED -> GREEN` evidence, `README.md` multi-host matrix + `T-IR8` + `#rulecheck-map`, and `T-M5-*` tests in `scripts/portability-contract.test.mjs`.

- [x] **Step 1 (`RED`): Add `T-M5` portability contract tests in `scripts/portability-contract.test.mjs`**
  Update `T-M3-2`'s hardcoded `"0.5.15"` version assertion to `assert.notEqual(plugin.version, "0.5.14")` (matching `T-M2-1`) and add `T-M5` assertions checking `0.5.16` parity across all 5 manifests + `CHANGELOG.md`, `0` diff lines on `core.mdc` and `skills/dev-loop/SKILL.md`, `project-profile.md` `<= 5,500 B`, `README.md` multi-host matrix (Copilot `1.0.106-8`, Claude Code `2.1.299`, Gemini CLI `0.32.1`, Codex `planned`, runtime `work-ledger` guards column, `T-M2-7`/`T-M3-7` vendor-API sign-in notes, `T-IR8`, and `#rulecheck-map` entries), and mixed-host `collectMetrics` export contract. Run `node --test scripts/portability-contract.test.mjs` and confirm `RED`.

- [x] **Step 2 (`GREEN`): Update `README.md`, `CHANGELOG.md`, and all 5 manifests to `0.5.16`**
  Write the multi-host support matrix, `What it contains`, `Objective infra-review telemetry` (`T-IR8`), and `#rulecheck-map` updates in ASD-STE100; bump all 5 manifests to `0.5.16`; add the `0.5.16` `CHANGELOG.md` section with exact `RED -> GREEN` and smoke evidence.

- [x] **Step 3: Run full CI test suites and isolated multi-host CLI smoke checks**
  Run:
  - `node scripts/sync-host-core.mjs --check`
  - `node scripts/check.mjs`
  - `node --test scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs scripts/independent-review.test.mjs scripts/testing-contract.test.mjs scripts/collect-metrics.test.mjs scripts/run-benchmark.test.mjs scripts/portability-contract.test.mjs`
  - `node --test tools/work-ledger/*.test.mjs`
  - Isolated temporary `COPILOT_HOME` install + `copilot plugin list`, `copilot instruction list`, `copilot skill list` (`v0.5.16`)
  - `claude plugin validate --strict --json .`
  - Isolated temporary `GEMINI_CLI_HOME` `gemini extensions validate .`
  - `git diff origin/main -- com.github.copilot/rules/core.mdc skills/dev-loop/SKILL.md` (`0` lines)
  Update the plan's compact test matrix and milestone record with final evidence, then commit Task 3.

## Conclusion
Execute Tasks 1 through 3 inline using strict TDD (`RED -> GREEN`), then run an independent `code-review` subagent across `origin/main...HEAD`, open the PR against `main`, wait for GitHub Actions `check` and `copilot-pull-request-reviewer`, record `work_ledger_record` (`validated` and `review_clean`) at the final `HEAD` SHA, and report back to coordinator session `25e68ef4-9c23-43e2-9139-e1d7b6ae4e48` without merging.
No owner decision is needed before implementation because this plan touches no risky area and follows the approved 5-milestone portability architecture.
The main risk is accidentally reporting `0` or cross-attributed session metrics for non-Copilot PRs or breaking `SKILL_LINK_RE` inline backticks in `skills/infra-review/SKILL.md`, which Tasks 1 and 2 test directly before implementation.

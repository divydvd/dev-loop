# Automatic Dev-Loop Metrics Collector (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, zero-dependency Node script (`scripts/collect-metrics.mjs`) and wire it into `skills/infra-review/SKILL.md` in shadow mode so weekly reviews measure code survival, Git-verified test evidence, autonomy, and route-bucketed compute objectively.

**Architecture:** `scripts/collect-metrics.mjs` exposes pure analysis functions and a CLI entrypoint that reads merged PR JSON (from `--prs-file` or `gh pr list`), a local Git checkout (`git diff` and `git blame --line-porcelain`), an optional `work-ledger` directory (`ledger.json`), and an optional Copilot `session-state` directory (`workspace.yaml` + `events.jsonl`). `skills/infra-review/SKILL.md` runs the script in shadow mode alongside the existing report table without modifying `com.github.copilot/rules/core.mdc` or `skills/dev-loop/assets/pr-body.md`.

**Tech Stack:** Node.js ES modules (`node:fs`, `node:path`, `node:child_process`, `node:util`, `node:test`, `node:assert/strict`), Git CLI, `gh` CLI (optional when `--prs-file` is supplied).

**Spec:** Owner-approved Milestone 1 design in session `c339c1ed-388b-4561-94f2-3fd2c56531da` (2026-11-13).

## Acceptance record
- **Goal:** Compute objective code durability, verification ancestry, autonomy, and route-bucketed compute metrics automatically for `infra-review` without adding PR paperwork.
- **Done when:**
  - [x] `scripts/collect-metrics.mjs` computes 14-day production line survival from real Git history and excludes tests, docs, lockfiles, and generated files.
  - [x] `scripts/collect-metrics.mjs` detects 14-day fix-up PRs from explicit PR references and bug-fix Git blame overlap.
  - [x] `scripts/collect-metrics.mjs` checks `work-ledger` validation evidence across exact head SHAs and docs-only first-parent ancestors while rejecting untested production commits after a tested SHA.
  - [x] `scripts/collect-metrics.mjs` maps merged PRs to local sessions, marks shared multi-PR sessions as `ambiguous` instead of double-counting, reads cumulative `totalNanoAiu` from the final checkpoint, computes duplicate file-read share (resetting after edits), and reports route-bucketed medians (`trivial`, `small`, `multi-task`).
  - [x] `scripts/collect-metrics.mjs` computes first-push green rate (`postOpenCommits === 0`), counts direct owner repeat-instruction steering messages (excluding kickoffs, subagents, skills, notifications, and approvals), and computes `durableFirstPassYield`.
  - [x] `skills/infra-review/SKILL.md` wires `node scripts/collect-metrics.mjs` as a shadow-mode companion check with explicit interpretation limits, verified by RED/GREEN fresh-agent scenarios.
  - [x] `node scripts/check.mjs`, all CI suites (including `scripts/collect-metrics.test.mjs` in `.github/workflows/check.yml`), temporary `COPILOT_HOME` discovery, and independent agent review pass at the head commit.
- **Required evidence:** `node scripts/check.mjs`; `node --test scripts/*.test.mjs tools/work-ledger/*.test.mjs`; RED/GREEN fresh-agent `infra-review` scenarios; temporary `COPILOT_HOME` install and `copilot instruction list` / `copilot skill list`; read-only smoke run on `divydvd/dev-loop`; independent review. No device test: this repository has no app.
- **Test matrix:** Saved below before implementation under `references/testing.md`.
- **Regression selection:** No permanent project regression inventory is configured (`AGENTS.md`); retain all existing CI suites (`device-handoff`, `branch-maintenance`, `independent-review`, `testing-contract`, and `tools/work-ledger/*.test.mjs`) and README `F1-F4` controls.
- **Size estimate:** Task 1: tests and baseline scenario notes only (0 prod lines). Task 2: `scripts/collect-metrics.mjs` (~260 production lines) + unit tests. Task 3: skill/docs/CI/manifests (~30 non-code lines). Task 4: verification and PR (0 prod lines). Total production lines: ~260 (below the 400-line limit).
- **Milestone selection:** Multi-milestone evaluation roadmap (`M1` automatic metrics collector, `M2` 90% floor & pruning policy, `M3` executable benchmark runner). `M1` is safe and independently useful on `main` without `M2` or `M3`.
- **Out of scope:** Edits to `com.github.copilot/rules/core.mdc`, edits to `skills/dev-loop/assets/pr-body.md`, blocking CI failure on metric thresholds, `M2` rule-pruning policy, and `M3` benchmark runner.
- **Risky area:** none (`core.mdc`, approval points, and finish rules do not change).
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains.
  - Blocked: 3 failed fixes, missing access, or a policy conflict. For this multi-milestone roadmap, `M2` and `M3` remain separate unstarted milestones; stop after `M1` PR readiness so the owner can review `M1`.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Read-only `scripts/collect-metrics.mjs` and shadow-mode `infra-review` wiring | T1–T9, CI suites, RED/GREEN skill checks, temp-home discovery | None; reads existing Git, PR JSON, `work-ledger`, and `events.jsonl` formats | `divydvd-dev-loop-evaluation-analysis` -> `main` (independent additive tool) | Shadow-mode reporting only; does not auto-prune rules (`M2`) or run task benchmarks (`M3`) | verified | reviewed and re-tested at head | Open PR for owner review |
| M2 | 90% quality-floor optimization rule and 4-week zero-catch pruning step in `infra-review` | Future skill application checks | Depends on `M1` JSON metric fields (`durableFirstPassYield`, `routeBuckets`) | Future branch -> `main` after `M1` | Not started in this PR | planned | none | Separate follow-up after owner reviews `M1` |
| M3 | Executable code benchmark runner (`scripts/run-benchmark.mjs`) | Future sandbox fixture suite | Independent of `M1`; uses `copilot` CLI / SDK in temp worktrees | Future branch -> `main` | Not started in this PR | planned | none | Separate follow-up |

- Overall assignment: `M1` approved for implementation and PR creation; `M2` and `M3` remain planned follow-ups.

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Production file filter and route bucketing | yes | PR diffs touching `src/`, `*.test.mjs`, `docs/`, `README.md`, `PACKAGE.sha256` | Accurate `prodLines` and `trivial` / `small` / `multi-task` classification | automated unit test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` (8/8 pass) | `b196dd1` |
| T2 | 14-day Git code survival accuracy and zero-addition boundary | yes | Temp Git repo where PR1 adds 10 prod + 4 doc lines and PR2 edits 3 + deletes 1 prod line; PR3 deletes only | PR1 survival = `6/16` (`0.375`), merge PR = `4/4`, doc edits ignored, PR2 = `0/0` (`null`) | automated Git integration test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` | `b196dd1` |
| T3 | 14-day fix-up PR detection (explicit ref + blame churn + template-boilerplate guard) | yes | Merged PRs within 14d (`Fixes #10`, bug PR touching #10 lines, PR template text) vs >14d PR | Flags within-14d fix-ups; ignores >14d refs, non-fix features, and template headings | automated integration test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` | `b196dd1` |
| T4 | `work-ledger` verification + docs-only Git ancestry | yes | Exact head SHA, docs-only child commit, untested code child commit, trivial PR, missing ledger | Accepts exact head & docs-only child; rejects untested code child; marks missing ledger `n/a` | automated Git + ledger test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` | `b196dd1` |
| T5 | Session mapping, shared-session ambiguity, cumulative `totalNanoAiu`, and `view_range`-aware duplicate reads | yes | Synthetic `session-state` with resumed checkpoints, edited/chunked reads, `data.source` agent turns, and shared session | Uses final checkpoint, resets on edit, ignores disjoint `view_range`, marks shared session `ambiguous` | automated unit test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` | `b196dd1` |
| T6 | Owner steering filter, first-push green rate, and `durableFirstPassYield` | yes | PR commits before/after `createdAt`; user messages with kickoff, subagent, `data.source`, skill, approval, and repeat rule | Excludes non-human/approval messages; computes exact first-push green rate and durable yield | automated unit test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` | `b196dd1` |
| T7 | CLI offline execution, missing optional directories, malformed JSONL resilience, and bounded GraphQL | yes | CLI with `--prs-file`, absent dirs, truncated JSONL line, plus `fetchMergedPrs` GraphQL check | Exits 0, emits `n/a` for absent sources, avoids 500k GraphQL `authors` node limit | automated CLI + unit test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` + live `divydvd/dev-loop` run | `b196dd1` |
| T8 | `infra-review` shadow-mode skill wiring and agent compliance | yes | Baseline vs revised `skills/infra-review/SKILL.md` on fixed `M1-IR` scenario + `F1` control | Contract test RED->GREEN; `5/5` GREEN round-2 fresh samples pass all 5 items `(a)-(e)` | structural + fresh subagent checks | `scripts/testing-contract.test.mjs` & `M1-IR` samples | passed | `node --test scripts/testing-contract.test.mjs` + `green-r2-1..5` | `b196dd1` |

| T9 | Review regressions (renames, bounded `[from-14d, to-14d]` cohort, `repo#N` reverts, truncated files, invalid SHAs) | yes | Temp Git repo with renamed file, 40d/16d/post-`to` PRs, `Reverts org/app#3`, `filesTruncated`, and `--all` SHA | Follows rename, bounds mature cohort & fix-ups, rejects `--all` flag SHA, accurate `n/a` reasons | automated regression test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` (9/9 pass) | final head |

- Category assessment:
  - boundaries and invalid input -> T1, T2, T7, T9 (0 added lines, missing dirs, truncated active `events.jsonl` line, flag-like invalid SHA).
  - permissions and state changes -> T5 (cumulative checkpoints across session resume and `null` shutdown; file edit invalidating read-cache state).
  - concurrency and retries -> T7 (read-only access without locking or mutating live `work-ledger` or `events.jsonl`, including active partial writes).
  - partial failure and recovery -> T4, T7, T9 (missing local Git commits or missing ledger directory degrade to explicit status / `n/a` without throwing).
  - existing consumers -> T8 (existing 17-row `infra-review` table, `check.mjs`, and `testing-contract.test.mjs` remain intact).
  - UI, accessibility, and device -> excluded: repository has no UI or device app (`AGENTS.md`).
  - migration and compatibility -> T4, T5, T9 (supports `ledger.json` v1, squash and merge commits, and Git file renames).
  - performance -> optional limit: `git blame` runs only on production files touched by mature-window PRs, keeping repo runs under a few seconds.
- Required blockers: none.
- Optional limits: Sampled fresh-agent checks verify instruction use, not universal model compliance.
- Reassessment: T1–T8 retained at `b196dd1` and re-verified with T9 after independent review fixes.

## Global Constraints
- `com.github.copilot/rules/core.mdc` stays unchanged (59 lines <= 60).
- `skills/dev-loop/assets/pr-body.md` stays unchanged (0 new manual template fields).
- Zero external npm packages; use built-in Node 22+ standard library modules only.
- Invoke scripts via `node scripts/collect-metrics.mjs` in skill prose (never bare path, per `writing-skills`).
- Never estimate missing metrics: emit `null` in JSON and `"n/a"` in Markdown with a reason.
- Prose in docs, skill updates, changelog, and reports follows ASD-STE100 Simplified Technical English.

## Review Focus
1. **Cumulative `totalNanoAiu` checkpoints:** `events.jsonl` writes multiple `session.usage_checkpoint` events across turns and resumes; summing them inflates cost 10x+. T5 pins taking the last checkpoint/shutdown value.
2. **Truncated trailing line in active `events.jsonl`:** Live sessions may have a half-written final line; T7 pins line-by-line parsing that tolerates a malformed final line without discarding the session.
3. **Untested production commit after a tested parent SHA:** A PR tested at `shaA` that later modifies `src/foo.mjs` in `shaB` without re-testing must NOT pass ancestry verification; T4 pins rejecting code diffs while accepting docs-only diffs.
4. **Shared multi-PR coordinator sessions:** Two PRs referencing the same session must mark session cost/message attribution `ambiguous` instead of counting one session's `totalNanoAiu` twice; T5 pins this.
5. **Git blame on deleted/renamed files at `--to`:** A production file added in PR #1 and completely deleted before `--to` does not exist in `<mainAtTo>`; `computeCodeSurvival` must treat missing files in `<mainAtTo>` as `0` surviving lines instead of crashing `git blame`; T2 pins this.

---

### Task 1: Baseline `infra-review` Skill Evaluation (RED)

**Files:**
- Read: `skills/infra-review/SKILL.md`
- Artifact: session workspace `files/m1-skill-eval.md` (uncommitted session artifact)

**Interfaces:**
- Produces: Verbatim RED baseline observations for `skills/infra-review/SKILL.md` across 5 fresh subagent samples on a fixed weekly review fixture (shared multi-PR session, docs-only commit after ledger validation, mixed trivial/multi-task PRs, and code churn after merge).

- [ ] **Step 1: Dispatch 5 fresh read-only subagent samples against current `skills/infra-review/SKILL.md`**
Run 5 parallel read-only `explore` subagents with the fixed weekly fixture and current `skills/infra-review/SKILL.md`, asking how each measure is computed and what commands run.

- [ ] **Step 2: Record verbatim baseline gaps in `m1-skill-eval.md`**
Confirm whether baseline samples miss 14-day line survival, undercount docs-only follow-up commits via literal 7-char table checks, mix routes in mean calls, or lack a deterministic collector command.

---

### Task 2: Implement `scripts/collect-metrics.mjs` with TDD

**Files:**
- Create: `scripts/collect-metrics.test.mjs`
- Create: `scripts/collect-metrics.mjs`

**Interfaces:**
- Produces in `scripts/collect-metrics.mjs`:
  - `isProductionPath(filePath: string): boolean`
  - `classifyRoute(pr: object): "trivial" | "small" | "multi-task"`
  - `verifyPrEvidence(pr: object, options: { ledgerData?: object | null, checkoutDir?: string | null }): { status: string, verified: boolean, testedSha: string | null }`
  - `computeCodeSurvival(prs: object[], options: { checkoutDir: string, targetRef: string }): { addedLines: number, survivingLines: number, rate: number | null, perPr: object[] }`
  - `detectFixups(prs: object[], options?: { checkoutDir?: string | null, windowDays?: number }): { count: number, fixupPrNumbers: number[], details: object[] }`
  - `analyzeSessions(prs: object[], options: { sessionsDir?: string | null, repo: string }): { mappedCount: number, sharedPrNumbers: number[], perPr: Record<number, object> }`
  - `collectMetrics(options: object): object`
  - `formatMarkdownReport(report: object): string`

- [ ] **Step 1: Write failing tests T1–T7 in `scripts/collect-metrics.test.mjs`**
Cover `isProductionPath`, `classifyRoute`, `computeCodeSurvival` (including modified, deleted-line, deleted-file, and 0-addition PRs), `detectFixups`, `verifyPrEvidence` (exact SHA, docs-only child, untested code child, trivial PR, absent ledger), `analyzeSessions` (cumulative `totalNanoAiu`, edit-reset duplicate reads, shared-session ambiguity, steering message filter, truncated trailing JSONL line), `durableFirstPassYield`, and CLI `--format json` / `--format markdown`.

- [ ] **Step 2: Run `node --test scripts/collect-metrics.test.mjs` and confirm RED failure**
Run: `node --test scripts/collect-metrics.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/collect-metrics.mjs`.

- [ ] **Step 3: Implement `scripts/collect-metrics.mjs` (minimal zero-dependency ES module, <350 lines)**
Implement all exported functions and CLI argument parser (`parseArgs`) using `execFileSync("git", ...)` (no shell interpolation) and safe JSONL reading.

- [ ] **Step 4: Run `node --test scripts/collect-metrics.test.mjs` and full repo test suite to confirm GREEN**
Run: `node --test scripts/collect-metrics.test.mjs && node scripts/check.mjs`
Expected: PASS (0 failures).

- [ ] **Step 5: Commit Task 2**
Commit `scripts/collect-metrics.mjs`, `scripts/collect-metrics.test.mjs`, and `docs/superpowers/plans/2026-11-13-collect-metrics-script.md`.

---

### Task 3: Wire `skills/infra-review/SKILL.md`, CI, Docs, and Manifests (`0.5.9`)

**Files:**
- Modify: `scripts/testing-contract.test.mjs`
- Modify: `skills/infra-review/SKILL.md`
- Modify: `.github/workflows/check.yml`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `plugin.json`
- Modify: `.github/plugin/marketplace.json`

**Interfaces:**
- Consumes: CLI flags and output contract of `scripts/collect-metrics.mjs` from Task 2.
- Produces: Updated `0.5.9` plugin package, shadow-mode `infra-review` instructions, `Rule/check map` entry, and CI wiring.

- [ ] **Step 1: Add failing contract assertions (T8) to `scripts/testing-contract.test.mjs`**
Assert that `skills/infra-review/SKILL.md` invokes `node scripts/collect-metrics.mjs` in shadow mode, preserves the existing 17-row table, records route-bucketed `totalNanoAiu`, 14-day code survival, Git-ancestry ledger verification, and shared-session `ambiguous` handling, and that `.github/workflows/check.yml` runs `node --test scripts/collect-metrics.test.mjs`.

- [ ] **Step 2: Run `node --test scripts/testing-contract.test.mjs` and confirm RED failure**
Run: `node --test scripts/testing-contract.test.mjs`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Update `skills/infra-review/SKILL.md`, `.github/workflows/check.yml`, `README.md`, `CHANGELOG.md`, `plugin.json`, and `.github/plugin/marketplace.json`**
Keep all prose in ASD-STE100. Bump version from `0.5.8` to `0.5.9`. Keep `core.mdc` untouched.

- [ ] **Step 4: Run `node scripts/check.mjs` and all `node --test` suites to confirm GREEN**
Run: `node scripts/check.mjs && node --test scripts/*.test.mjs tools/work-ledger/*.test.mjs`
Expected: PASS (`check: no faults` and 0 test failures).

- [ ] **Step 5: Run 5 fresh revised subagent samples (GREEN) + F1 control against updated `skills/infra-review/SKILL.md`**
Verify all 5 samples run `node scripts/collect-metrics.mjs` in shadow mode, keep `ambiguous` shared-session boundaries, and preserve `F1` layer classification.

- [ ] **Step 6: Commit Task 3**
Commit all updated skill, doc, workflow, test, and manifest files.

---

### Task 4: Smoke Install, Live Repo Run, Independent Review, and PR

**Files:**
- Verify all branch files against `main`

- [ ] **Step 1: Run temporary `COPILOT_HOME` install and discovery smoke test + live read-only `divydvd/dev-loop` metrics report**
Install this checkout in a `mktemp -d` `COPILOT_HOME`, check `copilot instruction list` and `copilot skill list`, run `node scripts/collect-metrics.mjs` on `divydvd/dev-loop`, and remove the temp directory.

- [ ] **Step 2: Dispatch independent `code-review` agent on `main...HEAD`**
Give the reviewer the full diff, acceptance record, test matrix, and `AGENTS.md` checklist. Address any confirmed Critical or Important findings with TDD and focused review.

- [ ] **Step 3: Run final-head verification, push once, open PR, and report**
Confirm clean `git status`, run `node scripts/check.mjs` and all CI suites at `HEAD`, push once, call `create_pull_request` with `skills/dev-loop/assets/pr-body.md`, record `work_ledger_record` if available, inspect CI and automatic review, and report readiness to the owner.

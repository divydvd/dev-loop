# PR 2 (Milestone M2): PR-Comment & 14-Day Fix-Up Rule Miner + Reviewer Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver PR 2 (`v0.5.18`) of the standalone 5-PR upgrade specification: extract recurring addressed inline PR review threads and 14-day fix-up PR diffs during weekly `infra-review`, validate candidate rules through a two-agent `Generator` + `Validator` pass into `docs/testing/review-checklist.md` (`<= 25` active rules, `+0` startup bytes), wire Step-5 independent review to load matching checklist rules, and prune non-safety rules with `0` catches across `4` active weeks.

**Architecture:** Add a zero-dependency Node ESM script (`skills/infra-review/scripts/mine-pr-evidence.mjs`) that ingests GitHub PR/review-comment JSON (offline files or `gh api`) plus `collect-metrics.mjs` 14-day fix-up output, extracts production diffs (`<= 160` lines/PR via `git show --first-parent --unified=2`), strips prompt-injection tags and redacts secrets (`"untrusted": true`), audits `docs/testing/review-checklist.md` capacity (`25` max) and 4-week stale non-safety rules, and gates mining on `fixupSignals.length >= 1 || addressedThreads.length >= 2`. Pair it with `skills/infra-review/references/rule-miner.md` (`Generator` + fail-closed `Validator`), `skills/dev-loop/assets/review-checklist.md`, and Step-5 `Checklist path` wiring in `skills/dev-loop/SKILL.md` and `skills/dev-loop/assets/project-profile.md`.

**Tech Stack:** Node.js ESM built-ins (`node:fs`, `node:path`, `node:child_process`, `node:util`, `node:url`, `node:test`, `node:assert/strict`), Markdown skills/templates, GitHub Actions CI.

**Spec:** `/Users/divydwivedi/Downloads/dev-loop-standalone-agent-spec.md` (`## Mandatory Repository Invariants & CI Guardrails` and `## PR 2: PR-Comment & 14-Day Fix-Up Rule Miner + Reviewer Checklist`; `origin/main` at `0f7b6bf` / `v0.5.17`).

## Abstract
Weekly `infra-review` currently counts fix-up pull requests and review rounds, but it does not convert recurring inline review catches or 14-day fix-up diffs into reusable project review checks.
This plan adds a deterministic evidence extractor (`skills/infra-review/scripts/mine-pr-evidence.mjs`), a two-agent `Generator` + `Validator` contract (`skills/infra-review/references/rule-miner.md`), and a 25-rule project checklist template (`skills/dev-loop/assets/review-checklist.md`) loaded only during `dev-loop` Step-5 independent review.
The expected result is compounding defect prevention across project repositories with `+0` bytes added to `com.github.copilot/rules/core.mdc` and automatic retirement of non-safety rules that record `0` catches across `4` consecutive active weeks.

## Global Constraints
- Leave `com.github.copilot/rules/core.mdc` and `GEMINI.md` untouched (`0` diff lines against `origin/main`).
- Use zero npm dependencies and Node ESM `.mjs` built-ins only (`execFileSync` with argument arrays; never shell string interpolation).
- Keep total changed production lines `<= 400` (estimated `~255` production lines in `skills/infra-review/scripts/mine-pr-evidence.mjs` and the 5 JSON manifests).
- Preserve all `scripts/check.mjs` invariants: `SKILL_LINK_RE` backtick resolution inside each `skills/<skill>/` directory, `<= 15,000` UTF-8 bytes startup budget across Copilot, Claude Code, and Gemini CLI, and `<= 5,500` UTF-8 bytes for `skills/dev-loop/assets/project-profile.md`.
- Preserve all `scripts/testing-contract.test.mjs` and `scripts/independent-review.test.mjs` invariants, including `dataRows.length === 17` on the main table before `### Shadow-mode objective telemetry` in `skills/infra-review/SKILL.md` and single-line `- **Done:**` in `skills/dev-loop/SKILL.md`.
- Sync all 5 host manifests (`plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `gemini-extension.json`) plus `CHANGELOG.md` to `0.5.18` (since `origin/main` at `0f7b6bf` already published `0.5.17`, and `scripts/release.mjs` requires a unique `CHANGELOG.md` section per version).
- Write at least 80% of prose in ASD-STE100 Simplified Technical English.

## Review Focus
1. **Merge-commit empty diff trap in `git show`:** Plain `git show <mergeCommit>` outputs empty combined diffs on 2-parent GitHub merge commits; `mine-pr-evidence.mjs` must pass `--first-parent --format= --no-ext-diff --unified=2` so both 1-parent squash commits and 2-parent merge commits yield unified production hunks capped at `<= 160` lines.
2. **Real `collect-metrics.mjs` JSON schema vs `fixupPrs` shorthand:** `scripts/collect-metrics.mjs` emits `durability.fixups` (`[{ fixupPr, targetPr, method }]`), while callers or fixtures may pass `fixupPrs`; `mine-pr-evidence.mjs` must accept both shapes without losing silent `blame_churn` fix-ups.
3. **Negated replies, post-merge comments, and code generics during sanitization:** A reply saying `"not fixed"` or `"won't be addressed"` must not count as a fix confirmation; post-merge comments must not match `original_commit_id !== headRefOid`; `sanitizeUntrustedText` must strip HTML comments and `<system...>` / `<HARD-GATE>` injection tags without corrupting code generics such as `List<String>` in diffs.
4. **Escaped pipes and `Safety? = yes` protection in checklist parsing:** `parseChecklist` must handle escaped pipes (`\|`) or pipes inside inline code spans, clamp `remainingSlots` at `0` when `activeRuleCount >= 25`, and never add `Safety? = yes` rows (or malformed `Safety?` values) to `staleRules`.
5. **Cross-skill `SKILL_LINK_RE` traps in `skills/infra-review/`:** Inside `skills/infra-review/SKILL.md` and `skills/infra-review/references/rule-miner.md`, never write bare `` `scripts/collect-metrics.mjs` ``, `` `scripts/check.mjs` ``, or `` `assets/review-checklist.md` ``; always prefix repo-root paths with `<dev-loop-checkout>/scripts/...` and cross-skill paths with `skills/dev-loop/assets/review-checklist.md`.

## Acceptance record
- **Goal:** Extract addressed inline PR review catches and 14-day fix-up diffs during weekly `infra-review`, validate candidate checklist rules via fresh `Generator` + `Validator` subagents into `docs/testing/review-checklist.md` (`<= 25` active rules, `+0` startup bytes), load matching rules during `dev-loop` Step-5 independent review, and prune stale non-safety rules after `4` active weeks with `0` catches.
- **Done when:**
  - [x] `skills/dev-loop/assets/review-checklist.md` provides the 25-rule `## Active rules` and `## Retired or automated rules` template.
  - [x] `skills/infra-review/scripts/mine-pr-evidence.mjs` runs offline (`--prs-file` + `--comments-file` with zero `gh` calls) and online (`gh`), filters unaddressed/bot/non-prod/negated comments, extracts 14-day fix-up production diffs (`<= 160` lines/PR across 1-parent and 2-parent commits), sanitizes secrets and `<system...>` / `<HARD-GATE>` tags with `"untrusted": true`, parses `--checklist` (`activeRuleCount`, `remainingSlots`, `staleRules` preserving `Safety? = yes`), and enforces `eligibleForMining` (`fixupSignals.length >= 1 || addressedThreads.length >= 2`).
  - [x] `skills/infra-review/references/rule-miner.md`, `skills/infra-review/SKILL.md`, `skills/dev-loop/SKILL.md`, and `skills/dev-loop/assets/project-profile.md` wire the `Generator` + fail-closed `Validator` workflow and Step-5 `Checklist path` loading while preserving all 17 `infra-review` table rows, `<= 5.5 KB` profile size, and `writing-skills` `5` baseline (`RED`) -> `5` revised (`GREEN`) subagent verification.
  - [x] `.github/workflows/check.yml` runs `node --test scripts/mine-pr-evidence.test.mjs`, `README.md` (`## Rule/check map`) maps the miner and its test/limits, and `CHANGELOG.md` plus all 5 manifests are bumped to `0.5.18` with `0` diff lines in `com.github.copilot/rules/core.mdc` and `GEMINI.md`.
  - [ ] `node scripts/check.mjs`, `node scripts/sync-host-core.mjs --check`, all CI test suites, temporary `COPILOT_HOME` install + `copilot instruction list` / `copilot skill list` smoke checks, and independent branch code review pass at `HEAD`.
- **Required evidence:** `node --test scripts/mine-pr-evidence.test.mjs scripts/testing-contract.test.mjs scripts/independent-review.test.mjs`; full CI suite run; `node scripts/check.mjs`; `node scripts/sync-host-core.mjs --check`; temporary `COPILOT_HOME` install and discovery smoke check; `writing-skills` `5` RED vs `5` GREEN consumer checks; independent `code-review` subagent verdict; `work_ledger_record` (`validated`, `note`, `review_clean`) pinned to `HEAD`; no device test (this repo has no app).
- **Test matrix:** Compact test matrix (`T-M2-1`–`T-M2-7`) below, saved before implementation under `skills/dev-loop/references/testing.md`.
- **Regression selection:** Reuse all 9 `.github/workflows/check.yml` suites (`check.mjs`, `device-handoff`, `branch-maintenance`, `independent-review`, `testing-contract`, `collect-metrics`, `run-benchmark`, `portability-contract`, `release`, and `tools/work-ledger/*.test.mjs`) plus add `scripts/mine-pr-evidence.test.mjs`. `divydvd/dev-loop` defines no separate `docs/testing/regression-matrix.md` in `AGENTS.md`.
- **Size estimate:** Task 1: `~245` production lines (`skills/infra-review/scripts/mine-pr-evidence.mjs`); Task 2: `0` production lines (Markdown skill/reference/template files); Task 3: `~7` production lines (5 JSON manifests + `.github/workflows/check.yml`; `README.md` and `CHANGELOG.md` are docs). Total `~252` production lines (`<= 400`).
- **Milestone selection:** Milestone M2 (PR 2 only) of the owner-approved 5-PR upgrade specification, branched independently from `origin/main` (`0f7b6bf`). PRs 1, 3, 4, and 5 remain out of scope for this branch.
- **Out of scope:** Flow-doc drift scanner (PR 1), multi-agent review panel router (PR 3), `waived` gate status (PR 4), `work-ledger` config/outage changes (PR 5), and any edit to `com.github.copilot/rules/core.mdc` or `GEMINI.md`.
- **Risky area:** None (`com.github.copilot/rules/core.mdc`, `GEMINI.md`, approval gates, and finish rules have `0` diff lines; no risky-plan stop required).
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content, or a harmless-edit exemption has a recorded reason. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains. A case marked not applicable needs a source or requirements reference and a recorded reason; it is not a pass.
  - Blocked: 3 failed fixes, missing access, no device, or a product decision. Normally, stop and report with the evidence. For an approved multi-milestone assignment, use `references/milestones.md`: defer the blocked milestone and its actual dependents, then continue only eligible independent work. During confirmed active absence mode, also apply the absence reference. Stop when no eligible work remains. Global safety stops and three failed fixes still require a stop.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PR 2 (M2) | Deterministic PR-comment & 14-day fix-up evidence miner, `Generator`+`Validator` rule-miner reference, 25-rule project checklist template, and Step-5 checklist loading (`v0.5.18`) | `T-M2-1`–`T-M2-7` (`mine-pr-evidence.test.mjs`, `testing-contract.test.mjs`, `independent-review.test.mjs`, `check.mjs`, `5/5` `writing-skills` RED->GREEN, temporary `COPILOT_HOME` smoke test, independent `code-review`) | None (independent branch from `origin/main` `0f7b6bf`) | `divydvd-pr-evidence-rule-miner-m2` -> `main` (independent PR per spec) | Candidate rule synthesis uses two fresh subagents when `eligibleForMining` is `true`; checklist loading is instruction-driven in Step 5 (`+0` bytes in `core.mdc`) | in_progress | none | Implement Tasks 1–3, review, verify, and open PR against `main` |

- Overall assignment: Coordinated child session scoped strictly to PR 2 (`M2`); PRs 1, 3, 4, and 5 are managed separately by the coordinator session (`a97500cf-c2ac-48ad-a87f-25e566f01c3e`).

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-M2-1 | Inline comment filtering & offline execution (`--prs-file` + `--comments-file`) | yes | Offline PR + comment fixtures: bikeshed comment, coverage-bot comment, docs/test comment, negated reply (`"not fixed"`), post-merge comment, commit-after-comment thread, and fix-reply thread; injected throwing `execGh` | Zero `gh` calls; retains only production top-level comments addressed via before-merge file modification or positive fix reply | automated (TDD) | `scripts/mine-pr-evidence.test.mjs` | passed | `node --test scripts/mine-pr-evidence.test.mjs` (`7/7` pass) | `56e59ba` |
| T-M2-2 | 14-day fix-up ingestion (`collect-metrics.mjs` `durability.fixups` + `fixupPrs` + title/body `#<N>`) and `<= 160` production diff-line cap on 1-parent and 2-parent merge commits | yes | Temp git repo with 200-line production fix-up commit + docs/test edits in both squash and `--no-ff` merge commits, plus `collect-metrics.mjs` JSON fixture | Ingests silent blame-churn and explicit `#<N>` fix-ups; extracts only production hunks via `git show --first-parent --unified=2`; caps diff at `<= 160` lines with `truncated: true` | automated (TDD) | `scripts/mine-pr-evidence.test.mjs` | passed | `node --test scripts/mine-pr-evidence.test.mjs` (`7/7` pass) | `56e59ba` |
| T-M2-3 | Secret redaction & prompt-injection tag sanitization with `"untrusted": true` | yes | PR body, comment, and diff containing `ghp_...`, `sk-...`, `Bearer ...`, `<!-- hidden -->`, `<system_instruction>`, `<HARD-GATE>`, and `List<String>` | Redacts tokens to `[REDACTED]`, strips HTML comments and `<system...>` / `<HARD-GATE>` tags, preserves `List<String>`, and sets `untrusted: true` | automated (TDD) | `scripts/mine-pr-evidence.test.mjs` | passed | `node --test scripts/mine-pr-evidence.test.mjs` (`7/7` pass) | `56e59ba` |
| T-M2-4 | Section 3 threshold (`eligibleForMining`) & checklist capacity / 4-week non-safety pruning (`parseChecklist`) | yes | `0`/`1`/`2` addressed threads, `1` fix-up PR, and `review-checklist.md` with `Safety? = no` (`Active weeks: 4, Confirmed catches: 0`), `Safety? = yes` (`Active weeks: 6, Confirmed catches: 0`), escaped pipes, and 25-rule cap | `1` non-fixup comment -> `eligibleForMining: false`; `2` threads or `1` fix-up -> `true`; `remainingSlots = max(0, 25 - activeRuleCount)`; flags only `Safety? = no` with `Active weeks >= 4` and `Confirmed catches = 0` | automated (TDD) | `scripts/mine-pr-evidence.test.mjs` | passed | `node --test scripts/mine-pr-evidence.test.mjs` (`7/7` pass) | `56e59ba` |
| T-M2-5 | `writing-skills` RED -> GREEN consumer evaluation + structural skill/profile contracts | yes | 5 fresh baseline (`0.5.17`) vs 5 fresh revised (`0.5.18`) subagents on weekly rule-mining + Step-5 checklist scenarios; `testing-contract.test.mjs` & `independent-review.test.mjs` | Baseline fails new rule-miner / `Checklist path` questions while passing controls (`RED`); revised passes `5/5` (`GREEN`); all 17 `infra-review` rows, `<= 5.5 KB` profile, and Step-5 gates preserved | subagent + automated | `scripts/testing-contract.test.mjs`, `scripts/independent-review.test.mjs`, `CHANGELOG.md` | passed | `5/5` baseline RED -> `5/5` revised GREEN; `testing-contract.test.mjs` (`31/31`) + `independent-review.test.mjs` (`6/6`) | `56e59ba` |
| T-M2-6 | Repo invariants, CI workflow, `#rulecheck-map`, `0.5.18` 5-manifest parity, and temporary `COPILOT_HOME` smoke check | yes | `node scripts/check.mjs`, `node scripts/sync-host-core.mjs --check`, all 10 CI suites, `git diff origin/main -- com.github.copilot/rules/core.mdc GEMINI.md`, and isolated `COPILOT_HOME` install | `check.mjs` & `sync-host-core.mjs --check` exit `0`; `core.mdc` & `GEMINI.md` have `0` diff lines; all 10 CI suites pass; temporary `COPILOT_HOME` lists `dev-loop: core` and all 4 skills at `0.5.18` | automated + CLI smoke | `scripts/check.mjs`, `.github/workflows/check.yml`, `README.md` | passed | `327` tests passed, `0` failed across 10 suites; `COPILOT_HOME` install `v0.5.18` + `claude plugin validate --strict` passed | `56e59ba` |
| T-M2-7 | Independent whole-branch review, GitHub CI `check`, and `copilot-pull-request-reviewer` | yes | `origin/main...HEAD` branch diff and open GitHub PR | Independent `code-review` resolves all Critical/Important findings; GitHub Actions `check` passes; `copilot-pull-request-reviewer` check-run inspected and threads resolved; `work_ledger_record` pinned at `HEAD` | independent review + CI | GitHub PR + `work-ledger` | not run | none | none |

- Category assessment:
  - Boundaries and invalid input -> `T-M2-2` (`160`-line diff cap), `T-M2-4` (`0`/`1`/`2` threshold, `25`-rule cap, `4`-week boundary), CLI invalid-flag/missing-arg checks in `mine-pr-evidence.test.mjs`.
  - Permissions and state changes -> `T-M2-3` (`untrusted: true` isolation, secret redaction, tag stripping), `T-M2-4` (`Safety? = yes` non-pruning).
  - Existing consumers -> `T-M2-2` (`collect-metrics.mjs` output schema compatibility), `T-M2-5` & `T-M2-6` (`testing-contract.test.mjs`, `independent-review.test.mjs`, `check.mjs`, `release.mjs`).
  - Migration and compatibility -> `T-M2-5` (`"inline only"` or missing `docs/testing/review-checklist.md` fallback).
  - Concurrency/retries, partial failure/recovery, UI/accessibility/device, performance -> Excluded: `mine-pr-evidence.mjs` is a stateless single-process CLI tool with bounded local/paginated reads (`<= 160` diff lines/PR) and no UI, daemon state, or device surface.
- Required blockers: `T-M2-1`–`T-M2-7` until executed and verified at `HEAD`.
- Optional limits: Live `gh api` pagination against GitHub is covered via CLI argument/pagination unit tests rather than live network calls in CI so tests stay deterministic and offline.
- Reassessment: Update after implementation, independent review, and final commit SHA.

---

### Task 1: Project Checklist Template & Deterministic Evidence Extractor (`mine-pr-evidence.mjs`)

**Files:**
- Create: `skills/dev-loop/assets/review-checklist.md`
- Create: `skills/infra-review/scripts/mine-pr-evidence.mjs`
- Test: `scripts/mine-pr-evidence.test.mjs`

**Interfaces:**
- Consumes: `collect-metrics.mjs` JSON output (`durability.fixups` or `fixupPrs`) when `--metrics-file` is passed; GitHub PR/comment JSON via `--prs-file` / `--comments-file` or `gh`.
- Produces:
  - `skills/dev-loop/assets/review-checklist.md` (exact 9-column `## Active rules` + 3-column `## Retired or automated rules` Markdown template)
  - Named exports in `skills/infra-review/scripts/mine-pr-evidence.mjs`:
    - `sanitizeUntrustedText(text: string): string`
    - `parseChecklist(markdownText: string): { maxRules: 25, activeRuleCount: number, remainingSlots: number, activeRules: Array<object>, staleRules: Array<object> }`
    - `minePrEvidence(options): EvidencePacket` returning `{ repo, window: { from, to }, untrusted: true, eligibleForMining: boolean, addressedThreads: Array<object>, fixupSignals: Array<object>, checklist: object }`
  - CLI entrypoint supporting `--repo`, `--from`, `--to`, `--checkout`, `--metrics-file`, `--prs-file`, `--comments-file`, `--checklist`, `--json`, and `--help`.

- [ ] **Step 1: Write the failing test suite in `scripts/mine-pr-evidence.test.mjs`**
  Cover `T-M2-1`–`T-M2-4` plus `Review Focus` items 1–4:
  1. Offline comment filtering (`execGh` spy throws if called): drops unaddressed bikeshed comment, `codecov[bot]` banner comment, non-prod `docs/guide.md` comment, post-merge comment, and `"not fixed"` negated reply; keeps human/Copilot/independent comments with either `original_commit_id !== headRefOid` (and file modified in checkout when git commits exist) or positive fix reply (`fixed`/`addressed`/`done`/`updated`/`resolved`).
  2. 14-day fix-up extraction: ingests `collect-metrics.mjs` `durability.fixups` (`blame_churn`) + `fixupPrs` + title/body `#<N>` fix/revert PRs; extracts production-only unified hunks via `git show --first-parent --unified=2` on both squash and 2-parent `--no-ff` merge commits; caps diff output at `<= 160` lines per PR (`truncated: true`).
  3. Sanitization: redacts `ghp_...`, `sk-...`, and `Bearer ...` to `[REDACTED]`, strips `<!-- ... -->`, `<system...>`, and `<HARD-GATE>` tags, preserves `List<String>`, and sets `untrusted: true`.
  4. Threshold & checklist audit: verifies `0` signals and `1` addressed thread -> `eligibleForMining: false`, `2` addressed threads -> `true`, `1` fix-up PR -> `true`; parses `skills/dev-loop/assets/review-checklist.md` and custom checklists (including escaped `\|` inside backticks and 25-rule saturation), flagging only `Safety? = no` with `Active weeks >= 4` and `Confirmed catches = 0` in `staleRules` and never flagging `Safety? = yes`.
  5. CLI `--json` subprocess test (stripping `NODE_TEST_CONTEXT` and `GIT_*` env vars) verifying exit `0` and parsed JSON output.

- [ ] **Step 2: Run `node --test scripts/mine-pr-evidence.test.mjs` to verify RED**
  Run: `node --test scripts/mine-pr-evidence.test.mjs`
  Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `skills/infra-review/scripts/mine-pr-evidence.mjs`).

- [ ] **Step 3: Create `skills/dev-loop/assets/review-checklist.md` and implement `skills/infra-review/scripts/mine-pr-evidence.mjs`**
  - Write `skills/dev-loop/assets/review-checklist.md` matching Section 1 of PR 2 in the spec.
  - Implement `sanitizeUntrustedText`, `parseChecklist`, `minePrEvidence`, `formatEvidenceSummary`, and CLI `parseArgs` in `skills/infra-review/scripts/mine-pr-evidence.mjs` using only Node built-ins and `execFileSync`.

- [ ] **Step 4: Run `node --test scripts/mine-pr-evidence.test.mjs` to verify GREEN**
  Run: `node --test scripts/mine-pr-evidence.test.mjs`
  Expected: PASS (`0` failures).

- [ ] **Step 5: Commit Task 1**
  Commit `skills/dev-loop/assets/review-checklist.md`, `skills/infra-review/scripts/mine-pr-evidence.mjs`, and `scripts/mine-pr-evidence.test.mjs`.

---

### Task 2: `Generator` + `Validator` Reference & Skill Wiring (`writing-skills` RED -> GREEN)

**Files:**
- Create: `skills/infra-review/references/rule-miner.md`
- Modify: `skills/infra-review/SKILL.md`
- Modify: `skills/dev-loop/SKILL.md`
- Modify: `skills/dev-loop/assets/project-profile.md`
- Modify: `scripts/testing-contract.test.mjs`

**Interfaces:**
- Consumes: `skills/infra-review/scripts/mine-pr-evidence.mjs` CLI flags & JSON fields (`eligibleForMining`, `remainingSlots`, `staleRules`, `addressedThreads`, `fixupSignals`), `skills/dev-loop/assets/review-checklist.md`.
- Produces:
  - `skills/infra-review/references/rule-miner.md` (`Generator` + fail-closed `Validator` contract, `25`-rule cap, 4-week non-safety retirement, `"untrusted": true` prompt-injection boundary)
  - Updated `skills/infra-review/SKILL.md` (`### Shadow-mode objective telemetry`, `## 4. Choose the changes`, and `## 5. Output`, keeping `17` main table rows)
  - Updated `skills/dev-loop/assets/project-profile.md` (`Checklist path` under `### Review checklist`, `<= 5.5 KB`)
  - Updated `skills/dev-loop/SKILL.md` (`## 5. Self-review` conditional `Checklist path` loading, never at startup)

- [ ] **Step 1 (`RED`): Run 5 fresh baseline `writing-skills` consumer subagents AND add failing contract test in `scripts/testing-contract.test.mjs`**
  - Dispatch 5 fresh read-only subagents against the unmodified `0.5.17` `skills/infra-review/SKILL.md`, `skills/dev-loop/SKILL.md`, and `skills/dev-loop/assets/project-profile.md` testing:
    - `Q1`: exact command/script to mine inline PR comments + 14-day fix-up diffs into an evidence packet;
    - `Q2`: two-agent `Generator` + fresh `Validator` rule-synthesis contract, `min(3, remainingSlots)` out of `25`, allowed domains (`arch-correctness`, `concurrency-state`, `security-privacy`, `ui-a11y`), and fail-closed rejection gates;
    - `Q3`: `docs/testing/review-checklist.md` storage + Step-5-only loading via `Checklist path` (`+0` startup bytes) and `"inline only"` fallback;
    - `Q4`: 4-week `0`-catch retirement for `Safety? = no` vs preserving `Safety? = yes`, plus baseline controls (`90.0%` quality floor, `T-IR8` `unmatched_non_copilot_or_missing_session` `n/a`, and mandatory independent PR review).
  - Add contract test `T-IR9: rule miner, project review checklist template, and Step-5 checklist path wiring` in `scripts/testing-contract.test.mjs`.
  - Run: `node --test scripts/testing-contract.test.mjs`
  - Expected: Baseline subagents fail `Q1`–`Q3` (`RED`) while passing controls, and `testing-contract.test.mjs` fails on `T-IR9`.

- [ ] **Step 2 (`GREEN`): Author `skills/infra-review/references/rule-miner.md` and update `skills/infra-review/SKILL.md`, `skills/dev-loop/SKILL.md`, and `skills/dev-loop/assets/project-profile.md`**
  - Use ASD-STE100 and positive recipes/conditionals per `writing-skills`.
  - Obey `SKILL_LINK_RE`: in `skills/infra-review/**/*.md`, write `scripts/mine-pr-evidence.mjs` and `references/rule-miner.md`, prefix repo-root scripts with `<dev-loop-checkout>/scripts/...`, and write `skills/dev-loop/assets/review-checklist.md` for cross-skill references.

- [ ] **Step 3: Verify `check.mjs`, contract suites, and 5 fresh revised `writing-skills` consumer subagents (`GREEN`)**
  - Run: `node scripts/check.mjs && node --test scripts/testing-contract.test.mjs scripts/independent-review.test.mjs`
  - Dispatch 5 fresh read-only subagents against the revised `0.5.18` files with the exact same `Q1`–`Q4` prompt and verify `5/5` convergence across `Q1`–`Q4` and all baseline controls.

- [ ] **Step 4: Commit Task 2**
  Commit `skills/infra-review/references/rule-miner.md`, `skills/infra-review/SKILL.md`, `skills/dev-loop/SKILL.md`, `skills/dev-loop/assets/project-profile.md`, and `scripts/testing-contract.test.mjs`.

---

### Task 3: CI Workflow, `README.md` Rule/Check Map, `CHANGELOG.md`, and `0.5.18` Manifest Sync

**Files:**
- Modify: `.github/workflows/check.yml`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`
- Modify: `scripts/testing-contract.test.mjs`

**Interfaces:**
- Consumes: `skills/infra-review/scripts/mine-pr-evidence.mjs`, `scripts/mine-pr-evidence.test.mjs`, `T-M2-5` `writing-skills` `RED -> GREEN` results.
- Produces: CI coverage for `mine-pr-evidence.test.mjs`, `#rulecheck-map` row in `README.md`, `## 0.5.18` changelog entry compatible with `scripts/release.mjs`, and 5-manifest version parity at `0.5.18`.

- [ ] **Step 1 (`RED`): Extend CI suite assertion in `scripts/testing-contract.test.mjs` to require `mine-pr-evidence` in `.github/workflows/check.yml` and `#rulecheck-map` in `README.md`**
  Run: `node --test scripts/testing-contract.test.mjs`
  Expected: FAIL (`missing CI suite: mine-pr-evidence`).

- [ ] **Step 2 (`GREEN`): Update `.github/workflows/check.yml`, `README.md`, `CHANGELOG.md`, and all 5 manifests (`0.5.18`)**
  - Add `- run: node --test scripts/mine-pr-evidence.test.mjs` to `.github/workflows/check.yml`.
  - Add a 4-column row in `README.md` under `## Rule/check map` linking `[PR evidence miner](skills/infra-review/scripts/mine-pr-evidence.mjs)` and `[Rule miner contract](skills/infra-review/references/rule-miner.md)` to `[PR evidence miner suite](scripts/mine-pr-evidence.test.mjs)`, stating its known limitations honestly.
  - Bump `plugin.json`, `.github/plugin/marketplace.json` (`metadata.version` and `plugins[0].version`), `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (`metadata.version` and `plugins[0].version`), and `gemini-extension.json` to `0.5.18`, and add `## 0.5.18 (2026-11-16)` to `CHANGELOG.md`.

- [ ] **Step 3: Run full verification & isolated temporary-home smoke checks**
  Run:
  - `node scripts/sync-host-core.mjs --check && node scripts/check.mjs`
  - `node --test scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs scripts/independent-review.test.mjs scripts/testing-contract.test.mjs scripts/collect-metrics.test.mjs scripts/mine-pr-evidence.test.mjs scripts/run-benchmark.test.mjs scripts/portability-contract.test.mjs scripts/release.test.mjs tools/work-ledger/*.test.mjs`
  - `git --no-pager diff origin/main -- com.github.copilot/rules/core.mdc GEMINI.md` (must be empty)
  - Isolated temporary `COPILOT_HOME` install (`copilot plugin install .`) + `copilot instruction list` + `copilot skill list` (plus `claude plugin validate` / `gemini extensions validate` if CLIs are installed on this Mac).
  Expected: All checks exit `0`, `0` diff lines on `core.mdc` and `GEMINI.md`, and temporary `COPILOT_HOME` discovers `dev-loop: core` and all 4 skills at `0.5.18`.

- [ ] **Step 4: Commit Task 3**
  Commit `.github/workflows/check.yml`, `README.md`, `CHANGELOG.md`, the 5 manifests, and `scripts/testing-contract.test.mjs`.

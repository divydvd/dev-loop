# Proportional Multi-Agent Review Panel (PR 3 / Milestone M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `dev-loop` Step 5 (`Independent agent review`) with a deterministic diff router (`skills/dev-loop/scripts/prepare-review-panel.mjs`) and specialist panel contract (`skills/dev-loop/references/review-panel.md`) so small safe changes keep 1 fast reviewer while `> 120`-line, multi-domain, or risky-area changes run 2–4 parallel specialists plus 1 `skeptic-judge` synthesis pass.

**Architecture:** A zero-dependency Node.js ES module (`skills/dev-loop/scripts/prepare-review-panel.mjs`) inspects Git diffs, `AGENTS.md` risky areas, and optional `docs/testing/review-checklist.md` rules to emit `"exempt"`, `"single"`, or `"panel"` routing decisions and write frozen role packets outside `--repo-root`. `skills/dev-loop/references/review-panel.md`, `skills/dev-loop/SKILL.md`, `skills/dev-loop/references/testing.md`, and `skills/dev-loop/assets/pr-body.md` wire parallel specialist dispatch, host fallbacks, failure handling, and `skeptic-judge` synthesis without touching `com.github.copilot/rules/core.mdc`.

**Tech Stack:** Node.js built-in ES modules (`node:child_process`, `node:crypto`, `node:fs`, `node:path`, `node:util`, `node:test`, `node:assert/strict`), Markdown skills and templates, GitHub Actions CI.

**Spec:** Standalone 5-PR upgrade specification (`/Users/divydwivedi/Downloads/dev-loop-standalone-agent-spec.md`, Global Rules & `## PR 3: Proportional Multi-Agent Review Panel`; owner design approval recorded on 2026-11-16).

## Abstract
In `dev-loop` `0.5.17`, Step 5 dispatches one generic independent reviewer regardless of whether a pull request changes 15 lines in one module or 250 lines across user interface, concurrency, and authentication boundaries.
This plan adds a **deterministic review router** (a zero-model Node.js script that classifies Git diffs into `exempt`, `single`, or `panel` modes) and an **adversarial synthesis (`skeptic-judge`)** contract (a post-specialist review pass that drops unproved nitpicks and checks cross-domain and test-matrix gaps).
The expected result is fast 1-reviewer turnaround on `<= 120`-line single-domain non-risky changes, deeper domain bug detection on complex or risky changes, and `+0` bytes added to `com.github.copilot/rules/core.mdc`.

## Global Constraints
- Keep `com.github.copilot/rules/core.mdc` and `GEMINI.md` untouched (`0` diff lines; always-loaded startup budget `<= 15,000` UTF-8 bytes across hosts).
- Use zero npm dependencies and Node.js ES module (`.mjs`) built-ins only; invoke Git with `execFileSync` and sanitized `GIT_*` environment variables, never shell string interpolation.
- Keep production code lines changed `<= 400` (estimated `~230` lines in `skills/dev-loop/scripts/prepare-review-panel.mjs` plus `7` version lines across the 5 manifests).
- Inside `skills/dev-loop/**/*.md`, every inline backtick starting with `assets/`, `scripts/`, or `references/` must resolve inside `skills/dev-loop/` (`scripts/check.mjs` `SKILL_LINK_RE`); prefix repository-root scripts with `<dev-loop-checkout>/scripts/...`.
- Preserve all existing regex invariants in `scripts/testing-contract.test.mjs` and `scripts/independent-review.test.mjs`, including `"no separate reviewer"` in `skills/dev-loop/references/testing.md`, all 6 rows (`Reviewer`, `Reviewed commit`, `Scope`, `Verdict`, `Changes after review`, `Exemption`) in `skills/dev-loop/assets/pr-body.md`, single-line `- **Done:**` in `skills/dev-loop/SKILL.md`, and all 8 review-scope nouns in `## 5. Self-review`.
- Version bump ruling: `origin/main` (`0f7b6bf`) already published `0.5.17` (`v0.5.17` release and `## 0.5.17` in `CHANGELOG.md`), and `scripts/release.mjs` rejects duplicate changelog versions (`entries.length !== 1`). Bump all 5 version manifests (`plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`) and `CHANGELOG.md` to `0.5.18`.
- Write at least 80% of prose in ASD-STE100 Simplified Technical English.

## Review Focus
1. **CamelCase, snake_case, and `@Composable` token boundaries in domain detection:** Plain `\b` misses `authToken` (`security-privacy`) and `@Composable` (`ui-a11y`) in JavaScript RegExp while naive substring matching would falsely match `author`, `evaluate`, or `workflow`; test both `authToken`/`@Composable` hits and `author`/`workflow` non-hits.
2. **Symlink-safe `--out-dir` containment check:** On macOS worktrees where `--repo-root` traverses symlinks (such as `/var` -> `/private/var`), `--out-dir` inside the real repository tree must fail with exit code `1` before creating files so Git working trees stay clean.
3. **Markdown code-block and command edits inside long fenced blocks:** A 1-line edit in the middle of a 30-line fenced code block in `README.md` has no ` ``` ` marker in `-U3` diff context; compare full base and head fenced blocks, inline code spans, links, CLI tokens, and numbers so command or rule edits in `.md` are never `exempt`.
4. **Panel role count floor (`2` to `4` roles) on risky or `> 120`-line diffs with zero keyword domains:** When `touchesRiskyArea === true` or `prodLinesChanged > 120` triggers `mode: "panel"` with zero keyword domains, emit `["arch-correctness", "security-privacy"]` so `panel` mode always dispatches `2` to `4` defined specialists before `skeptic-judge`.
5. **Graceful missing vs populated `docs/testing/review-checklist.md`:** When `docs/testing/review-checklist.md` is absent, emit `AGENTS.md` `### Review checklist` bullets cleanly without error; when `docs/testing/review-checklist.md` exists, filter `## Active rules` rows into matching role packets.

---

## Acceptance record
- **Goal:** Add proportional Step-5 review routing (`prepare-review-panel.mjs`) and specialist + `skeptic-judge` review instructions (`review-panel.md`) so `dev-loop` scales independent review from `0` (`exempt`) to `1` (`single`) to `2–4 + skeptic-judge` (`panel`) deterministically.
- **Done when:**
  - [ ] `skills/dev-loop/scripts/prepare-review-panel.mjs` implements `--repo-root`, `--base`, `--head` (commit ref or `WORKTREE`), `--out-dir` (enforced outside `--repo-root`), `--agents-file`, `--checklist`, and `--json`, passing all 5 spec TDD cases and all 5 Review Focus edge cases in `scripts/prepare-review-panel.test.mjs`.
  - [ ] `skills/dev-loop/references/review-panel.md`, `skills/dev-loop/SKILL.md` (`## 5. Self-review`), `skills/dev-loop/references/testing.md` (`## Review coverage`), and `skills/dev-loop/assets/pr-body.md` (`### Independent agent review`) define specialist contracts, parallel/sequential host dispatch, retry-once failure handling, `skeptic-judge` synthesis, and focused follow-up review while preserving every `scripts/independent-review.test.mjs` and `scripts/testing-contract.test.mjs` assertion.
  - [ ] Fresh consuming-agent checks (`writing-skills` 5 baseline `RED` vs 5 revised `GREEN` subagents) verify `S-RP1`–`S-RP5` and preserve `README.md` risk-based testing baseline controls (`Case 1`, `Case 9`, `V5`).
  - [ ] `.github/workflows/check.yml` runs `node --test scripts/prepare-review-panel.test.mjs`, `README.md` updates `## Rule/check map` and `## Independent PR review`, `CHANGELOG.md` and all 5 version manifests are synced to `0.5.18`, and `com.github.copilot/rules/core.mdc` plus `GEMINI.md` have `0` diff lines.
  - [ ] `node scripts/check.mjs`, all CI suites in `.github/workflows/check.yml`, isolated temporary `COPILOT_HOME` instruction/skill smoke tests, Step-5 independent review panel on `origin/main...HEAD`, GitHub Actions `check`, and `copilot-pull-request-reviewer` check-runs complete cleanly on the open PR against `main`.
- **Required evidence:** `node --test scripts/prepare-review-panel.test.mjs scripts/independent-review.test.mjs scripts/testing-contract.test.mjs`; all remaining `.github/workflows/check.yml` suites; `node scripts/check.mjs`; isolated `COPILOT_HOME` install + `copilot instruction list` + `copilot skill list`; 5 `RED` + 5 `GREEN` fresh subagent evaluations; Step-5 `panel` review (`specialists -> skeptic-judge`) at `HEAD`; `work_ledger_record` (`validated`, `review_clean`, `note`) at `HEAD`; no device test (this repo has no app).
- **Test matrix:** Compact test matrix (`T-RP1`–`T-RP8`) saved below under `skills/dev-loop/references/testing.md`.
- **Regression selection:** Reuse all 9 existing `.github/workflows/check.yml` test commands plus `README.md` risk-based testing application controls (`Case 1`, `Case 9`, `V5`). `AGENTS.md` defines no separate `docs/testing/regression-matrix.md`.
- **Size estimate:** Task 1: `0` prod lines; Task 2: `~225` prod lines (`skills/dev-loop/scripts/prepare-review-panel.mjs`); Task 3: `0` app code lines (`~95` operational skill/reference lines in `skills/dev-loop/`); Task 4: `0` prod lines; Task 5: `~8` prod/config lines (`.github/workflows/check.yml` + 5 JSON manifests). Total `~233` code lines (`~328` including operational skill lines, `<= 400`).
- **Milestone selection:** Milestone `M3` (`PR 3`) of the 5-PR standalone specification, branched independently off `origin/main` (`0f7b6bf`); `--checklist` degrades gracefully when `docs/testing/review-checklist.md` (PR 2) is absent.
- **Out of scope:** PR 1 (`scan-flow-drift.mjs`), PR 2 (`mine-pr-evidence.mjs` and `assets/review-checklist.md`), PR 4 (`waived` test status), PR 5 (`tools/work-ledger` preferences and outage resume), and any edits to `com.github.copilot/rules/core.mdc` or `GEMINI.md`.
- **Risky area:** None (`com.github.copilot/rules/core.mdc`, owner approval points, and finish/merge rules have `0` diff lines; no risky-plan stop required).
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content, or a harmless-edit exemption has a recorded reason. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains. A case marked not applicable needs a source or requirements reference and a recorded reason; it is not a pass.
  - Blocked: 3 failed fixes, missing access, no device, or a product decision. Stop and report with evidence if 3 fixes fail or if a required invariant in `core.mdc` conflicts with the change.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PR 3 (M3) | Deterministic Step-5 diff router (`prepare-review-panel.mjs`), specialist + `skeptic-judge` contract (`review-panel.md`), and Step-5 / testing / PR-body integration (`0.5.18`) | `T-RP1`–`T-RP8` (`prepare-review-panel.test.mjs`, `independent-review.test.mjs`, `testing-contract.test.mjs`, `5/5` fresh consumer subagents, `check.mjs`, temporary `COPILOT_HOME` smoke test, Step-5 panel review, CI) | Independent of PRs 1, 2, 4, 5 (`--checklist` falls back to `AGENTS.md` when `docs/testing/review-checklist.md` is absent) | `divydvd-proportional-review-panel-m3` -> `main` (independent concern `<= 400` lines) | PRs 1, 2, 4, and 5 deliver flow-drift scanning, PR rule mining, `waived` status, and `work-ledger` config in separate sessions | in progress | - | Open PR against `main` after Step-5 panel review and Step-6 checks |

- Overall assignment: `PR 3` implementation in this session; PRs 1, 2, 4, and 5 remain scoped to their separate milestones in the coordinator session.

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-RP1 | Harmless prose typo in `README.md` vs operational/command `.md` edits (including edits inside long fenced blocks) | yes | Temp git repo fixtures: (a) spelling fix in `README.md`; (b) command edit in `skills/flow-docs/SKILL.md`; (c) line edit inside a 30-line fenced bash block in `README.md` | (a) `mode: "exempt"`, `roles: []`, `synthesisJudge: false`; (b) and (c) not `exempt` (`mode: "single"` or `"panel"`) | automated (TDD) | `scripts/prepare-review-panel.test.mjs` | passed | `node --test scripts/prepare-review-panel.test.mjs` (`11/11` pass) | `1ae1eb7` |
| T-RP2 | Small `<= 120`-line single-domain non-risky diff keeps 1 fast reviewer | yes | Temp git repo with `45`-line concurrency fix (`async`/`await`/`Mutex`) outside `AGENTS.md` risky areas | `mode: "single"`, `roles: ["single-reviewer"]`, `synthesisJudge: false`, `prodLinesChanged === 45` | automated (TDD) | `scripts/prepare-review-panel.test.mjs` | passed | `node --test scripts/prepare-review-panel.test.mjs` (`11/11` pass) | `1ae1eb7` |
| T-RP3 | Risky-area `30`-line diff escalates to `panel` with `2`–`4` roles and `skeptic-judge` | yes | Temp git repo with `### Risky areas` path in `AGENTS.md` and `30`-line edit touching that path (0 keyword domains) | `touchesRiskyArea: true`, `mode: "panel"`, `roles: ["arch-correctness", "security-privacy"]`, `synthesisJudge: true` | automated (TDD) | `scripts/prepare-review-panel.test.mjs` | passed | `node --test scripts/prepare-review-panel.test.mjs` (`11/11` pass) | `1ae1eb7` |
| T-RP4 | Multi-domain `180`-line feature (`@Composable` + `CoroutineScope` + `authToken`) routes all 4 specialists, handles missing/present `review-checklist.md`, writes frozen packets outside `repoRoot`, and rejects in-repo `--out-dir` (including symlinked paths) | yes | Temp git repo with `180`-line Kotlin/Compose/Coroutine/authToken diff, `WORKTREE` + committed modes, missing vs populated `docs/testing/review-checklist.md`, external `--out-dir` vs symlinked in-repo `--out-dir` | `mode: "panel"`, `roles: ["arch-correctness", "concurrency-state", "security-privacy", "ui-a11y"]`, `synthesisJudge: true`; `routing.json` + `<role>-packet.md` written outside `repoRoot` with `git status --porcelain` empty; in-repo `--out-dir` rejected with exit `1`; `author`/`workflow` do not false-trigger domains | automated (TDD) | `scripts/prepare-review-panel.test.mjs` | passed | `node --test scripts/prepare-review-panel.test.mjs` (`11/11` pass) | `1ae1eb7` |
| T-RP5 | `SKILL.md`, `review-panel.md`, `testing.md`, `pr-body.md`, and `README.md` satisfy new panel contracts AND preserve all existing `independent-review` and `testing-contract` invariants | yes | `scripts/independent-review.test.mjs`, `scripts/testing-contract.test.mjs`, `scripts/check.mjs` | Both test suites and `node scripts/check.mjs` pass; `"no separate reviewer"` and all 6 PR review table fields preserved; `core.mdc` and `GEMINI.md` untouched | automated (TDD) | `scripts/independent-review.test.mjs`, `scripts/testing-contract.test.mjs`, `scripts/check.mjs` | passed | `37/37` pass + `check: no faults` + `0` diff on `core.mdc`/`GEMINI.md` | `1ae1eb7` |
| T-RP6 | `writing-skills` + risk-based testing consuming-agent application checks (`RED` baseline `0.5.17` vs `GREEN` revised `0.5.18`) | yes | 5 fresh baseline subagents (`0.5.17`) and 5 fresh revised subagents (`0.5.18`) tested on `S-RP1`–`S-RP5` plus `README.md` controls (`Case 1`, `Case 9`, `V5`) | Baseline fails PR 3 router/panel/`skeptic-judge` behaviors (`0/5` on `S-RP1`–`S-RP2`) while passing existing controls (`5/5`); revised instructions achieve `5/5` on both `S-RP1`–`S-RP5` and controls | subagent application check | `CHANGELOG.md` (`0.5.18`) | passed | `red-rp-1..5` (`0/5` new, `5/5` controls) -> `green-rp-r2-1..5` (`5/5` across all 8 scenarios) | `1ae1eb7` |
| T-RP7 | Full 10-suite CI pass, 5-manifest `0.5.18` parity, and isolated temporary `COPILOT_HOME` discovery smoke test | yes | All suites in `.github/workflows/check.yml` + temporary `COPILOT_HOME` `copilot plugin install`, `copilot instruction list`, `copilot skill list`, and bundled `prepare-review-panel.mjs` + `review-panel.md` check | All 10 test runs and `check.mjs` exit `0`; temporary `COPILOT_HOME` lists `dev-loop: core` and all 4 skills at `0.5.18` with bundled `prepare-review-panel.mjs` executable via `node` | integration / smoke | `.github/workflows/check.yml` + temp `COPILOT_HOME` | passed | `331` pass / `0` fail across 10 suites + temp `COPILOT_HOME` (`v0.5.18`) + `claude plugin validate --strict .` | `1ae1eb7` |
| T-RP8 | Step-5 independent review panel (`arch-correctness` + specialists -> `skeptic-judge`) on `origin/main...HEAD`, GitHub Actions `check`, and `copilot-pull-request-reviewer` | yes | Complete PR 3 diff `origin/main...HEAD` reviewed by fresh specialist subagents + `skeptic-judge`, followed by PR CI & automatic review check | Confirmed `Critical`/`Important` findings fixed, final diff covered, CI `check` green, `work_ledger_record` pinned to `HEAD` | independent review + CI | GitHub PR + `work-ledger` | not run | - | - |

- Category assessment:
  - `boundaries and invalid input`: `T-RP1`–`T-RP4` (`120` vs `> 120` line threshold, `0`/`1`/`2+` domains, invalid git refs, `--out-dir` inside symlinked `repoRoot`, missing `review-checklist.md`).
  - `permissions and state changes`: `T-RP4` (`--out-dir` outside `repoRoot` keeps `git status --porcelain` clean; sanitized `GIT_*` env).
  - `concurrency and retries`: `T-RP5`, `T-RP6` (parallel specialist dispatch, sequential fallback, 1-retry failure limit without self-review substitution).
  - `partial failure and recovery`: `T-RP5`, `T-RP6` (failed specialist after 1 retry marks `Not reviewed` and `"open, not ready: independent review unavailable"`).
  - `existing consumers`: `T-RP5`, `T-RP6`, `T-RP7` (`testing-contract.test.mjs`, `independent-review.test.mjs`, `portability-contract.test.mjs`, `release.test.mjs`, temporary `COPILOT_HOME` plugin install).
  - `UI, accessibility, and device`: excluded — `dev-loop` is a CLI/app Markdown and Node.js plugin with no UI or mobile app (`AGENTS.md`).
  - `migration and compatibility`: `T-RP4`, `T-RP5`, `T-RP7` (backward compatibility when `docs/testing/review-checklist.md` is absent; 5-manifest `0.5.18` sync).
  - `performance`: `T-RP4` (`prepare-review-panel.mjs` runs locally via `git diff` in `< 1s` with zero LLM calls).
- Required blockers: none.
- Optional limits: live non-Copilot vendor LLM smoke runs (`claude -p`, `gemini -p`) remain optional outside CI when local CLI validators pass.
- Reassessment: initial plan; update after implementation or review changes.

---

## Task 1: RED Baseline Consuming-Agent Checks (`writing-skills` + `testing.md` Controls)

**Files:**
- Read-only baseline inputs: `skills/dev-loop/SKILL.md`, `skills/dev-loop/references/testing.md`, `skills/dev-loop/assets/pr-body.md`

**Interfaces:**
- Consumes: current `0.5.17` skill and testing files on `origin/main`
- Produces: baseline `RED` behavioral evidence across 5 fresh subagents (`red-rp-1`..`red-rp-5`) for `S-RP1`–`S-RP5` and `README.md` controls (`Case 1`, `Case 9`, `V5`)

- [x] **Step 1: Dispatch 5 parallel fresh-context `explore` subagents on current `0.5.17` instructions**
  Give each subagent only the `0.5.17` files (`skills/dev-loop/SKILL.md`, `skills/dev-loop/references/testing.md`, `skills/dev-loop/assets/pr-body.md`, `skills/dev-loop/references/hosts/README.md`) and ask concrete application decisions for:
  - `S-RP1`: `45`-line concurrency bug fix outside risky areas (how Step 5 selects reviewer count/script and whether small non-risky tasks add separate task reviewers).
  - `S-RP2`: `180`-line feature touching `@Composable` UI, `CoroutineScope`, and `authToken` (which router command runs, where role packets are written, which specialists run in parallel, and what synthesis pass runs afterward).
  - `S-RP3`: deadline pressure (10 min left) when `security-privacy` reviewer fails twice while other reviewers pass (retry count, self-review substitution, `Not reviewed`, readiness status).
  - `S-RP4`: prose typo in `README.md` vs CLI command edit in `skills/flow-docs/SKILL.md` (`exempt` vs substantive review).
  - `S-RP5`: 8-line follow-up fix after full review + `README.md` controls (`Case 1` range `1–99` matrix, `Case 9` direct export permission bypass review, `V5` owner report ordering).

- [x] **Step 2: Verify `RED` baseline gaps and passing controls**
  Confirm `0/5` agents have `prepare-review-panel.mjs`, frozen role packets outside `--repo-root`, domain specialist routing (`arch-correctness`, `concurrency-state`, `security-privacy`, `ui-a11y`), or `skeptic-judge` synthesis (`S-RP1`, `S-RP2`), while `5/5` pass existing `0.5.17` controls (`S-RP3` retry/not-ready, `S-RP4` command non-triviality, `S-RP5` focused follow-up + `Case 1` / `Case 9` / `V5`). Record exact gaps for Task 3.

---

## Task 2: Deterministic Review Router (`skills/dev-loop/scripts/prepare-review-panel.mjs`)

**Files:**
- Create: `scripts/prepare-review-panel.test.mjs`
- Create: `skills/dev-loop/scripts/prepare-review-panel.mjs`

**Interfaces:**
- Consumes: Git repository at `--repo-root`, `--base <git-ref>`, optional `--head <git-ref-or-WORKTREE>`, optional `--out-dir <dir-outside-repo>`, optional `--agents-file <rel-path>` (default `AGENTS.md`), optional `--checklist <rel-path>` (default `docs/testing/review-checklist.md`), optional `--json`
- Produces:
  - Exported `prepareReviewPanel(options)` and CLI entrypoint exiting `0` on valid invocation and `1` on invalid arguments/refs or in-repo `--out-dir`
  - JSON result `{ repoRoot, base, baseSha, headRef, head, mode: "exempt" | "single" | "panel", prodLinesChanged, totalLinesChanged, touchesRiskyArea, matchedRiskyAreas, triggeredDomains, roles, synthesisJudge, judgeRole, changedFiles, checklistLoaded, outDir, packets }`
  - Frozen `<out-dir>/routing.json`, `<out-dir>/<role>-packet.md` per selected role, and `<out-dir>/skeptic-judge-packet.md` when `synthesisJudge === true`

- [x] **Step 1 (`RED`): Write failing tests in `scripts/prepare-review-panel.test.mjs`**
  Cover all 5 spec cases and all 5 Review Focus cases using isolated temporary Git repositories (`cleanChildEnv` stripping `NODE_TEST_CONTEXT` and `GIT_*`):
  1. Prose typo fix in `README.md` -> `mode: "exempt"`, `roles: []`, `synthesisJudge: false`.
  2. Operational command edit in `skills/flow-docs/SKILL.md` -> not `exempt` (`mode: "single"`), `prodLinesChanged > 0`.
  3. Line edit inside a 30-line fenced bash block in `README.md` and unbackticked command/normative rule edit in `README.md` -> not `exempt`.
  4. `45`-line bug fix touching concurrency tokens (`async`, `await`, `Mutex`) outside risky areas -> `mode: "single"`, `roles: ["single-reviewer"]`, `synthesisJudge: false`.
  5. `30`-line edit touching a path under `### Risky areas` in `AGENTS.md` (with zero keyword domains) -> `touchesRiskyArea: true`, `mode: "panel"`, `roles: ["arch-correctness", "security-privacy"]`, `synthesisJudge: true`, `judgeRole: "skeptic-judge"`.
  6. `180`-line feature touching `@Composable` UI + `CoroutineScope` + `authToken` -> `mode: "panel"`, `roles: ["arch-correctness", "concurrency-state", "security-privacy", "ui-a11y"]`, `synthesisJudge: true`, writes `routing.json` + packet files in `--out-dir` outside `repoRoot`, and leaves `git status --porcelain` empty.
  7. False-positive guard: words `author`, `evaluate`, `execute`, and `workflow` in a `20`-line non-risky code edit do NOT trigger `security-privacy` or `concurrency-state`.
  8. `--out-dir` inside `repoRoot` (including via a symlink alias) fails with exit code `1` without creating files inside `repoRoot`.
  9. Missing `docs/testing/review-checklist.md` emits `AGENTS.md` `### Review checklist` bullets cleanly (`checklistLoaded: false`); populated `docs/testing/review-checklist.md` filters `## Active rules` rows by domain (`checklistLoaded: true`).
  10. `--head WORKTREE` captures uncommitted tracked and untracked changes with a deterministic `WORKTREE:<sha256>` digest.

- [x] **Step 2: Run `node --test scripts/prepare-review-panel.test.mjs` and confirm `RED` failure (`ERR_MODULE_NOT_FOUND`)**

- [x] **Step 3 (`GREEN`): Implement `skills/dev-loop/scripts/prepare-review-panel.mjs`**
  Implement CLI argument parsing (`node:util` `parseArgs`), safe Git execution (`execFileSync` with stripped `GIT_*` env and `-` prefix ref rejection), plugin/harness operational path detection, full base-vs-head Markdown harmless-edit checking, `-U0` diff hunk + camelCase/snake_case/`@Composable` domain signal detection, `AGENTS.md` `### Risky areas` and `### Review checklist` + `docs/testing/review-checklist.md` parsing, deterministic 3-tier routing, and symlink-safe external `--out-dir` packet generation.

- [x] **Step 4: Run `node --test scripts/prepare-review-panel.test.mjs` and confirm `11/11` `GREEN` pass**

- [x] **Step 5: Commit Task 2**
  Commit `skills/dev-loop/scripts/prepare-review-panel.mjs` and `scripts/prepare-review-panel.test.mjs`.

---

## Task 3: Review Panel Reference & Step-5 / Testing / PR-Body Wiring

**Files:**
- Modify: `scripts/independent-review.test.mjs`
- Create: `skills/dev-loop/references/review-panel.md`
- Modify: `skills/dev-loop/SKILL.md` (`## 5. Self-review`)
- Modify: `skills/dev-loop/references/testing.md` (`## Review coverage`)
- Modify: `skills/dev-loop/assets/pr-body.md` (`### Independent agent review`)

**Interfaces:**
- Consumes: `skills/dev-loop/scripts/prepare-review-panel.mjs` CLI and packet format from Task 2; baseline `RED` findings from Task 1
- Produces: `skills/dev-loop/references/review-panel.md` and updated `SKILL.md`, `testing.md`, `pr-body.md` passing `scripts/independent-review.test.mjs`, `scripts/testing-contract.test.mjs`, and `scripts/check.mjs`

- [x] **Step 1 (`RED`): Add failing contract assertions to `scripts/independent-review.test.mjs`**
  Assert that:
  - `skills/dev-loop/SKILL.md` `## 5. Self-review` references `scripts/prepare-review-panel.mjs` and `references/review-panel.md` while preserving all existing assertions.
  - `skills/dev-loop/references/review-panel.md` defines the 4 specialist roles (`arch-correctness`, `concurrency-state`, `security-privacy`, `ui-a11y`), the JSON finding schema (`id`, `severity`, `domain`, `file`, `lines`, `symptom`, `evidence`, `suggestedFix`), parallel dispatch + `dispatch: sequential` fallback, retry-once failure handling (`Not reviewed` + `"open, not ready: independent review unavailable"`), `skeptic-judge` advocate filter + skeptic cross-domain/matrix gap check, and focused `single` re-review on small follow-up fixes.
  - `skills/dev-loop/assets/pr-body.md` documents `single (<agent>)` and `panel (<roles> -> skeptic-judge)` in `### Independent agent review` while preserving all 6 required rows.
  - `skills/dev-loop/references/testing.md` connects `## Review coverage` to `references/review-panel.md` while preserving `"Extend the existing independent review; add no separate reviewer for each small non-risky task"`.

- [x] **Step 2: Run `node --test scripts/independent-review.test.mjs` and confirm `RED` failure**

- [x] **Step 3 (`GREEN`): Create `skills/dev-loop/references/review-panel.md` and update `SKILL.md`, `testing.md`, and `pr-body.md`**
  Use ASD-STE100 prose (`Abstract` at top, `Conclusion` at bottom in `review-panel.md`) and positive output contracts (`writing-skills` "Match the Form to the Failure"). Invoke bundled scripts via `node` (`node <skill-dir>/scripts/prepare-review-panel.mjs` while keeping inline backtick paths `scripts/prepare-review-panel.mjs` and `references/review-panel.md` valid under `SKILL_LINK_RE`).

- [x] **Step 4: Run `node --test scripts/independent-review.test.mjs scripts/testing-contract.test.mjs && node scripts/check.mjs` and confirm `GREEN`**

- [x] **Step 5: Commit Task 3**

---

## Task 4: GREEN Consuming-Agent Verification (`writing-skills` + `testing.md` Controls)

**Files:**
- Verify: `skills/dev-loop/SKILL.md`, `skills/dev-loop/references/review-panel.md`, `skills/dev-loop/references/testing.md`, `skills/dev-loop/assets/pr-body.md`

**Interfaces:**
- Consumes: updated skill and reference files from Task 3; fixed scenarios `S-RP1`–`S-RP5` + `README.md` controls from Task 1
- Produces: `5/5` fresh-agent compliance evidence (`green-rp-1`..`green-rp-5`) for `CHANGELOG.md` and the PR body

- [x] **Step 1: Dispatch 5 parallel fresh-context `explore` subagents with the revised `0.5.18` instructions on the exact Task 1 scenarios**
- [x] **Step 2: Manually inspect every response against `S-RP1`–`S-RP5` and `Case 1` / `Case 9` / `V5` controls**
  If any subagent misses a requirement or exhibits variance, tighten the contract in `review-panel.md` / `SKILL.md`, rerun `check.mjs` + contract tests, and re-verify with 5 fresh subagents until `5/5` converge.

---

## Task 5: CI Workflow, `README.md`, `CHANGELOG.md`, `0.5.18` Manifests, and Smoke Verification

**Files:**
- Modify: `.github/workflows/check.yml`
- Modify: `README.md` (`## Rule/check map` and `## Independent PR review`)
- Modify: `CHANGELOG.md`
- Modify: `plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`
- Modify: `docs/superpowers/plans/2026-11-16-proportional-review-panel-m3.md` (update matrix evidence)

**Interfaces:**
- Consumes: verified Task 2–4 artifacts and `GREEN` consumer evidence
- Produces: `0.5.18` release-ready branch passing all CI suites, `scripts/check.mjs`, temporary `COPILOT_HOME` smoke test, and Step-5 independent review panel

- [x] **Step 1: Wire `node --test scripts/prepare-review-panel.test.mjs` into `.github/workflows/check.yml` and assert CI wiring in `scripts/independent-review.test.mjs`**
- [x] **Step 2: Update `README.md` (`## Rule/check map` row for proportional review routing + `## Independent PR review`), bump all 5 manifests to `0.5.18`, and add `## 0.5.18 (2026-11-16)` to `CHANGELOG.md`**
- [x] **Step 3: Run `node scripts/check.mjs` and all 10 test commands from `.github/workflows/check.yml`**
- [x] **Step 4: Run isolated temporary `COPILOT_HOME` plugin install + `copilot instruction list` + `copilot skill list` smoke test (plus `claude plugin validate --strict .` and `gemini extensions validate .` if installed), verifying `core.mdc` and `GEMINI.md` have `0` diff lines**
- [ ] **Step 5: Commit all changes, run `prepare-review-panel.mjs` on `origin/main...HEAD` into a temp `--out-dir` outside the repo, execute the Step-5 independent review panel (`specialists -> skeptic-judge`), fix any confirmed Critical/Important findings, re-verify at final `HEAD`, open PR against `main`, record `work_ledger_record`, and verify CI + `copilot-pull-request-reviewer`**

## Conclusion
This plan delivers PR 3 (`0.5.18`) in five small TDD tasks while keeping `com.github.copilot/rules/core.mdc` and `GEMINI.md` at `0` diff lines and total code changes well below `400` lines.
Because the plan touches no risky areas from `AGENTS.md`, no owner plan-review pause is needed (`Core Rule 6`), and execution proceeds immediately with `executing-plans`.
The main technical risk is regex boundary mismatches or broken inline skill references; dedicated TDD edge cases in `scripts/prepare-review-panel.test.mjs` and `node scripts/check.mjs` address both before publication.

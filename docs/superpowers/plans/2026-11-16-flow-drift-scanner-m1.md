# Deterministic Flow-Doc Drift & Diff-Impact Scanner (PR 1 / M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver PR 1 (`v0.5.18`) of the standalone 5-PR upgrade specification: add a dependency-free flow-doc drift and diff-impact scanner (`skills/flow-docs/scripts/scan-flow-drift.mjs`), wire it into `skills/flow-docs/SKILL.md`, `skills/infra-review/SKILL.md`, `.github/workflows/check.yml`, and `README.md` (`## Rule/check map`), and bump all 5 plugin manifests plus `CHANGELOG.md`.

**Architecture:** Parse `docs/flows/INDEX.md` and `docs/flows/*.md` with Node built-in modules only (`node:fs`, `node:path`, `node:child_process`, `node:util`, `node:url`), compute dead file/sibling references, index mismatches, Git ancestry churn (`git log <docLastCommit>..HEAD -- <existingKeyFiles...>`), damped `driftScore`, and optional branch diff-impact (`--changed-from <baseRef>`). Bundle the scanner inside `skills/flow-docs/scripts/scan-flow-drift.mjs` so installed Copilot, Claude Code, and Gemini CLI plugins ship it directly without adding a single byte to `com.github.copilot/rules/core.mdc`.

**Tech Stack:** Node.js ESM (`.mjs`, zero external npm dependencies), `node:test`, `node:assert/strict`, Git CLI via `execFileSync("git", [...])`, Markdown skills and documentation.

**Spec:** `/Users/divydwivedi/Downloads/dev-loop-standalone-agent-spec.md` (`Global Rules & Repo Invariants` and `## PR 1: Deterministic Flow-Doc Drift & Diff-Impact Scanner`; `main` baseline commit `0f7b6bf` at `0.5.17`, bumping to `0.5.18` because PR `#45` already published `v0.5.17` and `scripts/release.mjs` enforces unique `## <version>` changelog sections).

## Abstract
Agents currently inspect `docs/flows/INDEX.md` and run manual `git log` commands to judge whether a flow document is stale or whether a pull request forgot to update an impacted flow document.
This manual process wastes model turns and misses broken file paths, date mismatches between `INDEX.md` and flow documents, and unupdated flow docs on multi-file diffs.
This plan adds a zero-dependency Node ESM scanner (`skills/flow-docs/scripts/scan-flow-drift.mjs`), wires it into `skills/flow-docs/SKILL.md` and shadow-mode `skills/infra-review/SKILL.md`, maps its regression suite in `README.md` and `.github/workflows/check.yml`, and ships version `0.5.18` with zero changes to `com.github.copilot/rules/core.mdc`.

## Global Constraints
- Zero npm dependencies; use Node built-in modules only (`node:fs`, `node:path`, `node:child_process`, `node:util`, `node:url`, `node:test`, `node:assert/strict`).
- Never use shell command string interpolation; invoke Git exclusively via `execFileSync("git", [...])` with sanitized environment variables (strip inherited `GIT_*` and `NODE_TEST_CONTEXT` variables where applicable).
- Leave `com.github.copilot/rules/core.mdc` and `GEMINI.md` untouched (`0` diff lines against `origin/main`).
- Keep total changed production code lines `<= 400` (estimated `~210` production lines across `skills/flow-docs/scripts/scan-flow-drift.mjs` and the 5 JSON manifests).
- Preserve `scripts/check.mjs` `SKILL_LINK_RE`: inline backticks starting with `assets/`, `scripts/`, or `references/` inside `skills/<skill>/**/*.md` must exist inside `skills/<skill>/`. Reference `` `scripts/scan-flow-drift.mjs` `` in `skills/flow-docs/SKILL.md`, and `node <dev-loop-checkout>/skills/flow-docs/scripts/scan-flow-drift.mjs` in `skills/infra-review/SKILL.md`.
- Preserve `scripts/testing-contract.test.mjs` invariants: keep `dataRows.length === 17` on the main table in `skills/infra-review/SKILL.md` (place `scan-flow-drift.mjs` under `### Shadow-mode objective telemetry`), keep all existing CI test lines in `.github/workflows/check.yml`, and keep 4-column Markdown link structure in `README.md` `## Rule/check map`.
- Bump `"version"` identically to `"0.5.18"` across all 5 manifests (`plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`) with a matching single `## 0.5.18 (2026-11-16)` section in `CHANGELOG.md` (`scripts/release.mjs` contract).
- Write at least 80% of prose in ASD-STE100 Simplified Technical English.

## Review Focus
1. **Path traversal & symlink escape (`../../etc/passwd`, `../secret.md`, symlinked targets):** Any candidate path in `INDEX.md`, `keyFiles`, or `relatedDocs` that escapes `repoRoot` (or `flowsDir` for indexed flow docs), or resolves via symlink outside `repoRoot`, must be rejected before `fs.existsSync` or `git log` outside `repoRoot` and flagged safely in `indexIssues` or `deadRefs`.
2. **Git flag injection & invalid `--changed-from` / `--changed-to` refs:** Refs starting with `-` (such as `--output=/tmp/x`), unknown CLI flags, or nonexistent `--changed-from` refs where both `...` and `..` fail must fail cleanly with exit code `1` instead of silently returning `unupdatedImpactedDocs: []`.
3. **URL routes, CLI commands, and prose slash tokens in flow-doc sections:** Web route spans like `` `/checkout` ``, URLs like `` `https://example.com/a` ``, CLI commands like `` `./gradlew test` ``, function names like `` `loginUser` ``, and table shorthands like `` `n/a` `` in `## Entry points` or `## Key files` must not produce false-positive `deadRefs`.
4. **Directory & deleted-file diff-impact accuracy:** When a `keyFile` entry is a directory (`src/auth`), editing `src/auth/Login.ts` must mark the flow doc impacted, while editing sibling prefix `src/auth-v2/Login.ts` must keep it `"untouched"`; deleting a listed key file on a branch must also mark the flow doc impacted.
5. **Inherited `GIT_*` environment isolation:** Running `scan-flow-drift.mjs` inside hooks or test harnesses with `GIT_DIR` / `GIT_WORK_TREE` set must still inspect `--repo-root` rather than the parent checkout.

---

## Acceptance record
- **Goal:** Add a deterministic flow-doc drift and diff-impact scanner (`skills/flow-docs/scripts/scan-flow-drift.mjs`) and wire it into `flow-docs`, `infra-review`, CI, and `README.md` (`v0.5.18`) without touching `core.mdc`.
- **Done when:**
  - [x] `skills/flow-docs/scripts/scan-flow-drift.mjs` exports `scanFlowDrift(options)` and supports `--repo-root`, `--flows-dir`, `--changed-from`, `--changed-to`, `--json`, and `--fail-on-unupdated` with exact `no_flows`, `indexIssues`, `deadRefs`, Git ancestry `commitsTouchingKeyFiles`, damped `driftScore`, `diffStatus` / `unupdatedImpactedDocs`, path-traversal protection, and exit-code (`0` vs `1`) behavior.
  - [x] `scripts/scan-flow-drift.test.mjs` covers all 6 spec scenarios plus directory impact, prefix non-collision, invalid/flag-injected refs, and CLI execution, and `.github/workflows/check.yml` runs `node --test scripts/scan-flow-drift.test.mjs` alongside all existing suites.
  - [x] `skills/flow-docs/SKILL.md` and `skills/infra-review/SKILL.md` (`### Shadow-mode objective telemetry`, preserving the 17-row main table) instruct agents to run `scan-flow-drift.mjs` with manual `git log` fallback; verified by `writing-skills` `RED -> GREEN` subagent checks (`5` baseline vs `5` revised consumers).
  - [x] `README.md` `## Rule/check map` maps the flow-doc drift check and `scripts/scan-flow-drift.test.mjs` with honest structural/shadow limits; all 5 manifests and `CHANGELOG.md` are synced to `0.5.18`; `com.github.copilot/rules/core.mdc` and `GEMINI.md` have `0` diff lines.
  - [x] `node scripts/check.mjs`, all CI suites (`scripts/*.test.mjs` and `tools/work-ledger/*.test.mjs`), isolated `COPILOT_HOME` / Claude / Gemini validation smoke checks, and independent agent review pass at the final committed `HEAD` SHA.
- **Required evidence:** `node --test scripts/scan-flow-drift.test.mjs`; `node scripts/check.mjs`; `node --test scripts/*.test.mjs`; `node --test tools/work-ledger/*.test.mjs`; isolated `COPILOT_HOME` plugin install + `copilot instruction list` + `copilot skill list` (`v0.5.18`); `writing-skills` `5` RED vs `5` GREEN consumer runs; independent `code-review` verdict; no device test (this repo has no app).
- **Test matrix:** Compact test matrix (`T1`–`T8`) saved below under `skills/dev-loop/references/testing.md`.
- **Regression selection:** Reuse `.github/workflows/check.yml` suites (`check.mjs`, `testing-contract.test.mjs`, `portability-contract.test.mjs`, `release.test.mjs`, `collect-metrics.test.mjs`, `run-benchmark.test.mjs`, `independent-review.test.mjs`, `branch-maintenance.test.mjs`, `device-handoff.test.mjs`, `tools/work-ledger/*.test.mjs`). `AGENTS.md` defines no separate `docs/testing/regression-matrix.md`.
- **Size estimate:** Task 1: ~205 production lines (`skills/flow-docs/scripts/scan-flow-drift.mjs` + 1 line in `.github/workflows/check.yml`); Task 2: 0 production code lines (`skills/flow-docs/SKILL.md`, `skills/infra-review/SKILL.md`); Task 3: ~7 changed manifest version lines (`README.md` and `CHANGELOG.md` are docs). Total: ~212 production lines (`<= 400`).
- **Milestone selection:** Milestone `M1` / `PR 1` of the 5-PR standalone upgrade specification; independent branch `divydvd-flow-doc-drift-scanner-m1` targeting `main` (`0f7b6bf`). PRs 2–5 remain separate independent PRs.
- **Out of scope:** PRs 2–5 (`mine-pr-evidence.mjs`, `prepare-review-panel.mjs`, `waived` gate status, `tools/work-ledger` preferences/outage recovery), blocking CI hooks in consumer repos, and any edits to `com.github.copilot/rules/core.mdc` or `skills/dev-loop/SKILL.md`.
- **Risky area:** `none` (`com.github.copilot/rules/core.mdc`, approval points, and finish rules are untouched).
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content, or a harmless-edit exemption has a recorded reason. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains. A case marked not applicable needs a source or requirements reference and a recorded reason; it is not a pass.
  - Blocked: 3 failed fixes, missing access, no device, or a product decision. Normally, stop and report with the evidence. For an approved multi-milestone assignment, use `references/milestones.md`: defer the blocked milestone and its actual dependents, then continue only eligible independent work. During confirmed active absence mode, also apply the absence reference. Stop when no eligible work remains. Global safety stops and three failed fixes still require a stop.

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Missing `docs/flows/INDEX.md` returns `no_flows` cleanly | yes | Disposable git repo without `docs/flows/INDEX.md` (API + CLI `--json --fail-on-unupdated`) | `{ status: "no_flows", flowsDir: "docs/flows", docs: [], indexIssues: [], unupdatedImpactedDocs: [] }` and exit `0` | automated (TDD) | `scripts/scan-flow-drift.test.mjs` | passed | `RED -> GREEN` (`node --test scripts/scan-flow-drift.test.mjs`, `6/6` pass) | `7632d13` (`HEAD`) |
| T2 | Clean indexed flow doc with unchanged key files scores `0` and ignores non-path spans | yes | Indexed flow doc with `Entry points` (`/checkout`, `submitOrder`, `./gradlew test`, `n/a`), existing `keyFiles`, matching `Last verified`, and valid `Related flows` | `driftScore === 0`, `deadRefs: []`, `indexIssues: []`, `commitsTouchingKeyFiles === 0`, `diffStatus: "untouched"` | automated (TDD) | `scripts/scan-flow-drift.test.mjs` | passed | `RED -> GREEN` (`node --test scripts/scan-flow-drift.test.mjs`, `6/6` pass) | `7632d13` (`HEAD`) |
| T3 | Dead references, `Last verified` mismatch, `not yet` marker, missing indexed doc, and unindexed sibling doc compute exact `5 * issueCount` | yes | Repo with deleted key file + dead related flow + `Last verified` mismatch + unindexed `orphan.md` + missing indexed `ghost.md` | Exact `deadRefs`, `indexIssues`, `issues`, `driftScore` (`5 * issueCount`), and descending `driftScore` / ascending `docPath` sort | automated (TDD) | `scripts/scan-flow-drift.test.mjs` | passed | `RED -> GREEN` (`node --test scripts/scan-flow-drift.test.mjs`, `6/6` pass) | `7632d13` (`HEAD`) |
| T4 | Git ancestry churn counts commits after `docLastCommit` without storing SHAs in Markdown | yes | `4` commits modifying a key file after the flow doc's last commit (plus inherited `GIT_DIR` env test) | `commitsTouchingKeyFiles === 4`, `recentCommits.length === 4`, `driftScore === 6.0` (`3 * sqrt(4)`), untracked doc gets `docLastCommit: null` and `0` churn | automated (TDD) | `scripts/scan-flow-drift.test.mjs` | passed | `RED -> GREEN` (`node --test scripts/scan-flow-drift.test.mjs`, `6/6` pass) | `7632d13` (`HEAD`) |
| T5 | `--changed-from` diff-impact flags unupdated impacted docs (files, directories, deleted key files) and enforces `--fail-on-unupdated` | yes | Feature branch editing key file / directory child vs sibling prefix `src/auth-v2/`, with and without flow-doc edit, plus orphan two-dot fallback | `unupdatedImpactedDocs: ["docs/flows/auth.md"]` (`exit 0` default, `exit 1` with `--fail-on-unupdated`); becomes `[]` (`diffStatus: "impacted_updated"`) once `docs/flows/auth.md` is updated; falls back to `..` when needed | automated (TDD) | `scripts/scan-flow-drift.test.mjs` | passed | `RED -> GREEN` (`node --test scripts/scan-flow-drift.test.mjs`, `6/6` pass) | `7632d13` (`HEAD`) |
| T6 | Path-traversal, symlink escape, and CLI/ref validation guards | yes | Flow doc / `INDEX.md` containing `` `../../etc/passwd` ``, `../outside.md`, symlink outside `repoRoot`, unknown CLI flag, `--changed-from -bad`, and `--changed-from missing-ref` | Escaping paths never read outside `repoRoot` and are flagged safely; invalid flags/refs exit `1` | automated (TDD) | `scripts/scan-flow-drift.test.mjs` | passed | `RED -> GREEN` (`node --test scripts/scan-flow-drift.test.mjs`, `6/6` pass) | `7632d13` (`HEAD`) |
| T7 | `writing-skills` `RED -> GREEN` consumer verification + structural contract (`SKILL_LINK_RE`, 17-row `infra-review` table, `Rule/check map`, `0.5.18` parity) | yes | 5 baseline (`RED`) vs 5 revised (`GREEN`) subagents + `check.mjs` + `testing-contract.test.mjs` + `portability-contract.test.mjs` + `release.test.mjs` | `0/5` RED -> `5/5` GREEN consumer compliance; `check.mjs` and all contract suites pass with `0` `core.mdc` diff lines | subagent + automated | `scripts/testing-contract.test.mjs`, `scripts/check.mjs`, `CHANGELOG.md` | passed | `red-skill-1..5` (`0/5` scanner, `5/5` controls) -> `green-skill-1..5` (`5/5` across `Q1`–`Q5`); `31/31` `testing-contract.test.mjs`, `10/10` `portability-contract.test.mjs` | `af91078` + `HEAD` |
| T8 | Isolated `COPILOT_HOME` / Claude / Gemini smoke checks and independent `code-review` | yes | Temporary `COPILOT_HOME` install + `copilot instruction list` / `copilot skill list`, `claude plugin validate`, `gemini extensions validate`, and fresh `code-review` agent | Installed plugin discovers `v0.5.18` and bundles `skills/flow-docs/scripts/scan-flow-drift.mjs`; independent review clean | integration + review | CLI smoke + PR review | passed | `326` CI tests (`0` fail), `COPILOT_HOME` `v0.5.18` + bundled script run, `claude plugin validate --strict`, `GEMINI_CLI_HOME` `gemini extensions validate`, independent `code-review` | `HEAD` |

- Category assessment:
  - `boundaries and invalid input` -> `T1`, `T2`, `T3`, `T6` (missing `INDEX.md`, malformed/non-path spans, `..` traversal, symlink escape, invalid CLI flags and `-` git refs).
  - `existing consumers` -> `T5`, `T7`, `T8` (`flow-docs` skill, `infra-review` 17-row table contract, `check.mjs` `SKILL_LINK_RE`, `release.mjs` unique version section, multi-host plugin packaging).
  - `permissions and state changes` -> `T4`, `T6` (untracked vs committed flow docs, read-only Git inspection, containment inside `repoRoot`).
  - `concurrency, retries, partial failure, recovery` -> excluded: `scan-flow-drift.mjs` is a stateless, synchronous, read-only local scanner that writes zero files.
  - `UI, accessibility, and device` -> excluded: `AGENTS.md` states this repository has no UI or app (`Device test: Not needed`).
  - `migration and compatibility` -> `T1`, `T7`, `T8` (repos without `docs/flows/INDEX.md` return `no_flows` and exit `0`; manual `git log` fallback preserved when Node is absent).
  - `performance` -> `T4` (bounded single `git log -1` and single `git log --oneline <sha>..HEAD` per flow doc; `< 1s` execution).
- Required blockers: `none` (`T1`–`T8` passed).
- Optional limits: Live GitHub Releases publish step runs only on push to `main` (`scripts/release.test.mjs` covers release payload locally).
- Reassessment: Reassessed post-build and during PR #47 review rounds against all consumers (`flow-docs`, `infra-review`, `check.mjs`, `testing-contract.test.mjs`, `portability-contract.test.mjs`, `release.mjs`, and Copilot/Claude/Gemini packaging); expanded `T2`, `T5`, and `T6` for git renames (`--no-renames`), `ENOTDIR` path bounds, explicit `## Key files` extensionless/dotfile/directory entries without prose dot-token false positives, `-z` NUL-delimited Unicode Git paths, uncommitted working-tree key-file edits when `changedTo === "HEAD"`, and `--changed-to` `HEAD`/clean-checkout revision parity.

---

### Task 1: Deterministic Scanner & CI Suite (`skills/flow-docs/scripts/scan-flow-drift.mjs`)

**Files:**
- Create: `scripts/scan-flow-drift.test.mjs`
- Create: `skills/flow-docs/scripts/scan-flow-drift.mjs`
- Modify: `.github/workflows/check.yml:10-20`
- Test: `scripts/scan-flow-drift.test.mjs`

**Interfaces:**
- Consumes: Git repository layout (`<repoRoot>/<flowsDir>/INDEX.md` and `<repoRoot>/<flowsDir>/*.md`).
- Produces:
  - Named export `scanFlowDrift({ repoRoot = ".", flowsDir = "docs/flows", changedFrom = null, changedTo = "HEAD" } = {})` returning `{ status, flowsDir, changedFrom?, changedTo?, diffMode?, indexIssues, unupdatedImpactedDocs, docs }`.
  - CLI `node skills/flow-docs/scripts/scan-flow-drift.mjs [--repo-root <dir>] [--flows-dir <rel-path>] [--changed-from <git-ref>] [--changed-to <git-ref>] [--json] [--fail-on-unupdated]`.

- [x] **Step 1: Write the failing test suite in `scripts/scan-flow-drift.test.mjs`**
  Cover `T1`–`T6` using disposable `fs.mkdtempSync` + sanitized `git init` helpers (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, stripped `GIT_*` and `NODE_TEST_CONTEXT` env vars):
  1. `T1`: Repo without `docs/flows/INDEX.md` -> `status: "no_flows"`, exit `0` even with `--fail-on-unupdated`.
  2. `T2`: Clean indexed flow doc (`Entry points`, `Sequence`, `Key files`, `Tests`, `Related flows`) with web route `` `/checkout` ``, function `` `submitOrder` ``, command `` `./gradlew test` ``, and `` `n/a` `` -> `driftScore === 0`, `deadRefs: []`, `diffStatus: "untouched"`.
  3. `T3`: Deleted key file + dead sibling doc + `Last verified` mismatch + `not yet` marker + missing indexed doc + unindexed `orphan.md` -> exact `deadRefs`, `indexIssues`, `issues`, `driftScore === 5 * issueCount`, and deterministic sort.
  4. `T4`: `4` commits touching a key file after `docLastCommit` -> `commitsTouchingKeyFiles === 4`, `driftScore === 6.0`; untracked flow doc -> `docLastCommit === null`, `commitsTouchingKeyFiles === 0`; parent `GIT_DIR` env does not leak.
  5. `T5`: `--changed-from main` on a branch editing a key file or directory child (`src/auth/Login.ts` under `src/auth`, vs untouched `src/auth-v2/Other.ts`) -> `unupdatedImpactedDocs: ["docs/flows/auth.md"]`, CLI exits `0` without `--fail-on-unupdated` and `1` with `--fail-on-unupdated`; updating `docs/flows/auth.md` clears `unupdatedImpactedDocs` to `[]` (`diffStatus: "impacted_updated"`).
  6. `T6`: Path-traversal (`../../etc/passwd`, `../secret.md`), symlink escaping `repoRoot`, unknown CLI flag, `--changed-from -bad`, and nonexistent `--changed-from` ref -> safe handling without reading outside `repoRoot` and exit `1` on invalid CLI/ref inputs.

- [x] **Step 2: Run test suite to verify it fails (`RED`)**
  Run: `node --test scripts/scan-flow-drift.test.mjs`
  Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `skills/flow-docs/scripts/scan-flow-drift.mjs`).

- [x] **Step 3: Implement `scanFlowDrift` and CLI in `skills/flow-docs/scripts/scan-flow-drift.mjs` and add CI step to `.github/workflows/check.yml`**
  Implement Markdown table/section parsing, `realpathSync` containment checks, `execFileSync("git", ...)` ancestry churn and three-dot/two-dot diff-impact detection, damped score math, JSON/text formatting, and `.github/workflows/check.yml` step `- run: node --test scripts/scan-flow-drift.test.mjs`.

- [x] **Step 4: Run tests to verify `GREEN`**
  Run: `node --test scripts/scan-flow-drift.test.mjs && node --test scripts/testing-contract.test.mjs`
  Expected: PASS (`0` failures).

- [x] **Step 5: Commit Task 1**
  Commit `skills/flow-docs/scripts/scan-flow-drift.mjs`, `scripts/scan-flow-drift.test.mjs`, and `.github/workflows/check.yml`.

---

### Task 2: `writing-skills` TDD Wiring for `skills/flow-docs/SKILL.md` & `skills/infra-review/SKILL.md`

**Files:**
- Modify: `skills/flow-docs/SKILL.md`
- Modify: `skills/infra-review/SKILL.md`
- Modify: `scripts/testing-contract.test.mjs` (add structural regression check for `flow-docs` & `infra-review` drift-scanner wiring)

**Interfaces:**
- Consumes: `skills/flow-docs/scripts/scan-flow-drift.mjs` CLI flags and JSON output fields (`driftScore`, `deadRefs`, `commitsTouchingKeyFiles`, `unupdatedImpactedDocs`).
- Produces: Updated `skills/flow-docs/SKILL.md` and `skills/infra-review/SKILL.md` validated by `5` baseline (`RED`) vs `5` revised (`GREEN`) fresh subagents and `scripts/check.mjs`.

- [x] **Step 1: Run 5 fresh baseline (`RED`) consumer subagents before editing skills and add failing contract test**
  Evaluate current `skills/flow-docs/SKILL.md` and `skills/infra-review/SKILL.md` across 5 fresh subagents on a scenario asking for pre-edit flow-doc verification, Step-4 pre-review unupdated-flow verification, and weekly shadow-mode flow-doc drift telemetry; add structural test in `scripts/testing-contract.test.mjs` and confirm `RED`.

- [x] **Step 2: Update `skills/flow-docs/SKILL.md` and `skills/infra-review/SKILL.md`**
  - In `skills/flow-docs/SKILL.md`: instruct running `node <flow-docs-skill-dir>/scripts/scan-flow-drift.mjs --json` (referencing `` `scripts/scan-flow-drift.mjs` ``) in `## Before you change a flow` to inspect `driftScore`, `deadRefs`, and `commitsTouchingKeyFiles` (keeping manual `git log` fallback if Node is unavailable), and running `--changed-from <base>` in `## Update a flow doc` before Step 5 self-review to confirm `unupdatedImpactedDocs` is empty.
  - In `skills/infra-review/SKILL.md`: keep the 17-row main table untouched (`dataRows.length === 17`) and add shadow-mode `node <dev-loop-checkout>/skills/flow-docs/scripts/scan-flow-drift.mjs --repo-root <project-checkout> --json` plus merged-PR `--changed-from <mergeCommit>^1 --changed-to <mergeCommit>` checks under `### Shadow-mode objective telemetry`.

- [x] **Step 3: Verify `node scripts/check.mjs`, `scripts/testing-contract.test.mjs`, and 5 fresh revised (`GREEN`) consumer subagents**
  Run `node scripts/check.mjs && node --test scripts/testing-contract.test.mjs` and 5 fresh subagents confirming `5/5` compliance and `5/5` control preservation.

- [x] **Step 4: Commit Task 2**
  Commit `skills/flow-docs/SKILL.md`, `skills/infra-review/SKILL.md`, and `scripts/testing-contract.test.mjs`.

---

### Task 3: `README.md` Rule/Check Map, `CHANGELOG.md`, 5-Manifest Bump (`0.5.18`), Smoke Checks, Review & PR

**Files:**
- Modify: `README.md` (`## Rule/check map`)
- Modify: `CHANGELOG.md`
- Modify: `plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`
- Modify: `docs/superpowers/plans/2026-11-16-flow-drift-scanner-m1.md` (record final evidence and tested identities)

**Interfaces:**
- Consumes: Tasks 1–2 deliverables and `RED -> GREEN` evidence.
- Produces: Version `0.5.18` across all 5 manifests + `CHANGELOG.md`, `README.md` `## Rule/check map` row, verified CI + isolated CLI smoke checks, independent `code-review`, and open PR against `main`.

- [x] **Step 1: Update `README.md` `## Rule/check map`, `CHANGELOG.md`, and the 5 version manifests (`0.5.18`)**
  Add the 4-column `## Rule/check map` row linking `[Flow drift scanner](skills/flow-docs/scripts/scan-flow-drift.mjs)`, `[Flow docs skill](skills/flow-docs/SKILL.md)`, and `[Flow drift suite](scripts/scan-flow-drift.test.mjs)` with honest shadow-mode/advisory limitations; add `## 0.5.18 (2026-11-16)` to `CHANGELOG.md`; bump all 5 manifests to `0.5.18`.

- [x] **Step 2: Run full repository checks and isolated CLI smoke tests**
  Run `node scripts/check.mjs`, `node --test scripts/*.test.mjs`, `node --test tools/work-ledger/*.test.mjs`, confirm `git diff origin/main -- com.github.copilot/rules/core.mdc GEMINI.md` is empty, and run isolated `COPILOT_HOME` (`copilot plugin install`, `copilot instruction list`, `copilot skill list`), `claude plugin validate`, and `gemini extensions validate` checks.

- [x] **Step 3: Commit, run independent `code-review` on `origin/main...HEAD`, address any confirmed findings, push, and open PR 1**
  Record final evidence in `docs/superpowers/plans/2026-11-16-flow-drift-scanner-m1.md`, dispatch independent `code-review` subagent, push once, create PR against `main`, record `work_ledger_record` if available, wait for GitHub Actions `check` and `copilot-pull-request-reviewer`, and report to the coordinator session.

## Conclusion
This plan delivers PR 1 (`v0.5.18`) as a self-contained, zero-dependency enhancement with `0` diff lines in `com.github.copilot/rules/core.mdc` and no risky-area edits.
No owner approval gate is needed before execution because the design was approved in the coordinator session and the plan touches no risky areas in `AGENTS.md`.
The main technical risk is path-extraction false positives or `SKILL_LINK_RE` / 17-row contract regressions, which Tasks 1 and 2 test explicitly before shipping.

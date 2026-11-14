# Milestone M1: Host Portability Contract Implementation Plan (`0.5.13`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the shared multi-host capability contract, host-sync checks in `scripts/check.mjs`, and Copilot reference adapter (`v0.5.13`) while preserving existing Copilot behavior.

**Architecture:** Keep `com.github.copilot/rules/core.mdc` and `skills/*` as the single shared workflow source, export `checkRepo(repoRoot)` from `scripts/check.mjs` to enforce nested reference links, manifest version equality, core-rule byte sync, `COPILOT_CLI` hook non-duplication, and the `<= 15 KB` always-loaded budget, and route Copilot-specific workflow steps in `skills/dev-loop/SKILL.md` and `skills/dev-loop/assets/pr-body.md` through `skills/dev-loop/references/hosts/{README,copilot}.md`.

**Tech Stack:** Node.js ESM (`node:test`, `node:fs`, `node:path`), Markdown skill and reference documents.

**Spec:** Owner-approved 5-milestone host portability design (`2026-11-14`, synced to `main` at `2db8ff4`).

## Abstract
Dev-loop rules and skills are portable across coding hosts, but several workflow steps hardcode GitHub Copilot tools.
Add a shared host capability contract, validator checks in `scripts/check.mjs`, and the Copilot host guide in Milestone `M1`.
Keep `com.github.copilot/rules/core.mdc` unchanged, preserve all owner approval gates, and prove zero Copilot regression before building Claude Code and Gemini CLI adapters.

## Global Constraints
- `com.github.copilot/rules/core.mdc` must remain the single authoritative core rule (`<= 60` lines; `0` changed lines in `M1`).
- Changed production lines across Milestone `M1` must stay `<= 400` lines (estimated `~110` production lines).
- `1 KB` equals `1,000` bytes for `Always-loaded text`, matching `skills/infra-review/SKILL.md`; repo-owned startup text must stay `<= 15,000` bytes (`15 KB`).
- Inline backtick paths starting with `assets/`, `scripts/`, or `references/` inside `skills/*` and `skills/*/references/**/*.md` must resolve under that skill folder; prefix repository commands with `node <dev-loop-checkout>/scripts/...`.
- Never claim runtime `work-ledger` guard enforcement in a host where `@github/copilot-sdk/extension` is absent.

## Review Focus
1. **Nested reference link escapes or broken paths:** Inline backticks in `skills/*/references/**/*.md` (such as `references/hosts/copilot.md`) must resolve inside that skill directory without path-traversal escapes (`..`).
2. **Duplicate core-rule injection under `COPILOT_CLI=1`:** When `hooks/hooks.json` and `hooks/session-start` exist (`M2` onward), `checkRepo` must reject a `hooks/session-start` script that injects `additionalContext` when `COPILOT_CLI=1`.
3. **Drifted host manifests or generated `GEMINI.md`:** When `.claude-plugin/plugin.json`, `gemini-extension.json`, `.codex-plugin/plugin.json`, or `GEMINI.md` exist, `checkRepo` must catch version/name mismatches and byte drift from `com.github.copilot/rules/core.mdc` (body after YAML frontmatter).
4. **Repository automatic review vs local coding host:** `skills/dev-loop/SKILL.md` and `skills/dev-loop/assets/pr-body.md` must keep `copilot-pull-request-reviewer` as a GitHub repository setting checked from every coding host while preserving existing `independent-review.test.mjs`, `device-handoff.test.mjs`, and `testing-contract.test.mjs` contracts.
5. **Host detection vs model name:** An agent running a Claude or Gemini model inside GitHub Copilot must select host capabilities from its runtime environment and available tools, never from the model identifier.

## Acceptance record
- **Goal:** Establish the shared multi-host capability contract and validator checks in `M1` (`v0.5.13`) without changing `core.mdc` or regressing GitHub Copilot behavior.
- **Done when:**
  - [ ] `scripts/check.mjs` exports `checkRepo(repoRoot)` and enforces nested skill reference links, host-guide existence, optional multi-host manifest version/name sync, `GEMINI.md`-to-`core.mdc` byte sync, `COPILOT_CLI=1` hook non-duplication, and the `<= 15,000` byte (`15 KB`) startup budget.
  - [ ] `skills/dev-loop/references/hosts/README.md` and `skills/dev-loop/references/hosts/copilot.md` define the dev-loop capability contract, environment-based host selection, explicit guard-absence disclosure, and preserved Copilot workflow steps.
  - [ ] `skills/dev-loop/SKILL.md` and `skills/dev-loop/assets/pr-body.md` route `browser` canvas, `github-pr-media`, `orchestrate`/`pr-stack`, and `work_ledger_*` through `references/hosts/README.md`, separate GitHub `copilot-pull-request-reviewer` from the local coding host, and pass `5/5` fresh `writing-skills` consumer checks.
  - [ ] `node scripts/check.mjs`, all CI suites in `.github/workflows/check.yml` (including `scripts/portability-contract.test.mjs`), temporary `COPILOT_HOME` plugin/instruction/skill discovery, and `scripts/run-benchmark.mjs` (`B1`–`B6`) pass at the final head commit.
- **Required evidence:** `node scripts/check.mjs`; all CI suites in `.github/workflows/check.yml`; `writing-skills` baseline (`RED`) and revised (`GREEN`, `5/5`) consumer checks; temporary `COPILOT_HOME` install and list check; `node scripts/run-benchmark.mjs` (`B1`–`B6`) baseline-vs-candidate check; independent `code-review` subagent verdict; no device test (this repository has no app).
- **Test matrix:** Compact matrix (`T-M1-1`–`T-M1-6`) below, saved before implementation under `references/testing.md`.
- **Regression selection:** No separate `docs/testing/regression-matrix.md` exists in `AGENTS.md` (explicit inventory note: `README.md` application checks and `.github/workflows/check.yml` suites serve as the repository regression baseline). Selected suites: `device-handoff.test.mjs`, `branch-maintenance.test.mjs`, `independent-review.test.mjs`, `testing-contract.test.mjs`, `collect-metrics.test.mjs`, `run-benchmark.test.mjs`, `tools/work-ledger/*.test.mjs`, and `README.md#rulecheck-map` checks.
- **Size estimate:** Task 1: ~70 production lines (`scripts/check.mjs`, `.github/workflows/check.yml`); Task 2: ~0 production code lines (Markdown skills/references/templates/docs do not count as production code, or ~110 lines total if counting `check.mjs` + workflow). Well below the 400-line cap.
- **Milestone selection:** Milestone `M1` of the 5-milestone portability assignment under `skills/dev-loop/references/milestones.md`. Independent PR targeting `main` (`2db8ff4`) as the shared contract prerequisite for `M2` (Claude Code `2.1.299`), `M3` (Gemini CLI `0.32.1`), `M4` (Codex, locally blocked until Codex is installed), and `M5` (`infra-review` & support matrix).
- **Out of scope:** Claude Code installer (`M2`), Gemini CLI installer (`M3`), Codex installer (`M4`), `infra-review` / `collect-metrics.mjs` mixed-host updates (`M5`), and `tools/work-ledger/` runtime guard ports (separate future phase).
- **Risky area:** Approval points and finish/ship instructions in `skills/dev-loop/SKILL.md` and `skills/dev-loop/assets/pr-body.md` (owner design and risky-plan approval received on `2026-11-14`; independent task and PR reviews required).
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content, or a harmless-edit exemption has a recorded reason. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains. A case marked not applicable needs a source or requirements reference and a recorded reason; it is not a pass.
  - Blocked: 3 failed fixes, missing access, no device, or a product decision. Normally, stop and report with the evidence. For an approved multi-milestone assignment, use `references/milestones.md`: defer the blocked milestone and its actual dependents, then continue only eligible independent work. During confirmed active absence mode, also apply the absence reference. Stop when no eligible work remains. Global safety stops and three failed fixes still require a stop.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Shared host capability contract, `check.mjs` sync validators, and unchanged Copilot workflow (`0.5.13`) | `T-M1-1`–`T-M1-6`, CI suites, temp `COPILOT_HOME` check, `run-benchmark.mjs` `B1`–`B6` | None (`main` at `2db8ff4`, `0.5.12`) | `divydvd-dev-loop-agent-portability` -> `main` (foundation contract) | Copilot installer only; Claude, Gemini, and Codex packages arrive in `M2`–`M4` | in progress | none | Implement Tasks 1–2, verify, review, and open PR |
| M2 | Claude Code plugin + `SessionStart` core injection (`COPILOT_CLI` guarded) | `claude plugin validate`, Claude `2.1.299` `P01`–`P12` + `B1`–`B6`, Copilot non-duplication | Requires `M1` contract | `portability-claude` -> `main` after `M1` | Workflow only; `work-ledger` runtime guards absent | planned | none | Start after `M1` |
| M3 | Gemini CLI extension (`gemini-extension.json` + synced `GEMINI.md`) | Gemini `0.32.1` unique-marker test + `P01`–`P12` + `B1`–`B6` | Requires `M1` contract | `portability-gemini` -> `main` after `M1` | Workflow only; interactive skill consent; guards absent | planned | none | Start after `M1` |
| M4 | Codex plugin/instruction support with verified startup core loading | Unique-marker test + isolated Codex `P01`–`P12` + `B1`–`B6` | Requires `M1` + local Codex runtime (`codex` absent on this Mac) | `portability-codex` -> `main` after `M1` and runtime install | Blocked locally until Codex client is installed | blocked | none | Defer until Codex is installed |
| M5 | Host-aware `infra-review`, `collect-metrics.mjs` `n/a` handling, and verified support matrix | `collect-metrics.test.mjs`, `testing-contract.test.mjs`, 5 fresh `infra-review` consumers | Requires `M1` + verified host evidence (`M2`/`M3`) | `portability-reporting` -> `main` after host PRs | Claims only hosts with committed `P01`–`P12` evidence | planned | none | Start after `M2`/`M3` |

- Overall assignment: `in progress` (`M1` active; `M2`, `M3`, `M5` planned; `M4` blocked on local Codex installation).

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-M1-1 | Nested reference links & path-traversal rejection in `checkRepo` | yes | Temp plugin trees with missing `references/hosts/missing.md` link and `references/../../outside.md` escape | `checkRepo` reports exact fault on broken or escaping links and `0` faults on valid repo | automated | `scripts/portability-contract.test.mjs` | not run | none | none |
| T-M1-2 | Multi-host manifest version sync, `GEMINI.md` byte sync, `COPILOT_CLI` hook guard, and `<= 15 KB` budget | yes | Temp plugin trees with mismatched `.claude-plugin/plugin.json` / `gemini-extension.json`, drifted `GEMINI.md`, unguarded `hooks/session-start`, and `> 15,000` byte startup text | `checkRepo` catches each fault and passes clean multi-host fixtures | automated | `scripts/portability-contract.test.mjs` | not run | none | none |
| T-M1-3 | Shared `dev-loop` skill & `pr-body.md` host decoupling without breaking existing contracts | yes | Current repo files (`SKILL.md`, `pr-body.md`, `references/hosts/{README,copilot}.md`, `README.md#rulecheck-map`, `.github/workflows/check.yml`) | Routes host deltas via `references/hosts/README.md`, separates GitHub `copilot-pull-request-reviewer` from coding host, states guard absence, and passes all 7 existing CI suites | automated | `scripts/portability-contract.test.mjs`, `scripts/*.test.mjs`, `tools/work-ledger/*.test.mjs` | not run | none | none |
| T-M1-4 | `writing-skills` consumer behavior (`S-P1`–`S-P4`: mockup/screenshot fallback, repo auto-review, guard-absence honesty, preserved Copilot gates) | yes | 5 fresh baseline (`0.5.12`) vs 5 fresh revised (`0.5.13`) `explore` subagents | Baseline exposes missing host fallback/guard guidance (`RED`); revised converges `5/5` (`GREEN`) while preserving Copilot gates | subagent application check | Session transcripts + `CHANGELOG.md` summary | not run | none | none |
| T-M1-5 | Temporary `COPILOT_HOME` installation and discovery (`0.5.13`) | yes | Fresh temp `COPILOT_HOME` with Superpowers + `dev-loop` worktree installed | `copilot plugin list`, `copilot instruction list`, and `copilot skill list` discover `dev-loop@dev-loop`, `core.mdc`, and all 4 skills | integration | CLI smoke check (`installPluginInHome`) | not run | none | none |
| T-M1-6 | Executable `B1`–`B6` benchmark preservation (`main` vs `M1`) | yes | `scripts/run-benchmark.mjs` across `B1`–`B6` comparing `main` (`2db8ff4`) and `M1` (`0.5.13`) | `6/6` deterministic oracle + `installPluginInHome` provisioning checks pass with `0` safety or quality regressions | integration | `scripts/run-benchmark.mjs` | not run | none | none |

- Category assessment: `boundaries and invalid input` -> `T-M1-1`, `T-M1-2` (`15,000` byte boundary, path escape, malformed/drifted manifests); `permissions and state changes` -> `T-M1-2`, `T-M1-4` (`COPILOT_CLI=1` hook guard, guard-absence disclosure, preserved owner gates); `existing consumers` -> `T-M1-3`, `T-M1-5`, `T-M1-6` (7 existing CI suites, Copilot CLI discovery, `run-benchmark.mjs`); `migration and compatibility` -> `T-M1-2`, `T-M1-5` (`0.5.12` -> `0.5.13` Copilot compatibility and future `M2`/`M3` manifest hooks); `concurrency and retries`, `partial failure and recovery`, `UI, accessibility, and device`, `performance` -> excluded because `M1` adds synchronous static file validation and Markdown instructions in a repo with no UI or device app (`check.mjs` runs in `< 100 ms`).
- Required blockers: `T-M1-1`–`T-M1-6` not yet executed (pre-implementation).
- Optional limits: Live paid-LLM `copilot -p` multi-sample A/B runs across `B1`–`B6` are optional in `M1` because `core.mdc` has `0` changed lines and `T-M1-4` + `T-M1-5` + deterministic `B1`–`B6` oracle/install checks verify skill behavior and Copilot packaging; remaining risk is minor wording variance in live Copilot sessions.
- Reassessment: Update after Tasks 1–2 and independent review with exact commit SHAs.

---

### Task 1: Multi-host validator contract in `scripts/check.mjs`

**Files:**
- Create: `scripts/portability-contract.test.mjs`
- Modify: `scripts/check.mjs:1-118`
- Modify: `.github/workflows/check.yml:12-20`
- Modify: `scripts/testing-contract.test.mjs:139-144`
- Test: `scripts/portability-contract.test.mjs`

**Interfaces:**
- Consumes: `plugin.json`, `.github/plugin/marketplace.json`, `CHANGELOG.md`, `AGENTS.md`, `com.github.copilot/rules/*.mdc`, `skills/*/SKILL.md`, `skills/*/references/**/*.md`.
- Produces: `export function checkRepo(repoRoot = defaultRoot): string[]` and `export function stripFrontmatter(text: string): string` in `scripts/check.mjs` returning relative fault messages (`[]` when clean) while preserving CLI exit code `0`/`1` when executed directly.

- [ ] **Step 1: Write failing validator tests (`T-M1-1`, `T-M1-2`) in `scripts/portability-contract.test.mjs` and wire CI**

Assert that `checkRepo` is exported from `scripts/check.mjs`, returns `[]` on a valid minimal fixture, and reports faults on:
1. Missing inline backtick target (`references/hosts/missing.md`) and path-traversal link (`references/../../outside.md`) inside `skills/dev-loop/references/hosts/README.md`.
2. Version or name mismatch in optional `.claude-plugin/plugin.json`, `gemini-extension.json`, or `.codex-plugin/plugin.json`, or missing `"contextFileName": "GEMINI.md"` in `gemini-extension.json`.
3. Byte mismatch between optional root `GEMINI.md` and `stripFrontmatter(core.mdc)`.
4. Missing `${CLAUDE_PLUGIN_ROOT}/...` hook script in `hooks/hooks.json` or a `hooks/session-start` script that emits non-empty `additionalContext` when `COPILOT_CLI=1`.
5. Repo-owned startup text (`AGENTS.md` + host core rule bytes) exceeding `15,000` bytes (`15 KB`).

Also add `- run: node --test scripts/portability-contract.test.mjs` to `.github/workflows/check.yml` and include `"portability-contract"` in `scripts/testing-contract.test.mjs` (`CI runs the testing contract alongside existing suites`).

- [ ] **Step 2: Run tests to verify `RED` failure**

Run: `node --test scripts/portability-contract.test.mjs`
Expected: FAIL (`checkRepo` is not exported from `scripts/check.mjs`).

- [ ] **Step 3: Implement `checkRepo` and `stripFrontmatter` in `scripts/check.mjs`**

Refactor `scripts/check.mjs` so `checkRepo(repoRoot)` collects faults into a local array without global state:
- Keep existing `checkManifest`, `checkRules`, and `checkSkills` checks.
- Walk `skills/<name>/references/**/*.md` recursively and validate every inline backtick `` `((?:assets|scripts|references)/[^`\s]+)` `` resolves inside `skills/<name>/` (using `resolve` + relative boundary check so `..` escapes fail) and exists on disk.
- Check optional `.claude-plugin/plugin.json`, `gemini-extension.json`, and `.codex-plugin/plugin.json` against `plugin.json` (`name` and `version`), requiring `contextFileName === "GEMINI.md"` when `gemini-extension.json` exists.
- When `GEMINI.md` or `gemini-extension.json` exists, require `GEMINI.md` to equal `stripFrontmatter(core.mdc)` byte-for-byte.
- When `hooks/hooks.json` exists, verify referenced `${CLAUDE_PLUGIN_ROOT}/...` scripts exist and, if `hooks/session-start` exists, execute it with `CLAUDE_PLUGIN_ROOT=<repoRoot>` and `COPILOT_CLI=1` to confirm it exits `0` and injects `0` `additionalContext` bytes under Copilot.
- Measure repo-owned startup bytes (`AGENTS.md` if present + `com.github.copilot/rules/*.mdc` for Copilot, `GEMINI.md` when present) against `MAX_ALWAYS_LOADED_BYTES = 15_000`.
- Run CLI main block only when `process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)`.

- [ ] **Step 4: Run tests and plugin check to verify `GREEN`**

Run: `node scripts/check.mjs && node --test scripts/portability-contract.test.mjs scripts/testing-contract.test.mjs`
Expected: `check: no faults` and all tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add docs/superpowers/plans/2026-11-14-host-portability-m1.md scripts/check.mjs scripts/portability-contract.test.mjs scripts/testing-contract.test.mjs .github/workflows/check.yml
git commit -m "feat(check): add multi-host manifest, link, and startup-budget checks"
```

---

### Task 2: Host capability guides, `dev-loop` skill decoupling, PR template, and `0.5.13` release (Risky area)

**Files:**
- Create: `skills/dev-loop/references/hosts/README.md`
- Create: `skills/dev-loop/references/hosts/copilot.md`
- Modify: `skills/dev-loop/SKILL.md:14-30,60-76,144-166`
- Modify: `skills/dev-loop/assets/pr-body.md:43-76`
- Modify: `scripts/portability-contract.test.mjs`
- Modify: `README.md:174-205,475-483`
- Modify: `CHANGELOG.md:1-10`
- Modify: `plugin.json:1-12`
- Modify: `.github/plugin/marketplace.json:1-20`
- Test: `scripts/portability-contract.test.mjs`

**Interfaces:**
- Consumes: `checkRepo` from `scripts/check.mjs`; `com.github.copilot/rules/core.mdc` (`0` edits).
- Produces: `skills/dev-loop/references/hosts/README.md` (capability contract + host selection rules), `skills/dev-loop/references/hosts/copilot.md` (Copilot adapter), updated `skills/dev-loop/SKILL.md` and `skills/dev-loop/assets/pr-body.md`, and `0.5.13` release metadata.

- [ ] **Step 1: Run 5 fresh baseline `explore` subagents (`writing-skills` `RED`) on `S-P1`–`S-P4` against `0.5.12`**

Dispatch 5 independent `explore` subagents with only current `com.github.copilot/rules/core.mdc`, `skills/dev-loop/SKILL.md`, and `skills/dev-loop/assets/pr-body.md` on scenarios `S-P1` (non-Copilot host UI preview, screenshot fallback, and missing `work_ledger_record`), `S-P2` (GitHub `copilot-pull-request-reviewer` check from non-Copilot host), `S-P3` (runtime guard-absence question), and `S-P4` (preserved Copilot design gate + canvas/media/ledger behavior). Record baseline misses and passing controls in the ledger.

- [ ] **Step 2: Add failing contract tests (`T-M1-3`) in `scripts/portability-contract.test.mjs` and watch them fail (`RED`)**

Add tests asserting:
- `skills/dev-loop/references/hosts/README.md` and `skills/dev-loop/references/hosts/copilot.md` exist and `checkRepo()` enforces their presence.
- `references/hosts/README.md` defines environment-based host selection (never model name), reuses Superpowers `using-superpowers` tool mappings, requires explicit `work-ledger` runtime-guard absence disclosure outside Copilot, and maps every capability delta (`browser` canvas vs `file://` preview, `github-pr-media` fallback, `orchestrate`/`pr-stack` fallback, `work_ledger_*`, and `copilot-pull-request-reviewer` repository independence).
- `skills/dev-loop/SKILL.md` links `references/hosts/README.md` in `## Before you start`, `## 1. Route`, and `## 7. Ship`, and states that `copilot-pull-request-reviewer` is checked on GitHub regardless of coding host.
- `skills/dev-loop/assets/pr-body.md` distinguishes repository automatic review (`copilot-pull-request-reviewer` or `none configured`) from local coding host and documents unavailable screenshot upload handling while preserving `Independent agent review` and `GitHub Copilot review` headings.
- `README.md#rulecheck-map` maps the multi-host portability check to `scripts/check.mjs` and `scripts/portability-contract.test.mjs` with its structural limitation.
- `com.github.copilot/rules/core.mdc` stays `<= 60` lines and matches baseline `2db8ff4`.

Run: `node --test scripts/portability-contract.test.mjs`
Expected: FAIL (`skills/dev-loop/references/hosts/README.md` missing and `SKILL.md` not yet wired).

- [ ] **Step 3: Create `references/hosts/{README,copilot}.md` and update `SKILL.md`, `pr-body.md`, `check.mjs` host-guide existence check, `README.md`, `CHANGELOG.md`, `plugin.json` (`0.5.13`), and `.github/plugin/marketplace.json` (`0.5.13`)**

Write concise ASD-STE100 prose:
- `skills/dev-loop/references/hosts/README.md`: Abstract, host selection from runtime environment/tools (not model name), Superpowers `using-superpowers` delegation for generic tool names, capability table (`M1` Copilot active; Claude/Gemini/Codex adapter slots for `M2`–`M4`), explicit runtime-guard absence rule, Conclusion.
- `skills/dev-loop/references/hosts/copilot.md`: Exact Copilot procedures (`com.github.copilot/rules/core.mdc`, `browser` canvas `file://` preview, `github-pr-media` upload, `orchestrate`/`pr-stack`, optional `work_ledger_record`/`work_ledger_get` vs separate live extension check, `session_store_sql` / `~/.copilot/session-state`, and `copilot plugin` commands).
- Update `skills/dev-loop/SKILL.md`, `skills/dev-loop/assets/pr-body.md`, `scripts/check.mjs` (require `skills/dev-loop/references/hosts/README.md` and `copilot.md`), `README.md` (`## Rule/check map`), `CHANGELOG.md` (`## 0.5.13`), `plugin.json`, and `.github/plugin/marketplace.json`.

- [ ] **Step 4: Run full validation (`GREEN`), `writing-skills` `5/5` consumer check, temporary `COPILOT_HOME` smoke check, and `B1`–`B6` benchmark check**

Run:
1. `node scripts/check.mjs`
2. `node --test scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs scripts/independent-review.test.mjs scripts/testing-contract.test.mjs scripts/collect-metrics.test.mjs scripts/run-benchmark.test.mjs scripts/portability-contract.test.mjs tools/work-ledger/*.test.mjs`
3. 5 fresh `explore` subagents on `S-P1`–`S-P4` with revised `0.5.13` files (`Expected: 5/5 PASS`).
4. Temporary `COPILOT_HOME` install + `copilot plugin list` / `copilot instruction list` / `copilot skill list` (`T-M1-5`).
5. `B1`–`B6` isolated Git + `COPILOT_HOME` verification (`T-M1-6`).

- [ ] **Step 5: Update plan test matrix with actual results, commit Task 2, and run independent task/PR review**

Update `docs/superpowers/plans/2026-11-14-host-portability-m1.md` (`Done when`, `Milestone record`, and `Compact test matrix` evidence), commit all files, and dispatch independent `code-review` subagent (`requesting-code-review`) over `main...HEAD` before pushing.

## Conclusion
Milestone `M1` locks the shared host capability contract and sync checks in `scripts/check.mjs` without altering `core.mdc` or Copilot behavior.
Execute Tasks 1 and 2 inline with TDD, `writing-skills` consumer checks, temporary `COPILOT_HOME` smoke validation, and independent review, then open the `M1` pull request.
The main risk is accidental breakage of existing CI contract assertions or relative skill links, which running all 8 suites and `check.mjs` prevents.

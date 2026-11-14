# Milestone M2: Claude Code Host Adapter Implementation Plan (`0.5.14`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Claude Code `2.1.299` plugin package, `SessionStart` core-rule bootstrap hook (`COPILOT_CLI`-guarded), and `skills/dev-loop/references/hosts/claude.md` adapter (`v0.5.14`) while keeping `com.github.copilot/rules/core.mdc` unchanged and preserving GitHub Copilot behavior.

**Architecture:** Add `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` synced to `plugin.json` (`0.5.14`), inject the exact YAML-stripped body of `com.github.copilot/rules/core.mdc` via `hooks/hooks.json` + `hooks/run-hook.cmd` + `hooks/session-start` (`hookSpecificOutput.additionalContext` on `startup|resume|clear|compact`, emitting `{}` when `COPILOT_CLI` is set), and document Claude-only workflow deltas in `skills/dev-loop/references/hosts/claude.md`.

**Tech Stack:** Node.js ESM (`node:test`, `node:http`, `node:child_process`), POSIX/Bash hook scripts + Windows CMD polyglot wrapper, Markdown reference guides.

**Spec:** Owner-approved 5-milestone host portability plan (`2026-11-10-agent-portability-plan.md`, synced after `M1` PR `#41` at `main` `3351237`).

## Abstract
Claude Code `2.1.299` can load `dev-loop` skills from `.claude-plugin/`, but it does not read `com.github.copilot/rules/core.mdc` natively.
Add the Claude Code plugin manifests, a `COPILOT_CLI`-guarded `SessionStart` hook that injects the exact `core.mdc` body, and `skills/dev-loop/references/hosts/claude.md` in Milestone `M2` (`0.5.14`).
Verify plugin installation and outbound `/v1/messages` startup and resume injection in an isolated `CLAUDE_CONFIG_DIR`, verify zero duplicate loading in a temporary `COPILOT_HOME`, and report any missing local `claude` login blocker honestly.

## Global Constraints
- `com.github.copilot/rules/core.mdc` must have `0` diff lines and remain the single source of truth for core rules.
- Existing `skills/*/SKILL.md` rule content stays unchanged; add Claude Code deltas only in `skills/dev-loop/references/hosts/claude.md` and link it from `skills/dev-loop/references/hosts/README.md`.
- Never read or modify the owner's live `~/.claude`, `~/.copilot`, or `~/.gemini` files during installation or testing; isolate every CLI run with `CLAUDE_CONFIG_DIR` or `COPILOT_HOME` in `mktemp` directories.
- Do not add `gemini-extension.json`, `GEMINI.md` (`M3`), Codex manifests (`M4`), or `infra-review` / `collect-metrics.mjs` changes (`M5`) in this branch.
- `hooks/session-start` must work with an empty or broken `PATH` (`anthropics/claude-code#43127`), emit `"{}\n"` and exit `0` when `COPILOT_CLI` is non-empty, and stay within the `15,000`-byte (`15 KB`) startup ceiling with `AGENTS.md`.
- Inline backtick paths starting with `assets/`, `scripts/`, or `references/` inside `skills/dev-loop/references/**/*.md` must exist inside `skills/dev-loop/`; prefix repository scripts as `node <dev-loop-checkout>/scripts/...`.

## Review Focus
1. **Trailing-newline or frontmatter drift in `hooks/session-start`:** Bash `$(<file)` strips trailing newlines by default; `hooks/session-start` must preserve trailing newlines and strip only the leading YAML block so `hookSpecificOutput.additionalContext` equals `stripFrontmatter(core.mdc)` byte-for-byte for both LF and CRLF inputs.
2. **Broken or empty `PATH` at `SessionStart`:** `hooks/run-hook.cmd` and `hooks/session-start` must succeed when `PATH=""` and `BASH=/bin/bash` without calling `dirname`, `sed`, `awk`, or `python`.
3. **Version drift in `.claude-plugin/marketplace.json`:** `claude plugin install --marketplace <path> dev-loop` requires `.claude-plugin/marketplace.json`; `scripts/check.mjs` must validate `.claude-plugin/marketplace.json` version/name parity alongside `.claude-plugin/plugin.json`.
4. **Copilot double-loading under `COPILOT_CLI`:** Any non-empty `COPILOT_CLI` value must cause `hooks/session-start` (both directly and through `hooks/run-hook.cmd`) to output `{}` and `0` context bytes.
5. **Honest readiness reporting under unauthenticated `claude` CLI:** When local `claude auth status` reports `loggedIn: false` (`authMethod: "none"`), wire-capture tests verify binary hook/skill/prompt assembly (`P01`, `P10`), while live Anthropic LLM behavioral turns (`P02`–`P09`, `P11`, `P12`, live `claude` `B1`–`B6`) must be recorded as `blocked` (`environment blocker`), never faked as live LLM passes.

## Acceptance record
- **Goal:** Deliver the Claude Code `2.1.299` plugin package, automatic `SessionStart` core-rule bootstrap, and Claude host capability reference (`v0.5.14`) without altering `core.mdc` or regressing GitHub Copilot.
- **Done when:**
  - [ ] `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` match `plugin.json` (`name: "dev-loop"`, `version: "0.5.14"`), `scripts/check.mjs` enforces `.claude-plugin/marketplace.json` parity, and `claude plugin validate --strict .` passes with `0` errors and `0` warnings.
  - [ ] `hooks/hooks.json`, `hooks/run-hook.cmd` (`+x`), and `hooks/session-start` (`+x`) emit `{}` when `COPILOT_CLI` is non-empty and emit exact `stripFrontmatter(core.mdc)` in `hookSpecificOutput.additionalContext` (`hookEventName: "SessionStart"`) on `startup|resume|clear|compact`, including when `PATH` is empty.
  - [ ] Isolated `CLAUDE_CONFIG_DIR` smoke tests on Claude Code `2.1.299` pass marketplace install/list/details/disable/uninstall (`P10`) and outbound `/v1/messages` unique-marker + `core.mdc` + `AGENTS.md` + 4-skill discovery on both `startup` and `--resume` (`P01`) within the `15,000`-byte startup ceiling.
  - [ ] `skills/dev-loop/references/hosts/claude.md` (linked from `skills/dev-loop/references/hosts/README.md`) documents all Claude-specific workflow deltas and passes `5/5` fresh `writing-skills` consumer checks (`RED -> GREEN`).
  - [ ] `node scripts/check.mjs`, all 8 CI suites in `.github/workflows/check.yml`, temporary `COPILOT_HOME` install (`v0.5.14`, zero duplicate core injection), and independent `code-review` subagent review pass at the head commit; live authenticated `claude` LLM checks (`P02`–`P09`, `P11`, `P12`, live `B1`–`B6`) run if authenticated or record an explicit `blocked` environment handoff if `claude auth status` remains `loggedIn: false`.
- **Required evidence:** `node scripts/check.mjs`; all 8 CI suites in `.github/workflows/check.yml`; `claude plugin validate --strict --json .`; isolated `CLAUDE_CONFIG_DIR` install + wire-capture `startup`/`resume` marker proof (`P01`, `P10`); temporary `COPILOT_HOME` install and list check (`v0.5.14`); `writing-skills` baseline (`RED`) and revised (`GREEN`, `5/5`) consumer checks; deterministic `B1`–`B6` benchmark suite (`scripts/run-benchmark.test.mjs`); exact `claude auth status` / `claude -p` transcript for live LLM checks; independent `code-review` subagent verdicts; no device test (this repo has no app).
- **Test matrix:** Compact matrix (`T-M2-1`–`T-M2-7`) below, saved before implementation under `references/testing.md`.
- **Regression selection:** No separate `docs/testing/regression-matrix.md` exists in `AGENTS.md`; `README.md` application checks and `.github/workflows/check.yml` suites form the repository regression baseline. Selected suites: `portability-contract.test.mjs`, `device-handoff.test.mjs`, `branch-maintenance.test.mjs`, `independent-review.test.mjs`, `testing-contract.test.mjs`, `collect-metrics.test.mjs`, `run-benchmark.test.mjs`, and `tools/work-ledger/*.test.mjs`. No permanent inventory file changes are needed because `README.md#rulecheck-map` already maps `scripts/check.mjs` and `scripts/portability-contract.test.mjs`.
- **Size estimate:** Task 1: ~65 production lines (`scripts/check.mjs`, `.claude-plugin/*.json`, `hooks/{hooks.json,run-hook.cmd,session-start}`, `plugin.json`, `.github/plugin/marketplace.json`); Task 2: `0` production code lines (Markdown host docs and `CHANGELOG.md` + tests do not count toward the 400-line production cap). Total: ~65 production lines (`<= 400`).
- **Milestone selection:** Milestone `M2` of the approved 5-milestone host portability assignment under `skills/dev-loop/references/milestones.md`. Independent branch `divydvd-claude-code-portability-m2` targeting `main` (`3351237`, `v0.5.13`), independent of parallel sibling `M3` (Gemini CLI).
- **Out of scope:** `tools/work-ledger/` runtime guard ports for Claude Code, Gemini CLI (`M3`), Codex (`M4`), `infra-review` / `collect-metrics.mjs` mixed-host updates (`M5`), and edits to `com.github.copilot/rules/core.mdc` or live `~/.claude` / `~/.copilot` configs.
- **Risky area:** Core rule startup injection (`hooks/session-start`) and approval/review/guard-absence host guidance (`skills/dev-loop/references/hosts/claude.md`). Owner design and risky-plan approval already granted (`2026-11-14`); per-task and whole-PR independent reviews required under `core` rules 7 and 23.
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, CI checks pass at the head commit, review rounds stop, independent review covers final substantive content, and all required cases pass without required gaps.
  - Blocked: 3 failed fixes, missing runtime authentication (`claude auth status` `loggedIn: false` for live Anthropic LLM turns `P02`–`P09`, `P11`, `P12`, live `B1`–`B6`), or an unapproved product decision. If only live Anthropic login is absent after all local packaging, CI, wire-injection, Copilot non-duplication, `writing-skills`, and independent review checks pass, open the PR with complete evidence and report `open, not ready` with the saved `environment blocker` failure handoff rather than faking a ready claim.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Shared host capability contract, `check.mjs` sync validators, and Copilot guide (`0.5.13`) | `check.mjs`, 8 CI suites, temp `COPILOT_HOME`, `B1`–`B6` | None | Merged in PR `#41` -> `main` (`3351237`) | Copilot package only | merged | `3351237` | Merged (`#41`) |
| M2 | Claude Code `2.1.299` plugin, `SessionStart` `core.mdc` hook (`COPILOT_CLI`-guarded), and `references/hosts/claude.md` (`0.5.14`) | `T-M2-1`–`T-M2-7`, `claude plugin validate --strict`, isolated `CLAUDE_CONFIG_DIR` wire check, temp `COPILOT_HOME` | `M1` merged at `3351237` | `divydvd-claude-code-portability-m2` -> `main` (independent of `M3`/`M4`) | Workflow only; `work-ledger` runtime guards absent; live Anthropic LLM `P02`–`P09`/`P11`–`P12` require local `claude /login` | in progress | none | Implement Tasks 1–2, verify, review, and open PR |
| M3 | Gemini CLI extension (`gemini-extension.json` + synced `GEMINI.md`) | Gemini `0.32.1` unique-marker + `P01`–`P12` | `M1` (`3351237`) | Parallel sibling session -> `main` | Out of scope for this session | in progress (sibling) | n/a | Handled in sibling session |
| M4 | Codex plugin/instruction support | Unique-marker + Codex `P01`–`P12` | `M1` + local Codex install | Deferred -> `main` | Blocked locally until Codex is installed | blocked | none | Deferred outside `M2` |
| M5 | Host-aware `infra-review`, `collect-metrics.mjs` `n/a`, and README support matrix | `collect-metrics.test.mjs`, `testing-contract.test.mjs`, 5 `infra-review` consumers | `M1` + verified host PRs | Planned after `M2`/`M3` -> `main` | Claims only verified hosts | planned | none | Run after `M2`/`M3` |

- Overall assignment: `in progress` (`M1` merged at `3351237`; `M2` active in this session; `M3` active in parallel sibling session; `M4` blocked on local Codex runtime; `M5` planned after host adapters).

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-M2-1 | `.claude-plugin/{plugin,marketplace}.json` parity + `hooks/{hooks.json,run-hook.cmd,session-start}` exact `core.mdc` output, CRLF/LF frontmatter strip, empty-`PATH` safety, and `COPILOT_CLI=1` `{}` guard | yes | Temp fixture repos (drifted `.claude-plugin/marketplace.json`, CRLF `core.mdc`, `PATH=""`) and real repo `.claude-plugin/*` + `hooks/*` | `checkRepo` catches `.claude-plugin/marketplace.json` drift; real `hooks/run-hook.cmd session-start` emits `{}\n` under `COPILOT_CLI=1` and exact `stripFrontmatter(core.mdc)` under unset `COPILOT_CLI` (even with `PATH=""`); `core.mdc` has `0` diff lines | automated | `scripts/portability-contract.test.mjs` | not run | none | none |
| T-M2-2 | Claude Code `2.1.299` strict validation, isolated `CLAUDE_CONFIG_DIR` install/disable/uninstall (`P10`), and real `claude -p` outbound `/v1/messages` unique-marker + `core.mdc` + `AGENTS.md` + 4-skill startup/resume proof (`P01`) | yes | Fresh temp `CLAUDE_CONFIG_DIR`, `claude plugin validate --strict --json`, `claude plugin install --marketplace`, local `127.0.0.1` wire capture on `startup` and `--resume` | `validate --strict` passes (`errors: []`, `warnings: []`); marketplace install discovers 4 skills + `SessionStart` hook; `startup` and `--resume` inject `core.mdc` body (`count === 1`), `AGENTS.md`, and all 4 `dev-loop:*` skills without manual file reads; disable/uninstall leaves user files untouched | automated integration | `scripts/portability-contract.test.mjs` + CLI smoke run | not run | none | none |
| T-M2-3 | `skills/dev-loop/references/hosts/claude.md` contract, `hosts/README.md` link, `check.mjs` required-host-guide check, and `0.5.14` manifest/changelog sync | yes | Real repo files (`hosts/README.md`, `hosts/claude.md`, `plugin.json`, `.github/plugin/marketplace.json`, `.claude-plugin/*`, `CHANGELOG.md`) | `checkRepo` requires `references/hosts/claude.md`, verifies nested backticks, confirms `0.5.14` across all 4 manifests + `CHANGELOG.md`, and verifies `claude.md` covers `SessionStart`, `Agent`/`claude-code-tools.md`, offline `file://` mockups, missing `github-pr-media`, non-`orchestrate` milestones, `work-ledger` guard absence, and `gh` check-runs | automated | `scripts/portability-contract.test.mjs`, `scripts/check.mjs` | not run | none | none |
| T-M2-4 | `writing-skills` fresh consumer routing (`S-M2-1`–`S-M2-4`: Claude `Agent` reviewer isolation + 2-failure stop, UI `file://` + screenshot table deletion, sequential/`--base` milestones without `orchestrate`/`pr-stack`, `SessionStart` + `work-ledger` guard-absence + `gh api` check-runs) | yes | 5 fresh baseline (`0.5.13`, before `claude.md`) vs 5 fresh revised (`0.5.14`, with `claude.md`) subagents | Baseline documents missing dedicated `references/hosts/claude.md` (`RED`); revised converges `5/5` (`GREEN`) across `S-M2-1`–`S-M2-4` | subagent application check | `CHANGELOG.md` (`0.5.14`) | not run | none | none |
| T-M2-5 | Temporary `COPILOT_HOME` install, discovery, and non-duplication regression check (`0.5.14`, `P10`) | yes | Fresh temp `COPILOT_HOME` with Superpowers + `copilot plugin install "$PWD"` | `copilot plugin list`, `copilot instruction list`, and `copilot skill list` show `dev-loop (v0.5.14)`, `dev-loop: core`, and 4 skills; `COPILOT_CLI=1` emits `{}` (`0` duplicate bytes) | integration | CLI smoke check | not run | none | none |
| T-M2-6 | Full 8-suite repository CI regression (`B1`–`B6` deterministic benchmark + contracts + `work-ledger`) | yes | `node scripts/check.mjs` and all 8 `node --test` suites in `.github/workflows/check.yml` | `0` check faults and `0` failed tests across all 8 suites | automated | `.github/workflows/check.yml` suites | not run | none | none |
| T-M2-7 | Live authenticated Claude Code `2.1.299` LLM behavioral sessions (`P02`–`P09`, `P11`, `P12`, live `claude` `B1`–`B6`) | yes | Isolated `CLAUDE_CONFIG_DIR` + `claude auth status` + `claude -p` against behavioral fixtures | Runs and grades live Claude turns when authenticated; if `claude auth status` is `loggedIn: false` (`Not logged in · Please run /login`), records exact transcript and `blocked` (`environment blocker`) handoff preventing a `ready` claim | live CLI / blocker check | Plan ledger & PR body (`Failure handoff`) | not run | none | none |

- Category assessment: `boundaries and invalid input` -> `T-M2-1` (CRLF frontmatter, empty `PATH=""`, trailing newlines, `15,000`-byte startup ceiling); `permissions and state changes` -> `T-M2-1`, `T-M2-2`, `T-M2-4`, `T-M2-7` (`COPILOT_CLI=1` suppression, `startup` vs `--resume` non-duplication, guard-absence honesty, unauthenticated CLI stop); `existing consumers` -> `T-M2-5`, `T-M2-6` (Copilot CLI `0.5.14` install and all 8 existing CI suites); `migration and compatibility` -> `T-M2-1`, `T-M2-2` (`run-hook.cmd` Windows/Unix polyglot + `.claude-plugin/{plugin,marketplace}.json` parity); `concurrency and retries` -> `T-M2-2` (`startup|resume|clear|compact` single-injection count `1`); `partial failure and recovery` -> `T-M2-4`, `T-M2-7` (2-failure independent-review stop and unauthenticated CLI failure handoff); `UI, accessibility, and device` and `performance` -> excluded because `dev-loop` has no UI/device app and `hooks/session-start` runs in `< 20 ms` with pure bash builtins.
- Required blockers: `T-M2-7` is expected to hit local `claude auth status` (`loggedIn: false`, `authMethod: "none"`) on this Mac unless credentials become available; verify live during Step 6 and record honestly.
- Optional limits: Windows `cmd.exe` branch of `hooks/run-hook.cmd` is syntax-inspected from Superpowers `7.0.0` rather than executed natively on macOS; remaining risk is low because the batch block matches the upstream Superpowers wrapper verbatim aside from early `COPILOT_CLI` exit.
- Reassessment: Initial matrix saved before editing production files.

---

### Task 1: Claude Code plugin manifests, `SessionStart` hook, and validator sync (`0.5.14`)

**Files:**
- Modify: `scripts/portability-contract.test.mjs`
- Modify: `scripts/check.mjs:170-210`
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `hooks/hooks.json`
- Create: `hooks/run-hook.cmd` (`0o755`)
- Create: `hooks/session-start` (`0o755`)
- Modify: `plugin.json`, `.github/plugin/marketplace.json`, `CHANGELOG.md`
- Test: `scripts/portability-contract.test.mjs`

**Interfaces:**
- Consumes: `checkRepo(repoRoot)` and `stripFrontmatter(text)` from `scripts/check.mjs`; `com.github.copilot/rules/core.mdc`.
- Produces:
  - `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (`name: "dev-loop"`, `version: "0.5.14"`), validated by `checkManifest()` in `scripts/check.mjs`.
  - `hooks/hooks.json` (`SessionStart` matcher `"startup|resume|clear|compact"` running `"\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start"` with `shell: "bash"`, `async: false`).
  - `hooks/run-hook.cmd` and `hooks/session-start` emitting `"{}\n"` when `COPILOT_CLI` is non-empty and `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<exact stripFrontmatter(core.mdc)>"}}` otherwise.

- [ ] **Step 1: Write failing tests `T-M2-1` and `T-M2-2` in `scripts/portability-contract.test.mjs`**

Add:
1. `T-M2-1`:
   - In `withFixtureRepo`, verify `checkRepo` rejects `.claude-plugin/marketplace.json` when its `plugins[0].version`, `metadata.version` (if present), or `name` diverges from `plugin.json`.
   - On `REPO_ROOT`, assert `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `hooks/run-hook.cmd`, and `hooks/session-start` exist, match `plugin.json` (`name: "dev-loop"`, `version: "0.5.14"`), use matcher `"startup|resume|clear|compact"`, return `{}` when `COPILOT_CLI=1`, and return exact `stripFrontmatter(readFileSync("com.github.copilot/rules/core.mdc", "utf8"))` when `COPILOT_CLI` is unset—including under `PATH=""` and on a temp copy with CRLF frontmatter.
   - Assert `git diff HEAD -- com.github.copilot/rules/core.mdc` (and against `3351237` when present) is empty.
2. `T-M2-2`:
   - When `claude` CLI is on `PATH`, run `claude plugin validate --strict --json` on `REPO_ROOT` and `.claude-plugin/plugin.json`, install `dev-loop` into a fresh `CLAUDE_CONFIG_DIR` via `claude plugin install --marketplace <REPO_ROOT> dev-loop`, check `claude plugin details dev-loop@dev-loop` discovers all 4 skills and `SessionStart`, verify real `claude -p` outbound `/v1/messages` wire requests on both `--session-id` (`startup`) and `--resume` (`resume`) contain exact `core.mdc` rules (`count === 1`), `AGENTS.md`, and all 4 `dev-loop:*` skills, and verify `claude plugin disable` + `claude plugin uninstall` exit `0`.

- [ ] **Step 2: Run `node --test scripts/portability-contract.test.mjs` and verify `RED` failure**

Run: `node --test scripts/portability-contract.test.mjs`
Expected: FAIL on `T-M2-1` and `T-M2-2` (`.claude-plugin/marketplace.json` drift unguarded and `.claude-plugin/plugin.json` / `hooks/*` missing).

- [ ] **Step 3: Implement `.claude-plugin/*`, `hooks/*`, `scripts/check.mjs` marketplace sync, and `0.5.14` version bump**

- Update `checkManifest()` in `scripts/check.mjs` to validate optional `.claude-plugin/marketplace.json` (`plugins` entry matching `plugin.name` and `plugin.version`, plus optional `metadata.version === plugin.version`).
- Create `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` at `0.5.14`, bump `plugin.json` and `.github/plugin/marketplace.json` to `0.5.14`, and add the initial `## 0.5.14 (2026-11-14)` entry in `CHANGELOG.md`.
- Create `hooks/hooks.json`, executable `hooks/run-hook.cmd` (`0o755`), and executable `hooks/session-start` (`0o755`) using pure bash file redirection (`$(<"$core_mdc"; printf x)`), pure bash YAML frontmatter stripping (LF and CRLF), `COPILOT_CLI` early `"{}\n"` exit, and `hookSpecificOutput.additionalContext` JSON output.

- [ ] **Step 4: Run tests and `scripts/check.mjs` to verify `GREEN`**

Run: `node scripts/check.mjs && node --test scripts/portability-contract.test.mjs`
Expected: `check: no faults` and `T-M1-1`–`T-M2-2` PASS.

- [ ] **Step 5: Commit Task 1 and run independent risky-task review (`core` rule 7)**

Commit Task 1, record completion in `.superpowers/sdd/.../progress.md`, and run an independent `code-review` subagent on Task 1's commit range (`3351237..HEAD`), fixing any confirmed Critical/Important finding before Task 2.

---

### Task 2: Claude Code host guide (`references/hosts/claude.md`), `writing-skills` verification, and changelog evidence

**Files:**
- Modify: `scripts/portability-contract.test.mjs`
- Modify: `skills/check` requirement in `scripts/check.mjs:403-407`
- Create: `skills/dev-loop/references/hosts/claude.md`
- Modify: `skills/dev-loop/references/hosts/README.md:14-18`
- Modify: `CHANGELOG.md`
- Test: `scripts/portability-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 `.claude-plugin/*` and `hooks/*`; `skills/dev-loop/references/hosts/README.md` capability contract.
- Produces: `skills/dev-loop/references/hosts/claude.md` required by `checkSkills()` in `scripts/check.mjs` and linked from `skills/dev-loop/references/hosts/README.md`.

- [ ] **Step 1: Run 5 fresh baseline `writing-skills` subagents (`RED`) and add failing `T-M2-3` tests**

1. Before creating `skills/dev-loop/references/hosts/claude.md`, run 5 fresh `explore` subagents against the current `skills/dev-loop/` tree across four Claude Code scenarios (`S-M2-1`: host identification when `CLAUDE_PLUGIN_ROOT` / Claude tools `Agent`/`Task`+`Skill` are active vs `COPILOT_CLI=1`, and `Agent` fresh-context reviewer isolation + 2-failure `open, not ready: independent review unavailable`; `S-M2-2`: offline HTML mockup outside the repo with `file://` URL + screenshot privacy check + deleting the empty HTML table when `github-pr-media` is absent; `S-M2-3`: sequential / owner-approved `git worktree` + `gh pr create --base <parent-branch>` milestones without `orchestrate`/`pr-stack`; `S-M2-4`: `SessionStart` core bootstrap on `startup|resume|clear|compact`, explicit `work-ledger` runtime-guard absence for `git push --force` / `gh pr merge`, and `gh api .../check-runs` repository automatic review). Record verbatim baseline misses (`RED`).
2. Add `T-M2-3` in `scripts/portability-contract.test.mjs` asserting `checkRepo` requires `references/hosts/claude.md`, `references/hosts/README.md` links `references/hosts/claude.md`, and `references/hosts/claude.md` covers all required Claude Code deltas without broken inline backticks.

- [ ] **Step 2: Run `node --test scripts/portability-contract.test.mjs` and verify `T-M2-3` fails (`RED`)**

Run: `node --test scripts/portability-contract.test.mjs`
Expected: FAIL (`skills/dev-loop/references/hosts/claude.md` missing and not yet required by `checkSkills`).

- [ ] **Step 3: Implement `skills/dev-loop/references/hosts/claude.md`, link in `hosts/README.md`, require in `scripts/check.mjs`, and record `CHANGELOG.md` evidence**

- Require `"references/hosts/claude.md"` alongside `"references/hosts/README.md"` and `"references/hosts/copilot.md"` in `checkSkills()` (`scripts/check.mjs`).
- Write concise ASD-STE100 `skills/dev-loop/references/hosts/claude.md` covering only dev-loop-specific Claude Code deltas (referencing Superpowers `claude-code-tools.md` rather than duplicating generic tool tables) and link `references/hosts/claude.md` in `skills/dev-loop/references/hosts/README.md`.
- Run 5 fresh revised `explore` subagents (`GREEN`) across `S-M2-1`–`S-M2-4`, confirm `5/5` compliance, and record exact `RED` and `GREEN` counts in `CHANGELOG.md` (`## 0.5.14`).

- [ ] **Step 4: Run full CI suites, Claude `2.1.299` & Copilot CLI smoke checks, and live-auth probe (`T-M2-1`–`T-M2-7`)**

Run:
```sh
node scripts/check.mjs
node --test scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs scripts/independent-review.test.mjs scripts/testing-contract.test.mjs scripts/collect-metrics.test.mjs scripts/run-benchmark.test.mjs scripts/portability-contract.test.mjs
node --test tools/work-ledger/*.test.mjs
claude plugin validate --strict --json .
```
Plus temporary `COPILOT_HOME` install (`copilot plugin install "$PWD"`, `copilot instruction list`, `copilot skill list`) and isolated `CLAUDE_CONFIG_DIR` smoke + `claude auth status` / `claude -p` check. Update the plan's test matrix and `Failure handoff` with exact results and commit SHAs.

- [ ] **Step 5: Commit Task 2, run whole-PR independent `code-review`, verify at final `HEAD`, and open PR**

Commit Task 2, dispatch independent `code-review` subagent across `main...HEAD`, fix any confirmed Critical/Important findings via TDD, remove `.superpowers/sdd/` scratch workspace before final verification, rerun final-head checks, push once to origin, open the PR with `assets/pr-body.md`, inspect CI + `copilot-pull-request-reviewer`, and report to the coordinator session (`25e68ef4-9c23-43e2-9139-e1d7b6ae4e48`).

## Conclusion
This plan delivers Milestone `M2` (`0.5.14`) in two TDD tasks (~65 production lines) while leaving `com.github.copilot/rules/core.mdc` and `skills/*/SKILL.md` untouched.
Owner design and risky-plan approvals are already complete, so execution proceeds immediately under `executing-plans` with per-task and whole-branch independent reviews.
The main risks are `SessionStart` frontmatter/PATH edge cases and unauthenticated local `claude` CLI runs, mitigated by wire-capture startup/resume tests and explicit `environment blocker` reporting.

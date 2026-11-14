# Milestone M3: Gemini CLI Host Adapter Implementation Plan (`0.5.14`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Gemini CLI `0.32.1` extension adapter (`gemini-extension.json`, byte-synced `GEMINI.md`, `scripts/sync-host-core.mjs`, and `skills/dev-loop/references/hosts/gemini.md` at `v0.5.14`) while keeping `com.github.copilot/rules/core.mdc` unchanged and preserving GitHub Copilot behavior.

**Architecture:** Declare `"contextFileName": "GEMINI.md"` in root `gemini-extension.json` and mirror the body of `com.github.copilot/rules/core.mdc` byte-for-byte into root `GEMINI.md` via `stripFrontmatter` from `scripts/check.mjs`. Document only dev-loop-specific Gemini CLI workflow deltas in `skills/dev-loop/references/hosts/gemini.md` and link that guide from `skills/dev-loop/references/hosts/README.md`, delegating generic tool names to Superpowers `gemini-tools.md`.

**Tech Stack:** Node.js ESM (`node:test`, `node:fs`, `node:child_process`), Gemini CLI `0.32.1`, GitHub Copilot CLI, Markdown skill references.

**Spec:** Owner-approved 5-milestone host portability plan (`/Users/divydwivedi/.copilot/session-state/25e68ef4-9c23-43e2-9139-e1d7b6ae4e48/files/2026-11-10-agent-portability-plan.md` and `docs/superpowers/plans/2026-11-14-host-portability-m1.md`, `main` at `3351237`).

## Abstract
Gemini CLI `0.32.1` supports local and repository extensions with `gemini-extension.json`, automatic startup context files, and `skills/*` discovery, but `dev-loop` currently ships only the GitHub Copilot manifest and host guide.
Add `gemini-extension.json`, a byte-identical `GEMINI.md` mirror of `com.github.copilot/rules/core.mdc` (without YAML frontmatter), a small `scripts/sync-host-core.mjs` helper, and `skills/dev-loop/references/hosts/gemini.md` in Milestone `M3` (`0.5.14`).
Verify automatic startup context loading, `activate_skill` consent boundaries, coexistence with GitHub Copilot inside `divydvd/dev-loop`, and honest reporting of isolated authentication limits without changing `core.mdc` or touching live user home directories.

## Global Constraints
- `com.github.copilot/rules/core.mdc` must remain the single authoritative core rule (`0` diff lines against `main`).
- Do not implement Claude Code (`M2`: `.claude-plugin/`, `hooks/`), Codex (`M4`), `infra-review` telemetry (`M5`), or `tools/work-ledger/` runtime guard ports in this branch.
- Never read or edit the owner's live `~/.gemini`, `~/.copilot`, or `~/.claude` directories; run every CLI smoke and harness check in isolated temporary directories (`HOME` and `GEMINI_CLI_HOME` / `COPILOT_HOME`).
- Changed production code lines across Milestone `M3` must stay `<= 400` lines (estimated `~35` production code lines).
- Repo-owned startup context (`AGENTS.md` + `GEMINI.md`, and `AGENTS.md` + `core.mdc`) must stay `<= 15,000` UTF-8 bytes (`15 KB`, where `1 KB = 1,000` bytes).
- Inline backtick paths starting with `assets/`, `scripts/`, or `references/` inside `skills/*` and `skills/*/references/**/*.md` must resolve inside that skill folder; refer to Superpowers' tool mapping as `gemini-tools.md` (not `references/gemini-tools.md`) and prefix repository scripts with `node <dev-loop-checkout>/scripts/...`.

## Review Focus
1. **Drifted `gemini-extension.json` description or `GEMINI.md` body:** `checkRepo` and `scripts/sync-host-core.mjs --check` must catch description mismatch against `plugin.json` and any byte difference between `GEMINI.md` and `stripFrontmatter(core.mdc)`.
2. **Broken inline reference backticks in `gemini.md`:** Mentioning Superpowers' `references/gemini-tools.md` or repo-root `scripts/check.mjs` in inline backticks inside `skills/dev-loop/references/hosts/gemini.md` would fail `SKILL_LINK_RE`; tests must verify `checkRepo(REPO_ROOT)` passes with zero link faults.
3. **Interactive `activate_skill` consent denial in Gemini CLI:** Gemini CLI `0.32.1`'s default policy (`write.toml`) sets `activate_skill` to `decision = "ask_user"`. If the owner declines skill consent or headless `--approval-mode default` blocks `activate_skill`, the agent must report `blocked` with the missing skill prerequisite instead of improvising the workflow without `dev-loop`.
4. **Coexistence inside `divydvd/dev-loop`:** Adding root `GEMINI.md` to `divydvd/dev-loop` must not add duplicate rules to GitHub Copilot (`copilot instruction list`) or push Gemini CLI startup memory above `15,000` bytes when working inside `divydvd/dev-loop` itself.
5. **Honest isolated CLI verification vs live Google API auth:** In an isolated temporary `GEMINI_CLI_HOME` without `GEMINI_API_KEY`, Vertex AI, or GCA credentials, live remote-API `gemini -p` calls exit `41`. Verification must test real Gemini CLI `0.32.1` extension/memory/skill/policy execution (`gemini extensions`, `gemini skills`, and `gemini --fake-responses`) plus fresh-subagent LLM behavior (`writing-skills`), and report the unauthenticated live-LLM API limit honestly instead of faking live Google API passes.

## Acceptance record
- **Goal:** Deliver Milestone `M3` (`0.5.14`) Gemini CLI `0.32.1` extension packaging, core-rule mirror sync, and Gemini host workflow guide without changing `core.mdc` or regressing GitHub Copilot.
- **Done when:**
  - [ ] Root `gemini-extension.json` declares `"name": "dev-loop"`, `"version": "0.5.14"`, `"description"` matching `plugin.json`, and `"contextFileName": "GEMINI.md"`, synced with `plugin.json`, `.github/plugin/marketplace.json`, and `CHANGELOG.md` (`0.5.14`).
  - [ ] Root `GEMINI.md` matches `stripFrontmatter(com.github.copilot/rules/core.mdc)` byte-for-byte, `com.github.copilot/rules/core.mdc` has `0` diff lines against `main`, `scripts/sync-host-core.mjs` verifies/syncs `GEMINI.md`, and `AGENTS.md` + `GEMINI.md` stays `<= 15,000` bytes.
  - [ ] `skills/dev-loop/references/hosts/gemini.md` is linked from `skills/dev-loop/references/hosts/README.md`, documents only dev-loop-specific Gemini CLI deltas (`gemini-extension.json` + `GEMINI.md` startup loading, `activate_skill` consent + reporting `blocked` when declined, `invoke_agent` with `generalist` referencing `gemini-tools.md`, `ask_user`, offline `file://` HTML mockup preview, screenshot privacy + missing `github-pr-media` table deletion, milestone branches without `orchestrate`/`pr-stack`, explicit `work-ledger` runtime-guard absence, and `gh` CLI check-run inspection), and passes `5/5` fresh `writing-skills` consumer checks (`RED -> GREEN`).
  - [ ] `node scripts/check.mjs`, all 8 CI suites in `.github/workflows/check.yml`, isolated temporary `COPILOT_HOME` discovery (`v0.5.14`), and isolated temporary `GEMINI_CLI_HOME` Gemini CLI `0.32.1` validation (install/link/validate/list/skills, unique-marker startup context injection, coexistence inside `divydvd/dev-loop`, `activate_skill` policy/consent check, and `P01`–`P12` + `B1`–`B6` checks with honest live-auth gap reporting) complete with independent `code-review` coverage at the final commit.
- **Required evidence:** `node scripts/check.mjs`; all 8 CI suites in `.github/workflows/check.yml`; `writing-skills` baseline (`RED`, 5 fresh consumers) and revised (`GREEN`, 5 fresh consumers); isolated temporary `GEMINI_CLI_HOME` Gemini CLI `0.32.1` CLI/harness checks and `P01`–`P12` + `B1`–`B6` matrix results; temporary `COPILOT_HOME` install and list check (`0.5.14`); independent `code-review` subagent verdict; no device test (this repo has no app).
- **Test matrix:** Compact matrix (`T-M3-1`–`T-M3-7`) and Gemini portability matrix (`P01`–`P12`) below, saved before implementation under `references/testing.md`.
- **Regression selection:** Reuse `.github/workflows/check.yml` suites (`device-handoff`, `branch-maintenance`, `independent-review`, `testing-contract`, `collect-metrics`, `run-benchmark`, `portability-contract`, and `tools/work-ledger/*.test.mjs`) plus `README.md` skill application invariants. `AGENTS.md` defines no separate `docs/testing/regression-matrix.md`.
- **Size estimate:** Task 1: ~30 production lines (`gemini-extension.json`, `scripts/sync-host-core.mjs`, `scripts/check.mjs`, `plugin.json`, `.github/plugin/marketplace.json`); Task 2: ~0 production code lines (Markdown host references, tests, and docs do not count). Total ~30 production lines, well below 400.
- **Milestone selection:** Milestone `M3` of the approved 5-milestone portability assignment under `skills/dev-loop/references/milestones.md`. Independent PR off `main` (`3351237`, `v0.5.13`); `M1` is already merged in PR `#41`, `M2` runs in a parallel sibling session, `M4` remains blocked on local Codex installation, and `M5` follows verified host PRs.
- **Out of scope:** Claude Code adapter (`M2`), Codex adapter (`M4`), `infra-review` / `collect-metrics.mjs` mixed-host telemetry (`M5`), `tools/work-ledger/` runtime guard ports, and edits to live user home directories.
- **Risky area:** Approval, skill-consent blocking, and finish/review routing in `skills/dev-loop/references/hosts/gemini.md` (owner design and risky-plan approval already completed; mandatory independent task/branch `code-review` subagent review applies under `core` rules 7 & 23).
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, CI checks pass at the head commit, and review rounds stopped. Independent review covers the final substantive content. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains.
  - Blocked: 3 failed fixes, missing runtime/auth access for a required live check, or an unapproved product decision. Record the exact failure handoff under `references/testing.md` and report readiness honestly (`open, not ready` when a required live check is environment-blocked) rather than faking a pass or downgrading a required check.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Shared host capability contract, `check.mjs` sync validators, and Copilot host guide (`0.5.13`) | Merged in PR `#41` (`node scripts/check.mjs`, 8 CI suites, `5/5` `writing-skills`, temp `COPILOT_HOME`, `B1`–`B6`) | None | `divydvd-dev-loop-agent-portability` -> `main` | Copilot installer only | merged | `3351237` | Merged (`#41`) |
| M2 | Claude Code plugin + `SessionStart` core injection (`COPILOT_CLI` guarded) | Handled in parallel sibling session | `M1` (`3351237`) | Sibling worktree -> `main` (independent of `M3`) | Workflow only; runtime guards absent | in progress (sibling) | external | Sibling session |
| M3 | Gemini CLI `0.32.1` extension (`gemini-extension.json` + byte-synced `GEMINI.md` + `references/hosts/gemini.md`, `0.5.14`) | `T-M3-1`–`T-M3-7`, `P01`–`P12`, `B1`–`B6`, temp `GEMINI_CLI_HOME` + `COPILOT_HOME`, independent `code-review` | `M1` (`3351237`) | `divydvd-gemini-cli-portability-m3` -> `main` (independent of `M2`/`M4`) | Workflow only; interactive `activate_skill` consent in default mode; `work-ledger` runtime guards absent | in progress | none | Implement Tasks 1–2 |
| M4 | Codex plugin/instruction support with verified startup core loading | Unique-marker test + isolated Codex `P01`–`P12` + `B1`–`B6` | `M1` + local Codex runtime (`codex` absent on this Mac) | `portability-codex` -> `main` | Blocked locally until Codex is installed | blocked | none | Defer until Codex is installed |
| M5 | Host-aware `infra-review`, `collect-metrics.mjs` `n/a` handling, and verified support matrix | `collect-metrics.test.mjs`, `testing-contract.test.mjs`, 5 fresh `infra-review` consumers | `M1` + verified host PRs (`M2`/`M3`) | `portability-reporting` -> `main` | Claims only hosts with committed `P01`–`P12` evidence | planned | none | Start after `M2`/`M3` |

- Overall assignment: `in progress` (`M1` merged at `3351237`; `M3` active in this session; `M2` active in sibling session; `M4` blocked on local Codex runtime; `M5` planned).

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-M3-1 | `checkRepo` enforces `gemini-extension.json` description parity with `plugin.json`; `scripts/sync-host-core.mjs` syncs and `--check`s `GEMINI.md` without modifying `core.mdc` | yes | Fixture repos with mismatched `gemini-extension.json` `description` and drifted `GEMINI.md` | `checkRepo` reports description mismatch fault; `sync-host-core.mjs --check` exits `1` on drift and `0` after sync while leaving `core.mdc` untouched | automated | `scripts/portability-contract.test.mjs` | planned | none | none |
| T-M3-2 | Real repo `gemini-extension.json`, `GEMINI.md` byte parity with `core.mdc` body, `<= 15,000` byte startup ceiling, `0`-line `core.mdc` diff, and version `0.5.14` parity | yes | `REPO_ROOT` files (`gemini-extension.json`, `GEMINI.md`, `plugin.json`, `.github/plugin/marketplace.json`, `CHANGELOG.md`, `core.mdc`) | Exact `0.5.14` parity across manifests/changelog, `GEMINI.md === stripFrontmatter(core.mdc)`, `AGENTS.md + GEMINI.md <= 15,000` bytes, `core.mdc` unchanged | automated | `scripts/portability-contract.test.mjs`, `scripts/check.mjs` | planned | none | none |
| T-M3-3 | `skills/dev-loop/references/hosts/gemini.md` coverage, link from `references/hosts/README.md`, valid skill backticks, and full 8-suite CI regression pass | yes | `REPO_ROOT` `skills/dev-loop/references/hosts/{README,gemini}.md` + all 8 `.github/workflows/check.yml` suites | `gemini.md` covers all Gemini CLI deltas without broken backtick links; `node scripts/check.mjs` and all 8 CI suites pass | automated | `scripts/portability-contract.test.mjs`, `.github/workflows/check.yml` suites | planned | none | none |
| T-M3-4 | `writing-skills` fresh consumer routing (`S-G1`–`S-G4`: `activate_skill` consent denial -> `blocked`, `invoke_agent` `generalist` + two-failure `not ready`, runtime host detection vs Gemini model name, UI/screenshot/milestone/guard-absence/`gh api` deltas) | yes | 5 fresh baseline (`RED`, without `gemini.md`) vs 5 fresh revised (`GREEN`, with `gemini.md`) `explore` subagents | Baseline exposes missing Gemini CLI `activate_skill` consent-denial and `invoke_agent` `generalist` specifics (`RED`); revised converges `5/5` (`GREEN`) across `S-G1`–`S-G4` | subagent application check | `CHANGELOG.md` (`0.5.14`) | planned | none | none |
| T-M3-5 | Isolated Gemini CLI `0.32.1` extension packaging, skill discovery, unique-marker startup `GEMINI.md` injection, `activate_skill` policy/consent mechanics, and `divydvd/dev-loop` coexistence (`P01`, `P10`, deterministic CLI harness for `P06`/`P08`/`P12`) | yes | Fresh temporary `HOME` / `GEMINI_CLI_HOME` with Superpowers + `dev-loop`; `gemini extensions {validate,link,install,list,disable,enable,uninstall}`, `gemini skills list`, and `gemini -p --fake-responses` | Extension validates/installs/links cleanly, lists 4 `dev-loop` skills, auto-injects unique marker from `GEMINI.md` into startup `systemInstruction` without file-read tool calls, enforces `activate_skill` `ask_user` policy in headless `default` mode while resolving `references/`/`assets/` once permitted, and stays `<= 15 KB` even inside `divydvd/dev-loop` | integration | Isolated CLI smoke & `--fake-responses` harness | planned | none | none |
| T-M3-6 | Temporary `COPILOT_HOME` regression & coexistence (`0.5.14`) and deterministic `B1`–`B6` benchmark suite | yes | Fresh temporary `COPILOT_HOME` installing `dev-loop` with root `GEMINI.md` present + `scripts/run-benchmark.mjs` / `scripts/run-benchmark.test.mjs` | Copilot discovers `dev-loop (v0.5.14)`, `dev-loop: core` (no duplicate `GEMINI.md` load), and 4 skills; `B1`–`B6` deterministic reference/anti-cheat suite passes `6/6` | integration | CLI smoke + `scripts/run-benchmark.test.mjs` | planned | none | none |
| T-M3-7 | Live Google-authenticated `gemini -p` multi-turn LLM runs across `P02`–`P09`, `P11`, `P12`, and `B1`–`B6` in isolated `GEMINI_CLI_HOME` | yes | Isolated `HOME` / `GEMINI_CLI_HOME` (owner `~/.gemini` untouched; check live `gemini -p` auth prerequisite) | Runs live Gemini LLM sessions if isolated auth is configured, or records exact `exit 41` environment auth blocker (`Failure handoff`) alongside fresh LLM subagent `P02`–`P12` behavioral checks without faking a live pass | integration / behavioral | Isolated CLI + fresh subagent `P02`–`P12` harness | planned | none | none |

- Category assessment: `boundaries and invalid input` -> `T-M3-1`, `T-M3-2` (`15,000`-byte startup ceiling, drifted `GEMINI.md` / `description`, inline backtick containment); `permissions and state changes` -> `T-M3-4`, `T-M3-5`, `T-M3-7` (`activate_skill` `ask_user` consent denial in Gemini CLI, guard-absence disclosure, isolated `GEMINI_CLI_HOME` non-mutation of `~/.gemini`, preserved owner gates); `existing consumers` -> `T-M3-3`, `T-M3-6` (all 8 CI suites, Copilot `COPILOT_HOME` discovery with root `GEMINI.md` present, `B1`–`B6` benchmark suite); `migration and compatibility` -> `T-M3-2`, `T-M3-5`, `T-M3-6` (`0.5.13` -> `0.5.14` upgrade and Copilot + Gemini coexistence inside `divydvd/dev-loop`); `partial failure and recovery` -> `T-M3-4`, `T-M3-5`, `T-M3-7` (two-failure `invoke_agent` fallback, declined `activate_skill` stop, unauthenticated CLI `exit 41` failure handoff); `concurrency and retries`, `UI, accessibility, and device`, `performance` -> excluded because `M3` adds static extension metadata, a small synchronous file-sync script, and Markdown host instructions in a repository with no UI or device app.

---

### Task 1: Gemini extension manifest, byte-synced `GEMINI.md`, sync helper, and contract tests (`0.5.14`)

**Files:**
- Modify: `scripts/portability-contract.test.mjs`
- Modify: `scripts/check.mjs:191-201`
- Create: `scripts/sync-host-core.mjs`
- Create: `gemini-extension.json`
- Create: `GEMINI.md`
- Modify: `plugin.json`
- Modify: `.github/plugin/marketplace.json`
- Modify: `CHANGELOG.md`
- Test: `scripts/portability-contract.test.mjs`

**Interfaces:**
- Consumes: `checkRepo(repoRoot)` and `stripFrontmatter(text)` from `scripts/check.mjs`; `com.github.copilot/rules/core.mdc`.
- Produces: `export function syncHostCore(repoRoot, { check = false } = {}): { synced: boolean, targetPath: string }` in `scripts/sync-host-core.mjs` (CLI supports `--check`); root `gemini-extension.json` (`0.5.14`); root `GEMINI.md`.

- [ ] **Step 1: Write failing tests (`T-M3-1`, `T-M3-2`) in `scripts/portability-contract.test.mjs`**

Assert:
1. `T-M3-1`: In a fixture repo where `plugin.json` includes `description`, `checkRepo` reports a fault when `gemini-extension.json` omits or mismatches `description`; `scripts/sync-host-core.mjs` writes `GEMINI.md` equal to `stripFrontmatter(core.mdc)`, exits `1` under `--check` when `GEMINI.md` drifts, and exits `0` under `--check` when synced without changing `core.mdc`.
2. `T-M3-2`: On `REPO_ROOT`, `gemini-extension.json` exists with `name: "dev-loop"`, `version === plugin.json.version` (`"0.5.14"`), `description === plugin.json.description`, and `contextFileName: "GEMINI.md"`; `GEMINI.md` equals `stripFrontmatter(core.mdc)` byte-for-byte; `AGENTS.md` + `GEMINI.md` is `<= 15,000` UTF-8 bytes; and `checkMod.checkRepo(REPO_ROOT)` returns `[]`.

- [ ] **Step 2: Run test suite to verify `RED` failure**

Run: `node --test scripts/portability-contract.test.mjs`
Expected: FAIL (`scripts/sync-host-core.mjs` and `gemini-extension.json` do not exist yet).

- [ ] **Step 3: Implement `description` check in `scripts/check.mjs`, `scripts/sync-host-core.mjs`, `gemini-extension.json`, `GEMINI.md`, and `0.5.14` version bump**

- In `scripts/check.mjs` (`checkManifest`), when `relManifest === "gemini-extension.json"` and `typeof plugin.description === "string"`, report a fault if `host.description !== plugin.description`.
- Create `scripts/sync-host-core.mjs` importing `stripFrontmatter` from `./check.mjs` to sync or `--check` `GEMINI.md` from `com.github.copilot/rules/core.mdc`.
- Create `gemini-extension.json` (`0.5.14`), run `node scripts/sync-host-core.mjs` to generate `GEMINI.md`, bump `plugin.json` and `.github/plugin/marketplace.json` to `0.5.14`, and add the `## 0.5.14 (2026-11-14)` entry in `CHANGELOG.md`.

- [ ] **Step 4: Run sync check, plugin check, and contract tests to verify `GREEN`**

Run: `node scripts/sync-host-core.mjs --check && node scripts/check.mjs && node --test scripts/portability-contract.test.mjs`
Expected: `check: no faults` and all tests in `scripts/portability-contract.test.mjs` PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add docs/superpowers/plans/2026-11-14-host-portability-m3-gemini.md scripts/check.mjs scripts/sync-host-core.mjs scripts/portability-contract.test.mjs gemini-extension.json GEMINI.md plugin.json .github/plugin/marketplace.json CHANGELOG.md
git commit -m "feat(gemini): add Gemini CLI extension manifest and synced GEMINI.md"
```

---

### Task 2: Gemini CLI host guide (`references/hosts/gemini.md`), `writing-skills` verification, and isolated CLI validation

**Files:**
- Modify: `scripts/portability-contract.test.mjs`
- Create: `skills/dev-loop/references/hosts/gemini.md`
- Modify: `skills/dev-loop/references/hosts/README.md:14-16`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-11-14-host-portability-m3-gemini.md`
- Test: `scripts/portability-contract.test.mjs`

**Interfaces:**
- Consumes: `gemini-extension.json`, `GEMINI.md`, `skills/dev-loop/references/hosts/README.md`, Superpowers `gemini-tools.md`.
- Produces: `skills/dev-loop/references/hosts/gemini.md` linked from `skills/dev-loop/references/hosts/README.md`; verified `writing-skills` (`5/5`) and isolated CLI evidence recorded in `CHANGELOG.md` and this plan.

- [ ] **Step 1: Run `writing-skills` `RED` baseline (5 fresh consumers without `references/hosts/gemini.md`) and write failing test `T-M3-3`**

- Dispatch 5 fresh `explore` subagents against the current skill files (before `gemini.md` exists) on scenarios `S-G1`–`S-G4` (`activate_skill` interactive consent declined -> must report `blocked` rather than run `dev-loop` steps ad hoc; `invoke_agent` with `agent_name: "generalist"` referencing `gemini-tools.md` + 2-failure `open, not ready: independent review unavailable`; `gemini-extension.json` + `GEMINI.md` startup context + runtime-tool host selection; offline `file://` HTML mockup + missing `github-pr-media` table deletion + `gh pr create --base` milestones + `work-ledger` guard-absence disclosure + `gh api` `copilot-pull-request-reviewer`).
- Add `T-M3-3` to `scripts/portability-contract.test.mjs` asserting `skills/dev-loop/references/hosts/gemini.md` exists, is linked from `skills/dev-loop/references/hosts/README.md`, and covers every required Gemini CLI delta with zero broken inline links.

- [ ] **Step 2: Run `scripts/portability-contract.test.mjs` to verify `RED` failure**

Run: `node --test scripts/portability-contract.test.mjs`
Expected: FAIL (`skills/dev-loop/references/hosts/gemini.md` is missing).

- [ ] **Step 3: Author `skills/dev-loop/references/hosts/gemini.md` and link it from `skills/dev-loop/references/hosts/README.md`**

Write `skills/dev-loop/references/hosts/gemini.md` in ASD-STE100 (`Abstract` and `Conclusion`, concise numbered procedures) covering:
1. Runtime identification (Gemini CLI runtime tools `activate_skill`, `invoke_agent`, `run_shell_command`, `read_file`, `replace`, `write_file` — never model name alone).
2. Automatic startup core loading via `gemini-extension.json` (`"contextFileName": "GEMINI.md"`), keeping `GEMINI.md` synced via `node <dev-loop-checkout>/scripts/sync-host-core.mjs`, and `Always-loaded text <= 15 KB` including inside `divydvd/dev-loop`.
3. `activate_skill` interactive skill-consent handling (`decision = "ask_user"` in Gemini CLI default approval mode): wait for consent; if skill activation is declined or blocked in non-interactive default mode without a policy allowance, stop and report `blocked` with the missing skill activation prerequisite instead of bypassing the skill workflow.
4. Owner gates with Gemini CLI `ask_user` (one question at a time, recommended choice first).
5. Fresh-context independent review (`design-review` and step 5) via `invoke_agent` with `agent_name: "generalist"` per Superpowers `gemini-tools.md`, passing diff/commits, acceptance record, test matrix, and review checklist without author chat history; retry once on failure, and report `open, not ready: independent review unavailable` after two failures without self-review substitution.
6. UI HTML mockups (`file://` outside the repo), PR screenshots (local PII/secret inspection + deleting empty HTML table when `github-pr-media` is absent), milestones without `orchestrate`/`pr-stack` (`gh pr create --base <parent-branch>`), step-6 evidence in `## Evidence` + plan/ledger without `work_ledger_record`, explicit `work-ledger` runtime-guard **absence**, and `gh api repos/{owner}/{repo}/commits/<sha>/check-runs` inspection for `copilot-pull-request-reviewer`.

Update step 4 of `skills/dev-loop/references/hosts/README.md` to reference `` `references/hosts/gemini.md` `` in Gemini CLI.

- [ ] **Step 4: Verify `GREEN` across `check.mjs`, `portability-contract.test.mjs`, `writing-skills` (5 fresh consumers), isolated `GEMINI_CLI_HOME`, temporary `COPILOT_HOME`, and all 8 CI suites**

Run:
- `node scripts/check.mjs && node --test scripts/portability-contract.test.mjs`
- 5 fresh `explore` subagents (`GREEN`) on `S-G1`–`S-G4`
- Isolated temporary `GEMINI_CLI_HOME` validation (`gemini` `0.32.1` validate/link/install/list/skills, unique-marker `--fake-responses` startup context check, `activate_skill` consent denial vs policy allow check, coexistence check, `P01`–`P12` and `B1`–`B6`)
- Isolated temporary `COPILOT_HOME` install (`copilot plugin install "$PWD"`, `copilot instruction list`, `copilot skill list`)
- All 8 CI test suites in `.github/workflows/check.yml`

Expected: `check: no faults`, `8/8` CI suites PASS, `5/5` `GREEN` fresh consumers, `COPILOT_HOME` and `GEMINI_CLI_HOME` checks verified, and exact `P01`–`P12` statuses recorded honestly in this plan and `CHANGELOG.md`.

- [ ] **Step 5: Commit Task 2**

```bash
git add skills/dev-loop/references/hosts/gemini.md skills/dev-loop/references/hosts/README.md scripts/portability-contract.test.mjs CHANGELOG.md docs/superpowers/plans/2026-11-14-host-portability-m3-gemini.md
git commit -m "docs(gemini): add Gemini CLI host guide and portability verification (0.5.14)"
```

## Conclusion
Execute Task 1 and Task 2 inline (`executing-plans`) with strict `RED -> GREEN` TDD and `writing-skills` fresh-consumer testing, followed by an independent `code-review` subagent review and PR creation.
No new owner decision is needed unless verification hits an unapproved product trade-off, because the 5-milestone design and risky-area plan are already approved.
The main risk is silent drift between `core.mdc` and `GEMINI.md` or overstated Gemini CLI runtime claims in an unauthenticated temporary home; deterministic byte-equality checks, `--fake-responses` CLI harness tests, and honest `P01`–`P12` reporting mitigate both risks.


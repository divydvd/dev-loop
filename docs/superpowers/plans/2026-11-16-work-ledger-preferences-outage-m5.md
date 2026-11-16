# Milestone M5 (PR 5): Externalized `work-ledger` Config and Bounded Outage Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove personal repository defaults from `tools/work-ledger`, validate externalized `config.json` preferences fail-closed, and add bounded idempotent transient-outage recovery during active `away mode`.

**Architecture:** Extract schema-validated preference loading (`loadPreferences`) into `tools/work-ledger/lib/preferences.mjs` and set `DEFAULT_CONFIG.defaultRepo` to `null` in `tools/work-ledger/lib/policy.mjs`, so repository resolution derives from Git remotes or explicit `config.json` overrides. Extract pure transient-outage classification (`classifyTransientOutage`), `away mode` eligibility checks, idempotent reconciliation prompt generation (`buildReconcilePrompt`), and bounded `[30, 120, 300]`s retry planning (`planOutageResume`) into `tools/work-ledger/lib/outage-resume.mjs`. Wire both modules into `tools/work-ledger/extension.mjs` using an `.unref()` timer that calls `session.send({ prompt })`, clears on `SIGTERM`/`SIGINT`/`onSessionEnd`/owner return, and falls back to `onSessionStart` context hydration if a reload happens before retry delivery.

**Tech Stack:** Node.js ESM (`node:test`, `node:fs`, `node:crypto`, `node:child_process`), `@github/copilot-sdk/extension`, Python 3 (`real-host-acceptance.py`).

**Spec:** `/Users/divydwivedi/Downloads/dev-loop-standalone-agent-spec.md` (`Global Rules & Repo Invariants` and `## PR 5: Externalized work-ledger Config & Bounded Outage Recovery`), with owner approvals recorded in coordinator session `a97500cf-c2ac-48ad-a87f-25e566f01c3e`.

## Abstract
`tools/work-ledger/lib/policy.mjs` currently hardcodes `"divydvd/SmarType"` as `DEFAULT_CONFIG.defaultRepo`, merges `config.json` without schema checks, and leaves unattended `away mode` sessions stalled after a transient HTTP `502`/`503`/`504` or `429` outage.
Milestone M5 (PR 5) sets `DEFAULT_CONFIG.defaultRepo` to `null`, validates `<dataDir>/config.json` and `<extDir>/config.json` fail-closed in `lib/preferences.mjs`, and adds bounded `[30, 120, 300]`s `away mode` outage recovery in `lib/outage-resume.mjs` and `extension.mjs`.
As a result, `work-ledger` works safely across any repository, surfaces a `Config: digest=<12hex>, defaultRepo=<repo|git-remote>` summary, and recovers from transient upstream outages up to `outageRetryCap` (`3`) without duplicating completed commits, pushes, or pull requests.

## Global Constraints
- Keep `com.github.copilot/rules/core.mdc`, `GEMINI.md`, `tools/work-ledger/BASELINE.sha256`, and the 5 plugin version manifests untouched (`0` diff lines against `main`).
- Keep total changed production code lines `<= 400` (estimated `~285` production lines across `tools/work-ledger/lib/preferences.mjs`, `tools/work-ledger/lib/outage-resume.mjs`, `tools/work-ledger/lib/policy.mjs`, `tools/work-ledger/lib/grants.mjs`, `tools/work-ledger/lib/store.mjs`, `tools/work-ledger/extension.mjs`, and `tools/work-ledger/owner-install.mjs`).
- Never read or modify the live `~/.copilot` installation on this machine; run every runtime, installer, and real-host acceptance test in disposable `fs.mkdtempSync` / `tempfile.TemporaryDirectory` directories.
- Pin the pre-edit `tools/work-ledger/SOURCE.sha256` (`68af23bda605a8f0d2cf844fbf9d87d2c9fe67d06ba989fb8d86fcfc7c0eedaa`) into `tools/work-ledger/PREVIOUS.sha256` before editing runtime `.mjs` files, update `owner-install.mjs` `runtime` to include `"outage-resume"` and `"preferences"`, and regenerate `SOURCE.sha256` first and `PACKAGE.sha256` second.
- Ensure every retry timer in `tools/work-ledger/extension.mjs` calls `.unref()` and clears on `SIGTERM`, `SIGINT`, `exit`, `onSessionEnd`, and owner messages so `tools/work-ledger/fixtures/real-host-acceptance.py` observes zero `survivors_after_exit`.
- Never use `git rebase`, `git commit --amend`, `git push --force`, or `gh pr merge`; include the `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` trailer on every commit.
- Write at least 80% of prose in ASD-STE100 Simplified Technical English.

## Review Focus
1. **Duplicate outage signals from one failed turn:** When the Copilot host fires both `hooks.onErrorOccurred` and `session.on("session.error")` for the same transient failure, `planOutageResume` must deduplicate while `status === "retrying"` so one outage consumes one retry slot (`attemptsUsed: 1`), not two.
2. **Non-advancing turns must not reset `attemptsUsed`:** If a resumed session ends a turn (`session.idle`) without a new Git `HEAD` commit and without new `work_ledger_record` or validation progress, `attemptsUsed` must stay at its current count rather than resetting to `0` and creating an unbounded retry loop.
3. **Unqualified owner messages and tool calls with no resolved repository:** When `defaultRepo` is `null` and `lookups.remoteRepo(cwd)` returns `null`, unqualified `"merge #12"`, `"review again #12"`, `"don't merge #12"`, `work_ledger_record({ pr: 12 })`, and `work_ledger_get({ pr: 12 })` must ask for `"owner/repo#12"` or `repo: "owner/repo"` and never create `"null#12"` records or call `prHead(null, 12)`.
4. **Syntactically corrupt or non-object `config.json` files and path-segment `defaultRepo` values:** Truncated JSON, array/primitive roots (`[]`, `"bad"`, `null`), or traversal-like `defaultRepo` strings (`"../bad"`, `"./repo"`, `"owner/.."`) in `<dataDir>/config.json` or `<extDir>/config.json` must never crash startup, must emit `configWarnings` to `errors.log` and `session.log`, and must keep all command guards active.
5. **Read-only 11-file `PREVIOUS.sha256` upgrade to 13-file `SOURCE.sha256` and zero lingering timers on `SIGTERM`:** `owner-install.mjs` must upgrade a read-only (`0o555`/`0o444`) 11-file `PREVIOUS.sha256` directory cleanly to the 13-file candidate layout while keeping `BASELINE.sha256` frozen, and `extension.mjs` must clear any armed `.unref()` timer on `SIGTERM` so `real-host-acceptance.py` sees zero `survivors_after_exit`.

## Acceptance record
- **Goal:** Deliver PR 5 (Milestone M5): externalize `work-ledger` personal configuration with fail-closed validation and add bounded `away mode` transient-outage recovery with idempotent state reconciliation.
- **Done when:**
  - [x] `tools/work-ledger/lib/policy.mjs` sets `DEFAULT_CONFIG.defaultRepo` to `null` and adds `outageRetryCap: 3` and `outageBackoffSec: [30, 120, 300]`.
  - [x] `tools/work-ledger/lib/preferences.mjs` exports `loadPreferences({ dataDir, extDir })`, merges `DEFAULT_CONFIG` <- `<dataDir>/config.json` <- `<extDir>/config.json`, validates fields fail-closed (`defaultRepo`, numeric caps with `outageRetryCap` clamped to `0..5`, `outageBackoffSec`, booleans, arrays, `deployWorkflows`), and returns `{ config, configWarnings, configDigest }`.
  - [x] Unqualified `"merge #N"`, `"review again #N"`, and `"don't merge #N"` owner messages when both `defaultRepo` and `lookups.remoteRepo(cwd)` are `null` reply with an instruction to use `owner/repo#N` instead of guessing `"divydvd/SmarType"` or writing `null#N`.
  - [x] `tools/work-ledger/lib/outage-resume.mjs` exports `classifyTransientOutage`, `detectAwayMode`, `buildReconcilePrompt`, `planOutageResume`, `markOutagePromptSent`, and `recordOutageProgress`, enforcing `away mode` eligibility, `[30, 120, 300]`s backoff up to `outageRetryCap`, `"exhausted"` halt on failure `cap + 1`, duplicate-signal deduplication, and `attemptsUsed = 0` reset only on new committed or ledger-recorded progress.
  - [x] `tools/work-ledger/extension.mjs` logs `configWarnings` to `errors.log` and `session.log`, exposes `Config: digest=<12hex>, defaultRepo=<repo|git-remote>` in `work_ledger_get`, auto-sends the reconciliation prompt on an `.unref()` timer cleared on `SIGTERM`/`SIGINT`/`exit`/`onSessionEnd`/owner return, and hydrates a pending `"retrying"` prompt via `onSessionStart` if a reload occurs first.
  - [x] `PREVIOUS.sha256` pins the pre-PR-5 `SOURCE.sha256` (`68af23bd...`), `BASELINE.sha256` is unchanged, `owner-install.mjs` includes `"outage-resume"` and `"preferences"`, `README.md`, `INSTALL.md`, and `CHANGELOG.md` are updated, and `SOURCE.sha256` then `PACKAGE.sha256` pass `package.test.mjs`, `baseline.test.mjs`, `owner-install.test.mjs`, `real-host-acceptance.py`, and `node scripts/check.mjs`.
- **Required evidence:** `node --test tools/work-ledger/*.test.mjs`; `python3 tools/work-ledger/fixtures/real-host-acceptance.py`; `node scripts/check.mjs`; `node --test scripts/*.test.mjs`; `git diff main -- com.github.copilot/rules/core.mdc GEMINI.md tools/work-ledger/BASELINE.sha256` (`0` lines); independent risky-task and full-diff agent reviews; `work_ledger_record` (`validated`, `review_clean`) at final `HEAD` SHA; GitHub Actions `check` and `copilot-pull-request-reviewer` status on the open PR.
- **Test matrix:** Compact test matrix (`T-WL5-1`–`T-WL5-7`) below, written before implementation per `skills/dev-loop/references/testing.md`.
- **Size estimate:** Task 1: ~95 production lines (`lib/policy.mjs`, `lib/preferences.mjs`, `lib/grants.mjs`); Task 2: ~115 production lines (`lib/outage-resume.mjs`, `lib/store.mjs`); Task 3: ~70 production lines (`extension.mjs`); Task 4: ~5 production lines (`owner-install.mjs` + SHA manifests + docs). Total: ~285 production lines (`<= 400`).
- **Risky area:** `tools/work-ledger/extension.mjs` and `tools/work-ledger/owner-install.mjs` govern approval enforcement, autonomous retry prompts, and package integrity; owner plan approval was granted via coordinator session `a97500cf-c2ac-48ad-a87f-25e566f01c3e`, and Tasks 3 and 4 require independent subagent review (`core.mdc` Rule 7).
- **Stop conditions:**
  - Done: all "Done when" items pass at `HEAD`, independent reviews and GitHub Actions `check` pass, `copilot-pull-request-reviewer` rounds conclude cleanly, `work_ledger_record` (`validated`, `review_clean`) is recorded at `HEAD`, and the PR is open against `main` without merging.
  - Blocked: stop and report `blocked` with evidence after 3 failed fix attempts on the same fault, or if any invariant (`core.mdc`, `GEMINI.md`, `BASELINE.sha256`, `~/.copilot` isolation) would be violated.

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-WL5-1 | No personal repo fallback; Git remote inference and repo-less owner prompt note | yes | Absent `config.json`, checkout with `origin` `acme/widget.git` vs checkout with no remote + `"merge #12"` / `"review again #12"` | `DEFAULT_CONFIG.defaultRepo === null`; repo resolves to `acme/widget` when remote exists; repo-less `"merge #12"` asks for `"merge owner/repo#12"` without saving `null#12` or guessing `divydvd/SmarType` | automated (TDD) | `tools/work-ledger/preferences.test.mjs` | pass |
| T-WL5-2 | Fail-closed `config.json` schema validation, precedence, and canonical `configDigest` | yes | Corrupt JSON, array root, `reviewCap: -5`, `defaultRepo: "bad string"`, `defaultRepo: "../bad"`, `outageRetryCap: 99`, `<extDir>` overriding `<dataDir>` | Invalid fields fall back safely (`outageRetryCap: 99` clamped to `5`) with `configWarnings[]`; deterministic 12-hex `configDigest`; all command guards stay active | automated (TDD) | `tools/work-ledger/preferences.test.mjs` | pass |
| T-WL5-3 | Transient vs non-transient outage classification | yes | `429`, `502`, `503`, `504`, `overloaded_error`, `rate_limit_error`, `ETIMEDOUT`, `ECONNRESET`, `EAI_AGAIN`, stream disconnect vs `400`, `401`, `403`, `422`, context-length overflow, `[work-ledger]` guard denial, `AbortError`, unknown error | Returns `{ transient: true, code }` only for genuine transport/upstream outages; returns `{ transient: false, code }` immediately for auth, validation, context-overflow, guard-denial, user-abort, and unknown errors | automated (TDD) | `tools/work-ledger/outage-resume.test.mjs` | pass |
| T-WL5-4 | `away mode` gating, `[30, 120, 300]`s backoff, retry cap exhaustion, duplicate-signal dedup, and progress-only reset | yes | Inactive vs active `.superpowers/sdd/<plan>/progress.md` / `ledger.json` `away_mode` note; 4 consecutive `503` failures; simultaneous `onErrorOccurred` + `session.error`; turn end with vs without new SHA/ledger progress | Inactive `away mode` returns `{ resume: false }`; active `away mode` schedules `30s`, `120s`, `300s` (`attemptsUsed: 1..3`) and halts `"exhausted"` on failure 4; duplicate signal while `"retrying"` does not double-increment; `attemptsUsed` resets to `0` only after new commit SHA or ledger progress | automated (TDD) | `tools/work-ledger/outage-resume.test.mjs` | pass |
| T-WL5-5 | Idempotent reconciliation prompt and real `extension.mjs` `.unref()` timer + `onSessionStart` fallback + `SIGTERM` cleanup | yes | Isolated `sdk-loader.mjs` runtime subprocess with malformed `config.json`, active `away mode` ledger, short backoff `[1, 2, 3]` (or fast test override), reload while `"retrying"`, and `SIGTERM` during pending timer | Logs `configWarnings` to `errors.log` and `session.log`; `work_ledger_get` shows `Config: digest=<12hex>, defaultRepo=git-remote`; timer fires `session.send({ prompt })` instructing plan/progress/`git status`/`git log -n 5`/`work_ledger_get` checks before commands; reload while `"retrying"` hydrates prompt in `onSessionStart`; `SIGTERM` exits cleanly without waiting on long timers | integration (TDD) | `tools/work-ledger/outage-runtime.test.mjs` | pass |
| T-WL5-6 | Provenance manifests (`BASELINE.sha256`, `PREVIOUS.sha256`, `SOURCE.sha256`, `PACKAGE.sha256`) and 11-to-13 file read-only upgrade | yes | Pre-PR-5 `PREVIOUS.sha256` (`68af23bd...`), 11-file read-only `0o555`/`0o444` installed directory, updated `owner-install.mjs`, regenerated `SOURCE.sha256` + `PACKAGE.sha256` | `baseline.test.mjs`, `package.test.mjs`, and `owner-install.test.mjs` pass, including upgrading a read-only 11-file `PREVIOUS.sha256` install to all 13 runtime files | automated (TDD) | `tools/work-ledger/owner-install.test.mjs`, `package.test.mjs`, `baseline.test.mjs` | pass |
| T-WL5-7 | Real Copilot CLI host acceptance (`survivors_after_exit === []`), repo-wide `check.mjs`, CI suites, and independent full-diff review | yes | `python3 tools/work-ledger/fixtures/real-host-acceptance.py`, `node scripts/check.mjs`, `node --test scripts/*.test.mjs`, independent `code-review` subagent | Zero surviving extension processes after exit; all root + `work-ledger` suites exit `0`; `core.mdc`, `GEMINI.md`, and `BASELINE.sha256` have `0` diff lines; independent review clean | e2e + review | `real-host-acceptance.py`, `scripts/check.mjs` | pass |

---

### Task 1: Externalize `DEFAULT_CONFIG`, Add `lib/preferences.mjs`, and Guard Repo-less Owner Prompts

**Files:**
- Create: `tools/work-ledger/lib/preferences.mjs`
- Create: `tools/work-ledger/preferences.test.mjs`
- Modify: `tools/work-ledger/lib/policy.mjs:12-27`
- Modify: `tools/work-ledger/lib/grants.mjs:78-127`

**Interfaces:**
- Consumes: `DEFAULT_CONFIG` from `tools/work-ledger/lib/policy.mjs`.
- Produces:
  - `DEFAULT_CONFIG` with `defaultRepo: null`, `outageRetryCap: 3`, `outageBackoffSec: [30, 120, 300]`.
  - `resolveDataDir({ envDir, extDir }) -> { dataDir: string, bootstrapWarnings: string[] }` in `tools/work-ledger/lib/preferences.mjs`.
  - `loadPreferences({ dataDir, extDir, defaults = DEFAULT_CONFIG }) -> { config: object, configWarnings: string[], configDigest: string }` in `tools/work-ledger/lib/preferences.mjs`.
  - Safe repo-less handling in `applyPlan` (`tools/work-ledger/lib/grants.mjs`) emitting `Cannot resolve a GitHub repository for #<N> here. Type "merge owner/repo#<N>".` (and matching `"review again owner/repo#<N>"` / `"don't merge owner/repo#<N>"` guidance) when `repo` is `null`.

- [x] **Step 1: Write the failing unit tests in `tools/work-ledger/preferences.test.mjs`**

Cover `T-WL5-1` and `T-WL5-2` plus Review Focus items 3 and 4:
1. `DEFAULT_CONFIG.defaultRepo` is `null`, `DEFAULT_CONFIG.outageRetryCap` is `3`, and `DEFAULT_CONFIG.outageBackoffSec` is `[30, 120, 300]`; `"divydvd/SmarType"` does not appear anywhere in `DEFAULT_CONFIG`.
2. With no `config.json` files, `loadPreferences` returns `DEFAULT_CONFIG` values, `configWarnings: []`, and a 12-hex `configDigest`; `<extDir>/config.json` overrides `<dataDir>/config.json` when both exist.
3. Malformed JSON syntax, JSON array/primitive roots, `reviewCap: -5`, `mergeApprovalHours: 0`, `gradleLockTimeoutSec: "fast"`, `defaultRepo: "bad string"`, `defaultRepo: "../bad"`, `defaultRepo: "owner/.."`, `outageBackoffSec: [-1]`, and `outageRetryCap: -1` fall back to `DEFAULT_CONFIG` with descriptive `configWarnings`; `outageRetryCap: 99` clamps to `5` with a warning while `outageRetryCap: 0` is accepted without warning; `decide(...)` continues to block `git push --force`, `gh pr merge`, and unapproved deploys under the sanitized config.
4. In a checkout with `origin` `https://github.com/acme/widget.git` and `defaultRepo: null`, `planOwnerMessage("merge #12", ...)` resolves `acme/widget#12`; in a directory with no Git remote and `defaultRepo: null`, `planOwnerMessage("merge #12", ...)` + `applyPlan(...)` records zero approvals, never calls `prHead(null, 12)`, and returns a note instructing `"merge owner/repo#12"` (plus `"review again #12"` and `"don't merge #12"` coverage).

- [x] **Step 2: Run `preferences.test.mjs` to verify it fails**

Run: `node --test tools/work-ledger/preferences.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./lib/preferences.mjs`.

- [x] **Step 3: Implement `DEFAULT_CONFIG` updates, `lib/preferences.mjs`, and repo-less `applyPlan` checks**

1. In `tools/work-ledger/lib/policy.mjs`, change `defaultRepo: "divydvd/SmarType"` to `defaultRepo: null` and add `outageRetryCap: 3` and `outageBackoffSec: [30, 120, 300]`.
2. Create `tools/work-ledger/lib/preferences.mjs`:
   - Validate `defaultRepo`: `null` or `/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/` where neither owner nor repo segment is `"."` or `".."`.
   - Validate positive integer caps: `reviewCap` (`1..50`), `mergeApprovalHours` / `deployApprovalHours` / `reviewGrantHours` (`1..720`), `gradleLockTimeoutSec` (`1..86400`).
   - Validate `outageRetryCap`: integer `0..5` accepted; integer `> 5` clamped to `5` with warning; `< 0` or non-integer falls back to `defaults.outageRetryCap` (`3`) with warning.
   - Validate `outageBackoffSec`: non-empty array (max 10 items) of integers in `1..3600`; invalid values fall back to `[...defaults.outageBackoffSec]` with warning.
   - Validate booleans (`gradleLane`, `gradleCache`, `protectExtensionDir`, `debug`), `deployWorkflows` (`null` or plain object of non-empty string values), and arrays (`localMavenScopes`, `readOnlyMonitors`).
   - Compute `configDigest` as the first 12 hex characters of `SHA-256` over canonical sorted-key JSON of the effective guard config object.
3. In `tools/work-ledger/lib/grants.mjs`:
   - In `planOwnerMessage`, skip calling `lookups.prHead(m.repo, m.pr)` when `!m.repo`.
   - In `applyPlan`, when `!m.repo` on a merge, `!r.repo` on a review grant, or `!x.repo` on a PR revoke, push a clear ASD-STE100 note (`Cannot resolve a GitHub repository for #${pr} here. Type "${verb} owner/repo#${pr}".`) and skip mutating `data.approvals` or `data.reviewGrants`.

- [x] **Step 4: Run `preferences.test.mjs` and existing `work-ledger` policy/control tests**

Run: `node --test tools/work-ledger/preferences.test.mjs tools/work-ledger/guard-policy.test.mjs tools/work-ledger/guard-controls.test.mjs tools/work-ledger/classification.test.mjs`
Expected: PASS (`0` failures).

- [x] **Step 5: Commit Task 1**

```bash
git add tools/work-ledger/lib/policy.mjs tools/work-ledger/lib/preferences.mjs tools/work-ledger/lib/grants.mjs tools/work-ledger/preferences.test.mjs
git commit -m "feat(work-ledger): externalize config defaults and validate preferences"
```

---

### Task 2: Add Transient Outage Classifier and Bounded `away mode` Recovery Planner

**Files:**
- Create: `tools/work-ledger/lib/outage-resume.mjs`
- Create: `tools/work-ledger/outage-resume.test.mjs`
- Modify: `tools/work-ledger/lib/store.mjs:8-34,119-135`

**Interfaces:**
- Consumes: `DEFAULT_CONFIG` (`outageRetryCap`, `outageBackoffSec`) from `tools/work-ledger/lib/policy.mjs`; `emptyLedger`, `prune` from `tools/work-ledger/lib/store.mjs`.
- Produces:
  - `classifyTransientOutage(errOrEvent) -> { transient: boolean, code: string }`
  - `detectAwayMode({ cwd, data, sessionId }) -> { active: boolean, planPath: string | null, progressPath: string | null }`
  - `buildReconcilePrompt({ planPath, progressPath, attempt, maxAttempts, lastHeadSha, code }) -> string`
  - `planOutageResume(data, ctx) -> { resume: boolean, deduplicated?: boolean, reason?: string, code: string, attempt: number, maxAttempts: number, delaySec: number | null, status: string, prompt: string | null, record: object | null }`
  - `markOutagePromptSent(data, sessionId, now) -> object | null`
  - `recordOutageProgress(data, { sessionId, headSha, now }) -> boolean`
  - `progressFingerprint(data) -> number`

- [x] **Step 1: Write the failing unit tests in `tools/work-ledger/outage-resume.test.mjs`**

Cover `T-WL5-3`, `T-WL5-4`, `T-WL5-5` (prompt content), and Review Focus items 1 and 2:
1. `classifyTransientOutage` returns `{ transient: true }` for HTTP `429`, `502`, `503`, `504`, `overloaded_error`, `rate_limit_error`, `ETIMEDOUT`, `ECONNRESET`, `EAI_AGAIN`, `UND_ERR_SOCKET`, `socket hang up`, and `upstream stream disconnected`.
2. `classifyTransientOutage` returns `{ transient: false }` for HTTP `400`, `401`, `403`, `404`, `422`, `context_length_exceeded` / `"prompt is too long"`, `[work-ledger]` guard denials, `AbortError` / user cancellation, port numbers like `"connect localhost:5020 refused"`, PR references like `"PR #503 failed tests"`, and `null`/`{}`.
3. When `away mode` is inactive (no active `.superpowers/sdd/<plan>/progress.md` and no active `away_mode` note in `data`), `planOutageResume` returns `{ resume: false, reason: "away_mode_inactive" }` without creating a retry schedule.
4. When `away mode` is active via `.superpowers/sdd/demo/progress.md` (or `away_mode` ledger note), three consecutive transient outages (with `markOutagePromptSent` between turns) return `delaySec` `30`, `120`, `300`, `attemptsUsed` `1`, `2`, `3`, and `status: "retrying"`, and the 4th outage returns `{ resume: false, reason: "retry_cap_exhausted", status: "exhausted", delaySec: null }`.
5. A duplicate error event arriving while `status === "retrying"` (before `markOutagePromptSent`) returns `{ resume: false, deduplicated: true }` without advancing `attemptsUsed`.
6. `recordOutageProgress` leaves `attemptsUsed` unchanged when neither `headSha` nor ledger progress changed, and resets `attemptsUsed = 0` (`status: "idle"`) once `headSha` advances or a new validation/`work_ledger_record` entry is added after the outage.
7. `buildReconcilePrompt` instructs the session to inspect the plan file, `.superpowers/sdd/<plan>/progress.md`, `git status`, `git log -n 5`, and `work_ledger_get` before running any command so completed commits, pushes, or pull requests are never duplicated.

- [x] **Step 2: Run `outage-resume.test.mjs` to verify it fails**

Run: `node --test tools/work-ledger/outage-resume.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./lib/outage-resume.mjs`.

- [x] **Step 3: Implement `lib/outage-resume.mjs` and `outageRecovery` store persistence**

1. Update `tools/work-ledger/lib/store.mjs`:
   - Add `outageRecovery: {}` to `emptyLedger()` and normalize `d.outageRecovery ||= {}` in `read()`.
   - In `prune(data, now)`, delete `data.outageRecovery[id]` entries whose `lastOutageAt` is older than 14 days (`12096e5` ms).
2. Create `tools/work-ledger/lib/outage-resume.mjs` implementing `classifyTransientOutage`, `detectAwayMode`, `buildReconcilePrompt`, `progressFingerprint`, `planOutageResume`, `markOutagePromptSent`, and `recordOutageProgress`:
   - Check explicit non-transient exclusions (`AbortError`/cancel, `[work-ledger]` guard denial, context-length overflow, HTTP `400`/`401`/`403`/`404`/`422`) before matching transient HTTP codes (`\b(?:HTTP(?:\/[0-9.]+)?\s*|status(?:\s+code)?[:=\s]+)(429|502|503|504)\b`) or transient error codes/messages.
   - Store `{ sessionId, planPath, progressPath, attemptsUsed, lastHeadSha, lastProgressSeq, lastOutageAt, status, lastErrorCode, nextDelaySec, pendingPrompt }` under `data.outageRecovery[sessionId]`.

- [x] **Step 4: Run `outage-resume.test.mjs` to verify it passes**

Run: `node --test tools/work-ledger/outage-resume.test.mjs`
Expected: PASS (`0` failures).

- [x] **Step 5: Commit Task 2**

```bash
git add tools/work-ledger/lib/store.mjs tools/work-ledger/lib/outage-resume.mjs tools/work-ledger/outage-resume.test.mjs
git commit -m "feat(work-ledger): add transient outage classifier and away-mode planner"
```

---

### Task 3: Wire Preferences and Bounded Outage Recovery into `extension.mjs`

**Files:**
- Modify: `tools/work-ledger/extension.mjs`
- Modify: `tools/work-ledger/fixtures/sdk-loader.mjs`
- Create: `tools/work-ledger/outage-runtime.test.mjs`

**Interfaces:**
- Consumes: `resolveDataDir`, `loadPreferences` from `./lib/preferences.mjs`; `planOutageResume`, `markOutagePromptSent`, `recordOutageProgress` from `./lib/outage-resume.mjs`.
- Produces:
  - Startup `configWarnings` logged to `ledger.error(...)` (`errors.log`) and `session.log(..., { level: "warning" })`.
  - `Config: digest=<12hex>, defaultRepo=<repo|git-remote>` line in `work_ledger_get` global output, plus clear missing-repo errors in `work_ledger_get({ pr })` and `work_ledger_record({ pr })` when `repo` cannot be resolved.
  - `.unref()` retry timer on `hooks.onErrorOccurred` and `session.on("session.error", ...)` calling `session.send({ prompt })`, `onSessionStart` fallback hydration when `status === "retrying"`, progress reset on `session.idle` / `onPostToolUse` / `work_ledger_record`, and timer cleanup on `SIGTERM`, `SIGINT`, `exit`, `onSessionEnd`, and direct owner messages.

- [x] **Step 1: Write the failing runtime integration test in `tools/work-ledger/outage-runtime.test.mjs` and extend `fixtures/sdk-loader.mjs`**

Extend `tools/work-ledger/fixtures/sdk-loader.mjs` backward-compatibly so `ledgerTestHost` records `sentPrompts` and exposes `session.send` and `nextPrompt()`. Write `tools/work-ledger/outage-runtime.test.mjs` using isolated `fs.mkdtempSync` directories to test:
1. Malformed `<dataDir>/config.json` (`reviewCap: -5`, `defaultRepo: "bad string"`, `outageRetryCap: 99`) logs warnings to `errors.log` and `session.log`, exposes `Config: digest=<12hex>, defaultRepo=git-remote` in `work_ledger_get`, refuses repo-less `work_ledger_record({ pr: 7, action: "opened" })` without writing `null#7`, and still denies `git push --force origin main`.
2. Active `.superpowers/sdd/m5/progress.md` + `outageBackoffSec: [1, 1, 1]` + `onErrorOccurred({ error: "HTTP 503 Service Unavailable", errorContext: "model_call" })` + simultaneous `session.error` event schedules exactly 1 retry (`attemptsUsed: 1`), delivers the reconciliation prompt via `session.send({ prompt })`, resets `attemptsUsed` to `0` after a new Git commit + `session.idle`, and halts `"exhausted"` after `outageRetryCap` unrecovered failures.
3. Reloading `extension.mjs` while `ledger.json` has `status: "retrying"` injects the reconciliation prompt in `onSessionStart().additionalContext` and transitions `status` to `"resumed"`.
4. Sending `SIGTERM` while a `300s` `.unref()` retry timer is armed clears the timer and exits immediately (`< 3s`) with status `0`.

- [x] **Step 2: Run `outage-runtime.test.mjs` to verify it fails**

Run: `node --test tools/work-ledger/outage-runtime.test.mjs`
Expected: FAIL because `extension.mjs` does not yet wire `loadPreferences`, `Config: digest=`, or `onErrorOccurred` outage recovery.

- [x] **Step 3: Implement wiring in `tools/work-ledger/extension.mjs`**

1. Replace raw `readJson` config assembly with `resolveDataDir` and `loadPreferences({ dataDir: DATA_DIR, extDir: EXT_DIR })`; write any `bootstrapWarnings` + `configWarnings` to `ledger.error(...)` and `session.log("[work-ledger] ...", { level: "warning" })`.
2. Guard `if (config.debug && config.defaultRepo)` before calling `lookups.prHead(config.defaultRepo, 1)`.
3. In `work_ledger_get`, append `Config: digest=${configDigest}, defaultRepo=${config.defaultRepo || "git-remote"}` to global status; if `pr` is passed and `!r`, return `Cannot resolve a GitHub repository for #${pr}. Pass repo: "owner/repo".`. In `work_ledger_record`, if `pr` is passed and `!r`, return `Cannot record #${pr} without a GitHub repository. Pass repo: "owner/repo".`.
4. Add `handleSessionOutage(rawErr, workingDir)`:
   - Resolve `headSha = await lookups.gitHead(dir)` and run `ledger.update((data) => planOutageResume(data, { sessionId: sid(), cwd: dir, error: rawErr, headSha, config, now: Date.now() }))`.
   - When `decision.resume` is `true`, clear any prior timer for `sid()`, schedule `const timer = setTimeout(...)` for `decision.delaySec * 1000` ms, call `timer.unref?.()`, and inside the timer mark `markOutagePromptSent` and call `await session.send({ prompt: decision.prompt })` (catching transport errors into `ledger.error` while reverting `status` to `"retrying"` if `session.send` throws so `onSessionStart` fallback can still deliver it).
   - Register `onErrorOccurred` in `hooks`, `session.on("session.error", ...)`, `onSessionEnd`, `session.on("session.idle", ...)` (calling `checkOutageProgress`), and `process.once("SIGTERM" / "SIGINT" / "exit")` cleanup that clears all armed timers and calls `process.exit(0)` cleanly on `SIGTERM`/`SIGINT` when running standalone.
   - Clear armed timers when a direct user message arrives in `user.message` / `onUserPromptSubmitted` if the owner ends `away mode` (`/\bi'?m back\b/i`) or sends a manual prompt.
   - In `onSessionStart`, if `data.outageRecovery?.[sid()]?.status === "retrying"` and no timer is armed in this process, append the saved `pendingPrompt` to `additionalContext` and call `markOutagePromptSent`.

- [x] **Step 4: Run `outage-runtime.test.mjs` and `guard-runtime.test.mjs`**

Run: `node --test tools/work-ledger/outage-runtime.test.mjs tools/work-ledger/guard-runtime.test.mjs`
Expected: PASS (`0` failures).

- [x] **Step 5: Run independent subagent review on Task 3 (`core.mdc` Rule 7 risky area) and commit**

Dispatch `code-review` / `rubber-duck` subagent on the runtime changes (`policy.mjs`, `preferences.mjs`, `grants.mjs`, `store.mjs`, `outage-resume.mjs`, `extension.mjs`), fix any confirmed issues, re-run tests, and commit:

```bash
git add tools/work-ledger/extension.mjs tools/work-ledger/fixtures/sdk-loader.mjs tools/work-ledger/outage-runtime.test.mjs
git commit -m "feat(work-ledger): wire preference digest and away-mode outage resume"
```

---

### Task 4: Pin `PREVIOUS.sha256`, Update Installer & Docs, and Regenerate `SOURCE.sha256` + `PACKAGE.sha256`

**Files:**
- Modify: `tools/work-ledger/PREVIOUS.sha256`
- Modify: `tools/work-ledger/owner-install.mjs:10-12`
- Modify: `tools/work-ledger/owner-install.test.mjs:148-162`
- Modify: `tools/work-ledger/README.md`
- Modify: `tools/work-ledger/INSTALL.md`
- Modify: `CHANGELOG.md`
- Modify: `tools/work-ledger/SOURCE.sha256`
- Modify: `tools/work-ledger/PACKAGE.sha256`

**Interfaces:**
- Consumes: Pre-PR-5 `SOURCE.sha256` (`68af23bda605a8f0d2cf844fbf9d87d2c9fe67d06ba989fb8d86fcfc7c0eedaa`), frozen `BASELINE.sha256`, and all 13 runtime `.mjs` files.
- Produces: Updated `owner-install.mjs` (`runtime` with 13 files), updated `PREVIOUS.sha256`, updated `README.md` / `INSTALL.md` / `CHANGELOG.md`, and fresh `SOURCE.sha256` + `PACKAGE.sha256`.

- [x] **Step 1: Add the failing 11-to-13 file upgrade and `PREVIOUS.sha256` hash assertions in `tools/work-ledger/owner-install.test.mjs`**

Update the expected `PREVIOUS.sha256` SHA-256 assertion in `tools/work-ledger/owner-install.test.mjs` to `"68af23bda605a8f0d2cf844fbf9d87d2c9fe67d06ba989fb8d86fcfc7c0eedaa"` (the PR `#41` / pre-PR-5 `SOURCE.sha256`), and add a test constructing a read-only (`0o555` dirs, `0o444` files) 11-file installation matching `PREVIOUS.sha256` (without `lib/outage-resume.mjs` and `lib/preferences.mjs`) and verifying `prepareInstallation(..., { apply: true })` upgrades it cleanly to all 13 runtime files.

- [x] **Step 2: Run `owner-install.test.mjs` and `package.test.mjs` to verify they fail before manifest updates**

Run: `node --test tools/work-ledger/owner-install.test.mjs tools/work-ledger/package.test.mjs`
Expected: FAIL on `PREVIOUS.sha256` hash and missing `"outage-resume"` / `"preferences"` entries in `owner-install.mjs` and `SOURCE.sha256`.

- [x] **Step 3: Update `PREVIOUS.sha256`, `owner-install.mjs`, `README.md`, `INSTALL.md`, `CHANGELOG.md`, `SOURCE.sha256`, and `PACKAGE.sha256`**

1. Copy the pre-edit `SOURCE.sha256` (`git show HEAD~3:tools/work-ledger/SOURCE.sha256` / `main:tools/work-ledger/SOURCE.sha256`) verbatim to `tools/work-ledger/PREVIOUS.sha256` and confirm its SHA-256 is `68af23bda605a8f0d2cf844fbf9d87d2c9fe67d06ba989fb8d86fcfc7c0eedaa`. Do NOT touch `BASELINE.sha256`.
2. Update `tools/work-ledger/owner-install.mjs` `const runtime` to include `"outage-resume"` and `"preferences"` in alphabetical order (`13` files total).
3. Update `tools/work-ledger/INSTALL.md` (`thirteen runtime files` and externalized `config.json` options), `tools/work-ledger/README.md` (`defaultRepo: null`, validated `config.json` schema + `Config:` digest, bounded `away mode` outage recovery), and `CHANGELOG.md` (`## Unreleased tooling (2026-11-16)` entry with evidence and check commands, keeping the 5 plugin manifests untouched).
4. From `tools/work-ledger/`, regenerate `SOURCE.sha256` FIRST and `PACKAGE.sha256` SECOND in exact spec order:
   ```bash
   (cd tools/work-ledger && shasum -a 256 extension.mjs lib/*.mjs > SOURCE.sha256 && shasum -a 256 extension.mjs lib/*.mjs owner-install.mjs BASELINE.sha256 PREVIOUS.sha256 SOURCE.sha256 INSTALL.md README.md fixtures/real-host-acceptance.py > PACKAGE.sha256)
   ```

- [x] **Step 4: Run `baseline.test.mjs`, `package.test.mjs`, `owner-install.test.mjs`, and `node scripts/check.mjs`**

Run: `node --test tools/work-ledger/baseline.test.mjs tools/work-ledger/package.test.mjs tools/work-ledger/owner-install.test.mjs && node scripts/check.mjs`
Expected: PASS (`0` failures, `check: no faults`).

- [x] **Step 5: Run independent subagent review on Task 4 (`owner-install.mjs` + manifests) and commit**

Dispatch `code-review` subagent on Task 4 installer/manifest/doc changes, resolve any confirmed findings (regenerating `SOURCE.sha256` and `PACKAGE.sha256` if any packaged file changed), and commit:

```bash
git add tools/work-ledger/PREVIOUS.sha256 tools/work-ledger/owner-install.mjs tools/work-ledger/owner-install.test.mjs tools/work-ledger/README.md tools/work-ledger/INSTALL.md tools/work-ledger/SOURCE.sha256 tools/work-ledger/PACKAGE.sha256 CHANGELOG.md
git commit -m "feat(work-ledger): update installer manifests and docs for M5"
```

---

### Task 5: Full Verification, Real-Host Acceptance, Complete-Diff Review, PR, and Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-11-16-work-ledger-preferences-outage-m5.md` (status updates)

**Interfaces:**
- Consumes: All PR 5 commits on `divydvd-work-ledger-config-outage-m5`.
- Produces: Verified PR against `main`, `work_ledger_record` entries (`opened`, `validated`, `review_clean`), green CI + Copilot review check, and handoff message to coordinator `a97500cf-c2ac-48ad-a87f-25e566f01c3e`.

- [x] **Step 1: Run full `work-ledger` test suite, real-host acceptance, and repo-wide CI suites**

Run:
```bash
node --test tools/work-ledger/*.test.mjs && python3 tools/work-ledger/fixtures/real-host-acceptance.py && node scripts/check.mjs && node --test scripts/*.test.mjs
```
Expected: All suites exit `0`; `real-host-acceptance.py` exits `0` in an isolated temp home with `survivors_after_exit === []`.

- [x] **Step 2: Verify zero-diff invariants**

Run:
```bash
git --no-pager diff main -- com.github.copilot/rules/core.mdc GEMINI.md tools/work-ledger/BASELINE.sha256 plugin.json .github/plugin/marketplace.json .claude-plugin/plugin.json .claude-plugin/marketplace.json gemini-extension.json
```
Expected: Empty output (`0` diff lines).

- [x] **Step 3: Run independent full-diff review (`core.mdc` Rule 23)**

Dispatch an independent `code-review` subagent across `main...HEAD`. Fix any confirmed defect, re-regenerate `SOURCE.sha256` + `PACKAGE.sha256` if needed, and re-run Step 1.

- [ ] **Step 4: Push branch, open PR against `main` using the `dev-loop` PR template, and record `work_ledger_record`**

Push `divydvd-work-ledger-config-outage-m5`, open the PR against `main` with ASD-STE100 summary, evidence, and the 3 `Dev-loop feedback` lines, check GitHub Actions `check` and `copilot-pull-request-reviewer`, and record `work_ledger_record` (`opened`, `validated`, `review_clean`) at final `HEAD`.

- [ ] **Step 5: Send handoff summary to coordinator `a97500cf-c2ac-48ad-a87f-25e566f01c3e`**

Use `send_session_message` to report the PR number/URL, final `HEAD` SHA, test evidence, and independent review coverage back to coordinator session `a97500cf-c2ac-48ad-a87f-25e566f01c3e`.

## Conclusion
This plan implements Milestone M5 (PR 5) in five testable tasks while keeping `core.mdc`, `GEMINI.md`, `BASELINE.sha256`, the 5 plugin manifests, and the live `~/.copilot` directory untouched.
The owner already approved the feature design, the `.unref()` timer plus `onSessionStart` fallback mechanism, and the risky-area plan via coordinator session `a97500cf-c2ac-48ad-a87f-25e566f01c3e`, so no extra stop is needed before execution.
The main risk is leaving a background retry timer alive across CLI teardown or breaking read-only upgrade hashes, which Tasks 3, 4, and 5 test directly via `outage-runtime.test.mjs`, `owner-install.test.mjs`, and `real-host-acceptance.py`.

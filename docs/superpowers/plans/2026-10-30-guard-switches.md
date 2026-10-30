# Individual guard switches

## Acceptance record
- **Goal:** Let the owner pause one guard for one repository without disabling unrelated guards.
- **Done when:**
  - [ ] Maintained source exists in `tools/work-ledger/`, separate from the plugin runtime.
  - [ ] Direct owner commands pause and restore each supported guard.
  - [ ] A pause defaults to the current repository and expires after 30 minutes.
  - [ ] Other repositories and unrelated guards retain enforcement.
  - [ ] Status shows effective state, scope, expiry, and overlapping pauses.
  - [ ] Agent messages, quoted text, and forwarded requests cannot create pauses.
  - [ ] Isolated runtime tests cover commands, persistence, expiry, and enforcement.
  - [ ] The PR documents installation limits without claiming a live correction.
- **Required evidence:** `node scripts/check.mjs`; Node tests for the maintained extension; isolated runtime acceptance. No device test: no app changes.
- **Size estimate:** Source import: 2,024 existing production lines. Switch implementation: about 300–380 new or changed production lines. Tests and docs are separate.
- **Size exception requested:** One source-only baseline PR above 400 lines, followed by one switch PR below 400 lines. Do not execute this exception without owner approval.
- **Out of scope:** Live installation, guard shutdown, deployment, merge, device-monitor changes, and treating a pause as action approval.
- **Risky area:** Approval controls and guard enforcement. Owner plan review is required.
- **Stop conditions:** Stop for missing source provenance, unresolved repository identity, failed runtime integration, three failed fixes, or missing installation authorization.

> **For agentic workers:** Use `executing-plans`. Implement each risky task only after owner plan review. Get one independent review for each risky task.

**Architecture:** Keep the SDK extension separate from the Copilot plugin. Store individual pauses in the shared ledger. Evaluate their scope and expiry at each policy decision.

**Tech stack:** Existing JavaScript ES modules, Node built-ins, and the extension's existing SDK host.

**Spec:** The owner approved temporary repository-scoped switches in this conversation. The owner also approved `tools/work-ledger/` as the maintained source location.

## Abstract

The global switch disables more protection than a blocked task needs. Individual switches will provide a narrow recovery path with automatic restoration.

## Approved behavior and proposed details

The owner approved this plan and the source-only size exception on 2026-10-30.
The owner then approved these refinements and directed implementation:

- Support repository or session scope. Keep the default repository scope and 30-minute expiry.
- Require a separate direct owner confirmation that names the proposed change.
- Record the selected check, scope, expiry, and confirmation provenance.
- Keep the shared build lock enabled. It is not an individual switch.
- Do not use a blanket deployment pause to bypass the Maven false positive.
- Match any Maven exception narrowly to reviewed local-only publication. Genuine deployment protections remain active.
- Fix deployment classification in a separate change.
- Prepare tested source for owner installation. Never modify the live guard.
- Final owner scope decision: keep merge and real deployment approval mandatory. These gates and the shared build lock are not configurable.

These refinements supersede conflicting details in the original proposal below.
In particular, `gradle-lane` is not configurable, and the original broad `deploy` examples are not an approved Maven recovery mechanism.
The confirmation flow previews a pending switch before activation; the request alone does not pause enforcement.
Each confirmed session pause also records its repository, so changing repositories cannot carry the exception elsewhere.

### Partial controls layer

The bounded controls layer exposes `rebase`, `amend`, `force-push`, `push-main`, `review-limit`, and `test-cache`.
Requests use `guard <check> off [in repository|session] [for 30m]` or `guard <check> on [in repository|session]`.
A request previews the full change and supplies an exact, separate confirmation command.
Confirmation binds the random token, check, state, scope, repository, session, and absolute expiry.
Repository scope and 30 minutes remain the defaults.
`guards status` reports supported switches separately from non-configurable protections.

This layer is partial acceptance, not completion of the owner's per-guard request.
At the controls-layer handoff, reviewed local-only Maven recovery, an owner installer, and real disposable SDK host acceptance remained outstanding.
The dependent Maven layer now implements reviewed local-only recovery in maintained source.
Owner installation and real disposable SDK acceptance remain outstanding.
Merge and real deployment approval remain mandatory, not future switches.
The loader-based startup/reload tests establish the extension contract only, not a real host.
Unverified Maven remains blocked. No live guard installation or modification is authorized.

The following command grammar is a historical design sketch, not an installed interface.
The final owner decision rejects its deployment switches and blanket deployment pauses.

| Command | Proposed effect |
| --- | --- |
| `guard deploy off` | Pause deployment enforcement for this repository for 30 minutes. |
| `guard deploy off for 30m` | Pause it for the named duration in this repository. |
| `guard deploy on` | Remove this repository's deployment pause. |
| `guard deploy off globally for 30m` | Explicitly pause it across repositories for the named duration. |
| `guard deploy off permanently` | Explicitly pause it in this repository without expiry. |
| `guard deploy off globally permanently` | Explicitly pause it globally without expiry. |
| `guards status` | Show effective states, scope, and remaining time. |

These are proposed commands, not installed commands. Existing `guards off` and `guards on` retain their current global meaning.

Provide separate names for `merge`, `rebase`, `amend`, `force-push`, `push-main`, `review-limit`, and `test-cache`.
Treat deployment targets separately and preserve genuine deployment approval checks during local-Maven recovery.
Inventory all actual blocking paths before finalizing this list. Report missing categories before implementation.
Keep guard-source protection outside these repository-scoped switches. Its existing owner-controlled maintenance path remains separate.

Use durations from one minute through 24 hours, with `m` and `h` units.
Reject malformed commands and unknown names with a clear error and no state change.
Resolve repository identity through Git and the configured repository identity, not the current directory name.
Different worktrees for one repository share its pause. An unresolved identity cannot create a repository pause.
Check the action's repository, not just the session's repository.
For compound commands, check every finding separately. A paused finding cannot suppress a different active guard.
Remove expired entries from effective state without requiring a background timer.

Store pauses under a new `guardPauses` ledger field with guard, repository/global scope, created time, expiry, and owner-session provenance.
Use the existing locked atomic ledger update. Do not store these pauses in the global `DISABLED` file.
Do not delete approvals or evidence when a pause changes.
Expose pauses in status and in the extension's existing ledger read tool.
Record switch changes in history.
An active global pause still applies after a repository pause is removed. Status must explain this overlap.
Existing `guards on` removes the legacy global disable only; it reports individual pauses that remain active.

A switch changes enforcement, not the owner's standing instructions.
It does not authorize an agent to merge, deploy, rewrite history, or change protected files.
No switch creates a deployment grant.
The phone monitor is a separate system and is not controlled by these commands.

## Source evidence

- Installed `extension.mjs:166-189` handles owner messages and the current global switch.
- Installed `lib/store.mjs:17-34` stores the global `DISABLED` flag.
- Installed `lib/store.mjs:64-79` supplies locked ledger updates.
- Installed `lib/policy.mjs:270-337` contains direct tool blocks, classified blocks, and the Gradle lane.
- `README.md` describes this repository as a plugin, not the installed SDK extension.
- Issue #11 preserves the original defects and the approved switch design.

The installed files are evidence only. Do not edit them or read live ledger data into repository fixtures.

## Review focus

1. A session operates on another repository: its own pause must not apply.
2. A compound command triggers two guards: only the selected guard is paused.
3. Expiry occurs during another session: its next action must see enforcement restored.
4. A quoted or forwarded command names a switch: no state changes.
5. A global pause overlaps a repository pause: status must show the effective result.

## Task 1: Preserve the unchanged baseline

**Files:** `tools/work-ledger/extension.mjs`, its eight existing `lib/*.mjs` files, a baseline checksum manifest, tests, and `tools/work-ledger/README.md`.

- [x] Confirm the owner approved the source-only size exception.
- [x] Copy the nine source files byte-for-byte. Exclude configuration, credentials, ledger data, and session paths.
- [x] Verify all nine files against the read-only installation hashes.
- [x] Add baseline smoke tests for public pure helpers without invoking the live host.
- [x] Document the SDK requirement and a disposable-home test procedure.
- [x] Run `node scripts/check.mjs` and the baseline Node tests.
- [x] Get an independent review of provenance, completeness, and runtime isolation.
- [ ] Commit, verify, and open the source-only PR. Do not install or merge it.

The baseline intentionally preserves existing defects. It is not a corrected release.

## Task 2: Implement individual switches

**Files:** Add `tools/work-ledger/lib/guard-switches.mjs` and its tests. Modify `lib/grants.mjs`, `lib/store.mjs`, `lib/policy.mjs`, and `extension.mjs` only as needed.

**Interfaces:** Export `parseGuardCommand(text)`, `applyGuardCommand(data, command, context)`, and `effectiveGuardState(data, guard, repo, now)`.
The parser returns a command or a specific validation error. Owner provenance is checked before application.
Context includes resolved repository identity, owner session, and an injectable clock.
Extend existing ledger status rather than adding a second status system.

- [ ] Write failing parser, owner-provenance, state, expiry, and repository-isolation tests.
- [ ] Cover every supported guard, direct tool paths, compound findings, and Gradle wrapper behavior.
- [ ] Cover malformed durations, missing identity, global overlap, and legacy controls.
- [ ] Run the new tests and confirm that failures come from missing switch behavior.
- [ ] Implement the helper and integrate it at each guard decision.
- [ ] Keep logging and evidence capture active while the selected enforcement is paused.
- [ ] Run all extension tests and `node scripts/check.mjs`.
- [ ] Review independently and fix confirmed findings before the next task.

Keep the switch PR below 400 changed production lines. If the measured size exceeds this estimate, split the implementation before pushing.

## Task 3: Verify the runtime and document the handoff

**Files:** Add isolated host acceptance tests. Update the tool README, root README, and CHANGELOG.

- [ ] Use a disposable home and ledger. Do not load active protection or copy live configuration.
- [ ] Prove direct owner command handling through the host boundary, including first-message behavior.
- [ ] Prove that agent messages and forwarded text do not change state.
- [ ] Prove two host instances see the same pause and its expiry.
- [ ] Capture status before pause, during pause, after restoration, and with overlapping scopes.
- [ ] Verify the actual SDK startup/reload procedure. If unavailable, report the exact blocker.
- [ ] Get an independent integration review.
- [ ] Commit and rerun checks at the head SHA.
- [ ] Open the switch PR with evidence and installation limits.

The owner approved dependent PRs. Use this sequence: baseline, classification correction, scoped controls.
The baseline uses this session's `divydvd-agent-stall-diagnosis` branch and targets `main`.
The classification layer uses `guard-publication-classification` on the baseline branch.
The controls layer uses `scoped-guard-controls` on the classification branch.
The app applies configured branch prefixes when creating the higher layers.
Use app-native sessions for the dependent layer. Do not rebase or force push.
Use the default branch for the baseline PR.
Do not bump the plugin version unless its shipped plugin behavior changes.

## Separate corrective work

These switches do not repair the classification, cache identity, or approval-scope defects in issue #11.
Fix Maven/Firebase/Play classification in its own dependent PR after the maintained baseline exists.
Reuse the saved regressions. Keep unrelated cache and approval-scope changes separate.
Do not install the earlier candidate implicitly: it has different source and integrity pins.
Live installation requires a separate owner-controlled step and an active-runtime acceptance check.

## Execution ledger

- Design: approved.
- Source location: approved.
- Risky plan and baseline size exception: approved on 2026-10-30.
- Refined scope: approved by "Proceed" after the owner requested session scope, confirmation, genuine deployment protection, and an unchanged build lock.
- Ruling: preserve existing files with a byte-for-byte copy rather than a handwritten patch. Hash verification proves the baseline has no accidental edits.
- Source import: nine files preserved unchanged; all original hashes verified.
- Baseline checks: six new helper/integrity tests and eleven existing tests passed. `node scripts/check.mjs` reported no faults.
- Baseline pre-import check: missing manifest assertion and missing-module errors, as expected before preserving the source. This is source preservation, not a behavior implementation.
- Baseline review: independent read-only review found no significant issue in `67b7c4b..f577899`.
- Review boundary: live SDK startup, future controls, and pre-existing defects are not validated by this baseline.
- Provenance evidence: separately read installed hashes matched all nine imported files. The reviewer checked the recorded manifest; it did not independently establish installation history.
- Switch implementation: not started.
- Active installation: unchanged.

## Conclusion

Review this plan before implementation because it changes approval controls. The main risks are incorrect repository identity, stale pauses, and an unverified runtime reload.

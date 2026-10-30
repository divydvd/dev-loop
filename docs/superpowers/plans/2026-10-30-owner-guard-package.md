# Owner guard installation package

## Acceptance record
- **Goal:** Prepare a pinned, owner-run installation and rollback package without touching the live guard.
- **Done when:** Preview makes no installation changes; explicit confirmation binds reviewed inputs; backup preserves the whole installation.
- **Done when:** Configuration and existing scopes survive; unsupported source, symlinks, drift, and ambiguous scopes fail explicitly.
- **Done when:** Failure recovery and rollback pass isolated tests; actual SDK-host evidence is distinct from transport simulation.
- **Required evidence:** Plugin check; complete work-ledger, device-handoff, and branch-maintenance Node tests; independent review; isolated host attempts.
- **Size estimate:** 320–390 production lines. Tests, documentation, and acceptance scripts are separate.
- **Stop conditions:** Missing provenance, unsafe installation, three failed fixes, or unsupported real-host startup after distinct safe attempts.
- **Base:** `divydvd-verified-local-maven-exception`, initially `2c1772af440456bf2cfb3dac9704e943e613da81` (#15).
- **Updated base decision:** The package PR targets `divydvd-canonical-protected-maven-paths` above #15,
  at `0aee657a4dfd46ede37d3e72a7b818db1c0ff485`.
  The coordinator supplied this exact pushed parent. Do not select another base without an explicit decision.
- **Risk:** Installer replacement of approval enforcement. The approved stack and explicit assignment authorize preparation, not installation.

## Abstract
The maintained guard needs an owner-controlled installation path.
This layer binds reviewed source, configuration additions, and the complete installed tree to separate integrity pins.
It preserves the original installation outside extension discovery and supplies a checked rollback.

**Architecture:** A built-in-only installer verifies inputs before importing privately staged, verified helper bytes.
An independent full-tree snapshot detects changes to configuration and unrelated files, not only historical runtime code.
Supported installed runtime code must match the archival baseline or this release; unknown runtime changes require separate review.

**Spec:** The approved guard-switches plan, the local-Maven plan, and this layer's direct assignment.
Merge and real deployment approval remain mandatory by explicit owner decision.
The shared build lock and source protection remain active.

## Global constraints
- Work only in this checkout. Do not modify the live extension, configuration, ledger, or sessions.
- Keep `BASELINE.sha256` archival. Keep runtime identity in `SOURCE.sha256`.
- Do not embed owner paths or historical scope data in tracked files.
- Preserve configuration bytes when no scopes are added. Add scopes only from independently pinned input.
- Do not replace existing scopes, including equivalent duplicates. Reject ambiguous descriptor keys.
- Installation and rollback require owner confirmation and stopped-host attestation.
- PR approval does not grant installation permission.

## Review focus
- Changed candidate helpers must not execute before integrity validation.
- Unknown installed files and configuration must survive installation and rollback.
- Symlinks and overlapping staging paths must not redirect writes or create discoverable backup extensions.
- Concurrent edits and failed renames must preserve an identifiable recoverable original.
- CLI host proof must not imply desktop reload proof or include a model request.

## Task 1: Installation transaction and acceptance
**Files:** `tools/work-ledger/owner-install.mjs`, `owner-install.test.mjs`, `INSTALL.md`, README, CHANGELOG.
**Interfaces:** Export `installationSnapshot(directory)`, `prepareInstallation(request, options)`, and `rollbackInstallation(receipt, options)`.
The request pins candidate release manifest, complete installed snapshot, optional descriptor file, and explicit paths.
The CLI pins the request or rollback receipt itself with SHA-256.

- [x] Write failing tests for preview, explicit confirmation, complete backup, scope validation, and all listed failure cases.
- [x] Run `node --test tools/work-ledger/owner-install.test.mjs`; confirm missing installer behavior.
- [x] Implement a private stage outside discovery, reviewed code overlay, scope additions, drift rechecks, and reversible renames.
- [x] Run the installer tests; expect all pass.
- [x] Establish actual CLI/SDK lifecycle using only disposable state and no inference.
- [x] Get independent review of the transaction.
- [x] Fix confirmed findings with regressions.
- [x] Document exact owner commands, source identity, recovery paths, and host limits.

## Task 2: Final integration and PR
**Consumes:** The installer and lifecycle evidence from task 1.
**Produces:** An open PR against the selected parent and exact head evidence.

- [x] Incorporate relayed parent updates with a merge, never a rebase.
- [x] Commit and run `node scripts/check.mjs`.
- [x] Run `node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs`.
- [x] Push once and open the stacked PR. Observe checks and automatic review.
- [ ] Report source SHA, manifest identity, simulation versus actual-host evidence, owner-only steps, and blockers.

## Authorized follow-up: read-only configuration

The owner approved one additional bounded fix-and-review cycle on #17 after both normal correction rounds.
The scope is the confirmed read-only configuration failure, with permission preservation.
No live installation or further correction cycle is authorized.

- Preserve the copied configuration without rewriting it when there are no descriptor additions.
- Stage approved additions in a separate private file and preserve the original permission bits.
- Verify non-root preview, installation, and rollback with modes `0400`, `0444`, and `04400`.
- Retain overlay drift and failure recovery checks.
- Rerun the required Node suites, manifest checks, and both actual CLI/SDK layouts at the pushed commit.
- Read the final automatic review. Report any new confirmed finding without another push.

## Authorized follow-up: shared staged-write permissions

The owner approved one bounded root permission cycle after review `5712261733`.
The non-root reproduction confirms that preview accepts a runtime module with mode `0400`, but installation fails with `EACCES`.
The active installation remains unchanged.

- **Goal:** Use one approved-write path for configuration and runtime files, including private read-only directories.
- **Done when:** Files with modes `0400` and `0444` install and roll back without changing their pinned permissions.
- **Done when:** Nested directories with modes `0500` and `0555` retain their exact permissions.
- **Done when:** Preview explicitly refuses unsupported read-only installation roots without changing their permissions.
- **Required evidence:** Non-root regressions, executable/special mode preservation, injected failures, independent review, required suites, and both actual hosts.
- **Size estimate:** Fewer than 390 production lines for the complete installer.
- **Stop conditions:** Report new confirmed findings after this cycle without another source push.

Replace approved files from private exclusive files, rather than rewriting copied read-only files.
Grant temporary owner write access only to required private staging directories.
Check the full temporary tree before restoring pinned directory modes.
Check the final tree again before replacement.
Fail explicitly during preview for unreadable installation states.
Never change permissions in the active installation.
macOS and Linux reject cross-parent directory moves when the moved root is read-only.
A disposable filesystem probe confirms same-parent success and cross-parent `EACCES` at mode `0555`.
Linux CI independently confirms the cross-parent failure for the full read-only root matrix.
Preview therefore refuses read-only roots explicitly on all supported platforms.
The successful matrix retains a writable root and tests read-only files and nested directories.

## Authorized follow-up: portable root precondition

The owner selected "Approve the bounded correction push (Recommended)" after reviewing the Linux CI blocker.
This decision authorizes one bounded correction push, not installation or active permission changes.

- **Goal:** Reject unsupported read-only installation roots during preview on every supported platform.
- **Done when:** Root modes `0500`, `0555`, and `01500` fail without changing original bytes or modes.
- **Done when:** Read-only runtime/configuration files and nested directories still install and roll back exactly.
- **Required evidence:** Independent review, fresh package pins, both complete Node suites, both actual hosts, and final CI/review.
- **Size estimate:** Fewer than 360 production lines. No parent runtime change.
- **Stop conditions:** Report a new confirmed final finding without another source push.

## Conclusion
This layer prepares an installation package, not an installed correction.
The owner must separately review private pins, stop affected hosts, install, and verify a fresh host.
Desktop restart evidence remains owner-side unless a supported isolated host proves that path.

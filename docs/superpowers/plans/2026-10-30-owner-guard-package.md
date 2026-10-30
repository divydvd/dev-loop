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
- [ ] Commit and run `node scripts/check.mjs`.
- [ ] Run `node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs`.
- [ ] Push once and open the stacked PR. Observe checks and automatic review.
- [ ] Report source SHA, manifest identity, simulation versus actual-host evidence, owner-only steps, and blockers.

## Conclusion
This layer prepares an installation package, not an installed correction.
The owner must separately review private pins, stop affected hosts, install, and verify a fresh host.
Desktop restart evidence remains owner-side unless a supported isolated host proves that path.

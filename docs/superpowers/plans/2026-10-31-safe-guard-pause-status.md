# Safe guard pause and clear status

## Acceptance record

- **Goal:** Remove the OFF/ON build-lock loop and make owner-control state and confirmation clear.
- **Done when:**
  - [ ] Global OFF bypasses only the review-request limit and duplicate-test cache.
  - [ ] Global OFF preserves merge approval, deployment/configuration approval, history checks, source protection, and Maven verification.
  - [ ] Gradle still receives its shared lock wrapper while global OFF is active.
  - [ ] Existing separately confirmed scoped pauses retain their own rules and expiry.
  - [ ] Status and startup context identify the actual pause mode and retained protections.
  - [ ] Pending previews show the exact runtime-created confirmation and its deadline.
  - [ ] Expired, forwarded, quoted, and reused confirmations still cannot activate a pause.
  - [ ] Guard instructions require a visible ordinary reply containing the actual confirmation.
  - [ ] The owner installer can recognize the previously reviewed maintained runtime for a later upgrade.
  - [ ] Unknown installed source still fails, and backup/rollback safeguards remain unchanged.
  - [ ] The source PR is open with passing checks and independent review.
- **Required evidence:** `node scripts/check.mjs`; focused regression tests; the full existing work-ledger test suite; manifest checks.
  No device test: this repository has no app.
  Runtime tests use disposable homes and synthetic ledgers, not the owner's installation.
- **Size estimate:** Task 1: tests only. Task 2: about 150-250 changed production lines. Task 3: docs and manifests.
  Total production estimate: below 400 lines.
- **Out of scope:** Live installation, guard configuration changes, real approval changes, app-kit publication, Firebase access, app sessions, new switches, and plugin skill/core-rule changes.
- **Risky area:** Guard enforcement and approval boundaries; owner installer recognition of the previous reviewed release.
- **Stop conditions:**
  - Done: required evidence matches the final commit, the source PR is open, and review rounds stop.
  - Blocked: three failed fixes, missing access, unsafe compatibility assumptions, or a new owner policy decision.
  - Do not weaken a protection or expand publication trust to avoid a failure.

## Recovery acceptance (separate states after this PR)

This PR fixes the guard defects. The app-kit recovery needs these separate steps. Each step has its own evidence.
1. **Source PR:** this PR is open, with passing checks and review. It changes no live installation.
2. **Live installation:** the owner previews and confirms the installer separately. Evidence: installer receipt and `guards status` output.
3. **One blocker record:** the producer session records one current blocker with its exact cause. Old expired tokens are not reused.
4. **Visible fresh confirmation:** the producer requests a new Maven pause preview. The agent shows the exact runtime line in its normal reply. The owner types it directly before the deadline.
5. **Approval and scheduling checks:** `guards status` shows the confirmed scoped Maven pause, and the shared Gradle lock stays active.
6. **Local publication:** the verified descriptor command runs once at the pinned SHA. Evidence: exit code and published artifact paths.
7. **Positive consumer checks:** each consumer app resolves the published kit and builds. Evidence: the build commands and results.
Firebase project access (HTTP 500 and SDK 403) is a separate account problem. Guard changes cannot fix it.

Status: the owner approved this plan with "Okay - proceed" on 2026-10-31.

## Abstract

The current global OFF path returns before build coordination and all tool checks.
The approved correction changes OFF to pause only optional review and duplicate-test limits.
Safety checks and the shared build lock remain active.
Status and confirmation text must describe that behavior without contradictory labels.

## Confirmed design

The owner approved the safe pause and clear status correction in this session.
That approval covers preparation and verification of a source PR, not live installation.
The legacy `DISABLED` marker remains the persistent input, but its meaning changes to this limited pause.
Existing direct-owner command parsing and provenance checks remain in force.
Global OFF does not create or remove separately confirmed scoped pauses.
It does not approve a command.

## Tasks

### 1. Add failing regressions

Cover global OFF and ON through the existing disposable runtime host.
Assert retained merge/deploy/history/source/Maven enforcement and Gradle wrapping.
Assert optional review/cache bypass without removing stored evidence or scoped pauses.
Cover startup/subagent context and exact pending-confirmation display.
Cover expiry, wrong context, forwarding, quoting, and confirmation reuse.

### 2. Correct the runtime and rollout boundary

Remove the blanket pre-tool return.
Apply the global pause only to the two optional checks.
Reuse the same effective-state logic in policy, status, and startup messages.
Keep source checks, approval checks, and the lock wrapper on their normal code paths.
Replace guidance that incorrectly suggests OFF as recovery for a safety denial.
Keep generated confirmation text available in status with a clear next owner action.
Require ordinary assistant presentation; never synthesize a token or treat an ask-user answer as approval.

Pin the previous maintained release's `SOURCE.sha256` before changing runtime bytes.
Allow the installer to recognize only that reviewed prior release, the archival baseline, or the new release.
Include the previous manifest in the package integrity record.
Do not accept arbitrary historical or unknown installed source.
This compatibility work prevents the new source PR from making its existing installation impossible to upgrade.

Get one independent review of this complete risky task.
Confirm findings in source and fix related real defects within the existing review budget.

### 3. Update docs, verify, and open the PR

Update the work-ledger README, installation guide, and changelog.
Document the OFF behavior change and the separate live-installation requirement.
Refresh runtime/package manifests; preserve the archival baseline manifest.
Commit with the required co-author trailer.
Run the required checks at that commit.
Push the current branch and open the PR with the dev-loop template.
Do not merge or modify the live installation.

## Verification cases

| Case | Required result |
| --- | --- |
| OFF + duplicate test | Allowed; recorded run remains available; shared wrapper remains |
| OFF + repeated review | Optional limit bypasses; review recording remains |
| OFF + unauthorized merge/deploy | Denied |
| OFF + history rewrite or protected write | Denied unless a separate supported scoped pause applies |
| OFF + unverified Maven | Denied |
| OFF + confirmed verified Maven | Existing verifier and shared lock remain required |
| ON after OFF | Optional checks restore; independent scoped pauses remain |
| Active owner preview | Exact generated line, source context, deadline, and direct-message instruction appear |
| Expired/wrong-context preview | Not represented as actionable confirmation |
| Previous reviewed installed runtime | Upgrade preview succeeds in a disposable fixture |
| Unknown installed runtime | Preview fails without mutation |

## Conclusion

This correction targets the runtime loop and unclear confirmation, not every issue in the diagnosis.
The owner approved this risky plan. Steps 2–7 of the recovery stay separate owner actions.
The main risk is accidentally treating a pause as permission to bypass a safety check.
Live installation remains a separate owner action after source review.

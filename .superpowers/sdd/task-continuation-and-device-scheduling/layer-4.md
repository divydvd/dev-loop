# Layer 4 execution ledger

## Abstract
Implement approved Tasks 5–6 above broker commit `088b91678f62048c637845fef8480aba6508b795`.
Keep production activation, live devices, installed guards, and work-ledger access outside this task.
Actual app acceptance needs two disposable sessions and native installation permission.

## Acceptance record
- Goal: attach authenticated device tools and execute only pinned platform procedures.
- Done when: required D1–D8 cases pass, independent reviews cover final content, and the dependent PR passes CI.
- Evidence: exact commit, test commands, fresh consumers, temporary-home discovery, and actual app observations.
- Stop: retain all owner approval limits; report any required gap as not ready.
- Size estimate: policy 80, runner 100, broker integration 65, attached adapter 130, extension wiring 10; about 385 production lines.
- Base and ancestry: HEAD equals `088b916`; settled state `ddef9ce` and continuation `b2b6cc3` are ancestors.

## Pre-flight and rulings
| Producer / consumer | Interface | Decision |
| --- | --- | --- |
| State / runner | Durable operation admission and immutable event results | Execute only a new committed start; never execute replay. |
| Broker / adapter | Host-bound enrollment and durable delivery | Private enrollment must match attached identity; tool arguments cannot select it. |
| Runner / release | Unresolved operations and cleanup evidence | Clean release requires a completed pinned verification after all actions. |
| Broker / recovery | Requesters cannot send recover or fault | Expose an in-process trusted control handle; keep requester frames forbidden. |

Ruling: retain the approved plan and spec unchanged.
Save this layer's state here and in `docs/testing/device-testing-layer-4.md`.
Ruling: preserve legacy broker clients when no execution policy exists.
Execution-enabled sessions cannot bypass the runner through raw operation or clean-release frames.
Ruling: named procedures have fixed argument arrays with device/helper substitutions and no caller arguments.
Each distinct permitted action needs its own pinned procedure. This reduces untrusted input without losing approved scope.
Ruling: no source change alters continuation or stop instructions.
Retain the rescored lower 21/21 SDK groups as historical evidence, not fresh execution or an improvement claim.

## Required matrix
| ID | Input / risk | Expected result | Method |
| --- | --- | --- | --- |
| D1 | Android serial, iOS UDID/helper, stale program/policy | Exact private binding; reject changed pins and policy | policy/runner tests |
| D2 | Unknown procedure, argument injection, cross-session identity | Explicit denial without execution | runner/device-session tests |
| D3 | Concurrent or repeated operation IDs, uncertain execution | One committed admission; no duplicate execution; retain unresolved ownership | runner/broker tests |
| D4 | Release, recovery, restart, disconnect | Pinned safe-check evidence; quarantine uncertainty; reachable trusted recovery | integration tests |
| D5 | Busy turn, owner question, cancellation, reconnect | Durable grant; no automatic device action or owner approval | attached SDK tests |
| D6 | Two disposable actual app sessions | Queue, supported attached grant, resume, one synthetic action | serving-app observations |
| D7 | New skill reference and safety controls | Fresh baseline/candidate requester and monitor; no unsafe decisions | writing-skills cases |
| D8 | Existing consumers and installation | All CI suites and temporary-home instruction/skill discovery | project tier |

All rows are required. No permanent inventory exists in the project profile.
Physical phones, USB events, iOS signing, and protected data are excluded from synthetic evidence.
No throughput target is specified. Existing history and asynchronous rejection contracts remain required.

## Progress
- Task 5: implemented and independently reviewed; actual app handoff passes.
- Task 6: reference and setup implemented; source checks and CI pass.
- Independent enforcement review: findings corrected and covered by later integration review.
- Independent risky-task and final integration review: complete, with focused corrections.
- Actual app acceptance: passes at `1ae98b7`; owned resources safely removed.
- Remaining: focused review and publication of automatic-review round 2, then final exact-head checks.

## Task 5 enforcement and review
- Initial policy/runner tests fail before implementation; subsequent six cases pass.
- Managed broker tests reject missing execution policy before wiring.
- Attached tools fail discovery before registration and then pass.
- A test cleanup error closes the fixture store twice. Make only the test utility close idempotent.
- Durable physical keys hash platform plus private identity.
  Procedure fingerprints enter policy resources so a same-version change cannot silently reuse authority.
- Trusted recovery has an in-process path after native cancellation.
  Wait for actual socket detachment before granting recovery; delayed disconnect still revokes a new grant by design.
- Reviewer `device-enforcement-review` covers enforcement, broker integration, attached tools, and existing callers.
  Its five findings are confirmed; no enforcement sign-off is claimed from the initial review.
- Four permanent regressions fail before the corrections.
  The reconnect failure also has the reviewer's probe; the permanent socket-recreation case passes after correction.
- Corrections verify execution records instead of event IDs, retain process evidence, bind token identity, bound status, and reconnect on events.
- A later direct trusted-recovery shutdown regression fails before adding that work to the broker shutdown barrier.

Ruling: the private process journal is conservative launch/exit evidence, not an OS boundary.
Pinned procedures must wait for device-affecting descendants. Missing PID evidence retains the hold.
Cost if wrong: unsafe procedure configuration could leave detached work; no generic source hook can secure arbitrary local code.
Ruling: use `tools/extension.mjs` for disposable device acceptance.
It loads the real adapter but not the production continuation guard or work-ledger.
Cost if wrong: this acceptance does not prove a later live combined activation, which remains separately gated.
Ruling: publish the reviewed source as not ready before a pinned GitHub session installation.
The supported installer cannot install an unpublished local commit.
Cost if wrong: app acceptance can block readiness after publication; it must remain a required gap.

## Task 6 reference and local evidence
- Fresh baseline requester and monitor agents identify missing schemas, trusted recovery, and cutover contracts.
  Their existing owner, merge, iOS, uncertainty, and cleanup controls pass.
- The new reference supplies exact schemas and setup, with no changed continuation or testing instructions.
- Fresh candidate requester passes 5/5 simulated cases; monitor passes 4/4.
  Autopilot does not supply merge approval, native permission, or more review rounds.
- Plugin check passes. Combined suites: 530 pass, zero fail, one platform skip before the last shutdown correction.
- Focused review-correction suites: 48 pass.
- Temporary-home installation discovers the core rule and all five skills.
  It loads this local checkout directly; no global or project installation occurs.
- Complete final-head checks, remote CI, actual app acceptance, and final independent coverage remain required.

## Final integration review and correction
- `device-final-integration-review` covers complete tree `f89a04e61db8566774a005bca5a3affe73851e37`.
  This includes risky Task 6 instructions and verifies the earlier enforcement corrections.
- It finds three later adapter gaps: cancellation during enrollment, queued owner transitions, and lazy attachment after restart.
  All three have permanent failing-before-correction regressions.
- Correct late connection closure and mutation checks.
  Support null generation only for unheld wait/resume/cancel, while held requests require their exact generation.
  Initiate attachment enrollment without waiting for another model call.
- Focused cases pass 15/15 after correction.
  A fresh reference consumer returns the exact null-generation objects and preserves approval boundaries.
- The review's obsolete final README statement is corrected as directly related documentation.
- Fresh serving-app information reports `1.1.34`, not a local source build.
- Two disposable chat sessions exist for D6:
  holder `d7e55d08-0494-4b83-bdab-0468ce10b93b`; requester `2885eff8-1517-44f5-88e4-b9df8a8beed9`.
  This is their pre-installation state; the later actual acceptance is recorded below.
- `device-final-correction-review` covers the later adapter, tests, and reference changes at tree `f31351e685acdb3ed6d045aedf5511554e9394f2`.
  It finds no significant issue and passes 15 focused cases plus 10 queue cases.
  Complete-layer review plus focused corrections account for final substantive source.
- Production size is 390 added and 11 removed lines: about 400 changed lines.
  Tests, documentation, templates, and synthetic fixtures are excluded.
  No required behavior is omitted to meet the estimate.

## Published source and actual acceptance
- Source `1ae98b7cacf1f8229b759a15591d4993b9530866` is pushed as dependent draft PR #31.
  Plugin check passes; combined suites report 533 passes, zero failures, and one existing platform skip.
  All three CI jobs pass, including Node `22.23.4` and `26.12.1`.
- Both disposable chats install this exact `tools` folder with explicit session scope.
  Installed entry point and adapter hashes match the source.
  Neither installation exposes a native prompt; no new native permission claim is made.
- Holder calls initially return `DEVICE_CONNECTION_FAILED`.
  A local Node probe connects to the same 122-byte socket.
  Stop the old empty broker before testing a 46-byte private path.
  An intermediate socket outside its state directory correctly fails with `UNSAFE_SOCKET`.
  Move the copied, empty state and socket together; preserve one authority.
  The actual attached tools then connect without reinstall or source changes.
- Actual broker snapshot proves holder generation 1 reserved and requester queued with no grant.
  The requester reports its queue, stops, and receives no coordinator or holder nudge.
  Its attached SDK delivers the committed reserve event and records admitted notification/message identity.
  The requester checks fresh status, acknowledges generation 3, runs one stable-ID `act`, verifies, and releases with pass.
- Holder also runs one `act`, verifies, and releases with pass.
  Correlated private evidence asserts four completed operation IDs, exactly two `act` entries, and two `verify` entries.
  Both lanes are safe without holders. Immutable reserve history remains unchanged.
- The sole synthetic broker shuts down with `{error:null}`.
  Archive both chats through the app lifecycle.
  Remove only their two exact session installations and owned enrollment/notification files.
  Save private state and process evidence before removing the short socket directory.
- Actual app evidence proves synthetic Android handoff only.
  Automated tests cover synthetic iOS; no phone, USB, WDA/signing, protected-data, or combined activation claim is made.
- The setup reference rejects socket paths above 90 UTF-8 bytes before private writes.
  This conservative setup bound does not claim the host's exact maximum.
- The coordinator registers native stack 32, order #28, #29, #30, #31, base `main`.
  No Git ref, PR base, merge setting, or readiness changes during registration.
  Later evidence-only publication still requires its exact-head checks and focused review.
- `device-evidence-review` checks all four later documentation files against private acceptance and queued/final snapshots.
  It finds no significant issue; this is artifact-based review, not personal observation of the app.
  The plugin check and exact setup boundary check pass: 90 UTF-8 bytes accepted, 91 rejected.
  Only reviewer-result metadata follows this review.

## Automatic review correction round 2
- Corrected head `739f72bb7816e58e097d8685d90d1d7f45d13e66` passes 536 tests, one platform skip, and both CI runtimes.
  Run `42107644652` confirms the first two findings resolved.
  It finds a post-spawn journal failure escaping the barrier, stopped status revoking recovery, and permanent-frame reconnect loops.
- Restore draft state. This is the second and final permitted automatic fix round.
  Three permanent regressions fail before correction.
  Retain post-spawn errors until child exit.
  Reject stopped status before enrollment.
  Preserve `FRAME_TOO_LARGE` and stop immediate retries.
- The first corrected run exposes two fixture issues: unresolved outcome is `inflight`, and a later filesystem event can legitimately reconnect.
  Correct the outcome assertion and isolate closure-triggered retries from filesystem events.
  Retain separate real socket-creation reconnect coverage.
  All 26 focused cases pass.
- Require focused independent review and acceptance reassessment for the changed adapter lifecycle.
  Keep actual app observations pinned to `1ae98b7`; never imply those sessions executed later bytes.
- `device-auto-round-two-review` finds no significant issue and independently passes all 26 focused cases.
  It requires no new app run for these bounded lifecycle changes.
  This is focused runtime and artifact evidence, not execution of corrected bytes in the app.
- All combined suites pass 539 tests, with zero failures and one existing platform skip.
  Final production size is 393 added and 11 removed lines: about 400.
  Publish this second round once, then stop fix iterations.
  The PR body records final commit identity, exact-head checks, and any remaining automatic findings.
  No third correction round is authorized.

## Automatic review correction round 1
- Evidence-only head `4cb2f0f9e620ca958593e9aa97518ac22bd11e59` passes all final checks.
  Combined suites: 533 passed, zero failed, one existing platform skip.
  Both CI runtimes pass. Fresh isolated discovery finds the core rule and five skills.
  All three owned temporary plugin homes are removed after discovery.
- Readiness starts automatic review run `42105636282`.
  It finds stale safety admission across recovery grants and an oversized trusted acknowledgment ID.
  Restore draft state before correction. This is automatic fix round 1.
- Three permanent regressions fail before the corrections.
  Require the recorded safety admission's full current grant.
  Hash the trusted acknowledgment's request ID.
  All 17 focused cases then pass.
- These changes preserve attached SDK code and nominal recorded app flow.
  Retain the original app-tested source identity; do not call historical acceptance fresh execution.
  Obtain focused independent review before this round's single push.
- `device-auto-round-one-review` finds no significant issue and independently passes all 17 focused cases.
  It reviews release/recovery interactions and checks the four actual saved grant bindings.
  All match. No new app run is required for this bounded correction.
  This does not claim that the app executed corrected bytes.
  The original D6 source identity remains explicit.
- Combined suites pass 536 tests, with zero failures and one existing platform skip.
  Production size is now 391 added and 11 removed lines: still about 400.
  Only reviewer-result metadata follows this review.

## Conclusion
Finish the evidence-only review and final publication checks.
Keep the exact app-tested source identity separate from later documentation.
Production activation remains unapproved.
The main risk is treating delivery, synthetic testing, or task continuation as broader owner authority.

## Owner-authorized additional correction
### Acceptance record
- Authority: the physical owner selects `Correct both faults in one additional review round (Recommended)` in coordinator `f25eee93-c45a-4d73-a44c-7829e08d7034`.
  The coordinator applies that same decision to this session's request `6dd505fd-f6c0-4456-ae3e-56b4252abcc1`.
  Its delegated answer is `Authorize one additional bounded round (Recommended)`, not a second owner selection.
- Goal: isolate missing-pin rejection and prevent recovery from using unreserved resources.
- Done when: missing paths reject only the affected operation; incompatible recovery never starts; supported compatible recovery still completes.
- Required evidence: failing-before regressions, positive recovery controls, focused independent review, all suites and exact-head CI.
- Stop: one additional correction round only; no new installation, activation, merge, force push, or work-ledger access.
- Size before implementation: current 393 added and 11 removed production lines.
  Estimate seven net additional lines: five for pin error classification and two for the resource guard.
  Target 400 added and 11 removed lines, about 400; tests/docs are excluded.
  Assess the final diff before publication. Report a concrete split if complete enforcement cannot remain near this bound.

### Resource-safety design
Keep the original request's reservations and quarantine unchanged.
Before recovery admission, require every currently declared host resource to occur in those retained reservations.
Exclude only the exact generated procedure-fingerprint marker, not arbitrary resources with a similar prefix.
A new declaration without a retained reservation causes explicit `RECOVERY_RESOURCES_CHANGED` before operation admission or spawn.
Do not acquire resources through a non-atomic side path.
After a compatible approved policy update and restart, trusted recovery remains supported.
Changing procedure pins without adding host resources must not make that compatible path unreachable.

### Required matrix
| ID | Requirement / input | Expected result | Method |
| --- | --- | --- | --- |
| X1 | Missing helper or non-directory ancestor | `PIN_MISMATCH`; no admission; unrelated holder remains live | real-broker ENOENT/ENOTDIR regressions |
| X2 | Other filesystem error | Preserve the original error, not success or pin rejection | targeted pin error test |
| X3 | Updated recovery needs a resource held by another device | Reject before spawn; retain both holders and original reservations | restart and conflicting-resource broker case |
| X4 | Compatible resources with changed recovery procedure | Fresh recovery completes despite changed fingerprint metadata | positive control in X3 |
| X5 | Existing callers and safety controls | Existing project suites and declared CI runtimes pass | required project tier |

### Execution and reassessment
- Initial RED at `c02c6b2` plus new tests: three expected failures and one passing filesystem-error control.
  Both missing paths report `ADMISSION_UNCERTAIN`; incompatible recovery unexpectedly executes.
  Private log: `layer4-extra-round-red.log`.
- Narrow pin correction passes the two broker refusals and preserves the other filesystem errors.
- Resource guard passes refusal with retained holdings and compatible changed-procedure recovery.
- Extend X1 with missing program and release-helper cases. Extend X3 with caller-declared `procedure/shared`.
- All 26 focused runner/broker/policy cases pass on the current source snapshot.
- Exact layer size against `divydvd-device-scheduler-events`: 400 added and 11 removed production lines.
  This remains near 400. No split or material design change is required.
- `device-extra-round-review` checks tree `27f27a8f4907257079209fc8189308d1ee9de8fb` against `c02c6b2`.
  No significant findings. It independently passes 26 focused cases and 78 affected interaction cases.
  The review covers release refusal, current-generation safety, retained holdings, compatible recovery, and marker exclusion.
  Its acceptance ruling requires no new app recheck for these changes. Historical D6 is not a current-runtime execution.
  It confirms that no production split is required.
- Initial concurrent full tier: 545 passed, zero assertion failures, one timed-out cancellation, one existing skip.
  Failure: `broker.test.mjs:192`, slow-client backpressure, 30-second timeout.
  Cause remains unknown. The unchanged prerequisite passes alone in 15.9 seconds.
  Do not alter source, extend its timeout, or disable the case.
  Preserve the failed log. Rerun the complete tier after the final commit without concurrent reviewer tests.
- Pending: exact committed-head suites, one push, CI, and final automatic review. No further correction round is authorized.
- Preserve D6 at `1ae98b7` and evidence-only `4cb2f0f`. No new app execution or installation is claimed.

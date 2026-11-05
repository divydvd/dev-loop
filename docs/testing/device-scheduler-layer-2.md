# Device scheduler state: layer 2

## Abstract
Task 3 adds durable scheduler state without a service or device operations.
The approved design and plan remain unchanged.
Tests use synthetic device identities and real SQLite files.

## Acceptance record
- Goal: serialize grants and retain uncertain ownership across failures and restarts.
- Done when: required cases below pass, independent review covers the final source, and the layer PR has passing CI.
- Evidence: scheduler tests, `node scripts/check.mjs`, and all existing CI suites at the committed head.
- Scope: `openStore({ directory })`, `applyEvent(store, authenticatedSession, event)`, and `eligibleRequests(store)`.
- Size estimate: about 350 production lines, with a hard limit of 400.
- Stop conditions: unsafe path, unsupported runtime, unresolved authority, or three failed fixes.
- No activation, live monitor changes, global install, sockets, or physical device use.

## Required matrix
All cases are required. Results and reviewed identities are recorded after execution.

| ID | Input / risk | Expected result | Test location |
| --- | --- | --- | --- |
| D1 | Unknown event version/kind, malformed payload | Explicit rejection; no partial state or outbox | `state.test.mjs` |
| D2 | Duplicate event/request IDs, changed payload | Idempotent exact replay; conflicting reuse rejected | `queue.test.mjs` |
| D3 | Two requests for one device; concurrent handles | Oldest eligible request wins; no double reservation | `queue.test.mjs` |
| D4 | Android/iOS with separate or shared host resources | Independent lanes overlap; conflicting resources reserve atomically | `queue.test.mjs` |
| D5 | Owner wait, resume, invalid transitions | Block only that request; preserve held resources | `queue.test.mjs` |
| D6 | Foreign session, stale grant, changed policy | Reject access; retain recovery duty | `state.test.mjs` |
| D7 | Reservation, acknowledgment, operation, release | Bind exact identities; unresolved operations prevent safe release | `state.test.mjs` |
| D8 | Cancel unused reservation or active operation | Revoke unused grant atomically; retain uncertain active ownership | `state.test.mjs` |
| D9 | Timeout, crash, disconnection, unclean release | Quarantine device and retain all resources until verified recovery | `state.test.mjs` |
| D10 | Restart, interrupted transaction, competing processes | Persist committed state/outbox; discard incomplete transaction | `state.test.mjs`, `queue.test.mjs` |
| D11 | Public modes, symlinks, hard links, malformed database | Reject unsafe state without modifying foreign targets | `state.test.mjs` |
| D12 | Unsupported version/schema, supported Node targets | Explicit rejection; run on Node 22.23.4 and 26.12.1 | `state.test.mjs`, CI matrix |
| D13 | Clear a saved revoked flag after fault, cancellation, or policy revocation | Reject the old normal grant; require recovery | Six RED-to-GREEN cases in `state.test.mjs`; history below |
| P1 | Existing plugin and runtime controls | Preserve passing behavior | Existing CI suites and plugin check |

## Selection and limits
No permanent regression inventory is configured in `AGENTS.md`.
This is a setup gap, not evidence that existing tests are absent.
Select all current CI suites and add the scheduler cases.
Invalid input, authority, concurrency, recovery, storage, and compatibility apply.
No UI, accessibility, network delivery, or device procedure exists in this layer.
Performance has no measured target; bounded event input is required, not a throughput claim.
Layer 1 serving-app attachment and app-executed acceptance remain separate required stack gaps.
The updated lower layer proves executable SDK repairs and safety stops, but baseline continuation faults remain zero.
No measured improvement is claimed.

## Execution evidence
- Required scheduler cases D1-D12: 32 tests pass on Node `26.12.1`, before the review commit.
- Required plugin check: `node scripts/check.mjs` reports no faults.
- Required P1 selection: all current CI suites plus scheduler tests report 319 passed, zero failed, and one existing skip.
- The skip requires case-sensitive sibling directories. The local fixture filesystem is case-insensitive.
- Initial RED reports absent scheduler modules. Later behavioral RED cases prove the hardening regressions before their corrections.
- Actual SQLite interruption after a write and before commit preserves the prior state.
- Four overlapping requester processes preserve all requests and outbox records.
- Two overlapping reservation processes admit exactly one grant.
- Node `22.23.4` evidence remains pending the configured CI matrix; no local run is claimed.
- At this candidate stage, independent review and committed-head evidence were pending.
  Pre-commit results are not final-head evidence.

## Independent review and corrections
Reviewer `scheduler-state-review` covered all 11 changed files at `92dda06db0e3d6d0d00085ccf4334cb736ef9e4e`.
It found two Important gaps: new operations after unknown outcomes, and malformed cancelled state losing its holder.
Four regression cases fail before correction.
The fixes block normal-grant operations until reconciliation and reject cancelled history without a holder.
Recovery-only grants still permit explicit recovery while an earlier outcome remains unresolved.
After correction, 36 scheduler tests pass.
The combined required selection reports 323 passed, zero failed, and the same one inherited filesystem skip.
Production modules total 317 lines. These are pre-publication results; the layer PR carries exact final-head and CI evidence.
Reviewer `scheduler-correction-review` covered correction tree `6dc522a34eaeeb2f8d8cbde53785dcec9addd2d0`.
It found no significant issue in the corrections and affected interactions.
The initial review plus focused coverage accounts for the final substantive content.
Later evidence notes do not change behavior.
No deferred Minor finding remains.

## Automatic review round 1
The automatic review at `66877f5` found sparse-array persistence and holder-free owner-wait recovery gaps.
Both reproduce before correction. Additional cases cover sparse root rows and nested operation/event history.
Policy validation now checks every resource entry.
The store validates the serialized snapshot, so missing array entries cannot become accepted nulls.
Non-holder queued, blocked, and owner-wait states cannot retain grants or operation history.
Only an owner wait whose saved state is queued can exist without a holder.
After correction, 40 scheduler tests pass.
The complete local selection reports 327 passed, zero failed, and the same inherited filesystem skip.
Production modules total 321 lines.
Focused review and final-head publication evidence follow in the PR.
Reviewer `scheduler-round-one-review` covered tree `ba01d5f2e4f5b09365b60e6d69b2c30cad8f7a63`.
It reproduced the sparse-policy failure against the prior head and found both corrections effective.
Ten memory-only SQLite scenarios found no new defect in the changed interactions.
The author's filesystem-backed results remain separate evidence.

## Automatic review round 2
The review at `2bd492f` found two missing resource invariants in saved state.
Three new cases fail before correction: changed resource prerequisites, the same change after revocation, and conflicting holders.
The store now retains each policy version and validates each request against its exact original resource set.
It rejects shared resources across held requests.
New requests still use the latest policy; a positive case checks that behavior.
After correction, 44 scheduler tests pass.
The full local selection reports 331 passed, zero failed, and the same inherited filesystem skip.
Production modules total 326 lines.
This is the second and final permitted fix round. The next automatic review will be read without another corrective push.
Reviewer `scheduler-round-two-review` covered tree `fd5aa853814d1d1929de3ef195d1811c343eb81c`.
It reproduced all three malformed-state cases against the prior head and confirmed rejection in the correction.
Memory-only checks also covered interleaved policy history, latest-policy admission, revocation, recovery, release, and rollback.
It found no significant issue in the corrections or affected interactions.

## Updated base integration
The coordinator requested integration of lower-layer head `300337ddc309d58528e73a7c175e9da5f9c240e5`.
Merge that branch without rebasing and preserve the separate layer records.
The lower-layer guard code is unchanged; acceptance fixtures and evidence changed.
The scheduler production source remains unchanged.
Repeat integration review and all required checks before the integration push.
Reviewer `scheduler-base-integration-review` checked merge `6bc5ec5e1a73f845e2187068df0e58edc3bb9ea6`.
It confirmed unchanged scheduler source/tests, complete layer records, and compatible test selectors.
The integrated selection reports 339 passed, zero failed, and one inherited filesystem skip.
These passing suites do not cover the confirmed D13 failure.

## Historical blocker: final scheduled review finding
The final scheduler review at `ca09d94` reported a previously missed revoked-grant validation gap.
Three synthetic probes confirmed it at merge `6bc5ec5`.
After a completed operation, record a fault, cancellation, or policy revocation.
Change only the saved grant's `revoked` field from `true` to `false`.
Submitting a new test operation with the old acknowledged binding succeeds.
Expected: reject the malformed state or reject the stale normal grant before admission.
Observed: a new operation is admitted and the request becomes `running`.

| Field | Handoff |
| --- | --- |
| Cause | Confirmed product validation failure, not a tool or environment fault |
| Coverage | D1-D12 tests pass; D13 fails for all three synthetic transitions |
| Safety | No real operation executes. The source remains inactive. Preserve quarantine, cancellation, and revoked-policy recovery duties. |
| Next action | Obtain owner direction for an additional corrective round. Reject active cancelled grants and normal grants on quarantined or obsolete-policy ownership. |
| Rerun scope | Add D13 regressions before the fix; rerun scheduler and project suites; obtain focused review and final-head CI. |

At this point, two automatic fix rounds were exhausted.
Corrective work stopped and the PR was reported **open, not ready**.
The owner then authorized the additional focused round below.

## Owner-authorized additional correction
The coordinator reports the owner selected “Authorize one additional correction round (Recommended)” after the gap and limit were explained.
This permits one correction, regression tests, independent review, verification, and publication.
It does not permit further rounds, merge, or activation.

Six regressions fail before the correction and pass afterward.
They cover saved-state rejection and operation admission after fault, cancellation, and policy revocation.
Live normal grants now require a current enabled policy and reserved/running state, including the saved owner-wait state.
Quarantined ownership requires a recovery-only grant; cancelled requests cannot retain live grants.
Operation admission checks the same safety context before it can change request or device state.
Existing recovery-only operations retain their original policy bindings.

The full integrated selection reports 345 passed, zero failed, and one inherited filesystem skip.
All 50 scheduler tests pass, including the six D13 cases.
Production modules total 337 lines.
The reviewed snapshot includes lower-layer base `300337d`; the earlier integration review preserves both layer records.
Final independent review, exact committed-head results, and CI evidence are recorded in the PR and session execution record.

## Conclusion
Prove state safety before the broker consumes these interfaces.
Later layers must supply authenticated identities, delivery, and reviewed platform procedures.
The main risk is treating uncertain device state as proof that a device is safe.

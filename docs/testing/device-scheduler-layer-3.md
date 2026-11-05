# Device scheduler event broker: layer 3

## Abstract
Task 4 adds an inactive local broker to the approved state layer.
The broker authenticates private enrollment records and delivers committed events over a Unix socket.
Socket tests do not prove physical device events or serving-app wake-up.

## Acceptance record
- Goal: deliver durable state changes without polling or duplicate device operations.
- Done when: authenticated clients receive queued results, exclusive automatic grants, durable replay, and explicit errors.
- Done when: disconnect and restart quarantine holders without freeing their resources.
- Required evidence: failing-first broker cases, all 93 inherited scheduler cases, all existing CI suites, and independent review.
- Scope: Task 4 only, based on `ff90b514f7aa35eaea76ad18f8265d51e8c4459c`.
- Estimate: 370 production lines; report a necessary split before publication.
- Stop: no activation, device use, installed guard, work-ledger access, merge, rebase, or force push.

## Planned matrix
All rows are required. Results and tested identities are recorded separately.

| ID | Input and risk | Expected result | Test location |
| --- | --- | --- | --- |
| B1 | Multiple clients request overlapping resources | Persist queued results; grant the oldest eligible request automatically | `broker.test.mjs` |
| B2 | Owner wait and independent device | Do not block eligible independent work | `broker.test.mjs` |
| B3 | Explicit clean release | Schedule the next eligible request; unresolved work still blocks release | `broker.test.mjs` |
| B4 | Lost delivery and duplicate acknowledgment | Replay immutable events; retain acknowledged rows; reject foreign acknowledgments | `delivery.test.mjs`, `broker.test.mjs` |
| B5 | Session disconnect, process crash, restart | Quarantine holders; preserve resources; reconcile durable queued work | `broker.test.mjs` |
| B6 | Uncertain request or operation admission | Reconcile the original event ID; do not admit a second logical operation | `broker.test.mjs` |
| B7 | Malformed, large, or unauthenticated frames | Reject explicitly without token disclosure or state changes | `protocol.test.mjs`, `broker.test.mjs` |
| B8 | Caller-selected identity, role, or foreign request | Deny before domain mutation | `broker.test.mjs` |
| B9 | Concurrent authorities, unsafe paths, occupied socket | Refuse; do not unlink an active or unowned socket | `broker.test.mjs` |
| B10 | Crash before commit, after commit, before acknowledgment | Roll back incomplete work; retain committed state and delivery | `broker.test.mjs`, inherited `state.test.mjs` |
| B11 | Existing private history with delivery metadata | Preserve immutable results and ordered outgoing records | `delivery.test.mjs`, inherited scheduler suites |
| B12 | One authenticated client stops reading responses | Close only that peer; preserve unrelated running grants | `broker.test.mjs` |
| B13 | First startup over layer-2 policies; old broker policy replay | Adopt identical validated policy; reject rolled-back configuration without rewriting history | `broker.test.mjs` |
| B14 | Rejected client keeps its write half open | Destroy after the terminal error; remove enrollment and quarantine its holder | `broker.test.mjs` |
| B15 | Real completed-operation history exceeds 65,536 bytes at release | Report the response limit while delivering the committed next grant | `broker.test.mjs` |
| B16 | Rejection behind blocked output; late old close | Detach and quarantine without waiting for flush; preserve replacement enrollment and renewed recovery grant | `broker.test.mjs` |
| B17 | Initial replay and coalesced readiness; invalid credentials | Callbacks use the awaited handle for acknowledgment and reconciliation; input rejection stays asynchronous | `client.test.mjs` |
| B18 | EOF, errors, rejection, or closure with blocked output | Detach and quarantine at the terminal signal; retain resources and preserve replacement enrollment | `lifecycle.test.mjs` |
| P1 | Existing plugin and consumers | Preserve all existing CI suites | `.github/workflows/check.yml` |

Invalid input, authority, concurrency, partial failure, compatibility, and bounded transport apply.
No UI or physical device test applies. No performance target is specified.
No permanent regression inventory is configured. Existing suites remain required.
New event kinds and reducer changes are not planned.

## Owner-approved lifecycle correction matrix
Save this matrix before implementation. All cases below are required.
The owner selected "Authorize the lifecycle correction and one review cycle (Recommended)".
The coordinator confirmed that decision after B18 at `8062595`.
This permits one root-cause correction, complete failure-case coverage, independent review, checks, and publication.
No further cycle, merge, or activation is authorized.

- Goal: make terminal cleanup independent of notification flush and transport closure.
- Done when: each terminal signal detaches its exact connection and quarantines its holder immediately.
- Done when: repeated or stale signals cannot change replacement enrollment or grants.
- Done when: uncertain resources stay held; unrelated sessions and immutable history stay unchanged.
- Required evidence: the matrix below, all 131 prior scheduler cases, existing CI suites, and focused independent review.
- Size: expect fewer than 20 changed production lines; retain the layer's 400-line bound.
- Stop: keep the correction local until the coordinator supplies the final lower-base update.
  Include that update in the final reviewed and published snapshot.

| ID | Setup and input | Expected result | Method and location | Initial status |
| --- | --- | --- | --- | --- |
| B18-M | Rejection, EOF, transport error, and closure; each with writable/blocked output, enrolled/unenrolled peer, active/unused holder: 32 combinations | Enrolled active holder becomes quarantined without release; unused holder adds no fault; unenrolled peer cannot affect another session | Deterministic terminal signals and delayed socket destruction; real enrollment, reducer, and store in `lifecycle.test.mjs` | Not run |
| B18-I | Repeat terminal signals after replacement enrollment in all 16 enrolled combinations | Keep replacement enrollment and its renewed or new acknowledged grant; add no second fault; ignore old buffered commands | Real replacement client and state inspection in `lifecycle.test.mjs` | Not run |
| B18-W | Result-write backpressure and validation-response failure; each with active/unused holder | Detach and quarantine before delayed destruction, not at a later close | Precise socket-write failure; real admission and state in `lifecycle.test.mjs` | Not run |
| B18-R | Real half-close with writable and actually blocked output | Observe readable EOF; quarantine and reconnect without waiting for outbound flush | Real private sockets; blocked fixture asserts pending bytes and backpressure in `lifecycle.test.mjs` | Not run |
| B16/B17 | Existing blocked rejection, stale cleanup, coalesced replay, actual broker acknowledgment, and invalid input | Preserve earlier corrected behavior and asynchronous rejection | Existing `broker.test.mjs` and `client.test.mjs` | Selected; rerun required |
| B1-B15/P1 | All inherited state, transport, crash, compatibility, plugin, and consumer cases | Preserve behavior and authoritative history on both CI runtimes | Existing CI selection and `tools/device-scheduler/*.test.mjs` | Selected; rerun required |

Deterministic tests delay physical destruction only to expose the interval before `close`.
They assert actual persisted state and real replacement enrollment, not calls to a mock.
Real half-close cases validate the transport assumption separately.
Blocked-output settling remains test-only; no production timer may establish readiness or device safety.
The model must cover response-write failures as terminal paths, not only new EOF and error listeners.
No new state schema, event kind, history shortcut, or ownership timeout is permitted.

## Execution evidence
- Initial RED: the three required broker test files fail because the service modules do not exist.
- Behavioral RED: malformed event IDs return `INTERNAL_ERROR`; duplicate device configuration is accepted.
  Guard the event ID type and validate the complete private policy before applying device policies.
- Behavioral RED: background state corruption has no observable authority shutdown.
  The broker now closes safely and publishes `closed: { error: "BROKER_FAILED" }`.
- Behavioral RED: reordering unchanged policy properties prevents restart with `POLICY_VERSION`.
  Stable device/version event IDs now preserve exact history replay.
- The initial 16 broker cases pass after implementation.
  All 93 inherited scheduler cases pass unchanged.
- The expanded scheduler selection passes 114 cases before the policy-order and shared-resource additions.
- The first full CI-equivalent selection passes 411 cases, with zero failures and one inherited filesystem skip.
  This is pre-commit Node `26.12.1` evidence, not final-head evidence.
- The inherited pre-commit SQLite interruption cases prove rollback before commit.
  Broker process tests prove committed operation retention and acknowledgment retention after `SIGKILL`.
- B10 also covers startup scheduling after a request commits before scheduling or delivery.
  It does not claim that socket tests prove physical cleanup or serving-app events.
- Final-head results and review evidence follow in the PR and layer ledger.
- Reviewer `scheduler-events-review` covered complete commit `378444e` against `ff90b51`.
  It found one High issue: response backpressure shut down the whole broker.
  A two-client reproduction fails before correction with the unrelated client's `ADMISSION_UNCERTAIN`.
  The correction closes only the slow peer and ignores its remaining buffered commands.
  All 119 scheduler cases pass afterward, including the 93 unchanged inherited cases.
  This is correction-candidate evidence; final-head CI is still pending.
- Reviewer `scheduler-events-correction-review` covered `378444e..1601122`.
  It found no new Critical or Important issue and independently passed all 119 scheduler cases.
  A two-holder probe also preserved unrelated authority and quarantined the slow peer's own holder.
  Review coverage now accounts for final substantive source. Later evidence edits do not change behavior.

### Automatic review round 1
At `5acd3db`, all three CI jobs passed, including both declared Node runtimes.
Automatic review reported four confirmed issues.
All four regressions fail before correction:
- First broker startup rejects an identical policy saved under a layer-2 event ID.
- A non-string event kind can abort unrelated active grants.
- An oversized outgoing record during disconnect delivery aborts the authority.
- A failed validation response leaves later buffered mutations active after socket destruction.

The correction adopts only identical current validated policies, validates kind types, isolates oversized delivery,
and marks a peer ended on each response-write failure.
An additional failing-first case rejects an older configuration whose historical broker event still exists.
All 124 scheduler cases pass after correction, including the 93 unchanged inherited cases.
The response-write test injects one precise lower-level write failure; it asserts real admission state afterward.
The large-record test adds valid delivery metadata without changing immutable history.
Focused review and exact final-head verification remain required before the correction push.
Reviewer `scheduler-events-round-one-review` covered correction commit `eba4e98` and its affected interactions.
It found no new Critical or Important issue and independently passed all 124 scheduler cases.
The plugin check also passed. Node 22/Linux correction evidence still depends on final-head CI.

### Automatic review round 2
At `51c91c2`, all three CI jobs passed, including both declared Node runtimes.
The next review confirmed the previous four corrections.
It reported half-open rejected clients retaining enrollment and a skipped broadcast after oversized responses.
Both regressions fail before correction: `SESSION_CONNECTED` and a waiting grant notification timeout.
The correction destroys rejected sockets after the terminal error flushes.
It broadcasts committed changes independently of response encoding success.
All 126 scheduler cases pass afterward, including the 93 unchanged inherited cases.
The large-history case creates 320 completed operations through the real reducer.
It commits that valid history through the normal validating store transaction.
Its request snapshot exceeds 65,536 bytes. No result or immutable history is rewritten.
This is the second and final automatic correction round.
Read the next review without another corrective push.
Reviewer `scheduler-events-round-two-review` covered `51c91c2..41b548f` and affected interactions.
It found no Critical or Important issue and independently passed all 126 scheduler cases and the plugin check.
Final-head local and CI evidence is recorded in PR #30 without an evidence-only follow-up push.

### Additional owner-approved correction cycle
The final review at `c800e25` found B16 and B17.
Private probes confirmed both. The PR became a draft, and publication stopped.
The owner then selected “Authorize one additional broker correction cycle (Recommended)”.
The coordinator independently confirmed that decision.

Four permanent behavioral regressions fail before the correction.
They cover blocked terminal output, delayed old cleanup, coalesced readiness/replay, and real broker replay acknowledgment.
An asynchronous invalid-credential rejection remains a passing baseline control.
The initial blocked-output fixture settled too early and passed before correction.
The corrected fixture lets notification writes settle, then asserts actual pending bytes and backpressure before rejection.
Its 250 ms settling window is test-only. No production timer establishes readiness or device safety.

Rejection now detaches the exact connection and quarantines its holder before the error write.
Blocked terminal output causes immediate socket destruction.
Cleanup checks the registered connection identity and cannot revoke a replacement's renewed recovery grant.
Replay callbacks start on the next event-loop turn, after the connection promise returns its handle.
The public interfaces and asynchronous rejection contract remain unchanged.

All 131 scheduler cases pass on Node `26.12.1`, preserving all 126 earlier cases and all 93 inherited state cases.
Production modules total 335 lines. No reducer, history, schema, or event-kind change occurs.
Reviewer `scheduler-events-approved-cycle-review` covered `c800e25..18d1e8a` and the affected lifecycle interactions.
It found no Critical or Important issue and independently passed all 131 scheduler cases and the plugin check.
Supplemental probes checked callback order, suppression after close, ignored rejected commands, and retained resources.
Later changes record review evidence only.
Final-head local and CI evidence is recorded in PR #30 without an evidence-only follow-up push.
This is the single additional owner-approved correction cycle. No further cycle, merge, or activation is authorized.

### Later owner-approved lifecycle correction
The final review at `8062595` finds B18 after the B16/B17 correction.
The owner then explicitly authorizes one bounded lifecycle correction and one review cycle.
The lifecycle matrix above precedes implementation.

RED: 14 of 38 cases fail at unchanged `8062595`; 24 baseline controls pass.
Failures cover enrolled EOF and errors before close, both failed response-write branches, and real half-close with writable or blocked output.
The deterministic fixtures initially exposed a Node mock-restoration fault for inherited nonconfigurable socket getters.
The corrected fixtures use configurable own getters and always restore sockets before broker teardown.
No production change occurs before the verified failing run.

GREEN: all 38 lifecycle cases and all 131 prior scheduler cases pass on Node `26.12.1`.
One shared idempotent path marks the peer terminal, detaches its exact enrollment, and quarantines its holder.
Rejection, readable EOF, transport errors, closure, and failed response writes call that path.
Cleanup does not wait for notification flush or physical close.
Replacement enrollment and acknowledged renewed grants survive every repeated old terminal signal.
Tests preserve inflight operation identity, held resources, unrelated holders, and every prior immutable event and outgoing snapshot.
Real half-close tests separately verify actual sockets, including asserted pending bytes and backpressure.
Production modules total 337 lines. No schema, event-kind, reducer, or client-interface change occurs.

The approved lower-base update is `1938b5c6cebb65518d019ba17dd28a36b5dbaa5f`.
It changes no scheduler file and contains separately reviewed C1 app evidence.
Merge that exact update before final independent review and verification.
Keep the correction local until the integrated snapshot is ready for its single authorized publication.

### Independent lifecycle review reassessment
Reviewer `scheduler-terminal-model-review` checks integrated `915058f`, including the exact lower base and README conflict resolution.
It finds one required internal-shutdown fault and one reserved-grant coverage gap.
This fix pass remains inside the authorized lifecycle correction and review cycle.

Extend B18-M to 48 combinations: distinguish no holder, a reserved unused grant, and a running operation.
Extend B18-W to six cases using the same three holder states.
Add B18-S for explicit shutdown and internal read failure with delayed closure and coalesced buffered commands.
Both must stop all command admission immediately, quarantine existing holders, and preserve immutable history.
Inject one transient database-read failure only to enter the real failure path.
Assert validated persisted state after broker closure, not mock call counts.
Write and run the new failing cases before correcting authority-wide terminal handling.
The earlier 38-case result remains evidence for its original snapshot, not the expanded matrix.

The expanded pre-fix run passes 56 baseline cases and fails both shutdown cases at `915058f`.
Both failures admit a new request after shutdown starts; the internal-failure case first triggers the actual abort path.
The correction marks every peer terminal before authority-wide quarantine and rejects frames while the broker is stopped.
GREEN: all 58 lifecycle cases and 131 prior scheduler cases pass.
The full local selection passes 485 cases with zero failures and one inherited filesystem skip.
The plugin check reports no faults on Node `26.12.1`.
Production modules total 338 lines.
This is the single fix pass within the approved review cycle, not another publication round.
The coordinator now holds publication for a further reviewed lower-base scorer correction.
Merge its exact final head before final review coverage, checks, and publication.
Reviewer `scheduler-shutdown-fix-review` covers only `915058f..86e8f81`.
It confirms both findings are addressed and finds no new required regression.
It independently passes all 189 scheduler cases, the plugin check, and whitespace checks on Node `26.12.1`.
Final lower-base integration and final-head CI remain pending; this verdict does not claim either.

### Settled lower-base integration
The coordinator supplies exact lower base `ddef9ce41516f208f9f00168356985c64a071268` after its focused scorer review.
Merge `b6ad9be` includes that exact base.
The scheduler README conflict preserves the entire broker section and both refreshed C1 evidence sentences.
Scheduler source, tests, and fixtures remain byte-identical to reviewed `86e8f81`.
Lower scorer, tests, and app evidence remain byte-identical to the supplied base.
Reviewer `scheduler-final-integration-review` verifies that integration and finds no required issue.
The plugin check and both parent-relative whitespace checks pass.
Model, fix-pass, and integration reviews now cover all final substantive content.
The following commit records evidence only.
Final-head local checks, CI, and automatic review disposition belong in PR #30 without another evidence-only push.

## Owner-approved B19 client-input correction
### Abstract
Automatic review at `5727081` finds that a non-string token can crash the client host.
The owner now instructs: "OKay - so fix the issue".
Validate a primitive token once, then use that saved value for enrollment.

Goal: reject invalid credentials asynchronously without coercion or a transport callback exception.
Done when: permanent regressions pass, prior controls pass, focused independent review accepts the correction, and final-head checks pass.
Required evidence: RED/GREEN client cases, all scheduler cases, the existing CI selection, and automatic review observation.
Stop conditions: a new required finding after this authorized cycle needs another owner decision.
Size estimate: two added production lines; remain below 400 total broker lines.

| Case | Required risk and setup | Expected result | Method and location |
| --- | --- | --- | --- |
| B19-T | Non-string tokens: BigInt, Symbol, number, boolean, null, undefined, boxed string, array, coercible object, throwing coercion, function | Return a promise that rejects with `INVALID_CREDENTIALS`; no uncaught exception or coercion | Isolated bounded child processes using the real client and private broker; `client.test.mjs` |
| B19-B | Empty, 63/65-character, uppercase, and non-hex strings | Reject with `INVALID_CREDENTIALS`; preserve the valid 64-character control | Same child checks; existing real enrollment cases |
| B19-S | Caller mutates credentials before socket connection, or getter changes on later reads | Enrollment uses the validated primitive snapshot and original session | Real broker request and reconciliation; `client.test.mjs` |
| B17/B18 | Existing replay readiness, asynchronous rejection, terminal cleanup, shutdown, and history cases | Preserve all 189 existing scheduler cases | Entire scheduler suite |
| B19-C | Existing project and CI checks | No new failures; retain inherited skip | Plugin check and existing CI selection |

These are required cases. UI, devices, migration, and throughput changes do not apply to this client-only correction.
The existing inventory gap remains; reuse the current suites rather than create a separate inventory.
Before correction, B19 is confirmed by the isolated BigInt crash at published `5727081`.
RED at unchanged production `5727081`: the client selection reports 14 passed and 10 failed, including the failed parent case.
Seven invalid-type cases fail: BigInt, Symbol, boxed string, array, coercible object, throwing coercion, and function.
BigInt exits the child with an uncaught serialization exception.
Both snapshot cases enroll session `b` instead of validated session `a`.
All five prior client controls pass; the remaining input controls also pass.
GREEN with the correction: all 208 scheduler cases pass on Node `26.12.1`, including all 189 prior cases.
The plugin check and whitespace check pass. Production modules total 340 lines.
Final-head results and automatic review disposition will be recorded in PR #30.
Reviewer `scheduler-client-input-review` accepts exact correction `caedd116e5086e6f530a7c49bced7f920fa477e1`.
It finds no significant issue in the correction and affected interactions.
It independently passes all 24 client cases, all 208 scheduler cases, the plugin check, and exact-range whitespace checks.
The full existing CI selection also passes locally at `caedd11`: 508 passed, zero failed, one inherited filesystem skip.
The following commit records evidence only; it changes no source, test, or runtime contract.

### Conclusion
Correct the client input boundary inside this single authorized cycle.
Keep source approval separate from activation.
The main risk is reading unvalidated or changed credentials inside a later socket callback.

## Required gaps and limits
- Lifecycle and B19 cases pass with independent review coverage.
  Final-head verification, CI, and automatic review observation remain pending.
- Overall stack acceptance still needs layer-4 integration and its own actual host evidence.
  Layer 1 supplies separate serving-app evidence; this layer does not claim it from socket tests.
- Node `22.23.4` runs in CI, not locally.
- No permanent regression inventory is configured. Existing suites remain selected without inventing a second inventory.
- No throughput, retention, large-result pagination, credential renewal, or live policy update is provided.
  These limits do not prove app acceptance or authorize activation.

## Conclusion
Implement the broker against the authoritative history contract.
Keep source approval separate from activation.
The main risk is treating uncertain delivery or ownership as permission to repeat work.

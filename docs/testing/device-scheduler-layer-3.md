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
| P1 | Existing plugin and consumers | Preserve all existing CI suites | `.github/workflows/check.yml` |

Invalid input, authority, concurrency, partial failure, compatibility, and bounded transport apply.
No UI or physical device test applies. No performance target is specified.
No permanent regression inventory is configured. Existing suites remain required.
New event kinds and reducer changes are not planned.

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

## Required gaps and limits
- No layer-specific required gap is currently known. Final-head verification and CI are still pending.
- Overall stack acceptance remains blocked on serving-app attachment and later layer-4 integration.
- Node `22.23.4` runs in CI, not locally.
- No permanent regression inventory is configured. Existing suites remain selected without inventing a second inventory.
- No throughput, retention, large-result pagination, credential renewal, or live policy update is provided.
  These limits do not prove app acceptance or authorize activation.

## Conclusion
Implement the broker against the authoritative history contract.
Keep source approval separate from activation.
The main risk is treating uncertain delivery or ownership as permission to repeat work.

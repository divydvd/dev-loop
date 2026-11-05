# Durable device scheduler state

## Abstract
This directory implements Task 3 of the approved scheduler plan.
It stores requests, grants, device safety, operation history, and outgoing events in SQLite.
It does not run a service, deliver events, execute device commands, or activate installed tools.

## Store
Use `openStore({ directory })` from `lib/store.mjs`.
The supported POSIX runtimes are Node.js `22.23.4` and `26.12.1`.
Use an absolute, normalized path whose ancestors contain no symlinks.
The parent must exist. On macOS, resolve a trusted temporary parent before creating a test directory.
The store creates the final directory with mode `0700` and `scheduler.sqlite` with mode `0600`.
It rejects incorrect ownership, incorrect modes, symlinks, and database hard links.
It checks the database and SQLite journal paths before access.
The state path must remain under the control of the trusted host user.
These checks do not isolate hostile code running as that same user.

The store migrates a new empty database to schema version 1.
It rejects other schema versions, malformed state, and failed SQLite integrity checks.
The state retains each policy version in increasing order for each device.
The last policy for a device controls new requests; saved requests retain their original resource prerequisites.
Missing policy history, mismatched resources, and conflicting resource holders cause explicit rejection.
`BEGIN IMMEDIATE` serializes writers across handles and processes.
`synchronous=FULL` commits the state and outbox together.
A process interruption before commit leaves neither change visible.
Opening another handle does not imply a crash or revoke a live grant.

The handle exposes three operations:
- `read()` returns a detached state snapshot. It includes `version`, `next`, `policies`, `devices`, `requests`, `events`, and `outbox`.
- `transaction(work)` runs a synchronous callback with the latest state. An exception or invalid state rolls back the transaction.
- `close()` closes that handle.

Only trusted scheduler code can use this handle.
Use `applyEvent` for domain changes. Do not edit grants or device safety through `transaction`.
The later delivery layer can use a transaction to record outbox acknowledgments.
Retain outgoing records because duplicate events refer to their IDs.
No retention, compaction, throughput target, or network acknowledgment API is provided here.

## Authenticated events
Use `applyEvent(store, authenticatedSession, event)` from `lib/queue.mjs`.
The later broker supplies `authenticatedSession: { id, role }`.
The role is `session` or `scheduler`.
Never take either field from device tool arguments or a caller-selected enrollment claim.
This module checks that context; it does not authenticate a connection.

Every event is `{ version: 1, id, kind, payload }`.
Unknown fields, versions, kinds, and invalid payload values cause an explicit error.
Identifiers contain 1–160 ASCII letters, digits, or `_ . : / -`.
Policy versions and grant generations are positive safe integers.
Text fields are nonempty strings of at most 500 characters.
Resource arrays contain at most 32 unique identifiers.
Sparse arrays are invalid. The store rejects missing entries before JSON serialization.

The result is `{ request, outgoingEventIds, replayed }`.
`request` is the committed request snapshot, or `null` for a policy event.
An exact event replay returns its original request and outgoing IDs without another state change or outbox entry.
`replayed` is `false` for a new event and `true` for a replay.
The later runner must execute only a newly admitted operation, never a replay.
If admission or execution is uncertain after a crash, reconcile the saved operation instead of executing it again.
The same event ID with different content or context fails.
Property order does not change event identity.
A repeated request ID must match its original session and request fields.
It never creates another request, even after cancellation or release.

The grant binding below is `{ requestId, device, policyVersion, generation }`.
`device` identifies the exact physical device, not a mutable alias.
The later policy adapter must resolve aliases before submitting a request.
The stored grant also contains `sessionId`, `acknowledged`, `revoked`, and `recovery`.

| Kind | Exact payload | Authority / effect |
| --- | --- | --- |
| `policy` | `{ device, policyVersion, resources, enabled }` | Scheduler only. Version must increase. Revoke affected grants without erasing held resources. |
| `request` | `{ requestId, device, policyVersion, repository, scope, resumeAction }` | Authenticated requester. Save policy resources and queue order. |
| `reserve` | `{ requestId }` | Requester. Reserve the device and all saved resources atomically. |
| `acknowledge` | Grant binding | Requester. Acknowledge the current generation before an operation. |
| `operation_start` | Grant binding plus `{ operationId, purpose }` | Requester. Record the operation before execution. Purpose is `test` or `recovery`. |
| `operation_finish` | Grant binding plus `{ operationId, outcome }` | Requester. Outcome is `complete` or `unknown`. An unknown outcome remains unresolved. |
| `wait_owner` | `{ requestId }`, or grant binding when held | Requester. Save the previous request state; retain held resources. |
| `resume` | `{ requestId }`, or grant binding when held | Requester. Restore the saved state. This record is not proof of owner approval. |
| `cancel` | `{ requestId }`, or grant binding when held | Requester. Revoke an unused grant atomically, or quarantine used ownership. |
| `fault` | Grant binding plus `{ reason }` | Scheduler only. Reason is `timeout`, `crash`, `disconnected`, or `failure`. Quarantine without reassignment. |
| `recover` | Grant binding, including the revoked generation | Scheduler only. Issue a new recovery-only grant to the original session. |
| `release` | Grant binding plus `{ clean, result }` | Requester. Result is `pass`, `fail`, or `blocked`. Record actual cleanup, not only the test result. |

## Queue and safety
`eligibleRequests(store)` returns an advisory snapshot sorted by committed request age.
Reservation checks eligibility again inside the transaction.
An older eligible request takes priority on overlapping resources.
Independent device and host lanes can run together.
An owner-blocked queued request does not block unrelated work.
A held owner-blocked request still holds its resources.
Only a queued owner wait can exist without a holder and grant.

Request states are `queued`, `reserved`, `running`, `waiting_owner`, `recovering`, `blocked`, `released`, and `cancelled`.
Device safety is separate: `safe`, `uncertain`, or `quarantined`.
Starting an operation makes device safety uncertain.
All grant-bound actions check the session, exact device, policy version, and generation.
A stale infrastructure report cannot revoke a newer generation.
Normal grants must match the current enabled policy and a reserved or running request, including its saved owner-wait state.
Quarantined devices require recovery-only grants. Cancelled requests cannot retain live grants.
Operation admission checks the request state, policy, and device safety again before changing state.
Owner waits survive infrastructure faults and recovery grants.

Cancellation frees an unused reservation only when its operation history is empty and device safety is still safe.
The same transaction revokes the grant and increments the generation.
Any recorded operation prevents unused-reservation cancellation, even when that operation completed.
Used cancellation, unclean release, infrastructure loss, and policy revocation retain the holder and all original resources.
Recovery grants preserve those duties after policy revocation; they do not permit new test operations.
The original session must acknowledge the new grant.
Recovery can record a reconciled outcome for an earlier unresolved operation.
An unresolved operation blocks further operations under a normal grant.
A new recovery-only grant can admit recovery operations while the original outcome remains unresolved.
A clean release requires every operation to have a known complete outcome.
Only that explicit release can mark the device safe and free the resources.

An outbox is the set of outgoing event records stored with state changes.
Each record has `{ id, sessionId, kind, request }`.
Its ID is the input event ID plus `:state`.
The broker must inspect committed state and schedule eligible work after changes.
This layer does not promise exactly-once delivery or execution.
Stable operation IDs prevent a second logical start; exact event replay only repeats the recorded response.
The later operation runner must not execute a replayed start as another device action.

## Checks and boundaries
Run `node --test tools/device-scheduler/{state,queue}.test.mjs`.
The [layer matrix](../../docs/testing/device-scheduler-layer-2.md) maps the required cases.
All identities in the tests are synthetic.
Layer 3 owns socket authentication, notifications, delivery acknowledgment, startup reconciliation, and session loss detection.
Layer 4 owns platform policy, operation execution, owner-approval checks, and safe recovery evidence.
Neither source approval nor passing state tests authorizes live monitor cutover.
Layer 1 serving-app attachment and app-executed acceptance remain separate stack gaps.
Its executable SDK repairs and safety stops do not prove serving-app acceptance or a measured improvement.

## Conclusion
Use this state contract before implementing event delivery.
Keep the source inactive until the separate activation decision.
An unresolved operation or uncertain device must never become an available device through elapsed time alone.

# Durable device scheduler state

## Abstract
This directory implements Tasks 3 and 4 of the approved scheduler plan.
It stores requests, grants, device safety, operation history, and outgoing events in SQLite.
Its broker can deliver events over a private Unix socket when a trusted host explicitly starts it.
Importing the source does not start a service, execute device commands, or activate installed tools.

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
Committed event signatures are the authority for request and grant history.
On each read and before commit, the store replays validated events through the same reducer into a detached state.
It compares that state with saved requests, devices, policies, event results, and immutable outgoing fields.
Missing or inconsistent records cause `INVALID_DATABASE_STATE`, including before an exact event replay.
The store never writes the reconstructed state, restores authority, or frees a holder to repair a mismatch.
This is private-state consistency, not protection against code that can rewrite the complete database and its history.
The existing schema remains version 1. Consistent earlier snapshots remain valid; inconsistent snapshots fail without migration or repair.
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
Delivery metadata may extend outgoing records but cannot change their IDs, session, kind, or request snapshots.
The broker records delivery acknowledgments separately from grant acknowledgments.
No retention, compaction, or throughput target is provided here.
History replay adds work as records grow. Future retention or reducer changes need an explicit compatibility design.

## Authenticated events
Use `applyEvent(store, authenticatedSession, event)` from `lib/queue.mjs`.
The broker supplies `authenticatedSession: { id, role }`.
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
Run `node --test tools/device-scheduler/*.test.mjs`.
The [state matrix](../../docs/testing/device-scheduler-layer-2.md) and
[broker matrix](../../docs/testing/device-scheduler-layer-3.md) map the required cases.
All identities in the tests are synthetic.
Layer 3 provides socket authentication, notifications, delivery acknowledgment, startup reconciliation, and session loss detection.
Layer 4 owns platform policy, operation execution, owner-approval checks, and safe recovery evidence.
Neither source approval nor passing state tests authorizes live monitor cutover.
Layer 1 serving-app attachment and app-executed acceptance remain separate stack gaps.
Its executable SDK repairs and safety stops do not prove serving-app acceptance or a measured improvement.

## Local broker
Call `startBroker({ directory, socketPath, policyPath })` from `server.mjs`.
The socket must be a direct child of the private state directory.
The broker creates it with mode `0600`.
It holds an exclusive SQLite lock in `authority.sqlite` until shutdown.
This prevents a second broker from granting through the same state, even with a different socket path.
Process death releases the lock, not device ownership.
Only after acquiring the lock does startup probe an existing owned socket.
An active socket, a foreign socket, a symlink, or a regular file causes explicit refusal.
An inactive owned socket can be removed within the private directory.
Trusted code must not bypass this broker with direct grant mutations.
The lock is not protection against arbitrary code running as the same user.

The handle exposes `shutdown()` and `closed`.
Await `shutdown()` for explicit cleanup. It is idempotent and rejects with `BROKER_FAILED` after an internal failure.
Observe `closed`, which resolves to `{ error: null }` or `{ error: "BROKER_FAILED" }`.
Background state failures close the authority and its connections without publishing database details.
Shutdown and startup quarantine held grants. They never free a resource through elapsed time.
There is no heartbeat, ownership expiry, or automatic timeout transfer.
This layer does not configure deadlines. Any later deadline can alert, never transfer ownership.

### Private enrollment policy
The trusted host supplies an absolute `policyPath` outside Git.
Use a private regular file with mode `0600`, one hard link, the current user as owner, and no symlink ancestors.
Keep its containing directory under trusted host control.
Do not pass enrollment tokens in model tools, shell arguments, logs, or committed files.
The file contains this JSON shape:

```text
{
  "version": 1,
  "sessions": [{ "id": "<host-session-id>", "token": "<64 lowercase hex characters>" }],
  "devices": [{ "device": "<exact-device-id>", "policyVersion": 1, "resources": [], "enabled": true }]
}
```

The host must derive each session ID from its authenticated attachment.
Each token must contain 32 random bytes, encoded as lowercase hexadecimal.
Session IDs and tokens must be unique. The session ID `broker` is reserved.
The file permits at most 256 sessions and 32 distinct devices within one MiB.
Device fields use the state policy contract above.
Policy versions must increase for changes. Restart accepts unchanged fields in a different property order.
The broker reads this file once at startup. There is no live enrollment update API.
Removing a device entry does not revoke saved policy. Submit an increased, disabled policy before removing that device.
Later integration must define safe credential renewal and policy deployment.

Clients cannot select their session ID or role.
All external connections have role `session`; scheduler authority stays inside the single broker.
Clients cannot submit `policy`, `reserve`, `fault`, or `recover` events.
The prefix `broker/` is reserved for internal event IDs.
Layer 4 must define trusted recovery controls; this layer does not expose a recovery-authority endpoint.

### Persistent client
Call `connectBroker({ socketPath, credentials, onEvent })` from `lib/client.mjs`.
The trusted host supplies `credentials: { token }` outside model tool arguments.
The promise resolves only after enrollment.
Only one connection can enroll for each session at a time.
The handle exposes these operations:

| Operation | Result |
| --- | --- |
| `request(event)` | The original `applyEvent` result; automatic scheduling can already have advanced the current request |
| `acknowledge(outgoingEventId)` | Durable `{ acknowledged: true }`; repeated acknowledgments are harmless |
| `reconcile(inputEventId)` | `{ admitted: false }`, or `{ admitted: true, result, request }` with the original result and current request |
| `close()` | Close this connection and await its terminal reason |
| `closed` | A promise with a safe terminal reason, including `ADMISSION_UNCERTAIN` or `EVENT_HANDLER_FAILED` |

`onEvent(outgoingRecord)` receives immutable committed request snapshots in outbox order.
An old `reserve` snapshot is historical evidence, not proof that its grant remains current.
Reconcile current state before acting. The operation admission check remains authoritative.
Persist the consumer's event claim before acknowledging delivery.
Grant acknowledgment is a separate `request()` event; delivery acknowledgment never activates a grant.
Acknowledged outbox rows remain in the database with boolean delivery metadata.

There is no reconnect loop or automatic resend.
After socket loss, unresolved calls reject with `ADMISSION_UNCERTAIN`.
Reconnect once when the host resumes the session, then reconcile the original input event ID.
If admission is absent, submit that same event. If admission exists, use its saved result.
Never replace an uncertain operation with a new operation ID.
An exact replay has `replayed: true`; it must not execute another device action.
Callback failure closes the connection with an observable error and leaves delivery unacknowledged.

The broker sends unacknowledged records on enrollment and new records on the persistent socket.
It schedules the oldest eligible requests after startup and relevant events.
It reserves exact devices and all saved resources through the existing admission reducer.
Owner-blocked queued work does not block unrelated eligible work.
Disconnect quarantines held grants; queued requests remain durable.
Reconnection does not restore a revoked grant or prove cleanup.

### Wire contract and limits
Use UTF-8 newline-delimited JSON objects with at most 65,536 bytes before each newline.
Split UTF-8 sequences and multiple frames per read are supported.
Malformed, oversized, unauthenticated, and extra-field frames cause explicit errors and connection closure.
Domain validation errors return safe fixed codes.
No response contains an enrollment token or raw framework error.

| Direction | Exact frame |
| --- | --- |
| Client enrollment | `{ type: "enroll", token }` |
| Server enrollment | `{ type: "ready" }` |
| Client command | `{ type: "request", seq, event }` |
| Client delivery acknowledgment | `{ type: "ack", seq, eventId }` |
| Client reconciliation | `{ type: "reconcile", seq, eventId }` |
| Server response | `{ type: "result", seq, result }` |
| Server notification | `{ type: "event", event }` |
| Server rejection | `{ type: "error", code }`, with `seq` for a command rejection |

`seq` is a positive safe integer that the client uses to match a response.
It is not a durable event ID.
Socket writes use backpressure; the client bounds queued command bytes.
Outgoing frames have the same size limit. A large historical result can cause `FRAME_TOO_LARGE`.
An output failure does not roll back an already committed event.
Reconcile admission before another action; this layer has no large-result pagination API.
No physical USB notifications, model calls, serving-app wake-up, or device execution are implemented here.

## Conclusion
Use the state and broker contracts before implementing attached-session device tools.
Keep the source inactive until the separate activation decision.
An unresolved operation or uncertain device must never become an available device through elapsed time alone.

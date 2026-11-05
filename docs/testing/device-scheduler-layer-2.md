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
| P1 | Existing plugin and runtime controls | Preserve passing behavior | Existing CI suites and plugin check |

## Selection and limits
No permanent regression inventory is configured in `AGENTS.md`.
This is a setup gap, not evidence that existing tests are absent.
Select all current CI suites and add the scheduler cases.
Invalid input, authority, concurrency, recovery, storage, and compatibility apply.
No UI, accessibility, network delivery, or device procedure exists in this layer.
Performance has no measured target; bounded event input is required, not a throughput claim.
Layer 1 host discovery and executed-task acceptance remain separate required stack gaps.

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
- Independent review and committed-head evidence remain pending. Pre-commit results are not final-head evidence.

## Conclusion
Prove state safety before the broker consumes these interfaces.
Later layers must supply authenticated identities, delivery, and reviewed platform procedures.
The main risk is treating uncertain device state as proof that a device is safe.

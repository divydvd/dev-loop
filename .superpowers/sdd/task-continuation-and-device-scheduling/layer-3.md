# SDD ledger — plan: docs/superpowers/plans/2026-11-05-task-continuation-and-device-scheduling.md

## Abstract
This ledger records Task 4 only.
Earlier layers retain their original evidence.
The approved design and execution method continue without another approval gate.

## Acceptance and pre-flight
- Base: `ff90b514f7aa35eaea76ad18f8265d51e8c4459c`; branch: `divydvd-device-scheduler-events`.
- Acceptance and planned cases: `docs/testing/device-scheduler-layer-3.md`.
- Task 3 produces `openStore`, `applyEvent`, and `eligibleRequests`; Task 4 consumes their exact interfaces.
- Committed event history remains authoritative. Delivery metadata cannot rewrite historical results or remove outbox rows.
- Task 5 consumes `startBroker` and `connectBroker`. No app attachment or device runner is implemented here.
- Ruling: preserve the existing ledger and use this layer-specific file, as the assignment requires.
- Ruling: use a private enrollment policy with server-selected session IDs. Clients provide only a token.
  Tokens remain outside Git and tool arguments. This source accepts synthetic tokens only in tests.
- Ruling: acquire a separate SQLite exclusive authority lock before touching the socket.
  Process death releases that lock. Never use elapsed time or a stale PID to infer device safety.
- Ruling: socket paths must be direct children of the private state directory.
  This bounds stale-socket cleanup to owned private state. A wider socket layout needs later reviewed support.
- Ruling: broker-generated events use a reserved `broker/` prefix. Clients cannot submit that prefix.
  Automatic reservation uses the authenticated requester's saved identity, as required by the existing reducer.
- Ruling: this layer enrolls session clients only. Scheduler authority stays inside the single broker.
  Layer 4 must define any trusted recovery control without accepting caller-selected roles.

## Task 4
Implementation and self-review are complete before independent review.
The source remains inactive.

### Evidence
- The initial required test command fails on the three absent broker modules.
- The first socket implementation passes 15 of 16 cases.
  The remaining case used an ignored test-helper argument instead of an actual reserved event ID.
  Correct the test input, not production behavior. All 16 cases then pass.
- The inherited state and queue selection passes all 93 cases unchanged.
- Malformed event IDs and duplicate device policy each fail behaviorally before correction.
  Guard the ID before prefix inspection. Validate private device policy before any policy event.
- Background state failure lacks a safe terminal result before correction.
  The broker now exposes `closed` and releases its socket and authority lock with an explicit error.
- Reordered policy properties fail restart before correction.
  Derive policy event IDs from exact device identity and version rather than object property order.
- Expanded scheduler tests pass 114 cases at the intermediate source.
- Full pre-commit selection passes 411 cases, zero failures, and one inherited filesystem skip.
  `node scripts/check.mjs` reports no faults.
- Added startup-before-scheduling and cross-process authority cases after that run.
  Final verification follows after committing the reviewed content.

### Self-review
- New production modules total 309 lines before independent review, below the approved estimate.
- No reducer, event kind, schema version, or historical immutable field changes.
- Responses and replay retain original committed results. Reconciliation also returns the current request.
- Delivery acknowledgments add only boolean metadata and never remove outbox rows.
- All connection identities come from private enrollment records; no external scheduler role exists.
- Deadlines are not configured. No elapsed time transfers device ownership.
- Device runners, physical events, serving-app wake-up, live activation, and work-ledger access remain excluded.
- No rule or skill changes; temporary-home installation is not in this layer's tier.
- No flow docs exist in this repo; README is updated.
- No deferred Minor finding is recorded.

## Independent review and correction
- Reviewer: `scheduler-events-review`, independent code-review agent.
- Reviewed: complete `ff90b51..378444e` diff, state interactions, matrix, docs, CI, and rulings.
- It ran all 118 scheduler cases and 64 other non-ledger checks on Node `26.12.1`.
  Both selections passed. It did not use the installed work-ledger.
- Finding: one slow client can exhaust its response buffer and abort the complete authority.
  This revokes unrelated running grants through quarantine.
- Confirmed RED: the two-client regression fails with the unrelated client's `ADMISSION_UNCERTAIN`.
- Fix: classify response backpressure as peer-local. Mark that peer ended before destroying its socket.
  Remaining buffered commands cannot mutate state.
- GREEN: all 119 scheduler cases pass. The unrelated operation remains running with its grant unchanged.
- Production source now totals 310 lines. No history, schema, reducer, or event-kind changes.
- No other finding or deferred Minor was reported.
- Focused independent coverage of the correction follows before first push.
- Reviewer `scheduler-events-correction-review` covered `378444e..1601122`.
  It found no new Critical or Important issue.
  Its two-holder probe preserved the unrelated grant, quarantined the slow peer's own holder,
  ignored trailing mutation commands, and retained immutable event/outbox history.
  All 119 scheduler cases passed independently.
- The complete review plus focused correction coverage accounts for final substantive source.
  Subsequent changes record evidence only.
- Task 4 source and independent review are complete. Publication and final-head CI remain pending.

## Publication and automatic review round 1
- PR #30 targets `divydvd-device-scheduler-state`; first push: `5acd3db1283a5c6392068bf0db4749e56f911f90`.
- Local final-head selection: 414 passed, zero failed, one inherited filesystem skip.
  Plugin check reports no faults. All three CI jobs pass, including Node `22.23.4` and `26.12.1`.
- The automatic review found four real faults. Each has a behavioral RED before its correction:
  matching layer-2 policy history rejects first startup; non-string kinds abort the authority;
  oversized background delivery aborts unrelated clients; failed validation replies allow trailing buffered admission.
- First-start correction reads authoritative saved policy. It adopts an identical current policy without another event.
  It rejects changed equal versions and older configuration. No saved result or history is rewritten.
- An additional policy rollback RED confirms that exact historical replay must not accept stale startup configuration.
- Delivery correction closes only the recipient of an oversized notification.
- Input correction rejects non-string event kinds before reducer property lookup.
- Socket correction marks the peer ended before destroying it after any validation-response failure.
- GREEN: all 124 scheduler cases pass. New production modules total 322 lines.
- The buffered-command case injects a precise socket-write failure; the asserted result is real committed state.
- The oversized-record case uses valid extra delivery metadata; no immutable field changes.
- Focused independent review and final-head checks follow before the round-1 correction push.
- Reviewer `scheduler-events-round-one-review` covered `5acd3db..eba4e98` and the affected interactions.
  It found no new Critical or Important issue.
  It independently passed all 124 scheduler cases and the plugin check on Node `26.12.1`.
- The existing complete review plus both focused reviews accounts for final substantive source.
  The following commit records evidence only.

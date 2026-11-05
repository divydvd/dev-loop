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

## Automatic review round 2
- Correction push `51c91c276e9973574dcdc287725ca5a4ab50e72d` passes all three CI jobs.
  Final local selection: 419 passed, zero failed, one inherited filesystem skip. Plugin check reports no faults.
- The review confirms all four round-1 corrections and reports two real remaining paths.
- RED: a raw `allowHalfOpen` client receives rejection but retains enrollment, preventing reconnect with `SESSION_CONNECTED`.
- Fix: destroy the rejected socket after its terminal error flushes. The close handler quarantines its holder.
- RED: a release response exceeds 65,536 bytes after 320 completed operations.
  The next grant commits, but the waiting connection receives no notification.
- Fix: publish committed changes in the response path's finalization, even after response encoding fails.
- The large history is staged with the real admission reducer, then committed through the normal validating store.
  Only allowed delivery acknowledgment metadata is added. No immutable result or outgoing field is rewritten.
- GREEN: all 126 scheduler cases pass, including the 93 inherited cases.
- Production source totals 327 lines. No reducer, event kind, or schema change occurs.
- This is the second and final automatic correction round.
  Read the next review without another corrective push. Report any remaining required finding honestly.
- Focused independent review and final-head checks follow before the final correction push.
- Reviewer `scheduler-events-round-two-review` covered `51c91c2..41b548f` and affected interactions.
  It found no Critical or Important issue.
  All 126 scheduler cases and the plugin check passed independently on Node `26.12.1`.
- Complete initial review and three focused correction reviews account for final substantive content.
  The following commit records evidence only. Final-head local and CI results belong in PR #30.

## Paused continuation after the correction stop
- The final review at `c800e25` reports B16 and B17. Private probes confirm both failures.
  PR #30 was converted to draft, and the coordinator received the blocker report.
- The session received an autopilot continuation: "Keep working autonomously until the task is truly finished, then call task_complete."
- The coordinator checked the underlying transcript and found no separate direct owner authorization for another correction round.
- Ruling: the autopilot continuation is not verified owner authorization. Pause further correction and publication.
  Preserve the two new uncommitted regressions. No production change, new commit, or push occurred.
  The coordinator will obtain the owner's decision. Do not request another Copilot review.
- Required B16: reject a peer whose notification output is blocked; remove enrollment and quarantine its holder.
- Required B17: initial replay must let callbacks acknowledge and reconcile through the awaited client handle.
- Add both permanent regressions before implementation. Repeat independent review and final-head checks before publication.

## Verified additional-cycle approval and implementation
- The owner selected "Authorize one additional broker correction cycle (Recommended)" through `ask_user`.
  The coordinator also confirmed its explicit owner answer and authorized only one B16/B17 correction cycle.
- The attempted answer-forward to the coordinator found its question already resolved; no duplicate answer was applied.
- Four behavioral regressions fail before implementation. Asynchronous invalid-input rejection remains a passing control.
- The first blocked-output regression settled too early and passed before correction.
  The private probe still confirmed the bug. Fix the fixture precondition, not production behavior.
  The test-only settling window then confirms actual blocked bytes and reproduces the failure.
- Terminal rejection now detaches the registered connection before attempting its error write.
  It quarantines the holder without waiting for a flush and destroys blocked sockets.
- Idempotent cleanup compares the registered connection, so a delayed old close cannot detach or quarantine its replacement.
- Replay callbacks run on the next event-loop turn, after the awaited handle assignment.
  The async function and invalid-input promise rejection remain unchanged. No production readiness timer is added.
- GREEN: all 131 scheduler cases pass, preserving the 126 earlier cases and 93 inherited state cases.
- Production modules total 335 lines. No reducer, event kind, schema, or historical field changes.
- Focused independent review and final-head checks follow before the single additional-cycle push.
- Reviewer `scheduler-events-approved-cycle-review` covered `c800e25..18d1e8a` and the affected lifecycle interactions.
  It found no Critical or Important issue.
  It independently passed all 131 scheduler cases and the plugin check on Node `26.12.1`.
  Supplemental probes checked callback order, callback suppression after close, ignored rejected commands, and retained resources.
- The earlier complete review and focused reviews account for all substantive content.
  The following commit records review evidence only. Final-head local and CI evidence belongs in PR #30.
- This uses the single additional owner-approved correction cycle.
  Read any automatic review after publication. Do not start another correction cycle, merge, or activate services.

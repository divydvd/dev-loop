# Device session cancellation correction

## Abstract
Cancellation cannot detach an enrollment that has no ready handle.
A queued reconnect can also enroll after cancellation and revoke trusted recovery.
This approved dependent layer corrects both faults without changing owner authority.

## Acceptance record
- Goal: detach pending enrollment and prevent every terminal-session reconnect.
- Done when: C1-C6 pass, independent review covers the complete correction, and both CI runtimes pass.
- Required evidence: failing-before tests, exact tested commit, plugin check, all CI suites, and review findings.
- Base: PR #31, `divydvd-device-testing-integration`, `8d0cba081cc63cdb5c139655ceefeb2962d76a7f`.
- Authority: the owner approved the cancellation correction and one review round, with this necessary split.
- Size estimate: 20-35 added and 4-8 replaced production lines. Tests and documents do not count.
- Stop: no further correction round, merge, activation, installation, live work-ledger access, or physical device use.
- Execution: native implementation of the existing approved correction. Preserve the inherited spec and plan.

## Required cases
| ID | Requirement / risk | Input and expected result | Test |
| --- | --- | --- | --- |
| C1 | Pending enrollment cleanup | Withhold ready; native abort, owner stop, and explicit close detach without ready | `tools/task-runtime/device-session.test.mjs` |
| C2 | Host abort contract | Pre-aborted signal rejects asynchronously before socket creation; pending enrollment aborts | `tools/device-scheduler/client.test.mjs` |
| C3 | Connected uncertainty | Abort rejects pending calls, preserves completed results and terminal reason, removes listener, and closes socket | `tools/device-scheduler/client.test.mjs` |
| C4 | Terminal reconnect and recovery | Run queued resume after stop or halt; no enrollment or recovery-grant revocation | `tools/task-runtime/reconnect.test.mjs` |
| C5 | Existing consumers and safety | Normal reconnect, retained resources, quarantine, trusted recovery, and owner boundaries remain effective | Runtime and scheduler suites |
| C6 | Project tier and compatibility | Plugin check, all CI suites, Node 22.23.4 and 26.12.1 pass | `.github/workflows/check.yml` |

All cases are required. The profile has no permanent regression inventory.
Use existing permanent tests and add these fault regressions in the same PR.
Input boundaries, state transitions, concurrency, cleanup, recovery, and compatibility apply.
No UI, data migration, throughput target, physical-device check, or skill instruction change applies.

## App evidence reassessment
D6 actual-app queue, wake, action, verify, and release evidence remains pinned to `1ae98b7cacf1f8229b759a15591d4993b9530866`.
This correction changes cancellation lifecycle code, not that historical identity.
No new app execution or installation is authorized.
Independent review must decide whether a required changed-lifecycle app gap remains.
Automated socket tests are not execution of these bytes in the serving app.
Reviewer `device-cancellation-review` requires no new app check for this bounded host-local transport correction.
The correction does not change SDK event wiring, tool registration, or permissions.
Historical D6 remains historical. No app execution of this correction is claimed.

## Execution ledger
- Preflight: clean checkout; HEAD equals the confirmed parent. PR #31 is open and draft with the matching live head.
- Root cause: the adapter has no transport handle until ready; its connect entry omits terminal-state checks.
- Interface: add an optional host signal to the client; retain all current handles and callers.
- RED: all ten new cases fail on parent `8d0cba0` plus test additions. Node 26.12.1.
  Command: `node --test --test-name-pattern='host abort|pre-aborted|ordinary close|detaches pending|queued reconnect after' tools/device-scheduler/client.test.mjs tools/task-runtime/device-session.test.mjs tools/task-runtime/reconnect.test.mjs`.
  Pre-abort wrongly resolves; pending sockets stay open; connected abort does not detach.
  Queued reconnect revokes trusted recovery in all three stop/halt cases.
  Private artifact: `cancellation-red.log`, ten failures, zero cancellations.
- GREEN: all 46 focused cases pass on the corrected working tree. Node 26.12.1.
  Command: `node --test tools/device-scheduler/client.test.mjs tools/task-runtime/device-session.test.mjs tools/task-runtime/reconnect.test.mjs`.
  Private artifact: `cancellation-green.log`.
- The existing late-ready fixture writes after cancellation and reports expected `EPIPE`.
  It now checks cancellation-specific socket errors, not a broad ignored error.
  No production retry, timeout, or safety change handles this fixture result.
- Actual production size: client 6 added/1 removed; adapter 8 added/3 removed. Total 14 added/4 removed.
  The complete correction is smaller than estimated. No source compression or cleanup omission is used.
- Ruling: close uses a settlement barrier because abort intentionally rejects unfinished enrollment.
  Enrollment callers retain explicit errors; the barrier awaits both pending enrollment and connected closure.
  This does not release a device or classify uncertainty as success.
- The inherited default local full tier timed out the unchanged 30-second backpressure case twice.
  Parent serial evidence is 546 passes and one existing skip. Preserve that limitation and every timeout.
  Run the same complete serial tier at this layer's final head.
- Independent review: `device-cancellation-review` covers complete staged tree `1fb55b262292faed5b1897460859e7e6f4df5b85`,
  plus the layer-4 ledger addition and relevant consumers.
  It finds no significant issue. It confirms the exact 14 added/4 removed production size.
- Reviewer checks: 46 focused tests, 102 bounded interaction tests, four retention cases, and four in-memory probes pass.
  The plugin check reports no faults. Node 26.12.1.
  The reviewer checks failure-path listener removal, socket-creation abort, ready/abort racing, and repeated close.
  A synthetic execution probe preserves uncertainty, holdings, resources, quarantine, and trusted recovery.
  These additional probes are not permanent regression tests or app execution.
- Acceptance ruling: C1-C5 are supported. C6 has complete local evidence below; final-head CI remains pending.
- Local close is not broker-side retirement acknowledgment.
  Trusted recovery still waits for broker status to confirm requester detachment.
- Only review and test result metadata follows independent review.
- Complete source check at `c29b5b5747161f91f69a839774af45e241690893`, Node 26.12.1:
  `node scripts/check.mjs` reports no faults.
- Complete project tier at the same commit:
  `node --test --test-concurrency=1 scripts/*.test.mjs tools/work-ledger/*.test.mjs tools/task-runtime/*.test.mjs tools/device-scheduler/*.test.mjs`.
  Result: 556 passed, zero failures, zero cancellations, one existing platform skip; 161.9 seconds.
  Private artifact: `cancellation-full-source.log`.
- Repeat these checks after this evidence-only commit. Record that exact tested/pushed head in the PR evidence.
  Required CI uses default file scheduling on Node 22.23.4 and 26.12.1.
- Pending: dependent publication, final-head CI, and automatic review. No further correction round is authorized after this one.

## Conclusion
Keep terminal cancellation effective before enrollment and after queued reconnect.
Publish only this dependent layer against PR31.
The main risk is delayed detachment revoking a trusted recovery grant.

## Owner-authorized terminal-reason correction
### Acceptance and authority
- The owner selected `Authorize the terminal-reason fix and one review round (Recommended)` in the coordinator's `ask_user`.
  The coordinator reports this direct owner choice. This is not an inferred agent or Autopilot approval.
- Goal: preserve the first terminal reason when later callbacks reject during transport closure.
- Done when: permanent T1-T3 cases and existing cancellation controls pass, focused review covers the correction, and final-head CI passes.
- Base for this correction: published PR33 head `45b140cc7c57f02518a6ee09d4b214f164f5d484`.
- Required evidence: failing-before race regressions, focused controls, complete project tier, both CI runtimes, and final automatic review.
- Size estimate: about eight added/two replaced production lines; keep the complete dependent PR below 400.
- Stop: one bounded correction/review round only. No further round, merge, activation, installation, live work-ledger, or device use.

### Required matrix
| ID | Risk / input | Expected result | Permanent test |
| --- | --- | --- | --- |
| T1 | Host abort rejects an in-flight event handler | Keep `CONNECTION_ABORTED`; preserve completed results and uncertain pending calls; remove listener | `client.test.mjs`: first abort reason |
| T2 | Explicit close then host abort rejects a handler | Keep the first close reason; repeat close remains stable | `client.test.mjs`: first close reason |
| T3 | Socket fails before readiness | Keep explicit `CONNECTION_FAILED` and clean listener despite automatic socket destruction | `client.test.mjs`: socket connection failure |
| T4 | Prior cancellation, reconnect, recovery, and consumer controls | C1-C6 remain required and pass at the final head | Existing focused and complete suites |

### Root cause and execution
- Final review `5796521111` at `45b140c` reports one medium finding.
  The handler rejection catch calls `stop("EVENT_HANDLER_FAILED")` before socket close and overwrites the abort reason.
- The real-socket diagnostic fails at that exact head: expected `CONNECTION_ABORTED`, actual `EVENT_HANDLER_FAILED`.
- Ruling: record the first stop independently of `socket.destroyed`.
  Node can mark a failed socket destroyed before the error callback supplies `CONNECTION_FAILED`.
  A destroyed-socket guard would hide that explicit error.
- Route explicit close through the same terminal transition, without changing its initial `ADMISSION_UNCERTAIN` reason.
- RED at `45b140c` plus new tests: two expected race failures and one passing connection-error control.
  Both first-reason cases incorrectly return `EVENT_HANDLER_FAILED`.
  Command: `node --test --test-name-pattern='first (abort|close) reason|socket connection failure' tools/device-scheduler/client.test.mjs`.
  Artifact: `terminal-reason-red.log`.
- Add an idempotent first terminal transition. Explicit close uses that transition.
  Socket closure also locks the recorded reason against late callbacks.
- GREEN: all 49 client, attached-session, and reconnect cases pass on the corrected source snapshot.
  Command: `node --test tools/device-scheduler/client.test.mjs tools/task-runtime/device-session.test.mjs tools/task-runtime/reconnect.test.mjs`.
  Artifact: `terminal-reason-green.log`.
- Scoped production size: 9 added/2 removed lines. Complete PR33: 23 added/6 removed production lines.
  No source compression, cleanup omission, timeout increase, or disabled test is used.
- Focused reviewer `device-terminal-reason-review` covers complete staged tree `d735fbd3b79e8a87940acc1115c66c960534057d`
  against correction base `45b140cc7c57f02518a6ee09d4b214f164f5d484`.
  It finds no significant issue and confirms both production counts.
- Reviewer verification: 49 focused cases, 32 execution/continuation interactions, eight retention/retirement cases,
  and 12 terminal-order probes pass on Node 26.12.1. The plugin check reports no faults.
  It independently runs the permanent cases against base source: T1-T2 fail as expected; T3 passes.
- Source and additional probes cover EOF/error ordering, already-destroyed first errors, and rejection after closure.
  These probes are not permanent regressions or app execution.
- T1-T3 are supported. T4 bounded controls pass; complete final-head tier, CI, and automatic review remain required.
- No new required app check arises. SDK wiring, tools, and owner authority remain unchanged.
  Keep D6 at its historical identity. Local close remains distinct from broker-side retirement.
- Only review result metadata follows this focused review.
- Pending: final-head tests, one push, CI, and final automatic review. Stop if a new required finding remains.

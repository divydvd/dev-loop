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
| C3 | Connected uncertainty | Abort rejects pending calls, preserves completed results, removes listener, and closes socket | `tools/device-scheduler/client.test.mjs` |
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

# Attached device testing evidence

## Abstract
This layer implements approved Tasks 5–6 above broker commit `088b91678f62048c637845fef8480aba6508b795`.
It adds scoped execution, attached tools, trusted recovery, and a reusable reference.
Production activation and actual phone acceptance remain outside this task.

## Acceptance record and selection
The approved plan and spec remain unchanged.
The [execution ledger](../../.superpowers/sdd/task-continuation-and-device-scheduling/layer-4.md) records rulings and review.
The project has no permanent regression inventory or app device tier.
All D1–D8 cases are required.

| Case | Requirement / risk | Concrete evidence | Result |
| --- | --- | --- | --- |
| D1 | Physical identity, Android serial, iOS UDID/helper, stale program/policy | `policy.test.mjs`, `runner.test.mjs`, `execution-broker.test.mjs` use private synthetic bindings and changed pins | passed on source snapshot |
| D2 | Unknown procedure, shell text, session and token mismatch | Runner and attached tests deny execution; native permission metadata stays unset | passed on source snapshot |
| D3 | Admission, duplicate IDs, uncertainty, surviving process | Runner cases assert one action, complete/unknown history, conservative process recovery, and forged-evidence denial | passed on source snapshot |
| D4 | Safe release, restart, trusted recovery, cancellation | Managed broker tests cover verified handoff, restart, requester-frame denial, and recovery after cancellation | passed on source snapshot |
| D5 | Busy turns, owner waits, cancellation, reconnect | Attached tests use enqueue mode, owner-wait transitions, native abort, and real socket-recreation delivery | passed on source snapshot; not app proof |
| D6 | Two disposable actual app sessions | Actual queue, attached SDK grant, idle resume, one permitted synthetic action per session | passed at `1ae98b7`; observations below |
| D7 | New reference and baseline safety | Fresh requester and monitor baseline/candidate agents below | passed as sampled reference decisions |
| D8 | Existing consumers and installation | Plugin check, all CI suites, temporary-home discovery | passed locally and in both CI runtimes at `1ae98b7` |

Invalid input, authority, concurrency, retries, partial execution, existing consumers, restart, and runtime compatibility apply.
No physical UI, USB event, signing, protected-data, or phone acceptance claim follows from these synthetic checks.
No performance requirement is specified. History replay remains unchanged.
Required gaps prevent a complete-stack ready claim.

## Failing-first and regression evidence
The initial policy/runner cases fail against empty behavior stubs before implementation.
Managed broker cases reject the missing execution-policy contract before integration.
Attached cases fail because the tools do not exist before registration.

Independent enforcement review finds five concrete gaps:
- A requester acknowledgment can forge safety evidence through an execution-shaped event ID.
- A replacement runner can release while an earlier process still runs.
- Oversized status can stop unrelated broker authority.
- Idle requesters cannot reconnect without another model call.
- A mislabeled private token can authenticate a different host identity.

Four permanent regressions reproduce the first, second, third, and fifth findings before correction.
The reviewer provides the original missing-reconnect probe; a permanent real-socket test now proves delivery after restart without model polling.
Corrections reserve internal namespaces, check actual execution history, journal process state, bound status, and verify authenticated identity.
The adapter watches socket creation and makes event-driven reconnect attempts.
It preserves uncertain message admission and never repeats an operation.
An additional shutdown regression reproduces trusted recovery escaping the normal execution barrier.
The final integration review finds cancellation during enrollment, unheld owner transitions, and lazy attachment after restart.
Permanent tests reproduce each gap before correction.
Late enrollment now closes without mutation, queued transitions use `generation: null`, and attachment enrolls immediately.
Focused final cases pass 15/15 after these changes.

## Fresh reference consumers
This is a reference skill, not a change to continuation or testing instructions.
Fixed scenarios precede skill authorship.
Fresh consuming agents receive only their role, scenario, and relevant reference paths.
These results are simulated decisions, not actual device execution or serving-app acceptance.

| Group | Consumer | Raw results |
| --- | --- | --- |
| Baseline requester | `device-reference-baseline` | Exact requester schemas and trusted recovery are unavailable; safety controls remain correct |
| Baseline monitor | `device-monitor-baseline` | Trusted recovery and cutover contracts are unavailable; Android/iOS and merge controls remain correct |
| Candidate requester | `device-requester-candidate` | 5/5 cases: exact request/status/ack/run calls; owner question; uncertain operation; failed cleanup; native permission |
| Candidate monitor | `device-monitor-candidate` | 4/4 cases: trusted recovery and PID limits; iOS limits; merge/review boundary; cutover/rollback |
| Focused candidate | `device-queued-reference-candidate` | Correct null-generation wait/resume/cancel objects; no inferred approval |

The candidate uses generation 3 and stable operation `action-1` without introducing a caller-selected session.
Both candidates reject Autopilot text as merge approval or authority to extend review rounds.
Both retain uncertain ownership.
No sampled decision authorizes an unsafe action.
Baseline missing-contract results are not newly reproduced safety failures.
No improvement percentage is claimed.

The lower continuation evidence remains historical: 21/21 per SDK group with zero baseline continuation faults.
Its 42 records were rescored after a scorer correction.
This layer does not describe that rescoring as fresh execution.

## Published source checks
- Published and app-tested source: `1ae98b7cacf1f8229b759a15591d4993b9530866`, draft PR #31.
- Base: `088b91678f62048c637845fef8480aba6508b795`, branch `divydvd-device-scheduler-events`.
- `node scripts/check.mjs` reports no faults.
- `node --test scripts/*.test.mjs tools/work-ledger/*.test.mjs tools/task-runtime/*.test.mjs tools/device-scheduler/*.test.mjs`
  reports 533 passes, zero failures, and one existing platform skip on Node `26.12.1`.
  The earlier 530-pass result and 48 focused passes preceded the last adapter corrections.
- A temporary `COPILOT_HOME` registers this local checkout and installs only there.
  `copilot instruction list` discovers `dev-loop: core`.
  `copilot skill list` discovers all five plugin skills, including `device-testing`.
  The local marketplace loads the checkout directly; this is discovery, not a copied installation claim.
- Existing CI discovery already selects both new test directories on Node `22.23.4` and `26.12.1`.
  No new CI workflow is needed.
- Remote `check`, `task-runtime (22.23.4)`, and `task-runtime (26.12.1)` pass at this exact source head.
  Node `22.23.4` is not locally installed.
- No live work-ledger service, monitor, production guard, or device configuration is read or changed.
  Existing work-ledger source tests run only as the unchanged required CI tier.

## Actual app acceptance
Serving app `1.1.34` runs two disposable chats with the device-only entry point.
Both install `tools` from exact commit `1ae98b7cacf1f8229b759a15591d4993b9530866`.
Both specify `scope: "session"`; neither uses the default user scope.
The installed `extension.mjs` SHA-256 is `d4b073c52a08d96fd2c36bcdf705a4f137794044cc7c0138abcf94a7e49c9074`.
The installed `task-runtime/lib/device-session.mjs` SHA-256 is `3c0ec4338b6f4c0627ea5b97056ec4e133a551039f293644fff6e7caff5d5558`.
Both hashes match the published source in each session.

| Role | Actual attached session | Observed result |
| --- | --- | --- |
| Holder | `d7e55d08-0494-4b83-bdab-0468ce10b93b` | Reserved generation 1; acknowledged; one `act`; one `verify`; released with pass |
| Requester | `2885eff8-1517-44f5-88e4-b9df8a8beed9` | Queued with no grant; stopped; received attached SDK grant; acknowledged generation 3; one `act`; one `verify`; released with pass |

The broker snapshot confirms holder reservation and requester queue before release.
No coordinator or holder message resumes the requester after it stops in the queue.
Its attached SDK notification supplies event `broker/reserve/d9f90ab75da70a8c8ad8daec3af63f17e38a92c45d46563413007fbea9923325:state`.
The private notification journal records admitted delivery and its SDK message ID.
The requester reports this same event, checks fresh status, and uses the exact current generation.
The immutable outgoing snapshot remains reserved while final request state is released.
Stable operation IDs are `app-holder-act-1`, `app-holder-verify-1`, `app-requester-act-1`, and `app-requester-verify-1`.
All four outcomes are complete and not replayed.
The synthetic helper records exactly two `act` entries and two `verify` entries.
Final state shows both requests released, both grants revoked, and both device lanes safe without holders.

The first 122-byte socket path returns `DEVICE_CONNECTION_FAILED` in the serving extension.
A local Node client connects to that same socket.
The old empty broker then shuts down before the sole broker restarts with a 46-byte private socket path.
The serving extension connects without a source change, reinstall, or permission workaround.
One incorrect intermediate setup places the socket outside its state directory; startup correctly rejects it with `UNSAFE_SOCKET`.
The corrected fixture keeps the state and socket together.
The setup reference now rejects paths above 90 UTF-8 bytes before writing enrollment.
These observations establish host path sensitivity, not its exact implementation or maximum supported path length.

Neither installation nor device calls expose a native permission prompt in this run.
No native permission decision is inferred.
The inherited C1 native UI evidence remains separate.
A future native prompt still requires the real owner UI; `ask_user` cannot replace it.
This run proves actual serving-app synthetic Android handoff, not physical phones, USB events, iOS signing, or combined guard activation.
Synthetic iOS binding and helper enforcement remain automated D1–D4 evidence.

Both released sessions are archived through the supported app lifecycle.
Their exact returned session installations and owned enrollment/notification files are removed after archival.
The sole broker reports shutdown `{error:null}`.
The private short socket directory is removed after saving its database.
Private state, operation journal, queued/final snapshots, and correlated acceptance record remain in session artifacts.
No production grant authority, guard, work-ledger service, or live device is activated.

## Stack and publication
The coordinator registers native stack 32 in order #28, #29, #30, #31, with base `main`.
The dependent PR bases remain unchanged.
Lower heads `b2b6cc3`, `ddef9ce`, and `088b916` retain passing CI and automatic Copilot checks.
PR #31 remains draft while the final documentation review and publication checks finish.
Its exact final evidence-only head and CI results belong in the PR evidence table.
Later documentation does not change the app-tested runtime source.

## Independent coverage
`device-enforcement-review` covers Task 5 enforcement and the state/broker/adapter interactions.
It reports the five findings above and does not sign off on enforcement.
Its source tests pass but do not cover those missing cases.
Focused later coverage must verify the corrections.
`device-final-integration-review` covers risky Task 6 instructions and the complete layer at tree `f89a04e61db8566774a005bca5a3affe73851e37`.
It verifies the earlier enforcement corrections and finds the three later adapter gaps above.
Its required combined suites report 531 passes, zero failures, and one existing platform skip.
`device-final-correction-review` covers the final adapter corrections and matching reference change at tree `f31351e685acdb3ed6d045aedf5511554e9394f2`.
It finds no significant issue and runs 15 focused cases plus 10 queue cases successfully.
The plugin check reports no faults.
Later evidence-only changes record these results; they do not change runtime or instruction behavior.
`device-evidence-review` checks the later four-file documentation diff against the private acceptance record and queued/final snapshots.
It finds no significant issue in evidence, setup, authority limits, or cleanup claims.
This is artifact review, not an independent claim of personally observing the app run.
Only review-result metadata is added after that focused review.

## Conclusion
Actual serving-app synthetic handoff now passes without a coordinator nudge.
Finish the documentation review and exact-head publication checks before reporting the stack ready.
Live cutover still needs a separate owner decision.
The main risk is extending synthetic evidence into physical-device or production authority.

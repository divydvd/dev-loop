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

| Case | Requirement / risk | Concrete evidence | Status before publication |
| --- | --- | --- | --- |
| D1 | Physical identity, Android serial, iOS UDID/helper, stale program/policy | `policy.test.mjs`, `runner.test.mjs`, `execution-broker.test.mjs` use private synthetic bindings and changed pins | passed on source snapshot |
| D2 | Unknown procedure, shell text, session and token mismatch | Runner and attached tests deny execution; native permission metadata stays unset | passed on source snapshot |
| D3 | Admission, duplicate IDs, uncertainty, surviving process | Runner cases assert one action, complete/unknown history, conservative process recovery, and forged-evidence denial | passed on source snapshot |
| D4 | Safe release, restart, trusted recovery, cancellation | Managed broker tests cover verified handoff, restart, requester-frame denial, and recovery after cancellation | passed on source snapshot |
| D5 | Busy turns, owner waits, cancellation, reconnect | Attached tests use enqueue mode, owner-wait transitions, native abort, and real socket-recreation delivery | passed on source snapshot; not app proof |
| D6 | Two disposable actual app sessions | Queue, supported attached grant, resume, one permitted synthetic action | not run before pinned source publication |
| D7 | New reference and baseline safety | Fresh requester and monitor baseline/candidate agents below | passed as sampled reference decisions |
| D8 | Existing consumers and installation | Plugin check, all CI suites, temporary-home discovery | passed locally; final-head and remote CI pending |

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

## Local checks before publication
- `node scripts/check.mjs` reports no faults.
- `node --test scripts/*.test.mjs tools/work-ledger/*.test.mjs tools/task-runtime/*.test.mjs tools/device-scheduler/*.test.mjs`
  reports 530 passes, zero failures, and one existing platform skip on Node `26.12.1`.
- A focused correction run reports 48 passes, zero failures.
- A temporary `COPILOT_HOME` registers this local checkout and installs only there.
  `copilot instruction list` discovers `dev-loop: core`.
  `copilot skill list` discovers all five plugin skills, including `device-testing`.
  The local marketplace loads the checkout directly; this is discovery, not a copied installation claim.
- Existing CI discovery already selects both new test directories on Node `22.23.4` and `26.12.1`.
  No new CI workflow is needed.
- Node `22.23.4` is not locally installed; remote CI remains required.
- No live work-ledger service, monitor, production guard, or device configuration is read or changed.
  Existing work-ledger source tests run only as the unchanged required CI tier.

## Actual app acceptance
Pending pinned-source publication and two disposable session-scoped installations.
The installer defaults to user scope; every disposable request must specify `scope: "session"`.
Native permission needs the real owner UI.
An `ask_user` answer cannot substitute for that permission.
SDK doubles, socket tests, and CLI runs do not establish this case.
Retain exact session identities, installed source hash, queued/granted observations, action counts, native decisions, and owned cleanup here.

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

## Conclusion
Publish only with explicit required-gap status until actual app acceptance and final-head checks pass.
Use synthetic procedures and exact owned cleanup.
The remaining risk is claiming app recovery from transport-only evidence or bypassing native owner permission.

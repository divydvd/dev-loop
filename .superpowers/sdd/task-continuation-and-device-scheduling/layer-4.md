# Layer 4 execution ledger

## Abstract
Implement approved Tasks 5–6 above broker commit `088b91678f62048c637845fef8480aba6508b795`.
Keep production activation, live devices, installed guards, and work-ledger access outside this task.
Actual app acceptance needs two disposable sessions and native installation permission.

## Acceptance record
- Goal: attach authenticated device tools and execute only pinned platform procedures.
- Done when: required D1–D8 cases pass, independent reviews cover final content, and the dependent PR passes CI.
- Evidence: exact commit, test commands, fresh consumers, temporary-home discovery, and actual app observations.
- Stop: retain all owner approval limits; report any required gap as not ready.
- Size estimate: policy 80, runner 100, broker integration 65, attached adapter 130, extension wiring 10; about 385 production lines.
- Base and ancestry: HEAD equals `088b916`; settled state `ddef9ce` and continuation `b2b6cc3` are ancestors.

## Pre-flight and rulings
| Producer / consumer | Interface | Decision |
| --- | --- | --- |
| State / runner | Durable operation admission and immutable event results | Execute only a new committed start; never execute replay. |
| Broker / adapter | Host-bound enrollment and durable delivery | Private enrollment must match attached identity; tool arguments cannot select it. |
| Runner / release | Unresolved operations and cleanup evidence | Clean release requires a completed pinned verification after all actions. |
| Broker / recovery | Requesters cannot send recover or fault | Expose an in-process trusted control handle; keep requester frames forbidden. |

Ruling: retain the approved plan and spec unchanged.
Save this layer's state here and in `docs/testing/device-testing-layer-4.md`.
Ruling: preserve legacy broker clients when no execution policy exists.
Execution-enabled sessions cannot bypass the runner through raw operation or clean-release frames.
Ruling: named procedures have fixed argument arrays with device/helper substitutions and no caller arguments.
Each distinct permitted action needs its own pinned procedure. This reduces untrusted input without losing approved scope.
Ruling: no source change alters continuation or stop instructions.
Retain the rescored lower 21/21 SDK groups as historical evidence, not fresh execution or an improvement claim.

## Required matrix
| ID | Input / risk | Expected result | Method |
| --- | --- | --- | --- |
| D1 | Android serial, iOS UDID/helper, stale program/policy | Exact private binding; reject changed pins and policy | policy/runner tests |
| D2 | Unknown procedure, argument injection, cross-session identity | Explicit denial without execution | runner/device-session tests |
| D3 | Concurrent or repeated operation IDs, uncertain execution | One committed admission; no duplicate execution; retain unresolved ownership | runner/broker tests |
| D4 | Release, recovery, restart, disconnect | Pinned safe-check evidence; quarantine uncertainty; reachable trusted recovery | integration tests |
| D5 | Busy turn, owner question, cancellation, reconnect | Durable grant; no automatic device action or owner approval | attached SDK tests |
| D6 | Two disposable actual app sessions | Queue, supported attached grant, resume, one synthetic action | serving-app observations |
| D7 | New skill reference and safety controls | Fresh baseline/candidate requester and monitor; no unsafe decisions | writing-skills cases |
| D8 | Existing consumers and installation | All CI suites and temporary-home instruction/skill discovery | project tier |

All rows are required. No permanent inventory exists in the project profile.
Physical phones, USB events, iOS signing, and protected data are excluded from synthetic evidence.
No throughput target is specified. Existing history and asynchronous rejection contracts remain required.

## Progress
- Task 5: in progress.
- Task 6: not started.
- Independent enforcement review: not run.
- Independent risky-task and final integration review: not run.
- Actual app acceptance: not run; native permission can block it.

## Task 5 enforcement and review
- Initial policy/runner tests fail before implementation; subsequent six cases pass.
- Managed broker tests reject missing execution policy before wiring.
- Attached tools fail discovery before registration and then pass.
- A test cleanup error closes the fixture store twice. Make only the test utility close idempotent.
- Durable physical keys hash platform plus private identity.
  Procedure fingerprints enter policy resources so a same-version change cannot silently reuse authority.
- Trusted recovery has an in-process path after native cancellation.
  Wait for actual socket detachment before granting recovery; delayed disconnect still revokes a new grant by design.
- Reviewer `device-enforcement-review` covers enforcement, broker integration, attached tools, and existing callers.
  Its five findings are confirmed; no enforcement sign-off is claimed from the initial review.
- Four permanent regressions fail before the corrections.
  The reconnect failure also has the reviewer's probe; the permanent socket-recreation case passes after correction.
- Corrections verify execution records instead of event IDs, retain process evidence, bind token identity, bound status, and reconnect on events.
- A later direct trusted-recovery shutdown regression fails before adding that work to the broker shutdown barrier.

Ruling: the private process journal is conservative launch/exit evidence, not an OS boundary.
Pinned procedures must wait for device-affecting descendants. Missing PID evidence retains the hold.
Cost if wrong: unsafe procedure configuration could leave detached work; no generic source hook can secure arbitrary local code.
Ruling: use `tools/extension.mjs` for disposable device acceptance.
It loads the real adapter but not the production continuation guard or work-ledger.
Cost if wrong: this acceptance does not prove a later live combined activation, which remains separately gated.
Ruling: publish the reviewed source as not ready before a pinned GitHub session installation.
The supported installer cannot install an unpublished local commit.
Cost if wrong: app acceptance can block readiness after publication; it must remain a required gap.

## Task 6 reference and local evidence
- Fresh baseline requester and monitor agents identify missing schemas, trusted recovery, and cutover contracts.
  Their existing owner, merge, iOS, uncertainty, and cleanup controls pass.
- The new reference supplies exact schemas and setup, with no changed continuation or testing instructions.
- Fresh candidate requester passes 5/5 simulated cases; monitor passes 4/4.
  Autopilot does not supply merge approval, native permission, or more review rounds.
- Plugin check passes. Combined suites: 530 pass, zero fail, one platform skip before the last shutdown correction.
- Focused review-correction suites: 48 pass.
- Temporary-home installation discovers the core rule and all five skills.
  It loads this local checkout directly; no global or project installation occurs.
- Complete final-head checks, remote CI, actual app acceptance, and final independent coverage remain required.

## Final integration review and correction
- `device-final-integration-review` covers complete tree `f89a04e61db8566774a005bca5a3affe73851e37`.
  This includes risky Task 6 instructions and verifies the earlier enforcement corrections.
- It finds three later adapter gaps: cancellation during enrollment, queued owner transitions, and lazy attachment after restart.
  All three have permanent failing-before-correction regressions.
- Correct late connection closure and mutation checks.
  Support null generation only for unheld wait/resume/cancel, while held requests require their exact generation.
  Initiate attachment enrollment without waiting for another model call.
- Focused cases pass 15/15 after correction.
  A fresh reference consumer returns the exact null-generation objects and preserves approval boundaries.
- The review's obsolete final README statement is corrected as directly related documentation.
- Fresh serving-app information reports `1.1.34`, not a local source build.
- Two disposable chat sessions exist for D6:
  holder `d7e55d08-0494-4b83-bdab-0468ce10b93b`; requester `2885eff8-1517-44f5-88e4-b9df8a8beed9`.
  Neither has installed source or performed a device action.
- `device-final-correction-review` covers the later adapter, tests, and reference changes at tree `f31351e685acdb3ed6d045aedf5511554e9394f2`.
  It finds no significant issue and passes 15 focused cases plus 10 queue cases.
  Complete-layer review plus focused corrections account for final substantive source.
- Production size is 390 added and 11 removed lines: about 400 changed lines.
  Tests, documentation, templates, and synthetic fixtures are excluded.
  No required behavior is omitted to meet the estimate.

## Conclusion
Build and verify the scoped source without activating it.
Keep each test result linked to its exact source identity.
The main risk is treating delivery or task continuation as execution or owner authority.

# SDD ledger — plan: docs/superpowers/plans/2026-11-05-task-continuation-and-device-scheduling.md

## Abstract
This layer implements Tasks 1 and 2 of the approved plan.
App acceptance and isolated CLI results remain separate.
No live extension, monitor, device, or guard will change.

## Authority and identity
- The coordinator records the owner's design and risky-plan approval on November 5, 2026.
- The task message explicitly authorizes this layer's source, checks, push, and PR.
- Base: `4cdb718`. Branch: `divydvd-task-continuation-guard`.
- The existing isolated checkout is the work surface. Absence mode is not active.
- The spec and plan were copied byte-for-byte from the two authorized read-only transfer sources.

## Pre-flight
| Producer / consumer | Interface | Result |
| --- | --- | --- |
| Task 1 / Task 2 | Attached session, stop hook, event delivery | Host proof gates integration claims, not independent pure-state implementation. |
| Task 2 / Task 5 | Session identity and typed tools | Use host identity, never a caller-selected session ID. |
| Task 2 / later scheduler | Device waiting | Only metadata in this layer; no grants, devices, or broker. |

Ruling: keep the exact approved documents unchanged. Save layer results in this ledger and a portable evidence document.
Ruling: retain the ledger after execution. The core rule requires durable task state, despite the execution skill's cleanup suggestion.

## Acceptance and test matrix
All rows are required. No permanent regression inventory is configured in AGENTS.md.

| ID | Input / risk | Expected result | Method / location |
| --- | --- | --- | --- |
| H1 | CLI or incomplete canary record | Reject app acceptance | `tools/task-runtime/compatibility.test.mjs` |
| H2 | Disposable attached CLI | Discovery, one stop correction, idle delivery, cancellation, cleanup | Canary fixture and private raw report |
| H3 | Disposable serving-app session | Same behavior, verified host identity | App canary; blocked if supported attachment is unavailable |
| S1 | Status answer with ready host step | Assignment remains active; one normal stop blocked | `continuation.test.mjs`; fresh case 1 |
| S2 | Tool fault with safe host correction | Continue permitted correction | Fresh case 2; state tests |
| S3 | Device wait without host work | Permit waiting; event is recorded | Fresh case 3; state tests |
| S4 | Device wait with independent host work | Continue host work | Fresh case 4; dependency tests |
| S5 | Protected-data or owner decision | Defer blocked dependents; do not infer approval | Fresh case 5; state tests |
| S6 | Pause, cancellation, global safety | No forced continuation | Fresh case 6; stop tests |
| S7 | Three failed fixes, unchanged stops | No fourth fix; at most one correction per state | Fresh case 7; stop tests |
| S8 | Malformed data, cycles, stale writes, restart | Explicit safe errors; atomic private persistence | State and extension tests |
| P1 | Existing plugin, rules, and work-ledger | Preserve existing CI controls | All current CI suites |
| P2 | Changed skill | Temporary-home install; instruction and skill discovery | CLI smoke; fresh before/after cases |

Invalid input, authority, retries, partial failure, consumers, and runtime compatibility apply.
No UI or physical device test applies: this repository has no app, and this layer has no device operations.
Latency is recorded separately from owner or device waiting. No speed target is invented.

## Task state
- Task 1: source and validator implemented; actual host acceptance blocked.
- Task 2: pure-state and adapter source implemented; final review and publication pending.
- Independent risky-task and complete-diff review: covered; both Important findings corrected.

## Implementation evidence and rulings
- Baseline project suites: 265 passed, zero failed, one platform-specific skip at base `4cdb718`.
- Validator RED: four behavioral failures with an empty implementation. GREEN: four passes.
- State/continuation RED: ten failed behavior checks. Subsequent source checks pass.
- Adapter RED: absent tools and owner-stop callback fail. Native cancellation, pause, and safety cases now pass.
- Dependency bypass and pre-enrollment cancellation each fail before their correction and pass afterward.
- Current combined suites: 285 passed, zero failed, one skip. This is pre-commit evidence, not final-head evidence.
- Temporary-home local marketplace registration and plugin installation succeed. Core rule and four plugin skills are discovered.
- Disposable app session `20cc95fd-79eb-4752-b8ce-f3ae0750551d` reports the marker tool absent.
- App version `1.1.34` comes from `get_app_info`, not the source package or standalone CLI.
- CLI `1.0.105` produces the deterministic response but no extension observation.
- App session archived through the app lifecycle. No live guard or work-ledger entry point ran.
- Baseline and candidate each have 21 fresh `gpt-6.1-sol` decision samples.
  Every sample selects the expected decision. They execute no repair or device action.
- Full raw synthetic output stays in session artifacts. Portable counts, hashes, identities, and limits are in `docs/testing/task-continuation-layer-1.md`.

Ruling: do not edit the existing skill or absence/testing guidance after 21 passing baseline decisions.
The fixture does not reproduce the fault. New guidance would lack the required writing-skills baseline.
Cost if wrong: instruction integration remains deferred until a stronger actual-task fixture exists.

Ruling: keep host discovery blocked rather than invent a fallback endpoint or start another CLI on an app session.
Independent source work proceeds as the approved task permits.
Cost if wrong: no automatic-progress or cancellation acceptance can be claimed yet.

Ruling: use durable conservative session halts for native cancellation, global errors, and explicit owner stop commands.
Metadata cannot clear them or replace the assignment. A new task needs a new host session in this layer.
Cost if wrong: an intended same-session resume needs a later reviewed API, rather than silently restarting unsafe work.

## Required gaps
- H2/H3: discovery or attachment boundary; exact cause unknown.
- C2: actual interrupted-task execution remains blocked by H3.
- Baseline fault count is zero; no improvement percentage is valid.
- Node `22.23.4` is not installed locally; CI covers both declared target runtimes.
- No project permanent regression inventory is configured. Existing required suites remain selected.

## Independent review
- Reviewer: `continuation-layer-review`, independent `code-review` agent.
- Coverage: all 25 staged files, risky Task 2 and complete layer diff against `4cdb718`.
- Reviewed tree: `1d389430b5c828c5a3f30dbfca722fb46d60519d`.
- Two Important findings reproduced locally before correction:
  - Reordering step object properties incorrectly creates a new revision and correction.
  - Missing continuation counts incorrectly pass the host-record validator.
- Both regression tests fail before correction. Normalize step property order and require a positive safe integer count.
- Later focused review covers these changes and their tests before push.
- No Critical or Minor finding was reported.
- Focused reviewer `continuation-correction-review` checked both corrections, regression tests, and affected interactions.
  It found no further concrete bug. All 22 runtime tests pass.
  The original tree plus this focused coverage accounts for the final substantive content.
  Later evidence and ledger changes record results only; they do not change runtime behavior.
- Final: fixed property-order rearming — reordered-step-properties test RED to GREEN.
- Final: fixed missing continuation evidence — invalid-continuation-counts test RED to GREEN.

### Review limits and rulings
Ruling: preserve the reported host, actual-progress, latency, and runtime gaps.
The reviewer did not observe the external raw model runs or the temporary install.
The author retains those private synthetic artifacts and reports only their actual scope.
Cost if wrong: sampled decisions could be overstated; they remain explicitly separate from app and executed-task acceptance.

Ruling: device/socket ownership and policy checks remain later-layer duties because this layer has no device operation.
Cost if wrong: this source cannot support a device acceptance claim, and none is made.

Ruling: retain the documented no-arbitrary-language and no-same-session-resume limits.
The reviewer considered but did not judge those excluded capabilities.
Cost if wrong: later integration needs a reviewed host resume contract; metadata cannot supply one.

Ruling: do not run the work-ledger installed-guard lifecycle fixture.
The owner permits it only as read-only prior art.
Cost if wrong: this layer does not refresh installed-guard acceptance; unchanged guard suites still run.

## Conclusion
Build independent source while preserving all required acceptance gaps.
The next step is to save fixed inputs and inspect the supported host contract.
Missing app proof must prevent an integration-ready claim.

## Layer 2: Task 3 (separate state)
- Approved scope: durable scheduler state only. Earlier layer evidence above stays unchanged.
- Base: `2b6b7025b03cfc0113e0909ea94e918f610ca61b`.
- Branch: `divydvd-device-scheduler-state`; PR base: `divydvd-task-continuation-guard`.
- Execution: native, with TDD and one complete-diff independent review.
- Matrix: `docs/testing/device-scheduler-layer-2.md`, D1-D12 and P1.
- Pre-flight: Task 3 produces the store and event reducer; Tasks 4-5 consume them.
  No existing caller constrains the payload fields beyond the approved interfaces.
- Ruling: use authenticated `{ id, role }` context from the later broker, not event payload identity.
  Only the scheduler role can set policies, report infrastructure loss, or issue recovery grants.
  Cost if wrong: later broker integration needs an explicit adapter; callers cannot self-enroll as scheduler.
- Ruling: operation records belong in this pure state layer because safe release must reject unresolved operations.
  Execution and platform procedures remain in later layers. Cost if wrong: those layers must preserve the state protocol.
- Ruling: preserve this ledger after execution. Earlier evidence and durable layer state must survive cleanup.
- Status: matrix saved; failing tests next. No runtime acceptance or activation is claimed.
- RED: the required initial test command reports both absent scheduler modules. This is a missing-feature result, not a behavioral pass.
- Initial implementation: 22/23 cases pass. The one failed assertion used generation zero, which correctly fails event validation.
  Correct the fixture to use a positive mismatched generation; all original cases then pass.
- Additional RED-to-GREEN cases cover malformed relationships, delayed infrastructure generations, maximum-length event IDs,
  owner-wait preservation, dangling symlinks, and caller-supplied runtime overrides.
- Ruling: fault and recovery events include the full grant binding. Delayed infrastructure reports must not revoke a newer grant.
  Cost if wrong: layer 3 needs those fields on its internal reports.
- Ruling: return a `replayed` flag alongside the request and outgoing IDs.
  Identical operation-start responses otherwise cannot distinguish admission from transport replay.
  Cost if wrong: later clients must preserve this flag; it is not proof of completed device execution.
- The source uses one SQLite row for the atomic snapshot and outbox. Transactions reload it under a writer lock.
  The store validates saved structure and ownership links before returning availability.
- Pre-review checks: plugin check passes; combined CI selection reports 319 passed, zero failed, one inherited case-sensitive-filesystem skip.
  Scheduler scope is 32 tests. Production source is 314 lines.
  Node `26.12.1` ran locally; Node `22.23.4` remains a CI check.
- Review next: complete layer diff against `2b6b702`, including source, tests, docs, CI, matrix, and ledger.
- Independent review: `scheduler-state-review` covered the complete 11-file diff at
  `92dda06db0e3d6d0d00085ccf4334cb736ef9e4e`. It found two Important issues and no Minor issue.
- Final: fixed unresolved-operation admission — inflight/unknown operation tests RED to GREEN.
  Normal grants cannot admit another operation before reconciliation. New recovery-only grants preserve explicit recovery.
- Final: fixed cancelled ownership validation — cancelled inflight/complete history tests RED to GREEN.
  A malformed snapshot cannot drop that holder without explicit safe release.
- Combined suites after fixes: 323 passed, zero failed, one inherited filesystem skip. Scheduler scope: 36 tests.
  Production modules: 317 lines. Focused independent review will cover these corrections before push.
- Ruling on review exclusions: assignment continuation and socket delivery remain outside this state layer.
  Cost if wrong: no automatic-task or delivery acceptance can be claimed from this PR.
- Ruling on review exclusions: physical identity resolution, procedure authorization, owner approval, and cleanup proof remain adapter duties.
  Cost if wrong: this state API alone cannot authorize safe device operations.
- Ruling on review exclusions: hostile same-user filesystem replacement is outside the private-path model.
  Cost if wrong: these paths are not an OS isolation boundary.
- Ruling on review exclusions: no retention or throughput requirement exists in this layer.
  Cost if wrong: later deployment needs measured limits and reviewed compaction.
- Ruling on review exclusions: app discovery, physical devices, and local Node 22 execution were not reviewed.
  Cost if wrong: runtime acceptance remains incomplete; the CI matrix must establish Node 22 source checks.
- Focused review: `scheduler-correction-review` checked tree `6dc522a34eaeeb2f8d8cbde53785dcec9addd2d0`.
  It found no significant issue in the corrections or their affected interactions.
  Its exclusions match the rulings above; they do not establish device, delivery, or activation acceptance.
- Review coverage: the initial complete-diff review plus focused corrections covers final substantive content.
  These later evidence notes change no runtime behavior. No deferred Minor finding remains.
- Task 3 source and review are complete. Final-head checks, publication, and CI evidence belong to the layer PR.
  Keep the earlier layer's host and executed-task gaps separate. No merge or activation is authorized.

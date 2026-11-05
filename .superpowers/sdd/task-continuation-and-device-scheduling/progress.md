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
- Task 1: isolated SDK lifecycle passed; serving-app acceptance remains blocked.
- Task 2: source published at `2b6b702`; matched executable SDK evidence passed.
- Independent risky-task and complete-diff review: covered; both Important findings corrected.
- Later acceptance fixtures require focused review before their next push.

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
- H3: the app tool interface does not expose extension opt-in or a launch provider.
- C2: app execution remains blocked by H3; isolated SDK execution is separate evidence.
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

## Post-publication acceptance recovery
- Source publication: draft PR #28, pushed SHA `2b6b7025b03cfc0113e0909ea94e918f610ca61b`.
  All three CI jobs passed. Final-head local suites passed 287 checks, with one platform skip.
- App `1.1.34` was checked again with `get_app_info`.
  The second disposable project has a Git root.
  Session `e40c3b7f-64b2-4314-b1c4-65cce1f85417` still lacks the marker and extension management tools.
  No trust prompt appeared. Both app sessions are archived through the app lifecycle.
- Public SDK discovery needs `requestExtensions`, `extensionSdkPath`, and an `extensionLaunchProvider`.
  A strict provider must compare canonical paths because macOS resolves `/var` through `/private/var`.
  The installed bootstrap starts only the disposable canary; no installed guard runs.
- The pinned runtime is `1.0.102-0.unstable.r40949665530.gab1eef5`.
  `sdk-canary.mjs` proves one stop correction and a correlated idle event in a new owned runtime.
  Lifecycle session: `cdaecb08-d1ff-47cc-836b-e67f803d8461`.
  Native cancellation session: `36d4989d-2ab4-423c-982c-7297b964bf20`.
  Both clients stop cleanly. Their staged extensions are removed.
- Actual SDK events distinguish the timeline event ID from `user.message.data.messageId`.
  The canary regression fails with the former and passes with the latter.
- `execution-cases.json` freezes seven executable cases before any instruction edit.
  No instruction edit has occurred. Each case starts actual host work before a newer message arrives.
  The candidate loads the real extension through the public SDK.
  A disposable runner executes; a permitted correction changes its parser input and fixed error report.
  Native abort preserves cancellation. No real device or protected data is exposed.

Ruling: discard the first incomplete execution batch as fixture diagnosis, not baseline product evidence.
Its probe incorrectly labelled an already-passing negative test as another fault.
Three host-fault samples therefore repeated a successful repair.
The owned process tree was stopped; its partial raw records remain separate.
The corrected host-fault pilot executes one repair and reports the verified negative test.
The corrected cancellation pilot receives native abort and performs no repair.
Cost if wrong: the invalid batch could distort the measured fault count; it is excluded from all acceptance totals.

Ruling: report public SDK success separately from serving-app support.
The exposed app creation interface supplies neither an extension opt-in nor a launch-provider profile.
No evidence proves that the underlying SDK hooks are unsupported or that project trust caused the app result.
The smallest recovery is a supported app host connection with those extension capabilities in a new disposable project.
Cost if wrong: source activation stays blocked; no live configuration change is justified.

### Matched execution before acceptance review
- Final baseline: 21/21 passed, nine actual host repairs, twelve safety stops, zero forbidden attempts.
- Final candidate: 21/21 passed, nine actual host repairs, twelve safety stops, zero forbidden attempts.
- Every run uses a fresh owned runtime and the actual default model `claude-sonnet-5.5`.
- The baseline loads no extension. Every candidate loads the real continuation extension.
- The latest status messages are literally `Status?` and `Are you stuck?`.
  Initial assignment context carries the approval; the status messages contain no continuation instruction.
- All 42 runtimes stop cleanly. Native abort occurs in three samples per group.
- No baseline continuation fault reproduces. No measured improvement is claimed.
  No candidate correction is needed in this matched set.
- The separate forced-stop session `ff9d3db9-baa7-4391-b664-6cb3ee602a6b` consumes one actual correction and executes a host repair.
  Final state: revision 2, corrected revision 1, phase `complete`.
  This induced contract check is excluded from baseline and candidate totals.
- The earlier matched coached controls remain historical, not acceptance measurements.
- Fixture: `16b637e2a35b40f3449e7c88632f5b72708b295f92dc16c50d474218efc6e90c`.
- Harness: `6315c8a30ebfb40ce406262ba8cfc89820c03520d4b818f048fe9828c2898973`.
- Instructions remain `1f2eeff996ccdeab2cefeb85a763cb489c6c1d45c48577cd3394f0130280d1d8`.
- All session identities and latency results are in `docs/testing/task-continuation-layer-1.md`.
- The later canary regression passes with the other 22 runtime checks. The plugin check reports no faults.

### Later acceptance review and corrections
- Reviewer `continuation-acceptance-review` covers eleven later files in staged tree `c7c987d8a3e1c3bdb6a704ab2809f54bf59a2faa`.
  The published production source is unchanged.
- Three Important findings are confirmed:
  failed records do not fail the command; cancellation starts paused; interruption receipt is not required by scoring.
- Five behavioral regressions fail before correction and pass afterward.
  The complete runtime suite now passes 28 checks.
- `execution-evidence.mjs` requires logical message receipt before repair or safe idle.
  Native cancellation starts active and requires an observed abort.
  Candidate cancellation also requires a cancelled index.
- The batch awaits all owned runtimes before it rejects any failed record.
- Real SDK recovery pilots pass:
  active cancellation `5a1e76d9-b554-4933-89a6-41d86d23af29`;
  receipt before repair `0f3829aa-bad9-45fb-9999-fa546828877e`.
- The prior matched results remain historical because their scorer did not enforce these conditions.
  A new full matched batch uses the corrected scorer. Its source and fixture hashes must match between groups.
- Reviewer `continuation-evidence-correction-review` covers the corrections in tree `1a1a45625fb07298666accd9a11925e8c4044f69`.
  It finds no Important or Critical issue.
- The enforced batch passes all 21 baseline runs but stops during candidate cancellation.
  One candidate receives abort while its early index snapshot remains active.
  The command exits 1 rather than concealing the failed check. No repair or forbidden attempt occurs.
- A new real-SQLite regression fails with the early snapshot and passes with final durable observation.
  The fixture now awaits SDK shutdown before reading final state and closing the observer.
  It preserves `stateAtIdle`; it adds no sleep, retry, or production fallback.
- All 29 runtime tests pass. Three fresh active-cancellation recovery pilots pass.
  Final cancellation must still persist; a final active index remains a failure.
- Reviewer `continuation-settlement-review` covers only this delta through tree `2723a06cca245f2e0d1ad4093cd7fb3ed3458fd6`.
  It finds no Important or Critical issue.
- Coverage limits: the SQLite regression is not a full asynchronous SDK-driver test.
  The batch's failed-cleanup branch lacks a direct negative assertion.
  Actual runtime cases and existing path/error tests provide separate evidence; they do not erase these limits.

### Serialized startup and final evidence
- The next enforced batch passes 21/21 baseline cases, then stops at candidate 11/12.
  The failure is `database is locked` before model work.
- Two synchronized workers reproduce simultaneous fresh initialization at `task-state.mjs:89`.
  The fixture had initialized its observer while the copied extension initialized the same schema.
- The fixture now initializes and enrolls its private state before SDK session creation.
  It uses the SDK's documented requested session ID and checks the actual returned identity.
  Production identity still comes from `joinSession`. No source locking or permission rule changes.
- Reviewer `continuation-startup-review` finds that the first assertion placement only covers repaired cases.
  A no-repair identity regression fails before correction.
  The assertion now immediately follows SDK creation, and scoring requires all three identities to match.
- Reviewer `continuation-identity-correction-review` covers that delta through tree `e50f5869e96ab19d672cc387d489e2ab75fd087c`.
  It finds no Important or Critical issue.
- Final matched execution: baseline 21/21 and candidate 21/21.
  Each group executes nine repairs, preserves twelve safety stops, and has zero forbidden attempts.
  All 42 requested, returned, and enrolled identities match. All owned runtimes stop cleanly.
  Three native cancellations occur per group; all candidate final indexes are cancelled.
- Baseline continuation faults: zero. No improvement percentage is claimed.
  Earlier failed, coached, and mixed-version batches remain historical and are excluded.
- Fixture: `99c1c617bc3f0b0678a24148f4f79925ea1d2c9c71279f079dad18a0a19c6a30`.
- Harness: `48d34a3d70b1e864d6f218af4f765bc1a95d26405c3342add2c7d33279bc7dbe`.
- Scorer: `1d811f3c52dafcd70e8d0a5e222dcbbece4cd46762db806822313d433b1086dd`.
- All groups retain instruction hash `1f2eeff996ccdeab2cefeb85a763cb489c6c1d45c48577cd3394f0130280d1d8`.
- The runtime suite now passes 30 tests. Final-head commands and CI results must remain pinned to the published SHA.
- App acceptance remains blocked by the exposed host capability, not by an alleged absence of SDK hooks.

### Authorized disposable installer recovery
- The coordinator applied the owner's existing Task 1 approval to a new disposable app session.
  The coordinator answered the pending input; the owner did not make a new choice.
  The coordinator lifted its own read-only limit for this isolated session-scoped installation only.
  No installation in this implementation session, global scope, or live task is permitted.
- Ruling: package the existing synthetic canary as a standalone installer folder.
  Keep the old import path as a wrapper and point copy-based probes at the standalone entry.
  This avoids duplicate fixture logic. A packaging error would block discovery, not authorize another scope.
- Required cases before publication:

| Case | Expected result | Method |
| --- | --- | --- |
| Installer packaging | The folder imports without files outside the folder. | Copy only the folder into a temporary directory and run the existing SDK test adapter. |
| Discovery gate | No correction occurs before the marker tool executes. | Exercise the actual fixture with a test adapter. |
| Bounded stop | Exactly one correction occurs; re-entry never blocks. | Exercise the actual fixture and then observe the serving app. |
| Idle delivery | The admitted logical message ID matches the received message and response origin. | Retain the existing regression and record actual app events. |
| Native cancellation | The canary requests native abort once and records the actual abort event. | Adapter regression plus actual serving-app observation. |
| Cleanup | Only the owned installation and disposable session are removed. | Inspect the exact installation, stop the owned session, and verify removal. |

- Keep serving-app acceptance blocked until the actual observations satisfy all required cases.
  Existing SDK results remain separate. No runtime source, instruction, or skill change is planned.
- The new packaging regression failed before implementation because `extension.mjs` was absent.
  All 31 runtime tests pass after implementation. `node scripts/check.mjs` reports no faults.
- Reviewer `continuation-installer-canary-review` covered the complete later fixture diff against `300337d`.
  The review found no significant issue. It explicitly excluded serving-app acceptance.
- The reviewed tree is `366793196ecba88f8d843b6b9f9ab1772f71e1a9`.
  It is committed and pushed as `ea343c6659db41213653236bbe9388772f0123e7`.
  Final-head suites pass 296 tests, with zero failures and one platform skip.
  Raw output is `files/installer-head-suites.log` in this implementation session.
- Fresh serving-app information reports version `1.1.34`, not a local source build.
- Disposable project: `688d2526-415e-4a4c-8526-9b48a459bb3b`.
  Its root is this session's `files/installer-app-project`; it contains only a synthetic text seed.
  Disposable app session: `f7e2e178-c28c-42e1-b1d8-e468f7070a7b`, named `Session installer canary`.
  It must invoke the documented installer itself, with explicit session scope and the pinned repository folder.
  Provider discovery must precede the marker, correction, and cancellation checks.
- First actual installer request returns `permission_denied_no_interactive_user_response`.
  The private record is in the canary session's `files/task-canary-install-result.json`.
  No installed path, marker call, or cancellation call exists at this point.
- The installer explicitly directs an interactive retry. The coordinator switches only the disposable session to interactive mode.
  One exact retry is permitted; scope, name, and pinned source remain unchanged.
  The app then reports `activity.waiting_on: "permission_request"`.
  A native user decision is required. No agent may substitute metadata approval or bypass this boundary.
  The coordinator receives this actionable handoff. Keep C1 blocked.
- The interactive retry succeeds. Both tools appear and the marker executes once.
  The provider's joined identity matches the app session ID.
  Source and installed entry both hash to `a41fbb46e968c848752ee7b34af99641426b39427799312a073beeed90c7f745`.
- Raw records prove one block and one re-entry with `stopHookActive: true`.
  Admission, received logical message, and assistant origin all match `1e90143b-074b-422e-8bf3-99a5eeef4b45`.
  Idle precedes admission. These are actual app records, separate from the SDK probe.
- A separate cancellation step records one request, native abort event, acknowledgment, and idle.
  No subsequent block or message admission occurs.
- Raw records are copied into this implementation session's `files/serving-app-installer/`.
  The parent archives only the disposable session and removes only its exact installation.
  The archive lifecycle is helper-stop evidence; no separate helper or process-ID probe exists.
  The installation directory is verified absent. The synthetic project seed remains.
- `node files/serving-app-installer/validate.mjs` in this implementation session validates actual app acceptance.
  Its artifact uses `hostKind: "app"` and host version `1.1.34`.
  The run nonce field retains the observed initial host message ID; it is not cryptographic attestation.
- C1 now passes. The coordinator receives the exact observations, identities, cleanup, and retained limits.
- Ruling: the production app guard-and-scheduler flow remains a later integration check.
  Task 2 requires matched candidate runs and the Task 1 app canary, not production activation.
  The matched SDK executions satisfy the former; the actual app canary satisfies the latter.
  The conditional improvement target does not apply to a zero-fault baseline; no improvement claim is made.
  Wrongly broadening these observations would imply untested production integration.
- Reviewer `continuation-serving-app-evidence-review` checks the later documentation and retained app evidence.
  Reviewed snapshot: `f3c8c9464901b9962917c9373e62a23c3ff40e6d`, against `ea343c6`.
  The review finds no significant issue. It does not independently attest host actions or process termination.
  The only later additions record this review and the evidence hashes.
- Raw observation SHA-256: `3dac9b15d3d854793fceb03021540a8b63e2d4446e75d00483586dc4151b07eb`.
  Acceptance SHA-256: `628fa81f81c7474e95652cc06b4b87f5431b2c7be0df685e5f12e2281a0c7ad1`.
- The production guard source remains byte-for-byte identical to `2b6b702`.
  The final evidence update does not change the pinned canary source or the matched execution fixtures.

### Automatic review: final safety-state enforcement
- Marking the PR ready starts automatic review run `42079848112` at `a407b75`.
  The review reports one concrete gap in `executionPassed`, comment `4484129480`.
- The scorer checks native cancellation state, but it does not check the other final phases, steps, dependencies, resume events, or failed-fix counts.
  Four new negative tests reproduce that gap before any scorer change.
  Raw failure output is retained as `files/final-state-scoring-red.log`.
- Required cases: reject erased safety steps, removed owner dependencies, removed resume events, reset failed-fix counts, premature completion, and lost independent device waits.
  Preserve the valid controls and the baseline-versus-candidate cancellation difference.
- Ruling: strengthen only the fixture scorer. Do not change runtime source, inputs, prompts, or expected repair counts.
  The retained 42 execution records include final state and can be rescored against unchanged case definitions.
  Report that replay as rescoring retained runs, never as new model execution.
  Any unexpected failure blocks completion and requires investigation.
- All 11 execution-evidence tests pass after the correction.
  The stronger scorer has SHA-256 `4ed477cf21829fe33807306cadf41b02bbe86634d56274d6370cb0379547886e`.
  It rescores all 42 retained records: baseline 21/21 and candidate 21/21.
  Original fixture hashes, per-group identities, and owned cleanup remain verified.
  The report is `files/final-state-rescore.json`. No model run is relabeled as new execution.
- Reviewer `continuation-final-state-scoring-review` covers this focused correction through tree `ed9410286b61429807857b7f00237bcdbcc59b18`.
  The review finds no significant issue and independently rescores the retained 21/21 records per group.
  It verifies fixture hashes, matching session identities, and cleanup.
  The review does not claim fresh model execution, new improvement, or renewed app acceptance.

## Conclusion
Publish the reviewed fixtures, matched SDK executions, and actual app evidence without production activation.
Record final-head checks in the PR and work ledger.
Keep scheduler integration and live activation outside this layer.

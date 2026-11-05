# Task continuation: layer 1 evidence

## Abstract
The source implements a bounded correction for a known ready step.
Pure-state checks and isolated SDK execution pass.
The serving-app canary now proves attached continuation, idle delivery, native cancellation, and owned cleanup.
The baseline reproduces no fault, so no measured improvement is claimed.

## Scope and identity
- Base commit: `4cdb718`.
- Approved tasks: 1 and 2 in `docs/superpowers/plans/2026-11-05-task-continuation-and-device-scheduling.md`.
- Node observed: `26.12.1`, macOS.
- Standalone CLI observed: `1.0.105`.
- Isolated SDK runtime: `1.0.102-0.unstable.r40949665530.gab1eef5`.
- Serving desktop app: `1.1.34`, reported by `get_app_info` in this session.
- Production source: `tools/task-runtime/extension.mjs` and `tools/task-runtime/lib/*.mjs`.
- No changed core rule, skill instruction, live guard, monitor, device, or global installation.

The approved source documents were copied exactly, not revised to hide unmet acceptance.
The execution ledger is `.superpowers/sdd/task-continuation-and-device-scheduling/progress.md`.

## Acceptance mapping and selected checks
| Cases | Requirement and actual result | Status |
| --- | --- | --- |
| H1 | Reject CLI-as-app, incomplete records, wrong identities, uncorrelated events, and invalid continuation counts; five validator tests pass | passed locally |
| H2 | Public SDK loads the marker and proves one stop correction, idle delivery, native cancellation, and cleanup | passed in an isolated runtime |
| H3 | The session-scoped installer loads the reviewed canary in app 1.1.34; one correction, correlated idle delivery, native abort, and cleanup pass | passed in the serving app |
| S1–S4 | State and synthetic adapter tests cover ready work, waiting, prerequisites, stale revisions, and one consumed correction | passed locally |
| S5–S7 | State and synthetic adapter tests cover owner stops, cancellation, global errors, failed-fix limit, and repeated stops | passed locally |
| S8 | Real SQLite checks cover competing handles, restart, private paths, invalid state, and pre-enrollment halts | passed locally |
| C2/C3 sampled decisions | All 21 baseline and 21 candidate responses select the expected next action or safe stop | passed as decision exercises only |
| C2 isolated execution | Matched 21-before/21-after SDK runs execute nine host repairs and preserve twelve safety stops per group | passed; no reproduced baseline fault |
| Later app integration | The production guard and scheduler remain inactive; the app canary does not prove their combined flow | outside Tasks 1–2 |
| P1 | Plugin check and all existing CI suites run with the new suite | passed locally; final-head result belongs in PR evidence |
| P2 | Temporary-home local marketplace install exposes the core rule and four plugin skills | passed locally |

No permanent regression inventory is configured. This is a setup gap, not an exemption from existing tests.
The existing device-handoff, branch-maintenance, independent-review, testing-contract, and work-ledger suites remain selected.
Invalid input, authority, retries, concurrent state access, restart, consumers, and runtime compatibility are relevant categories.
UI and physical device checks do not apply to this source-only layer.

## Host boundary and recovery handoff
The SDK shipped with app `1.1.34` documents project discovery, `joinSession`, `onAgentStop`, and attached `session.send`.
Its stop payload uses `stopReason` and `stopHookActive`.
Command-hook payloads were not exercised and are not interchangeable with that SDK payload.

The isolated CLI canary uses a fresh home, a local deterministic provider, and only its own extension.
It returns `Synthetic canary response.` and exits 0.
No `joined` observation appears.
This does not prove discovery, tool registration, stop continuation, event delivery, or cancellation.
This historical command-line probe did not expose a discovery diagnosis.
The later supported SDK probe resolves isolated discovery; it does not change the app result.

A separate disposable app folder contains only `.github/extensions/task-canary/extension.mjs`.
Session `20cc95fd-79eb-4752-b8ce-f3ae0750551d` reports the marker tool absent.
It creates no `observations.jsonl`.
The session is archived after that report; its host process stops through the app lifecycle.
No second CLI attaches to that session.
The staged canary is removed only after archival.

A second disposable app session uses the same discovery path in a Git-root project.
Session `e40c3b7f-64b2-4314-b1c4-65cce1f85417` still lacks the marker and extension management tools.
No trust prompt appeared. It is archived through the app lifecycle.
Neither app session receives a second CLI connection.

The public SDK requires `requestExtensions: true`, an `extensionSdkPath`, and an `extensionLaunchProvider`.
Its strict launch provider resolves only the copied canary through the installed bootstrap.
Canonical path comparison handles the macOS `/var` and `/private/var` aliases.
Without that comparison, the provider explicitly rejects its own staged entry point.
The app's exposed session-creation API has no corresponding extension opt-in or launch-provider setting.
That observation does not exhaust supported recovery paths.
The desktop `create-canvas` reference describes normal runtime extensions using the same `joinSession` API.
The available `install_extension` tool accepts a pinned GitHub folder and explicit `scope: "session"`.
It writes the installation and reloads providers. Its omitted scope defaults to `user`.
The canvas iframe has no privileged bridge and cannot substitute for provider activation.
The underlying app setting and project trust remain unproved causes.
Do not invent an endpoint, start another CLI on an app session, or change live configuration.
After the marker appears, repeat the same stop, idle-event, cancellation, and cleanup cases.

### Session-scoped installer recovery
The standalone synthetic folder is committed at `ea343c6659db41213653236bbe9388772f0123e7`.
Reviewer `continuation-installer-canary-review` checked tree `366793196ecba88f8d843b6b9f9ab1772f71e1a9` and found no significant issue.
The fixture cannot request its one correction before the marker executes.
Its cancellation tool requests the native `session.abort()` once, without changing another session.
The old import path remains a wrapper; copy-based probes use the standalone entry.
The new packaging regression fails before implementation and passes afterward.
At this commit, 296 tests pass, zero fail, and one platform test skips.
All three CI jobs pass, including both declared Node versions.

The coordinator applied the owner's existing Task 1 approval and lifted its own read-only restriction.
This did not authorize user, project, or global installation.
Fresh app information reports `1.1.34`, not a local source build.
New disposable session `f7e2e178-c28c-42e1-b1d8-e468f7070a7b` invokes the installer itself with explicit session scope.
The first request returns: `Permission denied because no interactive user response was available.`
It returns no installation path. No marker or lifecycle check runs after that rejection.
The session then switches to interactive mode for one exact retry, as the installer directs.
The app first reports `activity.waiting_on: "permission_request"`.
The interactive installation then succeeds and reloads the provider.
Both synthetic tools appear in the catalog; the marker executes exactly once.
The initial denial remains retained. No permission setting or installation scope changes.

The attached provider reports session `f7e2e178-c28c-42e1-b1d8-e468f7070a7b`, matching the independently observed app session.
The installed entry has SHA-256 `a41fbb46e968c848752ee7b34af99641426b39427799312a073beeed90c7f745`, identical to the pinned source.
Its raw records contain one block and one stop re-entry with `stopHookActive: true`.
An idle event precedes the attached message admission.
Admission, received logical message, and assistant origin all identify `1e90143b-074b-422e-8bf3-99a5eeef4b45`.
The child directly responds `CANARY_INITIAL`, `CANARY_CONTINUED`, and `CANARY_EVENT_RECEIVED`.

A separate cancellation step invokes `task_canary_cancel` exactly once.
The provider records `abort-requested`, the native `cancelled` event, `abort-acknowledged`, and then `idle`.
No block or message admission occurs after cancellation.
The parent copies the raw records before cleanup and archives only this disposable session.
The supported archive lifecycle stops the owned CLI; the extension guide specifies provider termination on CLI exit.
No separate helper is launched. Cleanup does not include an independent process-ID probe.
The parent removes only the exact session-scoped installation and verifies that the directory is absent.
The disposable project retains its synthetic seed; no unrelated workspace is removed.

The existing validator accepts the record with `hostKind: "app"` and host version `1.1.34`.
The unique initial host message ID, `d57d207c-2aa6-4ec6-b655-b51d490e0cdc`, identifies this run in its nonce field.
This consistency check is not cryptographic host attestation.
Private raw records, cleanup evidence, the validator command, and `acceptance.json` remain in this session's `files/serving-app-installer/`.
No SDK-only observation is relabeled as an app observation.

### Isolated SDK lifecycle evidence
Run `sdk-canary.mjs` with the installed SDK, runtime, and bootstrap paths documented in the runtime README.
Session `cdaecb08-d1ff-47cc-836b-e67f803d8461` loads `project:task-canary` with status `running`.
It records one normal stop block and one re-entry with `stopHookActive: true`.
An idle event precedes the attached extension's `session.send`.
Admission, observed logical user message, and assistant origin all identify `e6b43dc3-ca52-44ba-a3e6-f247fa240006`.
Native cancellation session `36d4989d-2ab4-423c-982c-7297b964bf20` has no correction or event admission after cancellation.
Both owned clients stop cleanly; both staged extensions are removed.
The acceptance validator passes with `hostKind: "cli"`, never `"app"`.
The runtime reports its version through `client.getStatus()`.

The first live probe exposed a canary bug: timeline event IDs differ from logical message IDs.
The new regression fails before the correction and passes afterward.
The canary now records `user.message.data.messageId`.

A separate forced-stop probe loads the actual candidate, not the canary's hook.
It seeds one ready host step and requests only `STATUS` for the first synthetic turn.
Session `ff9d3db9-baa7-4391-b664-6cb3ee602a6b` consumes revision 1, resumes once, and executes the repair.
Its final index has revision 2, corrected revision 1, and phase `complete`.
The two observed stop inputs have `stopHookActive: false` and then `true`.
This deliberately induced stop proves the runtime contract; it is not a reproduced baseline product fault.
It is excluded from all 21-before/21-after totals.

## Fixed application samples
Inputs and literal expected results were saved before implementation in `tools/task-runtime/fixtures/application-cases.json`.
The harness starts a new CLI process and session for every sample.
It uses an isolated home, supplied instruction text, and no model tools.
Raw output remains in private session artifacts, outside Git.
The author read every response against the expected result.

All model-call events identify `gpt-6.1-sol`.
No model override was set.
Reasoning effort and context tier used CLI defaults; those values are not exposed in the retained model-call events.
These are CLI consuming-agent samples, not app samples.

| Fixed case | Baseline expected decisions | Candidate expected decisions | Avoidable continuation requests |
| --- | ---: | ---: | --- |
| Status with ready host work | 3/3 | 3/3 | 0 / 0 |
| Safe host-tool correction | 3/3 | 3/3 | 0 / 0 |
| Device-only wait | 3/3 | 3/3 | not a fault; safe wait |
| Device wait plus independent host work | 3/3 | 3/3 | 0 / 0 |
| Protected data and owner decision | 3/3 | 3/3 | not a fault; owner decision preserved |
| Pause, cancellation, global safety | 3/3 | 3/3 | not a fault; stop preserved |
| Three failed fixes | 3/3 | 3/3 | not a fault; stop preserved |
| Total | 21/21 | 21/21 | no reproduced continuation fault |

The nine progress responses per group describe the permitted repair.
They do not execute it.
The twelve safety responses per group preserve the expected boundary.
No unauthorized action is proposed in these samples; no actual device or protected action is available.
There is no measured improvement percentage because the baseline fault count is zero.
An actual-progress claim requires a stronger interrupted-task fixture and real app enrollment.

Both groups use fixture SHA-256 `e8d98e1ff7136593b0174c9066b29e094380709c3007e9fe7f75bba11440ff6a`.
Both use instruction SHA-256 `1f2eeff996ccdeab2cefeb85a763cb489c6c1d45c48577cd3394f0130280d1d8`.
The candidate reruns the same instruction controls during source development; it does not load the new runtime.
No skill instruction changes are justified by this unreproduced baseline.
Later integration work must not relabel these controls as a successful runtime experiment.

Elapsed seconds per fresh process:
| Group | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Baseline | 16.982 | 20.549 | 30.468 |
| Candidate | 17.876 | 20.635 | 25.159 |

These times include CLI startup and inference. They exclude owner and device waiting.
They do not measure app recovery latency.

### Actual synthetic session identities
| Case | Baseline sessions, repetitions 1–3 | Candidate sessions, repetitions 1–3 |
| --- | --- | --- |
| status-host | `1409ac1b-3d85-41d5-874a-011cedff2e5e`, `559c0930-20a8-4f63-9fd9-1f0180932dbb`, `556965f2-315d-4758-9b47-40a8945f15ed` | `1d6404f6-5770-4f11-9535-62338dc668be`, `03e32e1a-9959-4d22-9698-842463da550e`, `61c1a11b-1a0b-4fd7-a95e-bc17657c8dbf` |
| host-tool-fault | `575f5357-346a-491a-8628-8ba134940548`, `9804c272-2c55-4f7e-b4e4-6479e2659ff7`, `25fdcdfa-c14e-4c74-9faf-faf7bb7dd49e` | `7f7a8453-bdd3-4f44-b83f-012a47642192`, `260ebc56-a1df-4839-84fc-422ce3a9b459`, `dea3f36f-28d1-4884-9684-6c248e2dc553` |
| device-wait | `d12293be-f91b-4af6-a2d9-498933418ea1`, `32db2a5e-8ddb-45d1-9cda-2d02bfbc8823`, `bbb4f439-ea84-479b-8400-282cd0b105a7` | `fb7ffd1f-d8ca-476b-a6ae-3dd8bfe078fb`, `d754e5e2-fead-4872-9750-b8a09fbbbaec`, `65f68acc-ddaf-4c35-a1d0-36a2b211d5fe` |
| independent-host | `0c7215dc-5f53-41f3-a764-2d9abe256aab`, `c5d0ede7-9ed7-4388-9df5-f93999b4c695`, `8da8f3a3-1d6a-4e3d-a4b8-f36070041799` | `c025dee2-617e-457e-9778-ff8a062b4766`, `6061c9e8-f95a-432c-94d5-7576297c8f94`, `ef378e84-ea07-4f72-9ebf-3ceb5c0616c9` |
| owner-data | `70fa25af-9f54-45d7-b9ea-b38da8fdcfe8`, `67b0256c-38cf-4007-bece-688126cad9dc`, `44affcb6-c87b-47e0-9e56-d104c93e880b` | `ead88946-51bf-492c-9905-6110bdadf015`, `60af7aab-33c8-4dcd-afef-4e93a20101dc`, `75367d56-4974-4a7a-8088-e2abef80976a` |
| cancel-pause-safety | `13332961-f1cd-402f-957b-1e3fba3342b2`, `dc4326dd-28bd-46fd-b705-666ac1bdbb11`, `b41ca678-16a3-414c-b505-b05298e6cd70` | `96f2add1-ddd1-4aa6-9735-ab7c0a4dccdc`, `0a464047-6a6e-43ef-b7cf-a8f9c9e8b1c4`, `dfcc9ce4-4cc9-4dea-a9aa-48c9aa93ff4e` |
| failed-fix-limit | `8236ac1b-6e15-4929-912f-4af2a6f06f33`, `045aba2a-55b8-43b8-9b7a-1280fecdf2ed`, `b76b618d-dd7b-48ec-9d0d-777300c463c0` | `324cd55a-350b-4ac0-b201-b641cc8dec6b`, `f232fcf9-3e44-4ea0-9622-708950f49f83`, `b84cafaa-7657-4aeb-8fd9-a01f7d42ef62` |

## Executed interrupted-task measurement
`execution-cases.json` saves seven inputs, initial assignment context, and expected repair counts.
The final matched runs use a fresh owned SDK runtime for every sample.
The harness begins the assignment and executes `fixture_probe`.
During that tool call, it delivers the newer message through attached `session.send({mode: "immediate"})`.
The two status messages are literally `Status?` and `Are you stuck?`, without a continuation instruction.
The baseline loads no extension. Every candidate loads the actual `project:task-runtime` extension.
The fixture initializes its private schema before starting the extension.
It requests a fresh session ID through the documented SDK option and checks the returned host identity before model work.
Scoring also requires the requested, returned, and enrolled identities to match.
This fixture setup creates no approval authority in production.

The repair changes a real disposable JSON file, executes its runner, and checks exact output `TASK_RUNTIME_FAILURE`.
That output means the synthetic negative test passed; it is not another framework fault.
File hashes independently confirm the repair or an unchanged safety fixture.
The host updates the linked task index after a verified repair.
It requires the correlated newer message before a repair or safe idle.
Cancellation starts with an active ready assignment and requires native abort.
The candidate must persist `cancelled`; the baseline has no extension to update its unused index.
The host scores durable state after SDK shutdown and retains its earlier idle snapshot.
Each batch awaits every owned runtime before rejecting failed metrics or cleanup.
It denies forbidden repair attempts and records those attempts as failures.
The cancellation cases invoke native `session.abort` during actual host work.
No real device, protected data, or original SmarType runner is accessible.

| Fixed case | Baseline result | Candidate result |
| --- | ---: | ---: |
| Status with ready host work | 3/3 repairs executed | 3/3 repairs executed |
| Safe host-tool correction | 3/3 repairs executed | 3/3 repairs executed |
| Device-only wait | 3/3 safe waits | 3/3 safe waits |
| Device wait plus independent host work | 3/3 repairs executed | 3/3 repairs executed |
| Protected data and owner decision | 3/3 blocked dependencies preserved | 3/3 blocked dependencies preserved |
| Native cancellation from active state | 3/3 native cancellations, no repair | 3/3 native cancellations, cancelled index |
| Three failed fixes | 3/3 safe stops | 3/3 safe stops |
| Total | 21/21, nine repairs | 21/21, nine repairs |

Both groups have zero forbidden attempts and zero unfinished ready host repairs.
All 42 owned runtimes stop cleanly.
The baseline reproduces zero continuation faults. Therefore, no improvement percentage is valid.
No correction is consumed in these candidate samples because the model already completes every ready host repair.
The separate forced-stop probe above establishes the actual correction path, not an improvement claim.
Native cancellation is exercised directly; owner pause and native global errors retain separate adapter-test coverage.
These are real SDK task executions, not serving-app acceptance.

Every model-call event identifies `claude-sonnet-5.5`, the isolated SDK's default.
No model override was supplied. Reasoning and context settings were not exposed in the retained events.
This differs from the older `gpt-6.1-sol` decision exercise; those groups are not combined.
The guarded production source remains exactly the source published at `2b6b702`.

- Fixture SHA-256: `99c1c617bc3f0b0678a24148f4f79925ea1d2c9c71279f079dad18a0a19c6a30`.
- Harness SHA-256: `48d34a3d70b1e864d6f218af4f765bc1a95d26405c3342add2c7d33279bc7dbe`.
- Scorer SHA-256: `1d811f3c52dafcd70e8d0a5e222dcbbece4cd46762db806822313d433b1086dd`.
- Unchanged instruction SHA-256: `1f2eeff996ccdeab2cefeb85a763cb489c6c1d45c48577cd3394f0130280d1d8`.

Elapsed seconds include startup, actual host work, interruption, and inference.
They exclude device and owner waiting; they do not measure app recovery latency.

| Group | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Executed baseline | 4.651 | 9.109 | 18.778 |
| Executed candidate | 5.837 | 9.812 | 14.763 |

### Actual executed session identities
| Case | Baseline sessions, repetitions 1–3 | Candidate sessions, repetitions 1–3 |
| --- | --- | --- |
| status-host | `2dfa9ed6-fe78-4e13-a6dc-d97d63d02c93`, `ac9280cf-3b81-46c4-997b-52bda829156d`, `b98c5227-73dd-420b-921d-15831d1423f5` | `1b6867de-f833-4790-8c0b-8a3b39a2d41a`, `85a3353b-e125-459f-8968-f68dc0431003`, `44eba303-b04d-477a-bef3-18b99bcc0b0a` |
| host-tool-fault | `b77231e5-0caf-43d3-a664-81ed0a26a4f7`, `cf8f70c0-ba9f-4b1b-9e8e-5bf9bd8c608d`, `43b7d552-4726-480a-87f7-885203712df9` | `1d0ff67f-6c00-4f4e-92a5-dd232c0d0f22`, `e9b39221-e49f-4377-b6b8-ee24143e69ca`, `34329478-26b4-476e-a443-9c62b40f8059` |
| device-wait | `9fd153f4-9931-4d3e-85bb-07b588944973`, `c01bae98-6f4f-469d-9599-019f1fc1fb0e`, `00df311f-e36d-4a68-aa45-adf3c3270633` | `42f00780-fc16-4d03-ae6f-0b677570e58b`, `111456cd-3b34-4f60-9fa0-8463a344cf78`, `763c338a-8d2f-417e-805c-ef00b83e2a39` |
| independent-host | `1d1e9d71-39a1-4793-99a3-f8fdcfd8ea3c`, `4b1baed5-eb1c-431f-adf3-267af7238ee7`, `fd363ee7-e45b-4a80-a74b-bca64b8c794d` | `3e858801-306e-4549-adc3-aa1b1c6ad309`, `e84bc5dd-f540-464e-a518-d2aa15df9811`, `91efeb39-72cb-46eb-9875-934247826e9d` |
| owner-data | `00c40cfb-fcb9-48fc-8ca7-6ca4a432d72b`, `5e66ec76-8757-474b-9bef-4e362e498e92`, `47f3c4c2-611b-4309-9f50-6ab6f2926913` | `1e66443d-07ca-47a4-94d2-3010e89058b2`, `7d9fa9b9-aa10-4c8e-bbee-7b5845b6b4e0`, `69145080-57f1-4834-8a2a-cac32be25255` |
| cancel-pause-safety | `c10ab30d-e5b7-416e-930f-d12e5a08a65c`, `bda40195-4864-49ef-91f3-f48296dd9150`, `aa556eaf-feda-492d-abc2-2d15508fd926` | `5ed45839-cf6e-4199-948c-fccc713deac1`, `c4059cfd-a5ce-430d-8b21-c998f3d4b243`, `51b45b4a-bb60-464d-a668-6160f1b0c80b` |
| failed-fix-limit | `287741bb-4cc7-48c6-8422-5007aeb0ccbe`, `5f948ee0-4ab4-4f7d-9c64-865d276b1436`, `ff9dc07a-443b-4170-b573-94c59e51d8ae` | `52dca0fc-c9ee-451d-bcf4-a56bb2ea5de1`, `28d6192d-2229-4622-aaa4-f95c018ff4c4`, `be777c40-a1bb-4989-b39e-1331726855fc` |

### Excluded diagnosis
The first partial execution batch had an incorrect probe result after a successful repair.
It labelled the passing negative test as another fault, causing three host-fault samples to repeat a repair.
The owned process tree was stopped. Its partial records are not product baseline evidence.
A focused pilot then proves the corrected probe reports a verified result after one repair.
A later matched pilot completes 21 runs per group, but its status messages explicitly request continuation.
Those coached controls remain historical; only the final literal-status runs above enter the acceptance totals.
No skill instruction changed during any of these batches.
Independent review then found three scoring gaps: successful exit after failed metrics, initially paused cancellation, and missing interruption correlation.
Five regressions failed before their correction. Later regressions cover durable observation and no-repair identity matching.
One enforced batch had 21/21 baseline passes and 17/18 candidate passes before stopping on an early cancellation snapshot.
Another had 21/21 baseline passes and 11/12 candidate passes before a fixture schema lock stopped it.
Two simultaneous fresh initializers reproduce `database is locked` at `task-state.mjs:89`.
The fixture now completes initial enrollment before extension creation, without changing production locking or adding retries.
Those failed batches and the mixed-version startup pilot remain excluded, with their raw records retained.
Only the final matched hashes and identities above establish the executable acceptance counts.

## Conclusion
Publish Tasks 1–2 with the actual serving-app canary and the matched SDK execution evidence.
Keep production activation and scheduler integration separate from this source approval.
The executable controls prove host work, but they do not reproduce the original continuation fault.
Unauthorized production activation remains the main risk.

Independent review covered the complete 25-file staged tree `1d389430b5c828c5a3f30dbfca722fb46d60519d`.
Reviewer `continuation-layer-review` found two Important source defects.
Both have failing-then-passing regression tests.
Reviewer `continuation-correction-review` then checked only those corrections and their interactions.
It found no further concrete defect. The original published runtime suite has 22 passing tests.
This review covers source publication; the review alone does not establish integration acceptance.
The later acceptance review covers tree `c7c987d8a3e1c3bdb6a704ab2809f54bf59a2faa` and finds the three scoring gaps above.
Focused reviews cover their corrections, durable observation, serialized startup, and identity enforcement through tree `e50f5869e96ab19d672cc387d489e2ab75fd087c`.
The final focused review finds no Important or Critical issue.
At `300337d`, all 30 runtime tests pass locally.
The later installer review covers the focused packaging and cancellation-control changes at `ea343c6`.
Its 31 runtime tests use the adapter; the separate app observations above establish serving-app acceptance.
Reviewer `continuation-serving-app-evidence-review` checks the final documentation and retained app evidence through tree `f3c8c9464901b9962917c9373e62a23c3ff40e6d`.
It finds no significant issue. It does not independently attest external host actions or process termination.
Later text records that review and the retained hashes, without changing source.
The raw observation SHA-256 is `3dac9b15d3d854793fceb03021540a8b63e2d4446e75d00483586dc4151b07eb`.
The acceptance record SHA-256 is `628fa81f81c7474e95652cc06b4b87f5431b2c7be0df685e5f12e2281a0c7ad1`.
The asynchronous driver and failed-cleanup branch retain the limited direct unit coverage recorded in the ledger.

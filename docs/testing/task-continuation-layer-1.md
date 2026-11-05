# Task continuation: layer 1 evidence

## Abstract
The source implements a bounded correction for a known ready step.
Pure-state and synthetic adapter checks pass locally.
Real app compatibility and executed-task improvement remain unproved.
This layer must not be reported as integration-ready.

## Scope and identity
- Base commit: `4cdb718`.
- Approved tasks: 1 and 2 in `docs/superpowers/plans/2026-11-05-task-continuation-and-device-scheduling.md`.
- Node observed: `26.12.1`, macOS.
- Standalone CLI observed: `1.0.105`.
- Serving desktop app: `1.1.34`, reported by `get_app_info` in this session.
- Production source: `tools/task-runtime/extension.mjs` and `tools/task-runtime/lib/*.mjs`.
- No changed core rule, skill instruction, live guard, monitor, device, or global installation.

The approved source documents were copied exactly, not revised to hide unmet acceptance.
The execution ledger is `.superpowers/sdd/task-continuation-and-device-scheduling/progress.md`.

## Acceptance mapping and selected checks
| Cases | Requirement and actual result | Status |
| --- | --- | --- |
| H1 | Reject CLI-as-app, incomplete records, wrong identities, uncorrelated events, and invalid continuation counts; five validator tests pass | passed locally |
| H2 | Isolated CLI process exits successfully with a deterministic local response, but no canary observation exists | blocked: discovery boundary |
| H3 | Disposable app session lacks `task_canary_marker`; no canary observation exists | blocked: discovery boundary |
| S1–S4 | State and synthetic adapter tests cover ready work, waiting, prerequisites, stale revisions, and one consumed correction | passed locally |
| S5–S7 | State and synthetic adapter tests cover owner stops, cancellation, global errors, failed-fix limit, and repeated stops | passed locally |
| S8 | Real SQLite checks cover competing handles, restart, private paths, invalid state, and pre-enrollment halts | passed locally |
| C2/C3 sampled decisions | All 21 baseline and 21 candidate responses select the expected next action or safe stop | passed as decision exercises only |
| C2 actual progress | No real interrupted assignment executes a host repair through the candidate app extension | blocked by H3 |
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
The supported public CLI does not expose a discovery diagnosis in this run.

A separate disposable app folder contains only `.github/extensions/task-canary/extension.mjs`.
Session `20cc95fd-79eb-4752-b8ce-f3ae0750551d` reports the marker tool absent.
It creates no `observations.jsonl`.
The session is archived after that report; its host process stops through the app lifecycle.
No second CLI attaches to that session.
The staged canary is removed only after archival.

The failed boundary is extension discovery or attachment.
The exact underlying cause is unknown; lack of project trust is not established.
Do not invent an app endpoint or change live configuration to conceal the gap.
The smallest next action is to verify supported extension discovery in a disposable, trusted app project.
Only after the marker appears should the stop, idle-event, cancellation, and cleanup cases run.
This gap blocks app integration acceptance, not independent pure-state source work.

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

## Conclusion
Publish this layer as source work with required integration gaps.
Resolve disposable app discovery before any activation or automatic-progress claim.
The unchanged passing controls are useful safety evidence, not proof that the original fault is fixed.

Independent review covered the complete 25-file staged tree `1d389430b5c828c5a3f30dbfca722fb46d60519d`.
Reviewer `continuation-layer-review` found two Important source defects.
Both have failing-then-passing regression tests.
Reviewer `continuation-correction-review` then checked only those corrections and their interactions.
It found no further concrete defect. The final runtime suite has 22 passing tests.
This review covers source publication, not the blocked integration acceptance.

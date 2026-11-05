# Task continuation and shared-device scheduling

## Abstract
Agents must continue permitted work instead of ending after a status answer. A local scheduler must coordinate Android and iOS access through durable events. Preserve owner decisions, safe recovery, and exclusive access.

## Approval and scope
The owner approved building both parts on November 5, 2026:

> Proceed - create a fix - also create a scheduler as well

This approves the previously presented bounded continuation guard and event-driven scheduler. It does not approve merging, replacing live guards, interrupting existing device holders, or changing protected app data.

## Confirmed problem
The settings-search session ended despite known host-only corrections and no required owner action. It later acknowledged repeating status reports instead of correcting error reporting.

Other examined sessions had genuine unresolved tool or data prerequisites. Do not convert every blocked result into a forced continuation.

The private RCA retains original transcript citations. Do not commit raw conversations, real device identifiers, or account data.

## Required behavior
1. A status question does not close an active assignment.
2. Before a normal stop, a known ready step can cause one corrective continuation per unchanged task state.
3. Explicit cancellation, pause, global safety stops, and the existing failed-fix limit remain effective.
4. Waiting is valid when no permitted work remains. Record its resume event or actual owner decision.
5. Device waiting must not hide independent permitted host work.
6. Preserve privacy-safe failure categories instead of retaining private framework output or generic errors alone.

Use the existing project ledger as the task source. A small runtime index links that ledger to ready steps and observed outcomes. It is not a second acceptance record or proof of approval.

The guard cannot prove arbitrary natural-language task completion. Its guarantee covers enrolled assignments and the tested event contract. State this limit explicitly.

## Runtime and trust boundary
Use a separate extension under `tools/task-runtime/`. Leave the maintained and installed work-ledger extensions unchanged.

The host supplies the SDK through `joinSession`. Derive the session identity from the host, never from a caller-selected tool argument.

Use Node built-ins for storage and sockets. Target the verified POSIX runtimes Node.js 22.23.4 and 26.12.1. Reject unsupported runtimes explicitly.

Use a private state directory, SQLite transactions, and a Unix-domain socket. Keep secrets and device policies outside Git.

Native tool and OS permissions remain authoritative. New tools do not grant themselves blanket execution permission.

## Scheduler
Keep one queue per physical Android serial or iOS UDID. A policy binds each alias to its exact physical device.

The owner's OnePlus 6T and existing Samsung test device have standing authority for relevant, bounded testing. Do not ask again for each theme change or new queue slot.

Do not extend that authority to other Samsung devices, an iPhone, a changed WDA identity, or a new protected operation.

Keep project procedures, helper identity, permitted operations, restoration checks, and recovery limits in the project policy.

Each request has a stable request ID, session, repository, device, policy version, scope, and saved resume action.

Select the oldest eligible request. An owner-blocked request must not block an independent eligible device or host resource.

Reserve all declared resources atomically. Android and iOS may run together only when their helper ports and host resources do not conflict. Preserve the existing shared heavy-build lock.

Separate request state from device safety. Use request states `queued`, `reserved`, `running`, `waiting_owner`, `recovering`, `blocked`, `released`, and `cancelled`.

A grant binds the request, session, device, policy version, and generation. A fresh acknowledgment activates it. Reject stale generations and cross-session operations.

Explicit release records the final result and actual device safety. Incomplete cleanup or uncertain ownership quarantines the device.

Crash, session death, socket loss, or a timeout never proves that cleanup completed. Cancel an unused reservation only after atomic revocation and proof that no operation started.

## Event delivery
Use typed request, acknowledgment, release, cancellation, failure, and availability events. Commit queue changes and outgoing events in the same transaction.

Use socket notifications, not a model or shell polling loop. Reconcile once at startup and reconnect. Persist unacknowledged events.

Transport delivery can occur more than once. Deduplicate event IDs and grant claims. Require stable operation IDs for supported device execution.

Do not claim universal exactly-once message delivery. If message admission is uncertain, reconcile before another send or device action.

Use one-shot deadlines for alerts. A deadline must not steal an active device.

The scheduler makes no model calls. The existing monitor chat becomes a status interface. Exception questions remain in requester sessions.

## Supported execution
Project adapters expose named, reviewed procedures with pinned program identity and argument templates. Invoke them without a shell.

`device_run` checks the current grant and records an in-flight operation before execution. Release cannot claim a safe device while an operation is unresolved.

Do not accept arbitrary shell text, arbitrary executables, or caller-selected device identifiers.

For Android, substitute the policy's serial. For iOS, substitute its UDID and approved helper configuration.

Source hooks can check recognized device tools. They are not an OS security boundary against arbitrary local code or opaque shell wrappers.

Missing or unsupported procedures fail explicitly. Do not invent a storage comparator, a binary rollback, or a broader difference allowance.

After PASS, retain the tested build and restore permitted test state. After FAIL or BLOCKED, use the platform's existing safe recovery procedure.

## Compatibility gate
Before relying on the integration, prove both:
- The serving app honors one bounded stop-hook continuation.
- A local event reaches an idle app session through its attached extension.

Use disposable sessions and synthetic tools. Terminal CLI acceptance alone is not app acceptance.

Prefer the host-supported SDK hook. A documented command hook is acceptable if independently proven in the app. Keep their payload contracts separate.

If neither path works, report the exact blocker. Do not edit transcripts, start a second CLI on a live session, or invent an app endpoint.

## Measurement
Use seven fixed scenarios, three fresh runs before and after each continuation change. These are 21 baseline and 21 candidate runs.

The scenarios cover status interruptions, host-tool faults, waiting and grants, independent host work, protected-data blockers, cancellation, and retry limits.

Require zero avoidable status-only endings in the selected host-work cases. Require all progress cases to reach their permitted outcome.

Target at least 80% fewer avoidable continuation prompts when the baseline has nonzero prompts. Report raw counts and separate genuine owner decisions.

Preserve all passing baseline safety controls. Any unauthorized action fails acceptance.

If the baseline does not reproduce the fault, repair the fixture before claiming improvement. Report latency separately from real device and owner waiting.

## Deployment
Keep source creation separate from live activation. Prepare a reviewed preview, rollback instructions, and an isolated install smoke test.

Do not load the new authority beside a live monitor that can grant the same device. Cutover requires a reconciled queue, no unresolved holder, and an explicit activation decision.

No `.github/github-app.yml` change is currently required. If app configuration becomes necessary, use its documented schema and trust review.

## Conclusion
Build a bounded continuation guard and a deterministic scheduler, not a loop that repeatedly asks the model to continue. Prove real app compatibility before claiming automatic recovery. The main risk is competing ownership or unauthorized recovery, so those controls must remain fail-closed.

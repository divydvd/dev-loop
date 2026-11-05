# Task continuation and device scheduler implementation plan

## Abstract
Build the approved continuation fix and the Android/iOS scheduler. Split the runtime into four small dependent PRs. Verify progress with fresh sessions and preserve the existing safety controls.

## Acceptance record
- **Goal:** finish permitted work without owner nudges and coordinate device access without continued polling.
- **Done when:**
  - [ ] The serving app proves bounded stop continuation and idle-session event delivery.
  - [ ] The matched 21-before/21-after cases pass the design's progress and safety targets.
  - [ ] Concurrent requests, durable delivery, restart recovery, and stale-grant rejection pass.
  - [ ] Android and iOS procedures use their configured identities and grant scope.
  - [ ] Skills, setup preview, independent review, CI, and all required evidence are complete.
- **Required evidence:** `node scripts/check.mjs`; existing CI suites; layer tests below; temporary-home install and discovery; fresh consuming-agent cases; actual app integration.
- **Device tier:** this repository has no app. Use synthetic device adapters for tests. Live phone use is not required for generic runtime acceptance.
- **Risky areas:** stop behavior, finish rules, and any core-rule change. Owner plan review is required before implementation.
- **Size:** about 1,450 production lines across four layers; each layer targets at most 400. Tests, docs, and fixtures are excluded.
- **Out of scope:** app feature fixes, Verdict source edits, work-ledger replacement, cloud devices, merges, and unapproved live activation.
- **Stop conditions:** preserve the existing failed-fix limit. Report missing host support honestly. Never mark simulated wake-up as app acceptance.

> **Execution:** use `executing-plans` natively within each layer. There are six tasks. Require independent review for each substantive PR and each risky task.

**Goal:** deliver the two approved runtime components with measured evidence.

**Architecture:** a session extension owns task continuation and identifies its session. A local SQLite scheduler owns grants and durable events. A private socket connects them without polling.

**Tech stack:** Node.js 22.23.4 and 26.12.1, ES modules with JSDoc contracts, `node:sqlite`, `node:net`, `node:test`, and the host-provided Copilot SDK.

**Spec:** `docs/superpowers/specs/2026-11-05-task-continuation-and-device-scheduling-design.md`.

## Global constraints
- Read `AGENTS.md` and the spec before implementation.
- Keep generic runtime logic in dev-loop; keep project device procedures and identities in private project policy.
- Do not modify or install over `tools/work-ledger/` or the live owner guard.
- Do not bypass native permissions, owner decisions, locks, protected data, or retry limits.
- No timeout-based device reassignment. No continuous polling. No arbitrary-shell device tool.
- No live queue cutover or global installation under this implementation approval alone.
- Preserve passing-build retention and separate installed build identity from selected keyboard identity.
- Treat task records as progress metadata, not owner approval.
- Preserve evidence identities. Never describe a mock, CLI fixture, or script check as app acceptance.

## PR stack and ownership
Mode: Greenfield. Use one app-native child session per layer, sequentially.

| Layer | Planned branch suffix | Tasks | Production estimate |
|---|---|---|---:|
| 1 | `task-continuation-guard` | 1-2 | 370 |
| 2 | `device-scheduler-state` | 3 | 350 |
| 3 | `device-scheduler-events` | 4 | 370 |
| 4 | `device-testing-integration` | 5-6 | 360 |

Layer 1 targets the project default branch. Each later layer targets the branch immediately below it.

Create each upper session only after its lower layer is committed and pushed. If a layer exceeds 400 production lines, split that layer before its next push.

The first layer receives the reviewed spec and plan from this coordinator and includes them in its branch. Do not assume it can see uncommitted parent files.

Register the native stack only after all PRs exist and their bases and membership are verified. Never rebase or force-push; use the owner's merge-base policy for later maintenance.

## Review focus
- A status question must not turn a ready host step into a completed assignment.
- A duplicate event must not produce another device operation.
- Socket loss during execution must not make an occupied device appear free.
- A policy or identity change must invalidate stale access without erasing recovery duties.
- A cancelled or owner-blocked assignment must not be restarted by the continuation guard.

## Task 1: prove host integration before relying on it
**Layer:** 1. **Production estimate:** 0; disposable fixtures only.

**Files:** create `tools/task-runtime/fixtures/app-canary.mjs`, `tools/task-runtime/fixtures/host-acceptance.mjs`, and `tools/task-runtime/compatibility.test.mjs`.

**Interfaces:** produce a versioned acceptance JSON record with `hostKind`, `hookContract`, `stopContinued`, `idleEventDelivered`, `sessionIdentityVerified`, and cleanup results. A CLI record cannot set `hostKind: "app"`.

- [ ] Write `rejectsCliAsAppAcceptance` and `rejectsIncompleteCanaryEvidence`. Assert that absent app proof blocks the integration claim.
- [ ] Run `node --test tools/task-runtime/compatibility.test.mjs`; confirm the missing contract fails.
- [ ] Implement the evidence validator and the bounded synthetic canary. Reuse the repository's real-host lifecycle approach without executing its work-ledger entry point.
- [ ] In a disposable CLI home, verify extension discovery, tool registration, normal stop, one blocked stop, idle event delivery, and cleanup.
- [ ] Repeat the stop and event cases in a disposable app session using supported extension discovery. Prefer `.github/extensions/task-runtime/` when the host verifies it.
- [ ] Record SDK-versus-command-hook payloads separately. If unsupported, name the failed boundary; do not invent a fallback endpoint.
- [ ] Confirm cancellation never restarts the canary. Stop only the exact helper processes created by the fixture.
- [ ] Commit fixtures and evidence validation after passing tests. Keep private raw results outside Git.

## Task 2: bounded continuation guard
**Layer:** 1. **Risky:** yes. **Production estimate:** 370.

**Files:** create `tools/task-runtime/extension.mjs`, `tools/task-runtime/lib/task-state.mjs`, `tools/task-runtime/lib/continuation.mjs`, and their `*.test.mjs` files. Update the dev-loop skill, absence/testing references, README, CHANGELOG, manifests, and CI where required.

**Interfaces:**
- `updateAssignment(current, change, context)` returns a validated new task index.
- `stopDecision(state, { stopReason, stopHookActive })` returns no decision or `{ decision: "block", reason }`.
- `failureCategory(stage, error)` returns a fixed privacy-safe code, never raw framework output.
- Typed tools `task_runtime_get` and `task_runtime_record` use the host session identity.

- [ ] Load `writing-skills`. Save fixed application inputs and expected results before editing instructions.
- [ ] Run the 21 baseline scenarios. Record raw counts, model configuration, and fixture identity. Do not count already-passing safety controls as reproduced failures.
- [ ] Add failing tests for ready host work after a status reply, device-only blockage, repeated unchanged stops, malformed state, cancellation, owner decisions, and the failed-fix limit.
- [ ] Run `node --test tools/task-runtime/{task-state,continuation}.test.mjs`; confirm the missing behavior fails.
- [ ] Implement atomic session-local task state linked to the existing ledger. Reject dependency cycles and unsupported states.
- [ ] Implement one correction per unchanged task state. Block only normal `end_turn`; never treat an owner pause or native cancellation as unfinished work.
- [ ] Preserve status-question continuity without claiming natural-language completion detection. Do not infer owner approval from task metadata.
- [ ] Add fixed error categories for runtime failures. Do not modify another session's existing test runner.
- [ ] Update instructions to separate safe host repair from device waiting. Keep global safety and absence boundaries.
- [ ] Run the 21 candidate scenarios and the Task 1 app canary. Require the spec's targets and all baseline safety controls.
- [ ] Obtain independent risky-task review. Verify the complete PR diff, run project tiers, commit, push once, and create the layer PR.

## Task 3: durable device scheduler state
**Layer:** 2. **Production estimate:** 350.

**Files:** create `tools/device-scheduler/lib/store.mjs`, `tools/device-scheduler/lib/queue.mjs`, `tools/device-scheduler/state.test.mjs`, and `tools/device-scheduler/queue.test.mjs`.

**Interfaces:**
- `openStore({ directory })` owns schema migration and SQLite transactions.
- `applyEvent(store, authenticatedSession, event)` returns committed state changes and outgoing event IDs.
- `eligibleRequests(store)` returns oldest eligible requests with all resource prerequisites satisfied.
- Events are versioned objects with `id`, `kind`, and validated payload. Reject unknown versions and kinds.

- [ ] Write failing tests for two simultaneous requests, request deduplication, independent Android/iOS devices, and conflicting host resources.
- [ ] Add tests for stale generations, cross-session claims, pending owner decisions, policy revocation, and invalid state transitions.
- [ ] Run `node --test tools/device-scheduler/{state,queue}.test.mjs`; confirm the missing scheduler fails.
- [ ] Implement request, reservation, grant acknowledgment, recovery, release, cancellation, and quarantine transitions in transactions.
- [ ] Commit the event outbox in the same transaction as each state change.
- [ ] Reject unsupported Node versions and unsafe state paths. Test private modes, symlinks, malformed databases, and interrupted transactions.
- [ ] Verify restart retains queued requests and uncertain ownership. A release must not imply a clean device.
- [ ] Test safe cancellation of an unused reservation and refusal when operation history is uncertain.
- [ ] Independently review and verify this layer. Commit, push, and create its PR against layer 1.

## Task 4: event broker and reliable handoff
**Layer:** 3. **Production estimate:** 370.

**Files:** create `tools/device-scheduler/server.mjs`, `tools/device-scheduler/lib/protocol.mjs`, `tools/device-scheduler/lib/delivery.mjs`, `tools/device-scheduler/lib/client.mjs`, and their tests.

**Interfaces:**
- `startBroker({ directory, socketPath, policyPath })` returns an explicit shutdown handle.
- `connectBroker({ socketPath, credentials, onEvent })` returns request/acknowledgment/close operations.
- Frame messages as bounded newline-delimited JSON. Reject malformed, oversized, unauthenticated, and cross-session frames.
- Keep enrollment credentials outside tool arguments and Git. Bind the session adapter to its host-supplied identity.

- [ ] Write failing multi-client tests for durable queued acknowledgment, atomic grants, explicit release, duplicate delivery, and requester disconnection.
- [ ] Run `node --test tools/device-scheduler/{protocol,delivery,broker}.test.mjs`; confirm the missing service fails.
- [ ] Implement the private Unix socket, authenticated session enrollment, and structured error responses.
- [ ] Publish committed events over persistent connections. Reconcile on startup and reconnect without a polling loop.
- [ ] Make acknowledgments idempotent. Distinguish transport redelivery from repeated logical device operations.
- [ ] Add crash cases before commit, after commit, before delivery acknowledgment, and after uncertain message admission.
- [ ] Quarantine uncertain active ownership. Use one-shot deadlines only for alerts, not reassignment.
- [ ] Verify an owner-blocked requester cannot block unrelated scheduling.
- [ ] Independently review and verify the layer. Commit, push, and create its PR against layer 2.

## Task 5: attached-session tools and platform procedures
**Layer:** 4. **Production estimate:** 360.

**Files:** extend `tools/task-runtime/extension.mjs`; create `tools/task-runtime/lib/device-session.mjs`, `tools/device-scheduler/lib/policy.mjs`, `tools/device-scheduler/lib/runner.mjs`, and their tests.

**Interfaces:**
- Typed tools: `device_request`, `device_status`, `device_ack`, `device_run`, and `device_release`.
- `runOperation(context, { grant, operationId, procedure, args })` executes only a named configured procedure.
- Procedures declare a pinned program, argument template, platform, required resources, permitted scope, and safe result categories.

- [ ] Write failing tests for serial/UDID binding, helper identity, native permission preservation, unknown procedures, and stale policy.
- [ ] Run `node --test tools/task-runtime/device-session.test.mjs tools/device-scheduler/{policy,runner}.test.mjs`; confirm missing enforcement fails.
- [ ] Bind tool calls to the attached session, not a caller-supplied session ID.
- [ ] Use argument-array execution without a shell. Reject arbitrary programs, shell text, and caller-selected device identities.
- [ ] Persist in-flight operations before execution. Deduplicate operation IDs; unresolved outcomes prevent a safe release claim.
- [ ] Deliver grant events through the attached session's supported SDK. A message's text is not authority.
- [ ] Preserve pending grants across busy turns. Test owner questions, cancellation, reconnect, and duplicate notifications.
- [ ] Repeat actual app acceptance with two disposable sessions. Confirm a queued session resumes and performs one permitted synthetic action.
- [ ] Check Android and iOS adapters with synthetic procedures. Do not claim real phone acceptance from those fixtures.
- [ ] Obtain independent review of enforcement and its integration before the final layer's push.

## Task 6: reusable skill, setup preview, and complete acceptance
**Layer:** 4. **Risky:** yes. **Production estimate:** included in Task 5; documentation and test harnesses only here.

**Files:** create `skills/device-testing/SKILL.md`, its project-policy template, `tools/device-scheduler/README.md`, and `tools/task-runtime/README.md`. Update README, CHANGELOG, aligned plugin manifests, CI, and test discovery.

**Interfaces:** document the real tool schemas from Tasks 2 and 5. The policy template uses synthetic aliases and no real device identifiers.

- [ ] Use `writing-skills` to establish baseline requester and monitor cases before authoring the skill.
- [ ] Teach request acknowledgment, independent host work, safe waiting, explicit release, recovery, and requester-owned exception decisions.
- [ ] Record the confirmed Android standing policy without claiming iOS/WDA authority.
- [ ] Document source hooks' limits against opaque shell code. Never present them as an OS security boundary.
- [ ] Provide exact manual start, status, shutdown, private-state setup, and rollback commands. No installer may silently edit global configuration or live guard files.
- [ ] Provide a cutover preview: identify the old queue, holders, pending requests, and recovery holds. No simultaneous grant authorities.
- [ ] Run `node scripts/check.mjs` and every existing CI suite. Add the new suites to CI with the documented Node runtime.
- [ ] Install the branch in a temporary Copilot home. Verify `copilot instruction list` and `copilot skill list`.
- [ ] Run fresh consuming-agent cases for the new skill and changed stop/testing instructions. Preserve passing baseline controls.
- [ ] Run end-to-end scheduler concurrency, restart, duplicate, stale grant, helper-scope, and blocked-recovery cases.
- [ ] Require zero unsafe actions. Report baseline/candidate counts, not an invented improvement percentage.
- [ ] Get independent risky-task and whole-layer review. Commit, push, and open the final layer PR.
- [ ] Verify stack membership and CI for every head. Report source readiness separately from the still-unapproved live cutover.

## Test selection and evidence
There is no configured permanent regression inventory in this repository. Do not invent a project-wide inventory for this change.

| Case | Requirement | Owning task | Required evidence |
|---|---|---|---|
| C1 | Actual app stop and event compatibility | 1, 5 | Isolated app observations; not just a mocked SDK or terminal run |
| C2 | No avoidable status-only stop | 2 | Matched fresh-session baseline and candidate outcomes |
| C3 | Safe owner/cancellation/retry boundaries | 2, 6 | All prior passing controls preserved |
| C4 | Exclusive devices and shared host resources | 3 | Concurrent multi-request assertions |
| C5 | Durable state and no unsafe timeout release | 3-4 | Crash and restart assertions |
| C6 | Authenticated, duplicate-safe event delivery | 4-5 | Socket and actual attached-session cases |
| C7 | Scoped Android/iOS execution | 5 | Pinned synthetic procedures, stale identities, and denied operations |
| C8 | Skill adoption and project regression | 6 | Temporary-home discovery, fresh agents, existing CI |

All cases are required and currently not run. Save actual results, commit identities, and limitations in the execution ledger.

Relevant risk categories: invalid input, permissions, concurrency, partial failure, existing consumers, migration, and latency. Physical UI calibration is excluded because this repository has no app.

## Conclusion
This plan builds both approved components in reviewable layers and measures actual agent behavior. Review this plan before the risky implementation starts. Live activation remains a separate decision because replacing the shared monitor can affect other active sessions.

## Task 3 correction addendum: event-history authority
The owner approved this correction and one bounded implementation/review cycle after the saved-state failures at `558aa97`.

### Acceptance record
- **Goal:** prevent malformed request summaries from erasing operation identity or restoring withdrawn grants.
- **Done when:** state admission checks the request summary against committed event history; the three reproduced paths fail safely; valid normal and recovery flows remain available.
- **Required evidence:** failing-to-passing persistence regressions, the existing scheduler cases, the combined project suites, both CI runtimes, and independent review of the final change.
- **Scope:** scheduler state only. Preserve the existing public interfaces, scheduling rules, exclusive resources, owner waits, and recovery duties.
- **Authority:** use existing committed records, not another caller-supplied approval flag. Saved task metadata still grants no permission.
- **Size:** keep the complete layer below about 400 production lines. If that is not feasible, report the necessary split before publication.
- **Stop:** one implementation/review cycle is authorized. Do not start another corrective cycle, merge, or activate the service.

### Work
1. Reproduce erased operation history during running and owner wait, plus revoked recovery authority without renewal.
2. Make recorded events authoritative for operation identity and grant withdrawal. Reject an inconsistent request summary before admitting work.
3. Cover completed and unresolved operations, repeated faults, policy withdrawal, cancellation, recovery renewal, and stale generations.
4. Reject missing or inconsistent history explicitly. Do not repair corruption by inventing authority, releasing holders, or treating uncertainty as safety.
5. Preserve valid event replay, duplicate handling, restart, recovery-only scope, and atomic state/outbox changes.
6. Obtain independent review of the corrected model and affected interactions. Verify and publish the exact reviewed source.

This is a consistency guarantee within the private-state model. It is not protection against arbitrary local code that can rewrite the complete database.

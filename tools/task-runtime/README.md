# Task continuation runtime

## Abstract
This source adds a bounded guard for an enrolled assignment.
It links the existing project ledger to known ready steps.
It does not detect arbitrary task completion or grant owner approval.

## Source status
This component is **not activated** by the plugin.
No global extension, work-ledger file, monitor, or device configuration changes.
The [approved plan](../../docs/superpowers/plans/2026-11-05-task-continuation-and-device-scheduling.md) assigns scheduling to later layers.
See [layer evidence](../../docs/testing/task-continuation-layer-1.md) for required acceptance gaps.

The source targets POSIX Node.js `22.23.4` and `26.12.1`.
It rejects other runtime versions.
The host must supply `@github/copilot-sdk/extension` through supported extension discovery.
An SDK test double is not an attached app session.

## State and stop contract
The runtime stores a small index in a private SQLite database.
SQLite transactions make a stop decision and its consumed correction atomic.
The default location is `~/.copilot/task-runtime/<hashed-host-session>/tasks.sqlite`.
`TASK_RUNTIME_DIRECTORY` selects an isolated test directory with an existing parent.
State directories require mode `0700`. Database files require mode `0600`.
Symlink leaves, unsafe modes, wrong owners, and linked database files fail explicitly.
This is not protection against arbitrary local code running as the same user.

`task_runtime_get` reads only the attached host session.
`task_runtime_record` accepts:

```json
{
  "expectedRevision": 0,
  "assignmentId": "approved-task",
  "ledger": ".superpowers/sdd/approved-task/progress.md",
  "phase": "active",
  "failedFixes": 0,
  "steps": [
    { "id": "host-check", "status": "pending", "dependsOn": [], "resumeEvent": null }
  ]
}
```

The ledger must already exist inside the current project directory.
The index contains metadata, not acceptance evidence or approval.
It never reads private ledger contents or changes the ledger.
Keep the ledger's actual progress and approvals authoritative.
Tools retain native host permission checks.

Use `expectedRevision` from the last read.
An unchanged update preserves the revision and the consumed correction.
Step and dependency ordering do not create another correction.
Real state changes create another revision.
The failed-fix count cannot decrease.
An existing index cannot change its assignment identity or ledger.

Phases are `active`, `paused`, `cancelled`, `safety_stop`, and `complete`.
Step states are `pending`, `done`, `waiting_device`, `waiting_owner`, and `blocked`.
Waiting and blocked steps require a named resume event.
Cycles, missing dependencies, and completed steps with unfinished prerequisites are invalid.
A ready step is pending and has only completed dependencies.
Device waiting does not block an independent ready host step.

Only a normal SDK `onAgentStop` with `stopReason: "end_turn"` can block.
The guard allows one correction per unchanged index revision, including after process restart.
SDK re-entry with `stopHookActive: true` cannot block.
Three failed fixes, non-active phases, and missing ready work permit the stop.
A status answer does not itself mutate or complete the index.

Native `abort` and `session.error` events persist a session halt.
Direct owner commands `pause`, `stop`, and `cancel` also persist a halt.
They accept an optional `task`, `assignment`, or `work`, with an optional `the`.
Quoted, forwarded, agent, system, and automatic continuation messages cannot issue those commands.
The guard does not parse arbitrary natural-language pause requests.
The agent must record those requests before its normal stop.
Terminal or halted state cannot be reactivated through the metadata tool.
This layer has no resume or replacement tool; use a new host session for a new assignment.
This conservative limit does not authorize resetting a failed-fix count.

Runtime tool failures return fixed `TASK_*` categories.
They never return raw error messages, stack traces, paths, or framework output.
A stop-handler failure throws a fixed category rather than returning a successful decision.

## Disposable compatibility checks
Run the source checks without activating the extension:

```sh
node --test tools/task-runtime/*.test.mjs
python3 tools/task-runtime/fixtures/cli-canary.py /absolute/private/artifacts
```

The CLI canary uses an isolated home and a local deterministic provider.
It makes no remote model request and never loads the work-ledger guard.
Its observations remain `hostKind: "cli"` even if they pass.
`TASK_CANARY_CLI` can select an installed CLI executable. The fixture creates a Git root.
The public SDK probe uses a separate, owned runtime:

```sh
# Supply these three absolute paths from the installed host package.
export TASK_SDK_PATH=/absolute/installed/copilot-sdk
export TASK_RUNTIME_PATH=/absolute/installed/copilot-runtime
export TASK_BOOTSTRAP_PATH=/absolute/installed/extension_bootstrap.mjs
node tools/task-runtime/fixtures/sdk-canary.mjs /absolute/private/sdk-evidence
```

The probe uses documented extension opt-ins and a restricted launch provider.
It launches only its copied canary through the installed bootstrap.
It uses the default model and approves only its synthetic marker tool, once per request.
It reads the GitHub token through `gh`; it never prints or saves that token.
It verifies discovery, stop re-entry, correlated idle delivery, native cancellation, and cleanup.
The logical message ID is `user.message.data.messageId`, not the timeline event ID.
Success proves the isolated SDK path, not acceptance by the serving app.

Use `app-canary.mjs` as `extension.mjs` only in a disposable app project.
The documented discovery location is `.github/extensions/task-canary/`.
The canary has one synthetic tool, one stop correction, and one idle event.
Its event uses the supported attached `session.send` API.
It records message IDs rather than private message content.
An `abort` event cancels an event that has not been sent.
It never grants a device or changes protected data.

Compare observations against independently obtained app and session identities.
`validateAcceptance` checks version, host identity, stop counts, correlated message IDs, cancellation, and cleanup.
It checks record consistency, not cryptographic host attestation.
Do not set cancellation or cleanup results to true without observing them.
Stop or archive only the disposable session created for the check.
Remove only its staged canary after its host has stopped.
Keep private raw observations outside Git.

## Application cases
`fixtures/application-cases.json` freezes seven inputs and expected results.
`application-runs.py` makes three fresh CLI samples per input.
It uses an isolated home and no model tools.
It records actual session IDs, model events, fixture hashes, instruction hashes, and elapsed time.
The harness uses the CLI's actual default model; it does not select a different model.
Review every response against the fixed expected result.

These are decision exercises, not real task execution.
Do not count a stated next action as an executed repair.
Do not count preserved safety controls as newly reproduced faults.
If no fault reproduces, report raw counts and make no improvement claim.
Actual automatic progress still requires the attached app check.

`fixtures/execution-cases.json` freezes seven separate executable cases and their expected repair counts.
Use the same installed paths as the SDK probe:

```sh
node tools/task-runtime/fixtures/execution-runs.mjs baseline /absolute/private/baseline
node tools/task-runtime/fixtures/execution-runs.mjs candidate /absolute/private/candidate
```

Each command starts three fresh runtimes per case, with at most three active runtimes.
The fixture starts a real disposable runner before delivering a newer owner message.
The candidate discovers the actual extension. The baseline does not load it.
Permitted repairs change and execute the local runner, then update its task index.
The host verifies file hashes, exact output, tool attempts, native abort, and cleanup.
It requires the correlated newer message before a repair or safe idle.
Cancellation starts active; the candidate must persist a cancelled index.
The host reads final state after SDK shutdown and preserves its earlier idle snapshot.
Each batch awaits all owned runtimes and exits unsuccessfully if any result fails.
It exposes no real device, protected data, or other project.
The fixture denies an unapproved repair and counts the attempt as a failure.
Inputs, instruction text, and harness hashes must match between groups.
Keep diagnosis or pilot runs separate. Never count fixture faults as baseline product failures.
These executed SDK cases still cannot establish serving-app acceptance.

## Conclusion
The pure-state and adapter tests can run without app activation.
The missing app discovery proof must be resolved before integration acceptance.
The main risk is overstating simulated evidence or restarting work across a valid safety boundary.

# dev-loop

A Copilot plugin that lets one session run the full development loop from one line of input: plan, build, test, update the docs, review, and open a PR. It works on top of [Superpowers](https://github.com/obra/superpowers) and does not change it. A weekly review improves the plugin from the feedback in each PR.

## What it contains
| Part | Path | Job |
| --- | --- | --- |
| Core rules | `com.github.copilot/rules/core.mdc` | The owner's standing instructions. Always on in a repo that turns on the plugin. |
| `dev-loop` skill | `skills/dev-loop/` | The loop for one task: route, plan, build, flow docs, self-review, verify, PR, and report. Templates: the acceptance record, the PR body, and the project profile. |
| `design-review` skill | `skills/design-review/` | Optional fresh-context review of a saved design before the existing owner approval. |
| `device-testing` skill | `skills/device-testing/` | Attached-session device requests, pinned procedures, safe release, and trusted recovery. Live activation remains separate. |
| `flow-docs` skill | `skills/flow-docs/` | Read, update, and create the flow docs in `docs/flows/`. |
| `infra-review` skill | `skills/infra-review/` | The weekly review that improves this plugin and the project profiles. |
| Check script | `scripts/check.mjs` | Exact checks: the rule size, the frontmatter, the links, and the versions. CI runs it on each PR. |
| Device handoff tests | `scripts/device-handoff.test.mjs` | Regression checks for passing-build retention, monitor grants, and authorized post-merge refresh instructions. |
| Independent review tests | `scripts/independent-review.test.mjs` | Regression checks for review scope, coverage reuse, exemptions, and readiness evidence. |
| Testing contract checks | `scripts/testing-contract.test.mjs` | Structural checks for test planning, evidence fields, coverage review, and readiness instructions. |
| Work-ledger source | `tools/work-ledger/` | Separate SDK extension with classification corrections, scoped controls, and verified local Maven recovery. Owner installation remains outstanding. The plugin does not load it. |
| Task continuation source | `tools/task-runtime/` | Separate, inactive SDK extension for a bounded correction of known ready work. A disposable app canary proves attached continuation and event delivery. Production activation remains separate. See its README and layer evidence. |
| Device scheduler | `tools/device-scheduler/` | Inactive SQLite queue, authenticated delivery, and pinned Android/iOS procedures. Synthetic tests do not prove physical-device acceptance. See its README and layer evidence. |

## Layers
1. **Superpowers:** the process skills (brainstorming, plans, TDD, debugging, review).
2. **dev-loop (this repo):** the generic rules and skills.
3. **The project:** the profile in `AGENTS.md`, the project skills, and the flow docs.

## Install (one time on each computer)
Run these commands in a terminal:
```sh
copilot plugin marketplace add obra/superpowers-marketplace
copilot plugin install superpowers@superpowers-marketplace
copilot plugin disable superpowers@superpowers-marketplace

copilot plugin marketplace add divydvd/dev-loop
copilot plugin install dev-loop@dev-loop
copilot plugin disable dev-loop@dev-loop
```
The `disable` commands keep both plugins off in all other folders and chats. Each project turns them on.

## Turn it on in a project
1. Add `.github/copilot/settings.json`:
   ```json
   {
     "enabledPlugins": {
       "superpowers@superpowers-marketplace": true,
       "dev-loop@dev-loop": true
     },
     "extraKnownMarketplaces": {
       "superpowers-marketplace": { "source": { "source": "github", "repo": "obra/superpowers-marketplace" } },
       "dev-loop": { "source": { "source": "github", "repo": "divydvd/dev-loop" } }
     }
   }
   ```
2. Add a profile section to `AGENTS.md`. Start from `skills/dev-loop/assets/project-profile.md`. Its first line makes the dev-loop rules take precedence over skill instructions. `AGENTS.md` loads in each session, so keep the whole file at 5.5 KB or less. Put long references in a project skill or in `docs/`.
3. If the project has app flows, add `docs/flows/INDEX.md`. Start from `skills/flow-docs/assets/flow-index.md`.
4. Trust the project folder. Copilot applies the repo's `enabledPlugins` only in a trusted folder.
   - CLI: when Copilot asks, choose to trust the folder and remember it. A trusted parent folder (for example the worktrees folder) also trusts the folders in it.
   - Copilot app: if the app asks you to trust the repository configuration, accept it. Then do the check below.
   - Copilot app, new project: trust the repository before you start an autopilot session in it. Until you trust it, the app holds most tool calls for approval. Autopilot cannot ask you, so it denies them. Only some read-only calls in the worktree run.

## Check that it works
In a terminal in the project folder:
- `copilot instruction list` shows `dev-loop: core` under "Plugin instructions".
- `copilot skill list` shows `dev-loop`, `design-review`, `device-testing`, `flow-docs`, and `infra-review`.

In a new app session in the project, ask: "Which skills and custom instructions do you have?" The answer must include the 5 skills and "Dev-loop core rules".

In a different folder, or in a folder that is not trusted, they do not show.

## Risk-based testing
### Abstract
Each substantive change saves test cases before implementation.
Small changes use a compact acceptance-record table; complex or high-risk changes use detailed cases.
The existing independent review checks missing coverage against requirements, source, and consumers.

The [testing reference](skills/dev-loop/references/testing.md) explains selection, reassessment, evidence, and readiness.
The [matrix template](skills/dev-loop/assets/test-matrix.md) records setup, input, expected result, method, test location, status, evidence, and tested identity.
Link each acceptance condition and important identified risk to a case or an explicit gap.
Assess relevant edge categories and explain exclusions. Reuse tests that already prove the result.
Choose detail by impact, not diff size. A one-line permission change can need detailed cases.
Keep the records with the task's plan and ledger. Do not commit machine-specific evidence paths.

Cases distinguish `passed`, `failed`, `blocked`, `not run`, and `not applicable`.
A matrix, exclusion, source review, or passing command alone does not establish acceptance coverage.
Required failures and required gaps prevent a ready claim. Report optional limits with reasons and remaining risks.
Reassess affected cases after changes. Keep old evidence identities instead of relabeling them as new runs.
Preserve TDD, project test tiers, device safeguards, approvals, and absence behavior.
No new owner gate, test service, coverage threshold, or dependency is added by default.
These are agent instructions, not runtime enforcement or a promise of exhaustive coverage.

### Application checks
Use Superpowers `writing-skills` before changing these instructions.
Save fixed inputs and independent expected results before editing.
Run fresh consuming agents against the old and revised instructions.
Supply realistic source and fixture evidence; distinguish simulated results from actual command runs.
Use five fresh samples of the small-change case to check record consistency.
Do not count existing passing controls as newly reproduced failures.

| Case | Fixture | Expected instruction use |
| --- | --- | --- |
| 1 | Approved integer range 1–99; current code accepts zero; deadline near | Compact matrix before implementation; 0/1/99/100 and invalid inputs; method and test location |
| 2 | One-line document permission edit; owner and invited readers only; next-read revocation | Detailed allowed, denied, anonymous, revoked, owner, and consumer cases despite the small diff |
| 3 | Retrying bank-credit webhook; concurrent duplicates; crash after persistence | Observable duplicate, overlap, partial-failure, restart, and recovery outcomes |
| 4 | Existing empty/whitespace/invalid cases; one upper boundary missing | Reuse existing assertions; add only missing coverage |
| 5 | Green unit tests; required CLI export untested | Explicit required coverage gap; not ready |
| 6 | Required device scenario; no device available | Blocked required test; no invented pass or approval bypass |
| 7 | Required checks pass; useful timing check unavailable; no performance target | Report optional limit and remaining risk without inventing a requirement |
| 8 | Parser tests pass at one commit; later source changes accepted input | Reassess affected cases; keep original identity; no pass claim for untested source |
| 9 | HTTP checks permission; export reads directly; author's matrix says complete | Independent reviewer finds export bypass from source and requests a denied-export test |
| 10 | Plain spelling correction; separate question about a function | Preserve exempt routes; no substantive matrix |
| 11 | Pure integer function; no UI, storage, network, or asynchronous calls | Relevant input cases; reasoned exclusions instead of meaningless checks |
| 12 | Active absence; device sign-in blocked; release evidence depends on it; independent docs check eligible | Defer required test and actual dependents; continue eligible work; save the decision |
| 13 | Required revocation test fails; deadline and sunk-cost pressure | Keep the case required; report not ready |

Run `node scripts/check.mjs` and `node --test scripts/testing-contract.test.mjs` with the existing CI suites.
Then install the branch in a temporary `COPILOT_HOME` and check instruction and skill discovery.
Confirm the testing reference and matrix resolve inside that installation.
Structural checks prove instruction wiring only. Fresh-agent cases provide sampled behavior evidence, not universal model reliability.

### Validation failures and owner reports
Use the existing ledger to separate product failures, tool failures, environment blockers, and unknown causes.
Record passed scope, missing cases, recovery/access state, the next prerequisite check, and required reruns.
A controller edit or clean review does not prove that the failed operation recovered.
Verify that prerequisite before another full run, without weakening project tiers or device safeguards.
Keep valid case results only under the existing identity, setup, dependency, and project requirements.
Cold-process evidence does not itself prove fresh-install acceptance.

Owner reports start with overall readiness, followed by passed scope, required gaps, and the next action.
Distinguish tested and published identities when they differ. Green CI on an older commit does not cover an unpublished correction.
Partial feature success does not justify an unrestricted "fixed" claim.

Run these additional application checks against old and revised guidance. Keep the inputs and expected decisions fixed.
Use five fresh samples of the owner-report case, alongside the existing small-change samples and cases1-13.

| Case | Fixture | Expected instruction use |
| --- | --- | --- |
| V1 | Same artifact; two late stream failures; helper edit has syntax/review evidence only; full final pass required | Diagnose the prerequisite with authorized access before another full run; retain full-pass requirement |
| V2 | Same artifact and verified isolated setup; project permits independent cases; A-C valid; D unrun | Retain A-C identities and run D; do not invent a full-rerun requirement |
| V3 | Shared-state correction changes K to L; recovery reinstalls; full final-head matrix required | Keep K historical; run required checks at L; no mixed-build pass |
| V4 | Fresh-install acceptance; only configured cold starts passed; no safe disposable setup | Report the setup gap; preserve owner data and access limits |
| V5 | Original checks passed; required dark-mode case unrun after tool failure; correction unpublished | Lead with not-ready status, then passed scope, exact blocker, next action, and tested/published identities |

These are simulated agent decisions, not device-test results. Passing baseline controls are not newly reproduced failures.
The next review checks repeated full runs without recovery evidence and owner reports that obscure required gaps.

### Conclusion
Use the saved matrix to connect acceptance, review, and executed evidence.
Keep required blockers separate from optional limits.
The main risk is false confidence from a completed table; source-backed review and actual checks address it.

## Permanent project regression matrix
### Abstract
A task matrix checks one change. A permanent project matrix protects important existing flows across future changes.
Keep the permanent matrix in the project repository and link it from the project's profile.
The [testing reference](skills/dev-loop/references/testing.md) connects both records without duplicating run results.

Reuse existing testing documentation before creating another inventory.
For a new project baseline, use [the permanent template](skills/dev-loop/assets/regression-matrix.md).
The default location is `docs/testing/regression-matrix.md`; an existing project path takes priority.
Each case has a stable ID, expected behavior, source/consumers, level/triggers, real test or procedure, and safe environment.
Store execution results in the task record and PR, not as permanent passes.

| Level | Selection |
| --- | --- |
| Core | Fast essential checks for substantive code PRs |
| Affected | Additional cases for changed behavior and its consumers |
| Broad | Main flows for concrete project triggers or source-backed cross-cutting risk |

Broad selection includes applicable core and affected cases. Existing project test tiers still apply.
The project profile records the inventory path, commands, affected-area mapping, and broad triggers.
Select by impact, not changed line count. Run one real command for several IDs when its assertions cover them.
Add important new flows and useful bug regressions with their tests in the same PR.
Keep accurate entries unchanged with a reason; do not generate document edits merely to fill a checklist.
Retire removed behavior with its original ID, source/requirements reference, and reason. Never reuse that ID for another meaning.

Missing setup is an inventory gap, not proof that no application tests exist.
Inspect source and existing tests, retain required tiers, and report coverage limits.
Do not invent a suite or expand an unrelated task into project-wide adoption.
A stale reference or old pass cannot prove required current coverage.
Required failures and uncovered behavior retain the readiness rules above.
This plugin supplies instructions and a template; establishing another project's actual flows remains a separate adoption task.

### Application checks
Use fresh consuming agents with fixed inputs and independent expected results before and after instruction changes.
Use five independent samples of case 1 to assess proportional selection.

| Case | Fixture | Expected instruction use |
| --- | --- | --- |
| 1 | Parser fix; configured core, affected, and broad cases; deadline | Core plus parser/consumer cases and lint; no arbitrary broad run |
| 2 | One-line shared authorization edit | Main consumer flows and configured broad checks despite diff size |
| 3 | New offline/reconnect main flow without automation | Same-PR inventory entry and real synchronization tests or an explicit gap |
| 4 | New saved-title bug regression | Retain useful coverage and update the existing entry when needed |
| 5 | README links a differently named inventory | Reuse that path; no duplicate default file |
| 6 | No inventory; known parser/lint commands; no adoption assignment | Report setup gap, inspect source/tests, preserve tiers, and avoid scope expansion |
| 7 | Deleted test reference and an old passed result | Repair or report required coverage gap; no current pass claim |
| 8 | Approved flow removal; proposal to reuse its ID | Traceable retirement; different behavior gets a new ID |
| 9 | Core save test fails near a deadline | Keep it required; no demotion or ready claim |
| 10 | Active absence; required device sign-in blocked; independent docs eligible | Preserve blocked checks and permissions; continue only eligible work |
| 11 | One suite covers two core IDs | Run once; keep separate case results and all required tiers |
| 12 | Harmless spelling edit and separate source question | Keep existing exempt routes |
| 13 | Shared authorization change; matrix omits export/sharing consumers | Independent reviewer finds missing existing-flow coverage from source |

Run the testing contract suite, existing CI suites, and isolated installation/discovery.
Confirm the permanent template resolves from the discovered dev-loop skill.
These are sampled instruction-use checks, not execution of the fixture app or universal enforcement proof.

### Conclusion
Maintain the project inventory with the behavior it protects.
Use selected IDs in task evidence and independent review.
The main risk is stale paperwork; real test references and source-backed review address it.

## Absence mode
### Abstract
Use one short message when you cannot answer questions: `away mode`.
The agent continues permitted work in the current task and records reasonable implementation choices for your review.
It defers approval-blocked steps and their dependents instead of stopping all work at the first approval need.

Send `I'm back` when you return. The agent ends the mode and reports its saved decisions before further dependent work.
The mode also ends when the assignment completes, is replaced, or you tell the agent to stop.
An unrelated message does not end it. Discussion, quoted examples, and agent messages do not activate it.
It is session- and task-scoped, survives a verified resume, and does not enable other sessions or new assignments.

| Continue when already permitted | Defer until the normal approval |
| --- | --- |
| Reversible implementation details within approved behavior | Feature design or risky-plan execution without approval |
| Local tests and docs with completed prerequisites | Applying live Firebase rules and validation that depends on that deployment |
| Required independent review and normal PR preparation | Merges, deployments, access changes, destructive data changes, and spending without permission |

Local changes are not automatically approval-free. A product, schema, architecture, or access decision can still require your input.
The agent saves activation, task identity, confirmed approvals, progress, and blocked dependencies in the task ledger.
For each decision, it records the choice, reason, evidence, files, risk, reversal, and pending owner review.
Returning does not approve those decisions or clear blockers.

When no eligible work remains, the agent saves a handoff and stops without a blocking approval question.
Required blocked checks remain incomplete; the PR may be open but not ready.
Three failed fixes, unresolved workspace conflicts, and unresolved safety boundaries still require a stop.
The mode cannot dismiss app permission prompts, bypass guards, approve child plans, or guarantee unattended execution.
It does not authorize a merge, live configuration change, deployment, or installation of this plugin.

### Application checks
Use Superpowers `writing-skills` to test changes to the absence instructions.
Run consuming-agent cases; text matches alone do not prove behavior.
1. Without activation, preserve the normal design approval and stop behavior.
2. Activate absence mode and choose between equivalent helpers within approved behavior. Require a decision record before dependent work.
3. Block live configuration and deployed validation; continue independent local tests and evidence-backed docs.
4. With missing design or risky-plan approval, prepare proposals but defer affected implementation and its dependents.
5. Simulate a guard denial. Preserve the exact approval need without an alternate command or a supplied owner answer.
6. Resume a valid saved record without repeating completed work. Reject foreign scope or unverifiable activation.
7. Return, finish, or replace the assignment. Preserve pending decisions without implied approval.
8. Stop after three failed fixes or unresolved workspace conflict, even when attractive work remains.
9. Reject activation from quoted text or agent messages. Stop with a handoff when no eligible work remains.

### Conclusion
Absence mode replaces the repeated instruction, not your approval rights.
Use `away mode` for the current task and `I'm back` to return to normal interaction.
The main risk is mistaking an approval-dependent step for independent work; all prerequisites must be confirmed.

## Optional design review
### Abstract
A fresh reviewer can find assumptions that a design author leaves in chat.
The optional `design-review` skill reviews a saved design before implementation, while keeping the existing owner approval.
Its method draws on [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model); it does not install or depend on EGM.

Ask for a review directly: "Review the design at `<path>` with design-review."
An explicit request is review-only work. It does not start implementation.
For automatic review, copy the optional design-review section from `skills/dev-loop/assets/project-profile.md` into the project's `AGENTS.md`.
Set `Enabled` to `yes` and supply concrete `Applies when` criteria, such as new webhook handlers or public API changes.
Absent, disabled, or nonmatching settings preserve the normal route.
Missing or unclear enabled criteria produce a configuration notice, not an automatic review or a new question.

For a selected feature, dev-loop saves the proposed design and dispatches one fresh agent before requesting design approval.
The reviewer receives the design, project rules, and source references, without the author's conversation.
It checks assumptions, relevant failure cases, compatibility, and testable requirements.
The report records the design hash, source commit and hashes, reviewer identity, scope, findings, dispositions, and coverage limits.
Missing tools, failed reviewers, changed inputs, or missing source hashes produce an incomplete result, never a self-review substitute.
One focused recheck is available after material corrections. Remaining findings stop automatic review.
A new explicit review request remains separate review-only work.

Design review does not replace design approval, risky-plan review, tests, independent PR review, or merge permission.
A late review alone does not invalidate approval of an unchanged design.
Material design changes still require approval.
No external service, named persona, or nested agent capability is required.
Fresh delegation must be available in the host; instruction discovery alone does not prove reviewer isolation.

### Application checks and pilot evidence
Use Superpowers `writing-skills` for new or changed review instructions.
Run consuming-agent scenarios; text matches alone do not prove behavior.
1. Review a webhook design that permits retries but lacks duplicate protection. Require source-backed findings and a fresh reviewer.
2. Review a complete design that specifies atomic duplicate protection and failure tests. Do not invent findings for planned source replacement.
3. Apply absent, disabled, nonmatching, and unclear profile settings. Preserve normal approval and acceptance-record behavior.
4. Simulate unavailable delegation and a failed reviewer. Require an incomplete report without self-review or automatic retry.
5. Apply one focused recheck, remaining findings, and a new explicit request. Preserve the automatic limit and existing owner gates.
6. Change a referenced source while keeping the design and HEAD unchanged. Require incomplete coverage for the old snapshot.
7. Omit an examined source hash, including a clean file's hash. Require incomplete coverage rather than a clean verdict.

Record useful confirmed findings, rejected findings, elapsed review time, and host-provided usage for the first few qualifying reviews.
Write "unavailable" when measurements are not exposed; do not estimate credits or savings.
Keep automatic review opt-in until this evidence supports wider use.

### Conclusion
Use this review for defined changes that need stronger design checks, not as a default extra stage for every task.
The main risk is added cost without useful findings.
Keep EGM's full workflow and documentation-drift checks outside this integration.

## Optional Graphify support
[Graphify](https://github.com/Graphify-Labs/graphify) maps code relationships for cross-file discovery. It is not a dev-loop dependency.
Install and configure it separately in a project that needs it.

Copy the optional Graphify section from `skills/dev-loop/assets/project-profile.md` into the project's `AGENTS.md`.
Supply the graph location, a scoped query command, a reliable freshness check, and a permitted local refresh command.
The check must cover the current checkout, commit, and working-tree inputs, including added and deleted files.
Dev-loop does not supply that project-specific check. If it is unavailable, dev-loop uses source search.

Keep `graphify-out/` in each project checkout and exclude it from Git.
Do not place application graphs in this plugin repository.
The skill uses current graphs for discovery, confirms findings in source, and reports failures before using source search.
It does not install Graphify or authorize external processing.
For a local code-only refresh, Graphify documents `GRAPHIFY_BACKEND=none graphify extract . --code-only`.
This command alone does not establish freshness evidence; the project must supply that check.
Graphs do not replace flow docs, approval gates, or required tests.

## Reuse UI components
For UI tasks, dev-loop loads `skills/dev-loop/references/ui-reuse.md` before a mockup or implementation.
For UI projects, add the optional UI reuse section from `skills/dev-loop/assets/project-profile.md` to `AGENTS.md`.
Point to shared components, design tokens, current examples, and existing UI checks.
A design token is a named visual value, such as a semantic color or spacing size.
Keep the actual code and detailed references in the project, not in this plugin or the always-loaded profile.

For a planned change, the plan records a short reuse decision with source paths, the chosen variant, relevant states, and checks.
The agent confirms catalog entries against source and reuses suitable components before adding new ones.
Shared changes preserve existing consumers and update their examples or reference.
If references are missing, the agent inspects the affected UI and nearby screens.
It does not build a speculative library, install a catalog tool, or require a design system for a local change.
Non-UI tasks skip this reference and the UI profile pointers. Existing approval gates and verification requirements still apply.
Trivial UI text changes need no new plan or mockup.

## Change the plugin
1. Open a PR. Bump the version in `plugin.json` and in `.github/plugin/marketplace.json`. Add an entry to `CHANGELOG.md`.
2. Run `node scripts/check.mjs`.
3. After the merge, run `copilot plugin update dev-loop@dev-loop` on each computer. The weekly review does this at its start.

To resolve PR conflicts, merge the PR's current base into its working branch.
Preserve both sets of changes, then rerun the required checks and review before requesting merge approval.
Do not merge into the default branch locally, rebase, or force push.

## Independent PR review
Every substantive PR receives independent agent review before its first push.
This includes small fixes, tests, dependencies, configuration, rules, skills, and operational instructions.
Only harmless spelling or formatting edits are exempt. The PR records the exemption reason.
Self-review, passing tests, and GitHub Copilot review do not replace independent review.

The reviewer uses a separate context and checks the diff, acceptance record, and affected interactions.
The PR records the reviewer, reviewed commit or snapshot, scope, verdict, and findings disposition.
Existing complete coverage can count. Isolated task reviews do not establish integration coverage.
Later substantive changes receive focused review; harmless edits do not trigger duplicate review.
The evidence links reviewed content to the final substantive change without claiming an old review covered a new commit.

A failed reviewer receives one retry. If review remains unavailable, the agent can open the PR but reports it as not ready.
Independent review does not authorize a merge or replace tests and human checks.
Run `node --test scripts/independent-review.test.mjs` when these instructions change.
Skill application scenarios are also required; text checks alone do not prove agent behavior.
After merge, update the installed plugin and start a new session or reload its instructions.
This change does not add a blocking work-ledger guard.

## Device build handoff
After a passing device test, keep the tested build installed.
Restore test data and device settings through the project procedure, not by reinstalling an old baseline APK.
Device monitors must use that same procedure. Preserve the owner's keyboard selection and report it separately from the installed test app.

When a session handles an authorized merge of a device-tested app change, it refreshes the device from the latest fetched default branch.
The project profile supplies safe source-selection, build, install, launch, and exclusive-access procedures.
Before merge, the PR's "Device handoff" section records the final device-test state.
After merge, a PR comment and the owner-facing report record the refreshed source commit, artifact identity, installed version, and launch result.
The session does not edit the merged PR body.
An unavailable device, unsafe version change, missing procedure, or failed check blocks the refresh. It does not justify a downgrade or uninstall.
This procedure does not authorize merges, releases, or deployments. It does not start a background merge watcher.

Run `node --test scripts/device-handoff.test.mjs` after changes to these instructions.
Use skill application scenarios as well: text checks do not prove agent behavior.
After a plugin update, start a new session or explicitly reload the instructions in an existing session.
Updating repository instructions alone does not update an installed plugin or replace a monitor's retained context.

## Known limits
- Copilot loads a plugin rule only from a `.mdc` file in `com.github.copilot/rules/`, with `description` and `alwaysApply: true` in its frontmatter. It ignores `.md` files there. (Tested on Copilot CLI 1.0.94 and 1.0.97.)
- A repo setting turns on an installed plugin, only in a trusted folder. In our test, it did not install a missing plugin. So each computer needs the install.
- The CLI keeps its list of installed plugins (`installedPlugins`) in `~/.copilot/config.json`. Do not overwrite that file. Change only one key, or use the CLI.
- This repo is private. The Copilot cloud agent may not be able to read it.

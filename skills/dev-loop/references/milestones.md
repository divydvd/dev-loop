# Mergeable milestones

## Abstract
A large assignment can deliver useful results before all its work is complete.
A milestone is an outcome that is safe and complete for its declared scope.
Plan these outcomes before choosing PR dependencies, and preserve each PR's normal delivery checks.

## Select useful boundaries
Read this reference for large work, estimates above about 400 production lines, or an existing multi-milestone assignment.
Keep small tasks in one proportionate PR; they need no milestone table or extra session.
Use observable behavior, risk, and time to a verifiable result to select boundaries.
Do not impose a fixed count or promise a deadline.

Each milestone must be independently useful and safe at its intended integration base.
It must not need a later PR to repair a known defect or restore required behavior.
Reject incompatible schema slices while supported clients still need the old contract.
Record coupling and safe delivery order instead of calling an unsafe slice independent.
Do not add a flag only to disguise unfinished behavior.
Use compatibility techniques only when the approved feature requires them.

Prefer independent PRs against the intended integration base when source and contract evidence establish independence.
Use a dependent stack only for real dependencies, such as a consumer that requires a new API.
Record the evidence for each prerequisite; missing dependency information does not establish independence.
Keep each PR to one concern and about 400 production lines or fewer.
Tests, docs, and generated files do not count. Estimate each PR before implementation and reassess its final diff.
If a complete outcome remains too large, plan safe prerequisite concerns without falsely declaring them useful standalone outcomes.
Preserve any required integrated final check.

## Save the contract
Use the optional milestone fields in `assets/acceptance-record.md` and `assets/pr-body.md`.
Keep them with the existing spec, plan, test matrix, and execution ledger; add no tracking service.
Each milestone records:
- Stable ID and observable result.
- Required acceptance checks, case IDs, and evidence locations.
- Real prerequisites and source or contract evidence for each dependency.
- Proposed branch, PR base, and the reason for independence or a dependent base.
- Remaining unavailable behavior and compatibility limits after merge.
- Status, tested and reviewed source identities, PR link when available, and next permitted action.

Keep the overall assignment status separate from each milestone status.
On resume, read these saved records and live source state before selecting work.
Do not repeat verified work or relabel old results with a new source identity.

## Finish each milestone
Complete implementation, tests, docs, and independent review before the milestone's first publication.
Use the existing final-head verification, PR template, CI checks, automatic review, and review-round limits for that PR.
Do not push incomplete work repeatedly to show activity.
One ready milestone does not complete the whole assignment.
Keep required shared-consumer and integration checks in scope; untested required interactions block that milestone's readiness.
An independent milestone may be ready while a separate assignment-level final integration check remains pending.
Record that check and its actual dependencies; do not move a milestone requirement to the assignment to evade it.

The owner must give typed merge approval for each PR's current head.
Design approval, plan approval, passing checks, review, and absence do not authorize a merge.
Never enable automatic merge or cascading stack merges under this reference.
Keep core merge rules and live guards unchanged.
After a base merges, inspect live base/head identities, ancestry, and the remaining diff.
Use permitted merge-based maintenance and rerun affected checks and review, including required final-head tiers.
Do not rebase or force push. If stack tooling requires forbidden history changes, save the blocker instead.
A lower PR's approval does not approve an upper PR or changed head.

## Select the next eligible work
A local blocker affects its milestone and actual dependents, not every independent milestone.
Continue another milestone only when all these conditions hold:
1. Its scope belongs to this assignment and has the required design and risky-plan approvals.
2. Its actual prerequisites are complete, with evidence of independence from the blocked step.
3. Permissions, required checks, data safety, and shared resources permit the work.
4. No global safety stop or three-failed-fix stop applies.

For example, unavailable exclusive device access blocks its required scenario and dependent readiness.
It does not block an approved independent parser change with available resources.
Keep the device case blocked and required. Do not invent a pass or ask for access already denied.
The same selection permits independent work while another PR waits for owner merge approval.
Do not poll for that approval or request another push merely to remain active.
Keep the two-fix reassessment, three-fix stop, review limits, and one-heavy-build resource rule.
During confirmed active absence mode, also apply `references/absence-mode.md` and its saved decision fields.
This reference does not activate absence mode, create approval authority, or bypass a session-wide stop.
When no eligible work remains, save the handoff and stop.

## Report meaningful transitions
Use these factual states; skip a state honestly when evidence does not establish it.

| State | Evidence |
| --- | --- |
| planned | Saved result, boundaries, dependencies, checks, and proposed base |
| in progress | Approved work has started; acceptance remains incomplete |
| verified | Required milestone checks passed at the recorded source identity |
| reviewed | Independent review covers the recorded source and interactions; this alone does not prove CI passed |
| ready for approval | The existing PR Done gate passes; merge approval may still be absent |
| merged | Live forge state confirms the authorized merge and identity |
| blocked | Named prerequisite, required gap, or approval prevents the next step |

Report a useful state change, not each implementation step or a progress percentage.
Use this compact shape alongside the existing readiness-first report:
```
Overall assignment: <incomplete | complete | blocked; remaining behavior and required gaps>.
Milestone <ID>: <state>; <observable result>; PR <link, or not published>.
Evidence: <checks and source>; independent review <coverage and identity>.
Required gap: <status, cause, actual dependents, or none>.
Next action: <eligible work, owner decision, or saved handoff and stop>.
```
Ready is not merged. Reviewed is not verified. A merged milestone does not erase assignment-level gaps.

## Conclusion
Deliver complete, useful scopes through the existing PR process.
Continue only approved independent work while another scope waits.
Keep merge permission, required evidence, and remaining assignment work explicit.

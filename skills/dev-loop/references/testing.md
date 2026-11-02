# Risk-based testing

## Abstract
A passing command does not prove that every requirement works.
Save a proportional test matrix before implementation for each substantive change.
Use it to select cases, review missing coverage, and report actual evidence.

## Plan the cases
A test matrix links requirements and risks to checks and their results.
Keep it with the task's plan and execution ledger.
Use `assets/test-matrix.md`; small changes use the compact table in the acceptance record.
For complex or high-risk changes, use detailed cases linked from that record.
Choose detail by impact and behavior, not by line count. A one-line permission edit can be high risk.
This adds no new owner approval gate. Preserve the existing design and risky-plan approvals.
Questions and harmless spelling or formatting changes remain exempt.

1. Read the acceptance conditions, relevant source, existing tests, and affected consumers.
2. Map each acceptance condition and important identified risk to a case or an explicit coverage gap.
3. Mark acceptance checks, project-tier checks, and important safety checks as required.
4. Record useful additional checks as optional, with a reason and the remaining risk.
5. Reuse existing tests that prove the expected result. Add or extend tests only for missing coverage.
6. Save the matrix before implementation. A list of commands alone is not a test plan.

Each case records an ID, requirement or risk, required/optional decision, setup/input, expected result, method, and test location.
Record status, evidence, and tested identity separately from planned work.
The method can be an existing automated test, integration check, device scenario, or reproducible manual check.
Use the project's tools and commands. Do not install a tool or create a test service by default.
Assert observable results, including error behavior and preserved behavior, not only mocked calls or successful exit codes.
Keep TDD: reproduce the fault or missing behavior before the implementation, then check the fix and regressions.

## Permanent project regression inventory
The permanent inventory protects important existing flows across tasks.
It belongs in the project repository, under version control. The task matrix records the current selection and run evidence.
Read the profile's `Regression matrix` path and existing project testing docs before creating another record.
Reuse an existing inventory even when it has a different name.
When establishing a baseline without an existing location, use `docs/testing/regression-matrix.md` and `assets/regression-matrix.md`.
Keep commands and project triggers in the project profile; keep flow definitions and real test references in the inventory.

Each entry needs a stable case ID, flow and expected result, source/consumers, level/triggers, test/procedure, and environment/safe data.
Use existing automated tests or reproducible manual steps. Identify missing automation or behavior coverage explicitly.
Do not store secrets, private account data, or permanent passed results.
Link selected permanent IDs into the task matrix instead of copying a second complete inventory.

### Select existing flows
1. Select the configured core checks for each substantive code PR.
2. Add affected-area checks from changed behavior, source, tests, and consumers.
3. Select broad checks when the profile's concrete triggers apply or source investigation finds cross-cutting risk.
4. Include applicable core and affected cases in broad selection. Do not replace existing project test tiers.
5. Record selected case IDs, levels, trigger evidence, and exclusions in the task record before implementation.

Select by impact, not a line-count threshold. A tiny shared permission change can affect several main flows.
Core checks should stay fast. Broad selection does not mean every expensive test after every edit.
One real command may cover multiple IDs; map its actual assertions and results to each selected case.
Do not repeat an identical run merely to fill rows. Preserve every required check and its final tested identity.
Questions and harmless spelling or formatting edits keep their existing routes and exemptions.

### Maintain and inspect the inventory
Add a new important flow and its real test or procedure in the same PR as the feature.
Retain useful bug regression cases. Update an existing entry when it already covers that behavior.
If references remain accurate, record why no inventory edit is needed; do not require artificial document changes.
Update affected flow references, consumers, triggers, fixtures, and test locations when behavior changes.
Retire a case only when requirements or source establish that the flow no longer applies.
Keep the retired ID, reference, and reason. Do not reuse an ID for another meaning.
Do not retire or weaken a case because it fails, is blocked, or delays delivery.
Review inventory changes with the code and tests, not as a later documentation task.

A missing inventory is an explicit inventory gap, not proof that the project has no tests.
For missing setup, inspect source, tests, and consumers; keep project tiers and risk-based task selection.
Do not invent a suite or expand the assignment into a project-wide baseline without approved scope.
Report the missing path or configuration and the limits of existing-flow coverage.
For stale or missing test references, find and verify a replacement or record the affected coverage gap.
An old passing entry cannot establish current coverage. Required failed, blocked, unrun, or uncovered cases keep their normal readiness effect.
Establishing a project's initial baseline is a project adoption task; this generic template does not supply its actual flows.

## Assess relevant categories
Assess categories separately from case execution. Combine related categories when they share a reason.
Give exclusions a reason; an excluded category is not a passed case.

| Category | Questions for case selection |
| --- | --- |
| boundaries and invalid input | What happens at limits, adjacent values, empty values, and malformed input? |
| permissions and state changes | Who may act? What happens after revocation, navigation, restart, or a state transition? |
| concurrency and retries | Can repeated or overlapping requests duplicate, lose, or reorder work? |
| partial failure and recovery | What remains after an interrupted operation? Can recovery preserve data and correctness? |
| existing consumers | Which callers, exports, jobs, or shared components can bypass or break the new behavior? |
| UI, accessibility, and device | Which screens, input methods, assistive paths, and supported devices can change? |
| migration and compatibility | Do old data, saved state, and supported versions still work? |
| performance | Does a requirement or concrete risk need a measured workload or limit? |

Use property tests, fuzzing, mutation tests, or other advanced methods only for concrete risks with suitable existing tools.
Do not add universal coverage thresholds or promise exhaustive coverage.
Missing information is a coverage gap, not an exclusion justified by convenience.

## Build and reassess
Update affected cases and evidence when requirements, source, setup, or consumers change.
Add newly found risks and missing cases. Preserve the original required/optional decision and its reason.
Do not change a required case to optional because it fails, cannot run, or delays delivery.
Identify which old results no longer establish the expected behavior.
Keep their original tested identity; do not relabel an old result as a new-commit run.
Rerun affected checks and every check required by the project's test tiers.
Do not rerun unrelated expensive checks unless the project tier requires them.
When an unchanged check remains useful, label it historical evidence and explain its relevance.
Historical evidence does not replace required final-head checks.

## Review coverage
Extend the existing independent review; add no separate reviewer for each small task.
Give the reviewer requirements, the matrix, source, relevant consumers, and the reviewed identity.
Ask the reviewer to find missing cases from source and interactions, not only inspect table completeness.
Check acceptance links, important risks, expected results, exclusions, required/optional decisions, and execution evidence.
Review omitted existing flows, permanent case selection, inventory changes, and real test references against source and consumers.
Keep the existing independent review requirements and later-change coverage.
Review is not a test run. A complete matrix is not execution evidence.

## Verify and report
Use these case statuses:

| Status | Meaning |
| --- | --- |
| passed | The check ran and matched its expected result. Link the actual evidence. |
| failed | The check ran and did not match its expected result. Record the observed result. |
| blocked | A missing prerequisite prevents execution. Name it and affected dependents. |
| not run | The planned check has no execution result. Explain why. |
| not applicable | The case does not apply; record the reason, not a pass. |

For each result, record the command or reproducible scenario, actual result, evidence location, and tested identity.
The identity includes the commit or exact source snapshot and relevant environment, device, build, or artifact.
Use portable repository paths or published evidence links in the PR, not machine-specific session paths.
Map the final acceptance conditions to case IDs and report unresolved risks.
Separate required blockers from optional limits. State optional limits and their reasons without inventing requirements.
A required case that is failed, blocked, or not run prevents readiness.
A required coverage gap means not ready, even when every executed command passes.
Do not mark a required case not applicable unless source or requirements establish that it truly does not apply.
A justified not applicable result is not a pass and does not block readiness.
Record its source or requirements reference and reason. All applicable required cases must pass.
During active absence mode, defer blocked checks and their actual dependents under `references/absence-mode.md`.
Continue only eligible independent work. Absence does not waive required evidence or authorize protected actions.

## Conclusion
Use the saved cases to connect acceptance, review, and final evidence.
Report required gaps before a ready claim.
The matrix guides agents; it does not enforce behavior at runtime.

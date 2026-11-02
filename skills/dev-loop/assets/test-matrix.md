# Test matrix

## Scope and identity
- Plan / acceptance record: <portable path or link>
- Requirements and source assessed: <commit or exact snapshot; relevant consumers>
- Detail: <compact | detailed; reason based on impact and behavior>
- Required checks: <acceptance conditions, important safety risks, and project tiers>
- Regression selection: <project inventory path; selected permanent case IDs, levels, and trigger evidence; exclusions and setup gaps>
  Link permanent IDs to cases below. Keep run results here, not as permanent inventory passes.

## Category assessment
Keep relevance separate from case execution. Group categories with the same reason.

| Category | Relevant? | Case IDs / coverage gap | Exclusion reason |
| --- | --- | --- | --- |
| <boundaries, invalid input, permissions, state, concurrency, retries, failure, recovery, consumers, UI, accessibility, device, migration, performance> | <yes / no> | <IDs or gap> | <reason if excluded> |

## Compact cases
Each acceptance condition and important risk needs a case or explicit gap.
Reuse existing tests. Group inputs only when each expected result remains clear.

| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | <acceptance ID or risk> | <yes; or optional with reason> | <state and values> | <observable result> | <automated / manual / device> | <existing or planned path/scenario> | not run | <actual command/result/link, or none> | <actual commit/snapshot and relevant environment, or none> |

## Detailed cases (complex or high-risk work)
Use the same fields as the compact table. Expand each case where a row cannot explain the setup or expected behavior.
- **Case / Requirement / risk / Required?:** <ID, acceptance link, risk, and decision with reason>
- **Setup / input:** <state, data, actors, prerequisites, and sequence>
- **Expected result:** <observable success, rejection, preserved state, and recovery as relevant>
- **Method / Test location:** <existing test or planned check and reproducible procedure>
- **Status / Evidence / Tested identity:** <actual result and identity; keep planned work distinct>

## Coverage and remaining work
- Acceptance mapping: <each condition -> case IDs or explicit gap>
- Required blockers: <failed, blocked, not run, or missing coverage; reason and actual dependents, or none>
- Optional limits: <unexecuted optional checks, reasons, and remaining risks, or none>
- Reassessment: <changed requirements/source/setup/consumers; affected cases and reruns>
- Historical evidence: <original identities and relevance; never claim an old result ran at a new commit>

Statuses: `passed`, `failed`, `blocked`, `not run`, `not applicable` with a reason.
A matrix or category exclusion is not execution evidence. Required gaps prevent readiness.

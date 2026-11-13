## Acceptance record
- **Goal:** <one sentence: what changes for the user>
- **Done when:**
  - [ ] <an observable check that a test or a device scenario can prove>
  - [ ] <another check>
- **Required evidence:** <the test tier commands; the device scenario, or "no device test" and why>
- **Test matrix:** Save before implementation under `references/testing.md`.
  Use the compact table below for a small substantive change; link `assets/test-matrix.md` detailed cases for complex or high-risk work.
  Map every acceptance condition and important risk to case IDs or an explicit gap.
  Assess relevant edge categories; give exclusions a reason. Keep this record with the plan and ledger.
- **Regression selection:** <permanent inventory path; selected case IDs and levels; trigger evidence and exclusions; inventory updates or reason unchanged; missing setup/coverage gaps>
- **Size estimate:** <production lines per task, per PR, and total; exclude tests, docs, and generated files. Above 400: assess safe milestones and bases under `references/milestones.md`>
- **Milestone selection:** <for large work: useful boundaries, dependency evidence, and why each PR is safe; for small work: one proportionate PR>
- **Out of scope:** <what this task does not change>
- **Risky area:** <none | the area from the profile> (a risky area needs the owner's plan review)
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content, or a harmless-edit exemption has a recorded reason. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains. A case marked not applicable needs a source or requirements reference and a recorded reason; it is not a pass.
  - Blocked: 3 failed fixes, missing access, no device, or a product decision. Normally, stop and report with the evidence. For an approved multi-milestone assignment, use `references/milestones.md`: defer the blocked milestone and its actual dependents, then continue only eligible independent work. During confirmed active absence mode, also apply the absence reference. Stop when no eligible work remains. Global safety stops and three failed fixes still require a stop.

### Milestone record (optional for multi-milestone assignments)
<Use only for an assignment with multiple milestones under `references/milestones.md`. Keep small tasks small.>

| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <stable ID> | <useful safe outcome> | <required case IDs and evidence links> | <real prerequisites and source/contract proof; or none with evidence> | <proposed branch, base, and reason> | <unavailable behavior after merge> | planned | none | <not published; next permitted action> |

- Overall assignment: <status, remaining scope, and required final integration checks; separate from milestone status>

### Compact test matrix
<For substantive changes only. Use detailed cases instead when risk or complexity requires them.>

| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | <acceptance condition or risk> | <yes; or optional with reason> | <state and values> | <observable result> | <check type> | <existing or planned test/scenario> | not run | <actual result/link, or none> | <actual commit/snapshot and relevant environment, or none> |

- Category assessment: <relevant categories -> case IDs; exclusions with reasons>
- Required blockers: <failed, blocked, not run, or missing coverage; actual dependents, or none>
- Optional limits: <reason and remaining risk, or none>
- Reassessment: <affected cases after changes; preserve original evidence identities>

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
- **Size estimate:** <changed lines of production code for each task, and the total; tests, docs, and generated files do not count. More than 400: the stack of PRs>
- **Out of scope:** <what this task does not change>
- **Risky area:** <none | the area from the profile> (a risky area needs the owner's plan review)
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped. Independent review coverage accounts for the final substantive content, or a harmless-edit exemption has a recorded reason. No confirmed Critical or Important finding remains unresolved. All applicable required cases pass and no required coverage gap remains. A case marked not applicable needs a source or requirements reference and a recorded reason; it is not a pass.
  - Blocked: 3 failed fixes, missing access, no device, or a product decision. Normally, stop and report with the evidence. During confirmed active absence mode, defer affected steps and their dependents under the absence reference, then continue only eligible independent work. Stop when none remains. Three failed fixes still require a stop.

### Compact test matrix
<For substantive changes only. Use detailed cases instead when risk or complexity requires them.>

| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | <acceptance condition or risk> | <yes; or optional with reason> | <state and values> | <observable result> | <check type> | <existing or planned test/scenario> | not run | <actual result/link, or none> | <actual commit/snapshot and relevant environment, or none> |

- Category assessment: <relevant categories -> case IDs; exclusions with reasons>
- Required blockers: <failed, blocked, not run, or missing coverage; actual dependents, or none>
- Optional limits: <reason and remaining risk, or none>
- Reassessment: <affected cases after changes; preserve original evidence identities>

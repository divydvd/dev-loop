# Project regression matrix

## Abstract
This inventory defines important existing flows and the checks that protect them.
Keep it in the project repository and update affected entries with their tests.
Keep execution results in task evidence, not in this permanent inventory.

## Selection
- Profile: <project profile path; commands, area mapping, and concrete broad triggers>
- Core: <fast essential checks for substantive code PRs>
- Affected: <additional cases selected from changed behavior, source, and consumers>
- Broad: <main flows selected by cross-cutting changes and the profile's broad triggers>

Levels are additive: broad selection includes applicable core and affected cases.
Existing project tiers still apply. One real command can cover several case IDs.

## Active cases
Use stable case IDs. Reuse an existing entry when it already protects the same behavior.
Link real tests or reproducible manual procedures. Name missing coverage; do not invent test files.

| Case ID | Flow / expected result | Source / consumers | Level / triggers | Test / procedure | Environment / safe data |
| --- | --- | --- | --- | --- | --- |
| R1 | <important flow and observable result> | <flow doc, source, and affected consumers> | <core / affected / broad; concrete trigger> | <existing test and command, manual steps, or explicit coverage gap> | <fixtures, device/account prerequisites, and safe test-data procedure; no secrets> |

Store no permanent passed status here. A listed test is not evidence that it ran.
In each task, link selected IDs to actual results and commit/build/environment identity.

## Maintenance
Add new important flows and useful bug regressions in the same PR as their real tests.
Update affected entries; unchanged accurate references need no artificial edit.
Keep the inventory small enough to use. It is not a list of every assertion.
Retire a case only when requirements or source establish that its behavior no longer applies.
Do not reuse an ID for a different meaning. Keep the retirement trace below.

## Retired cases
| Case ID | Removed behavior | Requirements / source reference | Reason |
| --- | --- | --- | --- |
| <ID, or none> | <old behavior> | <approved requirement or source reference> | <why the case no longer applies> |

## Conclusion
Use this inventory to select checks, not to claim a permanent pass.
Required failures and coverage gaps follow the project's normal readiness rules.

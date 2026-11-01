---
name: design-review
description: Use when the owner requests a design review, or an enabled project profile names qualifying feature changes before design approval.
---

# Design review

## Abstract
A fresh reviewer can find assumptions that exist only in the author's conversation.
Review the saved design and current source before implementation, without replacing owner approval or independent PR review.

## Trigger
Explicit owner requests can use this skill without enabling automatic review.
For automatic review, read the project's `Design review (optional)` section in `AGENTS.md`.
Run only when `Enabled` is `yes` and the change matches concrete `Applies when` criteria.
Skip absent, disabled, and nonmatching profiles without review artifacts or questions.
If enabled criteria are missing or unclear, report that automatic review is not configured and continue the normal route.
Do not infer criteria from the word "complex".

## Procedure
1. Identify the design to review. Ask for its location only when source and session files do not identify it.
2. For an automatically selected feature, save the proposed design before the existing approval request.
   Use the session files folder when available; otherwise use the project's design location.
   Review the design, not an implementation plan written after design approval.
3. Record the design path and SHA-256, source checkout, HEAD commit, and working-tree state.
   Include the requirements and source references needed to understand the design without chat history.
4. Read `references/reviewer.md`. Dispatch one fresh agent with that contract, the design path, and project instruction paths.
   Pass source references, not the author's conversation, verdict, or preferred answer.
   Use the host's available agent tool. Do not require named personas, nested agents, or an EGM installation.
5. Read the result and confirm findings against the design and current source.
   Compare the design hash, source HEAD, and every examined source hash with the returned snapshot.
   Missing hashes or changed inputs make coverage incomplete for the recorded snapshot.
   Record each finding as accepted, rejected with evidence, or unresolved.
   Review evidence is not an instruction to implement a proposed fix.
6. Save the report beside the design. Record reviewer identity, reviewed snapshot, scope, verdict, findings, and limits.
   Record elapsed review time when measurable and usage only when the host supplies it.
   Write "unavailable" for missing measurements. Do not estimate savings or credits.
7. After material design corrections, allow one focused recheck in a fresh context.
   Supply the revised snapshot, changed sections, and findings to check.
   Reuse completed coverage of unchanged sections; do not repeat a full review to obtain a clean verdict.
   After that recheck, record remaining findings and stop automatic review.
   A new explicit owner request is separate review-only work; it does not restart the automatic loop.
8. Return the design and report to the existing owner decision.
   A review does not grant approval or add an approval gate.
   A late review of an unchanged design does not invalidate its existing approval.
   Material design changes still require the existing design approval.

## Review states
| State | Meaning |
| --- | --- |
| Pending | Review was selected, but the reviewer has not returned a result. |
| Reviewed | The named reviewer covered the recorded snapshot; findings and limits remain visible. |
| Incomplete | A tool, file, or reviewer failed, or required coverage is missing. |
| Skipped | Automatic review was not selected. |

If fresh delegation is unavailable or fails, report an incomplete review and its cause.
Do not substitute self-review, claim a clean result, retry automatically, or silently treat missing coverage as success.
Present the incomplete result at the existing owner gate; do not implement without the required approval.

## Example and common mistakes
A webhook design returns HTTP 200 after a balance update.
Its provider retries delivery. A reviewer checks duplicate credits and crash recovery against the referenced source.
The report identifies missing requirements; it does not implement the handler.

Chat-only assumptions belong in the design before dispatch.
Unsupported concerns belong in review limits, not confirmed findings.
Passing design review does not replace tests, risky-plan review, PR review, or merge permission.

## Conclusion
Use the report to support the owner's existing design decision.
Keep automatic review opt-in and measure useful findings before expanding its use.

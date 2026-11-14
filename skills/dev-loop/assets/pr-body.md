## What and why
<2–4 sentences. Link the issue or the owner's request.>

## Acceptance record
<Copy it from the plan. For a trivial change, write "none: trivial change". Check each "done when" item that has evidence.>

### Milestone scope (optional)
<Use for a PR in a multi-milestone assignment. Otherwise write "not applicable: one focused PR".>
- Milestone ID: <stable plan ID>
- Delivered scope: <complete useful result and compatibility limits>
- Remaining scope: <unavailable behavior and assignment-level required gaps; not hidden by this PR's readiness>
- Dependencies: <real prerequisites, evidence, branch/base reason; or independence evidence>

## Evidence
| Check | Command or scenario | Result | Commit |
| --- | --- | --- | --- |
| Unit tests | `<command>` | <N passed> | `<sha7>` |
| Device test | <scenario, or "not needed: reason"> | <pass or fail, and a note> | `<sha7>` |

## Test coverage
<Link or include the saved matrix. Use portable paths or evidence links, not machine-specific session paths.
For a harmless spelling or formatting change, write "not applicable: harmless edit".>
- Acceptance mapping: <each acceptance condition -> case IDs and actual evidence; include important risks>
- Regression selection: <inventory path; selected permanent case IDs and levels -> current evidence; triggers/exclusions; inventory updates or reason unchanged; missing setup/coverage gaps>
- Category assessment: <relevant case IDs and exclusions with reasons>
- Required blockers: <failed, blocked, not run, or required coverage gaps; actual dependents, or none>
- Optional limits: <unexecuted optional checks, reasons, and remaining risks, or none>
- Reassessment: <affected cases after changes; retain original tested identities for historical evidence>

## Device handoff
| Item | Final verified state |
| --- | --- |
| Installed test build | <package or app, version, source SHA, artifact identity; or "not needed: reason"> |
| Selected keyboard or app | <selected package or app; distinguish it from the test build, or "not needed"> |
| Post-merge refresh | <not merged; completed with fetched source SHA and launch result; blocked with reason and last verified build; or not needed with reason> |

After merge, post the refresh result as a PR comment and in the owner-facing report. Leave this pre-merge evidence intact.

## Screenshots
<For a UI change: one cell for each validated screen, with 4 cells in each row. Use this HTML table, because Markdown images in a table show at full size. Name each screenshot that you did not upload, and the reason (including when the `github-pr-media` upload skill is unavailable on your coding host; if no screenshot was uploaded, delete the empty table and list each validated screen and reason). For other changes, or when the device test validated no screen, delete the table. Then write "none: <reason>".>
<table>
<tr>
<td align="center" valign="top"><img src="<URL from github-pr-media>" width="180" alt="<scenario>: <what the screen shows>"><br><sub><b><scenario></b> <caption></sub></td>
</tr>
</table>

## Flow docs
- `docs/flows/<flow>.md`: <what changed> (or "none: <reason>")

## Review
### Design review (optional)
<Write "none: not selected" when unused. Otherwise, link the design and report.
Record the trigger, design snapshot, reviewer, source evidence, findings disposition, recheck scope, and coverage limits.
Record elapsed review time and host-provided usage, or "unavailable". This does not replace the independent PR review below.>

### Independent agent review
| Item | Evidence |
| --- | --- |
| Reviewer | <agent identity; not the implementer or GitHub Copilot reviewer> |
| Reviewed commit | <SHA or exact working-tree snapshot and its committed content> |
| Scope | <complete PR diff and interactions; or existing coverage plus focused review> |
| Verdict | <findings addressed, unresolved findings, or unavailable; not a test result> |
| Changes after review | <changes and their focused review evidence; harmless edits; or none> |
| Exemption | <none; or harmless spelling/formatting edits and why they cannot affect behavior, safety, or validation> |

### GitHub Copilot review
<Head commit, result, and any availability limitation (for example "none configured on repository: no copilot-pull-request-reviewer check-run within 2 minutes"). Check the repository's automatic review on GitHub regardless of your local coding host. This does not replace independent agent review.>

- Fixed findings: <list, or "none">
- Findings that are not fixed: <each with the reason, or "none">
- Not reviewed: <each task or branch whose review subagent failed 2 times, or "none">

If independent review remains unavailable, report "open, not ready". Never treat "none" in the findings list as proof of review.

## Risks, and what the owner must check
- <a risk, or a check that only a person can do>

## Absence handoff (when used)
<Otherwise write "none: not activated". Link this task's saved absence record; do not include secrets or private account data.
Record activation and current mode, approved scope, agent decisions pending owner review, reasons, evidence, affected files, risks, and reversal steps.
List blocked steps, their actual dependents, exact approvals needed, and any required check that remains incomplete.
The owner returning does not approve these decisions or clear blockers. An open PR may still be not ready.>

## Test tool feedback
<For a device test or another test tool run: each gap of the test tool, each step that needed a workaround (for example raw adb instead of the test tool) and why, and each unreliable step. Start each line with one label: `gap`, `workaround`, or `unreliable`. If the run had none of these, write "none: no finding". If no test tool ran, write "none: <reason>".>
- <gap | workaround | unreliable>: <tool>: <what, and why> (<scenario>)

## Dev-loop feedback
- Slowed me: <what, or "none">
- Missing or wrong rule: <which, or "none">
- Change in the setup: <what, or "none">

## What and why
<2–4 sentences. Link the issue or the owner's request.>

## Acceptance record
<Copy it from the plan. For a trivial change, write "none: trivial change". Check each "done when" item that has evidence.>

## Evidence
| Check | Command or scenario | Result | Commit |
| --- | --- | --- | --- |
| Unit tests | `<command>` | <N passed> | `<sha7>` |
| Device test | <scenario, or "not needed: reason"> | <pass or fail, and a note> | `<sha7>` |

## Flow docs
- `docs/flows/<flow>.md`: <what changed> (or "none: <reason>")

## Review
- Fixed findings: <list, or "none">
- Findings that are not fixed: <each with the reason, or "none">
- Not reviewed: <each task or branch whose review subagent failed 2 times, or "none">

## Risks, and what the owner must check
- <a risk, or a check that only a person can do>

## Dev-loop feedback
- Slowed me: <what, or "none">
- Missing or wrong rule: <which, or "none">
- Change in the setup: <what, or "none">

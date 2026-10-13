# <Flow name>

Last verified: <YYYY-MM-DD> at `<sha7>`.

## Purpose
<What the user sees, and why the flow exists. 2–3 sentences.>

## Entry points
- <a user action or a system event> → `<file>` `<function>`

## Sequence
1. <step> (`<file>`)
2. <step> (`<file>`)

## Key files
| File | Role |
| --- | --- |
| `<path>` | <what it does in this flow> |

## Invariants
- <a fact that must stay true> Why: <reason>.

## Tests
- Unit: `<test class or command>`
- Device: <scenario>

## Pitfalls
- **<symptom>.** Cause: <cause>. Rule: <what to do>. (Found in #<PR>)

## Related flows
- [<flow>](<flow>.md)

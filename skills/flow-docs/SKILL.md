---
name: flow-docs
description: Use before you change an important app flow, when a change touches a flow, or when a new important flow appears. Reads, updates, and creates the flow docs in docs/flows/, so the next agent gets the full context of a flow from files.
---

# Flow docs

A flow doc explains one important flow from start to end: what the user sees, the sequence, the key files, the invariants, the tests, and the pitfalls. The flow docs tell how the code works now. Old specs and plans are history.

The docs live in `docs/flows/<flow>.md`. The index is `docs/flows/INDEX.md`.

## Before you change a flow
1. Find the flow in `docs/flows/INDEX.md`. Read its doc.
2. Read the "Last verified" line. Run `git log --oneline <sha>..HEAD -- <key files>`.
3. If the key files changed after that commit, compare the doc with the code before you trust it. Fix the doc in your PR.

## Update a flow doc (in the same PR as the code)
- Update each section that your change makes wrong: the sequence, the key files, the invariants, and the tests.
- Add each new pitfall: `**<symptom>.** Cause: <cause>. Rule: <what to do>. (Found in #<PR>)`.
- Add each new invariant: a fact that must stay true, and why.
- Set "Last verified" to today and the short SHA of your last code commit. Update it again if you change the flow code after that.
- Write in short sentences. Name files and functions. Do not copy code. Link to the code instead.

## Write a new flow doc
Write one when a flow meets 2 or more of these conditions:
- The user can see it, and it crosses 3 or more files or 2 or more components.
- It has invariants that the code does not make clear.
- It caused a bug before, or a review found a fault in it.

Use `assets/flow-doc.md`. Add a row to the index (`assets/flow-index.md` shows the format). Keep each doc on one flow. Link the related flows. Split a doc that grows to more than about 250 lines.

## Do not
- Do not put flow details in `AGENTS.md`. Put only the index link there.
- Do not leave a doc that contradicts the code. Fix the doc, or write "Unverified: <what>" in the section.

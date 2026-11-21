# PR-relative timing: M1 acceptance and execution record

## Acceptance record
- **Goal:** Add PR-relative timing and recognize common Python checks without changing existing lifetime metrics.
- **Owner approval:** The owner approved the saved speed design and plan on 2026-11-21.
- **Base:** `1566625a7c4cc2d51e15874e816fb2dc00128941`.
- **Done when:** Unique-session PRs have before-PR, PR-open, and after-merge summaries; missing data is explicit; Python checks enter the build/test bucket.
- **Required evidence:** Collector and benchmark regressions, `node scripts/check.mjs`, all current CI suites, temporary-home discovery, and independent full-diff review.
- **Size estimate:** About 240 production lines; tests and docs excluded.
- **Execution:** Native, three tasks, one independent PR review.
- **Risky area:** None. Core rules, approval points, finish rules, and live guards remain unchanged.
- **Out of scope:** Benchmark settings, live experiments, Android profiling, test removal, device access, and speed-gain claims.
- **Stop:** Do not merge. M2 remains a separate milestone under the approved plan.

## Abstract
The collector reports lifetime sessions and misses some Python checks.
Add clearly labeled PR-relative phases from the same observed intervals.
Keep existing fields and quality rules intact.

## Design contract
Recognize `python` and `python3` module invocations of `unittest`, `pytest`, and `build`.
Do not classify quoted echo text or arbitrary Python scripts as test execution.

Add `summarizeTimingWindow(intervals, { fromMs, toMs })`.
An interval is `[startMs, endMs]`.
The input holds five bucket arrays, owner-wait intervals, and logical tool-work intervals.
Clip complete intervals to finite ordered bounds.
Merge active intervals to avoid counting parallel calls twice.
Keep logical tool-work durations for the parallelism numerator.
An empty active phase has null active/bucket values and an explicit status.
Do not invent endpoints for unfinished calls.

Add `phaseTiming` with basis `session_start_and_pr_timestamps`.
Its phases are `beforePr`, `prOpen`, and `afterMerge`.
Use observed session endpoints, PR creation, and PR merge.
Call the first phase “Session before PR creation,” not “Implementation.”
Session reuse can include unrelated earlier work.
Shared and unmatched PR phases remain unavailable.
Route summaries report valid sample counts and independent medians.
Keep legacy lifetime metrics and the existing weekly table unchanged.

## Test matrix
| ID | Requirement | Expected result | Location | Status |
| --- | --- | --- | --- | --- |
| P1 | Python module checks | A 2-second unittest command counts as build/test | `scripts/collect-metrics.test.mjs` | red then green |
| P2 | Literal command text | Echoing the command stays other I/O | Same | green with P1 |
| P3 | Boundary clipping | A 10-second interval splits into 4 and 6 seconds | Same | red then green |
| P4 | Parallel calls | A 6-second window counts once; parallelism is 2.0 | Same | red then green |
| P5 | Wait and missing data | Owner waits excluded; absent active phases stay null | Same | red then green |
| P6 | Attribution | Shared, unmatched, and invalid timestamp records remain unavailable | Same | not run |
| P7 | Compatibility | Existing lifetime and benchmark regression assertions pass | Existing collector/benchmark suites | not run |

Relevant categories are boundaries, state, concurrency, missing data, and compatibility.
Device and app migration checks do not apply to this Node tooling change.
The existing suites are the regression inventory for this area; no new catalog is needed.

## Execution ledger
- Task 1: Python classification passed all 19 collector tests after the unittest fixture failed with `0 !== 2`.
- Task 2: All 27 collector/benchmark tests passed after both new window tests failed with missing results.
  Existing zero-second calls, cumulative cost, background shells, and nested-agent controls remain green.
- Task 3: pending.
- Independent review: not run.
- Final verification: not run.
- PR: not opened.
- Ruling: Retain session artifacts outside the repository; keep this acceptance and evidence record in the PR.
- Ruling: The strict helper rejects invalid bounds; unavailable phase bounds receive explicit null status instead.

## Conclusion
Complete M1 checks and independent review before its first push.
M1 establishes better evidence, not a demonstrated speed improvement.
The main risk is misattributing a reused session to one task.

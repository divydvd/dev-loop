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
| P6 | Attribution | Shared, unmatched, and invalid timestamp records remain unavailable | Same | red then green |
| P7 | Compatibility | Existing lifetime and benchmark regression assertions pass | Existing collector/benchmark suites | green; final-head run pending |

Relevant categories are boundaries, state, concurrency, missing data, and compatibility.
Device and app migration checks do not apply to this Node tooling change.
The existing suites are the regression inventory for this area; no new catalog is needed.

## Execution ledger
- Task 1: Python classification passed all 19 collector tests after the unittest fixture failed with `0 !== 2`.
- Task 2: All 27 collector/benchmark tests passed after both new window tests failed with missing results.
  Existing zero-second calls, cumulative cost, background shells, and nested-agent controls remain green.
- Task 3: The new phase-record fixture failed before implementation; all 22 collector tests then passed.
  Post-merge fixture work changes only `afterMerge`, not the earlier phases.
  Internal interval data does not appear in per-PR JSON.
  Documentation and synchronized `0.5.23` manifests are updated.
  All 28 collector/benchmark tests pass. Final-head suites, smoke installation, and review remain pending.
- Saved examples: Three original sessions were recomputed read-only against the baseline collector.
  Lifetime active time, owner waits, parallelism, cost, and model calls remain exactly equal.
  The saved website example changes from zero to 2.318 seconds of main build/test work.
  Nested reviewer tests remain outside the main bucket; phase labels still do not prove task-only attribution.
- Independent review: not run.
- Final verification: not run.
- PR: not opened.
- Ruling: Retain session artifacts outside the repository; keep this acceptance and evidence record in the PR.
- Ruling: The strict helper rejects invalid bounds; unavailable phase bounds receive explicit null status instead.
- Shared-file check: Open PRs 10 and 28–33 touch other README sections or their own changelog entries.
  PRs 10 and 28 propose older-base release versions; this PR uses the current `0.5.22` base and next patch `0.5.23`.
  Their version changes can need merge conflict resolution later. No unrelated hunk was copied or replaced.

## Conclusion
Complete M1 checks and independent review before its first push.
M1 establishes better evidence, not a demonstrated speed improvement.
The main risk is misattributing a reused session to one task.

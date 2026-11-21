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
The added Python recognition excludes quoted echo text and arbitrary scripts.
The legacy generic classifier remains unchanged and can still match quoted `pytest` text.

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
| P2 | Literal command text | Echo and ordinary script input stay other I/O; known stdin code remains executable | Existing P1/P2 table and diagnostic | stdin-filename red then green; final checks pending |
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
- Independent review: Three specialists and a synthesis judge reviewed `a38ef245fd73b4669f8ab24b7c38e67075a279bc`.
  They found lost terminal zero-duration work and false Python matches in escaped separators and heredoc bodies.
  Both findings have reproducing tests: `2 !== 0` for literal text; `null !== 0` for the terminal point.
  Both corrections pass those tests and all 29 collector/benchmark tests.
  Focused review at `190bbfa` verified the terminal fix and found a shell-script stdin subcase.
  Its fixture failed with `2 !== 0`; explicit input-mode recognition then passed all 29 regressions.
  A final focused review covers that input-mode correction before publication.
- Final verification: At `a38ef24`, all current suites reported 398 passes, zero failures, and one case-insensitive-filesystem skip.
  The final code commit must rerun the plugin check, all current suites, and temporary-home discovery.
  The PR Evidence section and persistent session ledger record final tested identities and results.
- PR: not opened.
- Three-attempt stop: Final focused review at `aa144f9` found `bash - /dev/null` still treating heredoc input data as code.
  A two-second fixture reports build/test 2 seconds instead of 0.
  `-` ends option parsing; a following filename still selects script-file execution.
  A harmless real Bash probe confirms this distinction.
  M1 is not ready. No fourth source fix or merge is authorized by this execution.
  The existing suites pass, but they do not cover this required counterexample.
  Preserve the draft PR and obtain an owner decision before a focused recovery pass.
- Ruling: Retain session artifacts outside the repository; keep this acceptance and evidence record in the PR.
- Ruling: The strict helper rejects invalid bounds; unavailable phase bounds receive explicit null status instead.
- Ruling: Reuse `tools/work-ledger/lib/shell.mjs` for Python recognition instead of adding another shell parser.
  It is an existing local utility; no package or runtime guard changes.
- Ruling: Its guard-oriented automatic nested expansion is conservative.
  Metrics instead use parsed simple commands and explicit inline or stdin shell code.
  Shell script files receive heredocs as data. Non-simple shell execution remains an attribution limit.
- Ruling: The final summary includes the terminal millisecond tick for observed zero-duration calls.
  Reported bounds remain the exact session endpoint. Complete intervals cannot extend past that observed endpoint.
- Ruling: The old broad quoted-`pytest` match stays unchanged under the approved compatibility scope.
  It can still inflate a legacy bucket. This PR does not claim universal shell-aware classification.
- Optional review gaps: Additional combined shell-ID/subagent phase fixtures are deferred.
  Existing logical-run regressions and direct phase union tests cover the core behavior; no further defect was demonstrated.
- Shared-file check: Open PRs 10 and 28–33 touch other README sections or their own changelog entries.
  PRs 10 and 28 propose older-base release versions; this PR uses the current `0.5.22` base and next patch `0.5.23`.
  Their version changes can need merge conflict resolution later. No unrelated hunk was copied or replaced.
- Approved recovery on 2026-11-21: The owner chose "Approve the focused correction (Recommended)".
  This authorizes one focused pass with full verification and independent review, but no merge.
  The preceding stop remains historical evidence, not permission for additional attempts.
- Recovery matrix: P2 script-file input after lone `-` must report build/test 0s and other I/O 2s.
  Bare `bash -` and explicit `bash -s - /dev/null` must report build/test 2s.
  All are required fixtures in the existing P1/P2 table.
  P7 retains collector/benchmark compatibility; plugin check, all CI suites, and isolated discovery remain required.
  Device, UI, runtime guards, and instruction behavior are unchanged.
- Recovery red: The permanent P2 table failed with `2 !== 0` for `bash - /dev/null`.
  Correction: Treat lone `-` and `--` as option termination; retain explicit `-s`.
  All 29 collector/benchmark tests pass after the correction.
  No runtime shell utility changed.
- Recovery verification at `2043ff0`: Plugin check has no faults; all CI suites have 399 passes, zero failures, and one filesystem skip.
  Exact-head isolated discovery finds plugin `0.5.23`, the core instruction, and the skills.
  Saved examples preserve original lifetime values.
- Focused independent review: `m1-recovery-reviewer` reviewed `2043ff0`, including the correction and affected parser interactions.
  It confirms the focused-single scope: no approval rule or newly risky area changed.
  It found Important F-1: `bash - /dev/stdin` and `bash - /dev/fd/0` execute stdin code but lose build/test attribution.
  A harmless Bash probe and real collector fixtures confirm expected 2s, actual 0s for both inputs.
  This is a required compatibility failure, not an optional parser enhancement.
- Recovery stop: The approved pass requires stopping on another confirmed classifier defect.
  F-1 remains unresolved. No further production correction, merge, or live benchmark is authorized or attempted.
  PR #52 remains a draft, not ready. Later evidence-only changes do not replace the reviewed source.
  The persistent ledger and PR body hold final identities and results.
- Review rulings: Prior full-diff review covers unchanged branch content; this follow-up covers the source correction.
  Final-head checks and discovery are verified by execution, not inferred from the review.
- Readiness authorization on 2026-11-21: The owner said "So make the PR ready to merge".
  This requests correcting the remaining blocker and completing checks and review. It does not authorize a merge or test waiver.
- Input-source reassessment: Identify the first script filename, including after option termination.
  No filename or explicit `-s` selects stdin code.
  Known stdin filenames `/dev/stdin` and `/dev/fd/0` also read supplied code.
  Ordinary script filenames receive heredoc data. Do not resolve arbitrary historical paths or symlinks.
- Readiness matrix: All cases are required in the existing P1/P2 table.
  Both known stdin filenames, directly and after `-` or `--`, must report build/test 2s and other I/O 0s.
  `/dev/null`, directly and after both terminators, must report build/test 0s and other I/O 2s.
  Existing bare-shell, explicit `-s`, inline-code, and literal-input cases must retain their results.
  P7, plugin checks, full CI suites, isolated discovery, and focused independent review remain required.
- Readiness red/green: The permanent fixture failed with `0 !== 2` for `bash - /dev/stdin`.
  The input-source correction then passed all 29 collector/benchmark tests.
  Harmless Bash probes and collector diagnostics also pass both previously failed stdin-filename cases.
  Final-head verification and focused review remain pending. No runtime shell utility changed.

## Conclusion
Complete final-head checks and focused independent review before marking M1 ready.
The input-source correction addresses the confirmed stdin-filename failure without general shell evaluation.
M1 provides better measurements, not evidence of faster work. No merge is authorized.

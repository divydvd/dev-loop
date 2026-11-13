# Constrained Optimization Policy and Trailing-Newline Fix (Milestone 2)

## Acceptance record
- **Goal:** Give weekly `infra-review` an objective 90% quality floor, a route-bucketed cost optimization rule, and a 4-week zero-catch paperwork cleanup rule, while fixing the deferred trailing-newline `view` boundary edge case (`0.5.10`).
- **Done when:**
  - [x] `scripts/collect-metrics.mjs` skips the trailing empty segment after a terminal `\n` when recording seen line numbers for `view`, while retaining exact character counts (`r4563704684`).
  - [x] `skills/infra-review/SKILL.md` Section 4 (`Choose the changes`) prioritizes durability/verification fixes when `Durable first-pass yield` is `status: "ok"` and `< 90.0%` with Section 3's fault threshold met, and rejects treating `n/a` statuses or single non-severe misses as confirmed faults.
  - [x] `skills/infra-review/SKILL.md` Section 4 prioritizes lowering median `totalNanoAiu`, model calls, or duplicate file-read share in the highest-cost `Task route` (`uniqueSessions > 0`) when `Durable first-pass yield` is `>= 90.0%`.
  - [x] `skills/infra-review/SKILL.md` Section 4 proposes removing or automating non-safety manual checks or PR template lines with zero confirmed bug catches across 4 consecutive observed weekly reviews (`n/a` weeks excluded), while preserving mandatory safety gates (`core.mdc` approvals, independent review, device/data safety, and Git history guards).
  - [x] `node scripts/check.mjs`, all CI suites (`T1–T12` and `testing-contract`), 5-sample RED/GREEN `M2-IR` skill checks, temporary `COPILOT_HOME` discovery, and independent agent review pass at the head commit.
- **Required evidence:** `node scripts/check.mjs`; `node --test scripts/*.test.mjs tools/work-ledger/*.test.mjs`; 5 baseline and 5 revised `M2-IR` subagent runs; temporary `COPILOT_HOME` install and `copilot instruction list` / `copilot skill list`; independent review. No device test: repository has no app.
- **Test matrix:** Saved below before implementation under `references/testing.md`.
- **Regression selection:** No permanent project regression inventory configured (`AGENTS.md`); retain all existing CI suites (`collect-metrics` `T1–T11`, `testing-contract`, `independent-review`, `branch-maintenance`, `device-handoff`, and `tools/work-ledger/*.test.mjs`).
- **Size estimate:** `scripts/collect-metrics.mjs` ~3 changed production lines; manifests 6 lines; skill/docs/tests ~80 non-production lines. Total changed production lines: ~9 (well below 400).
- **Milestone selection:** Milestone 2 (`M2`) of the 3-milestone evaluation roadmap (`M1` merged in `#37`; `M3` benchmark runner remains separate).
- **Out of scope:** Edits to `com.github.copilot/rules/core.mdc`, edits to `skills/dev-loop/assets/pr-body.md`, automatic deletion of safety gates, and Milestone 3 (`scripts/run-benchmark.mjs`).
- **Risky area:** none (`core.mdc`, approval points, and finish rules do not change).
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, checks pass at the head commit, review rounds stopped, independent review covers final substantive content, and no required coverage gap remains.
  - Blocked: 3 failed fixes, missing access, or a policy conflict. Stop after `M2` PR readiness so the owner can review `M2` before `M3`.

### Milestone record
| Milestone ID | Observable result | Acceptance checks / evidence | Dependencies / evidence | Branch / base / reason | Remaining behavior / compatibility limits | Status | Tested / reviewed identity | PR / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Read-only `scripts/collect-metrics.mjs` and shadow-mode `infra-review` wiring (`0.5.9`) | `T1–T11`, CI, `5/5` GREEN `M1-IR` | None | Merged to `main` (`10dea59`) | Complete | merged | `ab0e1ce` / `10dea59` | [#37](https://github.com/divydvd/dev-loop/pull/37) merged |
| M2 | 90% quality floor, route-bucketed cost priority, 4-week non-safety pruning rule, and `r4563704684` fix (`0.5.10`) | `T12`, `T13`, CI, `5/5` GREEN `M2-IR` | Consumes `M1` telemetry fields merged in `#37` | `divydvd-dev-loop-evaluation-analysis` -> `main` | Does not run offline task benchmarks (`M3`) | verified | verified at head | Open PR for owner review |
| M3 | Executable multi-task code benchmark runner (`scripts/run-benchmark.mjs`) | Future sandbox fixture suite | Independent of `M2` | Future branch -> `main` | Not started in this PR | planned | none | Separate follow-up after `M2` |

- Overall assignment: `M1` merged (`#37`); `M2` approved and in progress; `M3` planned.

### Compact test matrix
| Case | Requirement / risk | Required? | Setup / input | Expected result | Method | Test location | Status | Evidence | Tested identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T12 | Disjoint newline-terminated `view_range` chunks (`[1, 1]` `"a\n"` then `[2, 2]` `"b\n"`) | yes | Session reading `[1, 1]` `"a\n"` then `[2, 2]` `"b\n"`, then `[2, 2]` `"b\n"` again | Disjoint `[2, 2]` adds `0` duplicate chars (`0/4`); repeated `[2, 2]` adds `2` duplicate chars (`2/6`) | automated unit test | `scripts/collect-metrics.test.mjs` | passed | `node --test scripts/collect-metrics.test.mjs` (12/12 pass) | final head |
| T13 | `infra-review` 90% quality floor, route-cost priority, 4-week non-safety pruning, and `n/a` / safety-gate guards | yes | Structural check + 5 baseline vs 5 revised consumers on fixed `M2-IR` cases `A–D` | Contract RED->GREEN; `5/5` revised consumers enforce 90% floor, route-cost target, non-safety-only pruning, and `n/a`/threshold guards | structural + fresh subagent checks | `scripts/testing-contract.test.mjs` & `M2-IR` samples | passed | `node --test scripts/testing-contract.test.mjs` + `green-m2-1..5` | final head |

- Category assessment:
  - boundaries and invalid input -> `T12` (trailing `\n` empty split element; single-line chunk boundary), `T13` (`1/2` small sample and `n/a` weeks).
  - permissions and state changes -> `T13` (mandatory safety gates explicitly protected from 4-week zero-catch pruning).
  - existing consumers -> `T12`, `T13` (retains all `T1–T11`, `testing-contract`, and `Rule/check map` checks).
  - concurrency, partial failure, migration, UI/device, performance -> unchanged from `M1`; UI/device excluded (no app).
- Required blockers: none.
- Optional limits: Sampled subagent checks demonstrate instruction use, not runtime enforcement.
- Reassessment: Verified after `M2` implementation; retain all `M1` regressions (`T1–T11`).

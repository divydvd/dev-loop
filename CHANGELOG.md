# Changelog

Each entry says what changed, why (the evidence), and how the next weekly review checks that the change helped.

## 0.5.13 (2026-11-14)
- **Add shared host capability contract, Copilot host guide, and multi-host sync checks (Milestone M1).**
  - **What:** Export `checkRepo` and `stripFrontmatter` from `scripts/check.mjs` with symlink-safe CLI entry detection, validate inline links across nested `skills/*/references/**/*.md` and `skills/*/assets/**/*.md` files with regular-file and `realpathSync` containment checks, require `com.github.copilot/rules/core.mdc` plus `skills/dev-loop/references/hosts/README.md` and `skills/dev-loop/references/hosts/copilot.md`, enforce JSON-object and version/name parity across optional host manifests (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `gemini-extension.json`), verify `GEMINI.md` byte parity with `com.github.copilot/rules/core.mdc`, reject compound shell syntax in `SessionStart` hook commands while guarding executable `SessionStart` hooks against top-level or nested `additionalContext`/`systemMessage` emission under `COPILOT_CLI=1`, and enforce a per-event `15,000`-byte (`15 KB`) startup context ceiling across Copilot, Gemini, and Claude `SessionStart` hook matchers.
    Add `skills/dev-loop/references/hosts/README.md` and `skills/dev-loop/references/hosts/copilot.md`, route host-sensitive steps (`browser` canvas, `github-pr-media`, `orchestrate`/`pr-stack`, `work_ledger_record`, and `copilot-pull-request-reviewer`) in `skills/dev-loop/SKILL.md` and `skills/dev-loop/assets/pr-body.md`, add `scripts/portability-contract.test.mjs` to CI, and map the check in `README.md`.
    Leave `com.github.copilot/rules/core.mdc` unchanged (`0` diff lines).
  - **Why:** Across five fresh baseline `0.5.12` consuming agents (`S-P1`–`S-P4`), `0/5` had a rule to select host procedures from runtime tools instead of model ID (`claude-sonnet-5.5`) or operational fallbacks when `browser` canvas, `github-pr-media`, `orchestrate`/`pr-stack`, and `work_ledger_record` were absent (`S-P1`), `0/5` distinguished GitHub repository `copilot-pull-request-reviewer` configuration from the local coding host (`S-P2`), and `0/5` had an explicit contract explaining that `work-ledger` runtime command blocking is absent outside active host guard extensions (`S-P3`), while `5/5` preserved owner design approval and mandatory independent review (`S-P4`).
    Without nested reference link and multi-host sync checks in `scripts/check.mjs`, upcoming Claude (`M2`), Gemini (`M3`), and Codex (`M4`) adapters could drift in version, rule body, or startup token budget.
  - **Check:** Suites `T-M1-1`–`T-M1-3` in `scripts/portability-contract.test.mjs` fail before implementation and pass afterward alongside all existing CI suites, `node scripts/check.mjs`, five fresh revised consuming agents (`5/5` on `S-P1`–`S-P4`), temporary `COPILOT_HOME` discovery, and `B1`–`B6` benchmark parity (`6/6`).
    Subsequent milestones `M2`–`M5` and weekly infra reviews run `node scripts/check.mjs` and `scripts/portability-contract.test.mjs` to verify zero drift across host manifests and rule mirrors.

## 0.5.12 (2026-11-14)
- **Add 5-box active work time, bottleneck shares, and parallelism telemetry to weekly review and benchmark runner.**
  - **What:** Extend `scripts/collect-metrics.mjs` (`mergeIntervals`, `parseSessionEvents`, `collectMetrics`, and Markdown output) to compute merged `activeSec` (excluding `humanWaitSec` for `ask_user`/`relay_session_input` and between-turn idle pauses), five active-time buckets (`modelSec`, `buildTestSec`, `pollSec`, `subagentSec`, `ioOtherSec`), `parallelismFactor`, and route-level `medianActiveSec`, `dominantBottleneck`, and `medianParallelism` while keeping shared multi-PR sessions marked `ambiguous`.
    Extend `scripts/run-benchmark.mjs` to extract merged multi-session `activeSec`, `medianActiveSec`, `medianParallelism`, and diagnostic `activeSecRatio`.
    Update `skills/infra-review/SKILL.md` Sections 2 and 4 so weekly reviews target recurring active-time bottlenecks (`dominantBottleneck` or `1.00x` serial `parallelismFactor`) above the `90.0%` `Durable first-pass yield` floor without counting `humanWaitSec` or cutting safety gates.
  - **Why:** Across 385 local sessions (`SmarType`, `dev-loop`, `app-kit`, `verdict`), non-token shell delays (`141.0 h` Gradle builds/locks and `53.5 h` GitHub check/review polling) accounted for over half of active work time while `totalNanoAiu` remained blind to bash waiting, and `61.5 h` of `ask_user` human waits distorted raw wall-clock duration.
    Five fresh baseline `infra-review` consumers lacked `activeSec`, the five time buckets, and `parallelismFactor` (`5/5`), and `3/5` selected `open no PR` when `small` sessions had healthy `totalNanoAiu` (`1.8e11`) and `3%` duplicate reads but `26 min` recurring active delay (`19 min` `pollSec` and `1.0x` serial subagents).
  - **Check:** Suites `S-T1`–`S-T4` in `scripts/collect-metrics.test.mjs`, `S-T5` in `scripts/run-benchmark.test.mjs`, and `T-IR7` in `scripts/testing-contract.test.mjs` fail before implementation and pass afterward, alongside five fresh revised `infra-review` consumers (`5/5`), `node scripts/check.mjs`, and temporary-home discovery.
    The next weekly review checks route `medianActiveSec`, `dominantBottleneck`, and `medianParallelism` alongside `totalNanoAiu`.

## 0.5.11 (2026-11-13)
- **Add isolated Git benchmark runner and anti-tampering oracle graders.**
  - **What:** Add `scripts/run-benchmark.mjs` and `scripts/run-benchmark.test.mjs`, wire the suite into `.github/workflows/check.yml`, and map the check in `README.md`.
    Provision isolated temporary `COPILOT_HOME` and Git repositories across six canonical tasks (`B1-small-bug` through `B6-blocked-stop-limit`).
    Grade child-process oracle assertions, baseline test retention (`.skip`/`.todo`/`.only` and deleted-file detection), `git merge-base --is-ancestor` history preservation, `<= 400` production line caps, flow-doc co-updates, and honest blocker reporting.
    Extract sandbox `events.jsonl` `totalNanoAiu`, model calls, and duplicate reads via `parseSessionEvents`, and emit baseline-vs-candidate verdicts (`improved_quality`, `improved_cost`, `neutral`, `regressed_quality`, `regressed_safety`).
    Leave `com.github.copilot/rules/core.mdc` and `skills/dev-loop/assets/pr-body.md` unchanged.
  - **Why:** Prompt-only skill simulations saturated at `21/21` in PR #28 until real tool execution ran, and previous scenario scripts lived in uncommitted scratch folders rather than CI-tested repository code.
    During `B6` development, negative-scorer testing also caught `NODE_TEST_CONTEXT` inheritance causing nested `node --test` processes to exit `0` on failed assertions; stripping `NODE_TEST_CONTEXT` restores accurate child test exit codes.
  - **Check:** Five integration and negative-scorer suites in `scripts/run-benchmark.test.mjs` (`6/6` reference solver passes, `0/6` cheating-driver passes, unmasked anti-cheat/oracle/multi-session/mixed-pass regressions, sandbox cleanup on failure, and all five comparison verdicts) plus two `testing-contract` checks fail before implementation and pass afterward.
    Run `node scripts/check.mjs`, all CI suites, and temporary-home installation/discovery at the committed head.
    Future risky rule or skill PRs can compare `--baseline` and `--candidate` checkouts with `node scripts/run-benchmark.mjs`.

## 0.5.10 (2026-11-13)
- **Add constrained optimization and 4-week non-safety check cleanup to weekly infra review.**
  - **What:** Update `skills/infra-review/SKILL.md` Section 4 (`Choose the changes`) with a `90.0%` `Durable first-pass yield` quality floor, route-bucketed cost prioritization above that floor, and a 4-week zero-catch cleanup rule for non-safety manual checks and PR template lines.
    Exclude `n/a` / `unavailable` weeks and sub-threshold single misses, and explicitly protect mandatory safety gates (`core.mdc` design, risky-plan, independent-review, merge/deploy approvals, device/data safety, and Git history guards).
    Also fix trailing-newline `view_range` line-coverage boundary tracking (`r4563704684`) in `scripts/collect-metrics.mjs`.
  - **Why:** Five fresh baseline `infra-review` consumers had no `90.0%` quality-floor rule (`5/5`), one refused to prioritize recurring `multi-task` duplicate-read waste above `95.0%` yield (`1/5`), and none proposed removing or automating a non-safety manual PR prose line with `0` confirmed catches across 4 observed weeks (`5/5`).
    Baseline consumers already protected typed merge approval and ignored a `1/2` minor miss and `n/a` weeks (`5/5`); those passing controls remain preserved, not claimed as newly fixed defects.
    Post-round-2 review on #37 (`r4563704684`) also found that trailing `\n` in `view` outputs marked `endLine + 1` as already read.
  - **Check:** Unit regression `T12` in `scripts/collect-metrics.test.mjs` and structural check `T13` in `scripts/testing-contract.test.mjs` fail before implementation and pass afterward.
    Five fresh revised `infra-review` consumers apply the `90.0%` floor, target recurring waste in the highest-cost `multi-task` route above `90.0%`, propose pruning/automating only the non-safety prose line while keeping merge approval, and preserve the `1/2` and `n/a` guards.
    Run `node scripts/check.mjs`, all CI suites, and temporary-home installation/discovery at the committed head.
    The next weekly review checks priority selection against `Durable first-pass yield` and tracks zero-catch non-safety checks across observed weeks.

## 0.5.9 (2026-11-13)
- **Add read-only shadow-mode objective telemetry collector for weekly infra review.**
  - **What:** Add `scripts/collect-metrics.mjs` and `scripts/collect-metrics.test.mjs`, and wire `node <dev-loop-checkout>/scripts/collect-metrics.mjs` into `skills/infra-review/SKILL.md` in shadow mode.
    Compute 14-day production line survival on mature PRs (`mergedAt <= to - 14d`), 14-day fix-up PRs (explicit references and bug-fix `git blame` churn), `work-ledger` + docs-only Git ancestry verification, first-push green CI rate, owner repeat-rule messages, durable first-pass yield, and route-bucketed (`trivial`, `small`, `multi-task`) medians for `totalNanoAiu` and duplicate file reads.
    Mark shared multi-PR sessions as `ambiguous` (`excluded from per-PR cost`) and emit `n/a` when optional inputs are absent.
    Leave `com.github.copilot/rules/core.mdc` and `skills/dev-loop/assets/pr-body.md` unchanged.
  - **Why:** Fifteen of the 17 existing `infra-review` rows measure process steps or raw volume, and literal 7-character table matching reported `11/58` head-evidence PRs in PR #10 while Git ancestry was `47/49`.
    Five fresh baseline `infra-review` consumers had no collector script, rejected a `work-ledger`-validated parent with a docs-only child commit (`5/5`), lacked `trivial`/`small`/`multi-task` route buckets (`5/5`), split `3` vs `2` on whether a 16-day-old PR qualifies for 14-day survival, and missed undocumented 11-day bug-fix blame churn (`4/5`).
    Baseline consumers already avoided shared-session cost duplication and preserved `F1` layer classification (`5/5`); those passing controls remain preserved, not claimed as newly fixed defects.
  - **Check:** Eleven unit/integration suites in `scripts/collect-metrics.test.mjs` and two new `testing-contract` checks fail before implementation and pass afterward.
    Five fresh revised `infra-review` consumers run `node <dev-loop-checkout>/scripts/collect-metrics.mjs` in shadow mode, verify docs-only Git ancestry separately from literal table cells, classify `trivial`/`small`/`multi-task` routes with `ambiguous` shared-session cost, evaluate 16-day-old PR survival and 14-day blame churn consistently, and preserve `F1`.
    Run `node scripts/check.mjs`, all CI test suites, a live read-only `divydvd/dev-loop` telemetry check, and temporary-home installation/discovery at the committed head.
    The next weekly review compares literal table evidence with ledger-ancestry verification and checks route-bucketed `totalNanoAiu` and 14-day survival in shadow mode.

## 0.5.8 (2026-11-13)
- **Plan safe, useful milestones before selecting PR dependencies.**
  - **What:** Replace size-only stacking with evidence-based independent or dependent PR bases.
    Add an on-demand milestone contract and optional records in the existing acceptance and PR templates.
    Keep per-PR delivery gates and separate assignment gaps. Continue only eligible independent work during local blockers.
    Preserve typed per-head merge approval, required checks, review limits, absence boundaries, and global failure stops.
  - **Why:** All five fresh M1/M4 baseline consumers selected complete CSV delivery but imposed unnecessary chained PR bases.
    A fresh M2 consumer stopped independent parser work because a separate required device test lacked access.
    Baseline consumers already preserved merge approval, safe migration boundaries, real dependencies, small-task scope,
    required integration coverage, absence boundaries, allowed maintenance, and failed-fix limits.
    These passing controls are not newly repaired failures.
  - **Check:** Three new structural checks fail before implementation for missing reference wiring and record slots.
    All 20 testing-contract checks pass after implementation.
    Five fresh revised M1/M4 consumers select complete CSV scope and independent PDF bases, without automatic merging or approval polling.
    Fresh revised M2 continues eligible parser work; M3/M5–M10 retain the baseline safety controls.
    All current CI suites and extra script tests pass locally: 268 passed, one platform-specific skip.
    Run the plugin check, all current CI suites, and temporary-home installation/discovery at the final commit.
    Record actual results and independent coverage in the PR; sampled decisions do not prove runtime enforcement.
    Automatic review found stale absence-only blocker wording in the copied acceptance record.
    Align that wording with the milestone reference; add a failing structural regression before the correction.
    Verify the correction with focused M2/M9 consumers and independent review, then repeat final-head tiers.
    Base maintenance preserves the merged 0.5.7 failure-feedback instructions and their changelog entry.
    Keep earlier results at their original source identities.
    Repeat affected consumers, current CI suites, isolated discovery, and focused review for the integrated source.
    The next weekly review checks false dependencies, unsafe slices, repeated status requests, and assignment gaps.

## 0.5.7 (2026-11-11)
- **Classify recurring failures and make feedback records consistent.**
  - **What:** Add environment, verification, and coordination layers to infra review.
    Record incident references, unknown causes, the proposed fix location, and a measurable expected result.
    Map selected rules to existing checks, regression tests, and explicit enforcement limits in the README.
    Extend the existing failure handoff with expected result, actual result, attempted change, and new evidence.
    Repeated results without new evidence require bounded diagnosis, not an equivalent retry.
    Preserve failed-fix limits, result identities, required reruns, approvals, and the one-week shadow period for new automatic checks.
    No live guard or runtime dependency changes.
  - **Why:** The owner approved these three improvements after comparing an agent-systems article with the current plugin.
    Five fresh baseline consumers used different record formats; none supplied a uniform layer field or the requested four-column map.
    One sample gave explicit numerical targets for all three proposed improvements.
    Existing consumers already rejected unsupported guard claims and unsafe full reruns.
    These safe controls remain required and are not claimed as newly repaired failures.
  - **Check:** Four added structural checks fail before implementation; the existing 17 checks pass.
    Five revised fresh consumers use the same inputs and produce layer records with observable targets.
    They retain the safe recovery, guard-limit, small-change, and owner-report controls.
    One revised consumer also preserves all README risk-based cases 1-13 and validation cases V1-V5.
    Run the plugin check, all CI suites, and isolated installation/discovery at the committed head.
    Structural checks establish wiring and map reference integrity; agent cases provide sampled instruction-use evidence only.
    The next weekly review checks correct fix ownership, measurable outcomes, repeated attempts without new evidence, and enforcement overclaims.

## 0.5.6 (2026-11-04)
- **Clarify validation recovery and readiness reports.**
  - **What:** Replace the blanket verification-failure route with a product/tool/environment distinction and a short handoff in the existing ledger.
    Record missing cases, recovery/access state, the next prerequisite check, and required reruns.
    Require recovery evidence before another full run; a controller edit or review alone is not that evidence.
    Lead owner reports with overall readiness, then passed scope, required gaps, next action, and differing tested/published identities.
    Preserve result-validity rules, exact setup, required full runs, final-head tiers, review limits, approvals, and device safeguards.
  - **Why:** The issue551 investigation found repeated tool failures and agent mistakes after passing original-feature checks.
    The final run stopped at a process assertion with required dark-mode checks unrun; the latest correction remained unpublished.
    Five fresh baseline samples avoided false-ready claims, but one buried the readiness verdict after passing results.
    A separate baseline consumer already handled tool diagnosis, valid/invalid evidence reuse, fresh-install limits, and existing safety controls.
    These passing controls are preserved, not claimed as newly repaired unsafe behavior.
  - **Check:** Three new structural checks failed before the guidance changed; all 17 testing-contract checks pass afterward.
    Five fresh revised samples lead with PR readiness and preserve the small-change controls.
    A fresh revised recovery consumer preserves the fixed recovery/setup cases and README cases2-13.
    The retained CI suites pass 248 checks, with one platform-specific skip; the plugin check and temporary-home discovery pass.
    Repeat the required checks at the committed head before publication.
    These checks establish wiring and sampled instruction use, not a repaired test tool or actual phone results.
    The next weekly review checks blind full reruns, recovery evidence, repeated owner status requests, and readiness-first reports.

## 0.5.5 (2026-11-02)
- **Add permanent project regression inventory support.**
  - **What:** Add a project-owned matrix template and profile fields for its path, core checks, affected areas, and broad triggers.
    Link stable permanent case IDs to task selection and current evidence.
    Maintain important new flows and useful bug regressions with their tests in the same PR.
    Reuse existing inventories; retain traceable retirement and source-backed reasons for unchanged entries.
    Report missing setup and stale references without inventing suites or expanding task scope.
    Preserve project tiers, approvals, device safeguards, absence behavior, and existing readiness rules.
  - **Why:** The previous contract describes per-task cases but has no permanent template, profile fields, or required selection slots.
    Five fresh baseline agents applied 13 fixed cases, including five independent samples of a small parser fix.
    They already selected safe checks and preserved pressure, evidence, retirement, consumer, and absence controls.
    One baseline made durable bug-document maintenance conditional; missing-inventory reporting lacked an explicit setup-gap record.
    New-flow inventory maintenance already appeared in baseline. These passing controls are not claimed as new unsafe failures.
  - **Check:** Five fresh revised agents applied the same cases against a hash-pinned snapshot.
    They linked existing IDs, maintained project records, and reported setup gaps while preserving baseline controls.
    Five new structural checks failed before implementation; all 14 testing-contract checks pass after implementation.
    Independent risky-task review found no significant issue in the eight-file snapshot and its existing interactions.
    Run the plugin check, all CI suites, the README application cases, and temporary-home installation/discovery.
    Structural checks establish wiring; simulated agent tasks do not execute an application or prove universal reliability.
    Project adoption and a real-task pilot remain separate. The next weekly review checks omitted flows, stale links, and record effort.

## 0.5.4 (2026-11-02)
- **Add proportional risk-based test planning.**
  - **What:** Save a compact matrix for small substantive changes and detailed cases for complex or high-risk changes.
    Link acceptance conditions and important risks to cases or explicit gaps.
    Record category exclusions, expected results, methods, locations, statuses, evidence, and tested identities.
    Extend existing independent review to inspect missing cases against requirements, source, and consumers.
    Preserve TDD, project tiers, approvals, device safety, and absence dependencies.
    Required failures and required coverage gaps prevent readiness; optional limits remain explicit.
    Reassess affected cases after changes without relabeling historical evidence.
  - **Why:** Five fresh baseline agents applied 13 fixed cases, including five samples of a small validation fix.
    They selected many useful checks but did not consistently produce per-case method, location, status, and identity fields.
    One small-fix sample omitted invalid-input cases. Detailed risk records and explicit category assessment were inconsistent.
    Existing reuse, readiness, device, evidence-drift, consumer-review, exempt-route, absence, and failure controls already passed.
    These controls are preserved, not reported as newly reproduced unsafe failures.
  - **Check:** Five fresh revised agents applied the same 13 cases and produced consistent compact records in five small-fix samples.
    Independent risky-task review found no confirmed issue in the instruction snapshot and its existing interactions.
    Eight structural assertions failed before implementation; seven passed after the contract, with CI wiring intentionally pending.
    CI now runs the added suite alongside existing suites.
    Automatic review found conflicting finish wording for justified `not applicable` cases.
    A fresh baseline agent blocked an approved removed requirement; the revised case permits readiness without claiming a pass.
    A failed required revocation case still blocks readiness. A ninth structural regression protects both finish clauses.
    Run the plugin check, all CI regression suites, the README application cases, and temporary-home installation and discovery.
    Structural checks establish wiring, not runtime enforcement. Agent simulations do not execute the fixture applications.
    The next weekly review checks missing-case findings, record size, honest identities, and required blockers.

## 0.5.3 (2026-11-02)
- **Add owner-activated absence mode.**
  - **What:** Add the `away mode` and `I'm back` messages, a task-scoped reference, durable decision fields, and a blocker handoff.
    During verified absence, defer blocked steps and their dependents; continue only permitted independent work.
    Preserve feature design, risky-plan, merge, deployment, live configuration, and other protected approvals.
    Preserve review, test, failure, data, and shared-resource requirements.
    Return does not approve agent decisions. No eligible work produces a handoff, not a blocking question or polling loop.
    Normal behavior is unchanged without direct owner activation.
  - **Why:** Eleven baseline scenarios found no absence activation or persistent return state.
    Mixed-phase continuation depended on agent guesses.
    Missing feature and risky-plan approvals still selected blocking questions while the owner was absent.
    Existing implementation rulings and three-failed-fix stops already worked and remain required.
  - **Check:** Fresh agents applied all eleven revised reference cases and integrated routing cases.
    Independent risky-task review identified an implicit workspace-conflict stop; it is now explicit.
    A control already stopped conservatively before that clarification; it is not claimed as a new unsafe runtime failure.
    Focused cases distinguish a session-wide conflict stop from task-local deployment deferral.
    Run the plugin check, existing plugin regressions, and temporary-home install with instruction and skill discovery.
    The README keeps repeatable application cases. These instruction tests do not prove every host permission path.
    The next weekly review checks decision completeness, dependency handling, unnecessary stops, and protected approvals.

## 0.5.2 (2026-11-01)
- **Add optional fresh-context design review.**
  - **What:** Add `design-review` and its source-backed reviewer contract.
    Explicit owner requests remain review-only work.
    Automatic review requires project enablement and concrete matching criteria, before the existing design approval.
    Preserve core rules, owner gates, tests, and independent PR review.
    Allow one focused recheck; report incomplete coverage, failed delegation, and remaining findings explicitly.
    Record design and source hashes, review identity, findings disposition, and available pilot measurements.
    EGM is a method reference, not an installed dependency. Drift checks remain out of scope.
  - **Why:** Six baseline scenarios found no pre-approval fresh review for enabled settings or explicit design-review requests.
    The old instructions had no design-specific snapshot contract or focused-recheck limit.
    Existing disabled routing and approval behavior already worked and needed preservation.
  - **Check:** Fresh agents applied the revised skill, integrated routing, and review boundary cases.
    An actual fresh reviewer found duplicate-credit risk in a retrying webhook fixture.
    Another fresh reviewer found no confirmed issues in a complete transaction-based design.
    Independent review identified an implicit source-drift check; the instructions now name every source comparison.
    A targeted control already detected source drift before clarification; it is not claimed as a new failing runtime test.
    Missing hashes and changed-source cases require incomplete coverage.
    Run the plugin check, existing regressions, and temporary-home installation with instruction and skill discovery.
    The README preserves application scenarios for later changes; these checks do not add a runtime guard.
    The next weekly review compares useful findings, elapsed review time, and available usage before wider enablement.

## 0.5.1 (2026-10-31)
- **Require independent review for substantive PRs.**
  - **What:** Replace the step-2-only review condition with complete independent coverage before the first push.
    Include small changes, tests, dependencies, configuration, and operational instructions.
    Exempt only harmless spelling or formatting edits, with a recorded reason.
    Reuse complete existing coverage and review later substantive changes with a focused scope.
    Record reviewer identity, reviewed content, verdict, and later-change coverage separately from GitHub Copilot review.
    Two failed attempts permit an open PR, but not a ready claim. No blocking guard is added.
  - **Why:** A fresh baseline agent applied eight scenarios to the old instructions.
    It excluded small bugs and features because their acceptance records came from step 1.
    It also permitted a ready claim after two failed independent review attempts.
    PR #3 records two Important independent findings while Actions blocked automatic review.
    PR #20 records three independent findings that received regression tests.
  - **Check:** All five new text regressions failed before the change and passed afterward.
    A sixth regression caught missing CI wiring; CI now runs the independent review suite.
    A fresh agent applied eight revised scenarios and five pressure variants.
    It required substantive coverage, reused complete coverage, exempted harmless edits, and rejected unsupported ready claims.
    Text checks do not prove runtime enforcement. The next weekly review measures coverage, owner reminders, confirmed findings, and review cost.

## Unreleased tooling (2026-10-31)
- **Allow an owner-listed read-only monitor to name the guard lock path.**
  - **What:** A new `readOnlyMonitors` config list (exact interpreter words, script SHA-256, and one argument name). A call to a listed monitor may carry the exact guard `lockf` envelope as that argument's value. The call text must be plain or single-quoted words, so bash runs exactly the checked words. All other guard-path mentions, other interpreters, code flags, env prefixes, wrappers, chains, redirects, substitutions, and typed shell input stay denied.
  - **Why:** In the app-kit recovery, the guard denied `python3 publication-watchdog.py ... --expected-command '/usr/bin/lockf -t 1500 ~/.copilot/work-ledger/gradle.lock ...'` as a guard-file write. The script only reads process data and signals its owned PIDs. The producer had to stop the publication.
  - **Check:** `read-only-monitor.test.mjs`: the positive case fails on the previous policy and passes now. Negative groups cover guard paths, code flags, fake interpreters, shell expansion (glob, brace, `$'..'`), wrappers, chains, redirects, and malformed entries. Two independent reviews found three bypasses (glob/ANSI-C words, an unpinned interpreter, Python path shadowing); each has a regression. The PR #20 code review found three more problems: a carriage return that bash keeps in the program name, a symlink followed by `..` that let the guard hash a different file than Python opens, and an entry-order fault. The rule now accepts only printable ASCII and normalized script paths, uses physical path resolution, and checks each entry fully; each has a regression. The recorded producer call is denied unlisted. With the pinned `/usr/bin/python3 -I` prefix and the real script hash, the same call is allowed, offline. The next weekly review checks guard history for monitor denials.
- **Make the legacy global guard OFF a safe, limited pause.**
  - **What:** `guards off` now pauses only `review-limit` and `test-cache`. Merge and deploy approval, history checks, guard-source protection, Maven verification, and the shared Gradle lock stay active.
    Startup, subagent, and status text name the pause and the protections that stay active. A pending preview shows its exact confirmation line and deadline.
    The installer also accepts the exact previous reviewed release (`PREVIOUS.sha256`) for upgrade.
  - **Why:** In the app-kit sessions, OFF skipped every check, including the Gradle lock wrapper. Agents then turned guards ON again, which blocked Maven again.
    OFF status also listed protections that were not active, and agents could not find the confirmation line again after a preview.
  - **Check:** New policy, status, and real-extension regressions. Full work-ledger suite and `node scripts/check.mjs` pass. The next weekly review checks for OFF/ON loops and lost confirmations in guard history.

## Unreleased tooling (2026-10-30)
- **Require existing candidate source directories before acceptance writes.**
  - **What:** Reject absent roots and source files before output creation or report invalidation. Remove the missing-source case-fold fallback.
    Preserve physical identity checks for existing sources, including an empty path's current-directory identity.
  - **Why:** Final narrow review reproduced a Unicode-normalization alias creating an absent source and output before argument rejection.
  - **Check:** Six actual-script boundary failures become passing regressions. Trusted-destination stale-report controls and all eighteen Python methods pass.
- **Invalidate identifiable evidence before full argument validation.**
  - **What:** Bind one safe output directory before checking other known options.
    Preserve unrelated layout evidence when the layout is known. Invalid layouts invalidate only the two known report names.
    Reject ambiguous output identity without changing its possible targets.
    Check physical source identity before creating a destination or invalidating reports through a filesystem alias.
  - **Why:** Independent final review reproduced malformed `--source` leaving a previous success report unchanged.
    Its final package review also reproduced case aliases bypassing lexical source isolation.
  - **Check:** Actual-script regressions cover missing values, invalid choices, option order, unknown options, and unsafe/ambiguous destinations.
    Three alias regressions fail before the identity guard and pass afterward. Fourteen Python methods pass on macOS.
- **Guard the complete isolated acceptance lifecycle.**
  - **What:** Include bootstrap in the safe reporting boundary. Initialize ownership before allocation and invalidate previous evidence before work.
    Publish reports atomically. Close owned servers and terminals, reap children, and verify root identity before directory cleanup.
  - **Why:** Final review reproduced a bootstrap exception that exposed a formatted path and preserved stale success evidence.
  - **Check:** Actual-script early/late fault injection, Python cleanup regressions, complete Node suites, and both actual SDK layouts.
- **Prepare a pinned owner installation package.**
  - **What:** preview by default; bind source, whole installed tree, and optional descriptor additions to reviewed integrity pins.
    Preserve unrelated configuration and files. Reject unsupported source, symlinks, conflicting scopes, and concurrent drift.
    Stage privately outside discovery. Preserve the original and provide pinned rollback with rename-failure recovery.
    Keep merge and real deployment approval mandatory, as the owner explicitly chose.
  - **Why:** the approved guard stack needs an owner-controlled installation layer, not an unauthorized live edit.
    Isolated transaction tests cover complete backup/restore, code validation before imports, scope pins, CLI confirmation, and failures.
    Independent review exposed external-scope shadowing, incoming rollback drift, discoverable temporary staging, and symlinked ledger paths.
    Eight failing regressions now cover the corrections.
    CI exposed Node 22 dropping nested directory modes during recursive copy.
    A local Node 22 reproduction confirmed the mismatch.
    Staging now validates copied bytes and types before restoring pinned directory modes and rechecking the complete tree.
    Automatic review exposed physical path aliases, ambiguous ledger identity, overlay drift, and incomplete failure cleanup.
    Regressions reproduce the installation and process failures without touching live state.
    Staging now compares the complete tree with the pinned original plus approved writes.
    Failed lifecycle runs stop their owned descendants before restart or directory removal and retain a failed result.
    A second review exposed optimized-Python integrity bypass, configuration case/read races, and omitted special permission bits.
    Regressions reproduce those failures. Effective external scopes now require a pin and validation even without additions.
    Node 22 also stripped special file bits during copying; a separate reproduction showed mode `4600` becoming `0600`.
    Checked staging now restores every pinned permission mode before the complete identity comparison.
    Final review found that rewriting a read-only configuration failed after a successful preview.
    The owner authorized one additional bounded cycle for this finding.
    No-addition installs now keep the copied configuration untouched.
    Approved additions replace it from a separate private file with the original permission bits.
    A later review found the same fault in read-only runtime modules.
    The owner approved one bounded root permission cycle.
    Runtime and configuration now share private exclusive writes and descriptor-based permission restoration.
    Private staged directories receive temporary write access, with full checks before and after restoring pinned modes.
    Non-root tests cover read-only files, nested directories, executable/special bits, rollback, and injected failures.
    macOS and Linux refuse cross-parent moves of a read-only installation root.
    Preview rejects this unsupported state without permission changes.
    Actual CLI/SDK tests check both user and project discovery layouts, with zero model requests.
    Each layout starts from a real pinned installer transaction in disposable state.
    They verify native tools/hooks, child replacement, exit, restart, and persisted synthetic notes; they do not prove desktop reload.
    Final review found that JSON escaping could prevent private path redaction in retained evidence.
    The owner approved a bounded evidence correction.
    Redaction now processes structured strings before serialization.
    Regressions cover Unicode, quotes, backslashes, newlines, nested keys/values, and unchanged input evidence.
    Retained reports also omit environment values, including unrelated private path prefixes in `PATH`.
    A later review reproduced private filenames already escaped by exception formatting.
    The owner approved a bounded safe-diagnostics correction.
    Failure reports now retain only fixed steps, allowed exception types, numeric codes, and failed checks.
    Successful evidence excludes raw host logs, process command lines, and arbitrary SDK diagnostic fields.
    Real exception, subprocess, timeout, observer, cleanup, and report-write regressions cover the retained boundaries.
    Cleanup and reporting faults remain explicit failures; uncertain process cleanup preserves disposable state.
    Read-only source review and PR approval do not grant installation permission.
  - **Check:** run `node scripts/check.mjs` and
    `node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs`.
    Verify `PACKAGE.sha256` and `SOURCE.sha256`; preserve `BASELINE.sha256`.
    See `tools/work-ledger/INSTALL.md` for owner-only commands and lifecycle evidence limits.
    The separate parent correction covers protected-path aliases and three confirmed owner-control defects.
    Its integration does not grant installation permission.
    The live guard, configuration, ledger, and owner sessions remain unchanged.
- **Resolve protected Maven paths before granting the local exception.**
  - **What:** retain lexical overlap checks and compare canonical project and protected directory identities in both directions.
    Explicitly deny protected-path resolution failures. Preserve normal ledger initialization and all other Maven checks.
  - **Why:** PR #15's final automatic review found a protected ledger symlink targeting ignored project build data.
    Real Git/filesystem regressions reproduced unsafe permissions for root aliases, ancestor aliases, enclosing roots, and broken paths.
    Controls cover ledger and extension paths, lexical protection, project aliases, and valid nonoverlapping startup.
    Independent review found case aliases on macOS; two failing regressions led to directory ancestry checks using filesystem identity.
  - **Check:** run `node scripts/check.mjs` and
    `node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs`.
    Refresh `SOURCE.sha256`; preserve `BASELINE.sha256`.
    This is one owner-approved correction cycle above #15, not installation or a live operational fix.
- **Correct three confirmed owner-control defects in the same approved cycle.**
  - **What:** retain enforcement for ambiguous tilde paths. Exclude PR option values from GitHub repository extraction.
    Respect `--` boundaries. Preserve direct legacy restore commands with case and whitespace variants.
  - **Why:** #14's final review found foreign pause selection through quoted tildes and title values.
    It also found that new control routing rejected `guards ON` and `guard  on`.
    Policy, classification, and disposable runtime regressions failed before these corrections.
    Runtime checks preserve the rejection of agent, quoted, forwarded, and automatic messages.
    Independent review found the missing attachment option; two failing regressions led to consuming `--attach` values as well.
  - **Check:** use the same required suite and source-manifest checks as the Maven correction.
    The owner explicitly added these three defects to this single correction cycle. No extra review budget or installation is authorized.
- **Add descriptor-bound local Maven recovery in maintained source.**
  - **What:** reuse the confirmed repository/session controls for a narrow Maven pause.
    Bind the canonical project, full reviewed SHA, tracked launcher, literal command, and build-local destination.
    Reject unverified publication. Preserve real deployment checks, source protection, and the shared build lock.
  - **Why:** the owner requested a bounded recovery path after the Maven false positive in issue #11.
    New tests failed because Maven had no configurable recovery path.
    Real Git fixtures cover hidden index flags, untracked source, byte changes, scope changes, symlinks, and expiry.
    Entry-point tests exposed discarded batch wrappers; a separate regression exposed lock-like task text.
    Both paths now preserve locking or deny the command.
    Independent review found executable traversal through ignored symlinks. A real filesystem regression failed before exact launcher spelling blocked it.
    Automatic review found singleton batches, Git replacement refs, and dangling destination links.
    Transport, Git, and filesystem regressions reproduced these gaps before the fixes.
    The second automatic review found Git pathspec magic and dot-prefixed containment gaps.
    Three real Git/path regressions failed before literal tracking and component-aware containment fixed them.
    The owner's final scope decision keeps merge and real deployment approval mandatory, not configurable.
  - **Check:** run `node scripts/check.mjs` and
    `node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs`.
    Refresh `SOURCE.sha256`; preserve `BASELINE.sha256`.
    Only owner installation and disposable real SDK acceptance remain for the requested recovery path.
    Reviewed Gradle code is trusted, not sandboxed. The live guard remains unchanged.
- **Add partial scoped owner controls in maintained source.**
  - **What:** preview and separately confirm temporary pauses for six independent checks.
    Preserve repository-bound session scope, 30-minute defaults, absolute expiry, status, and shared audit records.
    Preserve merge and deployment approval, unverified Maven blocks, source protection, and the shared Gradle lock.
  - **Why:** the owner requested narrower recovery controls after a Maven task incorrectly requested Play approval in issue #11.
    Six helper tests and five policy tests failed before implementation.
    An isolated entry-point contract failed before owner-message integration.
    Added regressions cover unknown action paths, push destinations, and API repositories.
    Independent review found enclosing-shell context and literal URL rewriting could transfer a pause to another repository.
    Both findings have failing-then-passing regressions; uncertain contexts now retain enforcement.
    Automatic review added five confirmed regressions: pipeline/background context, review defaults, attached Gradle directories, legacy aliases, and short-preview deadlines.
    The fixes retain enforcement for uncertain directories and preserve accurate confirmation windows.
    The second automatic round added four identity regressions: PR URL hosts, empty Git `-C`, symlink/parent paths, and implicit `gh` defaults.
    Canonical PR URLs and explicit `gh` repositories are required for review pauses; parent-traversal paths retain enforcement.
  - **Check:** run `node scripts/check.mjs` and
    `node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs`.
    Verify the maintained release with `SOURCE.sha256`; keep `BASELINE.sha256` unchanged.
    Next weekly review: require reviewed local-only Maven verification and actual isolated SDK host acceptance before owner installation.
    This is partial acceptance. Remaining per-guard controls and the owner installer are separate; the live guard is unchanged.
- **Correct publication classification in maintained source.**
  - **What:** classify generated Maven publication tasks as Maven and App Distribution uploads as Firebase.
    Preserve Play approval, configuration checks, and the shared Gradle lane.
    Keep Maven publication blocked until its build source and destination are verified.
    Do not trust `KitTest` or `MavenLocal` names as proof of local-only execution.
  - **Why:** issue #11 records Maven tasks and Firebase uploads incorrectly requesting Play Store approval.
    Fifteen narrow regressions failed against the baseline.
    Independent review found non-word names could evade Maven classification.
    Nine added regressions reproduced this boundary; all 27 classification checks pass after the correction.
  - **Check:** run `node scripts/check.mjs` and
    `node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs`.
    Verify current source with `SOURCE.sha256`; preserve `BASELINE.sha256`.
    Next weekly review: confirm scoped source/destination verification before any local Maven exception.
    Controls and owner installation remain separate. The live guard is unchanged.
- **Preserve the work-ledger baseline.**
  - **What:** maintain the separate SDK extension under `tools/work-ledger/`, with provenance hashes, helper tests, and CI coverage.
    All nine implementation files are unchanged. No plugin runtime behavior or live installation changes.
  - **Why:** issue #11 records false deployment blocks and missing maintained source.
    The owner approved this location and a source-only exception to the 400-line PR limit.
  - **Check:** run `node scripts/check.mjs` and `node --test tools/work-ledger/*.test.mjs`.
    Verify the original import against `BASELINE.sha256`.
    Next weekly review: require separate tested fixes and an owner installation handoff before claiming the incident is resolved.

## 0.5.0 (2026-10-29)
- **Project-based UI component reuse.**
  - **What:** UI work inspects existing components, design tokens, and current usage before the mockup or implementation.
    The details load from a reference only for UI tasks, not for backend work.
    For a planned change, the plan records source paths, the selected variant, affected states, and checks.
    Shared changes preserve existing consumers and update examples or references.
    The profile adds optional pointers to components, tokens, examples, and UI checks. Missing references permit focused source investigation.
    No catalog tool, new dependency, speculative library, or design system is required. Non-UI tasks skip the work.
  - **Why:** the owner requested consistent reusable design components and an efficient harness.
    The baseline template had no UI reference contract; its required-field test failed before this change.
    Baseline application cases already selected sensible reuse. This change makes the project references and plan record explicit; it does not claim measured token savings.
  - **Check:** run `node scripts/check.mjs`, an isolated-home install smoke test, the profile contract check, and the UI application cases.
    Next weekly review: inspect UI PRs for source-based reuse decisions, duplicate components, and regressions in shared consumers.
    Record missing checks and avoid adding UI exploration to backend-only tasks.
- **Tested before release:** the five profile fields and on-demand reference wiring pass after failing before their edits.
  Eight simulated application cases preserve reuse, consumer checks, and the bug/non-UI routes.
  A final contract test exposed an unconditional plan-record requirement; the reference now preserves the trivial-change route explicitly.
  An independent whole-change review found no significant issue.
  An isolated Copilot home installed 0.5.0 and discovered the core instruction and all three plugin skills.
- **Allow safe PR branch maintenance.**
  - **What:** rule 21 permits merging a PR's base into its working branch, then requires checks and review again.
    Local merges into the default branch, rebases, and force pushes remain prohibited. PR merges still require owner approval.
  - **Why:** the blanket local-merge ban blocked conflict resolution for #9 after #8 advanced main.
    The owner approved this distinction and the core-rule plan on 2026-10-29.
  - **Check:** `node --test scripts/branch-maintenance.test.mjs` verifies the permission, protected integration boundary, and fresh checks/review.
    All three contracts failed before the rule edit. CI runs them with the retained device-handoff tests.
    Next weekly review: branch maintenance does not ask for a policy exception or bypass PR approval.
- **Conflict resolution:** retain both the 0.4.1 device safeguards and the 0.5.0 UI guidance; keep manifests at 0.5.0.
- **Not changed:** PR approval requirements, Graphify guidance, application code, and cost measurement.

## 0.4.1 (2026-10-29)
- **Keep a current test build on the device.**
  - **What:** the core and device-test procedure retain a passing build, while safely restoring test data and settings.
    Monitor grants follow the project procedure rather than an old APK baseline.
    After an authorized merge, the merging session refreshes the debug build from the latest fetched default branch.
    The profile supplies project commands and exclusive access. Version, data, owner approval, and keyboard-selection safeguards remain.
    The PR template records installed identity and selected keyboard or app.
    A PR comment and the owner-facing report record the post-merge refresh result or blocker without editing the merged PR body.
  - **Why:** the owner reported old apps after testing, despite the passing-build fix in divydvd/SmarType#498.
    Historical monitor grants required the old APK. The current monitor reports that it no longer does so.
    A baseline application case still restored an older APK under the shared instructions; no shared post-merge procedure existed.
  - **Check:** run `node scripts/check.mjs`, the eight device-handoff regression checks, skill application scenarios, and a temporary-home installation smoke test.
    Next weekly review: compare the final installed commit with the reported fetched default branch after authorized merges.
    Count blocked refreshes separately. An open instruction PR is not evidence that a device or existing session changed.
- **Baseline evidence:** seven instruction contracts failed before the change.
  The baseline application test restored the old APK after a pass and did not refresh after a merge.
- **Verification:** the seven contracts pass after the change.
  Five application cases and three edge cases retain passing builds, enforce refresh safeguards, and report blocked or superseded refreshes.
  A temporary Copilot home installed the local branch and discovered the core rule and all three plugin skills.
  These simulations test instructions, not a live device installation.
- **Independent review:** identified an unsupported attempt to edit a merged PR body.
  The new reporting-path contract failed first, then passed with the PR-comment procedure.
- **Rollout:** update the plugin on each execution host and refresh existing sessions.
  Project procedure changes and monitor state remain separate from this plugin release.

## 0.4.0 (2026-10-29)
- **Optional Graphify discovery.**
  - **What:** the dev-loop skill uses scoped graph queries when the project enables Graphify and needs cross-file discovery.
    The profile supplies the graph location, query, freshness check, and permitted local refresh.
    Freshness covers the checkout, commit, and working-tree inputs. Unknown freshness requires source search or a permitted refresh.
    Failed or incomplete graph queries lead to explicit source investigation. Graph results do not replace tests or approvals.
    The README explains the project setup. The plugin does not install Graphify or enable external processing.
  - **Why:** the owner installed Graphify in Smartype and approved optional shared guidance on 2026-10-29.
    Five baseline application cases already made safe choices when given a fully configured profile.
    However, the existing template had no Graphify contract; the required-field check failed before this change.
  - **Check:** run `node scripts/check.mjs`, a temporary-home installation smoke test, and skill application cases for fresh, stale, absent, incomplete, and failed graphs.
    Next weekly review: inspect Graphify projects for scoped queries, source confirmation, and explicit fallback reasons. No token savings are claimed yet.
- **Tested before release:** the five profile fields pass their contract check after failing before the edit.
  Eight simulated skill application cases selected safe actions, including unknown freshness, source changes, and query failure.
  The application test identified ambiguous stale-check wording; the final text separates reported staleness from checker execution errors.
  An independent review of the final guidance found no significant issue.
  A temporary Copilot home installed the local branch and discovered `dev-loop: core` and all three plugin skills.
- **Not changed:** core rules, approval gates, finish rules, application repositories, and Graphify installation.

## 0.3.1 (2026-10-25)
- **Test tool feedback in each PR.**
  - **What:** the PR template has a new "Test tool feedback" section: each gap of the test tool, each workaround (for example raw adb instead of the test tool) and why, and each unreliable step. `dev-loop` step 6 notes these facts. The project profile has a new "Test tool repo" fact. `infra-review` reads the section, measures "Device tests that needed a workaround", and opens a fix PR in the test tool repo when a gap has evidence.
  - **Why:** in SmarType, 111 of 119 merged PRs (2026-10-11..24) had a device test, but no PR reports a Verdict run. Agents used raw adb, because Verdict pastes text and has 5 keys. Nothing recorded these gaps, so nobody fixed Verdict. The owner asked for this feedback on 2026-10-25.
  - **Check:** next week, each SmarType PR with a device test has the section. The number of device tests with a workaround goes down after the Verdict fixes.
- **Not changed:** `core.mdc`. Rule 22 still names only the 3 "Dev-loop feedback" lines; the new section is in the template and the skill.

## 0.3.0 (2026-10-25)
The weekly infra review of SmarType (2026-10-18..24, 95 merged PRs) found these faults. Plan: `docs/superpowers/plans/2026-10-25-dev-loop-0-3-0.md`.

- **A mockup before the design approval.**
  - **What:** core rule 5 and `dev-loop` step 1: for a UI change, the agent shows a mockup of each changed screen, without an offer first. The mockup is one self-contained HTML file in the session files folder: before and after, light and dark themes, the real texts, colors, and sizes. The agent opens it in the browser canvas and puts its path in the plan and the PR body. The agent does not use the brainstorming visual companion.
  - **Why:** the owner asked for a mockup 3 times this week.
  - **Check:** next week, the owner does not ask for a mockup. Each UI PR body has a mockup path.
- **Size counts production code only, and the plan estimates it.**
  - **What:** core rule 11: tests, docs, and generated files do not count. The plan has a "Size estimate". Above 400, the plan has a stack of PRs, with a branch and a base for each PR. Self-review checks the size again. If the size is still too big, the agent writes in the Dev-loop feedback why the estimate was wrong.
  - **Why:** the median PR had 483 changed lines (115 the week before), and 60 of 95 PRs were over 400. Most of the size was tests. The owner chose "Tests do not count; production code 400 or fewer". Agents split only after the build.
  - **Check:** the infra-review table has the median of production lines. The target is 400 or fewer, and fewer PRs over 400.
- **Fewer pushes and review rounds, to save Actions minutes.**
  - **What:** core rule 20 and `dev-loop` step 7: push only to open the PR and once for each round. The limit is 2 rounds with fixes (was 3). The push with the round-2 fixes starts one more review: the agent reports its findings and does not push again. A failed check is a finding that the agent must fix. "Done" now needs the checks to pass at the head commit.
  - **Why:** in October, Actions used 4,376 Linux minutes. Copilot code review used 1,154 minutes in 422 runs (about 3.6 for each PR). The budget blocked CI and the review on divydvd/SmarType#323, #324, #325, and #356.
  - **Check:** the infra-review table has 2 new rows: "Actions minutes (Linux)" (lower than last week) and "Copilot reviews for each PR (mean)" (2 or fewer).
- **Infra review measures.** `infra-review` now collects the Actions minutes and the reviews for each PR, and counts PR size without tests.
- **Core trims** (to stay in the 15,000-byte always-loaded budget): rules 2, 3, 9, 15, and 17 are shorter, with the same meaning. A code review confirmed that no cut loses a meaning.
- **Tested before release** (skill test, fresh subagents, 3 scenarios: a UI design, a 450 + 450 line plan, and a push and round-3 case):
  - RED, with the 0.2.2 text: no mockup, tests count toward the size, a push after task A, and a fix and push in round 3.
  - GREEN round 1: 2 of 2 runs pass. The runs made the HTML mockup without a request, planned a stack at plan time, did not push after task A, and stopped after round 2. The control run made no mockup for a bug, planned one PR for 270 production lines, and ignored a "push often" request.
  - A code review found 4 gaps: the brainstorming offer, the stack bases, a conflict about the split, and red CI after the last round. All 4 are fixed. GREEN round 2: 4 of 4 scenarios pass (no offer before the mockup, PR 2 based on the PR 1 branch, a split after a wrong estimate, and red CI after round 2 reported as not done).
- **Not changed:** the Gradle lock, the lint baseline, the device-test skill, the release skill, and the CI triggers are SmarType facts. They are in SmarType PRs (see the PR body). The phone lease is in the local work-ledger extension, which is not in this repo.

## 0.2.2 (2026-10-22)
- **Record ledger evidence after the PR opens.**
  - **What:** `dev-loop` step 6 still verifies the committed head and writes each result with its commit. Step 7 records those results with `work_ledger_record` after PR creation. Each call supplies the PR number and the exact commit SHA. New results after review fixes use their own commits.
  - **Why:** the feedback in #3 reports 8 test runs that found the old order impossible. The API requires a PR number, but step 6 precedes PR creation. A fresh application test confirmed this contradiction before the edit.
  - **Check:** next week, no session attempts this API before its PR exists. Ledger evidence must name the commit that the check tested. The core rule and the always-loaded text do not change.

## 0.2.1 (2026-10-17)
- **Screenshots of a UI change in the PR body.**
  - **What:** the PR template has a new "Screenshots" section. For a UI change, the `dev-loop` skill now does these steps:
    - Step 6 takes a screenshot of each screen that the device test validates. The screenshots stay in a folder outside the repo.
    - Before the PR, step 7 checks each screenshot. The agent does not upload a screenshot that shows personal data or a secret, or a screenshot that it cannot check.
    - The section names each screenshot that the agent did not upload, and the reason, but not the data.
    - The agent uploads the other screenshots with `github-pr-media`. It puts them in an HTML table with `width="180"`, because Markdown images in a table show at full size.
    - A failed upload does not stop the task. The agent writes the reason in the section.
    - The agent does not commit the screenshots.
    - When a review fix changes a validated screen, the agent fills in the section again.
    - The step adds no stop, and `core.mdc` does not change.
    - In SmarType, L17 of `smartype-device-test` forbids the upload. divydvd/SmarType#323 changes this line.
  - **Why:** before the merge of divydvd/SmarType#303, the owner asked for the device screenshots, and the coordinator added 9 by hand. On 2026-10-17, the owner made the step a standing answer. This entry replaces the "Not changed" line of 0.2.0 about the screenshot step.
  - **Check:** each SmarType PR with a UI change has a "Screenshots" section with images. The owner does not ask for screenshots. No image in a PR shows personal data.
- **Tested before release** (skill test F, with fresh subagents):
  - The UI scenario: the SmarType feature divydvd/SmarType#263 at step 7. The screenshot of the signed-in screen (N1) shows an account name, an email address, and a photo.
  - The control scenario: a made-up fix in the Functions code, with no UI change and no device test.
  - RED, with the 0.2.0 text: 3 of 3 UI runs put no screenshot in the PR. Each run quoted `smartype-device-test`: "Never commit or upload them".
  - GREEN round 1 (the first draft and the new L17): 7 of 7 runs pass (5 UI, 2 control). Round 2 (the second draft): 3 of 3 runs pass (2 UI, 1 control). Each of the 7 UI runs did these steps:
    - It added S4, a pass at font scale 1.5, because `smartype-device-test` asks for it. The scenario had only S1–S3 and N1.
    - It uploaded S1–S4 with `github-pr-media` before the PR, and put them in the table with `width="180"`.
    - It did not upload N1, and it named the type of data.
    - It committed no screenshot, uploaded no log, and asked the owner nothing new.
  - The 3 control runs wrote "none: <reason>", uploaded nothing, and ran no device test.
  - Round 1 found 2 unclear points: what to do with the example table for a change without UI, and whether the upload needs a PR. The second draft answers both. The 3 runs of round 2 did not ask about them again.
  - An independent review of the branch found 2 Important gaps. The text had no safe default for a screenshot that the agent cannot check, or for a secret. The screenshots could become old after a review fix. The final text fixes both.
  - GREEN round 3 (the final text): 2 of 2 runs pass. In total, 12 of 12 GREEN runs pass.
    - g8: the agent did not upload a screenshot that it could not check. A notification banner was on it, and the agent could not read the text. An upload failed 2 times. The agent wrote the reason in the section, and it opened the PR.
    - g9: a review fix changed a validated screen. The agent took the screenshots of the new device test, checked them, and uploaded them again. It updated the commits in the Evidence table.
  - The merge order (one run for each state). With only the new dev-loop text, or with only the new L17, the agent uploaded the 4 safe screenshots. It left out N1, uploaded no log, and did not stop. With only the new L17, the images showed at full size, and the agent had no safe default for a screenshot that it cannot check.
  - The install loads the rule and the 3 skills.

## 0.2.0 (2026-10-15)
The first weekly review. It covers the setup week and the 2-task trial in `divydvd/SmarType`: PR #296 (bug #287) and PR #303 (feature #263). The PR of this version has the measures table and the changes that the review did not make, with the reasons.

- **Rule 7: inline execution for small plans, and a review for each task in a risky area.**
  - **What:** core rule 7 and `dev-loop` steps 2 and 3. Use `executing-plans` for 6 tasks or fewer, also with tasks in a risky area. Use subagent-driven development only for bigger plans. After each task in a risky area, get one independent review. If a review subagent fails, start it again once. If it fails again, write the task in the new "Not reviewed" line of the PR template. Do not put your own review in its place.
  - **Why:** in PR #303, 1 of 4 plan tasks touched a risky area (`AuthScreen.kt`), so the old rule 7 sent the whole plan to subagent-driven development. The session started 10 subagents (claude-opus-5.5, about 41M tokens), also for a docs-only task. It made 712 model calls and cost about 7.3e12 nanoAIU, 4.5 times PR #296 (inline, 278 model calls, 1.62e12 nanoAIU). The review subagent of the risky task failed after 2 h 34 min, and the main agent then reviewed that task itself.
  - **Check:** the mean model calls for each merged PR go down from 495 (the trial). Each task in a risky area has a review result or a "Not reviewed" line. No session puts its own review in the place of a failed review.
- **A size limit for `AGENTS.md`, and a measure of the always-loaded text.**
  - **What:** the profile template and the README say: keep `AGENTS.md` at 5.5 KB or less, and put long references in a project skill or in `docs/`. `infra-review` measures the always-loaded text. The target is 15 KB or less.
  - **Why:** each trial session loaded about 27 KB of text, and the target was about 15 KB: the SmarType `AGENTS.md` 18.2 KB, the core rules 4.1 KB, the owner preferences 2.0 KB, and the Superpowers start text 3.2 KB. Nothing limited the size of the profile. With the 0.2.0 core rules (4.3 KB), 15 − 4.3 − 2.0 − 3.2 = 5.5 KB is left for `AGENTS.md`.
  - **Check:** after the SmarType PR of this review, the always-loaded text of a SmarType session is 15 KB or less. The safety rules for billing, entitlements, and managed AI usage stay in `AGENTS.md`.
- **Keep the context small, and measure the model calls.**
  - **What:** a new section in `dev-loop`. Find code with a search first. Read about 150 lines or fewer in each read, also with `cat` or `sed`. Do not read a whole file of more than about 300 lines. Write the facts that you need again in the plan or the ledger. After a compaction, continue from them, and read again only the lines that the next step needs and the notes do not give. `infra-review` measures the mean model calls for each merged PR.
  - **Why:** most of the context was file reads, and most file reads read a file again. Here, "characters" are the tool output that the model read (`result.content` in `events.jsonl`), and a file read is a `view` or a `cat`, `sed`, `head`, or `awk` of a file.
    - The PR #296 session read 450K characters. File reads were 61% of them, and 43% of the file-read characters read a file again. It compacted 5 times.
    - The PR #303 session read 2.35M characters (main agent 0.96M, subagents 1.39M). File reads were 71%, and 78% of the file-read characters read a file again: `Routes.kt` 34 times, `HomeScreen.kt` 27 times, and `AuthScreen.kt` 17 times. Reads of more than 8,000 characters (about 200 lines) were 45% of the file-read characters. The session compacted 17 times.
    - The plan phase of PR #303 read 514K characters before the first subagent, compacted 4 times, and cost about 1.03e12 nanoAIU.
  - **Check:** each task session compacts fewer times than in the trial (5 for a bug, 17 for a feature). The share of file-read characters that read a file again goes down from 43% (bug) and 78% (feature).
- **Not changed:** the screenshot step for UI changes had 1 request (PR #303), about 12 minutes of rework, and no bad merge or lost hour. The review adds it at the second request, or when the owner asks for it. The trial median PR size was 322 changed lines of code, which meets the target of 400 or fewer.
- **Tested before release** (Copilot CLI 1.0.97, Superpowers 7.0.0, fresh subagents that read the 0.1.0 text or the 0.2.0 text, and a temporary Copilot home):
  - Rule 7: with the #263 plan (4 tasks, Task 3 in `app/auth`), 5 of 5 runs chose `executing-plans` and 1 review for Task 3. The old text has no test run: the PR #303 session followed it.
  - A failed review: the review subagent of the risky Task 3 fails. With the old text, 3 of 3 runs skipped the review of that task ("the final review covers it"). With the new text, 5 of 5 runs started it again once, and then wrote the "Not reviewed" line.
  - Reading: collect the plan facts from `HomeScreen.kt` (535 lines) and `Routes.kt` (557 lines). All 6 runs found the same facts. With the old text, 3 of 3 runs read each file in parts of about 270 lines, read parts again with `cat` or `sed`, and did not search first. With the new text, 3 of 3 runs searched first and made no read of more than 150 lines. The file reads went down from a mean of 77.7K to 21.2K characters, and all tool output from 95.4K to 62.3K characters.
  - Reading after a compaction (after the PR review): the self-review must check 3 callers, and the ledger does not have their code. All 6 runs searched first, read only the callers, and kept each read at 150 lines or fewer. With the first draft of this section ("Read a file again only for the lines that you will change"), 3 of 3 runs said that the sentence forbids the check, and 1 run asked the owner to decide. With the new text, 0 of 3 runs found a conflict.
  - The install loads the new rule 7 and the 3 skills.

## 0.1.0 (2026-10-13)
- **What:** the first version. The core rules, the `dev-loop`, `flow-docs`, and `infra-review` skills, the templates, and the check script.
- **Why:** the owner repeated the same basic instructions in many sessions. Kickoffs were about 4.5 KB, and the median PR changed 687 lines.
- **Check:** a trial on 1 bug and 1 feature in SmarType. Targets: one-line kickoffs, no repeated basic instructions, 3 or fewer owner messages before the PR, and evidence at the head commit.
- **Tested before release** (Copilot CLI 1.0.97, Superpowers 7.0.0, a temporary Copilot home): the check script finds 5 planted faults. The install loads the rule and the 3 skills. The repo setting turns on both plugins only in a trusted folder. A typo takes the trivial route. A bug gets a failing test before the fix. A small feature stops for one design question, with the recommended choice first. The first feature test found that the agent skipped the design stop and the self-review for a small feature, so rules 3 and 5 and the skill now say that small changes do not skip them.

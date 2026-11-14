---
name: infra-review
description: Use when reviewing the dev-loop setup each week, investigating recurring agent failures, or improving the development process.
---

# Infra review

You improve the setup, not the product. One run covers the last 7 days. The output is at most one PR in `divydvd/dev-loop` and at most one PR in each project repo and in each test tool repo. You never merge.

## 1. Collect
1. Run `copilot plugin update dev-loop@dev-loop`, so that you review the current core.
2. Find the project repos: each repo that the owner lists, or that has `"dev-loop@dev-loop": true` in `.github/copilot/settings.json`.
3. For each project repo, list the merged PRs of the week:
   `gh pr list -R <repo> --state merged --search "merged:>=<YYYY-MM-DD>" --limit 100 --json number,title,url,body,mergedAt,headRefOid,headRefName,files`
   Read the "Dev-loop feedback" and the "Test tool feedback" sections of each body.
4. If the `session_store_sql` tool is available, read the sessions of the week for these repos. Find:
   - owner messages that repeat a basic instruction (device test, small PRs, no rebase, simple code, docs, parallel work, status requests);
   - sessions that ended "blocked", or that tried the same fix again;
   - fix-up PRs: a PR that fixes or reverts a PR of the last 14 days.
5. Read `CHANGELOG.md` in `divydvd/dev-loop`: the recent changes, and the check for each one.
6. Compare the installed Superpowers version with its latest release (`gh release list -R obra/superpowers --limit 3`). Read the release notes of a new version.

## 2. Measure
Put this table in each report. Fill the "This week" column from the data of section 1. For the "Last week" column, do steps 3 and 4 of section 1 again for the 7 days before. In step 3, search with `merged:<YYYY-MM-DD>..<YYYY-MM-DD>`. Use these results only in this table. If a measure has no data, for example because the `session_store_sql` tool is not available, write "n/a" in its cell. Do not estimate.

| Measure | This week | Last week | Target |
| --- | --- | --- | --- |
| Merged PRs | | | — |
| Median PR size (changed lines of production code) | | | 400 or fewer |
| Always-loaded text (KB) | | | 15 or less |
| Model calls for each merged PR (mean) | | | lower than last week |
| PRs with evidence at the head commit | | | all |
| PRs that changed a flow and its doc | | | all |
| PRs with filled Dev-loop feedback | | | all |
| Owner messages that repeat a basic instruction | | | 0 |
| Owner messages before the PR (real doubts not counted) | | | 3 or fewer |
| Fix-up PRs | | | 0 |
| Actions minutes (Linux), all project repos | | | lower than last week |
| Copilot reviews for each PR (mean) | | | 2 or fewer |
| Device tests that needed a workaround | | | lower than last week |
| Substantive PRs with complete independent review evidence | | | all |
| Owner reminders to request independent review | | | 0 |
| Confirmed findings from independent review | | | observe, not a quota |
| Independent review model calls and elapsed time | | | observe cost and delay |

Use the `gh pr list` data from section 1 to compute the PR measures:
- PR size: add the `additions` and `deletions` of the production code files in `files`. Do not count tests, docs (`*.md`, `docs/`), or generated files.
- Actions minutes: list the runs of the week with `gh api --paginate "repos/<repo>/actions/runs?created=<from>..<to>&per_page=100"`. For each run, read `billable.UBUNTU.total_ms` from `gh api repos/<repo>/actions/runs/<id>/timing`, and add these values. This counts each Linux job, also parallel jobs. Do not use the elapsed time of a run. Name the 2 workflows that used the most minutes. If the timing data is not available, write "n/a" and the reason.
- Copilot reviews: use the merged PRs of the week. For each PR, count the runs named "Running Copilot Code Review" on its head branch: `gh api --paginate "repos/<repo>/actions/runs?branch=<headRefName>&per_page=100"`. Divide the total by the number of these PRs. If the week has no merged PRs, write "n/a".
- Device tests that needed a workaround: a PR has a device test when its Evidence has a device test row that is not "not needed". N is the PRs in M whose "Test tool feedback" has a `workaround` line for a device test scenario. Write it as "<N> of <M>": M is the PRs with a device test that have the section. Add the number of PRs without the section, for example "6 of 8 (2 without the section)". Compare the ratio N/M with last week. If last week has M = 0, write "n/a" for last week.
- Evidence at the head commit: the Commit cell of each Evidence row is the first 7 characters of `headRefOid`.
- A flow and its doc: when `files` has a key file of a flow doc, `files` also has that flow doc.
- Independent review coverage: check reviewer identity, reviewed content, scope, verdict, findings disposition, and later-change coverage in each PR body.
  Exclude only PRs with a justified harmless spelling or formatting exemption. Missing evidence does not prove no review occurred; report it as missing.
- Independent review reminders: count explicit owner requests from the session history. Do not count reviewer assignments or agent messages as owner requests.
- Confirmed independent findings: count findings confirmed in source and addressed or explicitly deferred. Keep them separate from automatic findings and repeated reports.
- Review cost and delay: use identifiable independent reviewer calls and their observed start/end times. Report model calls and elapsed time separately.
  If attribution or timing is unavailable, write "n/a" with the reason. Do not infer review cost from the whole session's cost.

Compute the session measures from the files on this Mac. 1 KB is 1,000 bytes. Round to one decimal.
- Always-loaded text: add the sizes of the instruction files that load in each project session, and of the Superpowers start text. `copilot instruction list` in a project checkout shows the instruction files: today the project's `AGENTS.md`, `com.github.copilot/rules/core.mdc`, and `~/.copilot/copilot-instructions.md`. Take the size of `AGENTS.md` on the default branch. The Superpowers start hook loads `skills/using-superpowers/SKILL.md` of the installed Superpowers in each session.
- Model calls: find the task session of each merged PR. Look only at the sessions whose `~/.copilot/session-state/<id>/workspace.yaml` names the project repo. Of these, the task session has the most lines with the PR URL in its `events.jsonl`. In this `events.jsonl`, count the `assistant.turn_start` and `session.compaction_start` events. The file also has the events of the subagents.

### Shadow-mode objective telemetry
Keep the 17-row table above unchanged. In addition, run the read-only collector from the `dev-loop` checkout in **shadow mode** (log and report only; do not block work):
`node <dev-loop-checkout>/scripts/collect-metrics.mjs --repo <repo> --checkout <project-checkout> --from <from-ISO> --to <to-ISO> --target-ref <ref-at-to>`
Supply `--prs-file <path>` when merged PR JSON (including `mergeCommit` and `commits`) is already saved locally. Include at least 21 days of merged PRs in `--prs-file` so the `[from - 14d, to - 14d]` mature cohort exists. For historical windows ("Last week"), pass `--target-ref <commit-at-to>` on the default branch instead of `HEAD`.

Include its shadow-mode summary alongside the main table and apply these exact rules:
- **14-day production line survival:** evaluate mature PRs merged **14 days or more before `--to`** (`mergedAt <= to - 14d`). Count added production lines from `git diff` that still blame to that PR's commits at `--to` (`HEAD`). Do not exclude a 16-day-old PR as outside the window; a PR needs at least 14 days on the default branch to measure 14-day survival.
- **14-day fix-up PRs (reference + blame churn):** count a fix or revert PR merged within 14 days of an earlier PR when its text references `#<N>` **or** when `git blame` shows the bug-fix PR rewrote production lines introduced by that earlier PR within 14 days, even when the PR body omits `#<N>`.
- **Ledger + docs-only Git ancestry verification:** keep literal 7-character table matching in the main table's `PRs with evidence at the head commit` row. Separately report `work-ledger` + docs-only Git ancestry verification: a PR is verified when `headRefOid` has passing `work-ledger` evidence, when the PR has zero changed production lines, or when a first-parent ancestor `<tested-sha>` has passing `work-ledger` evidence and `git diff --name-only <tested-sha> <headRefOid>` contains only non-production paths (`docs/`, `*.md`). Check that post-test diff rather than the whole PR file list: earlier production files already inside `<tested-sha>` remain tested. Reject ancestry verification when `git diff --name-only <tested-sha> <headRefOid>` contains a production path.
- **Task-route buckets and shared-session ambiguity:** classify each PR by production diff lines and plan tasks into `trivial` (`0` production lines), `small` (`1–120` production lines and fewer than 4 plan tasks), or `multi-task` (`> 120` production lines or 4+ plan tasks). Read `totalNanoAiu` from the **latest** `session.usage_checkpoint` or `session.shutdown` event (never sum checkpoints). When two or more PRs map to the same session, mark per-PR session cost, speed, and turn attribution as `ambiguous` (`excluded from per-PR cost/speed`) and report the session total once instead of splitting or duplicating it across route medians.
- **Active work time, 5 bottleneck buckets, and parallelism:** compute `activeSec` from merged active intervals in `events.jsonl`, excluding `humanWaitSec` (`ask_user` and `relay_session_input` waits) and between-turn idle or sleep gaps. Split active work into five buckets: `modelSec` (main-agent LLM turns and compactions), `buildTestSec` (builds, unit/lint checks, and device runs), `pollSec` (GitHub check and review `sleep` polling), `subagentSec` (delegated subagent runs), and `ioOtherSec` (file search, read, edit, and other tools). Report each route's `medianActiveSec`, `dominantBottleneck` (largest active-time bucket share), and `medianParallelism` (`parallelismFactor`: summed tool seconds divided by merged clock tool seconds; `1.00x` means serial execution).

## 3. Find the faults
- Group the feedback lines and the signals by cause.
- A fault needs evidence: 2 or more occurrences, or 1 occurrence that caused a bad merge or a lost hour.
- Name the cause in one line: a missing rule, a wrong rule, a rule that agents ignore, a skill conflict, a missing profile fact, a missing flow doc, or a test tool gap.
- Check the changes of last week. If the fault did not stop, revert or replace the change.

### Classify the improvement layer
The layer identifies where the fix belongs. It does not prove the failure's cause.
Keep product/tool/environment/unknown diagnosis in the task's existing failure handoff.

| Layer | Evidence to inspect | Fix at this layer |
| --- | --- | --- |
| Environment | Missing tools, access, permissions, saved state, or usable context | Repair the capability or state; preserve access approvals. |
| Verification | Weak checks, repeated failed attempts, or completion without evidence | Repair the check, feedback, or bounded recovery procedure. |
| Coordination | Overlapping scopes, false dependencies, duplicate work, or invalid evidence reuse | Repair scope ownership, dependencies, or result-validity checks. |

Record one primary layer for each fault. Add a secondary layer only when incident evidence supports it.
If the layer or cause is unknown, record the gap and the next diagnostic check.
Do not force a category or infer a tool defect from an unrun product case.

Use this record for each proposed fix:

| Primary layer / secondary | Incident references and observed result | Cause / unknowns | Proposed fix and location | Measurable expected result |
| --- | --- | --- | --- | --- |
| Environment / none | E1/E2: required logs inaccessible | Access prerequisite absent; deeper cause unknown | Project profile: authorized evidence source and access prerequisite | Next week's affected sessions identify unavailable access before dependent checks; zero unauthorized attempts. |

Use actual incident references, not example IDs. State the observation period and an observable target.
Preserve the fault threshold above. A category alone is not evidence that a change is needed.

## 4. Choose the changes
- Choose at most 3 changes. Start with the change that has the most evidence.
- Apply constrained optimization from the shadow-mode telemetry:
  - **Quality floor (`90.0%`):** When `Durable first-pass yield` has `status: ok`, is below `90.0%`, and meets Section 3's fault threshold (`2` or more occurrences, or `1` occurrence that caused a bad merge or a lost hour), prioritize durability, verification, or environment fixes ahead of cost or speed reductions. Do not treat `n/a` or `unavailable` statuses or a single non-severe miss below Section 3's threshold as a confirmed fault.
  - **Route-bucketed cost and speed priority:** When `Durable first-pass yield` is `90.0%` or higher (or no durability/verification fault meets Section 3's threshold), inspect routes (`trivial`, `small`, or `multi-task`) with **2 or more unique sessions**. Target the route with the highest recurring token waste (median `totalNanoAiu`, `modelCalls`, or `duplicateReadRate`) or recurring active-time delay (`medianActiveSec` driven by its `dominantBottleneck`—`modelSec`, `buildTestSec`, `pollSec`, `subagentSec`, or `ioOtherSec`—or serial `1.00x` `parallelismFactor` across independent tool/subagent calls). Never treat `humanWaitSec` (`ask_user` waits) or raw wall-clock duration as agent delay, and never cut mandatory tests or safety gates to lower `activeSec`.
  - **4-week non-safety check cleanup:** Propose to remove or automate any non-safety manual check or non-safety PR template line that records zero confirmed findings or prevented regressions across **4 consecutive** observed weekly reviews. Exclude `n/a` or `unavailable` weeks from that 4-week count. Never prune mandatory safety gates (`core.mdc` design approval, risky-plan review, independent PR review, typed merge or deployment approval, device/data safeguards, or protected Git history guards).
- Inspect the [rule/check map](../../README.md#rulecheck-map) before adding instructions or an automatic check.
  Record the existing enforcement point, regression test, and known limitation for each selected rule.
  Distinguish an instruction, a structural CI check, and a runtime guard.
  Verify live guard activation separately; source presence or passing source tests do not establish it.
  Prefer an executable check for a mechanical constraint. Keep judgment in the instructions.
  Update the existing map when a selected rule's check or limitation changes; do not create a second inventory.
- Prefer to fix or remove a rule. Add a rule only when no current rule covers the fault.
- Put a project fact in the project profile. Put a generic rule in the core.
- Keep `com.github.copilot/rules/core.mdc` at 60 lines or fewer. `node scripts/check.mjs` checks it.
- If a Superpowers skill causes the fault and a rule cannot steer it, propose to turn the skill off with `disabledSkills` and to add our own skill. Do not change Superpowers.
- A new automatic check runs in shadow mode for a week first: it logs, and it does not block.

## 5. Output
- **Core PR** in `divydvd/dev-loop`: bump the version in `plugin.json` and in `.github/plugin/marketplace.json`. Add a `CHANGELOG.md` entry: what changed, the evidence, and the check for next week. Run `node scripts/check.mjs`.
- **Project PR** in each project repo that needs a change: the profile, a project skill, or a flow doc.
- **Test tool PR** in the repo that the profile names as "Test tool repo", for a test tool gap with evidence. Prefer a fix in the test tool to a new workaround in a project skill.
- Open each PR from a checkout of its repo. In the app, start a child session for each other repo.
- Each PR body has the measures table, the faults with links to the evidence, the changes, and the changes that you did not make, with the reason.
- Include each proposed fix's layer, incident references, and measurable expected result from section 3.
- If nothing needs a change, open no PR. Send the owner only the measures table.
- Report to the owner: the PR links and one line for each change. After a core PR merges, run `copilot plugin update dev-loop@dev-loop`.

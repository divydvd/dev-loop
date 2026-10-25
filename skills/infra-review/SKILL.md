---
name: infra-review
description: Use for the weekly review of the dev-loop setup, or when the owner asks to improve the dev loop. Collects the Dev-loop feedback from merged PRs and the signals from the week's sessions, finds the faults in the setup, and opens small improvement PRs.
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

Use the `gh pr list` data from section 1 to compute the PR measures:
- PR size: add the `additions` and `deletions` of the production code files in `files`. Do not count tests, docs (`*.md`, `docs/`), or generated files.
- Actions minutes: list the runs of the week with `gh api --paginate "repos/<repo>/actions/runs?created=<from>..<to>&per_page=100"`. For each run, read `billable.UBUNTU.total_ms` from `gh api repos/<repo>/actions/runs/<id>/timing`, and add these values. This counts each Linux job, also parallel jobs. Do not use the elapsed time of a run. Name the 2 workflows that used the most minutes. If the timing data is not available, write "n/a" and the reason.
- Copilot reviews: use the merged PRs of the week. For each PR, count the runs named "Running Copilot Code Review" on its head branch: `gh api --paginate "repos/<repo>/actions/runs?branch=<headRefName>&per_page=100"`. Divide the total by the number of these PRs. If the week has no merged PRs, write "n/a".
- Device tests that needed a workaround: count the PRs with a device test whose "Test tool feedback" names a workaround. Write it as "<N> of <M>": M is the PRs with a device test that have the section. Add the number of PRs without the section, for example "6 of 8 (2 without the section)". Compare the ratio N/M with last week.
- Evidence at the head commit: the Commit cell of each Evidence row is the first 7 characters of `headRefOid`.
- A flow and its doc: when `files` has a key file of a flow doc, `files` also has that flow doc.

Compute the session measures from the files on this Mac. 1 KB is 1,000 bytes. Round to one decimal.
- Always-loaded text: add the sizes of the instruction files that load in each project session, and of the Superpowers start text. `copilot instruction list` in a project checkout shows the instruction files: today the project's `AGENTS.md`, `com.github.copilot/rules/core.mdc`, and `~/.copilot/copilot-instructions.md`. Take the size of `AGENTS.md` on the default branch. The Superpowers start hook loads `skills/using-superpowers/SKILL.md` of the installed Superpowers in each session.
- Model calls: find the task session of each merged PR. Look only at the sessions whose `~/.copilot/session-state/<id>/workspace.yaml` names the project repo. Of these, the task session has the most lines with the PR URL in its `events.jsonl`. In this `events.jsonl`, count the `assistant.turn_start` and `session.compaction_start` events. The file also has the events of the subagents.

## 3. Find the faults
- Group the feedback lines and the signals by cause.
- A fault needs evidence: 2 or more occurrences, or 1 occurrence that caused a bad merge or a lost hour.
- Name the cause in one line: a missing rule, a wrong rule, a rule that agents ignore, a skill conflict, a missing profile fact, a missing flow doc, or a test tool gap.
- Check the changes of last week. If the fault did not stop, revert or replace the change.

## 4. Choose the changes
- Choose at most 3 changes. Start with the change that has the most evidence.
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
- If nothing needs a change, open no PR. Send the owner only the measures table.
- Report to the owner: the PR links and one line for each change. After a core PR merges, run `copilot plugin update dev-loop@dev-loop`.

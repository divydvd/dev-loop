# Changelog

Each entry says what changed, why (the evidence), and how the next weekly review checks that the change helped.

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

# Changelog

Each entry says what changed, why (the evidence), and how the next weekly review checks that the change helped.

## 0.2.1 (2026-10-17)
- **Screenshots of a UI change in the PR body.**
  - **What:** the PR template has a new "Screenshots" section. `dev-loop` step 6 keeps a screenshot of each screen that the device test validates, in a folder outside the repo. Before the PR, step 7 leaves out each image that shows personal data, uploads the other images with `github-pr-media`, and puts them in an HTML table with `width="180"`. Markdown images in a table show at full size. The agent does not commit the images. The step adds no stop, and `core.mdc` does not change.
  - **Why:** before the merge of divydvd/SmarType#303, the owner asked for the device screenshots, and the coordinator added 9 by hand. On 2026-10-17, the owner made the step a standing answer. This entry replaces the "Not changed" line of 0.2.0 about the screenshot step.
  - **Check:** each SmarType PR with a UI change has a "Screenshots" section with images. The owner does not ask for screenshots. No image in a PR shows personal data.
- **Tested before release** (fresh subagents, skill test F: the SmarType feature divydvd/SmarType#263 at step 7, with 4 validated screens; the image of the signed-in screen shows an account name, an email address, and a photo):
  - With the 0.2.0 text, 3 of 3 runs put no screenshot in the PR. Each run quoted `smartype-device-test`: "Never commit or upload them".
  - With the new text and the new line in `smartype-device-test`, 10 of 10 runs pass. 7 UI runs put the 4 other images in the table with `width="180"`, leave out the signed-in image and name the type of data, upload with `github-pr-media` before the PR, commit no image, upload no log, and ask the owner nothing new. 3 Functions-only runs (the SmarType fix divydvd/SmarType#288) write "none: <reason>", upload nothing, and run no device test.
  - Round 1 found 2 unclear points: what to do with the example table for a change without UI, and whether the upload needs a PR. The final text answers both, and the 3 runs of round 2 did not ask about them again.
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

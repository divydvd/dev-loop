---
name: dev-loop
description: Use first for each feature, bug fix, or code change in a repo that uses the dev loop, also when you continue one. Load it before brainstorming, systematic-debugging, or test-driven-development. Runs the full loop from one line of input - context, route, plan with an acceptance record, build, flow docs, self-review, verify with evidence, PR, and report.
---

# Dev loop

The owner states a task in one line. You run the full loop without more instructions. The core rules (`dev-loop: core`) apply at each step. Superpowers skills do most of the steps. This skill connects them, and it adds the acceptance record, the evidence, the flow docs, and the feedback.

Do not skip a step because a change looks small. Each route below says which steps it skips.

## Before you start
- Read `AGENTS.md`. Find its dev-loop profile: commands, test tiers, heavy builds, the device test, risky areas, and the review checklist. If the profile is missing, tell the owner, and propose one from `assets/project-profile.md`.
- If the repo has `docs/flows/INDEX.md`, read it and the flow docs for the area. Use the `flow-docs` skill. If the profile says that the repo has no flow docs, skip the flow-doc work in each step.
- To resume a task, find its plan in `docs/superpowers/plans/`. Read the plan, its ledger (`.superpowers/sdd/<plan>/progress.md`) if it has one, and `git log`. Do not do the done tasks again.

## Keep the context small
Each compaction costs model calls and loses facts. Do these steps in each phase.
- Find code with `grep` or a code search first. Then read only the lines that you need: about 150 lines or fewer in each read. Do not read a whole file of more than about 300 lines. These limits also apply to `cat`, `sed`, and `head` in a shell.
- Write the facts that you will need again (paths, line numbers, signatures, rulings) in the plan or the ledger. Do not read a file again for a fact that you already have. If the file changed after you wrote the fact, find the fact again with `grep`.
- After a compaction, continue from these notes. Read again only the lines that the next step needs and the notes do not give. Examples are the text to change and the code to check or debug.

## 1. Route
- **Feature or behavior change, also a small one:** use `brainstorming`. Put the facts from the profile, and from the flow docs if the repo has them, into your questions. Do not write code before the owner approves the design.
  - For a UI change, make a mockup before you ask for the design approval. Do not wait for the owner to ask for it, and do not offer it first. Do not use the brainstorming visual companion. Make one self-contained HTML file (inline CSS and JavaScript, no network) in the session files folder. Show each changed screen, before and after, in the light and dark themes. Use the app's real texts, colors, and sizes from the code. Open the file in the browser canvas with a `file://` URL, and put its path in the plan and the PR body.
  - For a small feature (one area, 3 tasks or fewer), show a design of 2–5 lines and ask one question, with your recommended choice first. After the approval, save the acceptance record (`assets/acceptance-record.md`) as the plan, in `docs/superpowers/plans/<YYYY-MM-DD>-<topic>.md`. Then build it with `test-driven-development`. Do not use `writing-plans`. Copy the record into the PR body.
  - For a bigger feature, write a plan (step 2) after the approval.
- **Bug:** use `systematic-debugging`. Reproduce the bug, find the root cause, and write a test that fails because of the bug.
  - If the fix is in one area and has 3 tasks or fewer, save the acceptance record (`assets/acceptance-record.md`) before you write the fix. Save it as the plan, in `docs/superpowers/plans/<YYYY-MM-DD>-<topic>.md`. Then fix it with `test-driven-development`. Do not use `writing-plans`. Copy the record into the PR body.
  - If the fix is bigger, write a plan (step 2).
- **Trivial change** (no change in behavior: text, a comment, a typo): make the change, and go to step 4. In step 6, run only the fast checks. A config change that changes behavior is a behavior change.
- **Question:** answer with evidence (paths, commands, and results). Do not change code.
- **Big work** (more than about 3 PRs): you are the lead. Split the work into a stack of PRs, with one child session for each PR. Use the `pr-stack` and `orchestrate` skills when they are available. Review each child PR before you report.

## 2. Plan
- Use `writing-plans`. Put the acceptance record (`assets/acceptance-record.md`) at the top of the plan.
- Make tasks of 2–5 minutes. Mark the tasks that can run in parallel.
- Estimate the changed lines of production code for each task, and fill in the "Size estimate" of the acceptance record. Tests, docs, and generated files do not count. If the total is more than 400, split the plan into a stack of PRs now, with one concern for each PR. Give each PR its own branch, made from the branch of the PR before it. Name each branch and its base in the plan. Split now, before the build.
- If a task touches a risky area from the profile, mark the task and the plan "risky". Wait for the owner's plan review only then.
- Choose the execution method from the core rules. Do not ask.

## 3. Build
- Follow `executing-plans` or `subagent-driven-development`, as core rule 7 says. Use test-driven development.
- With `executing-plans`, after each task in a risky area, get one independent review: use `requesting-code-review` for the commits of that task. Give the reviewer the task, the acceptance record, and the review checklist. Before the next task, fix the findings that pass `receiving-code-review`. `subagent-driven-development` already reviews each task.
- If a review subagent fails, here or in step 5, start it again once. If it fails again, do not put your own review in its place. Write the task or the branch in the "Not reviewed" line of the PR body, and name it in the report.
- Run independent tasks and research in parallel. Run only one heavy build at a time, with the profile's commands.
- When the plan does not answer a question, decide it, and record the ruling in the ledger.

## 4. Flow docs
- Skip this step when the profile says that the repo has no flow docs.
- Otherwise, use `flow-docs`. Update the doc of each flow that you changed, in the same PR. Add each new pitfall and invariant.

## 5. Self-review
Do this step for each code change, also a small one.
- Do a "simplify" pass. Remove the code, flags, and abstractions that the goal does not need.
- Check the change against the acceptance record and the profile's review checklist.
- For a change with a plan from step 2, also use `requesting-code-review`, or the final whole-branch review of the execution skill. Give the reviewer the acceptance record and the review checklist.
- Check each finding with `receiving-code-review`. Fix the Critical and Important findings that pass this check. List the other findings in the PR body, with the reason.
- Check the size with `git diff --stat <base>...HEAD`. Count only production code: not tests, docs, or generated files. If it is still more than about 400 lines, split it, and write in the Dev-loop feedback why the estimate was wrong.

## 6. Verify
Commit all changes first. Do this step after the last commit to the branch, so that all evidence is at the head commit.
- Run the test tier for each changed area. Read the output.
- If the profile says that the change needs a device test, run it yourself: install the build, run the scenario, record the result, and restore the device. Ask the owner only when no device is connected or a step needs a sign-in.
- For a UI change, take a screenshot of each screen that the device test validates. Keep the screenshots in a folder outside the repo.
- Write each result as evidence: `<check>: <command or scenario> → <result> at <sha7>`.
- If a check fails, fix the cause, do steps 4 and 5 for the fix, and run this step again.
- Use `verification-before-completion` before you say "done".

## 7. Ship
- For a UI change, fill in the "Screenshots" section of the PR body before you open the PR:
  - Look at each screenshot. Do not upload a screenshot that shows personal data or a secret. If you cannot look at it, or you are not sure, do not upload it.
  - Personal data is a name, an email address, a phone number, an account photo, or private text. A secret is a password, a token, a key, or a one-time code.
  - In the section, name each screenshot that you did not upload, and the reason. Do not write the data.
  - Upload the other screenshots with the `github-pr-media` skill. The upload needs only the repository id, not a PR. Do not add the Markdown image lines of that skill. Put each URL in the table.
  - If an upload fails, write the reason in the section. Do not stop for this.
  - Do not commit the screenshots.
- Each push starts CI and a Copilot review, and both cost Actions minutes. Do not push the branch before this step. Push once to open the PR, and then once for each review round.
- Push the branch, and open a PR with a body from `assets/pr-body.md`. Fill in the evidence and the Dev-loop feedback.
- After the PR opens, if `work_ledger_record` is available, record each result from step 6 with the PR number and its exact commit SHA (kind `validated` or `device_tested`). Record new results after each review fix.
- After each push, wait for the checks and for the automatic review of the head commit. `gh pr checks` does not show Copilot code review. Find its check run, `copilot-pull-request-reviewer`, in `gh api repos/{owner}/{repo}/commits/<sha>/check-runs`. The review starts 1 minute or less after the push, and it can take 5 minutes. If no review starts in 2 minutes, the repo has no automatic review.
- A failed check is a new finding that you must fix. Fix it in the push of the round. If the round limit stops you, report the failed check to the owner.
- Do review rounds. Read each new finding, in the review threads and in the review text. Check it as in step 5. When a finding asks only for evidence, get the evidence, and do not change code for it. Reply in its thread with your change or your reason, and resolve the thread.
- Put all the fixes of a round in one push. Before the push, do steps 4 to 6 for the fixes. Then update the PR body. If a fix changes a validated screen, fill in the "Screenshots" section again.
- Stop the rounds when a round has no new finding that you must fix. A repeat of a rejected finding is not new. Do not push only to get a clean review. After 2 rounds with fixes, stop, and report each open finding to the owner, with your verdict. The push with the round-2 fixes starts one more review: read it and report its findings, but do not push again.
- Do not merge.

## 8. Report
Send the owner one short message:
```
PR #<N> is ready: <one-line summary>.
Evidence: <tests> passed; device test <passed | not needed> at <sha7>.
Please check: <the one or two things that only a person can check>.
```

## Stop conditions
- **Done:** each "done when" item has evidence at the head commit, the PR is open, the checks pass at the head commit, and the review rounds stopped.
- **Blocked:** 3 failed fixes, missing access, no device, or a product decision that the repo does not answer. Stop. Report what you tried, the evidence, and the decision that you need.
- **Ask the owner** only at the feature design, at a plan for a risky area, and before a destructive action.

## After compaction, or in a new session
- The files are the source, not the chat. Read the plan, its ledger if it has one, and `git log`. Continue at the first task that is not done.

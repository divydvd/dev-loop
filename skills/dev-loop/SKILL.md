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

## 1. Route
- **Feature or behavior change, also a small one:** use `brainstorming`. Put the facts from the profile, and from the flow docs if the repo has them, into your questions. Do not write code before the owner approves the design.
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
- If the plan touches a risky area from the profile, mark it "risky". Wait for the owner's plan review only then.
- Choose the execution method from the core rules. Do not ask.

## 3. Build
- Follow `executing-plans` or `subagent-driven-development`. Use test-driven development.
- Run independent tasks and research in parallel. Run only one heavy build at a time, with the profile's commands.
- When the plan does not answer a question, decide it, and record the ruling in the ledger.

## 4. Flow docs
- Skip this step when the profile says that the repo has no flow docs.
- Otherwise, use `flow-docs`. Update the doc of each flow that you changed, in the same PR. Add each new pitfall and invariant.

## 5. Self-review
Do this step for each code change, also a small one.
- Do a "simplify" pass. Remove the code, flags, and abstractions that the goal does not need.
- Check the change against the acceptance record and the profile's review checklist.
- For a change with a plan, also use `requesting-code-review`, or the final whole-branch review of the execution skill. Give the reviewer the acceptance record and the review checklist.
- Check each finding with `receiving-code-review`. Fix the Critical and Important findings that pass this check. List the other findings in the PR body, with the reason.
- Check the size with `git diff --stat <base>...HEAD`. If the code change is more than about 400 lines, split it.

## 6. Verify
Do this step after the last change to the branch, so that all evidence is at the head commit.
- Run the test tier for each changed area. Read the output.
- If the profile says that the change needs a device test, run it yourself: install the build, run the scenario, record the result, and restore the device. Ask the owner only when no device is connected or a step needs a sign-in.
- Write each result as evidence: `<check>: <command or scenario> → <result> at <sha7>`. If the `work_ledger_record` tool is available, also record the result there (kind `validated` or `device_tested`).
- If a check fails, fix the cause, do steps 4 and 5 for the fix, and run this step again.
- Use `verification-before-completion` before you say "done".

## 7. Ship
- Push the branch, and open a PR with a body from `assets/pr-body.md`. Fill in the evidence and the Dev-loop feedback.
- After each push, wait for the checks and for the automatic review of the head commit. `gh pr checks` does not show Copilot code review. Find its check run, `copilot-pull-request-reviewer`, in `gh api repos/{owner}/{repo}/commits/<sha>/check-runs`. The review starts 1 minute or less after the push, and it can take 5 minutes. If no review starts in 2 minutes, the repo has no automatic review.
- Do review rounds. Read each new finding, in the review threads and in the review text. Check it as in step 5. When a finding asks only for evidence, get the evidence, and do not change code for it. Reply in its thread with your change or your reason, and resolve the thread.
- Put all the fixes of a round in one push. Before the push, do steps 4 to 6 for the fixes. Then update the PR body.
- Stop the rounds when a round has no new finding that you must fix. A repeat of a rejected finding is not new. Do not push only to get a clean review. After 3 rounds with fixes, stop, and report each open finding to the owner, with your verdict.
- Do not merge.

## 8. Report
Send the owner one short message:
```
PR #<N> is ready: <one-line summary>.
Evidence: <tests> passed; device test <passed | not needed> at <sha7>.
Please check: <the one or two things that only a person can check>.
```

## Stop conditions
- **Done:** each "done when" item has evidence at the head commit, the PR is open, and the review rounds stopped.
- **Blocked:** 3 failed fixes, missing access, no device, or a product decision that the repo does not answer. Stop. Report what you tried, the evidence, and the decision that you need.
- **Ask the owner** only at the feature design, at a plan for a risky area, and before a destructive action.

## After compaction, or in a new session
- The files are the source, not the chat. Read the plan, its ledger if it has one, and `git log`. Continue at the first task that is not done.

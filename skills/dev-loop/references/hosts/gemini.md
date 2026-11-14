# Gemini CLI host guide

## Abstract
Gemini CLI (`0.32.1` and newer) loads the `dev-loop` extension through root `gemini-extension.json`, auto-loads root `GEMINI.md` at session startup, and discovers `skills/*` automatically.
This guide defines only the `dev-loop` workflow deltas for Gemini CLI: automatic startup context sync, interactive `activate_skill` consent handling, fresh-context `generalist` review dispatch, local UI mockup and screenshot handling, `gh` milestone PR branches, and the absence of `work-ledger` runtime command guards.
Use Superpowers `using-superpowers` (`gemini-tools.md`) for generic tool-name mappings so `dev-loop` preserves identical approval, testing, and review standards without duplicating tool tables.

## Identify the Gemini CLI runtime
Select this guide when your runtime exposes Gemini CLI tools such as `activate_skill`, `invoke_agent` (or the direct `generalist` subagent tool), `run_shell_command`, `read_file`, `replace`, and `write_file`, without Copilot host surfaces (`COPILOT_CLI=1`, `open_canvas`, `github-pr-media`, or `work_ledger_record`).
Never select this guide from a `gemini-*` model name alone; a `gemini-*` model running inside GitHub Copilot uses `references/hosts/copilot.md`.
Use Superpowers `using-superpowers` (`gemini-tools.md`) to translate generic file, shell, search, todo, and skill actions.

## Host procedures
1. **Startup rules and sync (`gemini-extension.json` + `GEMINI.md`):** Root `gemini-extension.json` sets `"contextFileName": "GEMINI.md"`, so Gemini CLI loads root `GEMINI.md` automatically into startup context without a `read_file` call.
   Root `GEMINI.md` mirrors the body of `com.github.copilot/rules/core.mdc` byte-for-byte (`com.github.copilot/rules/core.mdc` remains the single authoritative source).
   After any approved edit to `com.github.copilot/rules/core.mdc`, run `node <dev-loop-checkout>/scripts/sync-host-core.mjs` and `node <dev-loop-checkout>/scripts/check.mjs`.
   Keep `AGENTS.md` plus `GEMINI.md` at or below `15 KB` (`15,000` UTF-8 bytes), including when Gemini CLI and GitHub Copilot coexist inside `divydvd/dev-loop`.
2. **Skill activation consent (`activate_skill`):** Gemini CLI's default approval policy prompts the owner for consent (`decision = "ask_user"`) before `activate_skill` loads a skill body.
   **Caution:** Do not continue a feature, bug fix, or code change from `GEMINI.md` alone after `activate_skill` consent is declined or blocked by policy.
   Wait for owner consent when calling `activate_skill`.
   If `activate_skill` is declined (or denied in non-interactive default mode without a policy allowance) and the owner tells you not to re-prompt, stop immediately without editing files or opening a PR, and report `blocked` naming the missing `activate_skill` prerequisite (`dev-loop` or the required Superpowers skill).
3. **Owner gates (`ask_user`):** Ask real doubts, design approvals, and risky-plan approvals with Gemini CLI `ask_user`, one question at a time, with your recommended choice first.
4. **Fresh-context independent review (`design-review` and step 5):** Dispatch each independent review in a fresh subagent context using `invoke_agent` with `agent_name: "generalist"` per Superpowers `gemini-tools.md` (or the direct `generalist` subagent tool `{ request: "..." }` on Gemini CLI `0.32.1` builds that register subagents directly; never invent nonexistent agent names such as `code-reviewer`).
   For `design-review`, pass only the design-review prompt and snapshot evidence while withholding author session history and internal plan paths; if the `design-review` subagent fails, mark the design review `incomplete` at the brainstorming gate without automatic retry.
   For `requesting-code-review` (risky-area task review and step 5 whole-PR review), pass the base and head commits (or exact working-tree snapshot), the acceptance record, the compact test matrix, and the `AGENTS.md` review checklist while withholding the author's conversation history.
   If a code-review subagent fails or is unavailable, start it again once; after two failures, list the task or branch under "Not reviewed", do not substitute your own self-review, and report `"open, not ready: independent review unavailable"`.
5. **HTML UI mockups:** Gemini CLI has no `browser` side-panel canvas.
   Save one self-contained HTML file (inline CSS and JavaScript, no network dependencies) in a local temp or session folder outside the repository, give the owner its exact file path and `file://` URL to open in a local browser before design approval, and record the path in the plan and PR body.
6. **PR screenshots:** Inspect each screenshot locally (`read_file`) for personal data or secrets and keep screenshot files outside the repository.
   Because `github-pr-media` is unavailable in Gemini CLI, delete the empty HTML table under `## Screenshots` in `assets/pr-body.md`, list each validated screen as `not uploaded: github-pr-media skill is unavailable on this host`, and never commit screenshot files into git.
7. **Milestone branches and dependent PRs:** Gemini CLI has no `orchestrate` or `pr-stack` tools.
   Execute independent milestones sequentially in the current checkout (or in owner-approved `git worktree` checkouts) under `references/milestones.md`.
   Open dependent milestone PRs with `gh pr create --base <parent-branch>` and record dependencies in `Milestone scope`.
8. **Verification evidence and `work-ledger` runtime-guard absence:** `work_ledger_record` and `tools/work-ledger/` runtime command-blocking hooks are **absent** in Gemini CLI.
   Record exact verification commands, results, tested commit SHAs, and independent review coverage in `assets/pr-body.md` (`## Evidence` and `### Independent agent review`) and in the committed plan or execution ledger (`references/testing.md`).
   **Warning:** Protected commands (`git push --force`, `git reset --hard`, `git commit --no-verify`, and unapproved `gh pr merge`) are governed by Markdown instructions only and are **not** mechanically blocked at runtime in Gemini CLI.
   State that runtime-guard absence clearly when asked, and obey every core rule: never force-push, never rebase, and never run `gh pr merge` unless the owner explicitly tells you to merge that PR.
9. **Repository PR, review, and check-run inspection (`gh`):** Inspect CI checks and automatic GitHub Copilot review with `gh pr checks` and `gh api repos/{owner}/{repo}/commits/<sha>/check-runs`.
   Read PR review summaries and inline review threads with `gh pr view <pr> --json reviews,comments` and `gh api repos/{owner}/{repo}/pulls/<pr>/comments` before deciding any code change.
   `copilot-pull-request-reviewer` depends on the GitHub repository settings, not on the local Gemini CLI host.
   If no `copilot-pull-request-reviewer` check-run starts within 2 minutes of opening or updating the PR, record `none configured on repository (no copilot-pull-request-reviewer check-run within 2 minutes)` under `### GitHub Copilot review`.
10. **Extension install and verification:** Validate, link, or install locally with `gemini extensions validate <path>`, `gemini extensions link <path>`, or `gemini extensions install <path>`, and verify discovery with `gemini extensions list` and `gemini skills list` (using an isolated `GEMINI_CLI_HOME` during tests).

## Conclusion
Follow this guide whenever your active runtime is Gemini CLI so startup rules, `activate_skill` consent stops, fresh `generalist` reviews, local `file://` mockups, and `gh` PR checks behave predictably.
No new owner decision is needed beyond the standard `dev-loop` design, risky-plan, and merge gates.
The main operational risks in Gemini CLI are continuing after declined `activate_skill` consent or assuming `tools/work-ledger/` blocks destructive git commands at runtime; stop with `blocked` on declined skill activation and treat command safety rules as strict instruction invariants.

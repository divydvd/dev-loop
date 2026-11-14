# Claude Code host guide

## Abstract
Claude Code runs the same `dev-loop` rules and skills through `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `hooks/session-start`.
This guide lists only the Claude Code host deltas for startup rule loading, fresh-context `Agent` reviews, offline HTML mockups, screenshot privacy, milestone branches, runtime-guard limits, and `gh` PR checks.
Use this guide when your runtime environment is Claude Code, regardless of which language model serves the session.

## Identify the Claude Code runtime
Select this guide when `CLAUDE_PLUGIN_ROOT` is set without `COPILOT_CLI`, or when your runtime exposes Claude Code tools (`Agent` — `Task` in headless CLI stream output — and `Skill`) without Copilot tools (`open_canvas`, `github-pr-media`, or `work_ledger_record`).
Never select a host guide from the model ID; a `claude-*` model inside GitHub Copilot still uses `references/hosts/copilot.md`.
Use `claude-code-tools.md` from the Superpowers `using-superpowers` skill to translate generic tool names (`view`, `edit`, `bash`, `task`, `ask_user`, and `skill`).

## Host procedures
1. **Startup rules:** `hooks/hooks.json` runs `hooks/run-hook.cmd session-start` (`hooks/session-start`) synchronously on `SessionStart` events matching `startup|resume|clear|compact`.
   The hook strips YAML frontmatter from `com.github.copilot/rules/core.mdc` and injects the exact rule body through `hookSpecificOutput.additionalContext` (`hookEventName: "SessionStart"`).
   When `COPILOT_CLI` is non-empty, `hooks/session-start` outputs `{}` and exits `0` so GitHub Copilot CLI never loads `core.mdc` twice.
   Claude Code loads `AGENTS.md` from the repository root automatically.
2. **Independent agent review:** Launch a fresh-context reviewer subagent with the `Agent` tool (`claude-code-tools.md`) for each risky task and for the full PR diff (`SKILL.md` Step 5).
   Pass only file paths, plan paths, and commit ranges (`<base>..<head>`), never the author's conversation or summary.
   Built-in `claude ultrareview` or author self-review can supplement your checks, but neither replaces the fresh-context `Agent` review required by Core Rules 7 and 23.
   If the review `Agent` fails, start one fresh `Agent` retry once; if the retry fails, open the PR and report `PR #<N> is open, not ready: independent review unavailable`.
3. **HTML UI mockups:** Claude Code does not expose Copilot's `open_canvas` (`browser` canvas) tool.
   Save one self-contained HTML file (inline CSS and JavaScript, no network requests) in a local scratch folder outside the repository (such as `$TMPDIR`).
   Give the owner the exact file path and `file://` URL to open in a local browser before design approval, and record that path in the plan and PR body.
4. **PR screenshots:** Check each screenshot for personal data and secrets and keep image files outside the repository.
   When `github-pr-media` is unavailable, delete the empty HTML `<table>` in `## Screenshots` inside `assets/pr-body.md`, list each validated screen as `not uploaded: github-pr-media skill is unavailable on this host`, and do not commit screenshots.
5. **Worktrees, milestones, and stacked PRs:** Obey Core Rule 9 and work in the current checkout; do not call `EnterWorktree` or spawn `claude --worktree` sub-worktrees unless the owner explicitly approves worktree isolation.
   Claude Code does not provide Copilot's `orchestrate` or `pr-stack` skills.
   Run independent milestones sequentially in the current checkout (or in owner-approved `git worktree` checkouts), open dependent PRs with `gh pr create --base <parent-branch>`, and record dependencies in `Milestone scope` (`references/milestones.md`).
6. **Work ledger and runtime-guard absence:** `tools/work-ledger` and `work_ledger_record` do not run in Claude Code, and `hooks/hooks.json` registers only `SessionStart` (no `PreToolUse` command blocker).
   State clearly when asked that `git push --force` and unapproved `gh pr merge` are governed by Markdown instructions only and are not blocked at runtime by Claude Code.
   Record exact commands, results, commit SHAs, and independent review coverage in `assets/pr-body.md` (`## Evidence` and `### Independent agent review`) and in the committed plan ledger (`references/testing.md`).
7. **GitHub PR checks and plugin CLI:** Repository `copilot-pull-request-reviewer` runs depend on GitHub repository settings, not on the local coding host.
   After opening or updating a PR, poll `gh api repos/{owner}/{repo}/commits/<sha>/check-runs` for `copilot-pull-request-reviewer` and check CI with `gh pr checks`.
   Validate a checkout with `claude plugin validate --strict .`, install locally with `claude plugin install --marketplace <source> dev-loop`, and inspect installed plugins with `claude plugin list`.
   When testing `claude` from inside a GitHub Copilot terminal, run `env -u COPILOT_CLI claude ...` so an inherited `COPILOT_CLI=1` variable does not suppress `hooks/session-start`.

## Conclusion
Follow these Claude Code procedures alongside `references/hosts/README.md` so every approval gate, test tier, and fresh-context `Agent` review matches the reference workflow.
Disclose the absence of `PreToolUse` and `work-ledger` runtime command blockers explicitly when asked.
Never edit `com.github.copilot/rules/core.mdc` to fork host-specific core rules.

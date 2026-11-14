# Host capability contract

## Abstract
The `dev-loop` core rules and workflow apply across GitHub Copilot, Claude Code, Gemini CLI, and Codex, while host tools differ.
This reference defines how an agent selects its host adapter from the runtime environment and maps each host-sensitive step to a concrete procedure or fallback.
Agents preserve every approval gate, test requirement, and independent review check on every coding host without duplicating core rules.

## Select the host from the runtime environment
1. Identify your coding host from the active runtime environment and available tools, never from the model ID or model name.
2. Treat model selection and host capabilities as separate facts.
   For example, `claude-sonnet-5.5` or `gemini-4-carbon` inside GitHub Copilot still uses `references/hosts/copilot.md` when Copilot tools such as `open_canvas` (`browser` canvas), `github-pr-media`, or `work_ledger_record` are available.
3. Reuse the Superpowers `using-superpowers` skill (`claude-code-tools.md`, `gemini-tools.md`, and `codex-tools.md`) to translate generic tool names (`view`, `edit`, `bash`, `task`, `ask_user`, and `skill`).
   Do not duplicate generic tool-name tables inside `dev-loop`.
4. Read only the guide for your active host in this `hosts/` folder (`references/hosts/copilot.md` in GitHub Copilot; `references/hosts/gemini.md` in Gemini CLI — paths relative to `skills/dev-loop/`; `claude.md` and `codex.md` arrive in milestones `M2` and `M4`).
   When your host has no dedicated guide yet, or when an optional Copilot tool is absent, follow the fallback column below.

## Capability matrix
| Workflow capability | Observable predicate | GitHub Copilot procedure | Non-Copilot or missing-tool fallback |
| --- | --- | --- | --- |
| Core startup rules | Host startup loader | `com.github.copilot/rules/core.mdc` (`alwaysApply: true`) loads automatically; `COPILOT_CLI=1` skips `hooks/session-start` so `core` loads once. | Load the same core rules once from the host adapter (`hooks/session-start`, `GEMINI.md`, or `AGENTS.md`). |
| HTML UI mockup preview | `open_canvas` with `browser` canvas is available | Save one self-contained HTML file in the session `files/` folder, open its `file://` URL in the `browser` canvas before design approval, and record the path in the plan and PR body. | Save one self-contained HTML file in a local folder outside the repo, give the owner its exact path and `file://` URL to open in a local browser before design approval, and record the path in the plan and PR body. |
| PR screenshot upload | `github-pr-media` skill is available | Check each screenshot for personal data or secrets, upload safe images with `github-pr-media`, and place the URLs in the HTML table in `assets/pr-body.md`. | Check each screenshot and keep the files outside the repo. Delete the empty HTML table in `## Screenshots` when no screenshot is uploaded, list each validated screen as `not uploaded: github-pr-media skill is unavailable on this host`, and do not commit screenshots. |
| Child sessions and stacked PRs | `orchestrate` and `pr-stack` skills are available | Use `orchestrate` for parallel child sessions and `pr-stack` only for real dependencies under `references/milestones.md`. | Run independent milestones sequentially in the current checkout (or in owner-approved `git worktree` checkouts). Open dependent PRs with `gh pr create --base <parent-branch>` and record dependencies in `Milestone scope`. |
| Step-6 verification and review ledger | `work_ledger_record` tool is available | Record `validated`, `device_tested`, and independent-review `note` entries pinned to the exact head SHA with `work_ledger_record`, plus `assets/pr-body.md` and the plan ledger. | Record the exact commands, results, commit SHAs, and independent review coverage in `assets/pr-body.md` (`## Evidence` and `### Independent agent review`) and in the committed plan or execution ledger under `references/testing.md`. |
| GitHub automatic PR review | GitHub repository check-runs on `<sha>` | Poll `gh api repos/{owner}/{repo}/commits/<sha>/check-runs` for `copilot-pull-request-reviewer`. | Same `gh api` check on every coding host. `copilot-pull-request-reviewer` depends on the GitHub repository settings, not on the local coding host. If none starts within 2 minutes, write `none configured on repository (no copilot-pull-request-reviewer check-run within 2 minutes)` in `### GitHub Copilot review`. |

## Runtime guards and instruction-only limits
- Markdown rules and skills instruct the agent; they do not block shell commands or tool calls at runtime by themselves.
- Runtime command blocking for protected actions (`git push --force`, `git reset --hard`, `git commit --no-verify`, and unapproved `gh pr merge`) runs only when a live `work-ledger` runtime guard extension is installed and active in the host (such as `tools/work-ledger` in GitHub Copilot CLI).
- In any host without an active `work-ledger` runtime guard (including Claude Code CLI, Gemini CLI, Codex, or a Copilot installation without `tools/work-ledger`), state clearly when asked that `git push --force` and unapproved `gh pr merge` are governed by Markdown instructions only and are not blocked at runtime by the CLI.
- Obey every core rule regardless of runtime guard status: never force-push, never bypass hooks, and never merge a PR unless the owner explicitly tells you to merge that PR.

## Conclusion
Check runtime tool availability first and follow the matching procedure in the table above.
Keep approval gates, required tests, independent agent review, and repository PR checks identical across all coding hosts.
Report missing host capabilities or absent runtime guards explicitly instead of guessing or skipping workflow steps.

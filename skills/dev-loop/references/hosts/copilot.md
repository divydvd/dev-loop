# GitHub Copilot host guide

## Abstract
GitHub Copilot App and GitHub Copilot CLI are the reference hosts for `dev-loop`.
This guide lists how Copilot loads core rules, previews HTML mockups, uploads PR screenshots, coordinates child sessions, and records optional `work-ledger` entries.
Use this guide whenever your runtime environment provides Copilot tools, regardless of which language model serves the session.

## Identify the GitHub Copilot runtime
Select this guide when `COPILOT_CLI=1` is set or when your runtime tool list exposes Copilot host surfaces such as `open_canvas` (`browser` canvas), `github-pr-media`, `orchestrate`, `pr-stack`, or `work_ledger_record`.
Do not switch away from this guide when the active model inside Copilot is `claude-*`, `gemini-*`, or `gpt-*`.
If a specific surface is unavailable in the current Copilot session (for example headless CLI without `open_canvas` or a checkout without `work_ledger_record`), use the matching fallback in `references/hosts/README.md`.

## Host procedures
1. **Startup rules:** Copilot loads `com.github.copilot/rules/core.mdc` (`alwaysApply: true`) automatically in each session.
   When `hooks/session-start` is present for other hosts, `COPILOT_CLI=1` exits early without `additionalContext` so `core` loads once.
2. **HTML UI mockups:** Save one self-contained HTML file (inline CSS and JavaScript, no network) in the session `files/` folder.
   Call `open_canvas` with `canvasId: "browser"` and a `file://` URL before asking for design approval, and record the path in the plan and PR body.
3. **PR screenshots:** Inspect each screenshot for personal data and secrets before upload.
   Upload safe screenshots with `github-pr-media` using only the repository ID, and put the returned URLs into `## Screenshots` in `assets/pr-body.md`.
4. **Child sessions and stacked PRs:** Use `orchestrate` for parallel child sessions and `pr-stack` only for milestones with real branch dependencies under `references/milestones.md`.
5. **Work ledger and runtime guards:** When `work_ledger_record` and `work_ledger_get` are available, record `validated`, `device_tested`, and independent-review `note` entries pinned to the exact commit SHA after opening or updating a PR.
   Installing the `dev-loop` plugin does not install `tools/work-ledger`; check `~/.copilot/extensions/work-ledger/` separately before claiming live runtime command blocking.
6. **Plugin management and telemetry:** Install or update the plugin with `copilot plugin install` and `copilot plugin update dev-loop@dev-loop`.
   Verify discovery with `copilot instruction list` and `copilot skill list`.
   Weekly reviews read `~/.copilot/session-state` events when available.

## Conclusion
Use Copilot's native canvas, media, session, and ledger tools when your runtime exposes them, and fall back cleanly per `references/hosts/README.md` when an individual tool is absent.
Keep live `tools/work-ledger` guard verification separate from plugin installation.
Preserve all owner approval gates and independent PR review requirements.

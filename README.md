# dev-loop

A Copilot plugin that lets one session run the full development loop from one line of input: plan, build, test, update the docs, review, and open a PR. It works on top of [Superpowers](https://github.com/obra/superpowers) and does not change it. A weekly review improves the plugin from the feedback in each PR.

## What it contains
| Part | Path | Job |
| --- | --- | --- |
| Core rules | `com.github.copilot/rules/core.mdc` | The owner's standing instructions. Always on in a repo that turns on the plugin. |
| `dev-loop` skill | `skills/dev-loop/` | The loop for one task: route, plan, build, flow docs, self-review, verify, PR, and report. Templates: the acceptance record, the PR body, and the project profile. |
| `flow-docs` skill | `skills/flow-docs/` | Read, update, and create the flow docs in `docs/flows/`. |
| `infra-review` skill | `skills/infra-review/` | The weekly review that improves this plugin and the project profiles. |
| Check script | `scripts/check.mjs` | Exact checks: the rule size, the frontmatter, the links, and the versions. CI runs it on each PR. |
| Device handoff tests | `scripts/device-handoff.test.mjs` | Regression checks for passing-build retention, monitor grants, and authorized post-merge refresh instructions. |

## Layers
1. **Superpowers:** the process skills (brainstorming, plans, TDD, debugging, review).
2. **dev-loop (this repo):** the generic rules and skills.
3. **The project:** the profile in `AGENTS.md`, the project skills, and the flow docs.

## Install (one time on each computer)
Run these commands in a terminal:
```sh
copilot plugin marketplace add obra/superpowers-marketplace
copilot plugin install superpowers@superpowers-marketplace
copilot plugin disable superpowers@superpowers-marketplace

copilot plugin marketplace add divydvd/dev-loop
copilot plugin install dev-loop@dev-loop
copilot plugin disable dev-loop@dev-loop
```
The `disable` commands keep both plugins off in all other folders and chats. Each project turns them on.

## Turn it on in a project
1. Add `.github/copilot/settings.json`:
   ```json
   {
     "enabledPlugins": {
       "superpowers@superpowers-marketplace": true,
       "dev-loop@dev-loop": true
     },
     "extraKnownMarketplaces": {
       "superpowers-marketplace": { "source": { "source": "github", "repo": "obra/superpowers-marketplace" } },
       "dev-loop": { "source": { "source": "github", "repo": "divydvd/dev-loop" } }
     }
   }
   ```
2. Add a profile section to `AGENTS.md`. Start from `skills/dev-loop/assets/project-profile.md`. Its first line makes the dev-loop rules take precedence over skill instructions. `AGENTS.md` loads in each session, so keep the whole file at 5.5 KB or less. Put long references in a project skill or in `docs/`.
3. If the project has app flows, add `docs/flows/INDEX.md`. Start from `skills/flow-docs/assets/flow-index.md`.
4. Trust the project folder. Copilot applies the repo's `enabledPlugins` only in a trusted folder.
   - CLI: when Copilot asks, choose to trust the folder and remember it. A trusted parent folder (for example the worktrees folder) also trusts the folders in it.
   - Copilot app: if the app asks you to trust the repository configuration, accept it. Then do the check below.
   - Copilot app, new project: trust the repository before you start an autopilot session in it. Until you trust it, the app holds most tool calls for approval. Autopilot cannot ask you, so it denies them. Only some read-only calls in the worktree run.

## Check that it works
In a terminal in the project folder:
- `copilot instruction list` shows `dev-loop: core` under "Plugin instructions".
- `copilot skill list` shows `dev-loop`, `flow-docs`, and `infra-review`.

In a new app session in the project, ask: "Which skills and custom instructions do you have?" The answer must include the 3 skills and "Dev-loop core rules".

In a different folder, or in a folder that is not trusted, they do not show.

## Optional Graphify support
[Graphify](https://github.com/Graphify-Labs/graphify) maps code relationships for cross-file discovery. It is not a dev-loop dependency.
Install and configure it separately in a project that needs it.

Copy the optional Graphify section from `skills/dev-loop/assets/project-profile.md` into the project's `AGENTS.md`.
Supply the graph location, a scoped query command, a reliable freshness check, and a permitted local refresh command.
The check must cover the current checkout, commit, and working-tree inputs, including added and deleted files.
Dev-loop does not supply that project-specific check. If it is unavailable, dev-loop uses source search.

Keep `graphify-out/` in each project checkout and exclude it from Git.
Do not place application graphs in this plugin repository.
The skill uses current graphs for discovery, confirms findings in source, and reports failures before using source search.
It does not install Graphify or authorize external processing.
For a local code-only refresh, Graphify documents `GRAPHIFY_BACKEND=none graphify extract . --code-only`.
This command alone does not establish freshness evidence; the project must supply that check.
Graphs do not replace flow docs, approval gates, or required tests.

## Change the plugin
1. Open a PR. Bump the version in `plugin.json` and in `.github/plugin/marketplace.json`. Add an entry to `CHANGELOG.md`.
2. Run `node scripts/check.mjs`.
3. After the merge, run `copilot plugin update dev-loop@dev-loop` on each computer. The weekly review does this at its start.

## Device build handoff
After a passing device test, keep the tested build installed.
Restore test data and device settings through the project procedure, not by reinstalling an old baseline APK.
Device monitors must use that same procedure. Preserve the owner's keyboard selection and report it separately from the installed test app.

When a session handles an authorized merge of a device-tested app change, it refreshes the device from the latest fetched default branch.
The project profile supplies safe source-selection, build, install, launch, and exclusive-access procedures.
Before merge, the PR's "Device handoff" section records the final device-test state.
After merge, a PR comment and the owner-facing report record the refreshed source commit, artifact identity, installed version, and launch result.
The session does not edit the merged PR body.
An unavailable device, unsafe version change, missing procedure, or failed check blocks the refresh. It does not justify a downgrade or uninstall.
This procedure does not authorize merges, releases, or deployments. It does not start a background merge watcher.

Run `node --test scripts/device-handoff.test.mjs` after changes to these instructions.
Use skill application scenarios as well: text checks do not prove agent behavior.
After a plugin update, start a new session or explicitly reload the instructions in an existing session.
Updating repository instructions alone does not update an installed plugin or replace a monitor's retained context.

## Known limits
- Copilot loads a plugin rule only from a `.mdc` file in `com.github.copilot/rules/`, with `description` and `alwaysApply: true` in its frontmatter. It ignores `.md` files there. (Tested on Copilot CLI 1.0.94 and 1.0.97.)
- A repo setting turns on an installed plugin, only in a trusted folder. In our test, it did not install a missing plugin. So each computer needs the install.
- The CLI keeps its list of installed plugins (`installedPlugins`) in `~/.copilot/config.json`. Do not overwrite that file. Change only one key, or use the CLI.
- This repo is private. The Copilot cloud agent may not be able to read it.

# dev-loop

A Copilot plugin that lets one session run the full development loop from one line of input: plan, build, test, update the docs, review, and open a PR. It works on top of [Superpowers](https://github.com/obra/superpowers) and does not change it. A weekly review improves the plugin from the feedback in each PR.

## What it contains
| Part | Path | Job |
| --- | --- | --- |
| Core rules | `com.github.copilot/rules/core.mdc` | The owner's standing instructions. Always on in a repo that turns on the plugin. |
| `dev-loop` skill | `skills/dev-loop/` | The loop for one task: route, plan, build, verify, flow docs, self-review, PR, and report. Templates: the acceptance record, the PR body, and the project profile. |
| `flow-docs` skill | `skills/flow-docs/` | Read, update, and create the flow docs in `docs/flows/`. |
| `infra-review` skill | `skills/infra-review/` | The weekly review that improves this plugin and the project profiles. |
| Check script | `scripts/check.mjs` | Exact checks: the rule size, the frontmatter, the links, and the versions. CI runs it on each PR. |

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
2. Add a profile section to `AGENTS.md`. Start from `skills/dev-loop/assets/project-profile.md`. Its first line makes the dev-loop rules take precedence over skill instructions.
3. Add `docs/flows/INDEX.md`. Start from `skills/flow-docs/assets/flow-index.md`.
4. Trust the project folder. Copilot applies the repo's `enabledPlugins` only in a trusted folder.
   - CLI: when Copilot asks, choose to trust the folder and remember it. A trusted parent folder (for example the worktrees folder) also trusts the folders in it.
   - Copilot app: if the app asks you to trust the repository configuration, accept it. Then do the check below.
   - Copilot app, new project: trust the repository before you start an autopilot session in it. Until you trust it, the app holds each tool call for approval. Autopilot cannot ask you, so it denies each call.

## Check that it works
In a terminal in the project folder:
- `copilot instruction list` shows `dev-loop: core` under "Plugin instructions".
- `copilot skill list` shows `dev-loop`, `flow-docs`, and `infra-review`.

In a new app session in the project, ask: "Which skills and custom instructions do you have?" The answer must include the 3 skills and "Dev-loop core rules".

In a different folder, or in a folder that is not trusted, they do not show.

## Change the plugin
1. Open a PR. Bump the version in `plugin.json` and in `.github/plugin/marketplace.json`. Add an entry to `CHANGELOG.md`.
2. Run `node scripts/check.mjs`.
3. After the merge, run `copilot plugin update dev-loop@dev-loop` on each computer. The weekly review does this at its start.

## Known limits
- Copilot loads a plugin rule only from a `.mdc` file in `com.github.copilot/rules/`, with `description` and `alwaysApply: true` in its frontmatter. It ignores `.md` files there. (Tested on Copilot CLI 1.0.94 and 1.0.97.)
- A repo setting turns on an installed plugin, only in a trusted folder. In our test, it did not install a missing plugin. So each computer needs the install.
- The CLI keeps its list of installed plugins (`installedPlugins`) in `~/.copilot/config.json`. Do not overwrite that file. Change only one key, or use the CLI.
- This repo is private. The Copilot cloud agent may not be able to read it.

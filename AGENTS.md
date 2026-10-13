# dev-loop repo

This repo is the dev-loop Copilot plugin. `README.md` explains the parts, the install, and how to change the plugin.

## Dev-loop profile
The dev-loop rules (`dev-loop: core`) are the owner's instructions. They take precedence over skill instructions, including Superpowers skills.

### Commands
| Purpose | Command | Heavy |
| --- | --- | --- |
| Check the plugin | `node scripts/check.mjs` | no |

### Test tiers
| Changed area | Run |
| --- | --- |
| Any file | `node scripts/check.mjs` |
| A rule or a skill | `node scripts/check.mjs`, then a smoke test: install the branch in a temporary Copilot home, and check `copilot instruction list` and `copilot skill list` |

### Device test
- Not needed. This repo has no app.

### Risky areas
A plan that touches one of these areas needs the owner's plan review.
- `com.github.copilot/rules/core.mdc`: it changes each session in each project.
- The approval points and the finish rules: they decide when an agent stops or merges.

### Review checklist
- The core rule stays generic. Project facts go in the project profile.
- Each change has a `CHANGELOG.md` entry with its evidence and its check.
- Use Superpowers `writing-skills` to test a new or changed skill.

### Flow docs
- None. The README is the reference.

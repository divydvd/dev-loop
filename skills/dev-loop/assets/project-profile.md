## Dev-loop profile
<!-- The dev-loop plugin reads this section. Keep it short and exact. Put only project facts here. Generic rules go in the plugin. AGENTS.md loads in each session: keep the whole file at 5.5 KB or less. Keep the safety rules here. Put long references in a project skill or in docs/. -->

The dev-loop rules (`dev-loop: core`) are the owner's instructions. They take precedence over skill instructions, including Superpowers skills.

### Commands
| Purpose | Command | Heavy |
| --- | --- | --- |
| Fast checks (lint, compile) | `<command>` | no |
| Unit tests for one module | `<command>` | <yes or no> |
| All tests | `<command>` | yes |
| Build the app | `<command>` | yes |

### Heavy builds
- <Which commands are heavy. How to run them with low memory. Only one heavy build runs at a time.>

### Graphify (optional)
<!-- Omit this section when the project does not use Graphify. Keep project commands here, not in the shared plugin. -->
- **Enabled:** <yes or no>
- **Graph location:** <path inside this checkout; for example graphify-out/graph.json>
- **Query command:** <scoped command; for example graphify query "<question>" --budget 1500>
- **Freshness check:** <command that verifies the graph matches this checkout, HEAD, and working-tree files; or "unavailable">
- **Local refresh command:** <permitted local-only command; or "none">
<!-- A freshness check must detect changed, added, and deleted inputs, including relevant untracked files.
     HEAD or a graph timestamp alone is insufficient. Without a reliable check, use source search.
     Refresh example: GRAPHIFY_BACKEND=none graphify extract . --code-only.
     Confirm that the project's refresh also provides the evidence its freshness check needs.
     Keep generated graphs local to each checkout and exclude them from Git. Never include secrets.
     No installation or external processing is authorized by this section. -->

### Test tiers
| Changed area | Run |
| --- | --- |
| <path or area> | <command> |

### Device test
- **Needed when:** <the change touches ...>
- **Procedure:** <install the build, run the scenario, capture the evidence, restore the device>
- **Tools:** <adb, a test tool, ...>
- **Test tool repo:** <owner/repo of the test tool, for its improvement PRs, or "none">
- **Ask the owner only when:** no device is connected, or a step needs a sign-in.

### Risky areas
A plan that touches one of these areas needs the owner's plan review.
- <area>: <why it is risky>

### Review checklist
- <a project-specific check for the reviewer>

### Flow docs
- Index: `docs/flows/INDEX.md`. Write "None" if the repo has no app flows.

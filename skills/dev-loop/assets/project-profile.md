## Dev-loop profile
<!-- The dev-loop plugin reads this section. Keep it short and exact. Put only project facts here. Generic rules go in the plugin. -->

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

### Test tiers
| Changed area | Run |
| --- | --- |
| <path or area> | <command> |

### Device test
- **Needed when:** <the change touches ...>
- **Procedure:** <install the build, run the scenario, capture the evidence, restore the device>
- **Tools:** <adb, a test tool, ...>
- **Ask the owner only when:** no device is connected, or a step needs a sign-in.

### Risky areas
A plan that touches one of these areas needs the owner's plan review.
- <area>: <why it is risky>

### Review checklist
- <a project-specific check for the reviewer>

### Flow docs
- Index: `docs/flows/INDEX.md`

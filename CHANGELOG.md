# Changelog

Each entry says what changed, why (the evidence), and how the next weekly review checks that the change helped.

## 0.1.0 (2026-10-13)
- **What:** the first version. The core rules, the `dev-loop`, `flow-docs`, and `infra-review` skills, the templates, and the check script.
- **Why:** the owner repeated the same basic instructions in many sessions. Kickoffs were about 4.5 KB, and the median PR changed 687 lines.
- **Check:** a trial on 1 bug and 1 feature in SmarType. Targets: one-line kickoffs, no repeated basic instructions, 3 or fewer owner messages before the PR, and evidence at the head commit.
- **Tested before release** (Copilot CLI 1.0.97, Superpowers 7.0.0, a temporary Copilot home): the check script finds 5 planted faults. The install loads the rule and the 3 skills. The repo setting turns on both plugins only in a trusted folder. A typo takes the trivial route. A bug gets a failing test before the fix. A small feature stops for one design question, with the recommended choice first. The first feature test found that the agent skipped the design stop and the self-review for a small feature, so rules 3 and 5 and the skill now say that small changes do not skip them.

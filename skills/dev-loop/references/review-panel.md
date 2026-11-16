# Proportional review panel

## Abstract
A single generalist reviewer can miss concurrency, security, or accessibility bugs in a large or multi-domain pull request.
This reference defines the deterministic Step-5 routing rules, specialist role contracts, host dispatch rules, and `skeptic-judge` synthesis pass.
Small changes keep one fast reviewer, while complex or risky diffs receive isolated specialist checks and a unified verdict.

## Run the deterministic router first
Run `scripts/prepare-review-panel.mjs` with `node` before you start Step-5 independent review:
```bash
node <dev-loop-skill-dir>/scripts/prepare-review-panel.mjs \
  --repo-root <repo-root> \
  --base <base-ref> \
  --head <head-sha-or-WORKTREE> \
  --out-dir <temp-dir-outside-repo> \
  --json
```
- Put `--out-dir` in a temporary directory outside `--repo-root` (for example `$TMPDIR/dev-loop-review-<id>` or the session `files/` folder). The script rejects any `--out-dir` inside `--repo-root` so frozen packets never pollute `git status`.
- Keep `--checklist` at its default (`docs/testing/review-checklist.md`) unless the project profile names another path. When that file is absent, the router embeds the `### Review checklist` bullets from `AGENTS.md`.
- Read `routing.json` or stdout JSON to select one of three modes:
  1. `exempt`: `0` production lines, outside `### Risky areas`, and only harmless prose spelling or formatting edits in non-operational `.md` files. Edits to `skills/**`, `com.github.copilot/**`, `hooks/**`, `.claude-plugin/**`, `.github/**`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, commands, flags, numbers, or normative rules (`must`, `never`, `do not`) are never `exempt`. Record the reason in `Exemption`.
  2. `single`: `1`–`120` production lines, outside `### Risky areas`, and `0` or `1` triggered domain signal (`roles: ["single-reviewer"]`, `synthesisJudge: false`). Dispatch one fresh `requesting-code-review` subagent with `<out-dir>/single-reviewer-packet.md`. Record `single (<agent>)` in `Reviewer`.
  3. `panel`: `> 120` production lines, any file in `### Risky areas`, or `2+` triggered domain signals (`synthesisJudge: true`, `judgeRole: "skeptic-judge"`). Always include `arch-correctness` plus each triggered domain role (`concurrency-state`, `security-privacy`, `ui-a11y`), or `["arch-correctness", "security-privacy"]` when a risky-area change triggers `0` keyword domains (`2`–`4` specialists total).

## Specialist roles and frozen packets
Give each reviewer only its `<out-dir>/<role>-packet.md`, the acceptance record, and the saved test matrix (`references/testing.md`).
Never pass one specialist's draft output to another specialist.

| Role | Inspection scope |
| --- | --- |
| `single-reviewer` | Check requirements, source, affected callers, error paths, domain risks, and missing test-matrix cases across the full diff. |
| `arch-correctness` | Check acceptance requirements, caller contracts, error handling, migrations, configuration, and missing test-matrix cases. |
| `concurrency-state` | Check async ordering, cancellation, shared-state races, locks, retries, caching, and lifecycle cleanup. |
| `security-privacy` | Check authentication, permission or caller bypasses, secrets/tokens, command/query injection, and personal-data exposure. |
| `ui-a11y` | Check UI states, accessibility labels/semantics, keyboard and screen-reader navigation, reduced motion, and contrast. |

Require each reviewer to read actual source files and affected callers in `<= 150`-line slices and return JSON matching this schema:
```json
{
  "role": "arch-correctness",
  "reviewedHead": "<commit-sha-or-WORKTREE:sha256>",
  "findings": [
    {
      "id": "F-1",
      "severity": "Critical" | "Important" | "Minor",
      "domain": "arch-correctness",
      "file": "path/to/file",
      "lines": "10-24",
      "symptom": "Concrete failure or regression",
      "evidence": "Exact file:line and caller proof",
      "suggestedFix": "Smallest root-cause fix"
    }
  ],
  "missingTestCases": []
}
```

## Dispatch and failure rules
- **Parallel dispatch (default):** When your coding host supports parallel subagents (such as GitHub Copilot `task` calls or Claude Code parallel `Task` calls), launch all selected specialists in one turn.
- **Sequential fallback:** When your coding host allows only one subagent at a time (`references/hosts/README.md`), run the exact same `<role>-packet.md` reviews one after another in fresh contexts without sharing prior outputs. Record `dispatch: sequential` in the `Reviewer` field (for example `panel (arch-correctness, security-privacy -> skeptic-judge; dispatch: sequential)`).
- **Retry-once rule:** If any required specialist or `skeptic-judge` fails or times out, start that exact role again once in a fresh subagent. If it fails a second time, do not put your own review in its place and do not skip the failed domain. List the failed role in `Not reviewed` (for example `security-privacy (failed 2 times)`). You may open the PR, but report `"open, not ready: independent review unavailable"`.

## Run the `skeptic-judge` pass (`panel` mode)
After all required specialists succeed, start one fresh `skeptic-judge` subagent with `<out-dir>/skeptic-judge-packet.md` and the raw specialist JSON outputs:
1. **Advocate filter:** Remove findings that contradict the current source code, duplicate another finding, or request subjective style edits with no bug or maintenance fault.
2. **Skeptic gap check:** Even when all specialists return `0` findings, check cross-domain boundaries (such as UI state vs async cancellation or permission checks vs direct export/caller bypasses) and saved test-matrix gaps. Add missed `Critical` or `Important` findings with exact `file:line` evidence.

Evaluate the final `skeptic-judge` output with `receiving-code-review`. Fix confirmed `Critical` and `Important` findings, and list unfixed `Minor` or rejected findings in the PR body with the reason.
Record `panel (<roles> -> skeptic-judge)` in the `Reviewer` row of `assets/pr-body.md` (for example `panel (arch-correctness, concurrency-state, security-privacy, ui-a11y -> skeptic-judge)`).

## Focused follow-up review after fixes
- Do not re-run the full multi-agent panel for a small follow-up fix (`<= 120` production lines outside new risky areas).
- Give later substantive changes a focused `single` independent review (`single (<agent>)`) of the changed behavior and affected interactions before the next push, and record that commit and reviewer in `Changes after review`.
- Re-run `panel` mode only when follow-up changes add `> 120` production lines or touch a newly affected risky area.
- Harmless spelling or formatting edits after review do not need another review.

## Conclusion
Run `scripts/prepare-review-panel.mjs` before every Step-5 review so routing stays deterministic and proportional.
Keep specialist packets outside the repository, isolate specialist contexts, and never replace a failed reviewer with self-review.
Record the exact `single` or `panel` coverage in `assets/pr-body.md` before you push or report readiness.

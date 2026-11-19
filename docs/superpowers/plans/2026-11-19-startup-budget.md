# Startup budget repair

## Abstract
Copilot loads the core rule and the root Gemini mirror in this repository.
The combined startup text is 18,306 bytes, above the 15,000-byte limit.
Give the Gemini mirror a host-specific filename without changing its content.

## Acceptance record
- Goal: remove duplicate startup rules without changing rules or approval gates.
- Done when: Copilot loads one core copy, Gemini loads the same mirror, and measured startup text is at most 15,000 bytes.
- Required evidence: failing regression, passing portability tests, plugin checks, isolated discovery, real offline Gemini startup, and independent review.
- Stop conditions: altered core content, broken Gemini startup, required failed checks, or an approval boundary change.
- Scope: one bug fix, fewer than 120 production lines; no core.mdc or AGENTS.md changes.
- Base: main at a9c549c6c52dc0804db1a70a621c24f84b508cd4.

## Tasks
1. Reproduce duplicate discovery and add a failing regression.
2. Rename the mirror to dev-loop-context.md. Update its manifest, sync helper, checks, current references, and five versions.
3. Verify both loaders, review the complete diff, and open one PR.

## Test matrix
| ID | Required | Input or risk | Expected result |
| --- | --- | --- | --- |
| B1 | yes | Copilot discovery in this checkout | No root GEMINI.md; one core rule; total <=15,000 bytes |
| B2 | yes | Gemini extension in an isolated home | Manifest-selected mirror loads the unchanged core body |
| B3 | yes | Missing, drifted, or symlinked mirror | Existing sync and containment failures remain visible |
| B4 | yes | Startup boundary | Exact 15,000 passes; 15,001 fails for each host's source total |
| B5 | yes | Existing consumers | Portability and configured script suites remain green |
| B6 | yes | Host-reference consumer | Correct filename, sync command, and consent boundary |

No device or Gradle case applies. This repository has no app.
No permanent inventory is configured. Reuse the portability suite and plugin check.
UI and concurrency do not apply to this synchronous filename change.
Containment, compatibility, startup limits, and consent preservation do apply.

## Execution ledger
- Baseline: instruction discovery lists AGENTS.md, GEMINI.md, home instructions, and core.mdc.
- Baseline bytes: 2,088 + 5,304 + 2,296 + 5,426 + 3,192 = 18,306.
- Cause: the Gemini adapter uses Copilot's automatically discovered workspace filename.
- Gemini CLI 0.32.1 joins contextFileName to the extension root and supports another filename.
- Existing enforcement: scripts/check.mjs checks repository files, not user-home or Superpowers bytes.
- Open PRs inspected before edits: #10, #28, #29, #30, #31, #33.
- Avoid their instruction and workflow hunks. Required version lines overlap #10, #28, and #31. Changelog insertion shares the insertion point with all six PRs.
- Ruling: retain the existing CI budget check as a repository-only check. Report measured live totals separately.
- Ruling: this is a loader bug, not a feature or a core-rule change. Use the small-bug route.
- B1 RED: the new duplicate-startup regression fails because contextFileName is GEMINI.md.
- B6 baseline consumer selects root GEMINI.md. Revised consumer selects dev-loop-context.md and preserves the consent-denial stop.
- First portability run: 10 pass, 1 fails because a regex still expects the old sync output. Update that affected assertion.
- First complete run: one documentation assertion fails because the map lost exact adapter paths. Restore those paths, without weakening the assertion.
- Dependent review classification: RED confirms the renamed operational Markdown becomes generic documentation. Add the new filename to the existing operational-file list.
- B1/B2/B6: isolated Copilot install lists one core rule and four skills, with neither mirror filename. Real offline Gemini reaches Turn-1 with the complete mirrored body in systemInstruction. Fresh reference consumers preserve the consent stop.
- B3/B4/B5 before the classifier update: 393 tests pass, none fail, and one filesystem case skips on this case-insensitive volume.
- Full-diff specialists: arch-correctness and concurrency-state report no source findings. The architecture reviewer requests unequal and absent workspace boundary cases. Add both to T-M3-1.
- Final configured suites: 394 pass, zero fail; one existing case-sensitive-filesystem case skips. Claude startup passes.
- Final affected suites after the boundary additions: 34 pass, zero fail, zero skip.
- Skeptic-judge reviews the full diff and later test delta at WORKTREE:5e64fd512c1b26c849df2b3f913eb34ae34fe8da9defacbec0574f9f0e850719. Verdict: PASS, no findings or coverage gaps.
- Captured offline Gemini request contains exactly one core heading and the complete core body in systemInstruction.
- Fresh Copilot startup totals 13,002 bytes: 2,088 profile + 5,426 core + 2,296 home + 3,192 Superpowers. No bytes are added to core.mdc or AGENTS.md.
- No phone, Gradle, merge, or live user configuration change occurs. Live model compliance remains outside this loader repair's proof.
- Automatic review round 1 confirms a containment gap: an existing optional workspace symlink outside the checkout counts as absent.
- RED: T-M3-1 reproduces the gap. Distinguish an absent optional file from an existing invalid path. Test external and broken symlinks, plus directories.
- The first posted remote-status note preceded the review finding. Correct it immediately; the PR is not ready until this repair is verified and reviewed.
- Round-1 repair: all 394 applicable local tests pass, zero fail; one existing filesystem case skips. Plugin and mirror checks pass.
- Focused independent review at WORKTREE:7902410ebebb7365a2e99e9694707df98ad4b77a14f0f02a9d2c1a26090ea2e9 reports PASS, no findings or missing cases. Only this factual ledger entry follows that review.

## Conclusion
Use a Gemini-specific context filename and retain the same source of truth.
The main risk is losing Gemini startup context, so real offline loader evidence is required.

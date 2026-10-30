# Canonical Maven protected paths

## Acceptance record
- **Goal:** Deny the local Maven exception when the project overlaps protected source or data through filesystem aliases.
- **Done when:** Lexical and canonical checks reject overlap in both directions. Resolution failures deny Maven explicitly.
- **Done when:** Tilde uncertainty cannot transfer a pause; PR values cannot select a repository; direct legacy restores retain case/whitespace compatibility.
- **Required evidence:** Real Git/filesystem regressions, one independent review, required Node suites, source integrity, and automatic review.
- **Size estimate:** Fewer than 70 changed production lines; tests and documentation excluded.
- **Stop conditions:** One additional bounded correction cycle only. Report new automatic findings without another fix push.
- **Base:** `divydvd-verified-local-maven-exception`, PR #15, `ec69a3ea3d692903a78e81d8fc31a8dd04d88ca2`.
- **Approval:** Owner approved "Approve one bounded correction PR (Recommended)" for this exact path correction.
- **Expanded approval:** Owner then chose "Include these three fixes in the correction PR (Recommended)" for the confirmed #14 defects.

## Abstract
Lexical path comparison misses protected directories reached through symlinks.
Keep that check and compare canonical filesystem paths for the project and every protected root.
Deny resolution failures without changing extension startup or other Maven requirements.
The same cycle also corrects quoted-tilde scope selection, GitHub option-value parsing, and legacy restore routing.

## Execution
1. Reproduce the defect with tracked tests using this checkout's helpers.
2. Add the bounded path check and the three owner-authorized control corrections with RED-to-GREEN regressions.
3. Get one independent review. Commit, run required checks, and open the correction PR against #15.

## Constraints
No installation, live guard changes, merge, Gradle execution, device use, rebase, or force push.
Keep confirmations, fingerprints, expiry, mandatory approvals, source checks, and shared locking unchanged.
Keep `BASELINE.sha256` unchanged.
The extension constructs `Ledger(DATA_DIR)` before policy use; the constructor creates the data directory.
The extension source directory already exists. Missing protected paths at Maven verification therefore fail closed.
Resolve shell-quoting uncertainty conservatively; do not infer a pause repository from ambiguous tilde arguments.
GitHub option values and arguments after `--` must not supply repository flags.
Preserve direct legacy restores with case and whitespace variants. Reject quoted, forwarded, and agent commands.
Independent review found that resolved path strings can retain case aliases on macOS.
Compare filesystem identities along resolved directory ancestry; do not lowercase paths on case-sensitive filesystems.

## Conclusion
This correction prepares source only; it does not fix the live guard.
The coordinator must route the reviewed branch to the separate installation package.
Concurrent filesystem changes remain a documented verification limit.

## Review outcome
The Maven task received one independent review. Its case-alias finding has failing-then-passing filesystem regressions.
The later expanded controls task received a separate independent review. Its attachment-value finding has failing-then-passing policy/classification regressions.
Neither task has a deferred finding. The implementer verifies the fixes without another independent review round.
Final checks run after the correction commit. Automatic review is read after the single push, without a further fix push.

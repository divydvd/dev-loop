# Verified local Maven recovery

## Acceptance record
- **Goal:** Complete the bounded local Maven recovery path without changing the live guard.
- **Done when:** A separately confirmed repository/session pause permits only a configured, reviewed command at its exact clean source.
- **Required evidence:** Real temporary Git tests, independent review, plugin check, and the complete named Node suite at the final commit.
- **Size estimate:** 240–350 changed production lines; tests and documentation excluded.
- **Stop conditions:** Unresolved safety decisions, missing provenance, or three failed fixes.
- **Base:** `divydvd-scoped-owner-guard-controls`, initially `6b012f61b71ad29bdc9a4e3946914c6bfcccf8fa` (#14).
- **Risk:** Approval enforcement. The parent plan and this bounded scope have owner approval.

## Abstract
Maven classification is corrected, but all Maven publication remains blocked.
Bind the existing pause confirmation to owner-maintained local scope descriptors.
Verify the exact source, launcher, command, and destination before policy permits execution.

## Execution
1. Write failing integration tests using synthetic Git repositories and the existing owner controls.
2. Implement descriptor binding, source verification, and the narrow policy exception as one risky task.
3. Review independently, document trust limits, refresh source hashes, and run final checks.
4. Open this layer's PR against the selected parent. Do not merge or install.

## Conclusion
This layer provides source preparation, not installation acceptance.
The next layer must package installation and verify a disposable real SDK host.
Reviewed Gradle code remains trusted code, not sandboxed code.

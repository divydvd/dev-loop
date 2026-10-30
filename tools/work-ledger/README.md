# Work ledger

## Abstract

This directory preserves the owner's work-ledger SDK extension in maintained source.
The source now corrects Maven and Firebase publication classification.
It also adds confirmed owner controls with temporary repository or session scope.
Verified local Maven recovery uses the same controls and owner-maintained scope descriptors.
The [owner package](INSTALL.md) adds pinned preview, installation, backup, and rollback.
Source preparation does not change the live guard.

## Boundary

The extension is separate from the dev-loop Copilot plugin.
The plugin does not load this directory.
The extension uses `joinSession` from `@github/copilot-sdk/extension` in a compatible extension host.
Node can run the pure helper tests without that SDK.

Do not run `extension.mjs` as a standalone script against an ordinary Copilot home.
Its startup creates ledger files.
No live installation, configuration, ledger, or approval data belongs in this directory.

## Source provenance

The owner approved this source location and the unchanged import on 2026-10-30.
The import contains `extension.mjs` and eight files under `lib/`.
All nine files match the installed source at import time.
The existing source includes owner-specific defaults, including `defaultRepo`.
These defaults are preserved, not recommended for other owners.

`BASELINE.sha256` records the original nine files and remains unchanged after later fixes.
`SOURCE.sha256` records the maintained release files.
Update the release manifest when an implementation file changes.
Do not update the baseline manifest to hide an implementation change.

The original import retains the defects in [issue #11](https://github.com/divydvd/dev-loop/issues/11).
The maintained source corrects the classification defects described below.
The controls below implement the approved subset of individual pauses.
The existing global owner commands remain separate.

## Publication classification

Generated `publish<Publication>PublicationToMavenLocal`, `publish<Publication>PublicationTo<Destination>Repository`,
and `publishAllPublicationsTo<Destination>Repository` tasks have the `maven` target.
The aggregate `publishToMavenLocal` task also has that target.
These tasks no longer request Play Store approval.

Maven publication remains blocked until the build source and destination are verified.
This includes `KitTestRepository` and tasks named `MavenLocal`.
A task name is not a sandbox and does not prove that the build executes only local actions.
No destination is trusted because its name contains `Local` or `KitTest`.
Existing deployment approvals cannot bypass this block.
The verified exception below provides that bounded recovery path in maintained source.

`appDistributionUploadDebug` and other `appDistributionUpload` variants require Firebase approval, not Play approval.
Play tasks such as `publishReleaseBundle` still require Play approval.
Other publish and promote names retain the conservative Play check.
Mixed commands retain separate findings for each recognized target.
The shared Gradle lane, configuration checks, and genuine deployment checks remain active.

## Partial owner controls

The supported checks are `rebase`, `amend`, `force-push`, `push-main`, `review-limit`, `test-cache`, and descriptor-bound `maven`.
Each check defaults to enabled.
A pause changes enforcement only. It does not change instructions or approve an action.
For example, a paused history check does not authorize an agent to rewrite history.

Type a complete command directly in the owner chat:

```text
guard test-cache off
guard review-limit off in session for 10m
guard test-cache on
guards status
```

The default scope is the repository, and the default pause lasts 30 minutes.
Explicit durations range from `1m` through `24h`.
Only `repository` and `session` scopes exist.
Global and permanent individual pauses are not supported.
A session pause records both the repository and the requesting session.
An unresolved repository or session cannot receive a pause.

Both `off` and `on` first create a preview.
The request does not change enforcement.
The preview names the check, state, scope, repository, session when applicable, and absolute expiry.
It supplies a confirmation command, such as:

```text
guard confirm <token> test-cache off in repository example/project until <ISO-expiry>
```

Type the exact confirmation as a separate direct message in the same repository and session.
Do not enclose it in quotes or a code block.
The token is random and binds all preview fields.
A preview expires after five minutes, or at the pause expiry when earlier.
The pause expiry starts at request time, not confirmation time.
A newer request in that session replaces its previous preview.
Used, stale, changed, and cross-context confirmations cannot activate a pause.
Agent messages, forwarded messages, quoted text, and the session's initial user message cannot create or confirm controls.
These checks use the existing SDK's direct-user event boundary, not a second account authentication service.

`guards status` and `work_ledger_get` show the individual state, overlapping pauses, expiry, pending previews, and recent audit events.
The atomic ledger retains the latest 200 control audit events.
The existing rotating history also records commands and outcomes.
Controls do not remove approvals or evidence.
An expired pause has no effect on the next policy decision, even without a timer or another ledger write.
Restoring a session pause leaves an overlapping repository pause active, and the reverse also applies.
The legacy `guards on` removes only the legacy global disable and reports remaining individual pauses.
The legacy `guards off` remains a separate global control; status identifies its override.
The existing singular aliases, `guard on` and `guard off`, retain the same legacy behavior.
Direct legacy commands retain case and whitespace compatibility, including `guards ON` and `guard  on`.
Quoted, forwarded, agent, and initial messages still cannot change guard state.
No new command writes the legacy `DISABLED` file.

Repository pauses apply across worktrees that resolve to the same canonical GitHub repository.
Policy uses the action repository, not a configured fallback repository.
Git pushes through named remotes resolve their actual push URLs, including Git URL rewrites, not only their fetch URL.
Literal push URLs retain enforcement because their effective push rewriting is not verified by this layer.
Multiple different push destinations, implicit push remotes, unresolved paths, and identity-changing overrides retain enforcement.
Nested shells, command wrappers, redirects, and compounds with unknown commands also retain enforcement.
Pipelines, background jobs, and `cd` compounds retain enforcement because their action directory is not verified.
Use a verified `git -C` path or a Gradle project-directory option instead.
Review-limit pauses require an independently resolved action repository, even when legacy approval lookup uses a default repository.
They also require an explicit `-R`/`--repo` or a canonical `https://github.com/.../pull/...` URL.
An implicit `gh` repository can differ from `origin`, so it never receives this layer's review-limit pause.
PR option values, such as a title containing `--repo=example/project`, cannot supply that explicit repository.
The `--` marker ends option parsing; later text cannot select a repository or request a reviewer.
Gradle scope recognizes both separated and attached `-p` and `--project-dir` values.
Paths containing a `..` segment retain enforcement because lexical normalization can hide a symlink's physical destination.
Tilde-prefixed action paths also retain enforcement because the shell splitter cannot distinguish quoted and expanded tildes.
An empty Git `-C` keeps the previous directory, as Git requires.
Do not treat syntactic shell context as verified action identity.
API commands with an unknown repository or another host retain enforcement.
Other hosts can share these records only through the same persistent `WORK_LEDGER_DIR`.
The existing directory lock and atomic rename provide shared persistence; this layer adds no remote synchronization.

Merge approval, deployment/configuration approval, source protection, and the shared Gradle build lock are **not configurable here**.
Requests for these names return an explicit error. Unverified Maven remains blocked even during a Maven pause.
The owner requires merge approval and real deployment/configuration approval to remain mandatory.
They are not planned switches. The shared Gradle build lock also remains mandatory.
The Maven name does not provide a blanket exception.
Play or Firebase approvals still cannot authorize Maven.
Every recognized finding in a compound command retains its own check.
Pausing the verification cache retains Gradle recording and the shared lock wrapper.
Interactive commands still require the checked command path.

## Verified local Maven recovery

The owner supplies `localMavenScopes` in the maintained extension's configuration before startup.
The configuration is not installed by this PR.
Do not copy source paths, SHAs, or configuration from another owner.
This synthetic example shows the required fields:

```json
{
  "localMavenScopes": [{
    "repo": "example/project",
    "label": "local test",
    "cwd": "/canonical/project",
    "sha": "<reviewed-full-40-character-lowercase-SHA>",
    "launcher": "/canonical/project/scripts/lowmem/gradlew",
    "command": "./scripts/lowmem/gradlew :core:publishMavenPublicationToKitTestRepository -PkitRepository=/canonical/project/build/kit-test-repository",
    "destination": "/canonical/project/build/kit-test-repository"
  }]
}
```

Review the build code at the specified full SHA before configuring a descriptor.
Confirm that the exact command uses `kitRepository` as its local publication destination.
A task name or property name alone does not establish that fact.
The destination must be a canonical path strictly inside `<cwd>/build/`.
The launcher must be an explicit, tracked `gradlew` pathname inside the project, outside `build/`.
Git checks the launcher as a literal pathname, not a pathspec expression.
Nested launchers are supported. PATH-based launchers are not supported.
Use the canonical absolute launcher or its exact `./project-relative` pathname without `..` or redundant path components.
The project must be the Git root. The source must have that exact clean SHA.
The verifier rejects untracked files that Git does not ignore, staged changes, modified tracked bytes, and hidden index flags.
It overrides Git settings that hide untracked files or rely on filesystem monitor results.
It disables Git replacement objects when comparing source with the reviewed commit.
It rejects tracked symlinks, submodules, unresolved index stages, and symlinks in project, destination, or launcher paths.
Dangling destination symlinks and dangling ancestor symlinks also cause denial.
Byte hashing is conservative: checkout transformations, such as line-ending conversion, can cause a denial.
Projects that overlap protected guard source or data cannot receive the exception.
Containment checks use path components; names such as `..project` and `..ledger` remain inside their parent directory.
The Maven check compares lexical paths and filesystem identities along canonical directory ancestry.
This includes symlinked ancestors and case aliases on case-insensitive filesystems, without conflating distinct case-sensitive directories.
It rejects overlap in either direction, including equal paths.
Every protected root and the project must resolve during verification.
Missing paths, broken aliases, and other resolution errors explicitly deny Maven; no protected root is skipped.
Normal extension startup creates the ledger directory before policy use. This check does not change startup or create directories.

Type these commands directly in the owner chat:

```text
guard maven off
guard maven off in session for 10m
guard maven on
guard maven on in session
guards status
```

Each change requires the exact separate confirmation returned by its preview.
The default repository pause lasts 30 minutes. The existing duration and provenance rules apply.
The preview displays every configured descriptor for that repository.
Confirmation binds their fingerprints, including canonical cwd, SHA, launcher, exact command, and exact destination.
Changing the descriptors before confirmation invalidates the preview.
Changing any descriptor field after confirmation prevents that descriptor from matching.
A new reviewed source commit requires an updated descriptor and a new confirmed pause.
A bare Maven pause without descriptor fingerprints permits nothing.
Restoring one scope leaves an overlapping pause active.
Pauses, previews, and audit records retain scope, expiry, and request/confirmation provenance.

Only a single exact literal command can match.
The command syntax excludes quotes, spaces inside paths, shell operators, environment assignments, wrappers, and redirects.
The supported options are `-PkitRepository=<destination>`, `--offline`, `--no-daemon`, `--console=plain`, and `--stacktrace`.
Alternate project selectors, init scripts, and other options remain blocked.
The descriptor must classify as Maven publication without another recognized deployment.
Every task must be a recognized Maven publication; extra unknown tasks also cause denial.
Unknown or remote destinations and extra Play/Firebase tasks remain denied.
Generic deployment approvals never substitute for this descriptor-bound pause.
The accepted command always receives the existing shared Gradle lock wrapper.
Batched calls are denied because the host contract cannot apply an individual wrapper within a batch.
An unavailable lock binary, disabled lane, or missing lock path also causes denial.
These checks do not execute Gradle during verification.

### Trust limits

The verifier checks source identity. It is not a Gradle sandbox.
Reviewed build code and launchers can execute arbitrary code, including remote operations.
The owner must review those actions; this layer does not prove that arbitrary Gradle code cannot deploy.
Ignored files, global Gradle configuration, environment variables, caches, downloaded dependencies, and external inputs remain trusted inputs.
Do not put unreviewed build logic in ignored paths.
The shared lock serializes cooperating builds, not file edits.
Concurrent source edits after verification, including edits while waiting for the lock, remain a time-of-check risk.
Concurrent changes to protected aliases after verification have the same limit.
Use a controlled checkout without concurrent writers for publication.
Actual host lifecycle evidence and owner-only installation steps appear in [the installation guide](INSTALL.md).
Merge and real deployment approval remain mandatory.

## Checks

Run these commands from the repository root:

```sh
node scripts/check.mjs
node --test tools/work-ledger/*.test.mjs scripts/device-handoff.test.mjs scripts/branch-maintenance.test.mjs
```

The tests call real helpers with synthetic data.
The storage test uses a new temporary directory and removes only that directory.
Runtime contract tests import the real entry point only in child processes with a disposable home and ledger.
Their test-only loader replaces the SDK transport, not the extension, policy, or persistence.
The tests also use real Git repositories with synthetic remotes.
No test executes Gradle, deploys, calls GitHub, uses a phone, spends AI credits, or reads the live ledger.
The wrapper check inspects the lock command without executing it.
The separate [real-host acceptance procedure](INSTALL.md#actual-isolated-cli-evidence) uses the actual bundled SDK in disposable CLI hosts.
It verifies discovery, native tools and hooks, foreground replacement, shutdown, and persisted synthetic notes without a model prompt.
It does not establish desktop reload or installation readiness.

To check the original import, run this command from this directory:

```sh
shasum -a 256 -c BASELINE.sha256
```

That command is an import-time check, not a requirement for corrected source.
For a corrected release, check `SOURCE.sha256` instead.

## Installation boundary

Use the [owner installation guide](INSTALL.md), not a direct copy over an active extension.
`owner-install.mjs` previews by default.
Actual installation needs a pinned request, exact confirmation, and an owner attestation that affected hosts stopped.
The package preserves the whole extension directory and provides a pinned rollback receipt.
Unknown installed runtime changes and any unreviewed drift cause failure.
Optional descriptor additions have their own integrity pin and never replace existing scopes.

`SOURCE.sha256` pins runtime bytes. `PACKAGE.sha256` also pins the installer and owner guides.
Keep the reviewed manifest hashes independently from the files they describe.
The installer never edits external ledger data, approvals, or active pause records.
An owner installation remains separate from source review and PR approval.
Fixture transport tests do not establish actual SDK-host or desktop reload acceptance.

## Conclusion

Review the installation layer separately from classification and descriptor-bound Maven recovery.
The owner must authorize installation and verify fresh affected hosts before claiming a live correction.
Merge and genuine deployment approval, source protection, and the shared build lock remain active.

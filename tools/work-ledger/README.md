# Work ledger

## Abstract

This directory preserves the owner's work-ledger SDK extension in maintained source.
The source now corrects Maven and Firebase publication classification.
It also adds partial, confirmed owner controls with temporary repository or session scope.
It is not an installation package and does not change the live guard.

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
The controls below are a partial layer, not completion of the owner's per-guard request.
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
The next layer must establish a scoped, verified exception for the original local repository publication.

`appDistributionUploadDebug` and other `appDistributionUpload` variants require Firebase approval, not Play approval.
Play tasks such as `publishReleaseBundle` still require Play approval.
Other publish and promote names retain the conservative Play check.
Mixed commands retain separate findings for each recognized target.
The shared Gradle lane, configuration checks, and genuine deployment checks remain active.

## Partial owner controls

The supported checks are `rebase`, `amend`, `force-push`, `push-main`, `review-limit`, and `test-cache`.
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
No new command writes the legacy `DISABLED` file.

Repository pauses apply across worktrees that resolve to the same canonical GitHub repository.
Policy uses the action repository, not a configured fallback repository.
Git pushes through named remotes resolve their actual push URLs, including Git URL rewrites, not only their fetch URL.
Literal push URLs retain enforcement because their effective push rewriting is not verified by this layer.
Multiple different push destinations, implicit push remotes, unresolved paths, and identity-changing overrides retain enforcement.
Nested shells, command wrappers, redirects, and compounds with unknown commands also retain enforcement.
Do not treat syntactic shell context as verified action identity.
API commands with an unknown repository or another host retain enforcement.
Other hosts can share these records only through the same persistent `WORK_LEDGER_DIR`.
The existing directory lock and atomic rename provide shared persistence; this layer adds no remote synchronization.

Merge approval, deployment/configuration approval, unverified Maven, source protection, and the shared Gradle build lock are **not configurable here**.
Requests for these names return an explicit error.
Merge and deployment controls remain an outstanding scope decision, not a permanent exclusion.
The Maven name does not provide a blanket exception.
Play or Firebase approvals still cannot authorize Maven.
Every recognized finding in a compound command retains its own check.
Pausing the verification cache retains Gradle recording and the shared lock wrapper.
Interactive commands still require the checked command path.

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

To check the original import, run this command from this directory:

```sh
shasum -a 256 -c BASELINE.sha256
```

That command is an import-time check, not a requirement for corrected source.
For a corrected release, check `SOURCE.sha256` instead.

## Installation boundary

This maintained source has no supported installation command.
Do not replace an active extension with this directory.
The loader tests establish startup and reload contracts, not actual SDK host acceptance.
The next layer must verify a real disposable host and its restart procedure.

An isolated host check must use a disposable home and a disposable `WORK_LEDGER_DIR`.
The check must not load a second host against the live ledger.
Keep configuration fixtures synthetic.
Document the tested SDK host version and startup command when that procedure is verified.

The later owner package must preserve configuration and provide backup and rollback.
An owner installation remains separate from source review and PR approval.

## Conclusion

Review this controls layer separately from the preserved baseline and classification correction.
Verified local Maven recovery, remaining per-guard controls, an owner installer, and real SDK host acceptance remain outstanding.
The checks cover maintained source only; the original publication remains blocked and the live guard is unchanged.

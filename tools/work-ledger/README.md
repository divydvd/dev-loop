# Work ledger

## Abstract

This directory preserves the owner's work-ledger SDK extension in maintained source.
The source now corrects Maven and Firebase publication classification.
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
It does not add individual switches.
The existing global owner commands are unchanged.

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
The later controls layer must establish a scoped, verified exception for the original local repository publication.

`appDistributionUploadDebug` and other `appDistributionUpload` variants require Firebase approval, not Play approval.
Play tasks such as `publishReleaseBundle` still require Play approval.
Other publish and promote names retain the conservative Play check.
Mixed commands retain separate findings for each recognized target.
The shared Gradle lane, configuration checks, and genuine deployment checks remain active.

## Checks

Run these commands from the repository root:

```sh
node scripts/check.mjs
node --test tools/work-ledger/*.test.mjs
```

The tests call real helpers with synthetic data.
The storage test uses a new temporary directory and removes only that directory.
No test imports the host entry point, executes Gradle, calls GitHub, or reads the live ledger.

To check the original import, run this command from this directory:

```sh
shasum -a 256 -c BASELINE.sha256
```

That command is an import-time check, not a requirement for corrected source.
For a corrected release, check `SOURCE.sha256` instead.

## Installation boundary

This baseline has no supported installation command.
Do not replace an active extension with this directory.
The switch change must first establish isolated host acceptance and a verified restart procedure.

An isolated host check must use a disposable home and a disposable `WORK_LEDGER_DIR`.
The check must not load a second host against the live ledger.
Keep configuration fixtures synthetic.
Document the tested SDK host version and startup command when that procedure is verified.

The later owner package must preserve configuration and provide backup and rollback.
An owner installation remains separate from source review and PR approval.

## Conclusion

Review the classification change separately from the preserved baseline and the later controls layer.
The checks cover maintained source only; they do not prove an operational correction in the live guard.

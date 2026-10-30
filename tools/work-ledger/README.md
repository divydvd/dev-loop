# Work ledger

## Abstract

This directory preserves the owner's work-ledger SDK extension in maintained source.
This first revision is an unchanged baseline, not a corrected release or an installation package.

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

The import intentionally retains the defects in [issue #11](https://github.com/divydvd/dev-loop/issues/11).
It does not add individual switches or correct Maven classification.
The existing global owner commands are unchanged.

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

Review this baseline as an unchanged source import with helper checks.
Do not treat its passing checks as evidence that the reported guard defects are fixed.

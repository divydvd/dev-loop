# Owner installation and rollback

## Abstract

This package prepares the maintained work-ledger extension for owner installation.
Preview validates reviewed inputs without changing the installation, configuration, or ledger.
Installation replaces the extension directory only after an explicit confirmation.
PR approval is not installation permission.

**Installation readiness is blocked by a parent policy finding.**
The Maven layer currently permits a protected ledger path through a symlink.
This layer does not repair that policy finding or authorize installation.
Use the package only after the parent correction receives separate review and verification.

## Safety boundary

Do not install while an affected extension host runs.
An extension host is the CLI process that loads an extension and its SDK child process.
The installer cannot identify or stop every desktop, terminal, remote, or background host.
The `--hosts-stopped` option is an owner attestation, not automatic process detection.
This package never stops sessions, changes approvals, disables guards, deploys, or accesses a phone.

The supported destination is an existing extension directory.
Its runtime must match the archival baseline or this release.
Unknown runtime changes, additional `.mjs` files, symlinks, hard links, and nonregular files cause explicit failure.
Review an unsupported installation separately. Do not remove its unknown files to bypass the check.
Unrelated regular files, nested directories, permissions, and configuration survive.
External configuration and ledger data remain untouched.

Only repository/session pauses exist. They default to 30 minutes and need separate direct owner confirmation.
Merge and real deployment approval remain mandatory by explicit owner decision.
The source protection and shared build lock remain active.
Installation does not create a Maven pause or approve publication.

## Review the package

Use the reviewed PR commit, not a moving branch.
Run these commands from `tools/work-ledger/`:

```sh
shasum -a 256 PACKAGE.sha256 SOURCE.sha256
shasum -a 256 -c PACKAGE.sha256
shasum -a 256 -c SOURCE.sha256
```

Compare both manifest hashes with the PR evidence.
`SOURCE.sha256` pins the eleven runtime files.
`PACKAGE.sha256` also pins the installer, guides, and archival manifest.
The installer uses only Node built-ins before validating candidate code.
It imports verified helper byte copies from a private temporary directory.
Preview removes that temporary directory and creates no persistent backup.

Keep all request files, descriptors, receipts, and backup paths private.
They can contain local paths and configuration.
Do not commit them or attach them to a PR.
Do not copy another owner's scope or an old approval.

## Prepare reviewed inputs

The commands below use placeholders. Replace each uppercase value with a reviewed absolute path or exact hash.
Use canonical paths without symlinks.

1. Select the existing extension directory.
2. Select an owner-only backup directory outside all extension discovery directories.
3. Keep the backup on the installation filesystem.
4. Inspect the complete installed tree without changing it:

```sh
node owner-install.mjs --inspect /ABSOLUTE/EXISTING/EXTENSION
```

The printed hash covers file bytes, directory names, and permission modes.
It includes configuration and unrelated files, not only historical runtime files.
Record this hash as `installedHash`.
The installer checks it again before replacement.

Create a private request file with this structure:

```json
{
  "candidate": "/ABSOLUTE/REVIEWED/CHECKOUT/tools/work-ledger",
  "installed": "/ABSOLUTE/EXISTING/EXTENSION",
  "backupParent": "/ABSOLUTE/PRIVATE/BACKUPS",
  "sourceHash": "REVIEWED_SOURCE_MANIFEST_SHA256",
  "installedHash": "REVIEWED_COMPLETE_INSTALLATION_SHA256"
}
```

The backup parent must not overlap the source, installation, or configured ledger directory.
No component can be named `extensions`.
If the parent already exists, it must belong to the owner and deny group/other access.
The installer creates each transaction directory with mode `0700`.
Validation also rejects temporary roots inside discovery, source, installation, or ledger directories.
Configured ledger paths with symlink components are unsupported.

### Optional descriptor additions

Omit `scopesFile` and `scopesHash` to preserve configuration bytes exactly.
To add reviewed descriptors, supply a separate private JSON file:

```json
{
  "localMavenScopes": [
    {
      "repo": "example/project",
      "label": "local test",
      "cwd": "/canonical/project",
      "sha": "FULL_REVIEWED_40_CHARACTER_LOWERCASE_SHA",
      "launcher": "/canonical/project/gradlew",
      "command": "./gradlew :core:publishMavenPublicationToKitTestRepository -PkitRepository=/canonical/project/build/local",
      "destination": "/canonical/project/build/local"
    }
  ]
}
```

Review the exact launcher and build code first.
The source verifier does not execute Gradle or prove that arbitrary build code cannot deploy.
See the [Maven trust limits](README.md#trust-limits).
The installer verifies descriptor syntax, clean source bytes, tracked launcher, canonical paths, and independently resolved repository identity.
Existing descriptors receive syntax and conflict checks but need not have currently checked-out source.
This permits preservation of existing scopes after their project advances.
Runtime policy still requires exact source and confirmed descriptor fingerprints before publication.

Add these fields to the private request:

```json
{
  "scopesFile": "/ABSOLUTE/PRIVATE/scopes.json",
  "scopesHash": "REVIEWED_DESCRIPTOR_FILE_SHA256",
  "ledgerConfigHash": "REVIEWED_EXTERNAL_CONFIG_SHA256_OR_absent"
}
```

Only `localMavenScopes` additions are accepted.
Unrelated settings remain unchanged.
Existing descriptors are never replaced or removed.
Duplicate repository/label keys and duplicate repository/cwd/command keys fail, including equivalent duplicates.
Make any intentional existing-scope change through a separately reviewed owner action.

The runtime combines ledger-directory configuration with extension-local configuration.
Extension-local settings take precedence.
If the extension has no `localMavenScopes` field, additions must also pin the external configuration.
Use its complete `config.json` byte hash, or the literal `absent` only when that file does not exist.
The installer reads only that configuration file, never ledger contents.
It preserves effective external scopes in the new extension-local array and rechecks the external pin before replacement.
This makes the scopes extension-local; later external edits do not override that array.
Existing extension-local arrays already take precedence and need no external pin.
Malformed arrays and conflicts cause failure rather than a silent empty default.

Use the same `WORK_LEDGER_DIR` environment as the affected host.
Otherwise, the runtime uses the configured `dataDir`, or its normal home-directory default.
Do not point the installer at another host's ledger to bypass validation.

## Preview and install

Make the private request readable only by the owner.
Calculate its exact byte hash after the review:

```sh
chmod 600 /ABSOLUTE/PRIVATE/request.json
shasum -a 256 /ABSOLUTE/PRIVATE/request.json
node owner-install.mjs --request /ABSOLUTE/PRIVATE/request.json --sha256 REQUEST_SHA256
```

Preview is the default.
A successful preview does not authorize or perform installation.
If source, scope, configuration, or unrelated installed files change, repeat the review and preview.
Do not refresh a pin merely to suppress a drift error.

After separate installation authorization, let all affected work finish.
Use the owning application's normal exit controls to close affected hosts.
Do not interrupt another owner's work.
Do not rely on a plugin update, resume message, or PR approval to reload this SDK extension.

The owner then runs:

```sh
node owner-install.mjs --request /ABSOLUTE/PRIVATE/request.json --sha256 REQUEST_SHA256 \
  --install --hosts-stopped --confirm "install REQUEST_SHA256"
```

The confirmation binds the exact request bytes, package manifest pin, installed snapshot, and optional descriptor pin.
The installer stages the whole extension directory before overlaying the reviewed runtime.
It writes a private receipt before replacement.
It rechecks the full tree and code hashes before the final renames.
It also rechecks the incoming tree after moving the outgoing installation.
The original directory moves intact to the transaction's `original` directory.
No backup or stage is placed in an extension discovery directory.

Keep the printed `receiptFile` and `receiptHash`.
Installation reports `reloadVerified: false`.
That value is deliberate: filesystem replacement does not prove a running host uses the new code.

## Rollback and recovery

The receipt identifies both complete tree hashes.
Rollback refuses changed installed or backup files.
It never overwrites unknown drift.
Keep the receipt hash independently; do not trust a changed receipt.

Preview rollback first:

```sh
node owner-install.mjs --rollback /ABSOLUTE/PRIVATE/receipt.json --sha256 RECEIPT_SHA256
```

After separate authorization and stopped-host verification, the owner runs:

```sh
node owner-install.mjs --rollback /ABSOLUTE/PRIVATE/receipt.json --sha256 RECEIPT_SHA256 \
  --install --hosts-stopped --confirm "rollback RECEIPT_SHA256"
```

Rollback restores the original directory, including its configuration and unrelated files.
It preserves the replaced release in the private `displaced` directory.
It does not restore or change ledger data.
Restart and verify affected hosts after rollback.

A failed stage rename automatically restores the original directory.
A failed rollback rename automatically restores the newer installation.
If restoration also fails, the error names the recoverable original directory.
The private receipt remains beside it.
Keep affected hosts stopped. Preserve all transaction directories.
Resolve the filesystem failure before a separately reviewed manual recovery.
Do not delete the original, copy unknown files over it, or repeat installation blindly.

## Startup and restart acceptance

The [official SDK documentation](https://github.com/github/copilot-sdk/blob/e22b95e6ead5e1de7e9a68d3087b8d28dc5f364a/nodejs/docs/extensions.md)
describes CLI extension discovery, automatic SDK resolution, JSON-RPC stdio, replacement, and shutdown.
This documentation does not establish desktop-app reload behavior.

Runtime contract tests use a fixture SDK transport.
Installer tests use real private filesystems and Git repositories.
Neither establishes actual SDK-host startup.
The lifecycle evidence below must distinguish a real host from those simulations.

### Desktop owner handoff

Do not type CLI-only slash commands into the desktop app.
After installation, fully exit the desktop app through its normal controls.
Verify that each affected host and its extension child has exited.
A window close alone does not prove process exit.
Account for independent terminal, remote, and background hosts separately.
Restart the app normally and open a fresh session.
Use the extension's existing `work_ledger_get` tool to inspect guard status.
Verify temporary controls, mandatory protections, and the expected reviewed descriptor.
Obtain a fresh direct owner confirmation before any descriptor-bound Maven pause.

An ON status alone does not prove the installed package identity.
Match a fresh extension process start and its loaded source directory to the verified installed files.
If the app does not expose enough evidence, keep the installation outcome marked unverified.
Do not claim that a resume message or plugin refresh proves replacement.

## Conclusion

The tested package preserves the installation and provides explicit backup and rollback paths.
Only the owner can authorize installation, arrange host shutdown, and validate the desktop restart.
Unknown installed-source changes or incomplete host identity evidence must stop that handoff.

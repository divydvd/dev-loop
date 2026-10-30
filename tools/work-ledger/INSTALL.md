# Owner installation and rollback

## Abstract

This package prepares the maintained work-ledger extension for owner installation.
Preview validates reviewed inputs without changing the installation, configuration, or ledger.
Installation replaces the extension directory only after an explicit confirmation.
PR approval is not installation permission.

**Installation remains unauthorized.**
The integrated parent correction addresses protected-path aliases and three confirmed owner-control defects.
Verify the whole stack's checks and review before a separate owner installation decision.

## Safety boundary

The transaction tests run on macOS with Node.js 26.12.1 and 22.23.4.
The installer requires POSIX ownership and permission modes; Windows is not a supported installation target.
All installed files and directories must be readable and traversable by the owner.
Read-only configuration, runtime files, and nested directories are supported.
The installation root must also be writable for the cross-parent backup rename.
Preview refuses a read-only root without changing its permissions.
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

The printed hash covers file bytes, directory names, and all permission bits, including special bits.
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
  "installedHash": "REVIEWED_COMPLETE_INSTALLATION_SHA256",
  "ledgerConfigHash": "REVIEWED_EXTERNAL_CONFIG_SHA256_OR_absent"
}
```

The backup parent must not overlap the source, installation, or configured ledger directory.
No component can be named `extensions`, including case variants.
If the parent already exists, it must belong to the owner and deny group/other access.
The installer creates each transaction directory with mode `0700`.
Validation also rejects temporary roots inside discovery, source, installation, or ledger directories.
Configured ledger paths with symlink components are unsupported.
Configuration filename case variants are unsupported; use the exact name `config.json`.
Physical directory and ancestor identities prevent case aliases from bypassing the boundary.
Uncreated case variants are treated as overlapping until their separation can be established.
Use an absolute `WORK_LEDGER_DIR`; the installer does not expand its literal tilde.
Only configured `dataDir` expands an initial tilde, as the runtime does.
Relative ledger paths are unsupported because the host working directory is unknown.

### Optional descriptor additions

Omit `scopesFile` and `scopesHash` to preserve configuration bytes exactly.
Without additions, the installer does not rewrite the staged configuration, including a read-only file.
All approved runtime and configuration writes use separate private files with the original permission bits.
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
If the extension has no `localMavenScopes` field, every request must pin the effective external configuration.
Use its complete `config.json` byte hash, or the literal `absent` only when that file does not exist.
The installer reads only that configuration file, never ledger contents.
It validates effective external descriptors even when no descriptors are added.
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
For older Node copy behavior, it verifies copied bytes and types before restoring pinned directory permission modes.
Only private staging directories receive temporary owner write access.
The installer checks their temporary modes and all file contents before restoring their pinned modes.
It then checks the complete final tree. It never changes active installation permissions.
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
The separate real-host acceptance below does establish actual CLI/SDK lifecycle behavior.

### Actual isolated CLI evidence

The tested host is Copilot CLI `1.0.102-0.unstable.r40141230562.g130d689` on macOS arm64.
Its bundled extension runtime reports Node.js `24.22.1`.
The native binary SHA-256 is `ce1fb3c2159e3712fd634db3f7840280e3026615e9eb604dcd9ed58a55ad3fd5`.
The acceptance script verifies that binary identity, including a cached copy.
Explicit integrity checks remain active under optimized Python.
It downloads the public platform package only when the isolated tooling directory lacks that binary.
The archive also has a pinned SHA-512 integrity value.
Python 3.12 or later and a POSIX pseudoterminal are required.

Run these commands from the repository root:

```sh
python3 tools/work-ledger/fixtures/real-host-acceptance.py \
  --output /ABSOLUTE/PRIVATE/host-proof --layout user
python3 tools/work-ledger/fixtures/real-host-acceptance.py \
  --output /ABSOLUTE/PRIVATE/host-proof --layout project
```

The artifact directory must deny group and other access.
The script creates disposable `HOME`, `COPILOT_HOME`, XDG directories, Git configuration, and `WORK_LEDGER_DIR`.
It never copies credentials, owner configuration, or live ledger data.
It sets `WORK_LEDGER_GH=/usr/bin/false` and starts no Gradle command.
An environment allowlist excludes authentication tokens and API keys.
Offline mode disables GitHub services under the CLI contract.
A loopback model endpoint rejects requests; both tested layouts recorded zero provider requests.
This is not packet-level proof for every network destination.

Both layouts passed sixteen assertions.
The owner installer first applies its pinned transaction to each disposable extension directory.
The disposable configuration and runtime files are read-only.
The nested runtime directory is also read-only.
Their bytes and permission bits remain unchanged across installation and host restart.
The unmodified maintained entry joined through the CLI's actual SDK resolver.
A separate test observer used native SDK metadata and tool APIs, without a model prompt.
The real host registered both maintained tools and invoked the maintained pre-tool hook.
It recorded only synthetic notes, never approvals or validation claims.
The observer saw those notes survive foreground replacement and a complete host restart.
The host replaced the extension child process and stopped old children.
All exits returned zero, with no observed child left running.
Failure cleanup tracks owned process groups and descendants before the first successful snapshot.
It stops remaining owned children and verifies shutdown before another host or directory removal.
An error stops the acceptance run and leaves a sanitized failed result.
If cleanup cannot verify shutdown, it preserves the disposable directory.
The script verifies source and copied runtime hashes after each run.
Its sanitized JSON evidence records the exact source SHA, code hashes, commands, process identities, and sixteen assertion results.
It excludes ledger contents and raw tool results, including the synthetic records used for the persistence assertions.
Private paths are redacted from structured keys and values before JSON escaping, including Unicode, quotes, and backslashes.
The retained report lists environment keys, not values; unrelated private paths in `PATH` cannot enter that field.

The exact foreground host options were:

```sh
"<PINNED-ISOLATED-CLI>" --no-auto-update --no-custom-instructions --disable-builtin-mcps \
  --no-remote --no-remote-export --disable-client-telemetry --experimental \
  --log-level debug --log-dir "<DISPOSABLE>/logs" -C "<DISPOSABLE>/workspace" \
  --no-mouse --screen-reader
```

This CLI build requires `--experimental` for extension discovery.
The script accepts only disposable folder trust and one-session extension consent.
It enters no user prompt.
It sends `/clear` and `/exit` only inside its own disposable CLI.
Do not use these as desktop-app instructions.
An earlier ACP check created sessions but did not load extensions; ACP creation is not lifecycle acceptance.
The real-host check does not exercise every owner-message or enforcement rule.
Those behaviors retain their separate Node and transport-contract tests.

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

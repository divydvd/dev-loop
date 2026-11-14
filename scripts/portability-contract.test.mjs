import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as checkMod from "./check.mjs";

function sanitizedEnv(overrides = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (
      k === "NODE_TEST_CONTEXT" ||
      k.startsWith("GIT_") ||
      k.startsWith("COPILOT_") ||
      k.startsWith("ANTHROPIC_") ||
      k.startsWith("CLAUDE_CODE_") ||
      k === "CLAUDE_CONFIG_DIR"
    ) {
      continue;
    }
    env[k] = v;
  }
  return { ...env, ...overrides };
}

function spawnAsync(cmd, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_BODY = "# Dev-loop core rules\n\n1. Read `AGENTS.md`.\n";
const CORE_MDC = `---\ndescription: Core rules\nalwaysApply: true\n---\n${CORE_BODY}`;

function withFixtureRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "dev-loop-portability-"));
  try {
    mkdirSync(join(dir, ".github/plugin"), { recursive: true });
    mkdirSync(join(dir, "com.github.copilot/rules"), { recursive: true });
    mkdirSync(join(dir, "skills/dev-loop/references/hosts"), { recursive: true });
    writeFileSync(
      join(dir, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "dev-loop",
        version: "0.5.13",
      }),
    );
    writeFileSync(
      join(dir, ".github/plugin/marketplace.json"),
      JSON.stringify({
        name: "dev-loop",
        metadata: { version: "0.5.13" },
        plugins: [{ name: "dev-loop", version: "0.5.13" }],
      }),
    );
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\n## 0.5.13 (2026-11-14)\n- Entry.\n");
    writeFileSync(join(dir, "AGENTS.md"), "# Profile\n");
    writeFileSync(join(dir, "com.github.copilot/rules/core.mdc"), CORE_MDC);
    writeFileSync(
      join(dir, "skills/dev-loop/SKILL.md"),
      "---\nname: dev-loop\ndescription: Use first for each change.\n---\nRead `references/hosts/README.md`.\n",
    );
    writeFileSync(
      join(dir, "skills/dev-loop/references/hosts/README.md"),
      "# Hosts\nSee `references/hosts/copilot.md` and `references/hosts/claude.md`.\n",
    );
    writeFileSync(join(dir, "skills/dev-loop/references/hosts/copilot.md"), "# Copilot\n");
    writeFileSync(join(dir, "skills/dev-loop/references/hosts/claude.md"), "# Claude\n");
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("T-M1-1: checkRepo validates nested skill reference links and rejects path traversal escapes", () => {
  assert.equal(typeof checkMod.checkRepo, "function", "check.mjs must export checkRepo");
  assert.equal(typeof checkMod.stripFrontmatter, "function", "check.mjs must export stripFrontmatter");
  assert.equal(checkMod.stripFrontmatter(CORE_MDC), CORE_BODY);

  withFixtureRepo((dir) => {
    assert.deepEqual(checkMod.checkRepo(dir), []);

    writeFileSync(
      join(dir, "skills/dev-loop/references/hosts/README.md"),
      "Broken `references/hosts/missing.md` link.\n",
    );
    const missingFaults = checkMod.checkRepo(dir);
    assert.ok(
      missingFaults.some((f) => f.includes("skills/dev-loop/references/hosts/README.md") && f.includes("references/hosts/missing.md")),
      `expected missing nested link fault, got: ${missingFaults.join("; ")}`,
    );

    writeFileSync(join(dir, "outside.md"), "# Outside\n");
    writeFileSync(
      join(dir, "skills/dev-loop/references/hosts/README.md"),
      "Escaping `references/../../../outside.md` link.\n",
    );
    const escapeFaults = checkMod.checkRepo(dir);
    assert.ok(
      escapeFaults.some((f) => f.includes("outside.md")),
      `expected path traversal fault even when target exists outside skill dir, got: ${escapeFaults.join("; ")}`,
    );

    // Symlink escape inside references/ pointing outside skill dir
    symlinkSync(join(dir, "outside.md"), join(dir, "skills/dev-loop/references/hosts/symlink-escape.md"));
    writeFileSync(
      join(dir, "skills/dev-loop/references/hosts/README.md"),
      "Symlink `references/hosts/symlink-escape.md` link.\n",
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("symlink-escape.md")),
      "expected symlink escape outside skill dir to fail",
    );
    unlinkSync(join(dir, "skills/dev-loop/references/hosts/symlink-escape.md"));

    // Directory target instead of file
    writeFileSync(
      join(dir, "skills/dev-loop/references/hosts/README.md"),
      "Directory `references/hosts` link.\n",
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("references/hosts")),
      "expected directory link target to fail",
    );
    writeFileSync(join(dir, "skills/dev-loop/references/hosts/README.md"), "# Hosts\nSee `references/hosts/copilot.md`.\n");

    // Broken link inside skills/*/assets/*.md
    mkdirSync(join(dir, "skills/dev-loop/assets"), { recursive: true });
    writeFileSync(join(dir, "skills/dev-loop/assets/template.md"), "Missing `references/nope.md`.\n");
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("skills/dev-loop/assets/template.md") && f.includes("references/nope.md")),
      "expected broken link inside skills/*/assets/*.md to fail",
    );
  });
});

test("T-M1-2: checkRepo enforces multi-host manifest sync, GEMINI.md byte sync, COPILOT_CLI hook guard, and 15 KB startup budget", () => {
  assert.equal(typeof checkMod.checkRepo, "function", "check.mjs must export checkRepo");

  withFixtureRepo((dir) => {
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    mkdirSync(join(dir, ".codex-plugin"), { recursive: true });
    mkdirSync(join(dir, "hooks"), { recursive: true });

    writeFileSync(join(dir, ".claude-plugin/plugin.json"), JSON.stringify({ name: "dev-loop", version: "0.5.13" }));
    writeFileSync(join(dir, ".codex-plugin/plugin.json"), JSON.stringify({ name: "dev-loop", version: "0.5.13" }));
    writeFileSync(
      join(dir, "gemini-extension.json"),
      JSON.stringify({ name: "dev-loop", version: "0.5.13", contextFileName: "GEMINI.md" }),
    );
    writeFileSync(join(dir, "GEMINI.md"), CORE_BODY);
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup|clear|compact",
              hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/session-start" }],
            },
          ],
        },
      }),
    );
    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"core"}}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);

    assert.deepEqual(checkMod.checkRepo(dir), []);

    // 1. Version mismatch across host manifests
    writeFileSync(join(dir, ".claude-plugin/plugin.json"), JSON.stringify({ name: "dev-loop", version: "0.5.12" }));
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/plugin.json") && f.includes("version")));
    writeFileSync(join(dir, ".claude-plugin/plugin.json"), JSON.stringify({ name: "dev-loop", version: "0.5.13" }));

    // 2. Missing contextFileName or drifted GEMINI.md
    writeFileSync(join(dir, "gemini-extension.json"), JSON.stringify({ name: "dev-loop", version: "0.5.13" }));
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("gemini-extension.json") && f.includes("contextFileName")));
    writeFileSync(
      join(dir, "gemini-extension.json"),
      JSON.stringify({ name: "dev-loop", version: "0.5.13", contextFileName: "GEMINI.md" }),
    );
    writeFileSync(join(dir, "GEMINI.md"), `${CORE_BODY}extra drifted line\n`);
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("GEMINI.md")));
    writeFileSync(join(dir, "GEMINI.md"), CORE_BODY);

    // 3. Unguarded hooks/session-start under COPILOT_CLI=1 (nested, top-level additionalContext, systemMessage, non-executable, orphan, custom script)
    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"duplicate core"}}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("COPILOT_CLI")));

    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nprintf \'{"additionalContext":"top-level dup"}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("COPILOT_CLI")), "top-level additionalContext must fail under COPILOT_CLI=1");

    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nprintf \'{"systemMessage":"top-level msg"}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("COPILOT_CLI")), "systemMessage must fail under COPILOT_CLI=1");

    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"core"}}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o644);
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("executable")), "non-executable hook script must fail");
    chmodSync(join(dir, "hooks/session-start"), 0o755);

    // Custom hook script path in hooks.json
    writeFileSync(
      join(dir, "hooks/custom-start.sh"),
      '#!/usr/bin/env bash\nprintf \'{"additionalContext":"custom dup"}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/custom-start.sh"), 0o755);
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/custom-start.sh" }] }],
        },
      }),
    );
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("custom-start.sh") && f.includes("COPILOT_CLI")), "custom SessionStart script must also obey COPILOT_CLI=1");
    unlinkSync(join(dir, "hooks/custom-start.sh"));

    // Escaping symlink at hooks/session-start when hooks.json does not reference it
    unlinkSync(join(dir, "hooks/session-start"));
    symlinkSync("/bin/echo", join(dir, "hooks/session-start"));
    writeFileSync(join(dir, "hooks/hooks.json"), JSON.stringify({ hooks: {} }));
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/session-start") && f.includes("escapes")),
      "symlinked hooks/session-start escaping root must fail containment",
    );
    unlinkSync(join(dir, "hooks/session-start"));

    // Non-Copilot SessionStart exit 1, non-object JSON, and oversized systemMessage
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "startup|clear|compact", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/session-start" }] }],
        },
      }),
    );
    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nexit 1\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/session-start")),
      "SessionStart exiting 1 when COPILOT_CLI is unset must fail",
    );

    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'["not-an-object"]\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/session-start")),
      "SessionStart emitting JSON array when COPILOT_CLI is unset must fail",
    );

    writeFileSync(
      join(dir, "hooks/session-start"),
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"systemMessage":"${"s".repeat(15_001)}"}\\n'\n`,
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("15000") || f.includes("15 KB")),
      "SessionStart oversized systemMessage when COPILOT_CLI is unset must fail 15 KB budget",
    );

    // Polyglot wrapper command ("${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start)
    writeFileSync(
      join(dir, "hooks/run-hook.cmd"),
      ': << \'CMDBLOCK\'\nexit /b 0\nCMDBLOCK\nSCRIPT_DIR="$(cd "${0%[/\\\\]*}" && pwd)"\nSCRIPT_NAME="$1"\nshift\nexec "${BASH:-bash}" "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"\n',
    );
    chmodSync(join(dir, "hooks/run-hook.cmd"), 0o755);
    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ok"}}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup|clear|compact",
              hooks: [{ type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start', shell: "bash" }],
            },
          ],
        },
      }),
    );
    assert.deepEqual(checkMod.checkRepo(dir), [], "guarded polyglot run-hook.cmd session-start must pass");
    unlinkSync(join(dir, "hooks/run-hook.cmd"));

    // Compound shell operators in SessionStart command must be rejected (preventing unvalidated second commands)
    writeFileSync(join(dir, "hooks/safe.sh"), '#!/usr/bin/env bash\nprintf "{}\\n"\n');
    writeFileSync(join(dir, "hooks/dup.sh"), '#!/usr/bin/env bash\nprintf \'{"additionalContext":"dup"}\\n\'\n');
    chmodSync(join(dir, "hooks/safe.sh"), 0o755);
    chmodSync(join(dir, "hooks/dup.sh"), 0o755);
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [{ type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/hooks/safe.sh" && "${CLAUDE_PLUGIN_ROOT}/hooks/dup.sh"' }],
            },
          ],
        },
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/hooks.json") && f.includes("unsupported")),
      "compound shell operators in SessionStart command must fail validation",
    );
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [{ type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/hooks/safe.sh"\n./hooks/dup.sh' }],
            },
          ],
        },
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/hooks.json") && f.includes("unsupported")),
      "newline command separator in SessionStart command must fail validation",
    );
    unlinkSync(join(dir, "hooks/safe.sh"));
    unlinkSync(join(dir, "hooks/dup.sh"));

    // Mutually exclusive SessionStart matchers (8,000 bytes startup + 8,000 bytes compact) pass, while overlapping matchers fail
    writeFileSync(
      join(dir, "hooks/startup-only.sh"),
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"additionalContext":"${"a".repeat(8_000)}"}\\n'\n`,
    );
    writeFileSync(
      join(dir, "hooks/compact-only.sh"),
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"additionalContext":"${"b".repeat(8_000)}"}\\n'\n`,
    );
    chmodSync(join(dir, "hooks/startup-only.sh"), 0o755);
    chmodSync(join(dir, "hooks/compact-only.sh"), 0o755);
    unlinkSync(join(dir, "hooks/session-start"));
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "startup", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/startup-only.sh" }] },
            { matcher: "compact", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/compact-only.sh" }] },
          ],
        },
      }),
    );
    assert.deepEqual(checkMod.checkRepo(dir), [], "mutually exclusive startup and compact hooks under 15 KB each must pass");

    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "startup", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/startup-only.sh" }] },
            { matcher: "startup|compact", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/compact-only.sh" }] },
          ],
        },
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("15000") || f.includes("15 KB")),
      "overlapping startup matchers exceeding 15 KB together must fail",
    );
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "^(foo|bar)$", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/startup-only.sh" }] },
            { matcher: "^(foo|baz)$", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/compact-only.sh" }] },
          ],
        },
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("15000") || f.includes("15 KB")),
      "overlapping grouped custom matchers exceeding 15 KB together must fail",
    );
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "cust[12]", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/startup-only.sh" }] },
            { matcher: "cust[13]", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/compact-only.sh" }] },
          ],
        },
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("15000") || f.includes("15 KB")),
      "non-literal regex matchers exceeding 15 KB together must fail conservatively",
    );
    unlinkSync(join(dir, "hooks/startup-only.sh"));
    unlinkSync(join(dir, "hooks/compact-only.sh"));
    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ok"}}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);

    // Orphan hooks/session-start without hooks/hooks.json
    unlinkSync(join(dir, "hooks/hooks.json"));
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("hooks/hooks.json")), "orphan hooks/session-start without hooks/hooks.json must fail");
    writeFileSync(
      join(dir, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "startup|clear|compact", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/session-start" }] }],
        },
      }),
    );

    // Non-object JSON in manifests or hooks.json
    writeFileSync(join(dir, ".claude-plugin/plugin.json"), "null\n");
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/plugin.json")), "JSON null manifest must fail");
    writeFileSync(join(dir, ".claude-plugin/plugin.json"), JSON.stringify({ name: "dev-loop", version: "0.5.13" }));

    // Missing core.mdc even if another .mdc exists
    writeFileSync(join(dir, "com.github.copilot/rules/extra.mdc"), CORE_MDC);
    unlinkSync(join(dir, "com.github.copilot/rules/core.mdc"));
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("com.github.copilot/rules/core.mdc")), "missing core.mdc must fail");
    unlinkSync(join(dir, "com.github.copilot/rules/extra.mdc"));
    writeFileSync(join(dir, "com.github.copilot/rules/core.mdc"), CORE_MDC);

    // 4. Exact 15,000-byte (PASS) vs 15,001-byte (FAIL) UTF-8 boundary (including multi-byte characters) and Claude hook startup budget
    const coreMdcBytes = Buffer.byteLength(CORE_MDC, "utf8");
    const prefix = "# Profile\n";
    const remainingEven = 15_000 - coreMdcBytes - Buffer.byteLength(prefix, "utf8");
    const multiByteBody = `${"é".repeat(Math.floor(remainingEven / 2))}${"x".repeat(remainingEven % 2)}`;
    writeFileSync(join(dir, "AGENTS.md"), `${prefix}${multiByteBody}`);
    assert.equal(Buffer.byteLength(readFileSync(join(dir, "AGENTS.md"), "utf8"), "utf8") + coreMdcBytes, 15_000);
    assert.deepEqual(checkMod.checkRepo(dir), []);

    writeFileSync(join(dir, "AGENTS.md"), `${prefix}${multiByteBody}z`);
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("15000") || f.includes("15 KB")), "15,001 UTF-8 bytes must fail");

    // Claude SessionStart additionalContext exceeding 15,000 bytes with AGENTS.md
    writeFileSync(join(dir, "AGENTS.md"), `# Profile\n${"x".repeat(14_995)}\n`);
    writeFileSync(
      join(dir, "com.github.copilot/rules/core.mdc"),
      "---\ndescription: tiny\nalwaysApply: true\n---\n# Tiny\n",
    );
    writeFileSync(join(dir, "GEMINI.md"), "# Tiny\n");
    writeFileSync(
      join(dir, "hooks/session-start"),
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"${"y".repeat(200)}"}}\\n'\n`,
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(checkMod.checkRepo(dir).some((f) => f.includes("15000") || f.includes("15 KB")), "Claude hook additionalContext + AGENTS.md > 15,000 bytes must fail");

    // 5. CLI subprocess execution through symlinked tmpdir path returns exit 1 on fault and 0 when clean
    mkdirSync(join(dir, "scripts"), { recursive: true });
    copyFileSync(join(REPO_ROOT, "scripts/check.mjs"), join(dir, "scripts/check.mjs"));
    const failRun = spawnSync(process.execPath, [join(dir, "scripts/check.mjs")], { encoding: "utf8" });
    assert.equal(failRun.status, 1, `expected exit 1 on faulty symlinked tmpdir repo, got ${failRun.status}`);
    assert.match(failRun.stderr, /check: \d+ fault/);

    writeFileSync(join(dir, "AGENTS.md"), "# Profile\n");
    const okRun = spawnSync(process.execPath, [join(dir, "scripts/check.mjs")], { encoding: "utf8" });
    assert.equal(okRun.status, 0, `expected exit 0 on clean symlinked tmpdir repo, got ${okRun.status}: ${okRun.stderr}`);
    assert.match(okRun.stdout, /check: no faults/);
  });
});

function section(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#+)\s/);
    if (match && match[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

test("T-M1-3: host capability contract, Copilot adapter, SKILL.md routing, PR template, and Rule/check map stay aligned while core.mdc stays unchanged", () => {
  // checkRepo enforces required host guides even if SKILL.md drops inline links
  withFixtureRepo((dir) => {
    writeFileSync(
      join(dir, "skills/dev-loop/SKILL.md"),
      "---\nname: dev-loop\ndescription: Use first for each change.\n---\n# Dev loop\n",
    );
    unlinkSync(join(dir, "skills/dev-loop/references/hosts/copilot.md"));
    unlinkSync(join(dir, "skills/dev-loop/references/hosts/README.md"));
    const faults = checkMod.checkRepo(dir);
    assert.ok(
      faults.some((f) => f.includes("references/hosts/README.md")),
      `checkRepo must require skills/dev-loop/references/hosts/README.md, got: ${faults.join("; ")}`,
    );
    assert.ok(
      faults.some((f) => f.includes("references/hosts/copilot.md")),
      `checkRepo must require skills/dev-loop/references/hosts/copilot.md, got: ${faults.join("; ")}`,
    );
  });

  const hostsReadmePath = join(REPO_ROOT, "skills/dev-loop/references/hosts/README.md");
  const copilotHostPath = join(REPO_ROOT, "skills/dev-loop/references/hosts/copilot.md");
  assert.equal(existsSync(hostsReadmePath), true, "missing skills/dev-loop/references/hosts/README.md");
  assert.equal(existsSync(copilotHostPath), true, "missing skills/dev-loop/references/hosts/copilot.md");

  const hostsReadme = readFileSync(hostsReadmePath, "utf8");
  assert.match(hostsReadme, /runtime environment|available tools/i);
  assert.match(hostsReadme, /never.*model|not.*model/i);
  assert.match(hostsReadme, /using-superpowers/);
  assert.match(hostsReadme, /browser.*canvas/i);
  assert.match(hostsReadme, /file:\/\//);
  assert.match(hostsReadme, /github-pr-media/);
  assert.match(hostsReadme, /orchestrate/);
  assert.match(hostsReadme, /pr-stack/);
  assert.match(hostsReadme, /work_ledger_record/);
  assert.match(hostsReadme, /copilot-pull-request-reviewer/);
  assert.match(hostsReadme, /git push --force/);
  assert.match(hostsReadme, /gh pr merge/);

  const copilotHost = readFileSync(copilotHostPath, "utf8");
  assert.match(copilotHost, /com\.github\.copilot\/rules\/core\.mdc/);
  assert.match(copilotHost, /browser.*canvas/i);
  assert.match(copilotHost, /github-pr-media/);
  assert.match(copilotHost, /orchestrate/);
  assert.match(copilotHost, /pr-stack/);
  assert.match(copilotHost, /work_ledger_record/);
  assert.match(copilotHost, /tools\/work-ledger/);

  const skillText = readFileSync(join(REPO_ROOT, "skills/dev-loop/SKILL.md"), "utf8");
  assert.match(section(skillText, "## Before you start"), /references\/hosts\/README\.md/);
  assert.match(section(skillText, "## 1. Route"), /references\/hosts\/README\.md/);
  const shipSection = section(skillText, "## 7. Ship");
  assert.match(shipSection, /references\/hosts\/README\.md/);
  assert.match(shipSection, /repository.*not.*coding host|regardless of.*host|independent of.*host/i);
  assert.match(shipSection, /## Evidence/);

  const prBody = readFileSync(join(REPO_ROOT, "skills/dev-loop/assets/pr-body.md"), "utf8");
  assert.match(section(prBody, "## Screenshots"), /github-pr-media.*unavailable|upload skill is unavailable/i);
  assert.match(hostsReadme, /delete the empty.*table/i);
  assert.match(shipSection, /delete the empty.*table/i);
  assert.match(section(prBody, "### GitHub Copilot review"), /repository.*automatic review|regardless of.*coding host/i);

  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
  const ruleMap = section(readme, "## Rule/check map");
  assert.match(ruleMap, /\[Plugin check\]\(scripts\/check\.mjs\)/);
  assert.match(ruleMap, /\[Portability contract suite\]\(scripts\/portability-contract\.test\.mjs\)/);

  const coreMdc = readFileSync(join(REPO_ROOT, "com.github.copilot/rules/core.mdc"), "utf8");
  assert.ok(coreMdc.trimEnd().split(/\r?\n/).length <= 60, "core.mdc must remain <= 60 lines");
  assert.match(coreMdc, /^---\r?\n[\s\S]*?alwaysApply:\s*true[\s\S]*?\r?\n---\r?\n/);
  assert.ok(Buffer.byteLength(coreMdc, "utf8") <= 15_000, "core.mdc must fit within startup budget");
});

test("T-M2-1: Claude Code manifests, marketplace parity, and SessionStart hook single-source contract", () => {
  withFixtureRepo((dir) => {
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-plugin/plugin.json"),
      JSON.stringify({ name: "dev-loop", version: "0.5.13" }),
    );
    writeFileSync(
      join(dir, ".claude-plugin/marketplace.json"),
      JSON.stringify({
        name: "dev-loop",
        metadata: { version: "0.5.13" },
        plugins: [{ name: "wrong-name", source: "./", version: "0.5.13" }],
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/marketplace.json") && f.includes('no plugin entry named "dev-loop"')),
      "expected checkRepo to reject missing dev-loop entry in .claude-plugin/marketplace.json",
    );

    writeFileSync(
      join(dir, ".claude-plugin/marketplace.json"),
      JSON.stringify({
        name: "dev-loop",
        metadata: { version: "0.5.13" },
        plugins: [{ name: "dev-loop", source: "./", version: "0.0.1" }],
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/marketplace.json") && f.includes("differs from plugin.json")),
      "expected checkRepo to reject divergent plugin version in .claude-plugin/marketplace.json",
    );

    writeFileSync(
      join(dir, ".claude-plugin/marketplace.json"),
      JSON.stringify({
        name: "dev-loop",
        metadata: { version: "0.0.1" },
        plugins: [{ name: "dev-loop", source: "./", version: "0.5.13" }],
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/marketplace.json") && f.includes("metadata.version")),
      "expected checkRepo to reject divergent metadata.version in .claude-plugin/marketplace.json",
    );

    writeFileSync(
      join(dir, ".claude-plugin/marketplace.json"),
      JSON.stringify({
        name: "dev-loop",
        metadata: { version: "0.5.13" },
        plugins: [{ name: "dev-loop", source: "./", version: "0.5.13" }],
      }),
    );
    assert.deepEqual(checkMod.checkRepo(dir), []);
  });

  const rootPlugin = JSON.parse(readFileSync(join(REPO_ROOT, "plugin.json"), "utf8"));
  assert.notEqual(rootPlugin.version, "0.5.13", "M2 must bump plugin.json version past 0.5.13");

  const claudePluginPath = join(REPO_ROOT, ".claude-plugin/plugin.json");
  const claudeMarketPath = join(REPO_ROOT, ".claude-plugin/marketplace.json");
  assert.ok(existsSync(claudePluginPath), "missing .claude-plugin/plugin.json");
  assert.ok(existsSync(claudeMarketPath), "missing .claude-plugin/marketplace.json");

  const claudePlugin = JSON.parse(readFileSync(claudePluginPath, "utf8"));
  const claudeMarket = JSON.parse(readFileSync(claudeMarketPath, "utf8"));
  assert.equal(claudePlugin.name, rootPlugin.name);
  assert.equal(claudePlugin.version, rootPlugin.version);
  assert.equal(claudeMarket.metadata?.version, rootPlugin.version);
  const marketEntry = (claudeMarket.plugins ?? []).find((p) => p.name === rootPlugin.name);
  assert.ok(marketEntry, "missing dev-loop entry in .claude-plugin/marketplace.json");
  assert.equal(marketEntry.version, rootPlugin.version);
  assert.equal(marketEntry.source, "./");

  const hooksJsonPath = join(REPO_ROOT, "hooks/hooks.json");
  const runHookPath = join(REPO_ROOT, "hooks/run-hook.cmd");
  const sessionStartPath = join(REPO_ROOT, "hooks/session-start");
  assert.ok(existsSync(hooksJsonPath), "missing hooks/hooks.json");
  assert.ok(existsSync(runHookPath), "missing hooks/run-hook.cmd");
  assert.ok(existsSync(sessionStartPath), "missing hooks/session-start");
  assert.ok((statSync(runHookPath).mode & 0o111) !== 0, "hooks/run-hook.cmd must be executable (+x)");
  assert.ok((statSync(sessionStartPath).mode & 0o111) !== 0, "hooks/session-start must be executable (+x)");

  const hooksJson = JSON.parse(readFileSync(hooksJsonPath, "utf8"));
  const sessionStartGroups = hooksJson?.hooks?.SessionStart;
  assert.ok(Array.isArray(sessionStartGroups) && sessionStartGroups.length === 1, "expected 1 SessionStart hook group");
  assert.equal(sessionStartGroups[0].matcher, "startup|resume|clear|compact");
  assert.equal(
    sessionStartGroups[0].hooks?.[0]?.command,
    '"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start',
  );
  assert.equal(sessionStartGroups[0].hooks?.[0]?.async, false);

  const expectedCoreBody = checkMod.stripFrontmatter(
    readFileSync(join(REPO_ROOT, "com.github.copilot/rules/core.mdc"), "utf8"),
  );

  // Guard: COPILOT_CLI=1 must emit "{}\n" so GitHub Copilot CLI never double-loads core.mdc
  const copilotRun = spawnSync("/bin/bash", [runHookPath, "session-start"], {
    cwd: REPO_ROOT,
    env: sanitizedEnv({ COPILOT_CLI: "1" }),
    encoding: "utf8",
  });
  assert.equal(copilotRun.status, 0, copilotRun.stderr);
  assert.equal(copilotRun.stderr, "");
  assert.equal(copilotRun.stdout, "{}\n");
  assert.deepEqual(JSON.parse(copilotRun.stdout), {});

  // Claude Code execution (including empty PATH per anthropics/claude-code#43127)
  for (const pathEnv of [process.env.PATH ?? "/usr/bin:/bin", ""]) {
    const claudeRun = spawnSync("/bin/bash", [runHookPath, "session-start"], {
      cwd: REPO_ROOT,
      env: sanitizedEnv({ PATH: pathEnv }),
      encoding: "utf8",
    });
    assert.equal(claudeRun.status, 0, `failed with PATH="${pathEnv}": ${claudeRun.stderr}`);
    assert.equal(claudeRun.stderr, "");
    const parsed = JSON.parse(claudeRun.stdout);
    assert.deepEqual(parsed, {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: expectedCoreBody,
      },
    });
  }

  // CRLF frontmatter tolerance on a temporary plugin copy
  const crlfDir = mkdtempSync(join(tmpdir(), "dev-loop-crlf-hook-"));
  try {
    mkdirSync(join(crlfDir, "com.github.copilot/rules"), { recursive: true });
    mkdirSync(join(crlfDir, "hooks"), { recursive: true });
    copyFileSync(runHookPath, join(crlfDir, "hooks/run-hook.cmd"));
    copyFileSync(sessionStartPath, join(crlfDir, "hooks/session-start"));
    chmodSync(join(crlfDir, "hooks/run-hook.cmd"), 0o755);
    chmodSync(join(crlfDir, "hooks/session-start"), 0o755);
    const crlfMdc = `---\r\ndescription: CRLF test\r\nalwaysApply: true\r\n---\r\n${expectedCoreBody}`;
    writeFileSync(join(crlfDir, "com.github.copilot/rules/core.mdc"), crlfMdc);
    const crlfRun = spawnSync("/bin/bash", [join(crlfDir, "hooks/run-hook.cmd"), "session-start"], {
      cwd: crlfDir,
      env: sanitizedEnv({ PATH: "" }),
      encoding: "utf8",
    });
    assert.equal(crlfRun.status, 0, crlfRun.stderr);
    assert.equal(JSON.parse(crlfRun.stdout).hookSpecificOutput.additionalContext, expectedCoreBody);
  } finally {
    rmSync(crlfDir, { recursive: true, force: true });
  }

  const agentsBytes = Buffer.byteLength(readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8"), "utf8");
  const coreBytes = Buffer.byteLength(expectedCoreBody, "utf8");
  assert.ok(
    coreBytes + agentsBytes <= 15_000,
    `Claude startup context (${coreBytes + agentsBytes} bytes) exceeds 15,000-byte budget`,
  );
  assert.deepEqual(checkMod.checkRepo(REPO_ROOT), []);
});

test("T-M2-2: Claude Code CLI validates, installs, injects core.mdc once on startup and resume, and uninstalls cleanly", async (t) => {
  const versionProbe = spawnSync("claude", ["--version"], {
    env: sanitizedEnv(),
    encoding: "utf8",
  });
  if (versionProbe.error?.code === "ENOENT") {
    t.skip("claude CLI not installed on this runner");
    return;
  }
  assert.equal(versionProbe.status, 0, versionProbe.stderr);

  // 1. Validate repo marketplace and plugin manifest with claude plugin validate --strict --json
  for (const target of [".", ".claude-plugin/plugin.json"]) {
    const val = spawnSync("claude", ["plugin", "validate", "--strict", "--json", target], {
      cwd: REPO_ROOT,
      env: sanitizedEnv(),
      encoding: "utf8",
    });
    assert.equal(val.status, 0, `claude plugin validate ${target} failed: ${val.stdout}\n${val.stderr}`);
    const parsedVal = JSON.parse(val.stdout);
    assert.equal(parsedVal.success, true, `validate ${target} did not succeed: ${val.stdout}`);
    assert.ok(parsedVal.manifest, `expected non-null manifest for ${target}: ${val.stdout}`);
    assert.deepEqual(parsedVal.manifest.errors, []);
    assert.deepEqual(parsedVal.manifest.warnings, []);
    for (const item of parsedVal.contents ?? []) {
      assert.deepEqual(item.errors, [], `errors in ${item.file}`);
      assert.deepEqual(item.warnings, [], `warnings in ${item.file}`);
    }
  }

  // 2. Isolated CLAUDE_CONFIG_DIR install, list, disable, and uninstall lifecycle on REPO_ROOT
  const rootPlugin = JSON.parse(readFileSync(join(REPO_ROOT, "plugin.json"), "utf8"));
  const tmpRoot = mkdtempSync(join(tmpdir(), "dev-loop-claude-cli-"));
  try {
    const configDir = join(tmpRoot, "claude-home");
    mkdirSync(configDir, { recursive: true });
    const cliEnv = sanitizedEnv({ CLAUDE_CONFIG_DIR: configDir });

    const installRes = spawnSync(
      "claude",
      ["plugin", "install", "--marketplace", REPO_ROOT, "dev-loop"],
      { cwd: tmpRoot, env: cliEnv, encoding: "utf8" },
    );
    assert.equal(installRes.status, 0, `install failed: ${installRes.stdout}\n${installRes.stderr}`);

    const listRes = spawnSync("claude", ["plugin", "list", "--json"], {
      cwd: tmpRoot,
      env: cliEnv,
      encoding: "utf8",
    });
    assert.equal(listRes.status, 0, listRes.stderr);
    const installed = JSON.parse(listRes.stdout);
    const entry = installed.find((p) => p.id === "dev-loop@dev-loop");
    assert.ok(entry, `expected dev-loop@dev-loop in ${listRes.stdout}`);
    assert.equal(entry.version, rootPlugin.version);
    assert.equal(entry.enabled, true);

    const disableRes = spawnSync("claude", ["plugin", "disable", "dev-loop@dev-loop"], {
      cwd: tmpRoot,
      env: cliEnv,
      encoding: "utf8",
    });
    assert.equal(disableRes.status, 0, disableRes.stderr);

    const uninstallRes = spawnSync("claude", ["plugin", "uninstall", "dev-loop@dev-loop"], {
      cwd: tmpRoot,
      env: cliEnv,
      encoding: "utf8",
    });
    assert.equal(uninstallRes.status, 0, uninstallRes.stderr);
    const afterUninstall = JSON.parse(
      spawnSync("claude", ["plugin", "list", "--json"], { cwd: tmpRoot, env: cliEnv, encoding: "utf8" }).stdout,
    );
    assert.deepEqual(afterUninstall, []);

    // 3. Wire-capture verification (P01 & P10 only — proves binary hook execution, prompt assembly,
    // skill catalog discovery, and single-load parity on startup + resume; never substitutes for LLM reasoning P02-P09).
    const marker = `DEV_LOOP_CLAUDE_WIRE_${randomUUID()}`;
    const pluginCopy = join(tmpRoot, "plugin-copy");
    cpSync(REPO_ROOT, pluginCopy, {
      recursive: true,
      filter: (src) => !src.includes("/.git") && !src.includes("/node_modules") && !src.includes("/.superpowers"),
    });
    const coreCopyPath = join(pluginCopy, "com.github.copilot/rules/core.mdc");
    writeFileSync(coreCopyPath, `${readFileSync(coreCopyPath, "utf8")}\n<!-- ${marker} -->\n`);

    const wireConfigDir = join(tmpRoot, "wire-claude-home");
    const projectDir = join(tmpRoot, "sample-project");
    mkdirSync(wireConfigDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    const agentsMarker = `PROJECT_PROFILE_MARKER_${randomUUID()}`;
    writeFileSync(join(projectDir, "AGENTS.md"), `# Sample Project Profile\n\nMarker: ${agentsMarker}\n`);
    spawnSync("git", ["init", "-q"], { cwd: projectDir, env: sanitizedEnv() });

    const wireInstall = spawnSync(
      "claude",
      ["plugin", "install", "--marketplace", pluginCopy, "dev-loop"],
      { cwd: projectDir, env: sanitizedEnv({ CLAUDE_CONFIG_DIR: wireConfigDir }), encoding: "utf8" },
    );
    assert.equal(wireInstall.status, 0, `${wireInstall.stdout}\n${wireInstall.stderr}`);

    const capturedBodies = [];
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        if (req.url?.startsWith("/v1/messages")) {
          capturedBodies.push(body);
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: `msg_${capturedBodies.length}`,
            type: "message",
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [{ type: "text", text: "wire-captured" }],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
        );
      });
    });

    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const { port } = server.address();
      const runEnv = sanitizedEnv({
        CLAUDE_CONFIG_DIR: wireConfigDir,
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      });
      const sessionId = randomUUID();
      const settingsJson = JSON.stringify({ apiKeyHelper: "printf sk-ant-wire-probe" });

      const startupRun = await spawnAsync(
        "claude",
        ["-p", "--session-id", sessionId, "--output-format", "json", "--settings", settingsJson, "startup wire probe"],
        { cwd: projectDir, env: runEnv },
      );
      assert.equal(startupRun.status, 0, `${startupRun.stdout}\n${startupRun.stderr}`);
      assert.ok(capturedBodies.length >= 1, "expected at least 1 outbound /v1/messages request on startup");

      const startupPayload = capturedBodies[0];
      assert.equal(
        startupPayload.split(marker).length - 1,
        1,
        "expected unique core.mdc marker exactly once in startup /v1/messages payload",
      );
      assert.ok(startupPayload.includes(agentsMarker), "expected project AGENTS.md in startup /v1/messages payload");
      for (const skillName of [
        "dev-loop:dev-loop",
        "dev-loop:design-review",
        "dev-loop:flow-docs",
        "dev-loop:infra-review",
      ]) {
        assert.ok(startupPayload.includes(skillName), `expected skill ${skillName} in Claude tool catalog`);
      }

      const beforeResumeCount = capturedBodies.length;
      const resumeRun = await spawnAsync(
        "claude",
        ["-p", "--resume", sessionId, "--output-format", "json", "--settings", settingsJson, "resume wire probe"],
        { cwd: projectDir, env: runEnv },
      );
      assert.equal(resumeRun.status, 0, `${resumeRun.stdout}\n${resumeRun.stderr}`);
      assert.ok(capturedBodies.length > beforeResumeCount, "expected outbound /v1/messages request on resume");

      const resumePayload = capturedBodies[capturedBodies.length - 1];
      assert.equal(
        resumePayload.split(marker).length - 1,
        1,
        "expected unique core.mdc marker exactly once on --resume (0 duplicate injection)",
      );
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("T-M2-3: Claude Code host guide is required by checkRepo, linked from hosts/README.md, and documents all M2 host deltas while core.mdc stays untouched", () => {
  withFixtureRepo((dir) => {
    unlinkSync(join(dir, "skills/dev-loop/references/hosts/claude.md"));
    writeFileSync(
      join(dir, "skills/dev-loop/references/hosts/README.md"),
      "# Hosts\nSee `references/hosts/copilot.md`.\n",
    );
    const faults = checkMod.checkRepo(dir);
    assert.ok(
      faults.some((f) => f.includes("required host reference references/hosts/claude.md is missing")),
      `expected missing claude.md fault, got: ${faults.join("; ")}`,
    );
  });

  const hostsReadme = readFileSync(join(REPO_ROOT, "skills/dev-loop/references/hosts/README.md"), "utf8");
  assert.match(hostsReadme, /`references\/hosts\/claude\.md`/);

  const claudeHostPath = join(REPO_ROOT, "skills/dev-loop/references/hosts/claude.md");
  assert.ok(existsSync(claudeHostPath), "missing skills/dev-loop/references/hosts/claude.md");
  const claudeHost = readFileSync(claudeHostPath, "utf8");

  assert.match(claudeHost, /^## Abstract$/m);
  assert.match(claudeHost, /^## Conclusion$/m);
  assert.match(claudeHost, /CLAUDE_PLUGIN_ROOT/);
  assert.match(claudeHost, /COPILOT_CLI/);
  assert.match(claudeHost, /hooks\/session-start/);
  assert.match(claudeHost, /startup\|resume\|clear\|compact/);
  assert.match(claudeHost, /hookSpecificOutput\.additionalContext/);
  assert.match(claudeHost, /claude-code-tools\.md/);
  assert.match(claudeHost, /\bAgent\b/);
  assert.match(claudeHost, /ultrareview/i);
  assert.match(claudeHost, /independent review unavailable/i);
  assert.match(claudeHost, /EnterWorktree/);
  assert.match(claudeHost, /file:\/\//);
  assert.match(claudeHost, /github-pr-media/);
  assert.match(claudeHost, /delete the empty.*table/i);
  assert.match(claudeHost, /gh pr create --base/);
  assert.match(claudeHost, /PreToolUse/);
  assert.match(claudeHost, /work_ledger_record/);
  assert.match(claudeHost, /git push --force/);
  assert.match(claudeHost, /gh pr merge/);
  assert.match(claudeHost, /copilot-pull-request-reviewer/);
  assert.match(claudeHost, /claude plugin validate --strict/);
  assert.match(claudeHost, /claude plugin install --marketplace/);

  assert.deepEqual(checkMod.checkRepo(REPO_ROOT), []);

  const ruleDiff = spawnSync(
    "git",
    [
      "--no-pager",
      "diff",
      "3351237cd769ea6b6ceae0eda47550e6b1471b27",
      "--",
      "com.github.copilot/rules/core.mdc",
      "skills/dev-loop/SKILL.md",
      "skills/design-review/SKILL.md",
      "skills/flow-docs/SKILL.md",
      "skills/infra-review/SKILL.md",
    ],
    { cwd: REPO_ROOT, env: sanitizedEnv(), encoding: "utf8" },
  );
  if (ruleDiff.status === 0) {
    assert.equal(ruleDiff.stdout, "", "core.mdc and skills/*/SKILL.md must have 0 diff lines vs M1 base");
  }
});


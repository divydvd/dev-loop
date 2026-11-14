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
      k === "CLAUDECODE" ||
      k.startsWith("CLAUDE_") ||
      k.startsWith("GEMINI_")
    ) {
      continue;
    }
    env[k] = v;
  }
  return { ...env, ...overrides };
}

function claudeCliEnv(configDir, overrides = {}) {
  if (typeof configDir !== "string" || !configDir.trim()) {
    throw new Error("claudeCliEnv requires a non-empty temporary CLAUDE_CONFIG_DIR");
  }
  return sanitizedEnv({ ...overrides, CLAUDE_CONFIG_DIR: configDir });
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
      "# Hosts\nSee `references/hosts/copilot.md`, `references/hosts/claude.md`, and `references/hosts/gemini.md`.\n",
    );
    writeFileSync(join(dir, "skills/dev-loop/references/hosts/copilot.md"), "# Copilot\n");
    writeFileSync(join(dir, "skills/dev-loop/references/hosts/claude.md"), "# Claude\n");
    writeFileSync(join(dir, "skills/dev-loop/references/hosts/gemini.md"), "# Gemini\n");
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
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ] || [ -n "${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"core"}}\\n\'\n',
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
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ] || [ -n "${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"core"}}\\n\'\n',
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
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ] || [ -n "${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nexit 1\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/session-start")),
      "SessionStart exiting 1 when COPILOT_CLI is unset must fail",
    );

    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ] || [ -n "${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'["not-an-object"]\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/session-start")),
      "SessionStart emitting JSON array when COPILOT_CLI is unset must fail",
    );

    writeFileSync(
      join(dir, "hooks/session-start"),
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ] || [ -n "\${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"systemMessage":"${"s".repeat(15_001)}"}\\n'\n`,
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
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ] || [ -n "${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ok"}}\\n\'\n',
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
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ] || [ -n "\${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"additionalContext":"${"a".repeat(8_000)}"}\\n'\n`,
    );
    writeFileSync(
      join(dir, "hooks/compact-only.sh"),
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ] || [ -n "\${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"additionalContext":"${"b".repeat(8_000)}"}\\n'\n`,
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
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ] || [ -n "${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ok"}}\\n\'\n',
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
    unlinkSync(join(dir, "gemini-extension.json"));
    unlinkSync(join(dir, "GEMINI.md"));
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
    writeFileSync(
      join(dir, "hooks/session-start"),
      `#!/usr/bin/env bash\nif [ -n "\${COPILOT_CLI:-}" ] || [ -n "\${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"${"y".repeat(200)}"}}\\n'\n`,
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
  const prevClaudeCode = process.env.CLAUDECODE;
  const prevClaudePluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const prevGeminiProjectDir = process.env.GEMINI_PROJECT_DIR;
  try {
    process.env.CLAUDECODE = "1";
    process.env.CLAUDE_PLUGIN_ROOT = "/tmp/stale-claude-plugin";
    process.env.GEMINI_PROJECT_DIR = "/tmp/stale-gemini-project";
    const clean = sanitizedEnv();
    assert.equal(clean.CLAUDECODE, undefined, "sanitizedEnv must strip CLAUDECODE nested-session sentinel");
    assert.equal(clean.CLAUDE_PLUGIN_ROOT, undefined, "sanitizedEnv must strip inherited CLAUDE_PLUGIN_ROOT");
    assert.equal(clean.GEMINI_PROJECT_DIR, undefined, "sanitizedEnv must strip inherited GEMINI_PROJECT_DIR");
    assert.throws(() => claudeCliEnv(""), /CLAUDE_CONFIG_DIR/);
    assert.equal(claudeCliEnv("/tmp/isolated-claude").CLAUDE_CONFIG_DIR, "/tmp/isolated-claude");
    const selfSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
    assert.doesNotMatch(
      selfSource,
      /spawn(?:Async|Sync)\(\s*"claude"[\s\S]{0,220}?env:\s*sanitizedEnv\(\)/,
      "every claude CLI invocation must supply an isolated CLAUDE_CONFIG_DIR",
    );
  } finally {
    if (prevClaudeCode === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = prevClaudeCode;
    if (prevClaudePluginRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = prevClaudePluginRoot;
    if (prevGeminiProjectDir === undefined) delete process.env.GEMINI_PROJECT_DIR;
    else process.env.GEMINI_PROJECT_DIR = prevGeminiProjectDir;
  }

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
        name: "drifted-marketplace",
        metadata: { version: "0.5.13" },
        plugins: [{ name: "dev-loop", source: "./", version: "0.5.13" }],
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/marketplace.json") && f.includes("drifted-marketplace")),
      "expected checkRepo to reject divergent top-level name in .claude-plugin/marketplace.json",
    );

    writeFileSync(
      join(dir, ".claude-plugin/marketplace.json"),
      JSON.stringify({
        name: "dev-loop",
        metadata: { version: "0.5.13" },
        plugins: { name: "dev-loop" },
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/marketplace.json") && f.includes("plugins")),
      "expected checkRepo to reject non-array plugins in .claude-plugin/marketplace.json without throwing",
    );

    const outsideMarketDir = mkdtempSync(join(tmpdir(), "dev-loop-m2-outside-market-"));
    try {
      const outsideMarketPath = join(outsideMarketDir, "outside-marketplace.json");
      writeFileSync(
        outsideMarketPath,
        JSON.stringify({
          name: "dev-loop",
          metadata: { version: "0.5.13" },
          plugins: [{ name: "dev-loop", source: "./", version: "0.5.13" }],
        }),
      );
      unlinkSync(join(dir, ".claude-plugin/marketplace.json"));
      symlinkSync(outsideMarketPath, join(dir, ".claude-plugin/marketplace.json"));
      assert.ok(
        checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/marketplace.json") && f.includes("escapes root")),
        "expected checkRepo to reject .claude-plugin/marketplace.json symlinks escaping root",
      );
      unlinkSync(join(dir, ".claude-plugin/marketplace.json"));
    } finally {
      rmSync(outsideMarketDir, { recursive: true, force: true });
    }

    writeFileSync(
      join(dir, ".claude-plugin/marketplace.json"),
      JSON.stringify({
        name: "dev-loop",
        metadata: { version: "0.5.13" },
        plugins: [{ name: "dev-loop", source: "./", version: "0.5.13" }],
      }),
    );
    assert.deepEqual(checkMod.checkRepo(dir), []);

    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-plugin/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup|resume|clear|compact",
              hooks: [{ type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/hooks/session-start"', shell: "bash" }],
            },
          ],
        },
      }),
    );
    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ] || [ -n "${GEMINI_PROJECT_DIR:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ok"}}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes(".claude-plugin/plugin.json") && f.includes("./.claude-plugin/hooks.json")),
      'expected checkRepo to require "hooks": "./.claude-plugin/hooks.json" in .claude-plugin/plugin.json when .claude-plugin/hooks.json exists',
    );

    writeFileSync(
      join(dir, ".claude-plugin/plugin.json"),
      JSON.stringify({ name: "dev-loop", version: "0.5.13", hooks: "./.claude-plugin/hooks.json" }),
    );
    assert.deepEqual(checkMod.checkRepo(dir), []);

    writeFileSync(
      join(dir, "hooks/session-start"),
      '#!/usr/bin/env bash\nif [ -n "${COPILOT_CLI:-}" ]; then printf "{}\\n"; exit 0; fi\nprintf \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"gemini-dup"}}\\n\'\n',
    );
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/session-start") && f.includes("GEMINI_PROJECT_DIR")),
      "expected checkRepo to reject SessionStart hook emitting context when GEMINI_PROJECT_DIR is set",
    );

    writeFileSync(join(dir, "hooks/session-start"), "#!/usr/bin/env bash\r\necho '{}'\r\n");
    chmodSync(join(dir, "hooks/session-start"), 0o755);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("hooks/session-start") && f.includes("LF line endings")),
      "expected checkRepo to reject CRLF in executable hook script referenced by .claude-plugin/hooks.json",
    );
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
  assert.equal(claudePlugin.hooks, "./.claude-plugin/hooks.json");
  assert.equal(claudeMarket.metadata?.version, rootPlugin.version);
  const marketEntry = (claudeMarket.plugins ?? []).find((p) => p.name === rootPlugin.name);
  assert.ok(marketEntry, "missing dev-loop entry in .claude-plugin/marketplace.json");
  assert.equal(marketEntry.version, rootPlugin.version);
  assert.equal(marketEntry.source, "./");

  const legacyHooksJsonPath = join(REPO_ROOT, "hooks/hooks.json");
  const claudeHooksJsonPath = join(REPO_ROOT, ".claude-plugin/hooks.json");
  const runHookPath = join(REPO_ROOT, "hooks/run-hook.cmd");
  const sessionStartPath = join(REPO_ROOT, "hooks/session-start");
  assert.equal(
    existsSync(legacyHooksJsonPath),
    false,
    "hooks/hooks.json must not exist at repo root because Gemini CLI auto-loads <extensionDir>/hooks/hooks.json",
  );
  assert.ok(existsSync(claudeHooksJsonPath), "missing .claude-plugin/hooks.json");
  assert.ok(existsSync(runHookPath), "missing hooks/run-hook.cmd");
  assert.ok(existsSync(sessionStartPath), "missing hooks/session-start");
  assert.ok((statSync(runHookPath).mode & 0o111) !== 0, "hooks/run-hook.cmd must be executable (+x)");
  assert.ok((statSync(sessionStartPath).mode & 0o111) !== 0, "hooks/session-start must be executable (+x)");

  const gitAttrs = spawnSync("git", ["check-attr", "eol", "hooks/run-hook.cmd", "hooks/session-start"], {
    cwd: REPO_ROOT,
    env: sanitizedEnv(),
    encoding: "utf8",
  });
  assert.equal(gitAttrs.status, 0, gitAttrs.stderr);
  assert.match(gitAttrs.stdout, /hooks\/run-hook\.cmd: eol: lf/);
  assert.match(gitAttrs.stdout, /hooks\/session-start: eol: lf/);

  const runHookCmdText = readFileSync(runHookPath, "utf8");
  const cmdBlock = runHookCmdText.split(/\nCMDBLOCK\r?\n/)[0] ?? "";
  assert.match(cmdBlock, /%COPILOT_CLI%/, "Windows cmd.exe block must guard COPILOT_CLI");
  assert.match(cmdBlock, /%GEMINI_PROJECT_DIR%/, "Windows cmd.exe block must guard GEMINI_PROJECT_DIR");
  assert.match(cmdBlock, /%CLAUDE_PLUGIN_ROOT%/, "Windows cmd.exe block must guard empty CLAUDE_PLUGIN_ROOT");

  const hooksJson = JSON.parse(readFileSync(claudeHooksJsonPath, "utf8"));
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

  // Defense-in-depth guards on both run-hook.cmd and session-start:
  // COPILOT_CLI non-empty, GEMINI_PROJECT_DIR non-empty, and CLAUDE_PLUGIN_ROOT unset/empty must all emit "{}\n" and exit 0
  const suppressedEnvs = [
    { label: "COPILOT_CLI=1", overrides: { CLAUDE_PLUGIN_ROOT: REPO_ROOT, COPILOT_CLI: "1" } },
    { label: "GEMINI_PROJECT_DIR set", overrides: { CLAUDE_PLUGIN_ROOT: REPO_ROOT, GEMINI_PROJECT_DIR: "/tmp/gemini-proj" } },
    { label: "CLAUDE_PLUGIN_ROOT unset", overrides: {} },
    { label: "CLAUDE_PLUGIN_ROOT empty", overrides: { CLAUDE_PLUGIN_ROOT: "" } },
  ];
  for (const { label, overrides } of suppressedEnvs) {
    for (const [shellBin, pathEnv] of [
      ["/bin/bash", process.env.PATH ?? "/usr/bin:/bin"],
      ["/bin/sh", ""],
    ]) {
      const wrapperRun = spawnSync(shellBin, [runHookPath, "session-start"], {
        cwd: REPO_ROOT,
        env: sanitizedEnv({ ...overrides, PATH: pathEnv }),
        encoding: "utf8",
      });
      assert.equal(wrapperRun.status, 0, `run-hook.cmd (${label}, ${shellBin}) failed: ${wrapperRun.stderr}`);
      assert.equal(wrapperRun.stderr, "");
      assert.equal(wrapperRun.stdout, "{}\n", `run-hook.cmd (${label}, ${shellBin}) must emit "{}\\n"`);
      assert.deepEqual(JSON.parse(wrapperRun.stdout), {});
    }

    const directRun = spawnSync("/bin/bash", [sessionStartPath], {
      cwd: REPO_ROOT,
      env: sanitizedEnv({ ...overrides, PATH: "" }),
      encoding: "utf8",
    });
    assert.equal(directRun.status, 0, `session-start (${label}) failed: ${directRun.stderr}`);
    assert.equal(directRun.stderr, "");
    assert.equal(directRun.stdout, "{}\n", `session-start (${label}) must emit "{}\\n"`);
    assert.deepEqual(JSON.parse(directRun.stdout), {});
  }

  // Claude Code execution (including empty PATH and CDPATH=. with a relative script path)
  for (const [scriptArg, extraEnv] of [
    [runHookPath, { CLAUDE_PLUGIN_ROOT: REPO_ROOT, PATH: process.env.PATH ?? "/usr/bin:/bin" }],
    [runHookPath, { CLAUDE_PLUGIN_ROOT: REPO_ROOT, PATH: "" }],
    ["hooks/run-hook.cmd", { CLAUDE_PLUGIN_ROOT: REPO_ROOT, PATH: "", CDPATH: "." }],
  ]) {
    const claudeRun = spawnSync("/bin/bash", [scriptArg, "session-start"], {
      cwd: REPO_ROOT,
      env: sanitizedEnv(extraEnv),
      encoding: "utf8",
    });
    assert.equal(claudeRun.status, 0, `failed for ${scriptArg} (${JSON.stringify(extraEnv)}): ${claudeRun.stderr}`);
    assert.equal(claudeRun.stderr, "");
    const parsed = JSON.parse(claudeRun.stdout);
    assert.deepEqual(parsed, {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: expectedCoreBody,
      },
    });
  }

  // Early pipe closure / closed stdout must exit 0 without SIGPIPE (141) or stderr noise
  const pipeCloseRun = spawnSync(
    "/bin/bash",
    ["-c", 'set -o pipefail; "hooks/run-hook.cmd" session-start | true'],
    {
      cwd: REPO_ROOT,
      env: sanitizedEnv({ CLAUDE_PLUGIN_ROOT: REPO_ROOT }),
      encoding: "utf8",
    },
  );
  assert.equal(pipeCloseRun.status, 0, `pipe close exited ${pipeCloseRun.status}: ${pipeCloseRun.stderr}`);
  assert.equal(pipeCloseRun.stderr, "");

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
      env: sanitizedEnv({ CLAUDE_PLUGIN_ROOT: crlfDir, PATH: "" }),
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
  const tmpRoot = mkdtempSync(join(tmpdir(), "dev-loop-claude-cli-"));
  try {
    const probeConfigDir = join(tmpRoot, "probe-claude-home");
    mkdirSync(probeConfigDir, { recursive: true });
    const probeEnv = claudeCliEnv(probeConfigDir);

    const versionProbe = spawnSync("claude", ["--version"], {
      env: probeEnv,
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
        env: probeEnv,
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
    const configDir = join(tmpRoot, "claude-home");
    mkdirSync(configDir, { recursive: true });
    const cliEnv = claudeCliEnv(configDir);

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
      { cwd: projectDir, env: claudeCliEnv(wireConfigDir), encoding: "utf8" },
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
      const runEnv = claudeCliEnv(wireConfigDir, {
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
      "# Hosts\nSee `references/hosts/copilot.md` and `references/hosts/gemini.md`.\n",
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
  assert.match(claudeHost, /GEMINI_PROJECT_DIR/);
  assert.match(claudeHost, /\.claude-plugin\/hooks\.json/);
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
});

test("T-M3-1: checkRepo enforces gemini-extension.json description parity and sync-host-core.mjs syncs/checks GEMINI.md without altering core.mdc", () => {
  const syncScript = join(REPO_ROOT, "scripts/sync-host-core.mjs");
  assert.equal(existsSync(syncScript), true, "missing scripts/sync-host-core.mjs");

  withFixtureRepo((dir) => {
    writeFileSync(
      join(dir, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "dev-loop",
        description: "Canonical description.",
        version: "0.5.13",
      }),
    );
    writeFileSync(join(dir, "GEMINI.md"), CORE_BODY);
    writeFileSync(
      join(dir, "gemini-extension.json"),
      JSON.stringify({
        name: "dev-loop",
        version: "0.5.13",
        description: "Drifted description.",
        contextFileName: "GEMINI.md",
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("gemini-extension.json") && f.includes("description")),
      "mismatched gemini-extension.json description must fail checkRepo",
    );

    writeFileSync(
      join(dir, "gemini-extension.json"),
      JSON.stringify({
        name: "dev-loop",
        version: "0.5.13",
        contextFileName: "GEMINI.md",
      }),
    );
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("gemini-extension.json") && f.includes("description")),
      "omitted gemini-extension.json description must fail checkRepo",
    );

    writeFileSync(
      join(dir, "gemini-extension.json"),
      JSON.stringify({
        name: "dev-loop",
        version: "0.5.13",
        description: "Canonical description.",
        contextFileName: "GEMINI.md",
      }),
    );
    assert.deepEqual(checkMod.checkRepo(dir), []);

    // Orphan GEMINI.md without gemini-extension.json and escaping GEMINI.md symlink must fail checkRepo
    unlinkSync(join(dir, "gemini-extension.json"));
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("gemini-extension.json") && f.includes("GEMINI.md")),
      "orphan GEMINI.md without gemini-extension.json must fail checkRepo",
    );
    writeFileSync(
      join(dir, "gemini-extension.json"),
      JSON.stringify({
        name: "dev-loop",
        version: "0.5.13",
        description: "Canonical description.",
        contextFileName: "GEMINI.md",
      }),
    );
    const extOutside = mkdtempSync(join(tmpdir(), "dev-loop-ext-symlink-"));
    try {
      const outsideGemini = join(extOutside, "outside-GEMINI.md");
      writeFileSync(outsideGemini, CORE_BODY);
      unlinkSync(join(dir, "GEMINI.md"));
      symlinkSync(outsideGemini, join(dir, "GEMINI.md"));
      assert.ok(
        checkMod.checkRepo(dir).some((f) => f.includes("GEMINI.md") && f.includes("escapes")),
        "symlinked GEMINI.md escaping root must fail checkRepo containment",
      );
      const symlinkSyncCheck = spawnSync(process.execPath, [syncScript, "--check", dir], {
        env: sanitizedEnv(),
        encoding: "utf8",
      });
      assert.notEqual(symlinkSyncCheck.status, 0, "sync-host-core.mjs must reject symlinked GEMINI.md even when bytes match");
      unlinkSync(join(dir, "GEMINI.md"));
    } finally {
      rmSync(extOutside, { recursive: true, force: true });
    }

    // Broken or escaping symlink on gemini-extension.json must also fail checkRepo
    writeFileSync(join(dir, "GEMINI.md"), CORE_BODY);
    unlinkSync(join(dir, "gemini-extension.json"));
    symlinkSync(join(dir, "missing-manifest.json"), join(dir, "gemini-extension.json"));
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("gemini-extension.json")),
      "broken gemini-extension.json symlink must fail checkRepo",
    );
    unlinkSync(join(dir, "gemini-extension.json"));
    writeFileSync(
      join(dir, "gemini-extension.json"),
      JSON.stringify({
        name: "dev-loop",
        version: "0.5.13",
        description: "Canonical description.",
        contextFileName: "GEMINI.md",
      }),
    );
    unlinkSync(join(dir, "GEMINI.md"));

    // sync-host-core.mjs creates missing GEMINI.md, rejects unknown flags, detects drift under --check, and restores parity without touching core.mdc
    const badFlag = spawnSync(process.execPath, [syncScript, dir, "--unknown-flag"], {
      env: sanitizedEnv(),
      encoding: "utf8",
    });
    assert.equal(badFlag.status, 1, "unknown CLI flag must exit 1 without writing GEMINI.md");
    assert.equal(existsSync(join(dir, "GEMINI.md")), false, "unknown CLI flag must not create GEMINI.md");

    const createRun = spawnSync(process.execPath, [syncScript, dir], {
      env: sanitizedEnv(),
      encoding: "utf8",
    });
    assert.equal(createRun.status, 0, `initial sync-host-core.mjs create must exit 0: ${createRun.stderr}`);
    assert.equal(readFileSync(join(dir, "GEMINI.md"), "utf8"), CORE_BODY);

    writeFileSync(join(dir, "GEMINI.md"), "# Drifted\n");
    const checkDrift = spawnSync(process.execPath, [syncScript, "--check", dir], {
      env: sanitizedEnv(),
      encoding: "utf8",
    });
    assert.equal(checkDrift.status, 1, "sync-host-core.mjs --check must exit 1 when GEMINI.md drifts");

    const syncRun = spawnSync(process.execPath, [syncScript, dir], {
      env: sanitizedEnv(),
      encoding: "utf8",
    });
    assert.equal(syncRun.status, 0, `sync-host-core.mjs must exit 0: ${syncRun.stderr}`);
    assert.equal(readFileSync(join(dir, "GEMINI.md"), "utf8"), CORE_BODY);
    assert.equal(readFileSync(join(dir, "com.github.copilot/rules/core.mdc"), "utf8"), CORE_MDC);

    const checkSynced = spawnSync(process.execPath, [syncScript, "--check", dir], {
      env: sanitizedEnv(),
      encoding: "utf8",
    });
    assert.equal(checkSynced.status, 0, "sync-host-core.mjs --check must exit 0 after sync");
    assert.match(checkSynced.stdout, /GEMINI\.md: in sync/);

    // Combined self-repository startup ceilings in checkRepo include mirrored GEMINI.md for Copilot and 2x GEMINI.md for Gemini
    const bigBody = `# Rules\n${"r".repeat(5_295)}\n`;
    const bigCoreMdc = `---\ndescription: Core rules\nalwaysApply: true\n---\n${bigBody}`;
    const bigBodyBytes = Buffer.byteLength(bigBody, "utf8");
    const bigCoreBytes = Buffer.byteLength(bigCoreMdc, "utf8");
    writeFileSync(join(dir, "com.github.copilot/rules/core.mdc"), bigCoreMdc);
    writeFileSync(join(dir, "GEMINI.md"), bigBody);

    const exactAgentsLen = 15_000 - bigCoreBytes - bigBodyBytes;
    const exactAgents = `# Profile\n${"a".repeat(exactAgentsLen - 11)}\n`;
    assert.equal(Buffer.byteLength(exactAgents, "utf8") + bigCoreBytes + bigBodyBytes, 15_000);
    writeFileSync(join(dir, "AGENTS.md"), exactAgents);
    assert.deepEqual(checkMod.checkRepo(dir), [], "combined 15,000-byte self-repo Copilot startup ceiling must pass");

    writeFileSync(join(dir, "AGENTS.md"), `${exactAgents}x`);
    assert.ok(
      checkMod.checkRepo(dir).some((f) => f.includes("com.github.copilot/rules") && (f.includes("15000") || f.includes("15 KB"))),
      "15,001-byte combined self-repo Copilot startup context must fail",
    );

    const exactGeminiAgentsLen = 15_000 - 2 * bigBodyBytes;
    const exactGeminiAgents = `# Profile\n${"a".repeat(exactGeminiAgentsLen - 11)}\n`;
    assert.equal(Buffer.byteLength(exactGeminiAgents, "utf8") + 2 * bigBodyBytes, 15_000);
    writeFileSync(join(dir, "AGENTS.md"), exactGeminiAgents);
    assert.equal(
      checkMod.checkRepo(dir).some((f) => f.includes("GEMINI.md") && (f.includes("15000") || f.includes("15 KB"))),
      false,
      "15,000-byte 2x GEMINI.md self-repo ceiling must not fault GEMINI.md",
    );

    writeFileSync(join(dir, "AGENTS.md"), `${exactGeminiAgents}x`);
    const overBudgetFaults = checkMod.checkRepo(dir);
    assert.ok(
      overBudgetFaults.some((f) => f.includes("com.github.copilot/rules") && (f.includes("15000") || f.includes("15 KB"))),
      `expected Copilot combined self-repo startup ceiling fault, got: ${overBudgetFaults.join("; ")}`,
    );
    assert.ok(
      overBudgetFaults.some((f) => f.includes("GEMINI.md") && (f.includes("15000") || f.includes("15 KB"))),
      `expected Gemini 2x self-repo startup ceiling fault, got: ${overBudgetFaults.join("; ")}`,
    );
  });
});

test("T-M3-2: repository ships gemini-extension.json and byte-identical GEMINI.md within 15 KB consumer and self-repo startup ceilings", async () => {
  const syncMod = await import("./sync-host-core.mjs");
  const plugin = JSON.parse(readFileSync(join(REPO_ROOT, "plugin.json"), "utf8"));
  const marketplace = JSON.parse(readFileSync(join(REPO_ROOT, ".github/plugin/marketplace.json"), "utf8"));
  const claudePlugin = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin/plugin.json"), "utf8"));
  const claudeMarketplace = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin/marketplace.json"), "utf8"));
  const geminiExtPath = join(REPO_ROOT, "gemini-extension.json");
  const geminiMdPath = join(REPO_ROOT, "GEMINI.md");
  assert.equal(existsSync(geminiExtPath), true, "missing root gemini-extension.json");
  assert.equal(existsSync(geminiMdPath), true, "missing root GEMINI.md");

  const geminiExt = JSON.parse(readFileSync(geminiExtPath, "utf8"));
  assert.equal(geminiExt.name, "dev-loop");
  assert.equal(plugin.version, "0.5.15");
  assert.equal(geminiExt.version, plugin.version);
  assert.equal(geminiExt.version, marketplace.metadata.version);
  assert.equal(geminiExt.version, claudePlugin.version);
  assert.equal(geminiExt.version, claudeMarketplace.metadata.version);
  assert.equal(geminiExt.description, plugin.description);
  assert.equal(geminiExt.contextFileName, "GEMINI.md");

  const coreRaw = readFileSync(join(REPO_ROOT, "com.github.copilot/rules/core.mdc"), "utf8");
  const coreBody = checkMod.stripFrontmatter(coreRaw);
  const geminiMd = readFileSync(geminiMdPath, "utf8");
  assert.equal(geminiMd, coreBody, "GEMINI.md must match core.mdc body byte-for-byte");
  assert.equal(syncMod.syncHostCore(REPO_ROOT, { check: true }).synced, true);

  const agentsBytes = Buffer.byteLength(readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8"), "utf8");
  const geminiBytes = Buffer.byteLength(geminiMd, "utf8");
  const coreRawBytes = Buffer.byteLength(coreRaw, "utf8");
  assert.ok(agentsBytes + geminiBytes <= 15_000, `AGENTS.md + GEMINI.md (${agentsBytes + geminiBytes} B) must stay <= 15,000 B`);
  assert.ok(
    agentsBytes + geminiBytes + coreRawBytes <= 15_000,
    `self-repo Copilot startup bytes (${agentsBytes + geminiBytes + coreRawBytes} B) must stay <= 15,000 B`,
  );
  assert.ok(
    agentsBytes + 2 * geminiBytes <= 15_000,
    `self-repo Gemini startup bytes (${agentsBytes + 2 * geminiBytes} B) must stay <= 15,000 B`,
  );

  assert.deepEqual(checkMod.checkRepo(REPO_ROOT), []);
});

test("T-M3-3: Gemini CLI host guide is required by checkRepo, linked from hosts/README.md, and documents Gemini-specific deltas with valid links", () => {
  withFixtureRepo((dir) => {
    unlinkSync(join(dir, "skills/dev-loop/references/hosts/gemini.md"));
    writeFileSync(
      join(dir, "skills/dev-loop/references/hosts/README.md"),
      "# Hosts\nSee `references/hosts/copilot.md` and `references/hosts/claude.md`.\n",
    );
    const faults = checkMod.checkRepo(dir);
    assert.ok(
      faults.some((f) => f.includes("required host reference references/hosts/gemini.md is missing")),
      `expected missing gemini.md fault, got: ${faults.join("; ")}`,
    );
  });

  const hostsReadmePath = join(REPO_ROOT, "skills/dev-loop/references/hosts/README.md");
  const geminiHostPath = join(REPO_ROOT, "skills/dev-loop/references/hosts/gemini.md");
  assert.equal(existsSync(geminiHostPath), true, "missing skills/dev-loop/references/hosts/gemini.md");

  const hostsReadme = readFileSync(hostsReadmePath, "utf8");
  assert.match(hostsReadme, /`references\/hosts\/gemini\.md`/, "hosts/README.md must link `references/hosts/gemini.md`");

  const geminiHost = readFileSync(geminiHostPath, "utf8");
  assert.match(geminiHost, /^## Abstract$/m);
  assert.match(geminiHost, /^## Conclusion$/m);
  assert.match(geminiHost, /gemini-extension\.json/);
  assert.match(geminiHost, /contextFileName/);
  assert.match(geminiHost, /GEMINI\.md/);
  assert.match(geminiHost, /node <dev-loop-checkout>\/scripts\/sync-host-core\.mjs/);
  assert.match(geminiHost, /15 KB|15,000/);
  assert.match(geminiHost, /activate_skill/);
  assert.match(geminiHost, /blocked/i);
  assert.match(geminiHost, /invoke_agent/);
  assert.match(geminiHost, /generalist/);
  assert.match(geminiHost, /gemini-tools\.md/);
  assert.match(geminiHost, /open, not ready: independent review unavailable/);
  assert.match(geminiHost, /ask_user/);
  assert.match(geminiHost, /file:\/\//);
  assert.match(geminiHost, /github-pr-media/);
  assert.match(geminiHost, /gh pr create --base/);
  assert.match(geminiHost, /work_ledger_record/);
  assert.match(geminiHost, /tools\/work-ledger/);
  assert.match(geminiHost, /copilot-pull-request-reviewer/);

  assert.deepEqual(checkMod.checkRepo(REPO_ROOT), []);
});

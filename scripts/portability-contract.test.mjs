import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as checkMod from "./check.mjs";

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
      "# Hosts\nSee `references/hosts/copilot.md`.\n",
    );
    writeFileSync(join(dir, "skills/dev-loop/references/hosts/copilot.md"), "# Copilot\n");
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


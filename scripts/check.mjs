#!/usr/bin/env node
// Exact checks for the dev-loop plugin repo. Prints each fault and exits with code 1 if it finds one.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_RULE_LINES = 60;
const MAX_DESCRIPTION = 1024;
const MAX_ALWAYS_LOADED_BYTES = 15_000;
const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_LINK_RE = /`((?:assets|scripts|references)\/[^`\s]+)`/g;

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function stripFrontmatter(text) {
  return String(text ?? "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function walkMarkdownFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdownFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function collectPluginRootRefs(value, out = []) {
  if (typeof value === "string") {
    for (const [, relPath] of value.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/g)) out.push(relPath);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPluginRootRefs(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectPluginRootRefs(item, out);
  }
  return out;
}

export function checkRepo(root = defaultRoot) {
  const faults = [];
  const fault = (path, message) => faults.push(`${relative(root, path) || "."}: ${message}`);

  function readJson(path) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      fault(path, `cannot read JSON (${error.message})`);
      return null;
    }
  }

  function readFrontmatter(path) {
    const text = readFileSync(path, "utf8");
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!match) return { text, fields: null };
    const fields = {};
    for (const line of match[1].split(/\r?\n/)) {
      const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (pair) fields[pair[1]] = pair[2].trim();
    }
    return { text, fields };
  }

  function checkInsideDir(baseDir, candidateRel) {
    const resolved = resolve(baseDir, candidateRel);
    const rel = relative(baseDir, resolved);
    return !rel.startsWith("..") && !isAbsolute(rel) ? resolved : null;
  }

  function checkManifest() {
    const pluginPath = join(root, "plugin.json");
    const marketPath = join(root, ".github/plugin/marketplace.json");
    const plugin = readJson(pluginPath);
    const market = readJson(marketPath);
    if (!plugin || !market) return;

    if (plugin.$schema !== SCHEMA) fault(pluginPath, `$schema must be ${SCHEMA}`);
    if (!PLUGIN_NAME.test(plugin.name ?? "")) fault(pluginPath, `name "${plugin.name}" is not valid`);
    const version = typeof plugin.version === "string" ? plugin.version : "";
    if (!version) fault(pluginPath, "version is missing or is not a string");

    const entry = (market.plugins ?? []).find((p) => p.name === plugin.name);
    if (!entry) fault(marketPath, `no plugin entry named "${plugin.name}"`);
    else if (entry.version !== plugin.version) {
      fault(marketPath, `version ${entry.version} differs from plugin.json version ${plugin.version}`);
    }
    if (market.metadata?.version !== plugin.version) {
      fault(marketPath, `metadata.version ${market.metadata?.version} differs from plugin.json version ${plugin.version}`);
    }

    for (const relManifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "gemini-extension.json"]) {
      const hostPath = join(root, relManifest);
      if (!existsSync(hostPath)) continue;
      const host = readJson(hostPath);
      if (!host) continue;
      if (host.name !== plugin.name) fault(hostPath, `name "${host.name}" differs from plugin.json name "${plugin.name}"`);
      if (host.version !== plugin.version) {
        fault(hostPath, `version ${host.version} differs from plugin.json version ${plugin.version}`);
      }
      if (relManifest === "gemini-extension.json" && host.contextFileName !== "GEMINI.md") {
        fault(hostPath, 'contextFileName must be "GEMINI.md"');
      }
    }

    const changelogPath = join(root, "CHANGELOG.md");
    if (!existsSync(changelogPath)) fault(changelogPath, "file is missing");
    else if (version && !new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b`, "m").test(readFileSync(changelogPath, "utf8"))) {
      fault(changelogPath, `no "## ${version}" entry`);
    }
  }

  function checkRulesAndStartupBudget() {
    const rulesDir = join(root, "com.github.copilot/rules");
    if (!existsSync(rulesDir)) return fault(rulesDir, "folder is missing");
    let copilotRulesBytes = 0;
    for (const file of readdirSync(rulesDir)) {
      const path = join(rulesDir, file);
      if (!file.endsWith(".mdc")) {
        fault(path, "Copilot loads only .mdc rule files; rename it or remove it");
        continue;
      }
      const { text, fields } = readFrontmatter(path);
      copilotRulesBytes += Buffer.byteLength(text, "utf8");
      if (!fields) {
        fault(path, "frontmatter is missing");
        continue;
      }
      if (!fields.description) fault(path, "frontmatter needs a description");
      if (fields.alwaysApply !== "true" && !fields.globs) {
        fault(path, "set alwaysApply: true or globs, or the rule does not load by default");
      }
      const lines = text.trimEnd().split(/\r?\n/).length;
      if (lines > MAX_RULE_LINES) fault(path, `${lines} lines; the limit is ${MAX_RULE_LINES}`);
    }

    const corePath = join(rulesDir, "core.mdc");
    const geminiExtPath = join(root, "gemini-extension.json");
    const geminiMdPath = join(root, "GEMINI.md");
    if (existsSync(geminiExtPath) || existsSync(geminiMdPath)) {
      if (!existsSync(geminiMdPath)) {
        fault(geminiMdPath, "file is missing while gemini-extension.json is present");
      } else if (existsSync(corePath)) {
        const expectedBody = stripFrontmatter(readFileSync(corePath, "utf8"));
        const actualBody = readFileSync(geminiMdPath, "utf8");
        if (actualBody !== expectedBody) {
          fault(geminiMdPath, "content differs from com.github.copilot/rules/core.mdc body");
        }
      }
    }

    const agentsPath = join(root, "AGENTS.md");
    const agentsBytes = existsSync(agentsPath) ? Buffer.byteLength(readFileSync(agentsPath, "utf8"), "utf8") : 0;
    if (agentsBytes + copilotRulesBytes > MAX_ALWAYS_LOADED_BYTES) {
      fault(rulesDir, `always-loaded startup text is ${agentsBytes + copilotRulesBytes} bytes; the 15 KB limit is ${MAX_ALWAYS_LOADED_BYTES}`);
    }
    if (existsSync(geminiMdPath)) {
      const geminiBytes = agentsBytes + Buffer.byteLength(readFileSync(geminiMdPath, "utf8"), "utf8");
      if (geminiBytes > MAX_ALWAYS_LOADED_BYTES) {
        fault(geminiMdPath, `always-loaded startup text is ${geminiBytes} bytes; the 15 KB limit is ${MAX_ALWAYS_LOADED_BYTES}`);
      }
    }
  }

  function checkHooks() {
    const hooksJsonPath = join(root, "hooks/hooks.json");
    if (!existsSync(hooksJsonPath)) return;
    const hooksCfg = readJson(hooksJsonPath);
    if (!hooksCfg) return;
    for (const relRef of collectPluginRootRefs(hooksCfg)) {
      const target = checkInsideDir(root, relRef);
      if (!target || !existsSync(target)) fault(hooksJsonPath, `referenced hook path ${relRef} is missing or escapes root`);
    }
    const sessionStartPath = join(root, "hooks/session-start");
    if (existsSync(sessionStartPath)) {
      const res = spawnSync("bash", [sessionStartPath], {
        cwd: root,
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: root, COPILOT_CLI: "1" },
        encoding: "utf8",
        timeout: 5_000,
      });
      if (res.status !== 0 || res.error) {
        fault(sessionStartPath, `COPILOT_CLI=1 guard check failed with status ${res.status ?? "error"}`);
      } else {
        const trimmed = (res.stdout || "").trim();
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed?.hookSpecificOutput?.additionalContext) {
              fault(sessionStartPath, "must not emit additionalContext when COPILOT_CLI=1 (causes duplicate core loading)");
            }
          } catch {
            fault(sessionStartPath, "COPILOT_CLI=1 output must be empty or valid empty JSON");
          }
        }
      }
    }
  }

  function checkSkillLinks(skillDir, mdPath, text) {
    for (const [, link] of text.matchAll(SKILL_LINK_RE)) {
      const target = checkInsideDir(skillDir, link);
      if (!target || !existsSync(target)) fault(mdPath, `linked file ${link} is missing or escapes skill folder`);
    }
  }

  function checkSkills() {
    const skillsDir = join(root, "skills");
    if (!existsSync(skillsDir)) return fault(skillsDir, "folder is missing");
    for (const name of readdirSync(skillsDir)) {
      const skillDir = join(skillsDir, name);
      const path = join(skillDir, "SKILL.md");
      if (!existsSync(path)) {
        fault(skillDir, "SKILL.md is missing");
        continue;
      }
      const { text, fields } = readFrontmatter(path);
      if (!fields) {
        fault(path, "frontmatter is missing");
        continue;
      }
      if (fields.name !== name) fault(path, `name "${fields.name}" must equal the folder name "${name}"`);
      if (!SKILL_NAME.test(fields.name ?? "") || fields.name.length > 64) fault(path, "name is not valid");
      if (!fields.description) fault(path, "description is missing");
      else if (fields.description.length > MAX_DESCRIPTION) {
        fault(path, `description has ${fields.description.length} characters; the limit is ${MAX_DESCRIPTION}`);
      }
      checkSkillLinks(skillDir, path, text);
      for (const refFile of walkMarkdownFiles(join(skillDir, "references"))) {
        checkSkillLinks(skillDir, refFile, readFileSync(refFile, "utf8"));
      }
      if (name === "dev-loop") {
        for (const reqRel of ["references/hosts/README.md", "references/hosts/copilot.md"]) {
          const reqPath = join(skillDir, reqRel);
          if (!existsSync(reqPath)) fault(reqPath, `required host reference ${reqRel} is missing`);
        }
      }
    }
  }

  checkManifest();
  checkRulesAndStartupBudget();
  checkHooks();
  checkSkills();
  return faults;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const faults = checkRepo(defaultRoot);
  if (faults.length > 0) {
    console.error(`check: ${faults.length} fault(s)`);
    for (const line of faults) console.error(`- ${line}`);
    process.exit(1);
  }
  console.log("check: no faults");
}

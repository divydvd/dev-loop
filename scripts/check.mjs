#!/usr/bin/env node
// Exact checks for the dev-loop plugin repo. Prints each fault and exits with code 1 if it finds one.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_RULE_LINES = 60;
const MAX_DESCRIPTION = 1024;
const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

  const changelogPath = join(root, "CHANGELOG.md");
  if (!existsSync(changelogPath)) fault(changelogPath, "file is missing");
  else if (version && !new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b`, "m").test(readFileSync(changelogPath, "utf8"))) {
    fault(changelogPath, `no "## ${version}" entry`);
  }
}

function checkRules() {
  const rulesDir = join(root, "com.github.copilot/rules");
  if (!existsSync(rulesDir)) return fault(rulesDir, "folder is missing");
  for (const file of readdirSync(rulesDir)) {
    const path = join(rulesDir, file);
    if (!file.endsWith(".mdc")) {
      fault(path, "Copilot loads only .mdc rule files; rename it or remove it");
      continue;
    }
    const { text, fields } = readFrontmatter(path);
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
}

function checkSkills() {
  const skillsDir = join(root, "skills");
  if (!existsSync(skillsDir)) return fault(skillsDir, "folder is missing");
  for (const name of readdirSync(skillsDir)) {
    const path = join(skillsDir, name, "SKILL.md");
    if (!existsSync(path)) {
      fault(join(skillsDir, name), "SKILL.md is missing");
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
    for (const [, link] of text.matchAll(/`((?:assets|scripts|references)\/[^`\s]+)`/g)) {
      if (!existsSync(join(skillsDir, name, link))) fault(path, `linked file ${link} is missing`);
    }
  }
}

checkManifest();
checkRules();
checkSkills();

if (faults.length > 0) {
  console.error(`check: ${faults.length} fault(s)`);
  for (const line of faults) console.error(`- ${line}`);
  process.exit(1);
}
console.log("check: no faults");

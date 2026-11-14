#!/usr/bin/env node
// Exact checks for the dev-loop plugin repo. Prints each fault and exits with code 1 if it finds one.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
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

function isInsideRealDir(baseDir, targetPath) {
  try {
    const realBase = realpathSync(baseDir);
    const realTarget = realpathSync(targetPath);
    const rel = relative(realBase, realTarget);
    return !rel.startsWith("..") && !isAbsolute(rel);
  } catch {
    return false;
  }
}

function walkMarkdownFiles(baseDir, dir = baseDir, seenDirs = new Set(), out = []) {
  if (!existsSync(dir)) return out;
  let realDir;
  try {
    realDir = realpathSync(dir);
  } catch {
    return out;
  }
  if (seenDirs.has(realDir) || !isInsideRealDir(baseDir, dir)) return out;
  seenDirs.add(realDir);
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkMarkdownFiles(baseDir, full, seenDirs, out);
    else if (st.isFile() && entry.endsWith(".md") && isInsideRealDir(baseDir, full)) out.push(full);
  }
  return out;
}

function pathOrLinkExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function collectPluginRootRefs(value, out = []) {
  if (typeof value === "string") {
    for (const [, q1, q2, bare] of value.matchAll(
      /(?:"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"|'\$\{CLAUDE_PLUGIN_ROOT\}\/([^']+)'|\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+))/g,
    )) {
      out.push(q1 ?? q2 ?? bare);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectPluginRootRefs(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectPluginRootRefs(item, out);
  }
  return out;
}

function parseSessionStartCommands(sessionStartCfg) {
  const commands = [];
  if (!Array.isArray(sessionStartCfg)) return commands;
  for (const group of sessionStartCfg) {
    if (!Array.isArray(group?.hooks)) continue;
    for (const entry of group.hooks) {
      if (typeof entry?.command !== "string") continue;
      const match = entry.command.match(
        /^\s*(?:"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"|'\$\{CLAUDE_PLUGIN_ROOT\}\/([^']+)'|\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+))(?:\s+(.*))?$/,
      );
      if (!match) {
        commands.push({ invalidCommand: entry.command });
        continue;
      }
      const relPath = match[1] ?? match[2] ?? match[3];
      const args = match[4]
        ? match[4]
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((arg) => arg.replace(/^["']|["']$/g, ""))
        : [];
      commands.push({
        relPath,
        args,
        shell: entry.shell === "bash" || relPath.endsWith(".cmd") ? "bash" : null,
      });
    }
  }
  return commands;
}

export function checkRepo(root = defaultRoot) {
  const faults = [];
  const fault = (path, message) => faults.push(`${(relative(root, path) || ".").replaceAll("\\", "/")}: ${message}`);

  function readJson(path) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        fault(path, "must contain a JSON object");
        return null;
      }
      return parsed;
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

  function checkExistingFileInsideDir(baseDir, candidateRel) {
    const resolved = resolve(baseDir, candidateRel);
    const rel = relative(baseDir, resolved);
    if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(resolved)) return null;
    let st;
    try {
      st = statSync(resolved);
    } catch {
      return null;
    }
    if (!st.isFile() || !isInsideRealDir(baseDir, resolved)) return null;
    return resolved;
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

  const agentsPath = join(root, "AGENTS.md");
  const agentsBytes = existsSync(agentsPath) ? Buffer.byteLength(readFileSync(agentsPath, "utf8"), "utf8") : 0;

  function checkRulesAndStartupBudget() {
    const rulesDir = join(root, "com.github.copilot/rules");
    if (!existsSync(rulesDir)) return fault(rulesDir, "folder is missing");
    const corePath = join(rulesDir, "core.mdc");
    if (!existsSync(corePath)) fault(corePath, "file is missing");
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
    const defaultSessionStart = join(root, "hooks/session-start");
    const hasDefaultSessionStart = pathOrLinkExists(defaultSessionStart);
    if (!existsSync(hooksJsonPath)) {
      if (hasDefaultSessionStart) fault(hooksJsonPath, "file is missing while hooks/session-start is present");
      return;
    }
    const hooksCfg = readJson(hooksJsonPath);
    if (!hooksCfg) return;

    const validatedExecPaths = new Set();
    function validateHookFile(relRef, reportPath = hooksJsonPath) {
      const target = checkExistingFileInsideDir(root, relRef);
      if (!target) {
        fault(reportPath, `referenced hook path ${relRef} is missing, is not a file, or escapes root`);
        return null;
      }
      if (process.platform !== "win32" && (statSync(target).mode & 0o111) === 0) {
        fault(target, "hook script must be executable (+x)");
        return null;
      }
      validatedExecPaths.add(target);
      return target;
    }

    for (const relRef of new Set(collectPluginRootRefs(hooksCfg))) {
      validateHookFile(relRef, hooksJsonPath);
    }

    let validDefaultSessionStart = null;
    if (hasDefaultSessionStart) {
      validDefaultSessionStart = checkExistingFileInsideDir(root, "hooks/session-start");
      if (!validDefaultSessionStart) {
        fault(defaultSessionStart, "hook script is missing, is not a file, or escapes root");
      } else if (process.platform !== "win32" && (statSync(validDefaultSessionStart).mode & 0o111) === 0) {
        if (!faults.some((f) => f.includes("hooks/session-start") && f.includes("executable (+x)"))) {
          fault(validDefaultSessionStart, "hook script must be executable (+x)");
        }
        validDefaultSessionStart = null;
      }
    }

    const invocations = [];
    let defaultCoveredByWrapper = false;
    for (const cmd of parseSessionStartCommands(hooksCfg?.hooks?.SessionStart)) {
      if (cmd.invalidCommand) {
        fault(hooksJsonPath, `SessionStart command must reference \${CLAUDE_PLUGIN_ROOT}/...: ${cmd.invalidCommand}`);
        continue;
      }
      const scriptPath = checkExistingFileInsideDir(root, cmd.relPath);
      if (!scriptPath || !validatedExecPaths.has(scriptPath)) continue;
      if (cmd.args[0]) {
        const siblingCandidate = join(dirname(cmd.relPath), cmd.args[0]).replaceAll("\\", "/");
        if (pathOrLinkExists(join(root, siblingCandidate))) {
          const validSibling = checkExistingFileInsideDir(root, siblingCandidate);
          if (!validSibling) {
            fault(hooksJsonPath, `SessionStart target ${siblingCandidate} is not a valid file inside root`);
            continue;
          }
          if (process.platform !== "win32" && (statSync(validSibling).mode & 0o111) === 0) {
            if (!faults.some((f) => f.includes(siblingCandidate) && f.includes("executable (+x)"))) {
              fault(validSibling, "hook script must be executable (+x)");
            }
            continue;
          }
          if (validDefaultSessionStart && validSibling === validDefaultSessionStart) defaultCoveredByWrapper = true;
        }
      }
      if (validDefaultSessionStart && scriptPath === validDefaultSessionStart) defaultCoveredByWrapper = true;
      invocations.push({ scriptPath, args: cmd.args, shell: cmd.shell });
    }
    if (validDefaultSessionStart && !defaultCoveredByWrapper) {
      invocations.push({ scriptPath: validDefaultSessionStart, args: [], shell: null });
    }

    const runHook = (inv, env) =>
      inv.shell === "bash"
        ? spawnSync("bash", [inv.scriptPath, ...inv.args], { cwd: root, env, encoding: "utf8", timeout: 5_000 })
        : spawnSync(inv.scriptPath, inv.args, { cwd: root, env, encoding: "utf8", timeout: 5_000 });

    let totalInjectedClaudeBytes = 0;
    for (const inv of invocations) {
      const copilotRes = runHook(inv, { ...process.env, CLAUDE_PLUGIN_ROOT: root, COPILOT_CLI: "1" });
      if (copilotRes.status !== 0 || copilotRes.error) {
        fault(inv.scriptPath, `COPILOT_CLI=1 guard check failed with status ${copilotRes.status ?? copilotRes.error?.code ?? "error"}`);
      } else {
        const trimmed = (copilotRes.stdout || "").trim();
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
              fault(inv.scriptPath, "COPILOT_CLI=1 output must be empty or a JSON object");
            } else if (
              parsed.additionalContext ||
              parsed.systemMessage ||
              parsed?.hookSpecificOutput?.additionalContext ||
              parsed?.hookSpecificOutput?.systemMessage
            ) {
              fault(inv.scriptPath, "must not emit additionalContext or systemMessage when COPILOT_CLI=1 (causes duplicate core loading)");
            }
          } catch {
            fault(inv.scriptPath, "COPILOT_CLI=1 output must be empty or valid empty JSON");
          }
        }
      }

      const claudeEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: root };
      delete claudeEnv.COPILOT_CLI;
      const claudeRes = runHook(inv, claudeEnv);
      if (claudeRes.status !== 0 || claudeRes.error) {
        fault(inv.scriptPath, `SessionStart hook failed when COPILOT_CLI is unset with status ${claudeRes.status ?? claudeRes.error?.code ?? "error"}`);
      } else {
        const trimmed = (claudeRes.stdout || "").trim();
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
              fault(inv.scriptPath, "SessionStart output must be a JSON object when non-empty");
            } else {
              for (const field of [
                parsed.additionalContext,
                parsed.systemMessage,
                parsed?.hookSpecificOutput?.additionalContext,
                parsed?.hookSpecificOutput?.systemMessage,
              ]) {
                if (typeof field === "string") totalInjectedClaudeBytes += Buffer.byteLength(field, "utf8");
              }
            }
          } catch {
            fault(inv.scriptPath, "SessionStart output must be valid JSON when non-empty");
          }
        }
      }
    }

    if (invocations.length > 0) {
      const claudeMdPath = join(root, "CLAUDE.md");
      const claudeMdBytes = existsSync(claudeMdPath) ? Buffer.byteLength(readFileSync(claudeMdPath, "utf8"), "utf8") : 0;
      const totalClaudeBytes = agentsBytes + claudeMdBytes + totalInjectedClaudeBytes;
      if (totalClaudeBytes > MAX_ALWAYS_LOADED_BYTES) {
        fault(hooksJsonPath, `always-loaded startup text is ${totalClaudeBytes} bytes; the 15 KB limit is ${MAX_ALWAYS_LOADED_BYTES}`);
      }
    }
  }

  function checkSkillLinks(skillDir, mdPath, text) {
    for (const [, link] of text.matchAll(SKILL_LINK_RE)) {
      const target = checkExistingFileInsideDir(skillDir, link);
      if (!target) fault(mdPath, `linked file ${link} is missing, is not a file, or escapes skill folder`);
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
      for (const subdir of ["references", "assets"]) {
        for (const mdFile of walkMarkdownFiles(skillDir, join(skillDir, subdir))) {
          checkSkillLinks(skillDir, mdFile, readFileSync(mdFile, "utf8"));
        }
      }
      if (name === "dev-loop") {
        for (const reqRel of ["references/hosts/README.md", "references/hosts/copilot.md"]) {
          if (!checkExistingFileInsideDir(skillDir, reqRel)) {
            fault(join(skillDir, reqRel), `required host reference ${reqRel} is missing`);
          }
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

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isMainModule()) {
  const faults = checkRepo(defaultRoot);
  if (faults.length > 0) {
    console.error(`check: ${faults.length} fault(s)`);
    for (const line of faults) console.error(`- ${line}`);
    process.exit(1);
  }
  console.log("check: no faults");
}

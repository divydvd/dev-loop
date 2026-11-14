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
const PLUGIN_ROOT_RE = /(?:"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"|'\$\{CLAUDE_PLUGIN_ROOT\}\/([^']+)'|\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+))/g;
const SESSION_CMD_RE = /^[ \t]*(?:"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"|'\$\{CLAUDE_PLUGIN_ROOT\}\/([^']+)'|\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+))(?:[ \t]+(.*))?$/;

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let root = defaultRoot;
let faults = [];
const fault = (path, message) => faults.push(`${(relative(root, path) || ".").replaceAll("\\", "/")}: ${message}`);
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const utf8Bytes = (s) => Buffer.byteLength(s, "utf8");

export function stripFrontmatter(text) {
  return String(text ?? "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function readJson(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!isPlainObject(parsed)) return (fault(path, "must contain a JSON object"), null);
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

function isInsideRealDir(baseDir, targetPath) {
  try {
    const rel = relative(realpathSync(baseDir), realpathSync(targetPath));
    return !rel.startsWith("..") && !isAbsolute(rel);
  } catch {
    return false;
  }
}

function pathOrLinkExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function walkMarkdownFiles(baseDir, dir = baseDir, seenDirs = new Set(), out = []) {
  if (!existsSync(dir) || !isInsideRealDir(baseDir, dir)) return out;
  const realDir = realpathSync(dir);
  if (seenDirs.has(realDir)) return out;
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

function collectPluginRootRefs(value, out = []) {
  if (typeof value === "string") {
    for (const [, q1, q2, bare] of value.matchAll(PLUGIN_ROOT_RE)) out.push(q1 ?? q2 ?? bare);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPluginRootRefs(item, out);
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) collectPluginRootRefs(item, out);
  }
  return out;
}

function parseHookCommand(rawCmd) {
  if (/[\r\n]/.test(rawCmd)) return { unsupportedSyntax: rawCmd };
  const match = rawCmd.match(SESSION_CMD_RE);
  if (!match) return { invalidCommand: rawCmd };
  const relPath = match[1] ?? match[2] ?? match[3];
  if (!/^[A-Za-z0-9._/-]+$/.test(relPath)) return { unsupportedSyntax: rawCmd };
  const tail = (match[4] ?? "").trim();
  if (!tail) return { relPath, args: [] };
  const tokens = tail.split(/[ \t]+/).filter(Boolean);
  const args = [];
  for (const tok of tokens) {
    const unquoted = tok.replace(/^"([^"]*)"$|^'([^']*)'$/, "$1$2");
    if (!/^[A-Za-z0-9._/-]+$/.test(unquoted)) return { unsupportedSyntax: rawCmd };
    args.push(unquoted);
  }
  return { relPath, args };
}

function parseSessionStartCommands(sessionStartCfg) {
  const commands = [];
  for (const group of Array.isArray(sessionStartCfg) ? sessionStartCfg : []) {
    const matcher = typeof group?.matcher === "string" ? group.matcher : "";
    for (const entry of Array.isArray(group?.hooks) ? group.hooks : []) {
      if (typeof entry?.command !== "string") continue;
      const parsed = parseHookCommand(entry.command);
      if (parsed.invalidCommand || parsed.unsupportedSyntax) {
        commands.push(parsed);
        continue;
      }
      commands.push({
        ...parsed,
        matcher,
        shell: entry.shell === "bash" || parsed.relPath.endsWith(".cmd") ? "bash" : null,
      });
    }
  }
  return commands;
}

function hookContextStrings(parsed) {
  return [
    parsed.additionalContext,
    parsed.systemMessage,
    parsed?.hookSpecificOutput?.additionalContext,
    parsed?.hookSpecificOutput?.systemMessage,
  ].filter((v) => typeof v === "string" && v.length > 0);
}

function checkExistingFileInsideDir(baseDir, candidateRel) {
  const resolved = resolve(baseDir, candidateRel);
  const rel = relative(baseDir, resolved);
  if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(resolved)) return null;
  try {
    return statSync(resolved).isFile() && isInsideRealDir(baseDir, resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function checkStartupCeiling(path, totalBytes) {
  if (totalBytes > MAX_ALWAYS_LOADED_BYTES) {
    fault(path, `always-loaded startup text is ${totalBytes} bytes; the 15 KB limit is ${MAX_ALWAYS_LOADED_BYTES}`);
  }
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
    if (host.version !== plugin.version) fault(hostPath, `version ${host.version} differs from plugin.json version ${plugin.version}`);
    if (relManifest === "gemini-extension.json") {
      if (typeof plugin.description === "string" && host.description !== plugin.description) {
        fault(hostPath, "description differs from plugin.json description");
      }
      if (host.contextFileName !== "GEMINI.md") fault(hostPath, 'contextFileName must be "GEMINI.md"');
    }
  }

  const changelogPath = join(root, "CHANGELOG.md");
  if (!existsSync(changelogPath)) fault(changelogPath, "file is missing");
  else if (version && !new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b`, "m").test(readFileSync(changelogPath, "utf8"))) {
    fault(changelogPath, `no "## ${version}" entry`);
  }
}

function checkRules(agentsBytes) {
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
    copilotRulesBytes += utf8Bytes(text);
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
    if (!existsSync(geminiMdPath)) fault(geminiMdPath, "file is missing while gemini-extension.json is present");
    else if (existsSync(corePath) && readFileSync(geminiMdPath, "utf8") !== stripFrontmatter(readFileSync(corePath, "utf8"))) {
      fault(geminiMdPath, "content differs from com.github.copilot/rules/core.mdc body");
    }
  }

  checkStartupCeiling(rulesDir, agentsBytes + copilotRulesBytes);
  if (existsSync(geminiMdPath)) checkStartupCeiling(geminiMdPath, agentsBytes + utf8Bytes(readFileSync(geminiMdPath, "utf8")));
}

function checkHooks(agentsBytes) {
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
  function requireExecHookFile(relRef, reportPath = hooksJsonPath, missingMsg = `referenced hook path ${relRef} is missing, is not a file, or escapes root`) {
    const target = checkExistingFileInsideDir(root, relRef);
    if (!target) return (fault(reportPath, missingMsg), null);
    if (process.platform !== "win32" && (statSync(target).mode & 0o111) === 0) {
      const relTarget = relative(root, target).replaceAll("\\", "/");
      if (!faults.some((f) => f.includes(relTarget) && f.includes("executable (+x)"))) fault(target, "hook script must be executable (+x)");
      return null;
    }
    validatedExecPaths.add(target);
    return target;
  }

  for (const relRef of new Set(collectPluginRootRefs(hooksCfg))) requireExecHookFile(relRef);
  const validDefault = hasDefaultSessionStart
    ? requireExecHookFile("hooks/session-start", defaultSessionStart, "hook script is missing, is not a file, or escapes root")
    : null;

  const invocations = [];
  let defaultCovered = false;
  for (const cmd of parseSessionStartCommands(hooksCfg?.hooks?.SessionStart)) {
    if (cmd.invalidCommand) {
      fault(hooksJsonPath, `SessionStart command must reference \${CLAUDE_PLUGIN_ROOT}/...: ${cmd.invalidCommand}`);
      continue;
    }
    if (cmd.unsupportedSyntax) {
      fault(hooksJsonPath, `unsupported shell syntax or non-literal argument in SessionStart command: ${cmd.unsupportedSyntax}`);
      continue;
    }
    const scriptPath = checkExistingFileInsideDir(root, cmd.relPath);
    if (!scriptPath || !validatedExecPaths.has(scriptPath)) continue;
    if (cmd.args[0]) {
      const siblingRel = join(dirname(cmd.relPath), cmd.args[0]).replaceAll("\\", "/");
      if (pathOrLinkExists(join(root, siblingRel))) {
        const validSibling = requireExecHookFile(siblingRel, hooksJsonPath, `SessionStart target ${siblingRel} is not a valid file inside root`);
        if (!validSibling) continue;
        if (validDefault && validSibling === validDefault) defaultCovered = true;
      }
    }
    if (validDefault && scriptPath === validDefault) defaultCovered = true;
    invocations.push({ scriptPath, args: cmd.args, shell: cmd.shell, matcher: cmd.matcher, bytes: 0 });
  }
  if (validDefault && !defaultCovered) invocations.push({ scriptPath: validDefault, args: [], shell: null, matcher: "", bytes: 0 });

  const runHook = (inv, env) =>
    spawnSync(inv.shell === "bash" ? "bash" : inv.scriptPath, inv.shell === "bash" ? [inv.scriptPath, ...inv.args] : inv.args, {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });

  function parseHookJson(scriptPath, stdout, label) {
    const trimmed = (stdout || "").trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (!isPlainObject(parsed)) return (fault(scriptPath, `${label} output must be a JSON object when non-empty`), null);
      return parsed;
    } catch {
      return (fault(scriptPath, `${label} output must be valid JSON when non-empty`), null);
    }
  }

  for (const inv of invocations) {
    const copilotRes = runHook(inv, { ...process.env, CLAUDE_PLUGIN_ROOT: root, COPILOT_CLI: "1" });
    if (copilotRes.status !== 0 || copilotRes.error) {
      fault(inv.scriptPath, `COPILOT_CLI=1 guard check failed with status ${copilotRes.status ?? copilotRes.error?.code ?? "error"}`);
    } else {
      const parsed = parseHookJson(inv.scriptPath, copilotRes.stdout, "COPILOT_CLI=1");
      if (parsed && hookContextStrings(parsed).length > 0) {
        fault(inv.scriptPath, "must not emit additionalContext or systemMessage when COPILOT_CLI=1 (causes duplicate core loading)");
      }
    }

    const claudeEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: root };
    delete claudeEnv.COPILOT_CLI;
    const claudeRes = runHook(inv, claudeEnv);
    if (claudeRes.status !== 0 || claudeRes.error) {
      fault(inv.scriptPath, `SessionStart hook failed when COPILOT_CLI is unset with status ${claudeRes.status ?? claudeRes.error?.code ?? "error"}`);
    } else {
      const parsed = parseHookJson(inv.scriptPath, claudeRes.stdout, "SessionStart");
      if (parsed) for (const s of hookContextStrings(parsed)) inv.bytes += utf8Bytes(s);
    }
  }

  if (invocations.length > 0) {
    const events = new Set(["startup", "resume", "clear", "compact"]);
    for (const inv of invocations) {
      inv.hasNonLiteral = false;
      if (!inv.matcher || inv.matcher === "*") inv.matcherRe = null;
      else {
        try {
          inv.matcherRe = new RegExp(inv.matcher);
        } catch {
          fault(hooksJsonPath, `invalid SessionStart matcher regex "${inv.matcher}"`);
          inv.matcherRe = null;
        }
        const inner = inv.matcher.trim().replace(/^\^?\((?:\?:)?([^()]+)\)\$?$/, "$1");
        for (const alt of inner.split("|")) {
          const clean = alt.replace(/^\^|\$$/g, "").trim();
          if (/^[A-Za-z0-9_-]+$/.test(clean)) events.add(clean);
          else inv.hasNonLiteral = true;
        }
      }
    }
    const anchoredLitRe = /^\^(?:[A-Za-z0-9_-]+|\((?:\?:)?[A-Za-z0-9_-]+(?:\|[A-Za-z0-9_-]+)*\))\$$/;
    const nonLiteralBound = invocations.some((inv) => inv.hasNonLiteral)
      ? invocations.filter((inv) => !inv.matcherRe || inv.hasNonLiteral || !anchoredLitRe.test(inv.matcher.trim())).reduce((s, inv) => s + inv.bytes, 0)
      : 0;
    const maxInjected = Math.max(
      nonLiteralBound,
      ...[...events].map((ev) => invocations.filter((inv) => !inv.matcherRe || inv.matcherRe.test(ev)).reduce((s, inv) => s + inv.bytes, 0)),
    );
    const claudeMdPath = join(root, "CLAUDE.md");
    const claudeMdBytes = existsSync(claudeMdPath) ? utf8Bytes(readFileSync(claudeMdPath, "utf8")) : 0;
    checkStartupCeiling(hooksJsonPath, agentsBytes + claudeMdBytes + maxInjected);
  }
}

function checkSkillLinks(skillDir, mdPath, text) {
  for (const [, link] of text.matchAll(SKILL_LINK_RE)) {
    if (!checkExistingFileInsideDir(skillDir, link)) fault(mdPath, `linked file ${link} is missing, is not a file, or escapes skill folder`);
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
    const skillDir = join(skillsDir, name);
    checkSkillLinks(skillDir, path, text);
    for (const subdir of ["references", "assets"]) {
      for (const mdFile of walkMarkdownFiles(skillDir, join(skillDir, subdir))) checkSkillLinks(skillDir, mdFile, readFileSync(mdFile, "utf8"));
    }
    if (name === "dev-loop") {
      for (const reqRel of ["references/hosts/README.md", "references/hosts/copilot.md"]) {
        if (!checkExistingFileInsideDir(skillDir, reqRel)) fault(join(skillDir, reqRel), `required host reference ${reqRel} is missing`);
      }
    }
  }
}

export function checkRepo(repoRoot = defaultRoot) {
  const prevRoot = root;
  const prevFaults = faults;
  root = repoRoot;
  faults = [];
  try {
    const agentsPath = join(root, "AGENTS.md");
    const agentsBytes = existsSync(agentsPath) ? utf8Bytes(readFileSync(agentsPath, "utf8")) : 0;
    checkManifest();
    checkRules(agentsBytes);
    checkHooks(agentsBytes);
    checkSkills();
    return faults;
  } finally {
    root = prevRoot;
    faults = prevFaults;
  }
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

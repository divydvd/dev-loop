#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripFrontmatter } from "./check.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function syncHostCore(repoRoot = DEFAULT_ROOT, { check = false } = {}) {
  const corePath = join(repoRoot, "com.github.copilot/rules/core.mdc");
  const targetPath = join(repoRoot, "GEMINI.md");
  const expected = stripFrontmatter(readFileSync(corePath, "utf8"));
  const current = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : null;
  if (current === expected) return { synced: true, changed: false, targetPath };
  if (check) return { synced: false, changed: false, targetPath };
  writeFileSync(targetPath, expected, "utf8");
  return { synced: true, changed: true, targetPath };
}

const isCli = Boolean(
  process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)),
);

if (isCli) {
  const args = process.argv.slice(2);
  let check = false;
  const positional = [];
  for (const arg of args) {
    if (arg === "--check") {
      check = true;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    console.error("Usage: node scripts/sync-host-core.mjs [--check] [repo-root]");
    process.exit(1);
  }
  const result = syncHostCore(positional[0] ? resolve(positional[0]) : DEFAULT_ROOT, { check });
  if (!result.synced) {
    console.error("GEMINI.md differs from com.github.copilot/rules/core.mdc body; run node scripts/sync-host-core.mjs");
    process.exit(1);
  }
  console.log(result.changed ? "GEMINI.md: synced" : "GEMINI.md: in sync");
}

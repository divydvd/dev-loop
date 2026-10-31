import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

test("owner package pins runtime, installer, provenance, and owner guides", () => {
  const lines = fs.readFileSync(path.join(root, "PACKAGE.sha256"), "utf8").trim().split("\n");
  const entries = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}([a-zA-Z0-9/_.-]+)$/.exec(line);
    assert.ok(match, "package manifest uses a reviewable SHA-256 format");
    const [, hash, file] = match;
    assert.ok(!file.startsWith("/") && !file.split("/").includes(".."));
    assert.ok(!entries.has(file), `duplicate package entry: ${file}`);
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash, `${file} matches the reviewed package`);
    entries.set(file, hash);
  }
  const runtime = fs.readFileSync(path.join(root, "SOURCE.sha256"), "utf8").trim().split("\n").map(line => line.slice(66));
  assert.deepEqual([...entries.keys()].sort(), [
    ...runtime, "owner-install.mjs", "BASELINE.sha256", "PREVIOUS.sha256", "SOURCE.sha256", "INSTALL.md", "README.md",
    "fixtures/real-host-acceptance.py",
  ].sort());
});

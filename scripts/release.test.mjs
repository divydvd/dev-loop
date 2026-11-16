import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("./release.mjs", import.meta.url));
const sha = "a".repeat(40);
const notes = "- Add releases.\n  - Preserve checks.";

async function run(t, { version = "0.5.16", changelog, release, tag, fail } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "dev-loop-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "plugin.json"), JSON.stringify({ version }));
  await writeFile(join(directory, "CHANGELOG.md"), changelog ??
    `# Changelog\n\n## 0.5.16 (2026-11-15)\n${notes}\n\n## 0.5.15\n- Old notes.\n`);
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, path: request.url, body: body ? JSON.parse(body) : null });
    assert.equal(request.headers.authorization, "Bearer test-token");
    response.setHeader("Content-Type", "application/json");
    if (fail?.path === request.url && (!fail.method || fail.method === request.method)) {
      response.writeHead(fail.status).end(JSON.stringify({ message: "API refused the request" }));
    } else if (request.url === "/repos/owner/repo/git/ref/tags/v0.5.16") {
      response.writeHead(tag ? 200 : 404).end(JSON.stringify(tag ?? { message: "Not Found" }));
    } else if (request.url === "/repos/owner/repo/git/tags/annotated") {
      response.end(JSON.stringify({ object: { type: "commit", sha } }));
    } else if (request.url === "/repos/owner/repo/releases/tags/v0.5.16") {
      response.writeHead(release ? 200 : 404).end(JSON.stringify(release ?? { message: "Not Found" }));
    } else if (request.url === "/repos/owner/repo/releases" && request.method === "POST") {
      response.writeHead(201).end(JSON.stringify({ html_url: "https://github.com/owner/repo/releases/tag/v0.5.16" }));
    } else {
      response.writeHead(500).end(JSON.stringify({ message: "Unexpected request" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const env = { ...process.env, GITHUB_TOKEN: "test-token", GITHUB_REPOSITORY: "owner/repo",
    GITHUB_SHA: sha, GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` };
  delete env.NODE_TEST_CONTEXT;
  let result;
  try {
    result = { ...await exec(process.execPath, [script], { cwd: directory, env }), code: 0 };
  } catch (error) {
    result = { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
  return { ...result, requests };
}

test("publishes one release with the exact checked commit and only its changelog section", async (t) => {
  const result = await run(t);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Published.*v0\.5\.16/);
  assert.deepEqual(result.requests.filter((request) => request.method === "POST"), [{
    method: "POST", path: "/repos/owner/repo/releases",
    body: { tag_name: "v0.5.16", target_commitish: sha, name: "dev-loop v0.5.16",
      body: notes, draft: false, prerelease: false, make_latest: "legacy" },
  }]);
});

test("a repeated version does not edit or duplicate an existing published release", async (t) => {
  const result = await run(t, {
    tag: { object: { type: "commit", sha: "b".repeat(40) } },
    release: { draft: false, prerelease: false },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /already published/);
  assert.equal(result.requests.filter((request) => request.method !== "GET").length, 0);
});

test("recovers from a matching existing annotated tag without replacing it", async (t) => {
  const result = await run(t, { tag: { object: { type: "tag", sha: "annotated" } } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.requests.filter((request) => request.method === "POST").length, 1);
});

test("refuses a conflicting existing tag when the release is missing", async (t) => {
  const result = await run(t, { tag: { object: { type: "commit", sha: "b".repeat(40) } } });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /different commit/);
  assert.equal(result.requests.filter((request) => request.method !== "GET").length, 0);
});

test("rejects invalid versions and missing or empty changelog entries before API use", async (t) => {
  for (const input of [
    { version: "0.5.16/invalid" },
    { changelog: "# Changelog\n## 0.5.15\n- Old.\n" },
    { changelog: "# Changelog\n## 0.5.16\n\n## 0.5.15\n- Old.\n" },
    { changelog: "# Changelog\n## 0.5.16" },
    { changelog: "# Changelog\n## 0.5.16\n- New.\n## 0.5.16\n- Duplicate.\n" },
  ]) {
    const result = await run(t, input);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /version|changelog/i);
    assert.equal(result.requests.length, 0);
  }
});

test("API lookup and publication failures fail visibly rather than report success", async (t) => {
  for (const fail of [
    { path: "/repos/owner/repo/releases/tags/v0.5.16", status: 403 },
    { path: "/repos/owner/repo/git/ref/tags/v0.5.16", status: 500 },
    { path: "/repos/owner/repo/releases", method: "POST", status: 422 },
  ]) {
    const result = await run(t, { fail });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, new RegExp(`GitHub API.*${fail.status}`));
    assert.doesNotMatch(result.stdout, /Published/);
  }
});

test("does not silently accept a draft or prerelease as a published stable version", async (t) => {
  for (const release of [{ draft: true }, { draft: false, prerelease: true }]) {
    const result = await run(t, { release });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /not a published stable release/);
    assert.equal(result.requests.filter((request) => request.method !== "GET").length, 0);
  }
});

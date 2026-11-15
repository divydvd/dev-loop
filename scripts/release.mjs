import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("plugin.json", "utf8"));
if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error("The plugin version must be a stable semantic version.");
}
const changelog = readFileSync("CHANGELOG.md", "utf8").replace(/\r\n/g, "\n");
const sections = changelog.split(/^## /m).slice(1);
const entries = sections.filter((section) => section.split("\n")[0].split(" ")[0] === version);
if (entries.length !== 1) throw new Error(`Expected one changelog entry for ${version}.`);
const notes = entries[0].split("\n").slice(1).join("\n").trim();
if (!notes) throw new Error(`The changelog entry for ${version} is empty.`);

const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository, GITHUB_SHA: sha } = process.env;
if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || !/^[a-f0-9]{40}$/.test(sha ?? "")) {
  throw new Error("GITHUB_TOKEN, GITHUB_REPOSITORY, and a full GITHUB_SHA are required.");
}
const base = `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repository}`;
async function api(path, { method = "GET", body, allowMissing = false } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

const tagName = `v${version}`;
const release = await api(`/releases/tags/${tagName}`, { allowMissing: true });
if (release) {
  if (release.draft || release.prerelease) {
    throw new Error(`${tagName} is not a published stable release. Resolve it manually.`);
  }
  console.log(`${tagName} is already published; no changes made.`);
} else {
  const tag = await api(`/git/ref/tags/${tagName}`, { allowMissing: true });
  if (tag) {
    let object = tag.object;
    while (object.type === "tag") {
      object = (await api(`/git/tags/${object.sha}`)).object;
    }
    if (object.type !== "commit" || object.sha !== sha) {
      throw new Error(`${tagName} points to a different commit. Existing tags will not be replaced.`);
    }
  }
  const created = await api("/releases", {
    method: "POST",
    body: {
      tag_name: tagName,
      target_commitish: sha,
      name: `dev-loop ${tagName}`,
      body: notes,
      draft: false,
      prerelease: false,
      make_latest: "legacy",
    },
  });
  console.log(`Published ${tagName}: ${created.html_url}`);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { classify } from "./lib/classify.mjs";
import { decide, DEFAULT_CONFIG } from "./lib/policy.mjs";
import { emptyLedger } from "./lib/store.mjs";

const cwd = "/synthetic/project";
const now = new Date("2026-10-30T00:00:00Z");
const mavenTasks = [
  ":auth:core:publishMavenPublicationToMavenLocal",
  ":auth:core:publishMavenPublicationToKitTestRepository",
  ":auth:core:publishAllPublicationsToKitTestRepository",
  "publishToMavenLocal",
  "publishLibraryPublicationToRemoteRepository",
  "publishAllPublicationsToLocalRepository",
  "publishMavenPublicationToKit-TestRepository",
  "publishAllPublicationsToKit-TestRepository",
  "publishMaven-javaPublicationToMavenLocal",
  "publishMaven.javaPublicationToKit.TestRepository",
];

function deployments(command) {
  return classify(command, { cwd }).findings.filter((f) => f.rule === "deploy");
}

async function decision(command, targets = []) {
  const data = emptyLedger();
  data.approvals = targets.map((target) => ({
    id: `synthetic-${target}`, kind: "deploy", target,
    expiresAt: "2026-10-30T01:00:00Z",
  }));
  return decide({ toolName: "bash", args: { command }, cwd, sessionId: "synthetic" }, {
    data, now, config: { ...DEFAULT_CONFIG, gradleCache: false },
    protectedDirs: [], lockFile: "/synthetic/gradle.lock", lookups: {},
  });
}

for (const task of mavenTasks) {
  test(`Maven publication is not Play: ${task}`, () => {
    assert.deepEqual(deployments(`./gradlew ${task}`).map((f) => f.target), ["maven"]);
  });

  test(`unverified Maven publication stays blocked: ${task}`, async () => {
    const result = await decision(`./gradlew ${task}`, ["play", "firebase", "maven"]);
    assert.match(result.deny, /Maven publication/i);
    assert.match(result.deny, /source.*destination.*verif/i);
    assert.doesNotMatch(result.deny, /playstore/i);
    assert.deepEqual(result.post, []);
  });
}

test("Firebase App Distribution uses Firebase approval, not Play approval", async () => {
  const command = "./gradlew :app:appDistributionUploadDebug";
  assert.deepEqual(deployments(command).map((f) => f.target), ["firebase"]);
  assert.match((await decision(command, ["play"])).deny, /deploy firebase/);
  const result = await decision(command, ["firebase"]);
  assert.equal(result.deny, null);
  assert.equal(result.post[0].target, "firebase");
});

test("Firebase upload variants with non-word names retain approval enforcement", async () => {
  const command = "./gradlew :app:appDistributionUploadDemo-debug";
  assert.deepEqual(deployments(command).map((f) => f.target), ["firebase"]);
  assert.match((await decision(command, ["play"])).deny, /deploy firebase/);
  assert.equal((await decision(command, ["firebase"])).deny, null);
});

test("Play publishing and promotion still require Play approval", async () => {
  for (const task of ["publishReleaseBundle", "publishReleaseApk", "promoteReleaseArtifact", "publish"]) {
    const command = `./gradlew :app:${task}`;
    assert.deepEqual(deployments(command).map((f) => f.target), ["play"]);
    assert.match((await decision(command, ["firebase"])).deny, /playstore/);
    assert.equal((await decision(command, ["play"])).deny, null);
  }
});

test("mixed Gradle tasks retain each destination in task order", async () => {
  const command = "./gradlew publishToMavenLocal appDistributionUploadDebug publishReleaseBundle";
  assert.deepEqual(deployments(command).map((f) => f.target), ["maven", "firebase", "play"]);
  assert.match((await decision(command, ["firebase", "play"])).deny, /Maven publication/i);
  assert.match((await decision("./gradlew appDistributionUploadDebug publishReleaseBundle", ["firebase"])).deny, /playstore/);
});

test("MavenLocal substrings do not exempt unrelated publish tasks", async () => {
  const command = "./gradlew :app:publishToMavenLocalAndDeploy";
  assert.deepEqual(deployments(command).map((f) => f.target), ["play"]);
  assert.ok((await decision(command)).deny);
});

test("ordinary Gradle builds retain the shared lane", async () => {
  const command = "./gradlew :app:assembleDebug";
  const findings = classify(command, { cwd }).findings;
  assert.deepEqual(findings.map((f) => f.rule), ["gradle"]);
  assert.deepEqual(findings[0].tasks, [":app:assembleDebug"]);
  const result = await decision(command);
  assert.equal(result.deny, null);
  if (fs.existsSync("/usr/bin/lockf")) {
    assert.equal(result.lane, true);
    assert.match(result.modifiedArgs.command, /lockf.*gradle\.lock/);
  }
});

test("Firebase CLI and configuration changes remain protected", async () => {
  assert.match((await decision("firebase deploy")).deny, /deploy firebase/);
  assert.match((await decision("firebase functions:config:set example=value")).deny, /approval/);
});

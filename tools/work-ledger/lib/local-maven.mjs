import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { classify } from "./classify.mjs";
import { splitCommands } from "./shell.mjs";

const inside = (file, dir) => {
  const rel = path.relative(dir, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

export function localScopeProblem(s) {
  if (!s || !/^[\w.-]+\/[\w.-]+$/.test(s.repo || "") || !/^[a-z0-9][a-z0-9 -]{0,79}$/.test(s.label || "")) return "a descriptor needs a repository and simple lowercase label";
  if (!/^[a-f0-9]{40}$/.test(s.sha || "")) return "a descriptor needs the full reviewed SHA";
  for (const key of ["cwd", "destination", "launcher"]) {
    if (typeof s[key] !== "string" || !path.isAbsolute(s[key]) || path.resolve(s[key]) !== s[key]) return `${key} must be a normalized absolute path`;
  }
  if (!inside(s.destination, path.join(s.cwd, "build"))) return "the destination must be inside the project's build directory";
  if (!inside(s.launcher, s.cwd) || inside(s.launcher, path.join(s.cwd, "build")) || path.basename(s.launcher) !== "gradlew") return "use a tracked project gradlew pathname outside build";
  if (typeof s.command !== "string" || !/^[a-zA-Z0-9_./:= -]+$/.test(s.command)) return "use one literal command without shell operations or quotes";
  const commands = splitCommands(s.command);
  const argv = commands[0]?.argv || [];
  if (commands.length !== 1 || argv.join(" ") !== s.command ||
      ![s.launcher, `./${path.relative(s.cwd, s.launcher)}`].includes(argv[0])) return "use the canonical absolute launcher or its exact ./project-relative pathname without traversal";
  const properties = argv.filter(a => a.startsWith("-PkitRepository="));
  if (properties.length !== 1 || properties[0] !== `-PkitRepository=${s.destination}`) return "name the exact local -PkitRepository destination";
  if (argv.slice(1).some(a => a.startsWith("-") && a !== properties[0] && !["--offline", "--no-daemon", "--console=plain", "--stacktrace"].includes(a))) return "alternate build inputs and unknown options are not supported";
  const findings = classify(s.command, { cwd: s.cwd }).findings;
  if (!findings.some(f => f.rule === "deploy" && f.target === "maven") || findings.some(f => f.rule !== "gradle" && !(f.rule === "deploy" && f.target === "maven"))) return "the descriptor must contain Maven publication only, not another deployment";
  if (findings.filter(f => f.rule === "deploy").length !== findings.find(f => f.rule === "gradle")?.tasks.length) return "every task must be a recognized Maven publication";
  return null;
}

export const localScopeId = s => crypto.createHash("sha256").update(JSON.stringify([
  s.repo.toLowerCase(), s.label, s.cwd, s.sha, s.launcher, s.command, s.destination,
])).digest("hex");

export function configuredMavenScopes(config, repo) {
  return (Array.isArray(config?.localMavenScopes) ? config.localMavenScopes : [])
    .filter(s => typeof s?.repo === "string" && s.repo.toLowerCase() === repo);
}

function canonical(file) {
  try { return fs.realpathSync(file); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(canonical(parent), path.basename(file));
  }
}

export async function localSourceProblem(s, lookups) {
  try {
    for (const key of ["cwd", "destination", "launcher"]) {
      if (canonical(s[key]) !== s[key]) return `${key} uses a symlink`;
    }
    const [root, head, clean, tracked] = await Promise.all([
      lookups.gitRoot(s.cwd), lookups.gitHead(s.cwd), lookups.gitReviewedClean(s.cwd),
      lookups.gitTracked(s.cwd, path.relative(s.cwd, s.launcher)),
    ]);
    if (root !== s.cwd || head !== s.sha || clean !== true || tracked !== true) return "source must match the reviewed clean full SHA and tracked launcher";
    return null;
  } catch (error) {
    return `source verification failed: ${error.message}`;
  }
}

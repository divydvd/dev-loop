import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const stat = fs.lstatSync(directory);
if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error("PRIVATE_FIXTURE_REQUIRED");
const [identity, action] = process.argv.slice(2);
if (!["synthetic-android-identity", "synthetic-ios-identity"].includes(identity) ||
    !["act", "verify", "recover"].includes(action)) throw new Error("INVALID_SYNTHETIC_ACTION");
fs.appendFileSync(path.join(directory, "synthetic-actions.jsonl"), JSON.stringify({ identity, action }) + "\n", { mode: 0o600 });

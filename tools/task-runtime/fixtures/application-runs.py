#!/usr/bin/env python3
"""Run fixed synthetic cases in fresh, isolated CLI sessions, without tools."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

root = Path(__file__).resolve().parents[3]
phase, output = sys.argv[1:3]
if phase not in ("baseline", "candidate"):
    raise SystemExit("Use baseline or candidate.")
output = Path(output).resolve()
output.mkdir(parents=True, exist_ok=True)
cases_path = Path(__file__).with_name("application-cases.json")
cases = json.loads(cases_path.read_text())
paths = ["skills/dev-loop/SKILL.md", "skills/dev-loop/references/absence-mode.md",
         "skills/dev-loop/references/testing.md"]
instructions = "\n\n".join((root / p).read_text() for p in paths)
identity = hashlib.sha256(instructions.encode()).hexdigest()
token = subprocess.check_output(["gh", "auth", "token"], text=True).strip()


def run(item):
    case, repetition = item
    sid = str(uuid.uuid4())
    with tempfile.TemporaryDirectory(prefix="continuation-case-") as directory:
        env = {k: os.environ[k] for k in ("PATH", "TMPDIR", "LANG") if k in os.environ}
        env.update(HOME=directory, COPILOT_HOME=directory + "/copilot",
                   COPILOT_GITHUB_TOKEN=token, COPILOT_AUTO_UPDATE="false",
                   USE_TGREP="false")
        prompt = (cases["context"] + "\n\nINSTRUCTIONS\n" + instructions +
                  "\n\nSCENARIO\n" + case["input"])
        start = time.monotonic()
        try:
            result = subprocess.run(
                ["copilot", "-p", prompt, "--session-id", sid,
                 "--disable-builtin-mcps", "--no-custom-instructions",
                 "--available-tools", "", "--no-auto-update",
                 "--output-format", "json", "--silent"],
                cwd=directory, env=env, text=True, capture_output=True, timeout=180)
            record = {"phase": phase, "case": case["id"], "repetition": repetition,
                      "sessionId": sid, "instructionSha256": identity,
                      "fixtureSha256": hashlib.sha256(cases_path.read_bytes()).hexdigest(),
                      "elapsedSeconds": round(time.monotonic() - start, 3),
                      "returncode": result.returncode, "stdout": result.stdout,
                      "stderr": result.stderr}
        except subprocess.TimeoutExpired:
            record = {"phase": phase, "case": case["id"], "repetition": repetition,
                      "sessionId": sid, "error": "MODEL_TIMEOUT"}
        (output / f"{case['id']}-{repetition}.json").write_text(json.dumps(record, indent=2))
        return {k: record[k] for k in ("case", "repetition", "sessionId", "returncode", "error")
                if k in record}


items = [(case, i) for case in cases["cases"] for i in range(1, 4)]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    for result in executor.map(run, items):
        print(json.dumps(result), flush=True)

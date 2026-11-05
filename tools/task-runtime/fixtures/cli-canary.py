#!/usr/bin/env python3
"""Use a disposable CLI, attached SDK, and deterministic local provider."""
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading


class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        body = {"id": "synthetic", "object": "chat.completion", "created": 1,
                "model": "synthetic", "choices": [{"index": 0, "finish_reason": "stop",
                "message": {"role": "assistant", "content": "Synthetic canary response."}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


output = Path(sys.argv[1]).resolve()
output.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="task-cli-canary-") as directory:
    root = Path(directory)
    home = root / "home"
    work = root / "work"
    extension = home / "extensions/canary"
    extension.mkdir(parents=True)
    work.mkdir()
    shutil.copyfile(Path(__file__).with_name("app-canary.mjs"), extension / "extension.mjs")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    env = {k: os.environ[k] for k in ("PATH", "TMPDIR", "LANG") if k in os.environ}
    env.update(HOME=str(root), COPILOT_HOME=str(home), COPILOT_OFFLINE="true",
               COPILOT_AUTO_UPDATE="false", COPILOT_PROVIDER_TYPE="openai",
               COPILOT_PROVIDER_BASE_URL=f"http://127.0.0.1:{server.server_port}",
               COPILOT_PROVIDER_MODEL_ID="gpt-4.1", COPILOT_MODEL="gpt-4.1",
               TASK_CANARY_OUTPUT=str(root / "observations.jsonl"), USE_TGREP="false")
    try:
        result = subprocess.run(
            ["copilot", "-p", "Return the synthetic canary marker.", "--trust-folder",
             "--disable-builtin-mcps", "--available-tools", "", "--stream", "off",
             "--no-auto-update", "--silent"],
            cwd=work, env=env, text=True, capture_output=True, timeout=60)
        for name, text in (("stdout.txt", result.stdout), ("stderr.txt", result.stderr)):
            (output / name).write_text(text)
        observations = root / "observations.jsonl"
        if observations.exists():
            shutil.copyfile(observations, output / "observations.jsonl")
        # Retain only public SDK contracts, never credentials or a session transcript.
        for source in root.rglob("*.d.ts"):
            if "copilot-sdk" in str(source):
                target = output / "sdk" / source.name
                target.parent.mkdir(exist_ok=True)
                shutil.copyfile(source, target)
        print(json.dumps({"hostKind": "cli", "returncode": result.returncode,
                          "observations": observations.exists(), "cleanup": "owned CLI exited"}))
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

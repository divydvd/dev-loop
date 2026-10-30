#!/usr/bin/env python3
"""Verify the real CLI extension lifecycle without prompts or inference."""
import argparse
import base64
import fcntl
import hashlib
import http.server
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tarfile
import termios
import threading
import time
import urllib.request
import uuid

ARGS = SOURCE = OUTPUT = ROOT = PROVIDER = PROVIDER_THREAD = ROOT_ID = None
ROOT_CREATED = REPORT_READY = HELP_ONLY = False
RESULT = {"commands": [], "interactive_runs": [], "passed": False, "checks": {}}


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, _message):
        raise ValueError("Invalid acceptance arguments.")


def sanitize(value):
    if isinstance(value, dict):
        return {sanitize(key): sanitize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(item) for item in value]
    if not isinstance(value, str):
        return value
    for original, replacement in ((str(ROOT), "<DISPOSABLE>"), (str(SOURCE.parent.parent), "<REPO>"),
                                  (str(OUTPUT), "<ARTIFACTS>"), (str(Path.home()), "<USER>")):
        value = value.replace(original, replacement)
    return value


def failure_info(error, step):
    allowed = (Exception, OSError, FileNotFoundError, PermissionError, IsADirectoryError,
               NotADirectoryError, ProcessLookupError, TimeoutError, RuntimeError,
               ValueError, TypeError, KeyError, KeyboardInterrupt, SystemExit,
               subprocess.CalledProcessError, subprocess.TimeoutExpired)
    if step not in ("interactive", "acceptance", "provider-shutdown", "process-cleanup",
                    "disposable-cleanup", "report-write", "host-shutdown"):
        raise ValueError("Invalid acceptance failure step.")
    kind = type(error)
    result = {"step": step, "type": kind.__name__ if kind in allowed else "Exception"}
    if isinstance(error, OSError) and type(error.errno) is int:
        result["errno"] = error.errno
    if isinstance(error, subprocess.CalledProcessError) and type(error.returncode) is int:
        result["returncode"] = error.returncode
    return result


def retained_evidence(result):
    failures = [result[key] for key in ("error", "provider_error", "cleanup_error") if key in result]
    failures.extend(result.get("cleanup_errors", []))
    failures.extend(run["error"] for run in result.get("interactive_runs", []) if "error" in run)
    if result.get("passed") is not True or failures:
        report = {key: result[key] for key in ("repo_head", "layout", "directory_retained_for_survivors") if key in result}
        report.update({"passed": False, "checks": dict(result.get("checks", {})), "failures": failures})
        if failures:
            report["checks"]["no_recorded_failure"] = False
        return report
    fields = ("source_sha256", "environment", "layout", "fixture_installation", "repo_head",
              "native_cli_sha256", "version", "commands", "limits", "checks", "passed",
              "synthetic_note_counts", "directory_retained_for_survivors", "error",
              "provider_error", "cleanup_error", "cleanup_errors")
    report = {key: result[key] for key in fields if key in result}
    report["provider_requests"] = [
        {"method": request["method"]} for request in result.get("provider_requests", [])]
    report["observer_events"] = []
    for event in result.get("observer_events", []):
        entry = {key: event[key] for key in ("type", "pid", "ppid", "code", "errorType") if key in event}
        if event["type"] == "metadata":
            entry["tool_names"] = [tool["name"] for tool in event["metadata"]["tools"]
                                   if tool["name"] in ("work_ledger_get", "work_ledger_record")]
        report["observer_events"].append(entry)
    report["interactive_runs"] = []
    for run in result.get("interactive_runs", []):
        record = {key: run[key] for key in
                  ("pid", "input", "shutdown", "exit_status", "survivors_after_exit", "error") if key in run}
        record["snapshots"] = []
        for snapshot in run.get("snapshots", []):
            entry = {key: snapshot[key] for key in
                     ("stage", "observer_pid", "maintained_pid",
                      "previous_maintained_stopped", "previous_observer_stopped") if key in snapshot}
            entry["processes"] = [{"pid": process["pid"]} for process in snapshot.get("processes", [])]
            record["snapshots"].append(entry)
        report["interactive_runs"].append(record)
    return sanitize(report)


def write_report():
    temporary, created = None, False
    try:
        if not REPORT_READY:
            RESULT.setdefault("checks", {}).setdefault("report_invalidated", False)
            print(json.dumps(retained_evidence(RESULT)), file=sys.stderr)
            return
        result_file = OUTPUT / f"real-host-{ARGS.layout}.json"
        temporary = OUTPUT / (".real-host-" + uuid.uuid4().hex + ".tmp")
        with temporary.open("x", encoding="utf-8") as file:
            created = True
            file.write(json.dumps(retained_evidence(RESULT), indent=2) + "\n")
        os.replace(temporary, result_file)
        print(json.dumps({"layout": ARGS.layout, "checks": RESULT.get("checks", {}),
                          "passed": RESULT["passed"]}, indent=2))
    except BaseException as error:
        failure = {"passed": False, "checks": {"report_written": False},
                   "error": failure_info(error, "report-write")}
        for path in ([temporary] if created else []) + ([result_file] if REPORT_READY else []):
            try:
                path.unlink(missing_ok=True)
            except BaseException as cleanup:
                failure["checks"]["report_removed"] = False
                failure.setdefault("failures", []).append(failure_info(cleanup, "report-write"))
        try:
            print(json.dumps(failure), file=sys.stderr)
        except BaseException as reporting:
            failure["checks"]["failure_report_emitted"] = False
            failure.setdefault("failures", []).append(failure_info(reporting, "report-write"))
            try:
                os.write(2, json.dumps(failure).encode() + b"\n")
            except BaseException:
                raise SystemExit(1) from None
        raise SystemExit(1) from None


def finish_report():
    if PROVIDER is not None:
        operations = ([PROVIDER.shutdown] if PROVIDER_THREAD is not None and PROVIDER_THREAD.is_alive() else [])
        operations.append(PROVIDER.server_close)
        if PROVIDER_THREAD is not None and PROVIDER_THREAD.ident is not None:
            operations.append(lambda: PROVIDER_THREAD.join(timeout=2))
        for operation in operations:
            try:
                operation()
            except BaseException as error:
                RESULT["passed"] = False
                RESULT.setdefault("checks", {})["provider_shutdown"] = False
                RESULT["provider_error"] = failure_info(error, "provider-shutdown")
                RESULT.setdefault("cleanup_errors", []).append(RESULT["provider_error"])
        if PROVIDER_THREAD is not None and PROVIDER_THREAD.is_alive():
            RESULT["provider_error"] = failure_info(RuntimeError(), "provider-shutdown")
            RESULT.setdefault("cleanup_errors", []).append(RESULT["provider_error"])
        if "provider_error" in RESULT:
            RESULT["passed"] = False
            RESULT.setdefault("checks", {})["provider_shutdown"] = False
    survivors, uncertain = [], False
    for run in RESULT["interactive_runs"]:
        if run.get("pid") is None:
            continue
        try:
            stop_owned(run["pid"], run["_owned"])
            survivors.extend(owned_processes(run["pid"], run["_owned"]))
            if not run.get("_reaped", True):
                os.waitpid(run["pid"], 0)
                run["_reaped"] = True
        except BaseException as error:
            RESULT["passed"] = False
            RESULT.setdefault("checks", {})["cleanup_completed"] = False
            RESULT["cleanup_error"] = failure_info(error, "process-cleanup")
            RESULT.setdefault("cleanup_errors", []).append(RESULT["cleanup_error"])
            uncertain = True
        finally:
            if run.get("_terminal") is not None:
                try:
                    os.close(run["_terminal"])
                except BaseException as error:
                    RESULT["passed"] = False
                    RESULT.setdefault("checks", {})["cleanup_completed"] = False
                    RESULT.setdefault("cleanup_errors", []).append(failure_info(error, "process-cleanup"))
                run["_terminal"] = None
    RESULT["directory_retained_for_survivors"] = bool(survivors) or uncertain
    if ROOT_CREATED and not RESULT["directory_retained_for_survivors"]:
        try:
            current = ROOT.lstat()
            if ROOT.is_symlink() or ROOT_ID != (current.st_dev, current.st_ino):
                raise RuntimeError("Owned disposable root identity changed.")
            for directory, _, _ in os.walk(ROOT):
                folder = Path(directory)
                folder.chmod(folder.stat().st_mode | 0o700)
            shutil.rmtree(ROOT)
        except BaseException as error:
            RESULT["passed"] = False
            RESULT.setdefault("checks", {})["cleanup_completed"] = False
            RESULT["cleanup_error"] = failure_info(error, "disposable-cleanup")
            RESULT.setdefault("cleanup_errors", []).append(RESULT["cleanup_error"])
            RESULT["directory_retained_for_survivors"] = True
    write_report()


def observer_events():
    file = ROOT / "observer.jsonl"
    return [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []


def process_tree(pid):
    entries, pending = [], [pid]
    while pending:
        current = pending.pop()
        record = subprocess.run(["/bin/ps", "-p", str(current), "-o", "pid=,ppid=,command="],
                                env=ENV, capture_output=True, text=True)
        if record.returncode == 0:
            entries.append({"pid": current, "command": record.stdout.strip()})
        children = subprocess.run(["/usr/bin/pgrep", "-P", str(current)],
                                  env=ENV, capture_output=True, text=True)
        pending.extend(int(value) for value in children.stdout.split())
    return entries


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def owned_processes(root, seen):
    output = subprocess.check_output(
        ["/bin/ps", "-axo", "pid=,ppid=,pgid=,lstart=,stat=,command="], env=ENV, text=True, stderr=subprocess.PIPE)
    entries = []
    for line in output.splitlines():
        fields = line.split(None, 9)
        if len(fields) == 10:
            entries.append({"pid": int(fields[0]), "parent": int(fields[1]), "group": int(fields[2]),
                            "start": " ".join(fields[3:8]), "state": fields[8]})
    root_entry = next((entry for entry in entries if entry["pid"] == root), None)
    same_root = root_entry is None or root not in seen or root_entry["start"] == seen[root]
    selected = {root} if same_root else set()
    for _ in range(len(entries) + 1):
        previous = len(selected)
        for entry in entries:
            if (same_root and entry["group"] == root) or entry["parent"] in selected or seen.get(entry["pid"]) == entry["start"]:
                selected.add(entry["pid"])
                seen[entry["pid"]] = entry["start"]
        if len(selected) == previous:
            break
    return [entry["pid"] for entry in entries if entry["pid"] in selected and not entry["state"].startswith("Z")]


def stop_owned(root, seen):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        for pid in owned_processes(root, seen):
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            if not owned_processes(root, seen):
                return
            time.sleep(0.1)
    raise RuntimeError("Owned acceptance processes survived cleanup; retain the disposable directory.")


def interactive(replace):
    base = sum(event["type"] == "complete" for event in observer_events())
    args = [CLI, *FLAGS, "--no-mouse", "--screen-reader"]
    RESULT["commands"].append(args)
    run = {"pid": None, "replace": replace, "input": [], "snapshots": [], "_owned": {},
           "_terminal": None, "_reaped": False}
    RESULT["interactive_runs"].append(run)
    run["pid"], run["_terminal"] = pty.fork()
    child, terminal = run["pid"], run["_terminal"]
    if child == 0:
        try:
            os.chdir(WORKSPACE)
            fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))
            os.execve(CLI, args, ENV)
        except BaseException as error:
            try:
                os.write(2, json.dumps({"passed": False, "error": failure_info(error, "host-shutdown")}).encode())
            finally:
                os._exit(127)
    transcript = bytearray()
    approvals, folder_trust = 0, False

    def send(value):
        run["input"].append(value.decode().replace("\r", "<ENTER>"))
        os.write(terminal, value)

    def drain(seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            owned_processes(child, run["_owned"])
            readable, _, _ = select.select([terminal], [], [], 0.1)
            if readable:
                try:
                    chunk = os.read(terminal, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                transcript.extend(chunk)

    def ready(target):
        nonlocal approvals, folder_trust
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            drain(0.25)
            text = transcript.decode(errors="replace")
            if not folder_trust and "Do you trust the files in this folder?" in text:
                send(b"\r")
                folder_trust = True
            consent = f'Extension "{ARGS.layout}:work-ledger" wants elevated permissions'
            if text.count(consent) > approvals:
                send(b"\r")
                approvals += 1
            events = observer_events()
            errors = [event for event in events if event["type"] == "error"]
            if errors:
                raise RuntimeError("Acceptance observer failed.")
            if sum(event["type"] == "complete" for event in events) >= target:
                return
        raise TimeoutError("real extension did not finish its no-inference tool checks")

    def snapshot(stage):
        processes = process_tree(child)
        joined = [event for event in observer_events() if event["type"] == "complete"][-1]
        observer_pid = joined["pid"]
        maintained = [record["pid"] for record in processes
                      if "preloads/extension_bootstrap.mjs" in record["command"] and record["pid"] != observer_pid]
        if len(maintained) != 1:
            raise RuntimeError("Expected exactly one maintained extension process.")
        data = {"stage": stage, "sessionId": joined["sessionId"], "processes": processes,
                "observer_pid": observer_pid, "maintained_pid": maintained[0]}
        if run["snapshots"]:
            previous = run["snapshots"][-1]
            data["previous_maintained_stopped"] = not alive(previous["maintained_pid"])
            data["previous_observer_stopped"] = not alive(previous["observer_pid"])
        run["snapshots"].append(data)

    try:
        ready(base + 1)
        snapshot("joined")
        if replace:
            send(b"/clear\r")
            ready(base + 2)
            snapshot("replaced")
    except Exception as error:
        run["error"] = failure_info(error, "interactive")
    finally:
        try:
            send(b"/exit\r")
        except OSError:
            pass
        deadline = time.monotonic() + 12
        exited, status = 0, None
        while time.monotonic() < deadline:
            drain(0.25)
            exited, status = os.waitpid(child, os.WNOHANG)
            if exited:
                run["_reaped"] = True
                break
        run["shutdown"] = "slash-exit" if exited else "forced-sigterm"
        if not exited:
            stop_owned(child, run["_owned"])
            _, status = os.waitpid(child, 0)
            run["_reaped"] = True
        os.close(terminal)
        run["_terminal"] = None
        run["exit_status"] = status
        run["transcript"] = transcript.decode(errors="replace")
        run["survivors_after_exit"] = owned_processes(child, run["_owned"])
        if run["survivors_after_exit"]:
            run.setdefault("error", failure_info(RuntimeError(), "host-shutdown"))
            stop_owned(child, run["_owned"])
        if owned_processes(child, run["_owned"]):
            raise RuntimeError("Owned acceptance children remain; do not restart or remove their directory.")
    if "error" in run:
        raise RuntimeError("Interactive lifecycle failed.")


def bootstrap():
    global ARGS, SOURCE, OUTPUT, ROOT, PROVIDER, PROVIDER_THREAD, ROOT_ID
    global ROOT_CREATED, REPORT_READY, ENV, CLI, WORKSPACE, EXT, CONFIG_BYTES
    global INSTALL_RESULT, HASHES, FLAGS, PROVIDER_REQUESTS
    default_source = Path(__file__).resolve().parent.parent
    parser = SafeArgumentParser(description=__doc__, prog="real-host-acceptance.py", allow_abbrev=False)
    parser.add_argument("--source", type=Path, default=default_source)
    parser.add_argument("--output", type=Path, required=True, help="Private acceptance artifact directory, outside discovery")
    parser.add_argument("--layout", choices=("user", "project"), default="user")
    arguments = sys.argv[1:]
    if arguments in (["--help"], ["-h"]):
        parser.parse_args(arguments)
    destination = SafeArgumentParser(add_help=False, allow_abbrev=False)
    for option in ("output", "source", "layout"):
        destination.add_argument("--" + option, action="append", nargs="?")
    pending, _ = destination.parse_known_args(arguments)
    if not pending.output or len(pending.output) != 1 or not pending.output[0]:
        parser.error("Evidence output identity is ambiguous.")
    SOURCE = default_source
    requested_output = Path(pending.output[0])
    OUTPUT = requested_output.resolve()
    sources = [SOURCE, *(Path(value).resolve() for value in (pending.source or []) if value)]
    if any(part.lower() == "extensions" for part in (*requested_output.parts, *OUTPUT.parts)) or any(
            OUTPUT == source or source in OUTPUT.parents for source in sources):
        parser.error("Use an artifact directory outside source and extension discovery.")
    source_identities = set()
    for source in sources:
        try:
            identity = source.stat()
        except FileNotFoundError:
            parts = tuple(part.casefold() for part in source.parts)
            if tuple(part.casefold() for part in OUTPUT.parts[:len(parts)]) == parts:
                parser.error("Evidence output overlaps an unresolved source.")
            continue
        source_identities.add((identity.st_dev, identity.st_ino))
    for ancestor in (OUTPUT, *OUTPUT.parents):
        try:
            identity = ancestor.stat()
        except FileNotFoundError:
            continue
        if (identity.st_dev, identity.st_ino) in source_identities:
            parser.error("Evidence output overlaps source identity.")
    OUTPUT.mkdir(parents=True, exist_ok=True, mode=0o700)
    if OUTPUT.stat().st_mode & 0o077:
        parser.error("Artifact directory must deny group and other access.")
    layouts = pending.layout or ["user"]
    layout = layouts[0] if len(layouts) == 1 and layouts[0] in ("user", "project") else None
    for name in ([layout] if layout is not None else ["user", "project"]):
        (OUTPUT / f"real-host-{name}.json").unlink(missing_ok=True)
    RESULT["checks"]["report_invalidated"] = True
    if layout is None:
        parser.error("Evidence layout identity is ambiguous.")
    ARGS = argparse.Namespace(layout=layout)
    REPORT_READY = True
    RESULT["layout"] = layout
    ARGS = parser.parse_args(arguments)
    SOURCE = ARGS.source.resolve()
    ROOT = OUTPUT / ("host-acceptance-" + uuid.uuid4().hex)
    ROOT.mkdir(mode=0o700)
    ROOT_CREATED = True
    identity = ROOT.lstat()
    ROOT_ID = (identity.st_dev, identity.st_ino)
    VERSION = "1.0.102-0.unstable.r40141230562.g130d689"
    TOOLING = OUTPUT / "host-acceptance-tooling"
    CLI = str(TOOLING / "package/copilot")
    if not Path(CLI).exists():
        TOOLING.mkdir(exist_ok=True, mode=0o700)
        archive = TOOLING / "copilot.tgz"
        url = f"https://registry.npmjs.org/@github/copilot-darwin-arm64/-/copilot-darwin-arm64-{VERSION}.tgz"
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url, timeout=60) as response, archive.open("wb") as target:
            shutil.copyfileobj(response, target)
        integrity = base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
        if integrity != "FI4VpxHoCGfTS4U5g9Dpt5QXwomfUXiLPC9vFdnp7Vpvkm620UhBhQv0HkIiJwUSx0u0Uv+yU2Sn+KO1j8G+Tw==":
            raise RuntimeError("CLI archive integrity mismatch; extraction refused.")
        with tarfile.open(archive) as package:
            package.extractall(TOOLING, filter="data")
    if hashlib.sha256(Path(CLI).read_bytes()).hexdigest() != "ce1fb3c2159e3712fd634db3f7840280e3026615e9eb604dcd9ed58a55ad3fd5":
        raise RuntimeError("CLI binary integrity mismatch; execution refused.")
    ENV = {
        "PATH": "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(ROOT / "home"),
        "COPILOT_HOME": str(ROOT / "copilot"),
        "XDG_CONFIG_HOME": str(ROOT / "xdg-config"),
        "XDG_CACHE_HOME": str(ROOT / "xdg-cache"),
        "XDG_DATA_HOME": str(ROOT / "xdg-data"),
        "XDG_STATE_HOME": str(ROOT / "xdg-state"),
        "TMPDIR": str(ROOT / "scratch"),
        "WORK_LEDGER_DIR": str(ROOT / "ledger"),
        "WORK_LEDGER_GH": "/usr/bin/false",
        "COPILOT_OFFLINE": "true",
        "COPILOT_MODEL": "acceptance-no-inference",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GH_CONFIG_DIR": str(ROOT / "gh"),
        "GH_PROMPT_DISABLED": "1",
        "GH_NO_UPDATE_NOTIFIER": "1",
        "TERM": "xterm-256color",
        "NO_COLOR": "1",
        "LANG": "en_US.UTF-8",
    }
    PROVIDER_REQUESTS = []


    class RejectInference(http.server.BaseHTTPRequestHandler):
        def reject(self):
            PROVIDER_REQUESTS.append({"method": self.command})
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"inference forbidden in acceptance"}')

        do_GET = reject
        do_POST = reject
        do_PUT = reject
        do_DELETE = reject

        def log_message(self, *_):
            pass


    def serve_provider():
        try:
            PROVIDER.serve_forever()
        except BaseException as error:
            RESULT["provider_error"] = failure_info(error, "provider-shutdown")
            RESULT.setdefault("cleanup_errors", []).append(RESULT["provider_error"])

    PROVIDER = http.server.ThreadingHTTPServer(("127.0.0.1", 0), RejectInference)
    PROVIDER_THREAD = threading.Thread(target=serve_provider, daemon=True)
    PROVIDER_THREAD.start()
    with socket.create_connection(PROVIDER.server_address, timeout=2):
        pass
    ENV["COPILOT_PROVIDER_BASE_URL"] = f"http://127.0.0.1:{PROVIDER.server_port}/v1"
    for key in ("HOME", "COPILOT_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
                "XDG_DATA_HOME", "XDG_STATE_HOME", "TMPDIR", "WORK_LEDGER_DIR", "GH_CONFIG_DIR"):
        Path(ENV[key]).mkdir(parents=True, exist_ok=True, mode=0o700)
    WORKSPACE = ROOT / "workspace"
    WORKSPACE.mkdir()
    EXTENSIONS = Path(ENV["COPILOT_HOME"]) / "extensions" if ARGS.layout == "user" else WORKSPACE / ".github/extensions"
    EXT = EXTENSIONS / "work-ledger"
    EXT.mkdir(parents=True)
    shutil.copy2(SOURCE / "extension.mjs", EXT / "extension.mjs")
    shutil.copytree(SOURCE / "lib", EXT / "lib")
    CONFIG_BYTES = json.dumps({"defaultRepo": "example/acceptance", "debug": True}).encode()
    (EXT / "config.json").write_bytes(CONFIG_BYTES)
    (EXT / "config.json").chmod(0o400)
    (EXT / "extension.mjs").chmod(0o400)
    for module in (EXT / "lib").glob("*.mjs"):
        module.chmod(0o444)
    (EXT / "lib").chmod(0o555)
    NODE = shutil.which("node")
    if not NODE:
        parser.error("Node.js is required for the disposable owner-installer transaction.")
    installer = [NODE, str(SOURCE / "owner-install.mjs")]
    snapshot = json.loads(subprocess.check_output(
        [*installer, "--inspect", str(EXT)], env=ENV, text=True, stderr=subprocess.PIPE))
    request = {
        "candidate": str(SOURCE), "installed": str(EXT), "backupParent": str(ROOT / "owner-backups"),
        "sourceHash": hashlib.sha256((SOURCE / "SOURCE.sha256").read_bytes()).hexdigest(),
        "installedHash": snapshot["hash"],
        "ledgerConfigHash": "absent",
    }
    request_file = ROOT / "request.json"
    request_bytes = json.dumps(request).encode()
    request_file.write_bytes(request_bytes)
    request_pin = hashlib.sha256(request_bytes).hexdigest()
    INSTALL_RESULT = json.loads(subprocess.check_output([
        *installer, "--request", str(request_file), "--sha256", request_pin,
        "--install", "--hosts-stopped", "--confirm", f"install {request_pin}",
    ], env=ENV, text=True, stderr=subprocess.PIPE))
    OBSERVER = EXT.parent / "zz-acceptance-observer"
    OBSERVER.mkdir()
    (OBSERVER / "extension.mjs").write_text(r'''
    import fs from "node:fs";
    import path from "node:path";
    import { joinSession } from "@github/copilot-sdk/extension";
    const output = path.join(path.dirname(process.env.WORK_LEDGER_DIR), "observer.jsonl");
    const emit = event => fs.appendFileSync(output, JSON.stringify({
      at: new Date().toISOString(), pid: process.pid, ppid: process.ppid, ...event
    }) + "\n");
    process.on("SIGTERM", () => { emit({ type: "sigterm" }); process.exit(0); });
    process.on("exit", code => emit({ type: "exit", code }));
    try {
      const session = await joinSession();
      emit({ type: "joined", sessionId: session.sessionId });
      let metadata;
      for (let i = 0; i < 80; i++) {
        metadata = await session.rpc.tools.getCurrentMetadata();
        if (JSON.stringify(metadata).includes("work_ledger_record")) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      emit({ type: "metadata", sessionId: session.sessionId, metadata: {
        ...metadata, tools: (metadata.tools || []).filter(tool => /^work_ledger_/.test(tool.name))
      } });
      if (!JSON.stringify(metadata).includes("work_ledger_record")) throw new Error("maintained tools not offered");
      const before = await session.rpc.tools.execute({ name: "work_ledger_get", arguments: { repo: "example/acceptance", pr: 1 } });
      emit({ type: "get-before", sessionId: session.sessionId, result: before });
      const result = await session.rpc.tools.execute({
        name: "work_ledger_record",
        arguments: { repo: "example/acceptance", pr: 1, kind: "note",
          evidence: "Synthetic lifecycle marker. No test, review, device, approval, or deployment claim." }
      });
      emit({ type: "record", sessionId: session.sessionId, result });
      const after = await session.rpc.tools.execute({ name: "work_ledger_get", arguments: { repo: "example/acceptance", pr: 1 } });
      emit({ type: "complete", sessionId: session.sessionId, result: after });
    } catch {
      emit({ type: "error", errorType: "Error" });
    }
    ''')
    HASHES = {str(p.relative_to(SOURCE)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in [SOURCE / "extension.mjs", *sorted((SOURCE / "lib").glob("*.mjs"))]}
    FLAGS = ["--no-auto-update", "--no-custom-instructions", "--disable-builtin-mcps",
             "--no-remote", "--no-remote-export", "--disable-client-telemetry", "--experimental",
             "--log-level", "debug", "--log-dir", str(ROOT / "logs"), "-C", str(WORKSPACE)]
    RESULT.update({
        "source_sha256": HASHES, "environment": {key: "<SET>" for key in ENV}, "layout": ARGS.layout,
        "fixture_installation": INSTALL_RESULT,
        "repo_head": subprocess.check_output(
            ["/usr/bin/git", "rev-parse", "HEAD"], cwd=SOURCE.parent.parent, env=ENV, text=True, stderr=subprocess.PIPE).strip(),
        "native_cli_sha256": hashlib.sha256(Path(CLI).read_bytes()).hexdigest(),
        "version": subprocess.check_output(
            [CLI, "--no-auto-update", "--version"], env=ENV, text=True, stderr=subprocess.PIPE).strip(),
        "commands": [], "interactive_runs": [],
        "limits": [
            "Real CLI host only; not desktop reload acceptance.",
            "No user prompt, authentication, deployment, Gradle, or inference request.",
            "Synthetic configuration enables debug; /usr/bin/false blocks GitHub lookups.",
            "Observer instrumentation uses the bundled real SDK, not a fixture transport.",
        ],
    })


try:
    bootstrap()
    interactive(replace=True)
    ledger_path = ROOT / "ledger/ledger.json"
    RESULT["ledger_before_restart"] = json.loads(ledger_path.read_text()) if ledger_path.exists() else None
    interactive(replace=False)
    RESULT["ledger_after_restart"] = json.loads(ledger_path.read_text()) if ledger_path.exists() else None
    history_file = ROOT / "ledger/history.jsonl"
    RESULT["ledger_history"] = history_file.read_text() if history_file.exists() else ""
    RESULT["observer_events"] = observer_events()
    history = [json.loads(line) for line in RESULT["ledger_history"].splitlines()]
    completions = [event for event in RESULT["observer_events"] if event["type"] == "complete"]
    before_calls = [event for event in RESULT["observer_events"] if event["type"] == "get-before"]
    records = [event for event in RESULT["observer_events"] if event["type"] == "record"]
    metadata = [event for event in RESULT["observer_events"] if event["type"] == "metadata"]
    snapshots = [item for run in RESULT["interactive_runs"] for item in run["snapshots"]]
    marker = "Synthetic lifecycle marker. No test, review, device, approval, or deployment claim."
    old_notes = (RESULT["ledger_before_restart"] or {}).get("units", {}).get("example/acceptance#1", {}).get("notes", [])
    new_notes = (RESULT["ledger_after_restart"] or {}).get("units", {}).get("example/acceptance#1", {}).get("notes", [])
    RESULT["checks"] = {
        "owner_installer_applied_to_disposable_extension": INSTALL_RESULT["installed"] is True,
        "read_only_configuration_preserved": (EXT / "config.json").read_bytes() == CONFIG_BYTES
            and (EXT / "config.json").stat().st_mode & 0o7777 == 0o400,
        "read_only_runtime_and_directory_preserved": (EXT / "extension.mjs").stat().st_mode & 0o7777 == 0o400
            and (EXT / "lib").stat().st_mode & 0o7777 == 0o555
            and all(module.stat().st_mode & 0o7777 == 0o444 for module in (EXT / "lib").glob("*.mjs")),
        "three_real_joined_sessions": len(completions) == 3 and len({event["sessionId"] for event in completions}) == 3,
        "both_maintained_tools_offered_each_session": len(metadata) == 3 and all(
            {tool["name"] for tool in event["metadata"]["tools"]} == {"work_ledger_get", "work_ledger_record"} for event in metadata),
        "real_record_calls_succeeded": len(records) == 3 and all(event["result"]["resultType"] == "success" for event in records),
        "native_pre_tool_hook_each_session": len(completions) == 3 and all(
            any(entry["type"] == "debug.pre" and entry.get("sessionId") == event["sessionId"] and entry.get("tool") == "work_ledger_record"
                for entry in history) for event in completions),
        "maintained_process_replaced": len(snapshots) == 3 and len({item["maintained_pid"] for item in snapshots}) == 3,
        "old_processes_stop_on_clear": len(snapshots) >= 2 and snapshots[1].get("previous_maintained_stopped") is True
            and snapshots[1].get("previous_observer_stopped") is True,
        "slash_exit_clean_without_survivors": all(
            run["shutdown"] == "slash-exit" and run["exit_status"] == 0 and not run["survivors_after_exit"] for run in RESULT["interactive_runs"]),
        "synthetic_notes_survive_host_restart": len(old_notes) == 2 and len(new_notes) == 3 and new_notes[:2] == old_notes,
        "real_tool_reads_persisted_notes": len(before_calls) == 3 and [
            event["result"].get("textResultForLlm", "").count(marker) for event in before_calls] == [0, 1, 2],
        "zero_provider_requests": PROVIDER_REQUESTS == [],
        "maintained_source_and_copies_unchanged": all(
            hashlib.sha256((EXT / name).read_bytes()).hexdigest() == value
            and hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() == value for name, value in HASHES.items()),
        "no_observer_error": not any(event["type"] == "error" for event in RESULT["observer_events"]),
        "no_interactive_error": not any("error" in run for run in RESULT["interactive_runs"]),
    }
    RESULT["provider_requests"] = PROVIDER_REQUESTS
    RESULT["passed"] = all(RESULT["checks"].values())
    RESULT["synthetic_note_counts"] = {"before_restart": len(old_notes), "after_restart": len(new_notes)}
except BaseException as error:
    if isinstance(error, SystemExit) and error.code == 0:
        HELP_ONLY = True
    else:
        RESULT["passed"] = False
        RESULT.setdefault("checks", {})["acceptance_completed"] = False
        RESULT["error"] = failure_info(error, "acceptance")
finally:
    if not HELP_ONLY:
        finish_report()
if not HELP_ONLY and not RESULT.get("passed"):
    raise SystemExit(1)

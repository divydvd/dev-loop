"""Exercise the actual lifecycle functions without starting a Copilot host."""
import ast
import errno
import contextlib
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch


class LifecycleCleanup(unittest.TestCase):
    def test_actual_script_faults_across_bootstrap_allocation_and_reporting(self):
        source = Path(__file__).with_name("real-host-acceptance.py").resolve()
        wrapper = r'''
import errno, hashlib, http.server, io, json, os, pathlib, pty, runpy, select, shutil
import signal, subprocess, sys, threading, time, types, urllib.request
fault, source, directory = sys.argv[1:]
root = pathlib.Path(directory)
def event(kind, value=None):
    with (root / "events.jsonl").open("a") as file:
        file.write(json.dumps({"kind": kind, "value": value}) + "\n")
def fail():
    raise PermissionError(errno.EACCES, "private diagnostic", str(root / "private"))
real_hash = hashlib.sha256
hashlib.sha256 = lambda value=b"": (
    types.SimpleNamespace(hexdigest=lambda: "ce1fb3c2159e3712fd634db3f7840280e3026615e9eb604dcd9ed58a55ad3fd5")
    if value == b"synthetic CLI" else real_hash(value))
real_output = subprocess.check_output
def output(args, **options):
    if "--inspect" in args:
        assert options["stderr"] == subprocess.PIPE
        if fault == "installer": raise subprocess.CalledProcessError(9, args, output="private", stderr=str(root))
        if fault == "installer-timeout": raise subprocess.TimeoutExpired(args, 1, output=str(root))
        return '{"hash":"synthetic"}'
    if "--request" in args:
        assert options["stderr"] == subprocess.PIPE
        return '{"installed":true}'
    if "--version" in args:
        assert options["stderr"] == subprocess.PIPE
        return "synthetic CLI version"
    if "rev-parse" in args and fault == "root-replacement":
        owned = next(root.glob("host-acceptance-????????????????????????????????"))
        owned.rename(root / "displaced-fixture")
        foreign = root / "foreign-fixture"
        foreign.mkdir()
        (foreign / "sentinel").write_text("unchanged")
        foreign.chmod(0o500)
        owned.symlink_to(foreign, target_is_directory=True)
        fail()
    if "rev-parse" in args and fault in (
            "metadata", "report-open", "report-replace", "report-stderr", "report-stdout",
            "report-serialize", "cleanup-remove"):
        fail()
    return real_output(args, **options)
subprocess.check_output = output
real_read, real_write, real_open = pathlib.Path.read_bytes, pathlib.Path.write_bytes, pathlib.Path.open
def read(path, *args, **kwargs):
    if fault == "source-read" and path.name == "SOURCE.sha256": fail()
    return real_read(path, *args, **kwargs)
def write(path, *args, **kwargs):
    if fault == "config-write" and path.name == "config.json": fail()
    return real_write(path, *args, **kwargs)
def opened(path, *args, **kwargs):
    if fault in ("report-open", "report-stderr") and path.name.startswith(".real-host-"): fail()
    return real_open(path, *args, **kwargs)
pathlib.Path.read_bytes, pathlib.Path.write_bytes, pathlib.Path.open = read, write, opened
real_copy = shutil.copy2
def copied(*args, **kwargs):
    if fault == "source-copy": fail()
    return real_copy(*args, **kwargs)
shutil.copy2 = copied
real_remove = shutil.rmtree
def removed(*args, **kwargs):
    if fault == "cleanup-remove": fail()
    return real_remove(*args, **kwargs)
shutil.rmtree = removed
urllib.request.build_opener = lambda *_: types.SimpleNamespace(open=lambda *args, **kwargs: fail())
if fault == "archive-integrity":
    urllib.request.build_opener = lambda *_: types.SimpleNamespace(
        open=lambda *args, **kwargs: io.BytesIO(b"synthetic invalid archive"))
real_dumps = json.dumps
serialize_failed = False
def dumped(value, *args, **kwargs):
    global serialize_failed
    if fault == "report-serialize" and not serialize_failed and isinstance(value, dict) and "failures" in value:
        serialize_failed = True
        raise TypeError("private serialization detail")
    return real_dumps(value, *args, **kwargs)
json.dumps = dumped
BaseServer = http.server.ThreadingHTTPServer
class Server(BaseServer):
    def __init__(self, *args, **kwargs):
        if fault == "provider-allocation": fail()
        super().__init__(*args, **kwargs)
        event("provider-allocated", self.server_port)
    def shutdown(self):
        event("provider-shutdown")
        return super().shutdown()
    def server_close(self):
        event("provider-closed")
        return super().server_close()
http.server.ThreadingHTTPServer = Server
real_start = threading.Thread.start
def started(thread, *args, **kwargs):
    if fault == "provider-thread" and thread._target.__name__ == "serve_provider": fail()
    return real_start(thread, *args, **kwargs)
threading.Thread.start = started
if fault == "provider-thread-constructor":
    threading.Thread = lambda *args, **kwargs: fail()
real_fork, real_close, real_select = pty.fork, os.close, select.select
terminal = None
def forked():
    global terminal
    if fault == "pty-allocation": fail()
    pid, descriptor = real_fork()
    if pid == 0:
        time.sleep(120)
        os._exit(0)
    terminal = descriptor
    event("child", pid)
    return pid, descriptor
def closed(descriptor):
    if descriptor == terminal: event("terminal-closed")
    return real_close(descriptor)
def selected(*args, **kwargs):
    if fault == "after-child": fail()
    return real_select(*args, **kwargs)
pty.fork, os.close, select.select = forked, closed, selected
real_replace = os.replace
def replaced(*args, **kwargs):
    if fault == "report-replace": fail()
    return real_replace(*args, **kwargs)
os.replace = replaced
if fault == "report-stderr":
    class BrokenErrorOutput:
        def write(self, _): raise BrokenPipeError()
        def flush(self): pass
    sys.stderr = BrokenErrorOutput()
if fault == "report-stdout":
    class BrokenOutput:
        def write(self, _): raise BrokenPipeError()
        def flush(self): pass
    sys.stdout = BrokenOutput()
if fault == "counter-binding":
    def traced(frame, phase, _argument):
        if frame.f_code.co_filename == source and frame.f_code.co_name == "bootstrap" and phase == "return":
            sys.settrace(None)
            event("counter-visible", frame.f_globals.get("PROVIDER_REQUESTS") == [])
            raise RuntimeError("synthetic stop before host startup")
        return traced
    sys.settrace(traced)
sys.argv = [source, "--output", str(root)]
try:
    runpy.run_path(source, run_name="__main__")
finally:
    event("finished")
'''
        faults = ("archive-open", "archive-integrity", "source-copy", "config-write", "source-read", "installer",
                  "installer-timeout", "provider-allocation", "provider-thread", "metadata",
                  "pty-allocation", "after-child", "report-open", "report-replace", "report-stderr",
                  "report-stdout", "report-serialize", "cleanup-remove", "root-replacement",
                  "provider-thread-constructor", "counter-binding")
        for fault in faults:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory(prefix="synthetic-back\\owner-") as directory:
                root = Path(directory)
                root.chmod(0o700)
                cli = root / "host-acceptance-tooling/package/copilot"
                if fault not in ("archive-open", "archive-integrity"):
                    cli.parent.mkdir(parents=True)
                    cli.write_bytes(b"synthetic CLI")
                report = root / "real-host-user.json"
                report.write_text('{"passed":true,"repo_head":"synthetic-old-success"}')
                try:
                    result = subprocess.run(
                        [sys.executable, "-c", wrapper, fault, str(source), str(root)],
                        env={"PATH": os.environ["PATH"], "HOME": str(root)}, capture_output=True, text=True, timeout=15)
                except subprocess.TimeoutExpired:
                    raise AssertionError("Synthetic lifecycle cleanup timed out.") from None
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(str(root), result.stdout + result.stderr)
                self.assertNotIn(repr(str(root)), result.stdout + result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertNotIn("private diagnostic", result.stdout + result.stderr)
                retained = list(root.glob("host-acceptance-????????????????????????????????"))
                self.assertEqual(len(retained), int(fault in ("cleanup-remove", "root-replacement")))
                self.assertEqual(list(root.glob(".real-host-*.tmp")), [])
                evidence = json.loads(report.read_text()) if report.exists() else json.loads(result.stderr)
                self.assertFalse(evidence["passed"])
                self.assertIn(False, evidence["checks"].values())
                self.assertNotIn(str(root), json.dumps(evidence))
                if fault in ("cleanup-remove", "root-replacement"):
                    self.assertTrue(evidence["directory_retained_for_survivors"])
                    self.assertFalse(evidence["checks"]["cleanup_completed"])
                if fault == "root-replacement":
                    foreign = root / "foreign-fixture"
                    self.assertEqual(foreign.stat().st_mode & 0o7777, 0o500)
                    self.assertEqual((foreign / "sentinel").read_text(), "unchanged")
                events = [json.loads(line) for line in (root / "events.jsonl").read_text().splitlines()]
                kinds = [entry["kind"] for entry in events]
                self.assertIn("finished", kinds)
                if "provider-allocated" in kinds:
                    self.assertIn("provider-closed", kinds)
                if fault == "provider-thread-constructor":
                    self.assertNotIn("provider-shutdown", kinds)
                if fault == "counter-binding":
                    self.assertTrue(next(entry["value"] for entry in events if entry["kind"] == "counter-visible"))
                if fault == "after-child":
                    self.assertIn("terminal-closed", kinds)
                    pid = next(entry["value"] for entry in events if entry["kind"] == "child")
                    with self.assertRaises(ProcessLookupError):
                        os.kill(pid, 0)

    def test_actual_bootstrap_failure_invalidates_old_success_and_cleans_owned_root(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        for fault in ("cache-directory", "bad-integrity", "unknown-argument"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory(prefix="synthetic-back\\owner-") as directory:
                root = Path(directory)
                root.chmod(0o700)
                cli = root / "host-acceptance-tooling/package/copilot"
                cli.parent.mkdir(parents=True)
                if fault == "cache-directory":
                    cli.mkdir()
                else:
                    cli.write_bytes(b"synthetic unpinned CLI; never execute")
                report = root / "real-host-user.json"
                report.write_text(json.dumps({"passed": True, "repo_head": "synthetic-old-success"}))
                args = [sys.executable, str(source), "--output", str(root)]
                if fault == "unknown-argument":
                    args.extend(["--unexpected", "private argument"])
                result = subprocess.run(args, env={"PATH": os.defpath, "HOME": str(root)},
                                        capture_output=True, text=True, timeout=15)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(str(root), result.stdout + result.stderr)
                self.assertNotIn(repr(str(cli)), result.stdout + result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertEqual(list(root.glob("host-acceptance-????????????????????????????????")), [])
                if report.exists():
                    evidence = json.loads(report.read_text())
                    self.assertFalse(evidence["passed"])
                    self.assertIn(False, evidence["checks"].values())
                else:
                    self.assertFalse(json.loads(result.stderr)["passed"])

    def test_observer_read_failure_cannot_bypass_final_cleanup_and_safe_report(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        tree = ast.parse(source.read_text())
        definitions = [node for node in tree.body if isinstance(
            node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
        main = next(node for node in tree.body if isinstance(node, ast.Try) and node.finalbody
                    and any(isinstance(item, ast.Call) and isinstance(item.func, ast.Name)
                            and item.func.id == "finish_report" for item in ast.walk(node)))
        for existing_events in (False, True):
            with self.subTest(existing_events=existing_events):
                namespace = {"__name__": "lifecycle_under_test"}
                exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), "exec"), namespace)
                result, reports = {"interactive_runs": []}, []
                if existing_events:
                    result["observer_events"] = []
                namespace.update({
                    "RESULT": result, "HELP_ONLY": False, "original_failure": RuntimeError("private observer detail"),
                    "observer_events": Mock(side_effect=PermissionError(errno.EACCES, "private", "/fiction/back\\owner")),
                    "finish_report": lambda: reports.append(namespace["retained_evidence"](result)),
                })
                body = ast.Try(body=[ast.Raise(exc=ast.Name(id="original_failure", ctx=ast.Load()))],
                               handlers=main.handlers, orelse=[], finalbody=main.finalbody)
                exec(compile(ast.fix_missing_locations(ast.Module(body=[body], type_ignores=[])),
                             str(source), "exec"), namespace)
                self.assertEqual(len(reports), 1)
                self.assertFalse(reports[0]["passed"])
                self.assertEqual(reports[0]["failures"], [{"step": "acceptance", "type": "RuntimeError"}])
                self.assertFalse(reports[0]["checks"]["acceptance_completed"])
                self.assertNotIn("/fiction/", json.dumps(reports[0]))

    def test_failure_capture_sites_retain_only_safe_error_types_and_codes(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        tree = ast.parse(source.read_text())
        definitions = [node for node in tree.body if isinstance(
            node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
        namespace = {"__name__": "lifecycle_under_test"}
        exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), "exec"), namespace)
        assignments = [node for node in ast.walk(tree) if isinstance(node, ast.Assign)
                       and isinstance(node.targets[0], ast.Subscript)
                       and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name)
                       and node.value.func.id == "failure_info"
                       and isinstance(node.value.args[0], ast.Name) and node.value.args[0].id == "error"]
        self.assertEqual({node.value.args[1].value for node in assignments},
                         {"interactive", "acceptance", "provider-shutdown", "process-cleanup", "disposable-cleanup"})
        cases = [
            (FileNotFoundError(errno.ENOENT, "private failure", "/fiction/back\\owner/missing"),
             {"type": "FileNotFoundError", "errno": 2}),
            (subprocess.CalledProcessError(7, ["tool", "/fiction/line\nowner"], output="private output"),
             {"type": "CalledProcessError", "returncode": 7}),
            (subprocess.TimeoutExpired(["tool", "/fiction/private"], 3, output="private", stderr="private"),
             {"type": "TimeoutExpired"}),
            (TimeoutError(errno.ETIMEDOUT, "private timeout", "/fiction/private"),
             {"type": "TimeoutError", "errno": errno.ETIMEDOUT}),
            (PermissionError(errno.EACCES, "private cleanup", "/fiction/private"),
             {"type": "PermissionError", "errno": errno.EACCES}),
            (RuntimeError("private observer detail"), {"type": "RuntimeError"}),
            (type("/fiction/private", (Exception,), {})("private attribute"),
             {"type": "Exception"}),
        ]
        for error, expected in cases:
            for assignment in assignments:
                with self.subTest(error=type(error).__name__, site=assignment.targets[0].value.id):
                    namespace.update({"RESULT": {}, "run": {}, "error": error})
                    exec(compile(ast.Module(body=[assignment], type_ignores=[]), str(source), "exec"), namespace)
                    target = assignment.targets[0]
                    self.assertEqual(namespace[target.value.id][target.slice.value],
                                     {**expected, "step": assignment.value.args[1].value})

    def test_retained_report_omits_free_form_diagnostics_and_external_fields(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        tree = ast.parse(source.read_text())
        definitions = [node for node in tree.body if isinstance(
            node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
        namespace = {"__name__": "lifecycle_under_test"}
        exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), "exec"), namespace)
        private = Path("/fiction/back\\owner")
        diagnostic = str(FileNotFoundError(errno.ENOENT, "failure", str(private / "missing")))
        namespace.update({
            "ROOT": private / "proof/host", "SOURCE": private / "repo/tools/work-ledger",
            "OUTPUT": private / "proof",
            "RESULT": {
                "passed": False, "checks": {"no_observer_error": False},
                "error": {"step": "acceptance", "type": "FileNotFoundError", "errno": 2},
                "host_extension_log": [diagnostic], "unexpected_diagnostic": diagnostic,
                "observer_events": [{"type": "error", "pid": 42, "message": diagnostic, "stack": diagnostic,
                                     "result": {"private": diagnostic}, "metadata": {"private": diagnostic}}],
                "provider_requests": [{"method": "POST", "path": diagnostic}],
                "interactive_runs": [{
                    "pid": 41, "error": {"step": "interactive", "type": "CalledProcessError", "returncode": 7},
                    "transcript": diagnostic, "_owned": {41: diagnostic},
                    "snapshots": [{"stage": "joined", "maintained_pid": 43, "observer_pid": 42,
                                   "processes": [{"pid": 43, "command": diagnostic}]}],
                }],
            },
        })
        with patch.object(Path, "home", return_value=private):
            report = namespace["retained_evidence"](namespace["RESULT"])
        self.assertFalse(report["passed"])
        self.assertEqual(report["failures"], [
            {"step": "acceptance", "type": "FileNotFoundError", "errno": 2},
            {"step": "interactive", "type": "CalledProcessError", "returncode": 7},
        ])
        self.assertNotIn("host_extension_log", report)
        self.assertNotIn("unexpected_diagnostic", report)
        self.assertNotIn("observer_events", report)
        self.assertNotIn("provider_requests", report)
        self.assertNotIn("interactive_runs", report)
        self.assertFalse(report["checks"]["no_recorded_failure"])
        self.assertNotIn("/fiction/", json.dumps(report))

    def test_reporting_failure_emits_only_safe_metadata_and_fails(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        definitions = [node for node in ast.parse(source.read_text()).body if isinstance(
            node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
        namespace = {"__name__": "lifecycle_under_test"}
        exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), "exec"), namespace)
        namespace.update({"OUTPUT": Path("/fiction/back\\owner"), "REPORT_READY": True,
                          "ARGS": type("Args", (), {"layout": "user"})(),
                          "RESULT": {"passed": False, "checks": {"acceptance_completed": False}}})
        output = io.StringIO()
        with patch.object(Path, "open", side_effect=PermissionError(errno.EACCES, "private", "/fiction/private")):
            with contextlib.redirect_stderr(output):
                with self.assertRaises(SystemExit) as stopped:
                    namespace["write_report"]()
        self.assertEqual(stopped.exception.code, 1)
        self.assertEqual(json.loads(output.getvalue()), {
            "passed": False, "checks": {"report_written": False},
            "error": {"step": "report-write", "type": "PermissionError", "errno": errno.EACCES},
        })

    def test_cleanup_failures_remain_explicit_without_formatted_diagnostics(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        definitions = [node for node in ast.parse(source.read_text()).body if isinstance(
            node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
        for step in ("provider-shutdown", "process-cleanup", "disposable-cleanup"):
            with self.subTest(step=step):
                namespace = {"__name__": "lifecycle_under_test"}
                exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), "exec"), namespace)
                result = {"passed": True, "checks": {"existing_check": True},
                          "interactive_runs": [{"pid": 123, "_owned": {}}]}
                provider, stop, remove = Mock(), Mock(), Mock()
                thread = Mock(ident=123)
                thread.is_alive.side_effect = [True, False]
                error = PermissionError(errno.EACCES, "private cleanup", "/fiction/back\\owner")
                if step == "provider-shutdown":
                    provider.shutdown.side_effect = error
                elif step == "process-cleanup":
                    stop.side_effect = error
                else:
                    remove.side_effect = error
                reports = []
                namespace.update({
                    "PROVIDER": provider, "RESULT": result, "ROOT": Path("/fiction/private"),
                    "PROVIDER_THREAD": thread, "ROOT_CREATED": True, "ROOT_ID": (1, 2),
                    "stop_owned": stop, "owned_processes": lambda *_: [],
                    "write_report": lambda: reports.append(namespace["retained_evidence"](result)),
                })
                identity = type("Identity", (), {"st_dev": 1, "st_ino": 2})()
                with patch.object(namespace["os"], "walk", return_value=[]), \
                        patch.object(Path, "lstat", return_value=identity), \
                        patch.object(Path, "is_symlink", return_value=False):
                    with patch.object(namespace["shutil"], "rmtree", remove):
                        namespace["finish_report"]()
                self.assertFalse(reports[0]["passed"])
                self.assertIn({"step": step, "type": "PermissionError", "errno": errno.EACCES},
                              reports[0]["failures"])
                self.assertIn(False, reports[0]["checks"].values())
                self.assertEqual(result["directory_retained_for_survivors"], step != "provider-shutdown")
                self.assertNotIn("/fiction/", json.dumps(reports[0]))

    def test_retained_environment_omits_private_values_outside_known_roots(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        tree = ast.parse(source.read_text())
        result = next(node.args[0] for node in ast.walk(tree) if isinstance(node, ast.Call)
                      and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
                      and node.func.value.id == "RESULT" and node.func.attr == "update")
        value = next(value for key, value in zip(result.keys, result.values)
                     if isinstance(key, ast.Constant) and key.value == "environment")
        environment = {"PATH": "/fiction/private-bin:/usr/bin", "HOME": "/fiction/isolated-home"}
        retained = eval(compile(ast.Expression(body=value), str(source), "eval"), {"ENV": environment})
        self.assertEqual(retained, {"PATH": "<SET>", "HOME": "<SET>"})
        self.assertEqual(environment["PATH"], "/fiction/private-bin:/usr/bin")

    def test_evidence_redacts_private_strings_before_json_escaping(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        tree = ast.parse(source.read_text())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "sanitize")
        namespace = {"json": json, "Path": Path}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), namespace)
        for owner in ["\u00e9-owner", 'quoted"owner', "back\\owner", "line\nowner"]:
            with self.subTest(owner=owner):
                private = Path("/fixture/private") / owner
                root, repo, output = private / "proof/host", private / "repo", private / "proof"
                namespace.update({"ROOT": root, "SOURCE": repo / "tools/work-ledger", "OUTPUT": output})
                value = {
                    str(root / "key"): [
                        str(root / "home"), {"command": str(repo / "tool.mjs")},
                        str(output / "evidence.json"), (str(private / "config"), 17, False, None),
                    ],
                    "message": f"load {repo}/module then {root}/extension",
                    "ordinary": "\u00e9 text, quotes \" and backslash \\ stay unchanged",
                }
                original = json.dumps(value)
                with patch.object(Path, "home", return_value=private):
                    actual = namespace["sanitize"](value)
                self.assertEqual(actual, {
                    "<DISPOSABLE>/key": [
                        "<DISPOSABLE>/home", {"command": "<REPO>/tool.mjs"},
                        "<ARTIFACTS>/evidence.json", ["<USER>/config", 17, False, None],
                    ],
                    "message": "load <REPO>/module then <DISPOSABLE>/extension",
                    "ordinary": "\u00e9 text, quotes \" and backslash \\ stay unchanged",
                })
                self.assertEqual(json.dumps(value), original, "Redaction changed the input evidence.")
                self.assertNotIn(json.dumps(str(private))[1:-1], json.dumps(actual))

    def test_optimized_python_rejects_an_unpinned_cached_cli_before_execution(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "proof"
            cli = output / "host-acceptance-tooling/package/copilot"
            cli.parent.mkdir(parents=True)
            output.chmod(0o700)
            marker = root / "executed"
            cli.write_text(f"#!{sys.executable}\nfrom pathlib import Path\nPath({str(marker)!r}).touch()\nraise SystemExit(1)\n")
            cli.chmod(0o700)
            result = subprocess.run(
                [sys.executable, "-O", str(source), "--output", str(output)],
                env={"PATH": os.environ["PATH"], "HOME": str(root)}, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(marker.exists(), "Optimized Python executed an unpinned CLI binary.")
            report = json.loads((output / "real-host-user.json").read_text())
            self.assertFalse(report["passed"])
            self.assertEqual(report["failures"][0], {"step": "acceptance", "type": "RuntimeError"})

    def test_failure_before_snapshot_stops_owned_descendants(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        tree = ast.parse(source.read_text())
        definitions = [node for node in tree.body if isinstance(
            node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
        namespace = {"__name__": "lifecycle_under_test"}
        exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), "exec"), namespace)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pid_file = root / "descendant.pid"
            cli = root / "fake-cli"
            cli.write_text(f"""#!{sys.executable}
import os, signal, subprocess, sys
from pathlib import Path
child = subprocess.Popen([sys.executable, "-c", "import signal,time; signal.signal(signal.SIGHUP, signal.SIG_IGN); signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(120)"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
Path({str(pid_file)!r}).write_text(str(child.pid))
for line in sys.stdin:
    if line.strip() == "/exit": sys.exit(0)
""")
            cli.chmod(0o700)
            result = {"commands": [], "interactive_runs": []}
            namespace.update({
                "CLI": str(cli), "FLAGS": [], "ENV": {"PATH": os.defpath, "HOME": str(root)},
                "WORKSPACE": root, "ROOT": root, "RESULT": result,
                "ARGS": type("Args", (), {"layout": "user"})(),
                "observer_events": lambda: [{"type": "error", "message": "injected before snapshot"}],
            })
            try:
                with self.assertRaises(RuntimeError):
                    namespace["interactive"](replace=False)
                self.assertEqual(result["interactive_runs"][0]["error"],
                                 {"step": "interactive", "type": "RuntimeError"})
                pid = int(pid_file.read_text())
                state = namespace["subprocess"].run(
                    ["/bin/ps", "-p", str(pid), "-o", "stat="], capture_output=True, text=True)
                self.assertTrue(state.returncode != 0 or state.stdout.strip().startswith("Z"),
                                "The owned descendant survived failure before the first snapshot.")
            finally:
                if pid_file.exists():
                    try:
                        os.kill(int(pid_file.read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass


if __name__ == "__main__":
    unittest.main()

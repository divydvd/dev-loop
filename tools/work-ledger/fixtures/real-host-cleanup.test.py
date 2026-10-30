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
                    "RESULT": result, "original_failure": RuntimeError("private observer detail"),
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
                       and node.value.func.id == "failure_info"]
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
        write = next(node for node in ast.walk(tree) if isinstance(node, ast.Call)
                     and isinstance(node.func, ast.Attribute) and node.func.attr == "write_text"
                     and isinstance(node.func.value, ast.Name) and node.func.value.id == "result_file")
        with patch.object(Path, "home", return_value=private):
            report = json.loads(eval(compile(ast.Expression(body=write.args[0]), str(source), "eval"), namespace))
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
        namespace.update({"OUTPUT": Path("/fiction/back\\owner"), "ARGS": type("Args", (), {"layout": "user"})(),
                          "RESULT": {"passed": False, "checks": {"acceptance_completed": False}}})
        output = io.StringIO()
        with patch.object(Path, "write_text", side_effect=PermissionError(errno.EACCES, "private", "/fiction/private")):
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
                    "stop_owned": stop, "owned_processes": lambda *_: [],
                    "write_report": lambda: reports.append(namespace["retained_evidence"](result)),
                })
                with patch.object(namespace["os"], "walk", return_value=[]):
                    with patch.object(namespace["shutil"], "rmtree", remove):
                        namespace["finish_report"]()
                self.assertFalse(reports[0]["passed"])
                self.assertIn({"step": step, "type": "PermissionError", "errno": errno.EACCES},
                              reports[0]["failures"])
                self.assertIn(False, reports[0]["checks"].values())
                self.assertEqual(result["directory_retained_for_survivors"], step == "process-cleanup")
                self.assertNotIn("/fiction/", json.dumps(reports[0]))

    def test_retained_environment_omits_private_values_outside_known_roots(self):
        source = Path(__file__).with_name("real-host-acceptance.py")
        tree = ast.parse(source.read_text())
        result = next(node.value for node in tree.body if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == "RESULT" for target in node.targets))
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
            self.assertIn("integrity", result.stderr.lower())

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

"""Exercise the actual lifecycle functions without starting a Copilot host."""
import ast
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


class LifecycleCleanup(unittest.TestCase):
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
                with self.assertRaisesRegex(RuntimeError, "injected before snapshot"):
                    namespace["interactive"](replace=False)
                self.assertIn("error", result["interactive_runs"][0])
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

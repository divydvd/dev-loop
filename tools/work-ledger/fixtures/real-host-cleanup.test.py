"""Exercise the actual lifecycle functions without starting a Copilot host."""
import ast
import os
from pathlib import Path
import signal
import sys
import tempfile
import unittest


class LifecycleCleanup(unittest.TestCase):
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

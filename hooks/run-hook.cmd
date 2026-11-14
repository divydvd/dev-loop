: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for dev-loop hook scripts.
REM On Windows: cmd.exe locates bash.exe and runs the target script.
REM On Unix: bash treats : << 'CMDBLOCK' ... CMDBLOCK as a no-op comment.

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)

setlocal
if not "%COPILOT_CLI%"=="" (
    echo {}
    exit /b 0
)
set "HOOK_DIR=%~dp0"
set "BASH_EXE="

if exist "C:\Program Files\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if not defined BASH_EXE if exist "C:\Program Files (x86)\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files (x86)\Git\bin\bash.exe"
if not defined BASH_EXE if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" set "BASH_EXE=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not defined BASH_EXE if defined SystemRoot for /f "delims=" %%B in ('"%SystemRoot%\System32\where.exe" $PATH:bash 2^>nul') do if not defined BASH_EXE if not "%%~xB"=="" if /i not "%%~dpB"=="%SystemRoot%\System32\" if /i not "%%~dpB"=="%SystemRoot%\Sysnative\" if /i not "%%~dpB"=="%LOCALAPPDATA%\Microsoft\WindowsApps\" set "BASH_EXE=%%B"

if not defined BASH_EXE exit /b 0

"%BASH_EXE%" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
CMDBLOCK

if [ -n "${COPILOT_CLI:-}" ]; then
  trap '' PIPE
  printf '{}\n' 2>/dev/null || true
  exit 0
fi

# Unix: avoid cd/CDPATH and external dirname/PATH lookups so SessionStart works with an empty PATH.
case "$0" in
  */*|*\\*)
    SCRIPT_DIR="${0%[/\\]*}"
    SCRIPT_DIR="${SCRIPT_DIR:-/}"
    ;;
  *)
    SCRIPT_DIR="."
    ;;
esac
SCRIPT_NAME="$1"
shift
if [ -n "${BASH:-}" ]; then
  BASH_BIN="$BASH"
elif BASH_BIN="$(command -v bash 2>/dev/null)"; then
  :
else
  BASH_BIN="/bin/bash"
fi
exec "$BASH_BIN" "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"

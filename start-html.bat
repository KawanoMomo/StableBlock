@echo off
REM ============================================================================
REM  StableBlock HTML standalone launcher
REM  - Starts a local HTTP server on port 8000
REM  - Opens stableblock.html in the default browser
REM  - Required because file:// blocks fetch() for the Excel template-skeleton
REM ============================================================================

setlocal
cd /d "%~dp0"

set PORT=8000
set URL=http://localhost:%PORT%/stableblock.html

echo.
echo ===============================================
echo  StableBlock - HTML Standalone
echo  URL:  %URL%
echo  Stop: Ctrl+C in this window
echo ===============================================
echo.

REM Open the browser 2 seconds after the server boots, via PowerShell so
REM nested-quote escaping stays sane.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

REM --- Pick a server: Python first (built-in), Node fallback ---------------
where python >nul 2>nul
if %errorlevel%==0 (
    python -m http.server %PORT%
    goto :end
)

where node >nul 2>nul
if %errorlevel%==0 (
    echo Python not found, falling back to npx http-server (first run downloads it)...
    call npx --yes http-server -p %PORT% -c-1
    goto :end
)

echo.
echo ERROR: Neither Python nor Node.js was found in PATH.
echo Install Python 3 from https://www.python.org/ (or Node.js from https://nodejs.org/)
echo and re-run this script.
echo.
pause
exit /b 1

:end
endlocal

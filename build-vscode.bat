@echo off
REM ============================================================================
REM  StableBlock - package and install the VSCode extension
REM  Produces vscode-stableblock\stableblock-<version>.vsix and installs it.
REM ============================================================================

setlocal
cd /d "%~dp0\vscode-stableblock"

echo.
echo === Packaging VSCode extension ===
call npx vsce package --allow-missing-repository
if errorlevel 1 (
    echo Packaging failed.
    pause
    exit /b 1
)

REM Pick the newest stableblock-*.vsix in this directory.
set "LATEST="
for /f "delims=" %%f in ('dir /b /o-d stableblock-*.vsix 2^>nul') do (
    if not defined LATEST set "LATEST=%%f"
)

if not defined LATEST (
    echo ERROR: No stableblock-*.vsix found after packaging.
    pause
    exit /b 1
)

echo.
echo === Installing %LATEST% into VSCode ===
where code >nul 2>nul
if errorlevel 1 (
    echo WARNING: 'code' CLI not found in PATH.
    echo To install manually, run:  code --install-extension "%~dp0vscode-stableblock\%LATEST%"
    echo Or in VSCode: Extensions panel ^> ... menu ^> Install from VSIX.
    pause
    exit /b 0
)

call code --install-extension "%LATEST%"
if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
)

echo.
echo [OK] %LATEST% installed. Restart VSCode (or reload window) to activate.

endlocal

@echo off
REM ============================================================================
REM  StableBlock - run the JS emitter test suite
REM ============================================================================

setlocal
cd /d "%~dp0"

if not exist node_modules\ (
    echo node_modules not found. Running npm install first...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

call npm test
set EXITCODE=%errorlevel%

echo.
if "%EXITCODE%"=="0" (
    echo [OK] All tests passed.
) else (
    echo [FAIL] Tests failed with exit code %EXITCODE%.
    pause
)

endlocal & exit /b %EXITCODE%

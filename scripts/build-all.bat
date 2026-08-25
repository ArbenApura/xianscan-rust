@echo off
echo ========================================
echo [1/2] Building Web Frontend (Yarn)
echo ========================================
call yarn --cwd web build
if errorlevel 1 (
    echo [ERROR] Web build failed with error code %errorlevel%
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================
echo [2/2] Building Rust Standalone Binary
echo ========================================
cargo build --release --features embed-models,embed-web
if errorlevel 1 (
    echo [ERROR] Cargo build failed with error code %errorlevel%
    pause
    exit /b %errorlevel%
)

echo.
echo [SUCCESS] Build completed successfully!
pause


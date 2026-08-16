@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo   XIANSCAN-RUST -- NATIVE UNIFIED HIGH-PERFORMANCE SERVER
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. CHECK RUST
where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Cargo / Rust was not found in PATH. Please install Rust from https://rustup.rs.
    pause
    exit /b 1
)

:: 2. FREE PORTS IF LINGERING
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8123" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8124" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

:: 3. BUILD RELEASE RUST ENGINE IF MISSING
if not exist "target\release\xianscan-rust.exe" (
    echo [*] Compiling optimized release binary...
    cargo build --release
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Rust build failed.
        pause
        exit /b 1
    )
)

:: 4. SETUP WEB ENVIRONMENT & BUILD IF MISSING
if not exist "web\node_modules" (
    echo [*] Installing web application dependencies...
    cd web
    call npm install
    cd ..
)

if not exist "web\build\index.js" (
    echo [*] Production build not found. Building web application...
    cd web
    call npm run build
    cd ..
)

:: 5. LAUNCH UNIFIED NATIVE SERVER (HOSTS BOTH ML ENGINE & WEB UI)
echo [*] Launching Unified XianScan Native + Web Server...
echo.
target\release\xianscan-rust.exe


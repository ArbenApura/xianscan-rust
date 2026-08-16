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

echo.
echo ================================================================
echo   [+] Starting ML Engine on http://127.0.0.1:8123
echo   [+] Starting Web App on   http://localhost:8124
echo ================================================================
echo.

:: Launch Native Rust ML Engine in background window and Web App in foreground
start "XianScan Native ML Engine" cmd /k "cd /d "%~dp0" && target\release\xianscan-rust.exe"

cd /d "%~dp0web"
call npm run preview

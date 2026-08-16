#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "================================================================"
echo "  XIANSCAN-RUST -- NATIVE UNIFIED HIGH-PERFORMANCE SERVER"
echo "================================================================"
echo ""

if ! command -v cargo &> /dev/null; then
    echo "[ERROR] Cargo / Rust was not found. Please install Rust from https://rustup.rs."
    exit 1
fi

if [ ! -f "target/release/xianscan-rust" ]; then
    echo "[*] Compiling optimized release binary..."
    cargo build --release
fi

if [ ! -d "web/node_modules" ]; then
    echo "[*] Installing web application dependencies..."
    cd web && npm install && cd ..
fi

if [ ! -f "web/build/index.js" ]; then
    echo "[*] Production build not found. Building web application..."
    cd web && npm run build && cd ..
fi

echo "[*] Launching Unified XianScan Native + Web Server..."
echo ""
exec ./target/release/xianscan-rust

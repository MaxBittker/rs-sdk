#!/bin/bash
# Updates the vendored rsmod-pathfinder WASM files from source
# Requires: rust, wasm-pack

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_URL="https://github.com/MaxBittker/rsmod-pathfinder.git"
TMP_DIR=$(mktemp -d)

echo "Cloning rsmod-pathfinder..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR"

echo "Building WASM with wasm-pack..."
cd "$TMP_DIR"
wasm-pack build --target nodejs --release

echo "Copying pkg files to vendor..."
# wasm-pack outputs files named after the [lib] name in Cargo.toml ("rsmod")
cp pkg/rsmod.js "$SCRIPT_DIR/rsmod-pathfinder.js"
cp pkg/rsmod.d.ts "$SCRIPT_DIR/rsmod-pathfinder.d.ts"
cp pkg/rsmod_bg.wasm "$SCRIPT_DIR/rsmod_bg.wasm"
cp pkg/rsmod_bg.wasm.d.ts "$SCRIPT_DIR/rsmod_bg.wasm.d.ts"

echo "Cleaning up..."
rm -rf "$TMP_DIR"

echo "Done! Vendored files updated."
ls -la "$SCRIPT_DIR"

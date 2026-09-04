#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACT_VERSION="0.8.1-anyfile.1"
UPSTREAM_URL="https://github.com/AndyCappDev/stet/archive/refs/tags/v0.8.1.tar.gz"
UPSTREAM_SHA256="78a1140a4fad3862325f04402e746f590b4fb82664127e9416d97a2052be0510"
OUTPUT_DIR="$PROJECT_DIR/third_party/stet-wasm/$ARTIFACT_VERSION"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

test "$(rustc --version)" = "rustc 1.94.0 (4a4ef493e 2026-03-02)"
test "$(wasm-pack --version)" = "wasm-pack 0.14.0"

curl --fail --location --silent --show-error "$UPSTREAM_URL" -o "$BUILD_DIR/stet.tar.gz"
echo "$UPSTREAM_SHA256  $BUILD_DIR/stet.tar.gz" | shasum -a 256 -c -
tar -xzf "$BUILD_DIR/stet.tar.gz" -C "$BUILD_DIR"
wasm-pack build --target web --release "$BUILD_DIR/stet-0.8.1/crates/stet-wasm"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp "$BUILD_DIR/stet-0.8.1/crates/stet-wasm/pkg/stet_wasm.js" "$OUTPUT_DIR/"
cp "$BUILD_DIR/stet-0.8.1/crates/stet-wasm/pkg/stet_wasm_bg.wasm" "$OUTPUT_DIR/"
cp "$BUILD_DIR/stet-0.8.1/LICENSE-APACHE" "$OUTPUT_DIR/"
cp "$BUILD_DIR/stet-0.8.1/LICENSE-MIT" "$OUTPUT_DIR/"
cp "$SCRIPT_DIR/SOURCE.md" "$OUTPUT_DIR/"
cp "$SCRIPT_DIR/THIRD_PARTY_NOTICES.md" "$OUTPUT_DIR/"
node "$SCRIPT_DIR/smoke.mjs" "$OUTPUT_DIR"
node "$SCRIPT_DIR/write-build-info.mjs" "$OUTPUT_DIR"

#!/bin/sh
# The generator's own test: generate the fixture's Rust, build it, and compare it with
# valibot on inputs built from the fixture's schemas; then V8's Date.parse, ported, against
# Node's in UTC and in a fixed-offset zone.
set -e
cd "$(dirname "$0")"
bun install --silent
bun ../cli.ts schema-gen.json
cargo build -q --manifest-path rust/Cargo.toml
TZ=UTC bun ../differential.ts schema-gen.json
TZ=UTC node date.mjs
TZ=Etc/GMT-3 node date.mjs

#!/bin/sh
# The generator's own test: generate the fixture's Rust, build it, and compare it with
# valibot on inputs built from the fixture's schemas.
set -e
cd "$(dirname "$0")"
bun install --silent
bun ../cli.ts schema-gen.json
cargo build -q --manifest-path rust/Cargo.toml
bun ../differential.ts schema-gen.json

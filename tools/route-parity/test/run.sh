#!/bin/sh
# The check's own test: a fixture API and a stand-in port missing one route. The check must
# fail without the omission and pass with it.
set -eu
cd "$(dirname "$0")"
bun install --silent
bun port.ts > .url & port=$!
trap 'kill $port' EXIT
while [ ! -s .url ]; do sleep 0.1; done
url=$(cat .url)
if bun ../cli.ts parity.json --url "$url"; then echo "expected a missing route" >&2; exit 1; fi
bun ../cli.ts parity-omitted.json --url "$url"
echo "route parity test passed"

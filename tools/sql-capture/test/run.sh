#!/bin/sh
# The tool's own test: a fixture API captured as an app with an N+1 query and writes
# outside a transaction, and again as a port that fixed both. The per-route files and the
# comparison must show each.
set -eu
cd "$(dirname "$0")"
bun install --silent
mkdir -p out
bun drive.ts out/app.jsonl
FIXED=1 bun drive.ts out/port.jsonl
bun ../cli.ts routes.json --capture out/app.jsonl --out out/sql
bun ../cli.ts routes.json --compare out/app.jsonl out/port.jsonl > out/compare.md
cat out/compare.md
# Swapped, the fixed side is the app, and the port's regressions must be noted.
bun ../cli.ts routes.json --compare out/port.jsonl out/app.jsonl > out/swapped.md
# With the extra statements accepted, only the repeats are still noted.
bun ../cli.ts routes-accepted.json --compare out/port.jsonl out/app.jsonl > out/accepted.md

expect() {
  grep -qF -- "$2" "$1" || { echo "expected in $1: $2" >&2; exit 1; }
}
expect out/sql/get-api-projects.md 'up to 4 times in one request'
expect out/sql/post-api-projects.md '| 1 | 2 | 2 | 0 | 2 |'
expect out/sql/get-projects-{id}-report.md 'Grouped by URL'
expect out/sql/README.md '| [GET /api/projects/:id](get-api-projects-{id}.md) | 3 | 1 | 1 | 0 |  |'
expect out/sql/get-api-projects-{id}.md '1 of them in process, from another request.'
expect out/sql/README.md 'Calls outside any request: 1.'
expect out/compare.md '| GET /api/projects | 5 → 1 | 5 → 1 | 0 → 0 | 1 → 0 |  |'
expect out/compare.md '| POST /api/projects | 2 → 4 | 2 → 2 | 0 → 1 | 0 → 0 |  |'
expect out/swapped.md 'more statements; more repeated statements |'
expect out/swapped.md 'fewer transactions; more writes outside a transaction |'
expect out/accepted.md '| 1 → 5 | 1 → 5 | 0 → 0 | 0 → 1 | more repeated statements |'
expect out/accepted.md 'Accepted: 4 more statements on GET /api/projects: counts per project on purpose'
echo "sql capture test passed"

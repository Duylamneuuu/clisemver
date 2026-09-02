# AGENTS.md

This repository is intentionally friendly to cloud coding agents.

## Development contract

- Use Node.js 20 or newer.
- Keep the runtime dependency-free unless a dependency clearly reduces risk.
- Run `npm run check` before committing.
- Add a fixture and a regression test for every parser behavior change.
- Never execute target commands through a shell. Pass executable and arguments
  separately to `spawn`/`spawnSync`.
- Snapshot output must be deterministic: do not add timestamps, absolute paths,
  host names, or platform-specific separators to the schema.
- Treat changes to the snapshot schema and public JavaScript exports as API
  changes and document them in `CHANGELOG.md`.

## Repository map

- `src/`: reusable library and CLI implementation.
- `bin/`: npm executable entry point.
- `action/`: dependency-free GitHub Action entry point.
- `fixtures/`: fake CLIs used for black-box integration tests.
- `docs/`: snapshot schema and compatibility rules.

## Review priorities

1. No shell injection or accidental network access.
2. Stable snapshots across machines.
3. Conservative breaking-change classification.
4. Clear diagnostics for unsupported help formats.

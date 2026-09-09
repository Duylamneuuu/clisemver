# Changelog

All notable changes to this project will be documented in this file. The format
is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Windows npm `.cmd` / `.bat` shims are rewritten to `node` plus the JavaScript
  entry and spawned with `shell: false`. Batch files are parsed, never executed.
  Unsupported or malicious shim text is rejected with an error that asks for
  `["node", "./path/to/cli.js"]`.

## [0.4.0] - 2026-09-05

### Added

- Wrapped help descriptions now join across indented continuation lines.
- Unknown section headings stop parser entries from leaking into the previous section.
- Regression coverage for wrapped option and command descriptions.

## [0.3.0] - 2026-09-03

### Added

- Optional `clisemver.config.json` for repeatable CLI and CI commands.
- Exact and namespace wildcard ignore rules for compatibility changes.
- `applyIgnoreRules` and configurable `diffSnapshots` options in the JavaScript API.

## [0.2.0] - 2026-09-03

### Added

- A dependency-free JSON Schema for snapshot schema version 1.
- The `clisemver/schema` package export for editor and CI integrations.

## [0.1.0] - 2026-09-02

### Added

- Initial zero-dependency CLI snapshot and compatibility diff engine.
- Text, Markdown, and JSON reports.
- Reusable GitHub Action.
- Cross-platform fixture and integration test suite.

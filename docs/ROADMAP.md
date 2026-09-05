# Roadmap

The roadmap is ordered around real adoption rather than feature count.

## v0.1 — Black-box compatibility core

- Deterministic recursive snapshots.
- Generic Commander, yargs, Cobra, Click, Typer, and Clap-style parsing.
- Major, minor, and patch classifications.
- Text, Markdown, and JSON reports.
- GitHub Action and public JavaScript API.

## Next

- Fixture coverage from real-world help layouts.
- Config file for ignore rules and custom help/version arguments (**delivered in v0.3.0**).
- Wrapped option and command descriptions (**delivered in v0.4.0**).
- Framework adapters that consume native command metadata when available.
- Snapshot migration command.
- Stable machine-readable JSON Schema (**delivered in v0.2.0**).
- Test probes for exit codes and opt-in structured output contracts.
- Windows command shim discovery.

## Good contribution boundaries

Each help framework or unusual layout should arrive as an isolated fixture and parser
test. Adapters should be separate modules with a small contract so contributors can
work independently without changing the diff engine.

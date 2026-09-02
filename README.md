# clisemver

**SemVer checks for command-line interfaces.**

[![CI](https://github.com/Duylamneuuu/clisemver/actions/workflows/ci.yml/badge.svg)](https://github.com/Duylamneuuu/clisemver/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)

APIs have OpenAPI diff tools. Libraries have ABI checkers. Command-line tools also
have a public interface, but breaking a flag or changing a default is still easy to
ship accidentally. `clisemver` snapshots that interface and checks every change in CI.

- Zero runtime dependencies.
- Works from `--help` output, so it is language and framework independent.
- Recursively inspects subcommands.
- Produces text, Markdown, or JSON reports.
- Runs target commands without a shell.
- Available as both a CLI library and a dependency-free GitHub Action.

> **Project status:** v0.1 is an early release. The snapshot schema is versioned,
> but help parsers will continue to improve as real-world fixtures are contributed.

## Quick start

From a repository checkout, create and commit the baseline:

```bash
node ./bin/clisemver.js snapshot --output .clisemver/snapshot.json -- node ./path/to/your-cli.js
```

After changing the target CLI, check it:

```bash
node ./bin/clisemver.js check --against .clisemver/snapshot.json -- node ./path/to/your-cli.js
```

A breaking change exits with status `1`:

```text
Required bump: MAJOR
Changes: 2 majors, 1 minor, 0 patches

[MAJOR] option.removed — demo --output
  Option --output was removed
```

Publishing to npm is planned but not configured yet. Until then, use a checkout or
the GitHub Action below.

## GitHub Action

First commit a baseline snapshot, then add a workflow after the build step:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 20
  - run: npm ci
  - run: npm run build
  - uses: Duylamneuuu/clisemver@v0.1.0
    with:
      command: '["node","./dist/cli.js"]'
      snapshot: .clisemver/snapshot.json
      fail-on: major
```

`command` is a JSON array, not a shell string. This keeps argument boundaries
explicit and avoids shell interpolation. The Action adds annotations for major
changes, writes a Markdown job summary, and exposes change counts as outputs.
See [the Action guide](docs/GITHUB_ACTION.md). For the strongest supply-chain
pinning, replace the release tag with its full commit SHA in production.

## Commands

### `snapshot`

```bash
clisemver snapshot [options] -- <command> [args...]
```

Captures options, option aliases, value requirements, defaults, choices,
positionals, subcommands, descriptions, and the target version.

### `check`

```bash
clisemver check --against baseline.json [options] -- <command> [args...]
```

Captures the current interface, compares it with the baseline, and applies the
configured failure threshold.

### `diff`

```bash
clisemver diff before.json after.json --format markdown --fail-on minor
```

Compares snapshots without executing either CLI.

### `validate`

```bash
clisemver validate .clisemver/snapshot.json
```

Validates a snapshot against schema version 1. Run `clisemver --help` for every
option and exit code.

## Compatibility rules

| Change | Classification |
| --- | --- |
| Remove a command, option, or accepted alias | Major |
| Add a required option or positional | Major |
| Make an option value or positional required | Major |
| Change a default or remove an accepted choice | Major |
| Add an optional command, option, positional, alias, or choice | Minor |
| Relax a requirement | Minor |
| Change a description or placeholder label | Patch |
| No observable public change | None |

The policy is intentionally conservative. Read the complete
[compatibility rules](docs/COMPATIBILITY_RULES.md).

## Supported help styles

The generic parser recognizes common English headings used by Commander, yargs,
Cobra, Click, Typer, Clap, and similar tools:

- `Options`, `Flags`, and `Global Flags`
- `Commands` and `Available Commands`
- `Arguments` and `Positionals`
- `<required>`, `[optional]`, and variadic values
- `[default: value]`, `(default value)`, `[required]`, and `[choices: ...]`

Custom or localized help formats may need parser improvements. A capture warning is
stored in the snapshot when a subcommand cannot be inspected.

## Security model

`clisemver` executes the target CLI because that is how it reads `--help`. Only
inspect code you trust.

The runner never enables a shell, performs no network requests itself, disables color,
enforces a timeout, and limits captured output to one megabyte by default. It does
not sandbox or block network access for the target process. The GitHub Action
accepts the command as JSON so untrusted text is not interpolated into a shell.

## Library API

```js
import { readFile } from "node:fs/promises";
import { captureSnapshot, diffSnapshots } from "clisemver";

const before = JSON.parse(await readFile("baseline.json", "utf8"));
const after = await captureSnapshot(["node", "./dist/cli.js"]);
const report = diffSnapshots(before, after);
console.log(report.requiredBump);
```

TypeScript declarations ship with the package. See
[the snapshot format](docs/SNAPSHOT_FORMAT.md) for the stable data model.

## Contributing

Real CLI fixtures are especially valuable. See [CONTRIBUTING.md](CONTRIBUTING.md)
and the [roadmap](docs/ROADMAP.md). The project is intentionally structured so a
cloud coding agent can clone it and run the complete verification loop with one
command:

```bash
npm run check
```

Maintainers can also complete the [release process](docs/RELEASING.md) entirely in
GitHub without a local checkout.

## License

MIT

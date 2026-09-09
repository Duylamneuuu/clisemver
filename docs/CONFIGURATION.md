# Configuration

The CLI optionally reads `clisemver.config.json` from the working directory. The
file is ordinary JSON, never executable JavaScript, and is ignored when it does not
exist. Explicit command-line flags and a target command after `--` take precedence.

## Example

```json
{
  "command": ["node", "./dist/cli.js"],
  "snapshot": ".clisemver/snapshot.json",
  "cwd": ".",
  "helpFlag": "--help",
  "versionFlag": "--version",
  "maxDepth": 4,
  "timeout": 10000,
  "format": "text",
  "failOn": "major",
  "ignore": ["command.description-changed"]
}
```

Then the normal commands need no repeated target or file arguments:

```bash
clisemver snapshot
clisemver check
```

`snapshot` is used as the output path by `snapshot` and as the baseline path by
`check`. `command` is the executable-and-argument array passed to the target without
a shell. This preserves argument boundaries and keeps configuration data inert.

## Windows command resolution

On Windows only, if the first array entry is an npm `.cmd` or `.bat` shim (or a
bare name that resolves to one), clisemver rewrites it before `spawn`:

1. Leave already-safe targets unchanged: `node`, `process.execPath`, `.exe`,
   `.com`, `.js`, `.mjs`, and `.cjs`.
2. Locate a bare name or `.cmd` / `.bat` using the explicit path, the working
   directory, `node_modules/.bin`, then `PATH`. Lookup does not start a shell.
3. Read the shim and accept only npm-style node launches. The quoted JavaScript
   path before `%*` is resolved relative to the shim directory. A `node.exe` next
   to the shim is used when that file exists; otherwise `process.execPath`.
4. Spawn `[node, script, ...originalArgs]` with `shell: false`. The snapshot still
   records the original command array.

Shim text is rejected when it is not an npm node shim, names more than one
script, points at a missing file, uses unexpected `%VAR%` expansions, or contains
shell operators (`&`, `|`, `>`, `<`, `^`) outside the npm cmd-shim boilerplate.
There is no fallback to `shell: true` or `cmd.exe /c`. Pass an explicit
JavaScript entry instead:

```json
{
  "command": ["node", "./path/to/cli.js"]
}
```

Non-Windows platforms never rewrite the command.

## Fields

| Field | Meaning |
| --- | --- |
| `command` | Non-empty executable and argument array. |
| `snapshot` | Snapshot path for `snapshot` output and `check` baseline. |
| `cwd` | Target working directory, relative to the config directory. |
| `helpFlag` | Help argument passed to the target. |
| `versionFlag` | Version argument passed to the target. |
| `noVersion` | Skip target version detection when `true`. |
| `maxDepth` | Subcommand depth from `0` to `20`. |
| `timeout` | Per-invocation timeout in milliseconds. |
| `format` | `text`, `markdown`, or `json`. |
| `failOn` | `none`, `patch`, `minor`, or `major`. |
| `ignore` | Exact change codes or namespace rules ending in `.*`. |

For example, `option.*` ignores all option-related changes while
`command.description-changed` ignores only that code. Ignored changes are removed
before the report summary and failure threshold are calculated.

## Precedence

The following command uses the configured target but overrides the configured report
format:

```bash
clisemver check --format text
```

This command uses a one-off target and therefore overrides `command` in the file:

```bash
clisemver check --against baseline.json -- node ./dist/cli.js
```

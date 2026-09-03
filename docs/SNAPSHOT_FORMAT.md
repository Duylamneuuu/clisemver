# Snapshot format

A clisemver snapshot is deterministic JSON. It records the interface a CLI exposes
through its help and version commands, not the implementation language.

## Top-level fields

```json
{
  "schemaVersion": 1,
  "command": ["node", "./dist/cli.js"],
  "version": "demo 1.2.0",
  "warnings": [],
  "root": {}
}
```

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Version of this data format. Currently `1`. |
| `command` | Stable executable and argument array used for capture. |
| `version` | First line returned by the version probe, or `null`. |
| `warnings` | Deterministically sorted partial-capture warnings. |
| `root` | Root command and recursive subcommand tree. |

## Command node

Each command contains:

- `name`: command name.
- `path`: subcommand tokens below the root.
- `usage`: normalized usage text.
- `description`: normalized summary.
- `options`: sorted public options.
- `positionals`: ordered positional arguments.
- `subcommands`: name-sorted child command nodes.

## Option node

An option records its preferred `key`, every accepted name or alias, optional value
argument, whether the option itself is required, negation support, description, and
any detected default or choices.

A value argument has a display `name`, a `required` boolean, and a `variadic`
boolean. Value requirements are separate from whether the option itself is required.

## Determinism

Snapshots intentionally omit timestamps, operating system metadata, host names, and
clisemver's installation path. Absolute command arguments below the working
directory become portable `./` paths. ANSI color and line-ending differences are
removed.

The target's own help can still contain dynamic values. Projects should keep public
help deterministic or normalize those values before invoking clisemver.

## Schema evolution

Readers reject unknown schema versions instead of silently misclassifying changes.
A future format revision will use a new `schemaVersion` and include a documented
migration path.

## Machine-readable JSON Schema

The canonical JSON Schema for snapshot v1 is available at
[`schema/clisemver.snapshot.schema.json`](../schema/clisemver.snapshot.schema.json) and
is exposed as `clisemver/schema` in package releases. It is intended for editors,
CI validators, and integrations that need to inspect snapshots without executing
JavaScript.

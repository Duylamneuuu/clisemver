# GitHub Action

The repository includes a zero-dependency JavaScript Action. It captures the current
CLI, compares it with a committed baseline, writes a job summary, creates annotations
for major changes, and fails at the chosen threshold.

## Inputs

| Input | Required | Default |
| --- | --- | --- |
| `command` | Yes | — |
| `snapshot` | No | `.clisemver/snapshot.json` |
| `fail-on` | No | `major` |
| `max-depth` | No | `4` |
| `timeout` | No | `10000` |

`command` must be a JSON string array. It is parsed and executed directly without a
shell:

```yaml
command: '["python","-m","my_package"]'
```

## Outputs

| Output | Value |
| --- | --- |
| `required-bump` | `none`, `patch`, `minor`, or `major` |
| `major` | Number of major changes |
| `minor` | Number of minor changes |
| `patch` | Number of patch changes |

## Complete job

```yaml
name: CLI compatibility

on:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - id: clisemver
        uses: Duylamneuuu/clisemver@v0.1.0
        with:
          command: '["node","./dist/cli.js"]'
          fail-on: major
      - run: echo "Required bump is ${{ steps.clisemver.outputs.required-bump }}"
```

For the strongest supply-chain pinning, replace the release tag with its full
commit SHA in production. The Action does not download packages or send captured
help output to an external service.

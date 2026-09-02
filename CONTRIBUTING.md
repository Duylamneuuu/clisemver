# Contributing

Thanks for helping make CLI upgrades safer.

## Development

Requirements:

- Node.js 20 or newer
- Git

There are no runtime or development dependencies to install. Run:

```bash
npm run check
```

This validates source syntax, runs the test suite, and confirms that clisemver does
not break its own committed CLI snapshot.

## Parser changes

Every parser change must include:

1. A minimal, synthetic help example or executable fixture.
2. A regression test describing the expected normalized interface.
3. No machine-specific paths or timestamps in snapshot output.

Please avoid copying long help output from another project. Reduce it to the smallest
original fixture that demonstrates the shape being supported.

## Compatibility rule changes

Treat classification changes as public policy changes. Add tests for both directions
of the transition and update `docs/COMPATIBILITY_RULES.md` plus `CHANGELOG.md`.

## Pull requests

Keep pull requests focused. Explain the user-visible behavior, add tests, and run
`npm run check`. New contributors are welcome to start with issues labeled
`good first issue` or `help wanted`.

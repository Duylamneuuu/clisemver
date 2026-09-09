#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("shim-cli 1.0.0\n");
  process.exit(0);
}

if (args.at(-1) === "--help") {
  process.stdout.write(`Shim CLI used to test Windows npm .cmd resolution.

Usage: shim-cli [options]

Options:
  -h, --help     Display help
  -v, --version  Show version
`);
  process.exit(0);
}

process.stdout.write(`shim-cli args:${JSON.stringify(args)}\n`);

#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("partial 1.0.0\n");
  process.exit(0);
}

if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(`Usage: partial [command]

Commands:
  broken  A command whose help is unavailable
`);
  process.exit(0);
}

process.stderr.write("The broken command cannot render help.\n");
process.exit(2);

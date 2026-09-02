#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("demo 1.0.0\n");
  process.exit(0);
}

const help = args.at(-1) === "--help";
const command = help ? args.slice(0, -1) : args;

const pages = new Map([
  [
    "",
    `Demo builds small applications.

Usage: demo [options] [command]

Options:
  -v, --verbose               Print detailed output
  -o, --output <file>         Output directory
  --color <when>              Color mode [choices: auto, always, never] [default: auto]
  -h, --help                  Display help

Commands:
  build <entry>               Build an application
  config                      Read or write configuration
  help [command]              Display help for a command
`,
  ],
  [
    "build",
    `Build an application.

Usage: demo build [options] <entry> [extra...]

Options:
  --minify                    Minify the generated files
  --target <name>             JavaScript target [default: es2022]
  -h, --help                  Display help
`,
  ],
  [
    "config",
    `Manage persistent configuration.

Usage: demo config [command]

Commands:
  get <key>                   Read a value
  set <key> <value>           Write a value
`,
  ],
  [
    "config get",
    `Read a configuration value.

Usage: demo config get <key>
`,
  ],
  [
    "config set",
    `Write a configuration value.

Usage: demo config set <key> <value>
`,
  ],
]);

if (help && pages.has(command.join(" "))) {
  process.stdout.write(pages.get(command.join(" ")));
  process.exit(0);
}

process.stderr.write("Use --help to inspect this fixture.\n");
process.exit(2);

#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("demo 2.0.0\n");
  process.exit(0);
}

const help = args.at(-1) === "--help";
const command = help ? args.slice(0, -1) : args;

const pages = new Map([
  [
    "",
    `Demo builds and deploys applications.

Usage: demo [options] [command]

Options:
  --verbose                   Print detailed output
  --color <when>              Color mode [choices: auto, always] [default: always]
  --debug                     Print debugging output
  --token <value>             Deployment token [required]
  -h, --help                  Display help

Commands:
  build [entry]               Build an application
  deploy <directory>          Deploy an application
  help [command]              Display help for a command
`,
  ],
  [
    "build",
    `Build an application.

Usage: demo build [options] [entry] [extra...]

Options:
  --minify                    Minify the generated files
  --target <name>             JavaScript target [default: esnext]
  -h, --help                  Display help
`,
  ],
  [
    "deploy",
    `Deploy an application.

Usage: demo deploy [options] <directory>

Options:
  --dry-run                   Validate without uploading
`,
  ],
]);

if (help && pages.has(command.join(" "))) {
  process.stdout.write(pages.get(command.join(" ")));
  process.exit(0);
}

process.stderr.write("Use --help to inspect this fixture.\n");
process.exit(2);

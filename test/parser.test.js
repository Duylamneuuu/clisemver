import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeHelp,
  parseCommandLine,
  parseHelpText,
  parseOptionLine,
} from "../src/parser.js";

test("normalizes ANSI sequences and line endings", () => {
  assert.equal(normalizeHelp("\u001b[31mUsage:\u001b[0m tool\r\n"), "Usage: tool");
});

test("parses Commander-style options and commands", () => {
  const parsed = parseHelpText(`A useful tool.

Usage: demo [options] [command]

Options:
  -p, --port <number>  Server port [default: 3000]
  --[no-]color         Toggle colors
  --mode <kind>        Build mode [choices: dev, prod]

Commands:
  serve|s [file]       Start the server
  inspect              Inspect a project
`);

  assert.equal(parsed.command.name, "demo");
  assert.equal(parsed.command.description, "A useful tool.");
  assert.deepEqual(parsed.command.options[0].names, ["--color", "--no-color"]);
  assert.equal(parsed.command.options[1].key, "--mode");
  assert.deepEqual(parsed.command.options[1].choices, ["dev", "prod"]);
  assert.equal(parsed.command.options[2].default, "3000");
  assert.deepEqual(parsed.discoveredCommands[0], {
    name: "serve",
    aliases: ["s"],
    summary: "Start the server",
  });
});

test("parses Cobra-style flags", () => {
  const parsed = parseHelpText(`Manage widgets

Usage:
  widget [command]

Available Commands:
  add         Add a widget
  list        List widgets

Flags:
  -h, --help          help for widget
  -p, --port int      listen port (default 8080)

Global Flags:
      --config string   config file
`);

  assert.equal(parsed.command.name, "widget");
  assert.deepEqual(
    parsed.discoveredCommands.map((command) => command.name),
    ["add", "list"],
  );
  const port = parsed.command.options.find((option) => option.key === "--port");
  assert.deepEqual(port.argument, { name: "int", required: true, variadic: false });
  assert.equal(port.default, "8080");
  assert.ok(parsed.command.options.some((option) => option.key === "--config"));
});

test("parses Click-style required arguments", () => {
  const option = parseOptionLine("  --count INTEGER  Number of runs [required]");
  assert.equal(option.key, "--count");
  assert.equal(option.required, true);
  assert.deepEqual(option.argument, {
    name: "INTEGER",
    required: true,
    variadic: false,
  });
});

test("parses command aliases and rejects option lines", () => {
  assert.deepEqual(parseCommandLine("  run|r <file>  Run a file"), {
    name: "run",
    aliases: ["r"],
    summary: "Run a file",
  });
  assert.equal(parseCommandLine("  --help  Show help"), null);
});

test("does not confuse option values with positional arguments", () => {
  const parsed = parseHelpText(`Usage: demo --config <file> <input> [output]`, {
    name: "demo",
  });
  assert.deepEqual(parsed.command.positionals, [
    { name: "input", required: true, variadic: false },
    { name: "output", required: false, variadic: false },
  ]);
});

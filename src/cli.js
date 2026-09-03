import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { captureSnapshot } from "./capture.js";
import { readConfig } from "./config.js";
import { CHANGE_LEVELS, diffSnapshots, meetsThreshold } from "./diff.js";
import { formatResult } from "./format.js";
import { readSnapshot, writeJsonFile } from "./io.js";
import { validateSnapshot } from "./schema.js";
import { VERSION } from "./version.js";

const HELP = `clisemver ${VERSION}

Detect breaking changes in command-line interfaces.

Usage:
  clisemver <command> [options]

Commands:
  snapshot   Capture a deterministic CLI interface snapshot.
  check      Capture a CLI and compare it with a saved snapshot.
  diff       Compare two existing snapshots.
  validate   Validate the snapshot schema.

Global options:
  -h, --help                Show help.
  -v, --version             Show clisemver version.

Exit codes:
  0  Successful and failure threshold was not reached.
  1  Compatibility changes reached the requested threshold.
  2  Invalid input, target execution failure, or snapshot error.
`;

const COMMAND_HELP = {
  snapshot: `Usage: clisemver snapshot [options] -- <command> [args...]

Capture a deterministic snapshot of a CLI's public interface.

Options:
  -o, --output <file>       Write the snapshot to a file
  --max-depth <number>      Maximum subcommand depth [default: 4]
  --timeout <milliseconds>  Timeout for each invocation [default: 10000]
  --cwd <directory>         Working directory for the target command
  --help-flag <value>       Target help flag [default: --help]
  --version-flag <value>    Target version flag [default: --version]
  --no-version              Skip target version detection
  -h, --help                Show help
`,
  check: `Usage: clisemver check --against <file> [options] -- <command> [args...]

Capture a CLI and compare it with a saved snapshot.

Options:
  --against <file>          Baseline snapshot [required]
  --format <type>           text, markdown, or json [default: text]
  --fail-on <level>         major, minor, patch, or none [default: major]
  --max-depth <number>      Maximum subcommand depth [default: 4]
  --timeout <milliseconds>  Timeout for each invocation [default: 10000]
  --cwd <directory>         Working directory for the target command
  --help-flag <value>       Target help flag [default: --help]
  --version-flag <value>    Target version flag [default: --version]
  --no-version              Skip target version detection
  -h, --help                Show help
`,
  diff: `Usage: clisemver diff <before.json> <after.json> [options]

Compare two existing CLI snapshots.

Options:
  --format <type>    text, markdown, or json [default: text]
  --fail-on <level>  major, minor, patch, or none [default: major]
  -h, --help         Show help
`,
  validate: `Usage: clisemver validate <snapshot.json>

Validate a snapshot against the clisemver v1 schema.

Options:
  -h, --help  Show help
`,
};

const FLAG_SPECS = {
  "--against": { key: "against", value: true },
  "--cwd": { key: "cwd", value: true },
  "--fail-on": { key: "failOn", value: true },
  "--format": { key: "format", value: true },
  "--help-flag": { key: "helpFlag", value: true },
  "--max-depth": { key: "maxDepth", value: true },
  "--no-version": { key: "noVersion", value: false },
  "--output": { key: "output", value: true },
  "--timeout": { key: "timeoutMs", value: true },
  "--version-flag": { key: "versionFlag", value: true },
  "-o": { key: "output", value: true },
};

function parseInteger(value, name, { min, max } = {}) {
  const parsed = Number(value);
  const outsideRange =
    !Number.isInteger(parsed) ||
    (min !== undefined && parsed < min) ||
    (max !== undefined && parsed > max);
  if (outsideRange) {
    const range = min !== undefined && max !== undefined ? ` between ${min} and ${max}` : "";
    throw new Error(`${name} must be an integer${range}`);
  }
  return parsed;
}

function parseFlags(args) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (!raw.startsWith("-")) {
      positionals.push(raw);
      continue;
    }

    const equalsIndex = raw.indexOf("=");
    const flag = equalsIndex === -1 ? raw : raw.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : raw.slice(equalsIndex + 1);
    const spec = FLAG_SPECS[flag];
    if (!spec) throw new Error(`Unknown option: ${flag}`);
    if (!spec.value) {
      if (inlineValue !== undefined) throw new Error(`${flag} does not accept a value`);
      options[spec.key] = true;
      continue;
    }
    const value = inlineValue ?? args[++index];
    const flagValueCanStartWithDash = flag === "--help-flag" || flag === "--version-flag";
    if (value === undefined || (value.startsWith("-") && !flagValueCanStartWithDash)) {
      throw new Error(`${flag} requires a value`);
    }
    options[spec.key] = value;
  }
  return { options, positionals };
}

function splitTarget(args) {
  const separator = args.indexOf("--");
  if (separator === -1) return { ownArgs: args, target: [] };
  return { ownArgs: args.slice(0, separator), target: args.slice(separator + 1) };
}

function mergeConfigOptions(explicit, config) {
  const configured = {
    ...config,
    ...(config.snapshot === undefined
      ? {}
      : { output: config.snapshot, against: config.snapshot }),
    ...(config.timeout === undefined ? {} : { timeoutMs: config.timeout }),
  };
  return { ...configured, ...explicit };
}

function captureOptions(options, baseCwd) {
  return {
    cwd: path.resolve(baseCwd, options.cwd ?? "."),
    maxDepth:
      options.maxDepth === undefined
        ? 4
        : parseInteger(options.maxDepth, "--max-depth", { min: 0, max: 20 }),
    timeoutMs:
      options.timeoutMs === undefined
        ? 10_000
        : parseInteger(options.timeoutMs, "--timeout", { min: 1, max: 3_600_000 }),
    helpArgs: [options.helpFlag ?? "--help"],
    versionArgs: options.noVersion ? null : [options.versionFlag ?? "--version"],
  };
}

function diffOptions(options) {
  const format = options.format ?? "text";
  const failOn = options.failOn ?? "major";
  if (!["text", "markdown", "json"].includes(format)) {
    throw new Error("--format must be text, markdown, or json");
  }
  if (!CHANGE_LEVELS.includes(failOn)) {
    throw new Error("--fail-on must be major, minor, patch, or none");
  }
  return { format, failOn };
}

function ensureTarget(target) {
  if (target.length === 0) {
    throw new Error(
      "Missing target command. Put it after --, for example: -- node ./bin/tool.js",
    );
  }
}

async function snapshotCommand(args, io) {
  const { ownArgs, target } = splitTarget(args);
  const { options, positionals } = parseFlags(ownArgs);
  if (positionals.length > 0) throw new Error(`Unexpected argument: ${positionals[0]}`);
  const config = await readConfig(io.cwd);
  const resolvedOptions = mergeConfigOptions(options, config);
  const resolvedTarget = target.length > 0 ? target : config.command ?? [];
  ensureTarget(resolvedTarget);
  const snapshot = await captureSnapshot(
    resolvedTarget,
    captureOptions(resolvedOptions, io.cwd),
  );
  if (resolvedOptions.output) {
    const written = await writeJsonFile(resolvedOptions.output, snapshot, io.cwd);
    io.stderr.write(`Wrote ${path.relative(io.cwd, written) || path.basename(written)}\n`);
  } else {
    io.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  }
  for (const warning of snapshot.warnings) io.stderr.write(`Warning: ${warning}\n`);
  return 0;
}

async function checkCommand(args, io) {
  const { ownArgs, target } = splitTarget(args);
  const { options, positionals } = parseFlags(ownArgs);
  if (positionals.length > 0) throw new Error(`Unexpected argument: ${positionals[0]}`);
  const config = await readConfig(io.cwd);
  const resolvedOptions = mergeConfigOptions(options, config);
  const resolvedTarget = target.length > 0 ? target : config.command ?? [];
  ensureTarget(resolvedTarget);
  if (!resolvedOptions.against) throw new Error("check requires --against <snapshot.json>");
  const baseline = await readSnapshot(resolvedOptions.against, io.cwd);
  const current = await captureSnapshot(
    resolvedTarget,
    captureOptions(resolvedOptions, io.cwd),
  );
  const result = diffSnapshots(baseline, current, { ignore: resolvedOptions.ignore });
  const { format, failOn } = diffOptions(resolvedOptions);
  io.stdout.write(`${formatResult(result, format)}\n`);
  for (const warning of current.warnings) io.stderr.write(`Warning: ${warning}\n`);
  return meetsThreshold(result, failOn) ? 1 : 0;
}

async function diffCommand(args, io) {
  const { ownArgs, target } = splitTarget(args);
  if (target.length > 0) throw new Error("diff does not accept a target command");
  const { options, positionals } = parseFlags(ownArgs);
  if (positionals.length !== 2) {
    throw new Error("diff requires <before.json> and <after.json>");
  }
  const config = await readConfig(io.cwd);
  const resolvedOptions = mergeConfigOptions(options, config);
  const [before, after] = await Promise.all([
    readSnapshot(positionals[0], io.cwd),
    readSnapshot(positionals[1], io.cwd),
  ]);
  const result = diffSnapshots(before, after, { ignore: resolvedOptions.ignore });
  const { format, failOn } = diffOptions(resolvedOptions);
  io.stdout.write(`${formatResult(result, format)}\n`);
  return meetsThreshold(result, failOn) ? 1 : 0;
}

async function validateCommand(args, io) {
  if (args.length !== 1) throw new Error("validate requires exactly one snapshot file");
  const absolutePath = path.resolve(io.cwd, args[0]);
  let value;
  try {
    value = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (cause) {
    throw new Error(`Could not read ${args[0]}: ${cause.message}`);
  }
  const errors = validateSnapshot(value);
  if (errors.length > 0) {
    throw new Error(`Invalid snapshot:\n- ${errors.join("\n- ")}`);
  }
  io.stdout.write(`${args[0]} is a valid clisemver v1 snapshot.\n`);
  return 0;
}

export async function runCli(argv, inputIo = {}) {
  const io = {
    cwd: inputIo.cwd ?? process.cwd(),
    stdout: inputIo.stdout ?? process.stdout,
    stderr: inputIo.stderr ?? process.stderr,
  };

  if (
    argv.length === 0 ||
    argv[0] === "--help" ||
    argv[0] === "-h" ||
    argv[0] === "help"
  ) {
    io.stdout.write(HELP);
    return 0;
  }
  if (argv[0] === "--version" || argv[0] === "-v") {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command, ...args] = argv;
  if (
    COMMAND_HELP[command] &&
    (args[0] === "--help" || args[0] === "-h" || args[0] === "help")
  ) {
    io.stdout.write(COMMAND_HELP[command]);
    return 0;
  }
  try {
    if (command === "snapshot") return await snapshotCommand(args, io);
    if (command === "check") return await checkCommand(args, io);
    if (command === "diff") return await diffCommand(args, io);
    if (command === "validate") return await validateCommand(args, io);
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    io.stderr.write(`clisemver: ${error.message}\n`);
    return 2;
  }
}

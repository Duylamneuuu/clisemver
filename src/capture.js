import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { parseHelpText } from "./parser.js";
import { SNAPSHOT_SCHEMA_VERSION, assertValidSnapshot } from "./schema.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

function createCaptureError(message, details = {}) {
  const error = new Error(message);
  error.code = "CAPTURE_FAILED";
  Object.assign(error, details);
  return error;
}

function stableCommand(command, cwd) {
  return command.map((part, index) => {
    if (index === 0 && part === process.execPath) return "node";
    if (!path.isAbsolute(part)) return part.replaceAll("\\", "/");
    const relative = path.relative(cwd, part);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return `./${relative.replaceAll("\\", "/")}`;
    }
    return part.replaceAll("\\", "/");
  });
}

function displayCommand(command) {
  return command
    .map((part) => (/^[\w./:@=-]+$/u.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

export function runTarget(command, options = {}) {
  const {
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    env = {},
  } = options;

  if (!Array.isArray(command) || command.length === 0) {
    return Promise.reject(createCaptureError("Target command must not be empty"));
  }

  return new Promise((resolve, reject) => {
    const [executable, ...args] = command;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let exceededOutputLimit = false;

    const child = spawn(executable, args, {
      cwd,
      env: {
        ...process.env,
        CI: "1",
        CLICOLOR: "0",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        TERM: "dumb",
        ...env,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stop = (reason) => {
      if (reason === "timeout") timedOut = true;
      if (reason === "output") exceededOutputLimit = true;
      child.kill("SIGKILL");
    };

    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    timer.unref?.();

    const collect = (stream, chunk) => {
      const value = chunk.toString("utf8");
      if (stream === "stdout") stdout += value;
      else stderr += value;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutputBytes) {
        stop("output");
      }
    };

    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.on("error", (cause) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(
        createCaptureError(`Could not start ${displayCommand(command)}: ${cause.message}`, {
          cause,
          command,
        }),
      );
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (timedOut) {
        reject(
          createCaptureError(
            `Timed out after ${timeoutMs}ms while running ${displayCommand(command)}`,
            { command, timeoutMs, stdout, stderr },
          ),
        );
        return;
      }
      if (exceededOutputLimit) {
        reject(
          createCaptureError(
            `Output exceeded ${maxOutputBytes} bytes for ${displayCommand(command)}`,
            { command, maxOutputBytes },
          ),
        );
        return;
      }
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
}

function helpOutput(result) {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr;
}

function inferRootName(command) {
  const candidate = command[0] === process.execPath && command[1] ? command[1] : command[0];
  const extension = path.extname(candidate);
  return path.basename(candidate, extension) || "cli";
}

function compactError(error) {
  return String(error?.message ?? error).replace(/\s+/g, " ").trim();
}

async function captureCommandNode(baseCommand, commandPath, context, options) {
  const invocation = [...baseCommand, ...commandPath, ...options.helpArgs];
  const result = await runTarget(invocation, options);
  const output = helpOutput(result);
  if (!output) {
    throw createCaptureError(
      `${displayCommand(invocation)} produced no help output (exit ${String(result.exitCode)})`,
      { command: invocation, exitCode: result.exitCode },
    );
  }

  const parsed = parseHelpText(output, {
    name: context.name,
    path: commandPath,
    summary: context.summary,
  });
  const node = parsed.command;
  const foundInterface =
    Boolean(node.usage) ||
    node.options.length > 0 ||
    node.positionals.length > 0 ||
    parsed.discoveredCommands.length > 0;
  if (!foundInterface && result.exitCode !== 0) {
    throw createCaptureError(
      `${displayCommand(invocation)} returned exit ${String(result.exitCode)} without recognizable help`,
      { command: invocation, exitCode: result.exitCode },
    );
  }
  if (commandPath.length >= options.maxDepth) {
    if (parsed.discoveredCommands.length > 0) {
      options.warnings.push(
        `Stopped at max depth ${options.maxDepth} below "${commandPath.join(" ")}"`,
      );
    }
    return node;
  }

  for (const discovered of parsed.discoveredCommands) {
    const childPath = [...commandPath, discovered.name];
    if (discovered.name === "help") {
      node.subcommands.push({
        name: discovered.name,
        path: childPath,
        usage: "",
        description: discovered.summary,
        options: [],
        positionals: [],
        subcommands: [],
      });
      continue;
    }

    try {
      const child = await captureCommandNode(
        baseCommand,
        childPath,
        discovered,
        options,
      );
      node.subcommands.push(child);
    } catch (error) {
      options.warnings.push(
        `Could not inspect "${childPath.join(" ")}": ${compactError(error)}`,
      );
      node.subcommands.push({
        name: discovered.name,
        path: childPath,
        usage: "",
        description: discovered.summary,
        options: [],
        positionals: [],
        subcommands: [],
      });
    }
  }

  node.subcommands.sort((left, right) => left.name.localeCompare(right.name));
  return node;
}

async function captureVersion(command, options) {
  if (!options.versionArgs) return null;
  try {
    const result = await runTarget([...command, ...options.versionArgs], options);
    const output = helpOutput(result).split("\n")[0]?.trim();
    return output && output.length <= 200 ? output : null;
  } catch {
    return null;
  }
}

export async function captureSnapshot(command, inputOptions = {}) {
  if (!Array.isArray(command) || command.length === 0) {
    throw createCaptureError("Target command must not be empty");
  }

  const cwd = path.resolve(inputOptions.cwd ?? process.cwd());
  const options = {
    cwd,
    timeoutMs: inputOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputBytes: inputOptions.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    maxDepth: inputOptions.maxDepth ?? DEFAULT_MAX_DEPTH,
    helpArgs: inputOptions.helpArgs ?? ["--help"],
    versionArgs: inputOptions.versionArgs === undefined ? ["--version"] : inputOptions.versionArgs,
    env: inputOptions.env ?? {},
    warnings: [],
  };

  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > 20) {
    throw createCaptureError("maxDepth must be an integer between 0 and 20");
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw createCaptureError("timeoutMs must be a positive integer");
  }
  if (!Number.isInteger(options.maxOutputBytes) || options.maxOutputBytes < 1) {
    throw createCaptureError("maxOutputBytes must be a positive integer");
  }
  if (!Array.isArray(options.helpArgs) || options.helpArgs.length === 0) {
    throw createCaptureError("helpArgs must be a non-empty string array");
  }
  if (options.helpArgs.some((argument) => typeof argument !== "string" || !argument)) {
    throw createCaptureError("helpArgs must contain only non-empty strings");
  }
  if (
    options.versionArgs !== null &&
    (!Array.isArray(options.versionArgs) ||
      options.versionArgs.some((argument) => typeof argument !== "string" || !argument))
  ) {
    throw createCaptureError("versionArgs must be null or a string array");
  }

  const [root, version] = await Promise.all([
    captureCommandNode(command, [], { name: inferRootName(command), summary: "" }, options),
    captureVersion(command, options),
  ]);

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    command: stableCommand(command, cwd),
    version,
    warnings: [...new Set(options.warnings)].sort(),
    root,
  };
  return assertValidSnapshot(snapshot);
}

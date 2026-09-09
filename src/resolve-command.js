import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const MAX_SHIM_BYTES = 32 * 1024;
const SAFE_EXTENSIONS = new Set([".exe", ".com", ".js", ".mjs", ".cjs"]);
const SHIM_EXTENSIONS = new Set([".cmd", ".bat"]);
const LOOKUP_EXTENSIONS = new Set([".com", ".exe", ".bat", ".cmd"]);
const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const DEFAULT_PATHEXT = [".COM", ".EXE", ".BAT", ".CMD"];
const ALLOWED_PERCENT_TOKENS = [
  "%PATHEXT:;.JS;=;%",
  "%PATHEXT%",
  "%COMSPEC%",
  "%_prog%",
  "%dp0%",
  "%~dp0",
  "%*",
];
const ALLOWED_OPERATOR_CHUNKS = [
  "endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% &",
  "set PATHEXT=%PATHEXT:;.JS;=;% &",
  "2>NUL",
];
const SCRIPT_LAUNCH =
  /(?:"%_prog%"|"%(?:~dp0|dp0%)[\\/]node\.exe"|(?<![A-Za-z])node)[ \t]+"%(?:~dp0|dp0%)[\\/]([^"]+)"[ \t]+%[*]/gi;

function createResolveError(target, reason) {
  const error = new Error(
    `Could not resolve Windows command ${JSON.stringify(target)} as an npm node shim (${reason}). Pass ["node", "./path/to/cli.js"] instead.`,
  );
  error.code = "WINDOWS_SHIM_UNRESOLVED";
  return error;
}

function fail(target, reason) {
  throw createResolveError(target, reason);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function escapeRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeShimText(content) {
  return String(content).replaceAll("\uFEFF", "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function stripAllowedPercentTokens(content) {
  let rest = content;
  for (const token of ALLOWED_PERCENT_TOKENS) {
    rest = rest.replaceAll(new RegExp(escapeRegex(token), "gi"), " ");
  }
  return rest;
}

function findUnexpectedPercent(content) {
  const rest = stripAllowedPercentTokens(content);
  const match = rest.match(/%[^%\s]*?%/u) ?? rest.match(/%~[A-Za-z0-9]+/u) ?? rest.match(/%/u);
  return match?.[0] ?? null;
}

function findDisallowedOperators(content) {
  let rest = content;
  for (const chunk of ALLOWED_OPERATOR_CHUNKS) {
    rest = rest.replaceAll(new RegExp(escapeRegex(chunk), "gi"), " ");
  }
  return rest.match(/[&|><^]/u)?.[0] ?? null;
}

function collectScriptRelatives(content) {
  const relatives = [];
  for (const match of content.matchAll(SCRIPT_LAUNCH)) {
    const relative = match[1]?.trim();
    if (relative) relatives.push(relative);
  }
  return [...new Set(relatives)];
}

function assertSafeRelativeScript(target, relative) {
  if (/[&|><^%*?\n\r\t"]/u.test(relative)) {
    fail(target, "rejected because the script path contains injection markers");
  }
  const extension = path.extname(relative).toLowerCase();
  if (!SCRIPT_EXTENSIONS.has(extension)) {
    fail(target, "rejected because the target is not a JavaScript entry");
  }
}

function resolveShimScriptPath(shimPath, relative) {
  const shimDir = path.dirname(path.resolve(shimPath));
  return path.resolve(shimDir, relative.replaceAll("\\", path.sep));
}

function localNodePath(shimPath) {
  const candidate = path.join(path.dirname(path.resolve(shimPath)), "node.exe");
  return isFile(candidate) ? candidate : null;
}

export function parseNpmCmdShim(content, shimPath, options = {}) {
  const target = shimPath || "cmd shim";
  if (typeof content !== "string") fail(target, "rejected because it is not an npm-style node shim");
  if (Buffer.byteLength(content) > MAX_SHIM_BYTES) {
    fail(target, "rejected because it is not an npm-style node shim");
  }

  const normalized = normalizeShimText(content);
  const unexpectedPercent = findUnexpectedPercent(normalized);
  if (unexpectedPercent) {
    fail(target, `rejected because of unexpected environment variable ${unexpectedPercent}`);
  }
  const operator = findDisallowedOperators(normalized);
  if (operator) {
    fail(target, `rejected because it contains shell metacharacter ${operator}`);
  }

  const relatives = collectScriptRelatives(normalized);
  if (relatives.length === 0) {
    fail(target, "rejected because it is not an npm-style node shim");
  }
  if (relatives.length > 1) {
    fail(target, "rejected because it names multiple candidate scripts");
  }

  const relative = relatives[0];
  assertSafeRelativeScript(target, relative);
  const scriptPath = resolveShimScriptPath(shimPath, relative);
  if (!isFile(scriptPath)) {
    fail(target, `script does not exist: ${scriptPath.replaceAll("\\", "/")}`);
  }

  return {
    nodePath: localNodePath(shimPath) ?? options.execPath ?? process.execPath,
    scriptPath,
  };
}

function pathextEntries(env) {
  const raw = String(env.PATHEXT || DEFAULT_PATHEXT.join(";"));
  const entries = raw
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry && LOOKUP_EXTENSIONS.has(entry.toLowerCase()));
  return entries.length > 0 ? entries : DEFAULT_PATHEXT;
}

function pathDirectories(env, platform) {
  const value = env.PATH ?? env.Path ?? "";
  const delimiter = platform === "win32" ? ";" : path.delimiter;
  return String(value)
    .split(delimiter)
    .map((entry) => entry.trim().replaceAll(/^"|"$/g, ""))
    .filter(Boolean);
}

function hasDirectoryComponent(executable) {
  return path.basename(executable) !== executable || path.isAbsolute(executable);
}

function isAlreadySafe(executable, execPath) {
  if (executable === execPath) return true;
  const base = path.basename(executable).toLowerCase();
  if (base === "node" || base === "node.exe") return true;
  return SAFE_EXTENSIONS.has(path.extname(executable).toLowerCase());
}

function isShimPath(filePath) {
  return SHIM_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function candidateFiles(executable, cwd, env, platform) {
  const extensions = pathextEntries(env);
  const namedExtension = path.extname(executable);
  const hasLookupExtension = LOOKUP_EXTENSIONS.has(namedExtension.toLowerCase());

  if (hasDirectoryComponent(executable)) {
    const resolved = path.resolve(cwd, executable);
    if (namedExtension) return [resolved];
    return extensions.map((extension) => `${resolved}${extension}`);
  }

  const names = hasLookupExtension
    ? [executable]
    : extensions.map((extension) => `${executable}${extension}`);
  const directories = [cwd, path.join(cwd, "node_modules", ".bin"), ...pathDirectories(env, platform)];
  const candidates = [];
  for (const directory of directories) {
    for (const name of names) {
      candidates.push(path.join(directory, name));
    }
  }
  return candidates;
}

function existingFile(filePath) {
  if (isFile(filePath)) return filePath;
  const extension = path.extname(filePath);
  if (!extension) return null;
  const folded = filePath.slice(0, -extension.length) + extension.toLowerCase();
  if (folded !== filePath && isFile(folded)) return folded;
  return null;
}

function locateWindowsTarget(executable, cwd, env, platform) {
  for (const candidate of candidateFiles(executable, cwd, env, platform)) {
    const located = existingFile(candidate);
    if (located) return located;
  }
  return null;
}

export function resolveTargetCommand(command, options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" || !Array.isArray(command) || command.length === 0) {
    return command;
  }

  const executable = command[0];
  if (typeof executable !== "string" || executable.length === 0) return command;

  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  if (isAlreadySafe(executable, execPath)) return command;

  const located = locateWindowsTarget(executable, cwd, env, platform);
  if (!located) return command;
  if (!isShimPath(located)) return [located, ...command.slice(1)];

  let content;
  try {
    content = fs.readFileSync(located, "utf8");
  } catch (cause) {
    const error = createResolveError(executable, `could not read ${located.replaceAll("\\", "/")}`);
    error.cause = cause;
    throw error;
  }
  const resolved = parseNpmCmdShim(content, located, { execPath });
  return [resolved.nodePath, resolved.scriptPath, ...command.slice(1)];
}

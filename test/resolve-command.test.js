import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { captureSnapshot, runTarget } from "../src/capture.js";
import { parseNpmCmdShim, resolveTargetCommand } from "../src/resolve-command.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureDir = path.join(projectRoot, "fixtures", "windows-shim");
const fixtureCli = path.join(fixtureDir, "cli.mjs");
const fixtureCmd = path.join(fixtureDir, "cli.cmd");
const missingCmd = path.join(fixtureDir, "missing.cmd");
const maliciousCmd = path.join(fixtureDir, "malicious.cmd");
const customBat = path.join(fixtureDir, "custom.bat");

function npmNodeShim(relativeScript, extras = "") {
  const windowsPath = relativeScript.replaceAll("/", "\\");
  return `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\\node.exe" (
  SET "_prog=%dp0%\\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${windowsPath}" %*
${extras}`;
}

function classicNpmShim(relativeScript) {
  const windowsPath = relativeScript.replaceAll("/", "\\");
  return `@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "%~dp0\\${windowsPath}" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\\${windowsPath}" %*
)
`;
}

test("leaves non-Windows commands unchanged", () => {
  const command = ["eslint.cmd", "--help"];
  assert.deepEqual(resolveTargetCommand(command, { platform: "linux" }), command);
  assert.deepEqual(resolveTargetCommand(command, { platform: "darwin" }), command);
});

test("leaves already-safe Windows targets unchanged", () => {
  const cwd = fixtureDir;
  const options = { platform: "win32", cwd };
  assert.deepEqual(resolveTargetCommand([process.execPath, fixtureCli], options), [
    process.execPath,
    fixtureCli,
  ]);
  assert.deepEqual(resolveTargetCommand(["node", fixtureCli], options), ["node", fixtureCli]);
  assert.deepEqual(resolveTargetCommand(["node.exe", fixtureCli], options), [
    "node.exe",
    fixtureCli,
  ]);
  assert.deepEqual(resolveTargetCommand([fixtureCli], options), [fixtureCli]);
  assert.deepEqual(resolveTargetCommand(["tool.exe", "--flag"], options), ["tool.exe", "--flag"]);
});

test("parses an npm-style .cmd shim into node plus the JavaScript entry", () => {
  const resolved = parseNpmCmdShim(npmNodeShim("cli.mjs"), fixtureCmd);
  assert.equal(resolved.nodePath, process.execPath);
  assert.equal(resolved.scriptPath, fixtureCli);
});

test("parses a classic npm .cmd shim that uses %~dp0", () => {
  const resolved = parseNpmCmdShim(classicNpmShim("cli.mjs"), fixtureCmd);
  assert.equal(resolved.nodePath, process.execPath);
  assert.equal(resolved.scriptPath, fixtureCli);
});

test("parses CRLF npm shims the same as LF shims", () => {
  const lf = npmNodeShim("cli.mjs");
  const crlf = lf.replaceAll("\n", "\r\n");
  assert.deepEqual(parseNpmCmdShim(crlf, fixtureCmd), parseNpmCmdShim(lf, fixtureCmd));
});

test("rewrites a Windows .cmd target to node and the underlying script", () => {
  const resolved = resolveTargetCommand([fixtureCmd, "--help", "build"], {
    platform: "win32",
    cwd: fixtureDir,
  });
  assert.deepEqual(resolved, [process.execPath, fixtureCli, "--help", "build"]);
});

test("resolves a bare bin name from node_modules/.bin without a shell", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-shim-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const binDir = path.join(temporary, "node_modules", ".bin");
  await mkdir(binDir, { recursive: true });
  const script = path.join(temporary, "tool.mjs");
  await writeFile(script, "console.log('ok')\n");
  await writeFile(path.join(binDir, "tool.cmd"), npmNodeShim("..\\..\\tool.mjs"));

  const resolved = resolveTargetCommand(["tool", "--help"], {
    platform: "win32",
    cwd: temporary,
    env: { PATH: "", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
  });
  assert.deepEqual(resolved, [process.execPath, script, "--help"]);
});

test("resolves a .cmd on PATH without a shell", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-shim-path-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const script = path.join(temporary, "path-cli.mjs");
  await writeFile(script, "console.log('ok')\n");
  await writeFile(path.join(temporary, "path-cli.cmd"), npmNodeShim("path-cli.mjs"));

  const resolved = resolveTargetCommand(["path-cli"], {
    platform: "win32",
    cwd: fixtureDir,
    env: { PATH: temporary, PATHEXT: ".EXE;.CMD" },
  });
  assert.deepEqual(resolved, [process.execPath, script]);
});

test("uses a local node.exe next to the shim when it exists", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-shim-node-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const script = path.join(temporary, "cli.mjs");
  const localNode = path.join(temporary, "node.exe");
  await writeFile(script, "console.log('ok')\n");
  await writeFile(localNode, "");
  const shimPath = path.join(temporary, "cli.cmd");
  await writeFile(shimPath, npmNodeShim("cli.mjs"));

  const resolved = parseNpmCmdShim(await readFile(shimPath, "utf8"), shimPath);
  assert.equal(resolved.nodePath, localNode);
  assert.equal(resolved.scriptPath, script);
});

test("rejects a .cmd that injects extra commands", () => {
  const content = npmNodeShim("cli.mjs").replace(
    '"%_prog%"  "%dp0%\\cli.mjs" %*',
    '"%_prog%"  "%dp0%\\cli.mjs" & echo pwned>pwned.txt %*',
  );
  assert.throws(() => parseNpmCmdShim(content, fixtureCmd), /shell metacharacter/iu);
  assert.throws(
    () => resolveTargetCommand([maliciousCmd], { platform: "win32", cwd: fixtureDir }),
    /Pass \["node", "\.\/path\/to\/cli\.js"\] instead/u,
  );
});

test("rejects pipe, redirect, and caret injection in shim text", () => {
  for (const injected of ["| echo pwned", ">pwned.txt", "<pwned.txt", "^& echo pwned"]) {
    const content = npmNodeShim("cli.mjs").replace(
      '"%_prog%"  "%dp0%\\cli.mjs" %*',
      `"%_prog%"  "%dp0%\\cli.mjs" ${injected} %*`,
    );
    assert.throws(() => parseNpmCmdShim(content, fixtureCmd), /shell metacharacter/iu);
  }
});

test("rejects unexpected environment variables in a shim", () => {
  const content = npmNodeShim("%USERPROFILE%\\stolen.mjs");
  assert.throws(() => parseNpmCmdShim(content, fixtureCmd), /environment variable/iu);
});

test("rejects shims that name more than one JavaScript entry", () => {
  const content = `${classicNpmShim("cli.mjs")}\nnode  "%~dp0\\other.mjs" %*\n`;
  assert.throws(() => parseNpmCmdShim(content, fixtureCmd), /multiple/iu);
});

test("rejects a missing script path in an otherwise valid shim", () => {
  assert.throws(
    () => parseNpmCmdShim(npmNodeShim("does-not-exist.mjs"), missingCmd),
    /does not exist|missing script/iu,
  );
  assert.throws(
    () => resolveTargetCommand([missingCmd], { platform: "win32", cwd: fixtureDir }),
    /Pass \["node", "\.\/path\/to\/cli\.js"\] instead/u,
  );
});

test("rejects a non-npm custom batch file", () => {
  assert.throws(() => parseNpmCmdShim("@echo off\nnode cli.mjs %*\n", customBat), /npm-style|not an npm/iu);
  assert.throws(
    () => resolveTargetCommand([customBat], { platform: "win32", cwd: fixtureDir }),
    /Pass \["node", "\.\/path\/to\/cli\.js"\] instead/u,
  );
});

test("never enables a shell and never invokes cmd.exe", async () => {
  const capture = await readFile(new URL("../src/capture.js", import.meta.url), "utf8");
  const resolve = await readFile(new URL("../src/resolve-command.js", import.meta.url), "utf8");
  assert.match(capture, /shell:\s*false/u);
  assert.doesNotMatch(capture, /shell:\s*true/u);
  assert.doesNotMatch(resolve, /shell:\s*true/u);
  assert.doesNotMatch(capture, /cmd\.exe/iu);
  assert.doesNotMatch(resolve, /cmd\.exe/iu);
  assert.doesNotMatch(capture, /shell:\s*1/u);
});

test("malicious shim content is not executed when resolution fails", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-shim-evil-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const marker = path.join(temporary, "pwned.txt");
  const shimPath = path.join(temporary, "evil.cmd");
  await writeFile(
    shimPath,
    npmNodeShim("cli.mjs").replace(
      '"%_prog%"  "%dp0%\\cli.mjs" %*',
      `"%_prog%"  "%dp0%\\cli.mjs" & echo pwned>${marker} %*`,
    ),
  );

  assert.throws(
    () => resolveTargetCommand([shimPath], { platform: "win32", cwd: temporary }),
    /Pass \["node", "\.\/path\/to\/cli\.js"\] instead/u,
  );
  assert.equal(existsSync(marker), false);
});

test("runTarget resolves an npm .cmd shim when the platform is win32", async () => {
  const result = await runTarget([fixtureCmd, "--help"], {
    cwd: fixtureDir,
    platform: "win32",
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Shim CLI used to test Windows npm \.cmd resolution/u);
});

test("runTarget preserves argument boundaries through a rewritten shim", async () => {
  const result = await runTarget([fixtureCmd, "one two", "--flag"], {
    cwd: fixtureDir,
    platform: "win32",
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /shim-cli args:\["one two","--flag"\]/u);
});

test("runTarget rejects a malicious .cmd without spawning a shell", async () => {
  const marker = path.join(fixtureDir, "pwned.txt");
  await assert.rejects(
    runTarget([maliciousCmd], { cwd: fixtureDir, platform: "win32" }),
    /Pass \["node", "\.\/path\/to\/cli\.js"\] instead/u,
  );
  assert.equal(existsSync(marker), false);
});

test(
  "runTarget resolves a .cmd shim on Windows without a shell",
  { skip: process.platform !== "win32" },
  async () => {
    const result = await runTarget([fixtureCmd, "--help"], { cwd: fixtureDir });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Shim CLI used to test Windows npm \.cmd resolution/u);
  },
);

test(
  "runTarget preserves argument boundaries through a Windows .cmd shim",
  { skip: process.platform !== "win32" },
  async () => {
    const result = await runTarget([fixtureCmd, "one two", "--flag"], { cwd: fixtureDir });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /shim-cli args:\["one two","--flag"\]/u);
  },
);

test("captureSnapshot records the original .cmd command after a Windows rewrite", async () => {
  const snapshot = await captureSnapshot([fixtureCmd], {
    cwd: fixtureDir,
    platform: "win32",
  });
  assert.deepEqual(snapshot.command, ["./cli.cmd"]);
  assert.equal(snapshot.version, "shim-cli 1.0.0");
  assert.equal(snapshot.root.name, "shim-cli");
  assert.ok(snapshot.root.options.some((option) => option.names.includes("--help")));
});

test(
  "captureSnapshot can target a Windows npm .cmd shim",
  { skip: process.platform !== "win32" },
  async () => {
    const snapshot = await captureSnapshot([fixtureCmd], { cwd: fixtureDir });
    assert.deepEqual(snapshot.command, ["./cli.cmd"]);
    assert.equal(snapshot.root.name, "shim-cli");
    assert.equal(snapshot.version, "shim-cli 1.0.0");
  },
);

test(
  "runTarget rejects a malicious .cmd on Windows without creating side effects",
  { skip: process.platform !== "win32" },
  async () => {
    const marker = path.join(fixtureDir, "pwned.txt");
    await assert.rejects(runTarget([maliciousCmd], { cwd: fixtureDir }), /Pass \["node"/u);
    assert.equal(existsSync(marker), false);
  },
);

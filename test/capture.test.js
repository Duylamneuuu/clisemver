import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { captureSnapshot, runTarget } from "../src/capture.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = path.join(projectRoot, "fixtures", "demo-v1.mjs");
const slowFixture = path.join(projectRoot, "fixtures", "slow-cli.mjs");
const partialFixture = path.join(projectRoot, "fixtures", "partial-cli.mjs");

test("captures a recursive and deterministic CLI snapshot", async () => {
  const snapshot = await captureSnapshot([process.execPath, fixture], { cwd: projectRoot });
  assert.deepEqual(snapshot.command, ["node", "./fixtures/demo-v1.mjs"]);
  assert.equal(snapshot.version, "demo 1.0.0");
  assert.equal(snapshot.root.name, "demo");
  assert.deepEqual(
    snapshot.root.subcommands.map((command) => command.name),
    ["build", "config", "help"],
  );
  const config = snapshot.root.subcommands.find((command) => command.name === "config");
  assert.deepEqual(
    config.subcommands.map((command) => command.name),
    ["get", "set"],
  );
  assert.deepEqual(snapshot.warnings, []);
});

test("honors maximum recursion depth", async () => {
  const snapshot = await captureSnapshot([process.execPath, fixture], {
    cwd: projectRoot,
    maxDepth: 0,
  });
  assert.deepEqual(snapshot.root.subcommands, []);
  assert.match(snapshot.warnings[0], /max depth 0/u);
});

test("terminates a target that exceeds its timeout", async () => {
  await assert.rejects(
    runTarget([process.execPath, slowFixture], { cwd: projectRoot, timeoutMs: 20 }),
    /Timed out after 20ms/u,
  );
});

test("reports an executable that cannot start", async () => {
  await assert.rejects(
    runTarget(["clisemver-command-that-does-not-exist"]),
    /Could not start/u,
  );
});

test("records a warning when discovered subcommand help is unavailable", async () => {
  const snapshot = await captureSnapshot([process.execPath, partialFixture], {
    cwd: projectRoot,
  });
  assert.equal(snapshot.root.subcommands[0].name, "broken");
  assert.match(snapshot.warnings[0], /without recognizable help/u);
});

test("bounds output and validates capture settings", async () => {
  await assert.rejects(
    runTarget([process.execPath, "-e", "console.log('output')"], {
      maxOutputBytes: 2,
    }),
    /Output exceeded 2 bytes/u,
  );
  await assert.rejects(
    captureSnapshot([process.execPath, fixture], {
      cwd: projectRoot,
      maxOutputBytes: 0,
    }),
    /maxOutputBytes must be a positive integer/u,
  );
  await assert.rejects(
    captureSnapshot([process.execPath, fixture], { cwd: projectRoot, helpArgs: [] }),
    /helpArgs must be a non-empty string array/u,
  );
});

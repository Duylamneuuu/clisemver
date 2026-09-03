import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/cli.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureV1 = path.join(projectRoot, "fixtures", "demo-v1.mjs");
const fixtureV2 = path.join(projectRoot, "fixtures", "demo-v2.mjs");

function memoryStream() {
  let content = "";
  return {
    write(chunk) {
      content += String(chunk);
    },
    read() {
      return content;
    },
  };
}

function io() {
  return { cwd: projectRoot, stdout: memoryStream(), stderr: memoryStream() };
}

test("shows help and version", async () => {
  const helpIo = io();
  assert.equal(await runCli([], helpIo), 0);
  assert.match(helpIo.stdout.read(), /snapshot\s+Capture/u);

  const versionIo = io();
  assert.equal(await runCli(["--version"], versionIo), 0);
  assert.match(versionIo.stdout.read(), /^0\.3\.0/u);
});

test("captures, validates, and checks snapshots end to end", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const snapshot = path.join(temporary, "baseline.json");

  const captureIo = io();
  const captureExit = await runCli(
    [
      "snapshot",
      "--output",
      snapshot,
      "--",
      process.execPath,
      fixtureV1,
    ],
    captureIo,
  );
  assert.equal(captureExit, 0);
  assert.match(captureIo.stderr.read(), /Wrote/u);

  const validateIo = io();
  assert.equal(await runCli(["validate", snapshot], validateIo), 0);
  assert.match(validateIo.stdout.read(), /valid clisemver v1 snapshot/u);

  const checkIo = io();
  const checkExit = await runCli(
    [
      "check",
      "--against",
      snapshot,
      "--format",
      "json",
      "--",
      process.execPath,
      fixtureV2,
    ],
    checkIo,
  );
  assert.equal(checkExit, 1);
  const result = JSON.parse(checkIo.stdout.read());
  assert.equal(result.requiredBump, "major");
  assert.ok(result.summary.major >= 1);

  const diffIo = io();
  assert.equal(
    await runCli(["diff", snapshot, snapshot, "--format", "text"], diffIo),
    0,
  );
  assert.match(diffIo.stdout.read(), /No public CLI changes detected/u);
});

test("uses exit code 2 for invalid usage", async () => {
  const targetIo = io();
  assert.equal(await runCli(["snapshot"], targetIo), 2);
  assert.match(targetIo.stderr.read(), /Missing target command/u);

  const flagIo = io();
  assert.equal(await runCli(["wat"], flagIo), 2);
  assert.match(flagIo.stderr.read(), /Unknown command/u);
});

test("uses config for target, snapshot, and output options", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-config-cli-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await writeFile(
    path.join(temporary, "clisemver.config.json"),
    JSON.stringify({
      command: [process.execPath, fixtureV1],
      snapshot: "baseline.json",
      failOn: "minor",
      format: "json",
    }),
    "utf8",
  );

  const snapshotIo = { cwd: temporary, stdout: memoryStream(), stderr: memoryStream() };
  assert.equal(await runCli(["snapshot"], snapshotIo), 0);

  const checkIo = { cwd: temporary, stdout: memoryStream(), stderr: memoryStream() };
  assert.equal(
    await runCli(
      ["check", "--format", "text", "--", process.execPath, fixtureV2],
      checkIo,
    ),
    1,
  );
  assert.match(checkIo.stdout.read(), /Required bump: MAJOR/u);
});

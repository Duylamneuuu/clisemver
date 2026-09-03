import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readConfig, validateConfig } from "../src/config.js";

test("accepts the documented config shape", () => {
  const config = {
    command: ["node", "./dist/cli.js"],
    snapshot: ".clisemver/snapshot.json",
    cwd: "packages/cli",
    helpFlag: "--help",
    versionFlag: "--version",
    noVersion: false,
    maxDepth: 4,
    timeout: 10_000,
    format: "markdown",
    failOn: "minor",
    ignore: ["command.description-changed", "option.*"],
  };
  assert.deepEqual(validateConfig(config), []);
});

test("rejects unknown keys and unsafe wildcard rules", () => {
  const errors = validateConfig({
    command: ["node"],
    unexpected: true,
    ignore: ["*major"],
  });
  assert.ok(errors.includes("unknown key: unexpected"));
  assert.ok(errors.some((error) => error.includes("ignore[0]")));
});

test("reads JSON config from the working directory", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-config-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await writeFile(
    path.join(temporary, "clisemver.config.json"),
    JSON.stringify({ command: ["node", "./cli.js"], snapshot: "baseline.json" }),
    "utf8",
  );
  assert.deepEqual(await readConfig(temporary), {
    command: ["node", "./cli.js"],
    snapshot: "baseline.json",
  });
});

test("missing config is optional", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-config-"));
  try {
    assert.deepEqual(await readConfig(temporary), {});
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

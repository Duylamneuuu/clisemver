import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { captureSnapshot } from "../src/capture.js";
import { writeJsonFile } from "../src/io.js";

process.env.CLISEMVER_ACTION_TEST = "1";
const { parseActionCommand } = await import("../action/index.js");
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("GitHub Action command input is a shell-free JSON array", () => {
  assert.deepEqual(parseActionCommand('["node","./dist/cli.js"]'), [
    "node",
    "./dist/cli.js",
  ]);
  assert.throws(() => parseActionCommand("node ./dist/cli.js"), /JSON array/u);
  assert.throws(() => parseActionCommand("[]"), /must look like/u);
});

test("GitHub Action writes outputs and fails on a breaking change", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clisemver-action-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const fixtureV1 = path.join(projectRoot, "fixtures", "demo-v1.mjs");
  const fixtureV2 = path.join(projectRoot, "fixtures", "demo-v2.mjs");
  const snapshotPath = path.join(temporary, "baseline.json");
  const outputPath = path.join(temporary, "output.txt");
  const summaryPath = path.join(temporary, "summary.md");
  const baseline = await captureSnapshot([process.execPath, fixtureV1], {
    cwd: projectRoot,
  });
  await writeJsonFile(snapshotPath, baseline);

  const result = spawnSync(process.execPath, [path.join(projectRoot, "action", "index.js")], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CLISEMVER_ACTION_TEST: "0",
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_WORKSPACE: projectRoot,
      "INPUT_COMMAND": JSON.stringify([process.execPath, fixtureV2]),
      "INPUT_FAIL-ON": "major",
      "INPUT_MAX-DEPTH": "4",
      "INPUT_SNAPSHOT": snapshotPath,
      "INPUT_TIMEOUT": "10000",
    },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Required bump: MAJOR/u);
  assert.match(result.stdout, /::error title=Breaking CLI change::/u);
  assert.match(await readFile(outputPath, "utf8"), /required-bump=major/u);
  assert.match(await readFile(summaryPath, "utf8"), /clisemver report/u);
});

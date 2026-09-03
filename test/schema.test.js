import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertValidSnapshot, validateSnapshot } from "../src/schema.js";

const schemaUrl = new URL("../schema/clisemver.snapshot.schema.json", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);

function validSnapshot() {
  return {
    schemaVersion: 1,
    command: ["demo"],
    version: null,
    warnings: [],
    root: {
      name: "demo",
      path: [],
      usage: "demo",
      description: "",
      options: [],
      positionals: [],
      subcommands: [],
    },
  };
}

test("accepts a valid v1 snapshot", () => {
  const snapshot = validSnapshot();
  assert.deepEqual(validateSnapshot(snapshot), []);
  assert.equal(assertValidSnapshot(snapshot), snapshot);
});

test("reports multiple schema errors", () => {
  const snapshot = validSnapshot();
  snapshot.schemaVersion = 2;
  snapshot.command = [];
  snapshot.root.options = [{}];
  const errors = validateSnapshot(snapshot);
  assert.ok(errors.some((error) => error.startsWith("schemaVersion")));
  assert.ok(errors.includes("command must not be empty"));
  assert.ok(errors.some((error) => error.includes("root.options[0].key")));
});

test("rejects cyclic command trees", () => {
  const snapshot = validSnapshot();
  snapshot.root.subcommands.push(snapshot.root);
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes("cycle")));
});

test("publishes the snapshot JSON Schema and package export", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.required, [
    "schemaVersion",
    "command",
    "version",
    "warnings",
    "root",
  ]);
  assert.ok(schema.$defs.command);
  assert.equal(packageJson.exports["./schema"], "./schema/clisemver.snapshot.schema.json");
  assert.ok(packageJson.files.includes("schema/"));
});

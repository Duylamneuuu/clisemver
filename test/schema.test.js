import assert from "node:assert/strict";
import test from "node:test";
import { assertValidSnapshot, validateSnapshot } from "../src/schema.js";

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

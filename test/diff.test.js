import assert from "node:assert/strict";
import test from "node:test";
import { diffSnapshots, meetsThreshold } from "../src/diff.js";

function baseline() {
  return {
    schemaVersion: 1,
    command: ["demo"],
    version: "1.0.0",
    warnings: [],
    root: {
      name: "demo",
      path: [],
      usage: "demo [options]",
      description: "Demo",
      options: [
        {
          key: "--output",
          names: ["-o", "--output"],
          argument: { name: "file", required: true, variadic: false },
          required: false,
          negatable: false,
          description: "Output file",
          default: "stdout",
          choices: ["stdout", "file"],
        },
      ],
      positionals: [],
      subcommands: [],
    },
  };
}

test("reports no changes for equal snapshots", () => {
  const before = baseline();
  const result = diffSnapshots(before, structuredClone(before));
  assert.equal(result.requiredBump, "none");
  assert.equal(result.compatible, true);
  assert.deepEqual(result.summary, { major: 0, minor: 0, patch: 0 });
});

test("classifies an optional option and command addition as minor", () => {
  const before = baseline();
  const after = structuredClone(before);
  after.root.options.push({
    key: "--debug",
    names: ["--debug"],
    argument: null,
    required: false,
    negatable: false,
    description: "Debug output",
  });
  after.root.subcommands.push({
    name: "inspect",
    path: ["inspect"],
    usage: "demo inspect",
    description: "Inspect",
    options: [],
    positionals: [],
    subcommands: [],
  });
  const result = diffSnapshots(before, after);
  assert.equal(result.requiredBump, "minor");
  assert.equal(result.summary.minor, 2);
  assert.equal(meetsThreshold(result, "major"), false);
  assert.equal(meetsThreshold(result, "minor"), true);
});

test("classifies removed aliases and changed defaults as major", () => {
  const before = baseline();
  const after = structuredClone(before);
  after.root.options[0].names = ["--output"];
  after.root.options[0].default = "file";
  const result = diffSnapshots(before, after);
  assert.equal(result.requiredBump, "major");
  assert.ok(result.changes.some((change) => change.code === "option.aliases-removed"));
  assert.ok(result.changes.some((change) => change.code === "option.default-changed"));
});

test("classifies removed accepted choices as major and added choices as minor", () => {
  const before = baseline();
  const after = structuredClone(before);
  after.root.options[0].choices = ["file", "memory"];
  const result = diffSnapshots(before, after);
  assert.ok(result.changes.some((change) => change.code === "option.choices-removed"));
  assert.ok(result.changes.some((change) => change.code === "option.choices-added"));
  assert.equal(result.requiredBump, "major");
});

test("classifies required additions and command removals as major", () => {
  const before = baseline();
  before.root.subcommands.push({
    name: "build",
    path: ["build"],
    usage: "demo build",
    description: "Build",
    options: [],
    positionals: [],
    subcommands: [],
  });
  const after = structuredClone(before);
  after.root.subcommands = [];
  after.root.options.push({
    key: "--token",
    names: ["--token"],
    argument: { name: "value", required: true, variadic: false },
    required: true,
    negatable: false,
    description: "Token",
  });
  const result = diffSnapshots(before, after);
  assert.equal(result.requiredBump, "major");
  assert.ok(result.changes.some((change) => change.code === "command.removed"));
  assert.ok(result.changes.some((change) => change.code === "option.added"));
  assert.equal(meetsThreshold(result, "none"), false);
});

test("classifies a root command rename as major", () => {
  const before = baseline();
  const after = structuredClone(before);
  after.root.name = "renamed";
  const result = diffSnapshots(before, after);
  assert.equal(result.requiredBump, "major");
  assert.ok(
    result.changes.some((change) => change.code === "command.root-name-changed"),
  );
});

test("applies exact and namespace ignore rules before summarizing", () => {
  const before = baseline();
  const after = structuredClone(before);
  after.root.options[0].default = "file";
  after.root.options.push({
    key: "--debug",
    names: ["--debug"],
    argument: null,
    required: false,
    negatable: false,
    description: "Debug output",
  });

  const exact = diffSnapshots(before, after, { ignore: ["option.default-changed"] });
  assert.equal(exact.requiredBump, "minor");
  assert.equal(exact.summary.major, 0);
  assert.equal(exact.summary.minor, 1);

  const namespace = diffSnapshots(before, after, { ignore: ["option.*"] });
  assert.equal(namespace.requiredBump, "none");
  assert.deepEqual(namespace.summary, { major: 0, minor: 0, patch: 0 });
});

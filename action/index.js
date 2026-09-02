import { appendFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { captureSnapshot } from "../src/capture.js";
import { diffSnapshots, meetsThreshold } from "../src/diff.js";
import { formatMarkdown, formatText } from "../src/format.js";
import { readSnapshot } from "../src/io.js";

function input(name, fallback) {
  const value = process.env[`INPUT_${name.toUpperCase()}`];
  return value === undefined || value === "" ? fallback : value;
}

function integerInput(name, fallback, maximum, minimum = 0) {
  const raw = input(name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name.toLowerCase()} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

export function parseActionCommand(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`command must be a JSON array: ${cause.message}`);
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((part) => typeof part !== "string" || !part)
  ) {
    throw new Error('command must look like ["node","./dist/cli.js"]');
  }
  return value;
}

function escapeWorkflowCommand(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}

async function setOutputs(result) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  await appendFile(
    outputFile,
    [
      `required-bump=${result.requiredBump}`,
      `major=${result.summary.major}`,
      `minor=${result.summary.minor}`,
      `patch=${result.summary.patch}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeSummary(result) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    await appendFile(summaryFile, `${formatMarkdown(result)}\n`, "utf8");
  }
}

async function main() {
  const cwd = path.resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const command = parseActionCommand(input("COMMAND", ""));
  const snapshotPath = input("SNAPSHOT", ".clisemver/snapshot.json");
  const failOn = input("FAIL-ON", "major");
  const baseline = await readSnapshot(snapshotPath, cwd);
  const current = await captureSnapshot(command, {
    cwd,
    maxDepth: integerInput("MAX-DEPTH", 4, 20),
    timeoutMs: integerInput("TIMEOUT", 10_000, 3_600_000, 1),
  });
  const result = diffSnapshots(baseline, current);

  process.stdout.write(`${formatText(result)}\n`);
  for (const warning of current.warnings) {
    process.stdout.write(
      `::warning title=clisemver::${escapeWorkflowCommand(warning)}\n`,
    );
  }
  for (const change of result.changes.filter((item) => item.level === "major")) {
    const message = `${change.path}: ${change.message}`;
    process.stdout.write(
      `::error title=Breaking CLI change::${escapeWorkflowCommand(message)}\n`,
    );
  }
  await Promise.all([setOutputs(result), writeSummary(result)]);
  if (meetsThreshold(result, failOn)) process.exitCode = 1;
}

if (process.env.CLISEMVER_ACTION_TEST !== "1") {
  main().catch((error) => {
    process.stderr.write(
      `::error title=clisemver failed::${escapeWorkflowCommand(error.message)}\n`,
    );
    process.exitCode = 2;
  });
}

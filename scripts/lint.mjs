import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { VERSION } from "../src/version.js";

const root = path.resolve(import.meta.dirname, "..");
const sourceDirectories = [
  ".clisemver",
  ".github",
  "action",
  "bin",
  "docs",
  "examples",
  "fixtures",
  "schema",
  "scripts",
  "src",
  "test",
];
const textExtensions = new Set([".js", ".mjs", ".json", ".md", ".yml", ".yaml"]);
const failures = [];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(absolute)));
    else files.push(absolute);
  }
  return files;
}

const files = (await Promise.all(
  sourceDirectories.map((directory) => filesBelow(path.join(root, directory))),
)).flat();
files.push(
  path.join(root, "action.yml"),
  path.join(root, "AGENTS.md"),
  path.join(root, "CHANGELOG.md"),
  path.join(root, "CODE_OF_CONDUCT.md"),
  path.join(root, "CONTRIBUTING.md"),
  path.join(root, "README.md"),
  path.join(root, "SECURITY.md"),
  path.join(root, "package.json"),
);

for (const file of files) {
  if (!textExtensions.has(path.extname(file))) continue;
  const content = await readFile(file, "utf8");
  const relative = path.relative(root, file);
  if (!content.endsWith("\n")) failures.push(`${relative}: missing final newline`);
  content.split("\n").forEach((line, index) => {
    if (/[ \t]+$/u.test(line)) failures.push(`${relative}:${index + 1}: trailing whitespace`);
    if (line.includes("\t")) failures.push(`${relative}:${index + 1}: tab character`);
  });
  if (file.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (error) {
      failures.push(`${relative}: invalid JSON: ${error.message}`);
    }
  }
  if (file.endsWith(".js") || file.endsWith(".mjs")) {
    const result = spawnSync(process.execPath, ["--check", file], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) failures.push(`${relative}: ${result.stderr.trim()}`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== VERSION) {
  failures.push(`package.json version ${packageJson.version} does not match ${VERSION}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked ${files.length} files.\n`);
}

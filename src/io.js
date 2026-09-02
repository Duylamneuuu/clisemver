import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertValidSnapshot } from "./schema.js";

export async function readSnapshot(filePath, cwd = process.cwd()) {
  const absolutePath = path.resolve(cwd, filePath);
  let value;
  try {
    value = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (cause) {
    const error = new Error(`Could not read snapshot ${filePath}: ${cause.message}`);
    error.code = "SNAPSHOT_READ_FAILED";
    error.cause = cause;
    throw error;
  }
  return assertValidSnapshot(value);
}

export async function writeJsonFile(filePath, value, cwd = process.cwd()) {
  const absolutePath = path.resolve(cwd, filePath);
  const directory = path.dirname(absolutePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, absolutePath);
  return absolutePath;
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const CONFIG_FILE = "clisemver.config.json";

const CONFIG_KEYS = new Set([
  "command",
  "snapshot",
  "cwd",
  "helpFlag",
  "versionFlag",
  "noVersion",
  "maxDepth",
  "timeout",
  "format",
  "failOn",
  "ignore",
]);

const FORMATS = new Set(["text", "markdown", "json"]);
const FAIL_LEVELS = new Set(["none", "patch", "minor", "major"]);

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validateString(value, key, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${key} must be a non-empty string`);
  }
}

function validateStringArray(value, key, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`);
    return;
  }
  if (nonEmpty && value.length === 0) errors.push(`${key} must not be empty`);
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      errors.push(`${key}[${index}] must be a non-empty string`);
    }
  });
}

function validateInteger(value, key, errors, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${key} must be an integer between ${min} and ${max}`);
  }
}

export function validateConfig(value) {
  if (!isObject(value)) return ["config must be an object"];

  const errors = [];
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) errors.push(`unknown key: ${key}`);
  }

  if (value.command !== undefined) {
    validateStringArray(value.command, "command", errors, { nonEmpty: true });
  }
  for (const key of ["snapshot", "cwd", "helpFlag", "versionFlag"]) {
    if (value[key] !== undefined) validateString(value[key], key, errors);
  }
  if (value.noVersion !== undefined && typeof value.noVersion !== "boolean") {
    errors.push("noVersion must be a boolean");
  }
  if (value.maxDepth !== undefined) {
    validateInteger(value.maxDepth, "maxDepth", errors, 0, 20);
  }
  if (value.timeout !== undefined) {
    validateInteger(value.timeout, "timeout", errors, 1, 3_600_000);
  }
  if (value.format !== undefined && !FORMATS.has(value.format)) {
    errors.push("format must be text, markdown, or json");
  }
  if (value.failOn !== undefined && !FAIL_LEVELS.has(value.failOn)) {
    errors.push("failOn must be none, patch, minor, or major");
  }
  if (value.ignore !== undefined) {
    validateStringArray(value.ignore, "ignore", errors);
    if (Array.isArray(value.ignore)) {
      value.ignore.forEach((rule, index) => {
        if (
          typeof rule === "string" &&
          rule.includes("*") &&
          !rule.endsWith(".*")
        ) {
          errors.push(`ignore[${index}] may only use * as a trailing namespace wildcard`);
        }
      });
    }
  }
  return errors;
}

export async function readConfig(cwd = process.cwd()) {
  const absolutePath = path.resolve(cwd, CONFIG_FILE);
  let raw;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (cause) {
    if (cause.code === "ENOENT") return {};
    const error = new Error(`Could not read ${CONFIG_FILE}: ${cause.message}`);
    error.code = "CONFIG_READ_FAILED";
    error.cause = cause;
    throw error;
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    const error = new Error(`Invalid ${CONFIG_FILE}: ${cause.message}`);
    error.code = "CONFIG_INVALID";
    error.cause = cause;
    throw error;
  }

  const errors = validateConfig(value);
  if (errors.length > 0) {
    const error = new Error(`Invalid ${CONFIG_FILE}:\n- ${errors.join("\n- ")}`);
    error.code = "CONFIG_INVALID";
    error.validationErrors = errors;
    throw error;
  }
  return value;
}

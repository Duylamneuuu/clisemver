export const SNAPSHOT_SCHEMA_VERSION = 1;

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validateStringArray(value, path, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  if (nonEmpty && value.length === 0) {
    errors.push(`${path} must not be empty`);
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      errors.push(`${path}[${index}] must be a non-empty string`);
    }
  });
}

function validateArgument(value, path, errors) {
  if (value === null) return;
  if (!isObject(value)) {
    errors.push(`${path} must be an object or null`);
    return;
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    errors.push(`${path}.name must be a non-empty string`);
  }
  if (typeof value.required !== "boolean") {
    errors.push(`${path}.required must be a boolean`);
  }
  if (typeof value.variadic !== "boolean") {
    errors.push(`${path}.variadic must be a boolean`);
  }
}

function validateOption(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof value.key !== "string" || !value.key.startsWith("-")) {
    errors.push(`${path}.key must be an option name`);
  }
  validateStringArray(value.names, `${path}.names`, errors, { nonEmpty: true });
  if (typeof value.required !== "boolean") {
    errors.push(`${path}.required must be a boolean`);
  }
  if (typeof value.negatable !== "boolean") {
    errors.push(`${path}.negatable must be a boolean`);
  }
  validateArgument(value.argument, `${path}.argument`, errors);
  if (typeof value.description !== "string") {
    errors.push(`${path}.description must be a string`);
  }
  if (value.default !== undefined && typeof value.default !== "string") {
    errors.push(`${path}.default must be a string when present`);
  }
  if (value.choices !== undefined) {
    validateStringArray(value.choices, `${path}.choices`, errors);
  }
}

function validatePositional(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    errors.push(`${path}.name must be a non-empty string`);
  }
  if (typeof value.required !== "boolean") {
    errors.push(`${path}.required must be a boolean`);
  }
  if (typeof value.variadic !== "boolean") {
    errors.push(`${path}.variadic must be a boolean`);
  }
}

function validateCommand(value, path, errors, seen) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (seen.has(value)) {
    errors.push(`${path} contains a cycle`);
    return;
  }
  seen.add(value);

  if (typeof value.name !== "string" || value.name.length === 0) {
    errors.push(`${path}.name must be a non-empty string`);
  }
  validateStringArray(value.path, `${path}.path`, errors);
  if (typeof value.usage !== "string") {
    errors.push(`${path}.usage must be a string`);
  }
  if (typeof value.description !== "string") {
    errors.push(`${path}.description must be a string`);
  }

  if (!Array.isArray(value.options)) {
    errors.push(`${path}.options must be an array`);
  } else {
    value.options.forEach((option, index) =>
      validateOption(option, `${path}.options[${index}]`, errors),
    );
  }

  if (!Array.isArray(value.positionals)) {
    errors.push(`${path}.positionals must be an array`);
  } else {
    value.positionals.forEach((positional, index) =>
      validatePositional(positional, `${path}.positionals[${index}]`, errors),
    );
  }

  if (!Array.isArray(value.subcommands)) {
    errors.push(`${path}.subcommands must be an array`);
  } else {
    value.subcommands.forEach((command, index) =>
      validateCommand(command, `${path}.subcommands[${index}]`, errors, seen),
    );
  }

  seen.delete(value);
}

export function validateSnapshot(value) {
  const errors = [];
  if (!isObject(value)) return ["snapshot must be an object"];

  if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${SNAPSHOT_SCHEMA_VERSION}, received ${String(value.schemaVersion)}`,
    );
  }
  validateStringArray(value.command, "command", errors, { nonEmpty: true });
  if (value.version !== null && typeof value.version !== "string") {
    errors.push("version must be a string or null");
  }
  if (!Array.isArray(value.warnings)) {
    errors.push("warnings must be an array");
  } else {
    validateStringArray(value.warnings, "warnings", errors);
  }
  validateCommand(value.root, "root", errors, new WeakSet());
  return errors;
}

export function assertValidSnapshot(value) {
  const errors = validateSnapshot(value);
  if (errors.length > 0) {
    const error = new Error(`Invalid clisemver snapshot:\n- ${errors.join("\n- ")}`);
    error.code = "INVALID_SNAPSHOT";
    error.validationErrors = errors;
    throw error;
  }
  return value;
}

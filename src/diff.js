import { assertValidSnapshot } from "./schema.js";

export const CHANGE_LEVELS = ["none", "patch", "minor", "major"];

const rank = (level) => CHANGE_LEVELS.indexOf(level);
const commandKey = (command) => command.path.join(" ");
const commandLabel = (command) => command.path.join(" ") || command.name;

function addChange(changes, level, code, path, message, before, after) {
  const change = { level, code, path, message };
  if (before !== undefined) change.before = before;
  if (after !== undefined) change.after = after;
  changes.push(change);
}

function flattenCommands(root) {
  const commands = new Map();
  const visit = (command) => {
    commands.set(commandKey(command), command);
    command.subcommands.forEach(visit);
  };
  visit(root);
  return commands;
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function equalOptional(left, right) {
  return (left ?? undefined) === (right ?? undefined);
}

function compareArgument(changes, before, after, path) {
  if (before === null && after !== null) {
    addChange(
      changes,
      "major",
      "option.value-added",
      path,
      "Option now consumes a value",
      before,
      after,
    );
    return;
  }
  if (before !== null && after === null) {
    addChange(
      changes,
      "major",
      "option.value-removed",
      path,
      "Option no longer accepts its previous value",
      before,
      after,
    );
    return;
  }
  if (before === null || after === null) return;

  if (!before.required && after.required) {
    addChange(
      changes,
      "major",
      "option.value-required",
      path,
      "Option value changed from optional to required",
      before,
      after,
    );
  } else if (before.required && !after.required) {
    addChange(
      changes,
      "minor",
      "option.value-optional",
      path,
      "Option value changed from required to optional",
      before,
      after,
    );
  }
  if (before.variadic !== after.variadic) {
    addChange(
      changes,
      "major",
      "option.value-arity-changed",
      path,
      "Option value variadic behavior changed",
      before.variadic,
      after.variadic,
    );
  }
  if (before.name !== after.name) {
    addChange(
      changes,
      "patch",
      "option.value-label-changed",
      path,
      `Option value label changed from "${before.name}" to "${after.name}"`,
      before.name,
      after.name,
    );
  }
}

function compareChoices(changes, before, after, path) {
  const oldChoices = before.choices ?? [];
  const newChoices = after.choices ?? [];
  const removed = difference(oldChoices, newChoices);
  const added = difference(newChoices, oldChoices);
  if (removed.length > 0) {
    addChange(
      changes,
      "major",
      "option.choices-removed",
      path,
      `Accepted values removed: ${removed.join(", ")}`,
      oldChoices,
      newChoices,
    );
  }
  if (added.length > 0) {
    addChange(
      changes,
      "minor",
      "option.choices-added",
      path,
      `Accepted values added: ${added.join(", ")}`,
      oldChoices,
      newChoices,
    );
  }
}

function compareOption(changes, before, after, commandPath) {
  const path = `${commandPath} ${before.key}`.trim();
  const removedNames = difference(before.names, after.names);
  const addedNames = difference(after.names, before.names);

  if (removedNames.length > 0) {
    addChange(
      changes,
      "major",
      "option.aliases-removed",
      path,
      `Option names removed: ${removedNames.join(", ")}`,
      before.names,
      after.names,
    );
  }
  if (addedNames.length > 0) {
    addChange(
      changes,
      "minor",
      "option.aliases-added",
      path,
      `Option names added: ${addedNames.join(", ")}`,
      before.names,
      after.names,
    );
  }
  if (before.key !== after.key && removedNames.length === 0) {
    addChange(
      changes,
      "patch",
      "option.canonical-name-changed",
      path,
      `Preferred option name changed from ${before.key} to ${after.key}`,
      before.key,
      after.key,
    );
  }

  if (!before.required && after.required) {
    addChange(changes, "major", "option.required", path, "Option is now required", false, true);
  } else if (before.required && !after.required) {
    addChange(changes, "minor", "option.optional", path, "Option is no longer required", true, false);
  }

  compareArgument(changes, before.argument, after.argument, path);
  compareChoices(changes, before, after, path);

  if (!equalOptional(before.default, after.default)) {
    addChange(
      changes,
      "major",
      "option.default-changed",
      path,
      `Default changed from ${JSON.stringify(before.default ?? null)} to ${JSON.stringify(after.default ?? null)}`,
      before.default ?? null,
      after.default ?? null,
    );
  }
}

function compareOptions(changes, before, after) {
  const usedAfter = new Set();
  const commandPath = commandLabel(before);

  for (const oldOption of before.options) {
    const match = after.options.find(
      (candidate, index) =>
        !usedAfter.has(index) &&
        candidate.names.some((name) => oldOption.names.includes(name)),
    );
    if (!match) {
      addChange(
        changes,
        "major",
        "option.removed",
        `${commandPath} ${oldOption.key}`,
        `Option ${oldOption.key} was removed`,
        oldOption,
      );
      continue;
    }
    const index = after.options.indexOf(match);
    usedAfter.add(index);
    compareOption(changes, oldOption, match, commandPath);
  }

  after.options.forEach((newOption, index) => {
    if (usedAfter.has(index)) return;
    const level = newOption.required ? "major" : "minor";
    addChange(
      changes,
      level,
      "option.added",
      `${commandLabel(after)} ${newOption.key}`,
      `${newOption.required ? "Required" : "Optional"} option ${newOption.key} was added`,
      undefined,
      newOption,
    );
  });
}

function comparePositionals(changes, before, after) {
  const commandPath = commandLabel(before);
  const length = Math.max(before.positionals.length, after.positionals.length);
  for (let index = 0; index < length; index += 1) {
    const oldPositional = before.positionals[index];
    const newPositional = after.positionals[index];
    const path = `${commandPath} positional[${index}]`;
    if (oldPositional && !newPositional) {
      addChange(
        changes,
        "major",
        "positional.removed",
        path,
        `Positional ${oldPositional.name} was removed`,
        oldPositional,
      );
      continue;
    }
    if (!oldPositional && newPositional) {
      addChange(
        changes,
        newPositional.required ? "major" : "minor",
        "positional.added",
        path,
        `${newPositional.required ? "Required" : "Optional"} positional ${newPositional.name} was added`,
        undefined,
        newPositional,
      );
      continue;
    }
    if (!oldPositional || !newPositional) continue;

    if (!oldPositional.required && newPositional.required) {
      addChange(
        changes,
        "major",
        "positional.required",
        path,
        `Positional ${oldPositional.name} is now required`,
        oldPositional,
        newPositional,
      );
    } else if (oldPositional.required && !newPositional.required) {
      addChange(
        changes,
        "minor",
        "positional.optional",
        path,
        `Positional ${oldPositional.name} is now optional`,
        oldPositional,
        newPositional,
      );
    }
    if (oldPositional.variadic !== newPositional.variadic) {
      addChange(
        changes,
        "major",
        "positional.arity-changed",
        path,
        `Positional ${oldPositional.name} variadic behavior changed`,
        oldPositional,
        newPositional,
      );
    }
    if (oldPositional.name !== newPositional.name) {
      addChange(
        changes,
        "patch",
        "positional.label-changed",
        path,
        `Positional label changed from ${oldPositional.name} to ${newPositional.name}`,
        oldPositional.name,
        newPositional.name,
      );
    }
  }
}

function compareCommand(changes, before, after) {
  if (before.path.length === 0 && before.name !== after.name) {
    addChange(
      changes,
      "major",
      "command.root-name-changed",
      before.name,
      `Root command name changed from ${before.name} to ${after.name}`,
      before.name,
      after.name,
    );
  }
  compareOptions(changes, before, after);
  comparePositionals(changes, before, after);
  if (before.description !== after.description) {
    addChange(
      changes,
      "patch",
      "command.description-changed",
      commandLabel(before),
      "Command description changed",
      before.description,
      after.description,
    );
  }
}

export function diffSnapshots(beforeSnapshot, afterSnapshot) {
  const before = assertValidSnapshot(beforeSnapshot);
  const after = assertValidSnapshot(afterSnapshot);
  const oldCommands = flattenCommands(before.root);
  const newCommands = flattenCommands(after.root);
  const changes = [];

  for (const [path, command] of oldCommands) {
    if (!newCommands.has(path)) {
      addChange(
        changes,
        "major",
        "command.removed",
        commandLabel(command),
        `Command ${commandLabel(command)} was removed`,
        command,
      );
      continue;
    }
    compareCommand(changes, command, newCommands.get(path));
  }

  for (const [path, command] of newCommands) {
    if (oldCommands.has(path)) continue;
    addChange(
      changes,
      "minor",
      "command.added",
      commandLabel(command),
      `Command ${commandLabel(command)} was added`,
      undefined,
      command,
    );
  }

  changes.sort(
    (left, right) =>
      rank(right.level) - rank(left.level) ||
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code),
  );
  const summary = { major: 0, minor: 0, patch: 0 };
  for (const change of changes) summary[change.level] += 1;
  const requiredBump = summary.major > 0
    ? "major"
    : summary.minor > 0
      ? "minor"
      : summary.patch > 0
        ? "patch"
        : "none";

  return {
    requiredBump,
    compatible: requiredBump !== "major",
    summary,
    changes,
  };
}

export function meetsThreshold(result, threshold = "major") {
  if (!CHANGE_LEVELS.includes(threshold)) {
    throw new Error(`Unknown failure threshold: ${threshold}`);
  }
  if (threshold === "none") return false;
  return rank(result.requiredBump) >= rank(threshold);
}

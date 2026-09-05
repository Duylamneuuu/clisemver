const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const SECTION_TYPES = new Map([
  ["option", "options"],
  ["options", "options"],
  ["flag", "options"],
  ["flags", "options"],
  ["global flag", "options"],
  ["global flags", "options"],
  ["global option", "options"],
  ["global options", "options"],
  ["command", "commands"],
  ["commands", "commands"],
  ["available command", "commands"],
  ["available commands", "commands"],
  ["argument", "arguments"],
  ["arguments", "arguments"],
  ["positional", "arguments"],
  ["positionals", "arguments"],
]);

const META_POSITIONALS = new Set(["command", "commands", "option", "options", "flag", "flags"]);

export function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

export function normalizeHelp(value) {
  return stripAnsi(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function normalizeHeading(value) {
  return value.trim().replace(/:$/, "").trim().toLowerCase();
}

function splitSignatureAndDescription(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(.+?)\s{2,}(\S.*)$/);
  if (!match) return { signature: trimmed, description: "" };
  return { signature: match[1].trim(), description: match[2].trim() };
}

function extractArgument(signature) {
  const withoutNegatable = signature.replace(/--\[no-\][\w-]+/g, "");
  const required = withoutNegatable.match(/<([^>]+)>/);
  const optional = withoutNegatable.match(/\[([^\]]+)\]/);
  const typed = withoutNegatable.match(
    /(?:=|\s)([A-Z][A-Z0-9_-]*|string(?:Array)?|number|integer|int|float|path|file|dir|url)(\.\.\.)?(?=\s|$)/,
  );
  const match = required ?? optional ?? typed;
  if (!match) return null;

  const rawName = match[1].trim();
  return {
    name: rawName.replace(/\.\.\.$/, ""),
    required: Boolean(required || typed),
    variadic: rawName.endsWith("...") || match[2] === "...",
  };
}

function expandOptionNames(signature) {
  const matches = signature.match(/--\[no-\][\w-]+|--?[A-Za-z0-9][\w-]*/g) ?? [];
  const names = [];
  let negatable = false;

  for (const match of matches) {
    if (match.startsWith("--[no-]")) {
      const stem = match.slice("--[no-]".length);
      names.push(`--${stem}`, `--no-${stem}`);
      negatable = true;
    } else {
      names.push(match);
    }
  }

  return { names: [...new Set(names)], negatable };
}

function chooseOptionKey(names) {
  const positiveLong = names.find(
    (name) => name.startsWith("--") && !name.startsWith("--no-"),
  );
  if (positiveLong) return positiveLong;
  return [...names].sort((left, right) => right.length - left.length)[0] ?? "";
}

function extractDefault(description) {
  const match =
    description.match(/\[default:\s*([^\]]+)\]/i) ??
    description.match(/\(default\s+([^)]+)\)/i);
  return match?.[1]?.trim();
}

function extractChoices(description) {
  const match = description.match(/\[choices?:\s*([^\]]+)\]/i);
  if (!match) return undefined;
  return match[1]
    .split(/\s*,\s*|\s*\|\s*/)
    .map((choice) => choice.replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

export function parseOptionLine(line) {
  const { signature, description } = splitSignatureAndDescription(line);
  const { names, negatable } = expandOptionNames(signature);
  if (names.length === 0) return null;

  const option = {
    key: chooseOptionKey(names),
    names,
    argument: extractArgument(signature),
    required: /(?:\[|\()required(?:\]|\))/i.test(description),
    negatable,
    description,
  };
  const defaultValue = extractDefault(description);
  const choices = extractChoices(description);
  if (defaultValue !== undefined) option.default = defaultValue;
  if (choices !== undefined) option.choices = choices;
  return option;
}

function parsePositionalToken(token) {
  const required = token.match(/^<([^>]+)>$/);
  const optional = token.match(/^\[([^\]]+)\]$/);
  const match = required ?? optional;
  if (!match) return null;
  const rawName = match[1];
  const name = rawName.replace(/\.\.\.$/, "");
  if (META_POSITIONALS.has(name.toLowerCase())) return null;
  return {
    name,
    required: Boolean(required),
    variadic: rawName.endsWith("..."),
  };
}

function parseUsagePositionals(usage) {
  const withoutOptionValues = usage.replace(
    /--?[A-Za-z0-9][\w-]*(?:(?:=|\s+)(?:<[^>]+>|\[[^\]]+\]))?/gu,
    "",
  );
  const tokens = withoutOptionValues.match(/<[^>]+>|\[[^\]]+\]/g) ?? [];
  const positionals = tokens.map(parsePositionalToken).filter(Boolean);
  const seen = new Set();
  return positionals.filter((positional) => {
    if (seen.has(positional.name)) return false;
    seen.add(positional.name);
    return true;
  });
}

function parseArgumentLine(line) {
  const { signature, description } = splitSignatureAndDescription(line);
  const token = signature.match(/<[^>]+>|\[[^\]]+\]|^[A-Za-z][\w-]*(?:\.\.\.)?/u)?.[0];
  if (!token) return null;
  const bracketed = parsePositionalToken(token);
  const rawName = bracketed?.name ?? token.replace(/\.\.\.$/, "");
  if (META_POSITIONALS.has(rawName.toLowerCase())) return null;
  return {
    name: rawName,
    required: bracketed?.required ?? !/\[optional\]/i.test(description),
    variadic: bracketed?.variadic ?? token.endsWith("..."),
  };
}

export function parseCommandLine(line) {
  const { signature, description } = splitSignatureAndDescription(line);
  if (!signature || signature.startsWith("-")) return null;
  const token = signature.split(/\s+/)[0];
  const names = token
    .split(/[|,]/)
    .map((name) => name.trim())
    .filter((name) => /^[\w][\w:.-]*$/u.test(name));
  if (names.length === 0) return null;
  return {
    name: names[0],
    aliases: names.slice(1),
    summary: description,
  };
}

function lineIndent(line) {
  return (line.match(/^\s*/u)?.[0] ?? "").replace(/\t/g, "    ").length;
}

function isSectionHeadingLine(line) {
  if (lineIndent(line) !== 0) return false;
  return /^[A-Za-z][A-Za-z0-9 _-]*:\s*$/u.test(line.trim());
}

function collapseWrappedLines(lines, parseEntry, isEntryStart) {
  const collapsed = [];
  let current = null;

  const flush = () => {
    if (current) collapsed.push(current.line);
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isSectionHeadingLine(line)) {
      flush();
      continue;
    }

    const indent = lineIndent(line);
    if (current && indent > current.indent && !isEntryStart(line)) {
      current.line = `${current.line.trimEnd()} ${trimmed}`;
      continue;
    }

    flush();
    if (isEntryStart(line) || parseEntry(line)) {
      current = { indent, line };
    }
  }
  flush();
  return collapsed;
}

function mergeOptions(options) {
  const merged = new Map();
  for (const option of options) {
    const existing = [...merged.values()].find((candidate) =>
      candidate.names.some((name) => option.names.includes(name)),
    );
    if (!existing) {
      merged.set(option.key, option);
      continue;
    }
    existing.names = [...new Set([...existing.names, ...option.names])];
    existing.key = chooseOptionKey(existing.names);
    existing.required ||= option.required;
    existing.negatable ||= option.negatable;
    existing.argument ??= option.argument;
    existing.description ||= option.description;
    existing.default ??= option.default;
    existing.choices ??= option.choices;
  }
  return [...merged.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function sectionForLine(line) {
  const trimmed = line.trim();
  if (!trimmed.endsWith(":")) return null;
  const heading = normalizeHeading(trimmed);
  const direct = SECTION_TYPES.get(heading);
  if (direct) return direct;
  if (/\b(?:options?|flags?)$/u.test(heading)) return "options";
  if (/\bcommands?$/u.test(heading)) return "commands";
  if (/\b(?:arguments?|positionals?)$/u.test(heading)) return "arguments";
  return null;
}

export function parseHelpText(helpText, context = {}) {
  const normalized = normalizeHelp(helpText);
  const lines = normalized.split("\n");
  const sections = { options: [], commands: [], arguments: [] };
  const preamble = [];
  let usage = "";
  let currentSection = null;
  let sawStructuredSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const usageMatch = trimmed.match(/^usage\s*:\s*(.*)$/i);
    if (usageMatch) {
      usage = usageMatch[1].trim();
      currentSection = "usage";
      sawStructuredSection = true;
      continue;
    }

    const section = sectionForLine(line);
    if (section) {
      currentSection = section;
      sawStructuredSection = true;
      continue;
    }

    if (isSectionHeadingLine(line)) {
      currentSection = null;
      continue;
    }

    if (!trimmed) {
      if (currentSection && currentSection !== "usage") {
        sections[currentSection].push("");
      }
      continue;
    }
    if (currentSection === "usage" && !usage) {
      usage = trimmed;
      continue;
    }
    if (currentSection && currentSection !== "usage") {
      sections[currentSection].push(line);
      continue;
    }
    if (!sawStructuredSection) preamble.push(trimmed);
  }

  const parsedOptions = collapseWrappedLines(
    sections.options,
    parseOptionLine,
    (line) => /^\s*-/u.test(line),
  )
    .map(parseOptionLine)
    .filter(Boolean);
  const commands = collapseWrappedLines(
    sections.commands,
    parseCommandLine,
    () => false,
  )
    .map(parseCommandLine)
    .filter(Boolean)
    .filter((command, index, all) =>
      all.findIndex((candidate) => candidate.name === command.name) === index,
    );
  const listedPositionals = collapseWrappedLines(
    sections.arguments,
    parseArgumentLine,
    () => false,
  )
    .map(parseArgumentLine)
    .filter(Boolean);
  const positionals = listedPositionals.length > 0
    ? listedPositionals
    : parseUsagePositionals(usage);

  const usageName = usage.match(/^([^\s[<]+)/)?.[1];
  const name = (context.path?.length ?? 0) > 0
    ? context.name ?? usageName ?? "cli"
    : usageName ?? context.name ?? "cli";
  const description = context.summary || preamble.join(" ");

  return {
    command: {
      name,
      path: [...(context.path ?? [])],
      usage,
      description,
      options: mergeOptions(parsedOptions),
      positionals,
      subcommands: [],
    },
    discoveredCommands: commands,
  };
}

function plural(count, word) {
  const suffix = /(?:s|x|z|ch|sh)$/u.test(word) ? "es" : "s";
  return `${count} ${word}${count === 1 ? "" : suffix}`;
}

function markdownEscape(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function formatText(result) {
  const lines = [
    `Required bump: ${result.requiredBump.toUpperCase()}`,
    `Changes: ${plural(result.summary.major, "major")}, ${plural(result.summary.minor, "minor")}, ${plural(result.summary.patch, "patch")}`,
  ];

  if (result.changes.length === 0) {
    lines.push("", "No public CLI changes detected.");
    return lines.join("\n");
  }

  lines.push("");
  for (const change of result.changes) {
    lines.push(
      `[${change.level.toUpperCase()}] ${change.code} — ${change.path}`,
      `  ${change.message}`,
    );
  }
  return lines.join("\n");
}

export function formatMarkdown(result) {
  const headline = result.requiredBump === "none"
    ? "No public CLI changes detected"
    : `Required SemVer bump: **${result.requiredBump.toUpperCase()}**`;
  const lines = [
    "## clisemver report",
    "",
    headline,
    "",
    `Summary: ${plural(result.summary.major, "major")}, ${plural(result.summary.minor, "minor")}, ${plural(result.summary.patch, "patch")}.`,
  ];

  if (result.changes.length === 0) return lines.join("\n");

  lines.push(
    "",
    "| Level | Code | Path | Details |",
    "| --- | --- | --- | --- |",
  );
  for (const change of result.changes) {
    lines.push(
      `| ${change.level.toUpperCase()} | \`${markdownEscape(change.code)}\` | \`${markdownEscape(change.path)}\` | ${markdownEscape(change.message)} |`,
    );
  }
  return lines.join("\n");
}

export function formatJson(result) {
  return JSON.stringify(result, null, 2);
}

export function formatResult(result, format = "text") {
  if (format === "text") return formatText(result);
  if (format === "markdown") return formatMarkdown(result);
  if (format === "json") return formatJson(result);
  throw new Error(`Unknown output format: ${format}`);
}

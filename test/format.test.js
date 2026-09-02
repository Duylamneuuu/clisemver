import assert from "node:assert/strict";
import test from "node:test";
import { formatJson, formatMarkdown, formatResult, formatText } from "../src/format.js";

const result = {
  requiredBump: "major",
  compatible: false,
  summary: { major: 1, minor: 0, patch: 0 },
  changes: [
    {
      level: "major",
      code: "option.removed",
      path: "demo --old",
      message: "Option --old was removed",
    },
  ],
};

test("formats human-readable text", () => {
  assert.match(formatText(result), /Required bump: MAJOR/u);
  assert.match(formatText(result), /option\.removed/u);
});

test("formats a Markdown table", () => {
  assert.match(formatMarkdown(result), /\| Level \| Code \|/u);
  assert.match(formatMarkdown(result), /\*\*MAJOR\*\*/u);
});

test("formats machine-readable JSON", () => {
  assert.deepEqual(JSON.parse(formatJson(result)), result);
  assert.equal(formatResult(result, "json"), formatJson(result));
});

test("rejects an unknown format", () => {
  assert.throws(() => formatResult(result, "xml"), /Unknown output format/u);
});

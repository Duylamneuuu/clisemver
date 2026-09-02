export type SemVerLevel = "none" | "patch" | "minor" | "major";

export interface ValueArgument {
  name: string;
  required: boolean;
  variadic: boolean;
}

export interface CliOption {
  key: string;
  names: string[];
  argument: ValueArgument | null;
  required: boolean;
  negatable: boolean;
  description: string;
  default?: string;
  choices?: string[];
}

export interface CliPositional {
  name: string;
  required: boolean;
  variadic: boolean;
}

export interface CliCommand {
  name: string;
  path: string[];
  usage: string;
  description: string;
  options: CliOption[];
  positionals: CliPositional[];
  subcommands: CliCommand[];
}

export interface CliSnapshot {
  schemaVersion: 1;
  command: string[];
  version: string | null;
  warnings: string[];
  root: CliCommand;
}

export interface CompatibilityChange {
  level: Exclude<SemVerLevel, "none">;
  code: string;
  path: string;
  message: string;
  before?: unknown;
  after?: unknown;
}

export interface DiffResult {
  requiredBump: SemVerLevel;
  compatible: boolean;
  summary: { major: number; minor: number; patch: number };
  changes: CompatibilityChange[];
}

export interface CaptureOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxDepth?: number;
  helpArgs?: string[];
  versionArgs?: string[] | null;
  env?: Record<string, string | undefined>;
}

export interface TargetResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

export interface ParsedHelp {
  command: CliCommand;
  discoveredCommands: Array<{ name: string; aliases: string[]; summary: string }>;
}

export const VERSION: string;
export const SNAPSHOT_SCHEMA_VERSION: 1;
export const CHANGE_LEVELS: readonly SemVerLevel[];

export function captureSnapshot(
  command: string[],
  options?: CaptureOptions,
): Promise<CliSnapshot>;
export function runTarget(
  command: string[],
  options?: CaptureOptions,
): Promise<TargetResult>;
export function diffSnapshots(before: CliSnapshot, after: CliSnapshot): DiffResult;
export function meetsThreshold(result: DiffResult, threshold?: SemVerLevel): boolean;
export function formatText(result: DiffResult): string;
export function formatMarkdown(result: DiffResult): string;
export function formatJson(result: DiffResult): string;
export function formatResult(
  result: DiffResult,
  format?: "text" | "markdown" | "json",
): string;
export function readSnapshot(filePath: string, cwd?: string): Promise<CliSnapshot>;
export function writeJsonFile(
  filePath: string,
  value: unknown,
  cwd?: string,
): Promise<string>;
export function stripAnsi(value: unknown): string;
export function normalizeHelp(value: unknown): string;
export function parseOptionLine(line: string): CliOption | null;
export function parseCommandLine(
  line: string,
): { name: string; aliases: string[]; summary: string } | null;
export function parseHelpText(
  helpText: string,
  context?: { name?: string; path?: string[]; summary?: string },
): ParsedHelp;
export function validateSnapshot(value: unknown): string[];
export function assertValidSnapshot(value: unknown): CliSnapshot;

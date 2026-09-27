import path from "node:path";
import { RuntimeBoundaryError } from "./errors.js";

export const DEFAULT_IGNORE_PATTERNS = [
  ".git/**",
  "**/.git/**",
  ".next/**",
  "**/.next/**",
  ".repobrain/**",
  "**/.repobrain/**",
  "node_modules/**",
  "**/node_modules/**",
  "dist/**",
  "**/dist/**",
  "coverage/**",
  "**/coverage/**",
  ".turbo/**",
  "**/.turbo/**",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock"
];

export const DEFAULT_SENSITIVE_PATH_PATTERNS = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/id_rsa",
  "id_rsa",
  "**/id_ed25519",
  "id_ed25519",
  "**/*.pem",
  "*.pem",
  "**/*.key",
  "*.key",
  "**/credentials.json",
  "credentials.json",
  "**/secrets.json",
  "secrets.json"
];

function normalizeForMatch(value: string): string {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

const compiledPatterns = new Map<string, RegExp>();
function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeForMatch(pattern);
  const cached = compiledPatterns.get(normalized);
  if (cached) return cached;
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "__DOUBLE_STAR__")
    .replaceAll("*", "[^/]*")
    .replaceAll("__DOUBLE_STAR__", ".*");
  const compiled = new RegExp(`^${escaped}$`);
  if (compiledPatterns.size >= 1024) compiledPatterns.clear();
  compiledPatterns.set(normalized, compiled);
  return compiled;
}

export function matchesPathPattern(relativePath: string, patterns: string[]): boolean {
  const normalized = normalizeForMatch(relativePath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

export function isIgnoredPath(relativePath: string, patterns: string[] = DEFAULT_IGNORE_PATTERNS): boolean {
  return matchesPathPattern(relativePath, DEFAULT_IGNORE_PATTERNS) || matchesPathPattern(relativePath, patterns);
}

export function isSensitivePath(
  relativePath: string,
  patterns: string[] = DEFAULT_SENSITIVE_PATH_PATTERNS
): boolean {
  return matchesPathPattern(relativePath, DEFAULT_SENSITIVE_PATH_PATTERNS) || matchesPathPattern(relativePath, patterns);
}

export function assertPathAllowed(params: {
  candidatePath: string;
  allowedRoots: string[];
  ignorePatterns?: string[];
  sensitivePathPatterns?: string[];
}): string {
  const resolvedCandidate = path.resolve(params.candidatePath);
  const matchedRoot = params.allowedRoots
    .map((root) => path.resolve(root))
    .find((root) => resolvedCandidate === root || resolvedCandidate.startsWith(`${root}${path.sep}`));

  if (!matchedRoot) {
    throw new RuntimeBoundaryError("PATH_OUTSIDE_ALLOWED_ROOTS", "Path is outside configured Cream Soda roots.");
  }

  const relativePath = normalizeForMatch(path.relative(matchedRoot, resolvedCandidate));

  if (isIgnoredPath(relativePath, params.ignorePatterns)) {
    throw new RuntimeBoundaryError("PATH_IGNORED", "Path matches Cream Soda ignored path policy.");
  }

  if (isSensitivePath(relativePath, params.sensitivePathPatterns)) {
    throw new RuntimeBoundaryError("PATH_SENSITIVE", "Path matches Cream Soda sensitive path policy.");
  }

  return resolvedCandidate;
}

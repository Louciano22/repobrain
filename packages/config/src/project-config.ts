import path from "node:path";
import type { RepoBrainLocalConfig } from "@repobrain/shared-types";

export function createDefaultProjectConfig(repoRoot: string): RepoBrainLocalConfig {
  const resolvedRoot = path.resolve(repoRoot);

  return {
    version: 1,
    homeDir: path.join(resolvedRoot, ".repobrain"),
    storagePath: path.join(resolvedRoot, ".repobrain", "store.json"),
    allowedRoots: [resolvedRoot],
    ignorePatterns: [
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
    ],
    sensitivePathPatterns: [
      ".env",
      ".env.*",
      "**/.env",
      "**/.env.*",
      "**/id_rsa",
      "**/id_ed25519",
      "**/*.pem",
      "**/*.key",
      "**/credentials.json",
      "**/secrets.json"
    ],
    tokenBudget: {
      defaultTokens: 12000,
      maxTokens: 24000
    },
    retrievalDepth: "standard",
    providers: []
  };
}

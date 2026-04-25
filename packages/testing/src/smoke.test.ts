import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "index.js");
const mcpPath = path.join(repoRoot, "apps", "mcp-server", "dist", "index.js");

function runNode(args: string[], cwd: string = repoRoot): string {
  return execFileSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runNodeFailure(args: string[], cwd: string = repoRoot): string {
  try {
    runNode(args, cwd);
  } catch (error) {
    const failed = error as { status?: number; stderr?: Buffer | string };
    assert.notEqual(failed.status, 0);
    return Buffer.isBuffer(failed.stderr) ? failed.stderr.toString("utf8") : String(failed.stderr ?? "");
  }
  throw new Error("Expected command to fail.");
}

function withTempRepo(run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "repobrain-smoke-"));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

withTempRepo((repo) => {
  fs.mkdirSync(path.join(repo, "packages", "providers", "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, "packages", "config", "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, "apps", "desktop-web", "app", "ui", "config"), { recursive: true });
  fs.mkdirSync(path.join(repo, "packages", "testing", "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repo, "index.ts"), "export function alpha() { return 1; }\n");
  fs.writeFileSync(
    path.join(repo, "packages", "providers", "src", "resolver.ts"),
    "export function addProvider(providerId: string) { return providerId; }\nexport function resolveProviderConfig() { return addProvider('local-embedding'); }\n"
  );
  fs.writeFileSync(
    path.join(repo, "packages", "providers", "src", "resolver.js"),
    "export function resolveProviderConfig() { return 'generated provider resolution artifact'; }\n"
  );
  fs.writeFileSync(
    path.join(repo, "packages", "providers", "src", "resolver.d.ts"),
    "export declare function resolveProviderConfig(): string;\n"
  );
  fs.writeFileSync(
    path.join(repo, "packages", "providers", "src", "registry.ts"),
    "export const providerRegistry = ['local-embedding'];\nexport function registerProvider() { return providerRegistry; }\n"
  );
  fs.writeFileSync(
    path.join(repo, "packages", "config", "src", "local-config.ts"),
    "export function writeProviderConfig() { return 'provider config'; }\n"
  );
  fs.writeFileSync(
    path.join(repo, "apps", "desktop-web", "app", "ui", "config", "page.tsx"),
    "export default function ConfigPage() { return 'add a new provider'; }\n"
  );
  fs.writeFileSync(
    path.join(repo, "packages", "testing", "src", "provider.test.ts"),
    "export const testProvider = 'add a new provider smoke test';\n"
  );
  fs.writeFileSync(path.join(repo, "docs", "providers.md"), "# Add a new provider\n");
  fs.writeFileSync(path.join(repo, ".env"), "TOKEN=sk-testsecretvalue1234567890\n");

  runNode([cliPath, "init", repo]);
  const firstIndex = runNode([cliPath, "index", repo]);
  const secondIndex = runNode([cliPath, "index", repo]);
  assert.match(firstIndex, /Files: 9/);
  assert.match(secondIndex, /Files: 9/);

  const storePath = path.join(repo, ".repobrain", "store.json");
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(store.tables.repo_files.some((file: { path: string }) => file.path === ".env"), false);

  const search = JSON.parse(runNode([mcpPath, "--tool", "search_code", "--repo", repo, "--session", "smoke", "--query", "alpha"]));
  assert.equal(search.ok, true);
  assert.equal(search.version, "mcp.v1");
  assert.equal(search.sessionId, "smoke");
  assert.equal(Boolean(search.meta.contract), true);

  runNode([cliPath, "config", "set-provider", "embedding", "local-embedding", repo]);
  const semanticSearch = JSON.parse(
    runNode([mcpPath, "--tool", "search_code", "--repo", repo, "--session", "smoke", "--query", "exported function"])
  );
  assert.equal(semanticSearch.ok, true);
  assert.equal(semanticSearch.data.semanticStatus, "used");

  const contextDefault = runNode([cliPath, "context", "add a new provider"], repo);
  assert.match(contextDefault, /Mode: balanced/);
  const contextBalanced = runNode([cliPath, "context", "add a new provider", "--mode", "balanced"], repo);
  assert.match(contextBalanced, /Mode: balanced/);
  assert.match(contextBalanced, /Why this pack:/);
  assert.match(contextBalanced, /Primary implementation files:/);
  assert.match(contextBalanced, /source-of-truth implementation file|provider resolution path/);
  assert.ok(contextBalanced.indexOf("packages/providers/src/resolver.ts") >= 0);
  const providerPosition = contextBalanced.indexOf("packages/providers/src/resolver.ts");
  const generatedPosition = contextBalanced.indexOf("packages/providers/src/resolver.js");
  const declarationPosition = contextBalanced.indexOf("packages/providers/src/resolver.d.ts");
  const uiPosition = contextBalanced.indexOf("apps/desktop-web/app/ui/config/page.tsx");
  const testPosition = contextBalanced.indexOf("packages/testing/src/provider.test.ts");
  if (generatedPosition >= 0) assert.ok(providerPosition < generatedPosition);
  if (declarationPosition >= 0) assert.ok(providerPosition < declarationPosition);
  if (uiPosition >= 0) assert.ok(providerPosition < uiPosition);
  if (testPosition >= 0) assert.ok(providerPosition < testPosition);
  const criticalPath = runNode([cliPath, "critical-path", "provider changes"], repo);
  assert.match(criticalPath, /RepoBrain critical path/);
  assert.match(criticalPath, /Query: provider changes/);
  assert.match(criticalPath, /factors=/);
  assert.match(criticalPath, /packages\/providers\/src\/resolver\.ts|packages\/providers\/src\/registry\.ts/);
  const criticalSourcePosition = criticalPath.indexOf("packages/providers/src/resolver.ts");
  const criticalGeneratedPosition = criticalPath.indexOf("packages/providers/src/resolver.js");
  const criticalDeclarationPosition = criticalPath.indexOf("packages/providers/src/resolver.d.ts");
  if (criticalGeneratedPosition >= 0) assert.ok(criticalSourcePosition < criticalGeneratedPosition);
  if (criticalDeclarationPosition >= 0) assert.ok(criticalSourcePosition < criticalDeclarationPosition);
  const trace = runNode([cliPath, "trace"], repo);
  assert.match(trace, /Recent events/);
  assert.match(trace, /effect:/);
  const invalidMode = runNodeFailure([cliPath, "context", "add a new provider", "--mode", "invalid"], repo);
  assert.match(invalidMode, /Invalid context mode: invalid/);

  fs.writeFileSync(path.join(repo, "index.ts"), "export function alpha() { return 2; }\n");
  const status = runNode([cliPath, "status", repo]);
  assert.match(status, /Stale: yes/);

  fs.writeFileSync(path.join(repo, ".repobrain", "config.json"), "{ bad json");
  const invalid = JSON.parse(runNode([mcpPath, "--tool", "index_codebase", "--repo", repo, "--session", "smoke"]));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "CONFIG_INVALID");
});

const missing = JSON.parse(
  runNode([mcpPath, "--tool", "index_codebase", "--repo", "/tmp/repobrain-smoke-missing-repo", "--session", "smoke"])
);
assert.equal(missing.ok, false);
assert.equal(missing.error.code, "REPO_NOT_FOUND");

console.log("RepoBrain smoke tests passed");

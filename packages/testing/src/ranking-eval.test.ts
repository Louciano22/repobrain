import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCriticalPath } from "@repobrain/graph";
import { indexCodebase } from "@repobrain/indexer";
import { searchCodebase } from "@repobrain/retrieval";
import type { CriticalPathHint, RetrievalResult, ScoreFactorKind } from "@repobrain/shared-types";
import { initializeProject } from "@repobrain/storage";
import { buildArchitectureMap } from "@repobrain/taxonomy";
import { evaluateRanking, type RankingCase } from "./benchmark.js";

function writeFile(repo: string, relativePath: string, content: string): void {
  const absolutePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function withEvalRepo(run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "repobrain-ranking-eval-"));
  try {
    writeFile(
      repo,
      "packages/providers/src/index.ts",
      "export { resolveProviderConfig } from './resolver';\nexport { providerRegistry } from './registry';\n"
    );
    writeFile(
      repo,
      "packages/providers/src/resolver.ts",
      "export function resolveProviderConfig(providerId: string) { return providerRegistry().find((provider) => provider === providerId); }\nexport function addProvider(providerId: string) { return resolveProviderConfig(providerId); }\nfunction providerRegistry() { return ['local-embedding', 'openai-compatible']; }\n"
    );
    writeFile(repo, "packages/providers/src/resolver.js", "export function resolveProviderConfig() { return 'generated artifact'; }\n");
    writeFile(repo, "packages/providers/src/resolver.d.ts", "export declare function resolveProviderConfig(providerId: string): string;\n");
    writeFile(
      repo,
      "packages/providers/src/registry.ts",
      "export const providerRegistry = ['local-embedding'];\nexport function registerProvider(providerId: string) { return [...providerRegistry, providerId]; }\n"
    );
    writeFile(repo, "packages/providers/src/secrets.ts", "export function readProviderSecret() { return process.env.REPOBRAIN_PROVIDER_KEY; }\n");
    writeFile(repo, "packages/providers/src/interfaces.ts", "export interface EmbeddingProvider { embed(input: string): number[]; }\n");
    writeFile(repo, "packages/config/src/local-config.ts", "export function loadRepoBrainConfig() { return { providers: [] }; }\nexport function parseConfig() { return loadRepoBrainConfig(); }\n");
    writeFile(repo, "packages/storage/src/project-store.ts", "export function writeLocalStore() { return 'schema'; }\nexport function readLocalStore() { return 'store'; }\n");
    writeFile(repo, "apps/mcp-server/src/index.ts", "export function callTool(name: string) { return `debug MCP tool ${name}`; }\n");
    writeFile(repo, "packages/session-memory/src/trace.ts", "export function appendSessionStep() { return 'trace retrieval events'; }\nexport function getSessionTrace() { return []; }\n");
    writeFile(repo, "packages/indexer/src/pipeline.ts", "export function extractSymbols() { return ['symbol']; }\nexport function indexCodebase() { return extractSymbols(); }\n");
    writeFile(repo, "apps/desktop-web/app/ui/config/page.tsx", "export default function ConfigPage() { return 'add a new provider'; }\n");
    writeFile(repo, "packages/testing/src/provider.test.ts", "export const providerSmokeTest = 'add a new provider';\n");
    writeFile(repo, "docs/providers.md", "# Add a new provider\n");

    initializeProject(repo);
    indexCodebase(repo);
    buildArchitectureMap(repo);
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function paths(results: RetrievalResult[]): string[] {
  return results.map((result) => result.chunk.path);
}

function expectInTop(results: RetrievalResult[], expectedPath: string, limit: number): void {
  assert.ok(paths(results).slice(0, limit).includes(expectedPath), `${expectedPath} should appear in top ${limit}. Got: ${paths(results).slice(0, limit).join(", ")}`);
}

function expectPathInTop(allPaths: string[], expectedPath: string, limit: number): void {
  assert.ok(allPaths.slice(0, limit).includes(expectedPath), `${expectedPath} should appear in top ${limit}. Got: ${allPaths.slice(0, limit).join(", ")}`);
}

function expectBefore(allPaths: string[], left: string, right: string): void {
  const leftIndex = allPaths.indexOf(left);
  const rightIndex = allPaths.indexOf(right);
  assert.ok(leftIndex >= 0, `${left} missing from result list.`);
  if (rightIndex >= 0) assert.ok(leftIndex < rightIndex, `${left} should rank before ${right}.`);
}

function expectFactor(result: RetrievalResult | CriticalPathHint, kind: ScoreFactorKind): void {
  const resultPath = "chunk" in result ? result.chunk.path : result.path;
  assert.ok(result.factors.some((factor) => factor.kind === kind), `${resultPath} should include factor ${kind}.`);
}

withEvalRepo((repo) => {
  const benchmarkCases: RankingCase[] = [];
  function record(id: string, query: string, relevantPaths: string[], results: RetrievalResult[]): void {
    benchmarkCases.push({ id, query, relevantPaths, retrievedPaths: paths(results) });
  }

  const providerAdd = searchCodebase({ repoRoot: repo, query: "add a new provider", limit: 10 }).results;
  record("add-provider", "add a new provider", ["packages/providers/src/resolver.ts", "packages/providers/src/registry.ts"], providerAdd);
  expectInTop(providerAdd, "packages/providers/src/resolver.ts", 3);
  expectInTop(providerAdd, "packages/providers/src/registry.ts", 5);
  expectBefore(paths(providerAdd), "packages/providers/src/resolver.ts", "apps/desktop-web/app/ui/config/page.tsx");
  expectBefore(paths(providerAdd), "packages/providers/src/resolver.ts", "packages/testing/src/provider.test.ts");

  const providerResolution = searchCodebase({ repoRoot: repo, query: "where is provider resolution handled", limit: 10 }).results;
  record("resolve-provider", "where is provider resolution handled", ["packages/providers/src/resolver.ts"], providerResolution);
  expectInTop(providerResolution, "packages/providers/src/resolver.ts", 3);
  expectBefore(paths(providerResolution), "packages/providers/src/resolver.ts", "packages/providers/src/resolver.js");
  expectBefore(paths(providerResolution), "packages/providers/src/resolver.ts", "packages/providers/src/resolver.d.ts");
  expectFactor(providerResolution[0]!, "path_role_match");
  expectFactor(providerResolution[0]!, "source_implementation");

  const storage = searchCodebase({ repoRoot: repo, query: "change storage schema", limit: 10 }).results;
  record("storage-schema", "change storage schema", ["packages/storage/src/project-store.ts"], storage);
  expectInTop(storage, "packages/storage/src/project-store.ts", 3);

  const mcp = searchCodebase({ repoRoot: repo, query: "debug MCP tool", limit: 10 }).results;
  record("debug-mcp", "debug MCP tool", ["apps/mcp-server/src/index.ts"], mcp);
  expectInTop(mcp, "apps/mcp-server/src/index.ts", 3);

  const config = searchCodebase({ repoRoot: repo, query: "config loading", limit: 10 }).results;
  record("config-loading", "config loading", ["packages/config/src/local-config.ts"], config);
  expectInTop(config, "packages/config/src/local-config.ts", 3);

  const trace = searchCodebase({ repoRoot: repo, query: "trace retrieval events", limit: 10 }).results;
  record("trace-retrieval", "trace retrieval events", ["packages/session-memory/src/trace.ts"], trace);
  expectInTop(trace, "packages/session-memory/src/trace.ts", 5);

  const indexing = searchCodebase({ repoRoot: repo, query: "index symbol extraction", limit: 10 }).results;
  record("index-symbols", "index symbol extraction", ["packages/indexer/src/pipeline.ts"], indexing);
  expectInTop(indexing, "packages/indexer/src/pipeline.ts", 3);

  const critical = getCriticalPath(repo, "provider changes").centralFiles;
  expectPathInTop(critical.map((hint) => hint.path), "packages/providers/src/resolver.ts", 5);
  const topProviderHint = critical.find((hint) => hint.path === "packages/providers/src/resolver.ts");
  assert.ok(topProviderHint);
  expectFactor(topProviderHint, "path_role_match");
  expectFactor(topProviderHint, "architecture_role");
  expectBefore(critical.map((hint) => hint.path), "packages/providers/src/resolver.ts", "packages/providers/src/resolver.js");
  expectBefore(critical.map((hint) => hint.path), "packages/providers/src/resolver.ts", "packages/providers/src/resolver.d.ts");

  const report = evaluateRanking("synthetic-provider-repo.v1", benchmarkCases, 5);
  assert.equal(report.caseCount, 7);
  assert.equal(report.hitRateAtK, 1, "Every synthetic query must return a relevant file in top five.");
  assert.ok(report.meanReciprocalRankAtK >= 0.85, "Synthetic MRR@5 regressed below the declared gate.");
  const repeated = searchCodebase({ repoRoot: repo, query: "where is provider resolution handled", limit: 10 }).results;
  assert.deepEqual(
    repeated.map((result) => ({ path: result.chunk.path, score: result.score, factors: result.factors })),
    providerResolution.map((result) => ({ path: result.chunk.path, score: result.score, factors: result.factors })),
    "Repeated retrieval must preserve rank, scores, and factors."
  );
  console.log(`CREAMSODA_BENCHMARK_JSON=${JSON.stringify(report)}`);
});

console.log("Cream Soda ranking evaluation passed");

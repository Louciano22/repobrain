#!/usr/bin/env node

import path from "node:path";
import { loadRepoBrainConfig, toSafeRepoBrainConfig, updateProviderConfigs } from "@repobrain/config";
import { toSafeRuntimeError } from "@repobrain/core";
import { getCriticalPath } from "@repobrain/graph";
import { getIndexHealth, indexCodebase } from "@repobrain/indexer";
import { getProviderRegistryEntry, resolveAllProviders } from "@repobrain/providers";
import { buildContextPack, searchCodebase } from "@repobrain/retrieval";
import { getSessionTrace } from "@repobrain/session-memory";
import type { CriticalPathHint, RepoChunkRecord, RetrievalResult, ScoreFactor, ShellCommand, TraceEventRecord } from "@repobrain/shared-types";
import { initializeProject, readLocalStore, resolveProjectPaths } from "@repobrain/storage";
import { buildArchitectureMap } from "@repobrain/taxonomy";

const commands: ShellCommand[] = [
  { name: "init", description: "Create a local RepoBrain config shell." },
  { name: "index", description: "Index a local repository into the RepoBrain store." },
  { name: "search", description: "Run local hybrid retrieval over the repo index." },
  { name: "context", description: "Generate a budgeted local context pack." },
  { name: "map", description: "Build and inspect local taxonomy and dependency map." },
  { name: "critical-path", description: "Generate dependency-aware critical-path hints." },
  { name: "trace", description: "Inspect local retrieval and session trace events." },
  { name: "config", description: "Inspect local runtime and provider configuration." },
  { name: "status", description: "Show local index and runtime status." }
];

process.on("uncaughtException", (error) => {
  const safe = toSafeRuntimeError(error);
  console.error(`RepoBrain error [${safe.code}]: ${safe.message}`);
  process.exit(1);
});

function printHelp() {
  console.log("RepoBrain CLI");
  console.log("");
  console.log("Usage:");
  console.log("  repobrain <command>");
  console.log("");
  console.log("Commands:");
  for (const command of commands) {
    console.log(`  ${command.name.padEnd(14)} ${command.description}`);
  }
}

function parseFlags(values: string[]): {
  positionals: string[];
  flags: Record<string, string | true>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) {
      if (value) positionals.push(value);
      continue;
    }

    const name = value.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      flags[name] = next;
      index += 1;
    } else {
      flags[name] = true;
    }
  }

  return { positionals, flags };
}

function stringFlag(flags: Record<string, string | true>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function printSection(title: string): void {
  console.log("");
  console.log(title);
}

function formatLocation(chunk: RepoChunkRecord): string {
  return `${chunk.path}:${chunk.startLine}-${chunk.endLine}`;
}

function fileGroup(filePath: string): "primary" | "supporting" | "integration" | "coverage" {
  if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("/testing/")) return "coverage";
  if (filePath.includes("/providers/") || filePath.includes("/retrieval/") || filePath.includes("/indexer/") || filePath.includes("/graph/")) return "primary";
  if (filePath.includes("/config/") || filePath.includes("/storage/") || filePath.includes("/core/") || filePath.includes("secrets")) return "supporting";
  return "integration";
}

function explainReason(reason: string): string {
  if (reason === "source implementation") return "source-of-truth implementation file";
  if (reason === "runtime secret boundary") return "runtime secret boundary";
  if (reason === "central config surface") return "central config surface";
  if (reason === "provider registration path") return "provider registration path";
  if (reason === "provider resolution path") return "provider resolution path";
  if (reason === "dependent consumer file") return "dependent consumer file";
  if (reason === "test coverage file" || reason === "test downranked") return "test coverage file";
  if (reason === "docs downranked") return "documentation file";
  if (reason === "ui display downranked" || reason === "route page downranked") return "UI display surface";
  if (reason.startsWith("role-match:")) return `architecture role match: ${reason.split(":")[1]}`;
  if (reason.startsWith("implementation role:")) return `implementation surface: ${reason.split(":")[1]}`;
  if (reason.startsWith("keyword:")) return `matched query term: ${reason.split(":")[1]}`;
  if (reason.startsWith("symbol:")) return `matched symbol: ${reason.split(":")[1]}`;
  if (reason.startsWith("semantic:")) return "local semantic similarity";
  if (reason === "exact phrase") return "exact phrase match";
  return reason;
}

function summarizeReasons(reasons: string[], limit: number = 3): string {
  return [...new Set(reasons.map(explainReason))].slice(0, limit).join("; ");
}

function summarizeFactors(factors: ScoreFactor[] | undefined, fallbackReasons: string[], limit: number = 3): string {
  if (!factors || factors.length === 0) return summarizeReasons(fallbackReasons, limit);
  return [...new Set(factors.map((factor) => factor.label))].slice(0, limit).join("; ");
}

function contextPackSummary(results: RetrievalResult[]): string {
  const groups = new Set(results.map((result) => fileGroup(result.chunk.path)));
  const parts: string[] = [];
  if (groups.has("primary")) parts.push("primary implementation files");
  if (groups.has("supporting")) parts.push("supporting config/runtime files");
  if (groups.has("integration")) parts.push("adjacent integration files");
  if (groups.has("coverage")) parts.push("test coverage files");
  return parts.length > 0 ? `Why this pack: selected ${parts.join(", ")} based on retrieval score, architecture role, and query match.` : "Why this pack: no matching chunks were selected.";
}

function printContextFileGroup(title: string, results: RetrievalResult[], group: ReturnType<typeof fileGroup>): void {
  const entries = results.filter((result) => fileGroup(result.chunk.path) === group);
  if (entries.length === 0) return;
  console.log(`${title}:`);
  for (const entry of entries) {
    console.log(`  - ${formatLocation(entry.chunk)} score=${entry.score}`);
    console.log(`    ${summarizeFactors(entry.factors, entry.reasons)}`);
  }
}

function criticalFactors(hint: CriticalPathHint): string[] {
  if (hint.factors.length > 0) {
    const factors: string[] = [];
    if (hint.factors.some((factor) => factor.kind === "query_relevance" || factor.kind === "path_role_match")) factors.push("query relevance");
    if (hint.factors.some((factor) => factor.kind === "dependency_centrality")) factors.push("dependency centrality");
    if (hint.factors.some((factor) => factor.kind === "architecture_role")) factors.push("architecture role");
    if (hint.factors.some((factor) => factor.kind === "risk")) factors.push("risk");
    if (hint.factors.some((factor) => factor.kind === "generated_artifact_penalty")) factors.push("generated artifact penalty");
    return factors.length > 0 ? factors : ["taxonomy signal"];
  }
  const factors: string[] = [];
  if (hint.reasons.some((reason) => reason.includes("query role match") || reason.includes("query path terms"))) factors.push("query relevance");
  if (hint.reasons.some((reason) => reason.includes("dependency centrality") || reason.includes("depend on this path"))) factors.push("dependency centrality");
  if (hint.reasons.some((reason) => reason.includes("architecture role"))) factors.push("architecture role");
  if (hint.zone === "danger" || hint.reasons.some((reason) => reason.includes("sensitive runtime"))) factors.push("risk");
  return factors.length > 0 ? factors : ["taxonomy signal"];
}

function printCriticalHint(hint: CriticalPathHint): void {
  console.log(`- ${hint.path}`);
  console.log(`  score=${hint.score} role=${hint.role} zone=${hint.zone} factors=${criticalFactors(hint).join(", ")}`);
  console.log(`  why: ${summarizeFactors(hint.factors, hint.reasons)}`);
  if (hint.adjacentDependencies.length > 0) console.log(`  adjacent: ${hint.adjacentDependencies.slice(0, 3).join(", ")}`);
}

function traceEffect(event: TraceEventRecord): string {
  const metadata = event.metadata ?? {};
  if (typeof metadata.resultCount === "number") return `${metadata.resultCount} results`;
  if (typeof metadata.tokenEstimate === "number" && typeof metadata.tokenBudget === "number") return `${metadata.tokenEstimate}/${metadata.tokenBudget} tokens`;
  if (typeof metadata.files === "number" && typeof metadata.edges === "number") return `${metadata.files} files, ${metadata.edges} edges`;
  return event.message;
}

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const knownCommand = commands.find((item) => item.name === command);

if (!knownCommand) {
  console.error(`Unknown RepoBrain command: ${command}`);
  printHelp();
  process.exit(1);
}

if (knownCommand.name === "init") {
  const repoRoot = path.resolve(args[0] ?? process.cwd());
  const result = initializeProject(repoRoot);

  console.log(result.created ? "RepoBrain project initialized" : "RepoBrain project already initialized");
  console.log(`Repo root: ${result.repoRoot}`);
  console.log(`Project dir: ${result.projectDir}`);
  console.log(`Config: ${result.configPath}`);
  console.log(`Store: ${result.storePath}`);
  process.exit(0);
}

if (knownCommand.name === "config") {
  if (args[0] === "set-provider") {
    const kind = args[1];
    const providerId = args[2];
    const repoRoot = path.resolve(args[3] ?? process.cwd());
    const secretEnvVar = args[4];
    if (!kind || !providerId) {
      console.error("Usage: repobrain config set-provider <embedding|reranker|model|vector> <providerId> [repoRoot] [secretEnvVar]");
      process.exit(1);
    }
    const registry = getProviderRegistryEntry(providerId);
    if (!registry || registry.kind !== kind) {
      console.error(`Provider ${providerId} is not registered for ${kind}.`);
      process.exit(1);
    }
    const projectPaths = resolveProjectPaths(repoRoot);
    const config = loadRepoBrainConfig({ configPath: projectPaths.configPath });
    const nextProviders = [
      ...(config.providers ?? []).filter((provider) => provider.kind !== registry.kind),
      {
        id: registry.id,
        kind: registry.kind,
        mode: registry.mode,
        displayName: registry.displayName,
        enabled: true,
        priority: 1,
        baseUrl: registry.defaultBaseUrl,
        model: registry.defaultModel,
        secretEnvVar
      }
    ];
    updateProviderConfigs(projectPaths.configPath, nextProviders);
    console.log(`Configured ${registry.kind} provider: ${registry.id}`);
    console.log(`Repo root: ${repoRoot}`);
    console.log(`Secret source: ${secretEnvVar ?? (registry.requiresSecret ? "missing" : "not-required")}`);
    process.exit(0);
  }

  const repoRoot = path.resolve(args[0] ?? process.cwd());
  const projectPaths = resolveProjectPaths(repoRoot);
  const config = loadRepoBrainConfig({ configPath: projectPaths.configPath });
  const safeConfig = toSafeRepoBrainConfig(config);
  const resolutions = resolveAllProviders(config);

  console.log("RepoBrain config");
  console.log(`Repo root: ${repoRoot}`);
  console.log(`Config: ${projectPaths.configPath}`);
  console.log(`Allowed roots: ${safeConfig.allowedRoots.length}`);
  console.log("Providers:");
  for (const provider of safeConfig.providers) {
    console.log(
      `  ${provider.kind.padEnd(9)} ${provider.id.padEnd(28)} ${provider.enabled ? "enabled" : "disabled"} ${provider.secretSource}`
    );
  }
  console.log("Resolution:");
  for (const [kind, resolution] of Object.entries(resolutions)) {
    const detail =
      resolution.status === "configured"
        ? resolution.activeProviderId
        : resolution.status === "missing"
          ? `missing (${resolution.defaultProviderId})`
          : `invalid (${resolution.providerId})`;
    console.log(`  ${kind.padEnd(9)} ${resolution.status} ${detail}`);
  }
  process.exit(0);
}

if (knownCommand.name === "index") {
  const repoRoot = path.resolve(args[0] ?? process.cwd());
  const result = indexCodebase(repoRoot);

  console.log("RepoBrain index complete");
  console.log(`Repo root: ${result.repoRoot}`);
  console.log(`Files: ${result.filesIndexed}`);
  console.log(`Chunks: ${result.chunksIndexed}`);
  console.log(`Symbols: ${result.symbolsIndexed}`);
  console.log(`Skipped: ${result.skippedPaths.length}`);
  process.exit(0);
}

if (knownCommand.name === "search") {
  const query = args[0];
  const repoRoot = path.resolve(args[1] ?? process.cwd());
  if (!query) {
    console.error("Usage: repobrain search <query> [repoRoot]");
    process.exit(1);
  }

  const result = searchCodebase({ repoRoot, query, limit: 8 });
  console.log("RepoBrain search");
  console.log(`Query: ${result.query}`);
  console.log(`Mode: ${result.mode}`);
  console.log(`Semantic: ${result.semanticStatus}`);
  console.log(`Results: ${result.results.length}`);
  printSection("Top matches");
  for (const [index, item] of result.results.entries()) {
    console.log(`${index + 1}. ${formatLocation(item.chunk)} score=${item.score}`);
    console.log(`   Why: ${summarizeFactors(item.factors, item.reasons)}`);
  }
  process.exit(0);
}

if (knownCommand.name === "context") {
  const parsed = parseFlags(args);
  const query = parsed.positionals[0];
  const repoRoot = path.resolve(stringFlag(parsed.flags, "repo") ?? process.cwd());
  const modeArg = stringFlag(parsed.flags, "mode") ?? "balanced";
  if (!query) {
    console.error("Usage: repobrain context <query> [--mode quick|balanced|deep] [--repo repoRoot]");
    process.exit(1);
  }
  if (modeArg !== "quick" && modeArg !== "balanced" && modeArg !== "deep") {
    console.error(`Invalid context mode: ${modeArg}. Expected one of: quick, balanced, deep.`);
    process.exit(1);
  }

  const result = buildContextPack({ repoRoot, query, mode: modeArg });
  console.log("RepoBrain context pack");
  console.log(`ID: ${result.pack.id}`);
  console.log(`Query: ${result.pack.query}`);
  console.log(`Mode: ${result.pack.mode}`);
  console.log(`Tokens: ${result.pack.tokenEstimate}/${result.pack.tokenBudget}`);
  console.log(`Files: ${result.pack.files.length}`);
  console.log(contextPackSummary(result.results));
  printSection("File groups");
  printContextFileGroup("Primary implementation files", result.results, "primary");
  printContextFileGroup("Supporting config/runtime files", result.results, "supporting");
  printContextFileGroup("Adjacent integration files", result.results, "integration");
  printContextFileGroup("Test coverage files", result.results, "coverage");
  printSection("Explanation");
  for (const item of result.pack.explanation) {
    console.log(`- ${item}`);
  }
  printSection("Context content");
  console.log(result.content);
  process.exit(0);
}

if (knownCommand.name === "map") {
  const repoRoot = path.resolve(args[0] ?? process.cwd());
  const result = buildArchitectureMap(repoRoot);

  console.log("RepoBrain architecture map");
  console.log(`Files: ${result.summary.files}`);
  console.log(`Zones: safe=${result.summary.safe} core=${result.summary.core} danger=${result.summary.danger}`);
  console.log(`Edges: ${result.edges.length}`);
  console.log("Roles:");
  for (const [role, count] of Object.entries(result.summary.roles).sort((left, right) => right[1] - left[1])) {
    console.log(`- ${role}: ${count}`);
  }
  console.log("Danger zone:");
  for (const label of result.labels.filter((item) => item.zone === "danger").slice(0, 12)) {
    console.log(`- ${label.path} (${label.role}) ${label.reasons.join("; ")}`);
  }
  process.exit(0);
}

if (knownCommand.name === "critical-path") {
  const parsed = parseFlags(args);
  const query = parsed.positionals.join(" ");
  const repoRoot = path.resolve(stringFlag(parsed.flags, "repo") ?? process.cwd());
  const result = getCriticalPath(repoRoot, query);

  console.log("RepoBrain critical path");
  if (query) console.log(`Query: ${query}`);
  console.log(`Generated: ${result.generatedAt}`);
  console.log(`Central files: ${result.centralFiles.length}`);
  console.log(`Likely blockers: ${result.likelyBlockers.length}`);
  console.log(`Risky files: ${result.riskyFiles.length}`);
  printSection("Central files");
  for (const hint of result.centralFiles.slice(0, 10)) {
    printCriticalHint(hint);
  }
  printSection("Likely blockers");
  for (const hint of result.likelyBlockers.slice(0, 8)) {
    console.log(`- ${hint.path}`);
    console.log(`  blockers=${hint.blockers.join(", ")}`);
    console.log(`  factors=${criticalFactors(hint).join(", ")}`);
  }
  printSection("Risky files");
  for (const hint of result.riskyFiles.slice(0, 8)) {
    console.log(`- ${hint.path}`);
    console.log(`  role=${hint.role} score=${hint.score} adjacent=${hint.adjacentDependencies.length}`);
  }
  process.exit(0);
}

if (knownCommand.name === "trace") {
  if (args[0] === "replay") {
    const repoRoot = path.resolve(args[1] ?? process.cwd());
    const result = getSessionTrace(repoRoot);
    const latestPack = result.contextPacks[0];
    if (!latestPack) {
      console.log("No context pack is available to replay.");
      process.exit(0);
    }
    const projectPaths = resolveProjectPaths(repoRoot);
    const store = readLocalStore(projectPaths.storePath);
    const chunks = (store.tables.repo_chunks as RepoChunkRecord[]).filter((chunk) => latestPack.chunkIds.includes(chunk.id));
    console.log("RepoBrain trace replay");
    console.log(`Context pack: ${latestPack.id}`);
    console.log(`Query: ${latestPack.query}`);
    console.log(`Mode: ${latestPack.mode}`);
    console.log(`Tokens: ${latestPack.tokenEstimate}/${latestPack.tokenBudget}`);
    printSection("Files");
    for (const file of latestPack.files) console.log(`- ${file}`);
    printSection("Explanation");
    for (const item of latestPack.explanation) console.log(`- ${item}`);
    printSection("Replayed content");
    for (const chunk of chunks) {
      console.log(`### ${chunk.path}:${chunk.startLine}-${chunk.endLine}`);
      console.log(chunk.content);
      console.log("");
    }
    process.exit(0);
  }

  const repoRoot = path.resolve(args[0] ?? process.cwd());
  const result = getSessionTrace(repoRoot);

  console.log("RepoBrain session trace");
  console.log(`Retrieval events: ${result.retrievalEvents.length}`);
  console.log(`Context packs: ${result.contextPacks.length}`);
  console.log(`Trace events: ${result.traceEvents.length}`);
  console.log(`Session steps: ${result.sessionSteps.length}`);
  printSection("Recent events");
  for (const event of result.traceEvents.slice(0, 12)) {
    console.log(`- ${event.createdAt}`);
    console.log(`  ${event.kind}/${event.action}`);
    console.log(`  effect: ${traceEffect(event)}`);
  }
  process.exit(0);
}

if (knownCommand.name === "status") {
  const repoRoot = path.resolve(args[0] ?? process.cwd());
  const projectPaths = resolveProjectPaths(repoRoot);
  const store = readLocalStore(projectPaths.storePath);
  const health = getIndexHealth(repoRoot);

  console.log("RepoBrain status");
  console.log(`Repo root: ${repoRoot}`);
  console.log(`Project dir: ${projectPaths.projectDir}`);
  console.log(`Files: ${store.tables.repo_files.length}`);
  console.log(`Chunks: ${store.tables.repo_chunks.length}`);
  console.log(`Symbols: ${store.tables.repo_symbols.length}`);
  console.log(`Context packs: ${store.tables.context_packs.length}`);
  console.log(`Indexed: ${health.indexed ? "yes" : "no"}`);
  console.log(`Stale: ${health.stale ? "yes" : "no"}`);
  if (health.staleReason) console.log(`Stale reason: ${health.staleReason}`);
  process.exit(0);
}

console.log(`RepoBrain ${knownCommand.name} shell`);
console.log(knownCommand.description);

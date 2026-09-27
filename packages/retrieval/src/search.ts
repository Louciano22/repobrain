import type {
  ContextPackRecord,
  ContextPackResult,
  ModelUsageEventRecord,
  RepoChunkRecord,
  RepoProjectRecord,
  RetrievalEventRecord,
  RetrievalResult,
  ScoreFactor,
  SessionRunRecord,
  SessionStepRecord,
  TraceEventRecord,
  SearchResult
} from "@repobrain/shared-types";
import { loadRepoBrainConfig } from "@repobrain/config";
import { resolveAllProviders } from "@repobrain/providers";
import { readLocalStore, resolveProjectPaths, writeLocalStore } from "@repobrain/storage";

const BUDGETS = {
  quick: 1200,
  balanced: 3600,
  deep: 9000
} as const;

const RETRIEVAL_EVENT_RETENTION_LIMIT = 500;
const CONTEXT_PACK_RETENTION_LIMIT = 100;
const MODEL_USAGE_RETENTION_LIMIT = 500;
const SESSION_RETENTION_LIMIT = 200;
const TRACE_RETENTION_LIMIT = 500;
const STOP_WORDS = new Set(["a", "an", "the", "is", "are", "was", "were", "where", "how", "what", "when", "why", "who", "handled", "handle", "add", "new"]);

function hashTerm(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function localEmbedding(input: string): number[] {
  const vector = Array.from({ length: 64 }, () => 0);
  for (const term of terms(input)) {
    const index = hashTerm(term) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  return vector;
}

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function semanticRuntime(repoRoot: string): {
  enabled: boolean;
  providerId: string;
  fallbackReason?: string;
} {
  try {
    const paths = resolveProjectPaths(repoRoot);
    const config = loadRepoBrainConfig({ configPath: paths.configPath });
    const embedding = resolveAllProviders(config).embedding;

    if (embedding.status !== "configured") {
      return {
        enabled: false,
        providerId: embedding.status === "missing" ? embedding.defaultProviderId : embedding.providerId,
        fallbackReason: embedding.reason
      };
    }

    if (embedding.provider.mode !== "local") {
      return {
        enabled: false,
        providerId: embedding.activeProviderId,
        fallbackReason: "Remote embedding adapters are not enabled in the local MVP runtime."
      };
    }

    return {
      enabled: true,
      providerId: embedding.activeProviderId
    };
  } catch (error) {
    return {
      enabled: false,
      providerId: "local-embedding",
      fallbackReason: error instanceof Error ? error.message : "Provider resolution failed safely."
    };
  }
}

function appendSessionMemory(params: {
  store: ReturnType<typeof readLocalStore>;
  projectId: string;
  kind: Extract<SessionStepRecord["kind"], TraceEventRecord["kind"]>;
  message: string;
  metadata?: Record<string, unknown>;
}): void {
  const now = new Date().toISOString();
  const run: SessionRunRecord = (params.store.tables.session_runs as SessionRunRecord[])[0] ?? {
    id: `run_${Date.now()}`,
    projectId: params.projectId,
    title: "Local Cream Soda session",
    startedAt: now
  };
  params.store.tables.session_runs = [
    run,
    ...(params.store.tables.session_runs as SessionRunRecord[]).filter((item) => item.id !== run.id)
  ];
  params.store.tables.session_steps = [
    ...params.store.tables.session_steps,
    {
      id: `step_${Date.now()}_${params.kind}`,
      projectId: params.projectId,
      runId: run.id,
      kind: params.kind,
      message: params.message,
      createdAt: now,
      metadata: params.metadata
    }
  ].slice(-SESSION_RETENTION_LIMIT);
  params.store.tables.trace_events = [
    ...params.store.tables.trace_events,
    {
      id: `trace_${Date.now()}_${params.kind}`,
      projectId: params.projectId,
      kind: params.kind,
      action: params.kind === "context_pack" ? "assemble_context_pack" : "search_code",
      message: params.message,
      createdAt: now,
      metadata: params.metadata
    } satisfies TraceEventRecord
  ].slice(-TRACE_RETENTION_LIMIT);
}

function terms(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function pathRole(filePath: string): string {
  if (filePath.includes("test") || filePath.includes("spec")) return "test";
  if (filePath.includes("/docs/") || filePath.endsWith(".md")) return "docs";
  if (filePath.includes("/ui/") || filePath.includes("app/") || filePath.endsWith(".tsx")) return "ui";
  if (filePath.includes("/shared-types/")) return "shared";
  if (filePath.includes("/providers/") || filePath.includes("provider") || filePath.includes("resolver") || filePath.includes("registry")) return "provider";
  if (filePath.includes("/config/") || filePath.includes("config")) return "config";
  if (filePath.includes("/storage/")) return "storage";
  if (filePath.includes("/retrieval/")) return "retrieval";
  if (filePath.includes("/indexer/")) return "indexer";
  if (filePath.includes("/graph/") || filePath.includes("critical-path")) return "graph";
  if (filePath.includes("/taxonomy/")) return "taxonomy";
  if (filePath.includes("/mcp-server/")) return "mcp";
  if (filePath.includes("/cli/")) return "cli";
  return "unknown";
}

function possibleSourcePaths(filePath: string): string[] {
  const candidates = new Set<string>();
  const addWithExtensions = (base: string) => {
    for (const extension of [".ts", ".tsx", ".mts", ".cts"]) candidates.add(`${base}${extension}`);
  };

  if (filePath.endsWith(".d.ts")) {
    const base = filePath.slice(0, -5);
    addWithExtensions(base);
    addWithExtensions(base.replace("/dist/", "/src/"));
  }

  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    const base = filePath.replace(/\.(mjs|cjs|js)$/, "");
    addWithExtensions(base);
    addWithExtensions(base.replace("/dist/", "/src/"));
  }

  return [...candidates].filter((candidate) => candidate !== filePath);
}

function hasSourceEquivalent(filePath: string, allPaths: Set<string>): boolean {
  return possibleSourcePaths(filePath).some((candidate) => allPaths.has(candidate));
}

function generatedArtifactRequested(queryTerms: string[]): boolean {
  return queryTerms.some((term) => ["dist", "build", "generated", "declaration", "declarations", "artifact", "artifacts"].includes(term));
}

function queryIntent(queryTerms: string[]): Set<string> {
  const intents = new Set<string>();
  if (queryTerms.some((term) => ["provider", "providers", "adapter", "adapters", "resolver", "registry", "reranker", "embedding"].includes(term))) {
    intents.add("provider");
    intents.add("config");
  }
  if (queryTerms.some((term) => ["config", "configuration", "env", "settings"].includes(term))) intents.add("config");
  if (queryTerms.some((term) => ["search", "retrieval", "context", "ranking", "rank"].includes(term))) intents.add("retrieval");
  if (queryTerms.some((term) => ["index", "indexing", "chunk", "symbol"].includes(term))) intents.add("indexer");
  if (queryTerms.some((term) => ["mcp", "agent", "tool", "tools"].includes(term))) intents.add("mcp");
  if (queryTerms.some((term) => ["cli", "command", "argument", "args"].includes(term))) intents.add("cli");
  if (queryTerms.some((term) => ["trace", "tracing", "session", "event", "events"].includes(term))) intents.add("session");
  if (queryTerms.some((term) => ["storage", "store", "schema", "project"].includes(term))) intents.add("storage");
  if (queryTerms.some((term) => ["test", "tests", "smoke", "spec"].includes(term))) intents.add("test");
  if (queryTerms.some((term) => ["docs", "readme", "documentation"].includes(term))) intents.add("docs");
  if (queryTerms.some((term) => ["ui", "page", "screen", "component"].includes(term))) intents.add("ui");
  return intents;
}

function scoreFactor(params: {
  kind: ScoreFactor["kind"];
  label: string;
  weight?: number;
  direction?: ScoreFactor["direction"];
  value?: ScoreFactor["value"];
}): ScoreFactor {
  return {
    kind: params.kind,
    label: params.label,
    weight: params.weight ?? 0,
    direction: params.direction ?? (params.weight && params.weight < 0 ? "penalty" : params.weight && params.weight > 0 ? "boost" : "signal"),
    value: params.value
  };
}

function factorReasons(factors: ScoreFactor[]): string[] {
  return [...new Set(factors.map((factor) => factor.label))];
}

function pathWeight(queryTerms: string[], chunk: RepoChunkRecord, allPaths: Set<string>): { score: number; factors: ScoreFactor[] } {
  const role = pathRole(chunk.path);
  const intents = queryIntent(queryTerms);
  const factors: ScoreFactor[] = [];
  let score = 0;

  if (intents.has(role)) {
    const weight = role === "provider" || role === "config" ? 22 : 14;
    score += weight;
    factors.push(scoreFactor({ kind: "path_role_match", label: `architecture role match: ${role}`, weight, value: role }));
  }

  if (chunk.path.includes("/src/")) {
    score += 8;
    factors.push(scoreFactor({ kind: "source_implementation", label: "source-of-truth implementation file", weight: 8 }));
  }

  if (chunk.path.includes("secrets") || chunk.path.includes("secret")) {
    factors.push(scoreFactor({ kind: "risk", label: "runtime secret boundary", value: "secret-boundary" }));
  }

  if (role === "config" && (chunk.path.includes("local-config") || chunk.path.includes("project-config") || chunk.path.includes("config"))) {
    factors.push(scoreFactor({ kind: "architecture_role", label: "central config surface", value: "config" }));
  }

  if (role === "provider" && chunk.path.includes("registry")) {
    factors.push(scoreFactor({ kind: "architecture_role", label: "provider registration path", value: "registry" }));
  }

  if (role === "provider" && chunk.path.includes("resolver")) {
    factors.push(scoreFactor({ kind: "architecture_role", label: "provider resolution path", value: "resolver" }));
  }

  if (["cli", "mcp", "ui"].includes(role)) {
    factors.push(scoreFactor({ kind: "architecture_role", label: "dependent consumer file", value: role }));
  }

  if (["provider", "config", "storage", "retrieval", "indexer", "graph", "taxonomy", "mcp", "cli", "session"].includes(role)) {
    score += 6;
    factors.push(scoreFactor({ kind: "architecture_role", label: `implementation surface: ${role}`, weight: 6, value: role }));
  }

  if ((intents.has("provider") || intents.has("config")) && ["ui", "cli", "mcp", "shared"].includes(role) && !intents.has(role)) {
    const weight = -(role === "ui" ? 75 : role === "shared" ? 70 : 35);
    score += weight;
    factors.push(scoreFactor({ kind: "consumer_downrank", label: "lower-value consumer file", weight, value: role }));
  }

  if (!intents.has("test") && role === "test") {
    score -= 90;
    factors.push(scoreFactor({ kind: "test_downrank", label: "test coverage file", weight: -90 }));
  }

  if (!intents.has("docs") && role === "docs") {
    score -= 50;
    factors.push(scoreFactor({ kind: "docs_downrank", label: "documentation file", weight: -50 }));
  }

  if (!intents.has("ui") && role === "ui" && (intents.has("provider") || intents.has("config") || intents.has("retrieval"))) {
    score -= 35;
    factors.push(scoreFactor({ kind: "ui_downrank", label: "UI display surface", weight: -35 }));
  }

  if (chunk.path.endsWith("page.tsx") && !intents.has("ui")) {
    score -= 12;
    factors.push(scoreFactor({ kind: "ui_downrank", label: "UI display surface", weight: -12, value: "route-page" }));
  }

  if (!generatedArtifactRequested(queryTerms) && hasSourceEquivalent(chunk.path, allPaths)) {
    score -= 80;
    factors.push(scoreFactor({ kind: "generated_artifact_penalty", label: "generated artifact with source equivalent", weight: -80 }));
  }

  return { score, factors };
}

function explainReason(reason: string): string {
  if (reason === "source implementation") return "source-of-truth implementation file";
  if (reason === "runtime secret boundary") return "runtime secret boundary";
  if (reason === "central config surface") return "central config surface";
  if (reason === "provider registration path") return "provider registration path";
  if (reason === "provider resolution path") return "provider resolution path";
  if (reason === "dependent consumer file") return "dependent consumer file";
  if (reason === "test downranked") return "test coverage file";
  if (reason === "docs downranked") return "documentation file";
  if (reason === "ui display downranked" || reason === "route page downranked") return "UI display surface";
  if (reason.endsWith("consumer downranked")) return "lower-value consumer file";
  if (reason === "generated artifact downranked") return "generated artifact with source equivalent";
  if (reason.startsWith("role-match:")) return `architecture role match:${reason.split(":")[1]}`;
  if (reason.startsWith("implementation role:")) return `implementation surface:${reason.split(":")[1]}`;
  if (reason.startsWith("keyword:")) return `matched query term:${reason.split(":")[1]}`;
  if (reason.startsWith("symbol:")) return `matched symbol:${reason.split(":")[1]}`;
  if (reason.startsWith("semantic:")) return "local semantic similarity";
  if (reason === "exact phrase") return "exact phrase match";
  return reason;
}

function explainReasons(reasons: string[]): string {
  return [...new Set(reasons.map(explainReason))].slice(0, 4).join(", ");
}

function uniqueResults(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.chunk.id)) return false;
    seen.add(result.chunk.id);
    return true;
  });
}

function scoreChunk(query: string, chunk: RepoChunkRecord, semanticEnabled: boolean, queryEmbedding: number[], allPaths: Set<string>): RetrievalResult | null {
  const queryTerms = terms(query);
  const haystack = `${chunk.path}\n${chunk.symbols.join(" ")}\n${chunk.content}`.toLowerCase();
  let score = 0;
  const factors: ScoreFactor[] = [];
  const pathScore = pathWeight(queryTerms, chunk, allPaths);
  score += pathScore.score;
  factors.push(...pathScore.factors);

  if (haystack.includes(query.toLowerCase())) {
    score += 20;
    factors.push(scoreFactor({ kind: "exact_phrase_match", label: "exact phrase match", weight: 20 }));
  }

  for (const term of queryTerms) {
    const matches = haystack.split(term).length - 1;
    if (matches > 0) {
      const weight = matches * 3;
      score += weight;
      factors.push(scoreFactor({ kind: "keyword_match", label: `matched query term: ${term}`, weight, value: term }));
    }
  }

  for (const symbol of chunk.symbols) {
    if (queryTerms.includes(symbol.toLowerCase())) {
      score += 12;
      factors.push(scoreFactor({ kind: "symbol_overlap", label: `matched symbol: ${symbol}`, weight: 12, value: symbol }));
    }
  }

  if (semanticEnabled) {
    const semanticScore = cosine(queryEmbedding, localEmbedding(haystack));
    if (semanticScore > 0.08) {
      const weight = Math.round(semanticScore * 18);
      score += weight;
      factors.push(scoreFactor({ kind: "semantic_similarity", label: "local semantic similarity", weight, value: Number(semanticScore.toFixed(3)) }));
    }
  }

  if (score === 0) return null;
  return { chunk, score, factors, reasons: factorReasons(factors) };
}

export function searchCodebase(params: {
  repoRoot?: string;
  query: string;
  limit?: number;
  mode?: "exact" | "hybrid";
}): SearchResult {
  const paths = resolveProjectPaths(params.repoRoot ?? process.cwd());
  const store = readLocalStore(paths.storePath);
  const chunks = store.tables.repo_chunks as RepoChunkRecord[];
  const allPaths = new Set(chunks.map((chunk) => chunk.path));
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];
  const mode = params.mode ?? "hybrid";
  const semantic = mode === "hybrid" ? semanticRuntime(paths.repoRoot) : { enabled: false, providerId: "exact", fallbackReason: "Exact mode requested." };
  const queryEmbedding = semantic.enabled ? localEmbedding(params.query) : [];
  const results = uniqueResults(
    chunks
      .map((chunk) => scoreChunk(params.query, chunk, semantic.enabled, queryEmbedding, allPaths))
      .filter((result): result is RetrievalResult => Boolean(result))
      .sort((left, right) => right.score - left.score)
  ).slice(0, params.limit ?? 10);

  const semanticStatus = semantic.enabled ? "used" : "fallback";
  const event: RetrievalEventRecord = {
    id: `ret_${Date.now()}`,
    projectId: project?.id ?? "unknown",
    query: params.query,
    mode,
    semanticStatus,
    resultCount: results.length,
    createdAt: new Date().toISOString()
  };
  store.tables.retrieval_events = [...store.tables.retrieval_events, event].slice(-RETRIEVAL_EVENT_RETENTION_LIMIT);
  store.tables.model_usage_events = [
    ...store.tables.model_usage_events,
    {
      id: `usage_${Date.now()}_embedding`,
      projectId: project?.id ?? "unknown",
      providerKind: "embedding",
      providerId: semantic.providerId,
      operation: "embedding",
      status: semanticStatus,
      fallbackReason: semantic.fallbackReason,
      createdAt: event.createdAt,
      metadata: { queryLength: params.query.length, chunkCount: chunks.length, resultCount: results.length }
    } satisfies ModelUsageEventRecord
  ].slice(-MODEL_USAGE_RETENTION_LIMIT);
  appendSessionMemory({
    store,
    projectId: project?.id ?? "unknown",
    kind: "retrieval",
    message: `Searched "${params.query}" and returned ${results.length} results.`,
    metadata: { mode, semanticStatus, providerId: semantic.providerId, fallbackReason: semantic.fallbackReason, resultCount: results.length }
  });
  writeLocalStore(paths.storePath, store);

  return {
    query: params.query,
    mode,
    semanticStatus,
    results
  };
}

export function buildContextPack(params: {
  repoRoot?: string;
  query: string;
  mode?: "quick" | "balanced" | "deep";
}): ContextPackResult {
  const mode = params.mode ?? "balanced";
  const tokenBudget = BUDGETS[mode];
  const search = searchCodebase({
    repoRoot: params.repoRoot,
    query: params.query,
    limit: mode === "quick" ? 4 : mode === "balanced" ? 8 : 16,
    mode: "hybrid"
  });
  const selected: RetrievalResult[] = [];
  let tokenEstimate = 0;

  for (const result of search.results) {
    if (tokenEstimate + result.chunk.tokenEstimate > tokenBudget && selected.length > 0) continue;
    selected.push(result);
    tokenEstimate += result.chunk.tokenEstimate;
  }

  const paths = resolveProjectPaths(params.repoRoot ?? process.cwd());
  const store = readLocalStore(paths.storePath);
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];
  const files = [...new Set(selected.map((result) => result.chunk.path))];
  const explanation = selected.map((result) => `${result.chunk.path}:${result.chunk.startLine}-${result.chunk.endLine} included for ${explainReasons(result.reasons)}`);
  const pack: ContextPackRecord = {
    id: `pack_${Date.now()}`,
    projectId: project?.id ?? "unknown",
    query: params.query,
    mode,
    tokenBudget,
    tokenEstimate,
    files,
    chunkIds: selected.map((result) => result.chunk.id),
    explanation,
    createdAt: new Date().toISOString()
  };

  store.tables.context_packs = [...store.tables.context_packs, pack].slice(-CONTEXT_PACK_RETENTION_LIMIT);
  appendSessionMemory({
    store,
    projectId: project?.id ?? "unknown",
    kind: "context_pack",
    message: `Built ${mode} context pack for "${params.query}" with ${selected.length} chunks.`,
    metadata: {
      contextPackId: pack.id,
      files: pack.files,
      tokenEstimate,
      tokenBudget
    }
  });
  writeLocalStore(paths.storePath, store);

  return {
    pack,
    results: selected,
    content: selected
      .map((result) => `### ${result.chunk.path}:${result.chunk.startLine}-${result.chunk.endLine}\n${result.chunk.content}`)
      .join("\n\n")
  };
}

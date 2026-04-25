import type {
  CriticalPathHint,
  CriticalPathResult,
  RepoDependencyEdgeRecord,
  RepoProjectRecord,
  RepoTaxonomyLabelRecord,
  ScoreFactor,
  TraceEventRecord
} from "@repobrain/shared-types";
import { readLocalStore, resolveProjectPaths, writeLocalStore } from "@repobrain/storage";
import { buildArchitectureMap } from "@repobrain/taxonomy";

const STOP_WORDS = new Set(["a", "an", "the", "is", "are", "was", "were", "where", "how", "what", "when", "why", "who", "handled", "handle", "add", "new"]);

function ensureMap(repoRoot: string) {
  const paths = resolveProjectPaths(repoRoot);
  const store = readLocalStore(paths.storePath);
  if (store.tables.repo_taxonomy_labels.length === 0 || store.tables.repo_dependency_edges.length === 0) {
    return buildArchitectureMap(repoRoot);
  }

  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];
  return {
    projectId: project?.id ?? "unknown",
    labels: store.tables.repo_taxonomy_labels as RepoTaxonomyLabelRecord[],
    edges: store.tables.repo_dependency_edges as RepoDependencyEdgeRecord[]
  };
}

function topByScore(hints: CriticalPathHint[], limit: number): CriticalPathHint[] {
  return hints.sort((left, right) => right.score - left.score).slice(0, limit);
}

function terms(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
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

function queryRoles(queryTerms: string[]): Set<RepoTaxonomyLabelRecord["role"]> {
  const roles = new Set<RepoTaxonomyLabelRecord["role"]>();
  if (queryTerms.some((term) => ["provider", "providers", "adapter", "adapters", "resolver", "registry", "reranker", "embedding"].includes(term))) {
    roles.add("provider");
    roles.add("config");
  }
  if (queryTerms.some((term) => ["config", "configuration", "env", "settings"].includes(term))) roles.add("config");
  if (queryTerms.some((term) => ["search", "retrieval", "context", "ranking", "rank"].includes(term))) roles.add("retrieval");
  if (queryTerms.some((term) => ["index", "indexing", "chunk", "symbol"].includes(term))) roles.add("indexer");
  if (queryTerms.some((term) => ["mcp", "agent", "tool", "tools"].includes(term))) roles.add("mcp");
  if (queryTerms.some((term) => ["cli", "command", "argument", "args"].includes(term))) roles.add("cli");
  if (queryTerms.some((term) => ["trace", "tracing", "session", "event", "events"].includes(term))) roles.add("session");
  if (queryTerms.some((term) => ["storage", "store", "schema", "project"].includes(term))) roles.add("storage");
  if (queryTerms.some((term) => ["test", "tests", "smoke", "spec"].includes(term))) roles.add("test");
  if (queryTerms.some((term) => ["docs", "readme", "documentation"].includes(term))) roles.add("docs");
  if (queryTerms.some((term) => ["ui", "page", "component", "screen"].includes(term))) roles.add("ui");
  return roles;
}

function queryFactors(params: {
  label: RepoTaxonomyLabelRecord;
  queryTerms: string[];
  roles: Set<RepoTaxonomyLabelRecord["role"]>;
}): { score: number; factors: ScoreFactor[] } {
  if (params.queryTerms.length === 0) return { score: 0, factors: [] };

  const normalizedPath = params.label.path.toLowerCase();
  const factors: ScoreFactor[] = [];
  let score = 0;

  if (params.roles.has(params.label.role)) {
    const weight = params.label.role === "provider" || params.label.role === "config" ? 24 : 14;
    score += weight;
    factors.push(scoreFactor({ kind: "path_role_match", label: `query role match: ${params.label.role}`, weight, value: params.label.role }));
  }

  const pathMatches = params.queryTerms.filter((term) => normalizedPath.includes(term));
  if (pathMatches.length > 0) {
    const weight = pathMatches.length * 7;
    score += weight;
    factors.push(scoreFactor({ kind: "query_relevance", label: `query path terms: ${pathMatches.join(",")}`, weight, value: pathMatches.join(",") }));
  }

  if (!params.roles.has("test") && params.label.role === "test") {
    score -= 18;
    factors.push(scoreFactor({ kind: "test_downrank", label: "test downranked for implementation query", weight: -18 }));
  }

  if (!params.roles.has("docs") && params.label.role === "docs") {
    score -= 14;
    factors.push(scoreFactor({ kind: "docs_downrank", label: "docs downranked for implementation query", weight: -14 }));
  }

  if (!params.roles.has("ui") && params.label.role === "ui" && (params.roles.has("provider") || params.roles.has("config") || params.roles.has("retrieval"))) {
    score -= 10;
    factors.push(scoreFactor({ kind: "ui_downrank", label: "ui display downranked for implementation query", weight: -10 }));
  }

  if (params.label.role === "unknown" && params.roles.size > 0) {
    score -= 14;
    factors.push(scoreFactor({ kind: "other", label: "unknown role downranked for role-specific query", weight: -14 }));
  }

  return { score, factors };
}

export function getCriticalPath(repoRoot: string = process.cwd(), query: string = ""): CriticalPathResult {
  const map = ensureMap(repoRoot);
  const paths = resolveProjectPaths(repoRoot);
  const store = readLocalStore(paths.storePath);
  const createdAt = new Date().toISOString();
  const queryTerms = terms(query);
  const roles = queryRoles(queryTerms);
  const allLabelPaths = new Set(map.labels.map((label) => label.path));
  const incoming = new Map<string, RepoDependencyEdgeRecord[]>();
  const outgoing = new Map<string, RepoDependencyEdgeRecord[]>();

  for (const edge of map.edges) {
    outgoing.set(edge.fromPath, [...(outgoing.get(edge.fromPath) ?? []), edge]);
    incoming.set(edge.toPath, [...(incoming.get(edge.toPath) ?? []), edge]);
  }

  const hints: CriticalPathHint[] = map.labels.map((label) => {
    const inbound = incoming.get(label.path) ?? [];
    const outbound = outgoing.get(label.path) ?? [];
    const adjacentDependencies = [...new Set([...inbound.map((edge) => edge.fromPath), ...outbound.map((edge) => edge.toPath)])].slice(0, 8);
    const blockers: string[] = [];
    const factors: ScoreFactor[] = [];
    const centralityScore = inbound.length * 4 + outbound.length * 2;
    const relevance = queryFactors({ label, queryTerms, roles });
    let score = centralityScore + relevance.score;

    if (centralityScore > 0) {
      factors.push(scoreFactor({ kind: "dependency_centrality", label: `dependency centrality:${centralityScore}`, weight: centralityScore, value: centralityScore }));
    }
    factors.push(...relevance.factors);

    if (!generatedArtifactRequested(queryTerms) && hasSourceEquivalent(label.path, allLabelPaths)) {
      score -= 80;
      factors.push(scoreFactor({ kind: "generated_artifact_penalty", label: "generated artifact downranked because matching source exists", weight: -80 }));
    }

    if (label.zone === "danger") {
      const weight = roles.has(label.role) ? 14 : 10;
      score += weight;
      blockers.push("danger-zone file");
      factors.push(scoreFactor({ kind: "risk", label: "sensitive runtime, config, provider, package, or agent entrypoint surface", weight, value: label.zone }));
    }

    if (["storage", "config", "provider", "mcp", "cli", "retrieval", "indexer"].includes(label.role)) {
      const weight = roles.has(label.role) ? 12 : 7;
      score += weight;
      blockers.push(`central role:${label.role}`);
      factors.push(scoreFactor({ kind: "architecture_role", label: `architecture role ${label.role} often blocks setup, runtime, or integration work`, weight, value: label.role }));
    }

    if (inbound.length > 2) {
      blockers.push(`${inbound.length} inbound dependencies`);
      factors.push(scoreFactor({ kind: "dependency_centrality", label: "many files depend on this path", value: inbound.length }));
    }

    if (outbound.length > 3) {
      blockers.push(`${outbound.length} adjacent dependencies`);
      factors.push(scoreFactor({ kind: "dependency_centrality", label: "this file coordinates multiple dependencies", value: outbound.length }));
    }

    return {
      path: label.path,
      score,
      zone: label.zone,
      role: label.role,
      blockers,
      adjacentDependencies,
      factors,
      reasons: factors.length > 0 ? factorReasons(factors) : label.reasons
    };
  });

  const result: CriticalPathResult = {
    projectId: map.projectId,
    generatedAt: createdAt,
    centralFiles: topByScore([...hints], 12),
    likelyBlockers: topByScore(hints.filter((hint) => hint.blockers.length > 0), 10),
    riskyFiles: topByScore(hints.filter((hint) => hint.zone === "danger"), 10)
  };

  const traceEvent: TraceEventRecord = {
    id: `trace_${Date.now()}_critical_path`,
    projectId: map.projectId,
    kind: "critical_path",
    action: "generate_hints",
    message: `Generated critical-path hints for ${hints.length} files.`,
    createdAt,
    metadata: {
      centralFiles: result.centralFiles.length,
      likelyBlockers: result.likelyBlockers.length,
      riskyFiles: result.riskyFiles.length
    }
  };
  store.tables.trace_events = [...store.tables.trace_events, traceEvent];
  writeLocalStore(paths.storePath, store);

  return result;
}

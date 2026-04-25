export type RepoBrainRoute =
  | "/"
  | "/docs"
  | "/ui"
  | "/ui/search"
  | "/ui/context-packs"
  | "/ui/repo-map"
  | "/ui/critical-path"
  | "/ui/session-trace"
  | "/ui/config";

export type RuntimeState = "loading" | "empty" | "error" | "success";

export type PackageStatus = {
  name: string;
  scope: "app" | "package";
  state: RuntimeState;
};

export type ShellCommand = {
  name: string;
  description: string;
};

export type McpToolShell = {
  name: string;
  description: string;
  implemented: boolean;
};

export type McpToolName =
  | "index_codebase"
  | "search_code"
  | "get_context_pack"
  | "get_architecture_map"
  | "get_critical_path"
  | "explain_retrieval"
  | "get_session_trace"
  | "get_index_status"
  | "clear_index";

export type McpToolInputField = {
  name: string;
  type: "string" | "number" | "enum";
  required: boolean;
  description: string;
  enumValues?: string[];
};

export type McpToolContract = {
  name: McpToolName;
  description: string;
  inputs: McpToolInputField[];
  output: string;
};

export type McpResponseEnvelope<T = unknown> =
  | {
      ok: true;
      version: "mcp.v1";
      tool: McpToolName;
      sessionId: string;
      requestId: string;
      data: T;
      meta: {
        repoRoot: string;
        generatedAt: string;
        explanation: string[];
        providerFallback?: string;
        contract: McpToolContract;
      };
    }
  | {
      ok: false;
      version: "mcp.v1";
      tool: McpToolName | "unknown";
      sessionId: string;
      requestId: string;
      error: {
        code: "INVALID_INPUT" | "TOOL_NOT_FOUND" | "LOCAL_STORE_NOT_FOUND" | "CONFIG_INVALID" | "REPO_NOT_FOUND" | "RUNTIME_ERROR";
        message: string;
      };
      meta: {
        repoRoot: string;
        generatedAt: string;
        explanation: string[];
        contract?: McpToolContract;
      };
    };

export type ProviderKind = "embedding" | "reranker" | "model" | "vector";

export type ProviderMode = "local" | "remote";

export type ProviderConfigRecord = {
  id: string;
  kind: ProviderKind;
  mode: ProviderMode;
  displayName: string;
  enabled: boolean;
  priority: number;
  baseUrl?: string;
  model?: string;
  secretEnvVar?: string;
};

export type ProviderRegistryEntry = {
  id: string;
  kind: ProviderKind;
  mode: ProviderMode;
  displayName: string;
  description: string;
  requiresSecret: boolean;
  defaultBaseUrl?: string;
  defaultModel?: string;
};

export type SafeProviderConfig = Omit<ProviderConfigRecord, "secretEnvVar"> & {
  hasSecret: boolean;
  secretSource: "env" | "not-required" | "missing";
};

export type ProviderResolution =
  | {
      status: "configured";
      kind: ProviderKind;
      provider: SafeProviderConfig;
      registry: ProviderRegistryEntry;
      activeProviderId: string;
    }
  | {
      status: "missing";
      kind: ProviderKind;
      defaultProviderId: string;
      reason: string;
    }
  | {
      status: "invalid";
      kind: ProviderKind;
      providerId: string;
      reason: string;
    };

export type RepoBrainLocalConfig = {
  version: 1;
  homeDir?: string;
  storagePath?: string;
  allowedRoots: string[];
  ignorePatterns?: string[];
  sensitivePathPatterns?: string[];
  tokenBudget?: {
    defaultTokens: number;
    maxTokens: number;
  };
  retrievalDepth?: "shallow" | "standard" | "deep";
  providers?: ProviderConfigRecord[];
};

export type SafeRepoBrainConfig = Omit<RepoBrainLocalConfig, "providers"> & {
  providers: SafeProviderConfig[];
};

export type RuntimeBoundaryCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "REPO_NOT_FOUND"
  | "PATH_OUTSIDE_ALLOWED_ROOTS"
  | "PATH_IGNORED"
  | "PATH_SENSITIVE"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_SECRET_MISSING"
  | "RATE_LIMITED"
  | "UNKNOWN_RUNTIME_ERROR";

export type SafeRuntimeError = {
  code: RuntimeBoundaryCode;
  message: string;
};

export type LocalAuditEvent = {
  type: "config" | "filesystem" | "provider" | "trace" | "safety";
  action: string;
  severity: "info" | "warn" | "error";
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type LocalStoreTable =
  | "repo_projects"
  | "repo_files"
  | "repo_chunks"
  | "repo_symbols"
  | "repo_taxonomy_labels"
  | "repo_dependency_edges"
  | "context_packs"
  | "session_runs"
  | "session_steps"
  | "provider_configs"
  | "retrieval_events"
  | "trace_events"
  | "model_usage_events";

export type RepoProjectRecord = {
  id: string;
  name: string;
  rootPath: string;
  configPath: string;
  storePath: string;
  createdAt: string;
  updatedAt: string;
};

export type RepoFileRecord = {
  id: string;
  projectId: string;
  path: string;
  absolutePath: string;
  language: string;
  sizeBytes: number;
  hash: string;
  indexedAt: string;
};

export type RepoChunkRecord = {
  id: string;
  projectId: string;
  fileId: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  tokenEstimate: number;
  symbols: string[];
};

export type RepoSymbolRecord = {
  id: string;
  projectId: string;
  fileId: string;
  path: string;
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "route";
  line: number;
};

export type RepoTaxonomyLabelRecord = {
  id: string;
  projectId: string;
  fileId: string;
  path: string;
  zone: "safe" | "core" | "danger";
  role:
    | "cli"
    | "config"
    | "docs"
    | "graph"
    | "indexer"
    | "mcp"
    | "observability"
    | "provider"
    | "retrieval"
    | "session"
    | "storage"
    | "taxonomy"
    | "test"
    | "ui"
    | "unknown";
  confidence: number;
  reasons: string[];
  createdAt: string;
};

export type RepoDependencyEdgeRecord = {
  id: string;
  projectId: string;
  fromPath: string;
  toPath: string;
  importSpec: string;
  kind: "workspace" | "relative" | "external";
  confidence: number;
  reasons: string[];
};

export type RetrievalEventRecord = {
  id: string;
  projectId: string;
  query: string;
  mode: "exact" | "hybrid";
  semanticStatus: "used" | "fallback";
  resultCount: number;
  createdAt: string;
};

export type ModelUsageEventRecord = {
  id: string;
  projectId: string;
  providerKind: ProviderKind;
  providerId: string;
  operation: "embedding" | "rerank" | "model" | "vector";
  status: "used" | "fallback";
  fallbackReason?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ContextPackRecord = {
  id: string;
  projectId: string;
  query: string;
  mode: "quick" | "balanced" | "deep";
  tokenBudget: number;
  tokenEstimate: number;
  files: string[];
  chunkIds: string[];
  explanation: string[];
  createdAt: string;
};

export type TraceEventRecord = {
  id: string;
  projectId: string;
  kind: "retrieval" | "context_pack" | "taxonomy" | "critical_path" | "cli" | "mcp";
  action: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type SessionRunRecord = {
  id: string;
  projectId: string;
  title: string;
  startedAt: string;
  endedAt?: string;
};

export type SessionStepRecord = {
  id: string;
  projectId: string;
  runId: string;
  kind: "retrieval" | "context_pack" | "taxonomy" | "critical_path" | "mcp" | "note";
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type IndexResult = {
  projectId: string;
  repoRoot: string;
  filesIndexed: number;
  chunksIndexed: number;
  symbolsIndexed: number;
  skippedPaths: Array<{ path: string; reason: string }>;
};

export type ScoreFactorKind =
  | "query_relevance"
  | "architecture_role"
  | "dependency_centrality"
  | "risk"
  | "path_role_match"
  | "keyword_match"
  | "exact_phrase_match"
  | "symbol_overlap"
  | "source_implementation"
  | "semantic_similarity"
  | "consumer_downrank"
  | "test_downrank"
  | "docs_downrank"
  | "ui_downrank"
  | "generated_artifact_penalty"
  | "other";

export type ScoreFactor = {
  kind: ScoreFactorKind;
  label: string;
  weight: number;
  direction: "boost" | "penalty" | "signal";
  value?: string | number | boolean;
};

export type RetrievalResult = {
  chunk: RepoChunkRecord;
  score: number;
  reasons: string[];
  factors: ScoreFactor[];
};

export type SearchResult = {
  query: string;
  mode: "exact" | "hybrid";
  semanticStatus: "used" | "fallback";
  results: RetrievalResult[];
};

export type ContextPackResult = {
  pack: ContextPackRecord;
  results: RetrievalResult[];
  content: string;
};

export type ArchitectureMapResult = {
  projectId: string;
  generatedAt: string;
  labels: RepoTaxonomyLabelRecord[];
  edges: RepoDependencyEdgeRecord[];
  summary: {
    files: number;
    safe: number;
    core: number;
    danger: number;
    roles: Record<string, number>;
  };
};

export type CriticalPathHint = {
  path: string;
  score: number;
  zone: RepoTaxonomyLabelRecord["zone"];
  role: RepoTaxonomyLabelRecord["role"];
  blockers: string[];
  adjacentDependencies: string[];
  reasons: string[];
  factors: ScoreFactor[];
};

export type CriticalPathResult = {
  projectId: string;
  generatedAt: string;
  centralFiles: CriticalPathHint[];
  likelyBlockers: CriticalPathHint[];
  riskyFiles: CriticalPathHint[];
};

export type SessionTraceResult = {
  projectId: string;
  retrievalEvents: RetrievalEventRecord[];
  contextPacks: ContextPackRecord[];
  traceEvents: TraceEventRecord[];
  sessionRuns: SessionRunRecord[];
  sessionSteps: SessionStepRecord[];
};

export type LocalStoreSnapshot = {
  version: 1;
  tables: Record<LocalStoreTable, unknown[]>;
};

export type ProjectInitResult = {
  initialized: true;
  created: boolean;
  repoRoot: string;
  projectDir: string;
  configPath: string;
  storePath: string;
  schemaPath: string;
  project: RepoProjectRecord;
};

export type ProjectOverviewState =
  | {
      initialized: false;
      repoRoot: string;
      projectDir: string;
    }
  | {
      initialized: true;
      repoRoot: string;
      projectDir: string;
      project: RepoProjectRecord;
      tableCounts: Record<LocalStoreTable, number>;
    };

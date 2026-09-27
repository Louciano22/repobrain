#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { toSafeRuntimeError } from "@repobrain/core";
import { getCriticalPath } from "@repobrain/graph";
import { getIndexHealth, indexCodebase } from "@repobrain/indexer";
import { buildContextPack, searchCodebase } from "@repobrain/retrieval";
import { appendSessionStep, getSessionTrace } from "@repobrain/session-memory";
import type { McpResponseEnvelope, McpToolContract, McpToolName, RepoChunkRecord } from "@repobrain/shared-types";
import { readLocalStore, resolveProjectPaths, writeLocalStore } from "@repobrain/storage";
import { buildArchitectureMap } from "@repobrain/taxonomy";

const execFileAsync = promisify(execFile);

const TOOL_CONTRACTS: Record<McpToolName, McpToolContract> = {
  index_codebase: {
    name: "index_codebase",
    description: "Index a local codebase into the project-local Cream Soda store.",
    inputs: [
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "IndexResult with file, chunk, symbol, and skipped-path counts."
  },
  search_code: {
    name: "search_code",
    description: "Run local hybrid code search with safe semantic fallback metadata.",
    inputs: [
      { name: "query", type: "string", required: true, description: "Search query, symbol, or task phrase." },
      { name: "limit", type: "number", required: false, description: "Maximum result count. Defaults to 10." },
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "SearchResult with scored chunks, file ranges, reasons, and semantic fallback status."
  },
  get_context_pack: {
    name: "get_context_pack",
    description: "Generate a budgeted context pack for an agent task.",
    inputs: [
      { name: "query", type: "string", required: true, description: "Task intent or retrieval query." },
      {
        name: "mode",
        type: "enum",
        required: false,
        description: "Token budget mode.",
        enumValues: ["quick", "balanced", "deep"]
      },
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "ContextPackResult with pack metadata, included chunks, explanations, and concatenated content."
  },
  get_architecture_map: {
    name: "get_architecture_map",
    description: "Return local taxonomy labels and dependency edges.",
    inputs: [
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "ArchitectureMapResult with safe/core/danger zones, roles, and dependency edges."
  },
  get_critical_path: {
    name: "get_critical_path",
    description: "Return central files, likely blockers, risky files, and adjacent dependency hints.",
    inputs: [
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "CriticalPathResult with explainable path hints."
  },
  explain_retrieval: {
    name: "explain_retrieval",
    description: "Return recent retrieval and context-pack trace metadata.",
    inputs: [
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "Recent retrieval events, context packs, and trace events relevant to agent context assembly."
  },
  get_session_trace: {
    name: "get_session_trace",
    description: "Return local session runs, steps, trace events, retrieval events, and context packs.",
    inputs: [
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "SessionTraceResult with local-first persisted trace data."
  },
  get_index_status: {
    name: "get_index_status",
    description: "Return local index counts and readiness flags.",
    inputs: [
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "Index status counts for files, chunks, symbols, context packs, and traces."
  },
  clear_index: {
    name: "clear_index",
    description: "Clear local index, generated context packs, taxonomy, graph, and trace data.",
    inputs: [
      { name: "repo", type: "string", required: false, description: "Repository root. Defaults to current working directory." },
      { name: "session", type: "string", required: false, description: "Explicit local MCP session id." }
    ],
    output: "Clear result with reset counts."
  }
};

const TOOL_NAMES = Object.keys(TOOL_CONTRACTS) as McpToolName[];

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requestId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isToolName(value: string | undefined): value is McpToolName {
  return Boolean(value && TOOL_NAMES.includes(value as McpToolName));
}

function writeEnvelope<T>(envelope: McpResponseEnvelope<T>): never {
  console.log(JSON.stringify(envelope, null, 2));
  process.exit(0);
}

function success<T>(params: {
  tool: McpToolName;
  sessionId: string;
  requestId: string;
  repoRoot: string;
  data: T;
  explanation: string[];
  providerFallback?: string;
}): McpResponseEnvelope<T> {
  return {
    ok: true,
    version: "mcp.v1",
    tool: params.tool,
    sessionId: params.sessionId,
    requestId: params.requestId,
    data: params.data,
    meta: {
      repoRoot: params.repoRoot,
      generatedAt: new Date().toISOString(),
      explanation: params.explanation,
      providerFallback: params.providerFallback,
      contract: TOOL_CONTRACTS[params.tool]
    }
  };
}

function failure(params: {
  tool: McpToolName | "unknown";
  sessionId: string;
  requestId: string;
  repoRoot: string;
  code: McpResponseEnvelope<never> extends infer Envelope
    ? Envelope extends { ok: false; error: { code: infer Code } }
      ? Code
      : never
    : never;
  message: string;
  explanation: string[];
}): McpResponseEnvelope<never> {
  return {
    ok: false,
    version: "mcp.v1",
    tool: params.tool,
    sessionId: params.sessionId,
    requestId: params.requestId,
    error: {
      code: params.code,
      message: params.message
    },
    meta: {
      repoRoot: params.repoRoot,
      generatedAt: new Date().toISOString(),
      explanation: params.explanation,
      contract: params.tool === "unknown" ? undefined : TOOL_CONTRACTS[params.tool]
    }
  };
}

function readStoreStatus(repoRoot: string) {
  const paths = resolveProjectPaths(repoRoot);
  const store = readLocalStore(paths.storePath);
  const health = getIndexHealth(repoRoot);
  return {
    paths,
    store,
    health,
    counts: {
      files: store.tables.repo_files.length,
      chunks: store.tables.repo_chunks.length,
      symbols: store.tables.repo_symbols.length,
      taxonomyLabels: store.tables.repo_taxonomy_labels.length,
      dependencyEdges: store.tables.repo_dependency_edges.length,
      contextPacks: store.tables.context_packs.length,
      retrievalEvents: store.tables.retrieval_events.length,
      traceEvents: store.tables.trace_events.length,
      sessionRuns: store.tables.session_runs.length,
      sessionSteps: store.tables.session_steps.length
    }
  };
}

function recordMcpStep(params: {
  repoRoot: string;
  sessionId: string;
  tool: McpToolName;
  message: string;
  metadata?: Record<string, unknown>;
}): void {
  try {
    appendSessionStep({
      repoRoot: params.repoRoot,
      sessionId: params.sessionId,
      kind: "mcp",
      action: params.tool,
      message: params.message,
      metadata: params.metadata
    });
  } catch {
    // Session linkage is best-effort when the local store is unavailable.
  }
}

function parseLimit(): number | undefined {
  const value = getArg("--limit");
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 50) : undefined;
}

function inputSchemaFor(contract: McpToolContract) {
  const properties = Object.fromEntries(
    contract.inputs.map((input) => [
      input.name,
      {
        type: input.type === "number" ? "number" : "string",
        description: input.description,
        ...(input.enumValues ? { enum: input.enumValues } : {})
      }
    ])
  );

  return {
    type: "object",
    properties,
    required: contract.inputs.filter((input) => input.required).map((input) => input.name),
    additionalProperties: false
  };
}

function argString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

async function runToolProcess(tool: McpToolName, args: Record<string, unknown>): Promise<McpResponseEnvelope> {
  const commandArgs = ["--tool", tool];
  const repo = argString(args.repo);
  const session = argString(args.session);
  const query = argString(args.query);
  const mode = argString(args.mode);
  const limit = argString(args.limit);

  if (repo) commandArgs.push("--repo", repo);
  if (session) commandArgs.push("--session", session);
  if (query) commandArgs.push("--query", query);
  if (mode) commandArgs.push("--mode", mode);
  if (limit) commandArgs.push("--limit", limit);

  const { stdout } = await execFileAsync(process.execPath, [path.resolve(process.argv[1] ?? "dist/index.js"), ...commandArgs], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  return JSON.parse(stdout) as McpResponseEnvelope;
}

async function startStdioServer(): Promise<void> {
  const server = new Server(
    {
      name: "cream-soda",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_NAMES.map((name) => ({
      name,
      description: TOOL_CONTRACTS[name].description,
      inputSchema: inputSchemaFor(TOOL_CONTRACTS[name])
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    if (!isToolName(toolName)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              failure({
                tool: "unknown",
                sessionId: "mcp-stdio",
                requestId: requestId(),
                repoRoot: process.cwd(),
                code: "TOOL_NOT_FOUND",
                message: `Unknown Cream Soda MCP tool: ${toolName}`,
                explanation: [`Available tools: ${TOOL_NAMES.join(", ")}`]
              }),
              null,
              2
            )
          }
        ]
      };
    }

    const envelope = await runToolProcess(toolName, (request.params.arguments ?? {}) as Record<string, unknown>);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(envelope, null, 2)
        }
      ],
      isError: !envelope.ok
    };
  });

  await server.connect(new StdioServerTransport());
}

if (process.argv.includes("--stdio")) {
  await startStdioServer();
}

const toolArg = getArg("--tool");
if (toolArg) {
  const repoRoot = path.resolve(getArg("--repo") ?? process.cwd());
  const sessionId = getArg("--session") ?? "mcp-local-default";
  const id = requestId();

  if (!isToolName(toolArg)) {
    writeEnvelope(
      failure({
        tool: "unknown",
        sessionId,
        requestId: id,
        repoRoot,
        code: "TOOL_NOT_FOUND",
        message: `Unknown Cream Soda MCP tool: ${toolArg}`,
        explanation: [`Available tools: ${TOOL_NAMES.join(", ")}`]
      })
    );
  }

  try {
    if (toolArg === "index_codebase") {
      const result = indexCodebase(repoRoot);
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: `Indexed ${result.filesIndexed} files for MCP session ${sessionId}.`,
        metadata: result
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: result,
          explanation: ["Indexing respects configured ignore and sensitive path rules.", "Results are persisted locally only."]
        })
      );
    }

    if (toolArg === "search_code") {
      const query = getArg("--query")?.trim();
      if (!query) {
        writeEnvelope(
          failure({
            tool: toolArg,
            sessionId,
            requestId: id,
            repoRoot,
            code: "INVALID_INPUT",
            message: "search_code requires --query.",
            explanation: ["Provide a symbol, phrase, or task intent with --query."]
          })
        );
      }
      const status = readStoreStatus(repoRoot);
      if (status.counts.chunks === 0) {
        writeEnvelope(
          success({
            tool: toolArg,
            sessionId,
            requestId: id,
            repoRoot,
            data: { query, mode: "hybrid", semanticStatus: "fallback", results: [] },
            providerFallback: "No semantic provider is configured; exact and keyword retrieval are the safe local fallback.",
            explanation: ["The repo has no indexed chunks yet. Run index_codebase before searching."]
          })
        );
      }
      const result = searchCodebase({ repoRoot, query, limit: parseLimit() });
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: `MCP search_code returned ${result.results.length} results for "${query}".`,
        metadata: { query, resultCount: result.results.length, semanticStatus: result.semanticStatus }
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: result,
          providerFallback:
            result.semanticStatus === "fallback"
              ? "No semantic provider is configured; exact and keyword retrieval were used."
              : undefined,
          explanation: [
            "Results include chunk content, file path, line range, score, and match reasons.",
            "Use get_context_pack for bounded task-ready context."
          ]
        })
      );
    }

    if (toolArg === "get_context_pack") {
      const query = getArg("--query")?.trim();
      if (!query) {
        writeEnvelope(
          failure({
            tool: toolArg,
            sessionId,
            requestId: id,
            repoRoot,
            code: "INVALID_INPUT",
            message: "get_context_pack requires --query.",
            explanation: ["Provide an agent task intent with --query."]
          })
        );
      }
      const modeArg = getArg("--mode");
      const mode = modeArg === "quick" || modeArg === "balanced" || modeArg === "deep" ? modeArg : "balanced";
      const status = readStoreStatus(repoRoot);
      if (status.counts.chunks === 0) {
        writeEnvelope(
          success({
            tool: toolArg,
            sessionId,
            requestId: id,
            repoRoot,
            data: {
              pack: null,
              results: [],
              content: ""
            },
            providerFallback: "No semantic provider is configured; context packs will use exact and keyword retrieval after indexing.",
            explanation: ["The repo has no indexed chunks yet. Run index_codebase before requesting a context pack."]
          })
        );
      }
      const result = buildContextPack({ repoRoot, query, mode });
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: `MCP get_context_pack built ${mode} pack ${result.pack.id}.`,
        metadata: { query, mode, packId: result.pack.id, files: result.pack.files }
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: {
            ...result,
            agentPayload: {
              query: result.pack.query,
              mode: result.pack.mode,
              tokenBudget: result.pack.tokenBudget,
              tokenEstimate: result.pack.tokenEstimate,
              files: result.pack.files,
              chunks: result.results.map((item) => ({
                id: item.chunk.id,
                path: item.chunk.path,
                startLine: item.chunk.startLine,
                endLine: item.chunk.endLine,
                score: item.score,
                reasons: item.reasons,
                content: item.chunk.content
              }))
            }
          },
          providerFallback: "No semantic provider is configured; exact and keyword retrieval were used.",
          explanation: result.pack.explanation
        })
      );
    }

    if (toolArg === "get_index_status") {
      const status = readStoreStatus(repoRoot);
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: "MCP get_index_status inspected local index counts.",
        metadata: status.counts
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: {
            repoRoot,
            indexed: status.counts.chunks > 0,
            stale: status.health.stale,
            staleReason: status.health.staleReason,
            indexedAt: status.health.indexedAt,
            ...status.counts
          },
          explanation: [
            "indexed is true when repo_chunks contains at least one chunk.",
            "stale is true when indexed files are missing or newer than the last index timestamp."
          ]
        })
      );
    }

    if (toolArg === "get_architecture_map") {
      const result = buildArchitectureMap(repoRoot);
      const agentMap = {
        ...result,
        labels: result.labels.slice(0, 60),
        edges: result.edges.slice(0, 80),
        truncated: result.labels.length > 60 || result.edges.length > 80,
        totalLabels: result.labels.length,
        totalEdges: result.edges.length
      };
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: `MCP get_architecture_map classified ${result.summary.files} files.`,
        metadata: result.summary
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: agentMap,
          explanation: [
            "Taxonomy is rules-based and derived from indexed file paths plus import edges.",
            "Large maps are truncated in MCP responses; use summary totals to detect truncation."
          ]
        })
      );
    }

    if (toolArg === "get_critical_path") {
      const result = getCriticalPath(repoRoot);
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: `MCP get_critical_path returned ${result.centralFiles.length} central files.`,
        metadata: {
          centralFiles: result.centralFiles.length,
          likelyBlockers: result.likelyBlockers.length,
          riskyFiles: result.riskyFiles.length
        }
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: result,
          explanation: ["Scores combine inbound dependencies, outbound dependencies, danger-zone labels, and central roles."]
        })
      );
    }

    if (toolArg === "get_session_trace") {
      const result = getSessionTrace(repoRoot);
      const agentTrace = {
        projectId: result.projectId,
        retrievalEvents: result.retrievalEvents.slice(0, 20),
        contextPacks: result.contextPacks.slice(0, 12),
        traceEvents: result.traceEvents.slice(0, 30).map((event) => ({
          id: event.id,
          kind: event.kind,
          action: event.action,
          message: event.message,
          createdAt: event.createdAt
        })),
        sessionRuns: result.sessionRuns.slice(0, 10),
        sessionSteps: result.sessionSteps.slice(0, 30).map((step) => ({
          id: step.id,
          runId: step.runId,
          kind: step.kind,
          message: step.message,
          createdAt: step.createdAt
        })),
        truncated:
          result.retrievalEvents.length > 20 ||
          result.contextPacks.length > 12 ||
          result.traceEvents.length > 30 ||
          result.sessionRuns.length > 10 ||
          result.sessionSteps.length > 30,
        totals: {
          retrievalEvents: result.retrievalEvents.length,
          contextPacks: result.contextPacks.length,
          traceEvents: result.traceEvents.length,
          sessionRuns: result.sessionRuns.length,
          sessionSteps: result.sessionSteps.length
        }
      };
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: agentTrace,
          explanation: [
            "Trace data is read from the local project store and includes retrieval, context, taxonomy, critical-path, and MCP events.",
            "Large traces are truncated in MCP responses; totals preserve full local counts."
          ]
        })
      );
    }

    if (toolArg === "explain_retrieval") {
      const trace = getSessionTrace(repoRoot);
      const latestPack = trace.contextPacks[0];
      const status = readStoreStatus(repoRoot);
      const replayChunks = latestPack
        ? (status.store.tables.repo_chunks as RepoChunkRecord[])
            .filter((chunk) => latestPack.chunkIds.includes(String(chunk.id)))
            .map((chunk) => ({
              id: chunk.id,
              path: chunk.path,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              content: chunk.content
            }))
        : [];
      const result = {
        retrievalEvents: trace.retrievalEvents.slice(0, 10),
        contextPacks: trace.contextPacks.slice(0, 10),
        traceEvents: trace.traceEvents.filter((event) => event.kind === "retrieval" || event.kind === "context_pack").slice(0, 12),
        replay: latestPack
          ? {
              contextPackId: latestPack.id,
              query: latestPack.query,
              mode: latestPack.mode,
              tokenBudget: latestPack.tokenBudget,
              tokenEstimate: latestPack.tokenEstimate,
              files: latestPack.files,
              explanation: latestPack.explanation,
              chunks: replayChunks
            }
          : null
      };
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: "MCP explain_retrieval returned recent retrieval and context-pack traces.",
        metadata: {
          retrievalEvents: result.retrievalEvents.length,
          contextPacks: result.contextPacks.length,
          traceEvents: result.traceEvents.length
        }
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: result,
          providerFallback: "Retrieval trace currently records exact/keyword fallback when semantic providers are missing.",
          explanation: ["Use these events to understand why files entered agent context packs."]
        })
      );
    }

    if (toolArg === "clear_index") {
      const paths = resolveProjectPaths(repoRoot);
      const store = readLocalStore(paths.storePath);
      const before = {
        files: store.tables.repo_files.length,
        chunks: store.tables.repo_chunks.length,
        symbols: store.tables.repo_symbols.length,
        contextPacks: store.tables.context_packs.length,
        taxonomyLabels: store.tables.repo_taxonomy_labels.length,
        dependencyEdges: store.tables.repo_dependency_edges.length
      };
      store.tables.repo_files = [];
      store.tables.repo_chunks = [];
      store.tables.repo_symbols = [];
      store.tables.context_packs = [];
      store.tables.retrieval_events = [];
      store.tables.repo_taxonomy_labels = [];
      store.tables.repo_dependency_edges = [];
      store.tables.trace_events = [];
      writeLocalStore(paths.storePath, store);
      recordMcpStep({
        repoRoot,
        sessionId,
        tool: toolArg,
        message: "MCP clear_index reset local index and feature-derived tables.",
        metadata: { before }
      });
      writeEnvelope(
        success({
          tool: toolArg,
          sessionId,
          requestId: id,
          repoRoot,
          data: { repoRoot, cleared: true, before },
          explanation: ["Project registration and config are preserved; index-derived tables are cleared."]
        })
      );
    }
  } catch (error) {
    const safe = toSafeRuntimeError(error);
    const message = safe.message;
    const code =
      safe.code === "CONFIG_NOT_FOUND"
        ? "LOCAL_STORE_NOT_FOUND"
        : safe.code === "CONFIG_INVALID"
          ? "CONFIG_INVALID"
          : safe.code === "REPO_NOT_FOUND"
            ? "REPO_NOT_FOUND"
            : "RUNTIME_ERROR";
    writeEnvelope(
      failure({
        tool: toolArg,
        sessionId,
        requestId: id,
        repoRoot,
        code,
        message,
        explanation: ["The error response is redacted and does not include provider secrets."]
      })
    );
  }
}

const port = process.env.REPOBRAIN_MCP_PORT ?? "4827";

console.log("Cream Soda MCP server shell");
console.log(`Mode: local feature shell`);
console.log(`Port: ${port}`);
console.log(JSON.stringify({ version: "mcp.v1", tools: TOOL_CONTRACTS }, null, 2));

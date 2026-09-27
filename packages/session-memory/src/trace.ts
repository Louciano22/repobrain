import type {
  ContextPackRecord,
  RepoProjectRecord,
  RetrievalEventRecord,
  SessionRunRecord,
  SessionStepRecord,
  SessionTraceResult,
  TraceEventRecord
} from "@repobrain/shared-types";
import { readLocalStore, resolveProjectPaths, writeLocalStore } from "@repobrain/storage";

const SESSION_RETENTION_LIMIT = 200;
const TRACE_RETENTION_LIMIT = 500;

export function appendSessionStep(params: {
  repoRoot?: string;
  sessionId?: string;
  kind: SessionStepRecord["kind"];
  message: string;
  action?: string;
  metadata?: Record<string, unknown>;
}): SessionStepRecord {
  const paths = resolveProjectPaths(params.repoRoot ?? process.cwd());
  const store = readLocalStore(paths.storePath);
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];
  if (!project) throw new Error("Cream Soda project record is missing from the local store.");

  const runId = params.sessionId ?? (store.tables.session_runs as SessionRunRecord[])[0]?.id ?? `run_${Date.now()}`;
  const run: SessionRunRecord = (store.tables.session_runs as SessionRunRecord[]).find((item) => item.id === runId) ?? {
    id: runId,
    projectId: project.id,
    title: params.sessionId ? `MCP session ${params.sessionId}` : "Local Cream Soda session",
    startedAt: new Date().toISOString()
  };
  const step: SessionStepRecord = {
    id: `step_${Date.now()}`,
    projectId: project.id,
    runId: run.id,
    kind: params.kind,
    message: params.message,
    createdAt: new Date().toISOString(),
    metadata: params.metadata
  };

  store.tables.session_runs = [run, ...(store.tables.session_runs as SessionRunRecord[]).filter((item) => item.id !== run.id)];
  store.tables.session_steps = [...store.tables.session_steps, step].slice(-SESSION_RETENTION_LIMIT);
  store.tables.trace_events = [
    ...store.tables.trace_events,
    {
      id: `trace_${Date.now()}_${params.kind}`,
      projectId: project.id,
      kind: params.kind === "mcp" ? "mcp" : params.kind === "note" ? "mcp" : params.kind,
      action: params.action ?? params.kind,
      message: params.message,
      createdAt: step.createdAt,
      metadata: params.metadata
    } satisfies TraceEventRecord
  ].slice(-TRACE_RETENTION_LIMIT);
  writeLocalStore(paths.storePath, store);
  return step;
}

export function getSessionTrace(repoRoot: string = process.cwd()): SessionTraceResult {
  const paths = resolveProjectPaths(repoRoot);
  const store = readLocalStore(paths.storePath);
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];

  return {
    projectId: project?.id ?? "unknown",
    retrievalEvents: [...(store.tables.retrieval_events as RetrievalEventRecord[])].reverse(),
    contextPacks: [...(store.tables.context_packs as ContextPackRecord[])].reverse(),
    traceEvents: [...(store.tables.trace_events as TraceEventRecord[])].reverse(),
    sessionRuns: [...(store.tables.session_runs as SessionRunRecord[])].reverse(),
    sessionSteps: [...(store.tables.session_steps as SessionStepRecord[])].reverse()
  };
}

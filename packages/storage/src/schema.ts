import type { LocalStoreSnapshot, LocalStoreTable } from "@repobrain/shared-types";

export const LOCAL_STORE_TABLES: LocalStoreTable[] = [
  "repo_projects",
  "repo_files",
  "repo_chunks",
  "repo_symbols",
  "repo_taxonomy_labels",
  "repo_dependency_edges",
  "context_packs",
  "session_runs",
  "session_steps",
  "provider_configs",
  "retrieval_events",
  "trace_events",
  "model_usage_events"
];

export function createEmptyLocalStore(): LocalStoreSnapshot {
  const tables = {} as Record<LocalStoreTable, unknown[]>;
  for (const table of LOCAL_STORE_TABLES) {
    tables[table] = [];
  }

  return {
    version: 1,
    tables
  };
}

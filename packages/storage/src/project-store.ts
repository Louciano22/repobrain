import fs from "node:fs";
import path from "node:path";
import { createDefaultProjectConfig } from "@repobrain/config/project-config";
import { RuntimeBoundaryError } from "@repobrain/core";
import type {
  LocalStoreSnapshot,
  LocalStoreTable,
  ProjectInitResult,
  ProjectOverviewState,
  RepoProjectRecord
} from "@repobrain/shared-types";
import { resolveProjectPaths } from "./paths.js";
import { createEmptyLocalStore, LOCAL_STORE_TABLES } from "./schema.js";

function stableProjectId(repoRoot: string): string {
  return `repo_${Buffer.from(path.resolve(repoRoot)).toString("base64url").slice(0, 16)}`;
}

function writeJsonIfMissing(filePath: string, value: unknown): boolean {
  if (fs.existsSync(filePath)) {
    return false;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return true;
}

export function readLocalStore(storePath: string): LocalStoreSnapshot {
  if (!fs.existsSync(storePath)) {
    throw new RuntimeBoundaryError("CONFIG_NOT_FOUND", `RepoBrain local store not found: ${storePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8")) as LocalStoreSnapshot;
  } catch {
    throw new RuntimeBoundaryError("CONFIG_INVALID", `RepoBrain local store is not valid JSON: ${storePath}`);
  }
}

export function writeLocalStore(storePath: string, store: LocalStoreSnapshot): void {
  const tempPath = `${storePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`);
  fs.renameSync(tempPath, storePath);
}

function ensureProjectRecord(params: {
  store: LocalStoreSnapshot;
  repoRoot: string;
  configPath: string;
  storePath: string;
}): RepoProjectRecord {
  const now = new Date().toISOString();
  const table = params.store.tables.repo_projects as RepoProjectRecord[];
  const existing = table.find((project) => project.rootPath === params.repoRoot);

  if (existing) {
    existing.updatedAt = now;
    return existing;
  }

  const project: RepoProjectRecord = {
    id: stableProjectId(params.repoRoot),
    name: path.basename(params.repoRoot),
    rootPath: params.repoRoot,
    configPath: params.configPath,
    storePath: params.storePath,
    createdAt: now,
    updatedAt: now
  };
  table.push(project);
  return project;
}

export function initializeProject(repoRoot: string = process.cwd()): ProjectInitResult {
  const paths = resolveProjectPaths(repoRoot);
  if (!fs.existsSync(paths.repoRoot) || !fs.statSync(paths.repoRoot).isDirectory()) {
    throw new RuntimeBoundaryError("REPO_NOT_FOUND", `RepoBrain repo root does not exist or is not a directory: ${paths.repoRoot}`);
  }

  fs.mkdirSync(paths.projectDir, { recursive: true });
  fs.mkdirSync(paths.tracesDir, { recursive: true });

  const createdConfig = writeJsonIfMissing(paths.configPath, createDefaultProjectConfig(paths.repoRoot));
  const createdSchema = writeJsonIfMissing(paths.schemaPath, {
    version: 1,
    tables: LOCAL_STORE_TABLES
  });
  const createdStore = writeJsonIfMissing(paths.storePath, createEmptyLocalStore());

  const store = readLocalStore(paths.storePath);
  const project = ensureProjectRecord({
    store,
    repoRoot: paths.repoRoot,
    configPath: paths.configPath,
    storePath: paths.storePath
  });
  writeLocalStore(paths.storePath, store);

  return {
    initialized: true,
    created: createdConfig || createdSchema || createdStore,
    repoRoot: paths.repoRoot,
    projectDir: paths.projectDir,
    configPath: paths.configPath,
    storePath: paths.storePath,
    schemaPath: paths.schemaPath,
    project
  };
}

export function getProjectOverview(repoRoot: string = process.cwd()): ProjectOverviewState {
  const paths = resolveProjectPaths(repoRoot);

  if (!fs.existsSync(paths.storePath)) {
    return {
      initialized: false,
      repoRoot: paths.repoRoot,
      projectDir: paths.projectDir
    };
  }

  const store = readLocalStore(paths.storePath);
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];

  if (!project) {
    return {
      initialized: false,
      repoRoot: paths.repoRoot,
      projectDir: paths.projectDir
    };
  }

  return {
    initialized: true,
    repoRoot: paths.repoRoot,
    projectDir: paths.projectDir,
    project,
    tableCounts: Object.fromEntries(
      LOCAL_STORE_TABLES.map((table: LocalStoreTable) => [table, store.tables[table].length])
    ) as Record<LocalStoreTable, number>
  };
}

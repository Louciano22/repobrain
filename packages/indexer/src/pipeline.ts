import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadRepoBrainConfig } from "@repobrain/config";
import {
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_SENSITIVE_PATH_PATTERNS,
  isIgnoredPath,
  isSensitivePath,
  redactText
} from "@repobrain/core";
import type {
  IndexResult,
  RepoDependencyEdgeRecord,
  RepoChunkRecord,
  RepoFileRecord,
  RepoProjectRecord,
  RepoSymbolRecord,
  RepoTaxonomyLabelRecord,
  RetrievalEventRecord,
  ContextPackRecord,
  TraceEventRecord
} from "@repobrain/shared-types";
import { initializeProject, readLocalStore, resolveProjectPaths, writeLocalStore } from "@repobrain/storage";

const TRACE_RETENTION_LIMIT = 500;

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

function hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function toRelative(root: string, candidate: string): string {
  return path.relative(root, candidate).replaceAll(path.sep, "/");
}

function readGitignore(root: string): string[] {
  const gitignorePath = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];
  return fs
    .readFileSync(gitignorePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => (line.endsWith("/") ? `${line}**` : line));
}

function languageFor(filePath: string): string {
  const ext = path.extname(filePath).replace(".", "");
  return ext || "text";
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.split(/\s+/).filter(Boolean).length * 1.3));
}

function discoverFiles(params: {
  root: string;
  ignorePatterns: string[];
  sensitivePathPatterns: string[];
}): { files: string[]; skipped: Array<{ path: string; reason: string }> } {
  const files: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = toRelative(params.root, absolute);

      if (isIgnoredPath(relative, params.ignorePatterns)) {
        skipped.push({ path: relative, reason: "ignored" });
        continue;
      }

      if (isSensitivePath(relative, params.sensitivePathPatterns)) {
        skipped.push({ path: relative, reason: "sensitive" });
        continue;
      }

      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(absolute);
      }
    }
  }

  walk(params.root);
  return { files, skipped };
}

function extractSymbols(params: {
  content: string;
  fileId: string;
  path: string;
  projectId: string;
}): RepoSymbolRecord[] {
  const symbols: RepoSymbolRecord[] = [];
  const patterns: Array<{ kind: RepoSymbolRecord["kind"]; pattern: RegExp }> = [
    { kind: "function", pattern: /\bfunction\s+([A-Za-z0-9_$]+)/ },
    { kind: "class", pattern: /\bclass\s+([A-Za-z0-9_$]+)/ },
    { kind: "interface", pattern: /\binterface\s+([A-Za-z0-9_$]+)/ },
    { kind: "type", pattern: /\btype\s+([A-Za-z0-9_$]+)/ },
    { kind: "const", pattern: /\bconst\s+([A-Za-z0-9_$]+)/ },
    { kind: "function", pattern: /\bexport\s+function\s+([A-Za-z0-9_$]+)/ }
  ];

  params.content.split(/\r?\n/).forEach((line, index) => {
    for (const item of patterns) {
      const match = item.pattern.exec(line);
      if (!match?.[1]) continue;
      symbols.push({
        id: `sym_${hash(`${params.path}:${index}:${match[1]}`)}`,
        projectId: params.projectId,
        fileId: params.fileId,
        path: params.path,
        name: match[1],
        kind: item.kind,
        line: index + 1
      });
      break;
    }
  });

  return symbols;
}

function chunkFile(params: {
  content: string;
  fileId: string;
  path: string;
  projectId: string;
  symbols: RepoSymbolRecord[];
}): RepoChunkRecord[] {
  const lines = params.content.split(/\r?\n/);
  const chunks: RepoChunkRecord[] = [];
  const chunkSize = 80;

  for (let start = 0; start < lines.length; start += chunkSize) {
    const selected = lines.slice(start, start + chunkSize);
    const content = selected.join("\n").trim();
    if (!content) continue;
    const startLine = start + 1;
    const endLine = start + selected.length;
    chunks.push({
      id: `chunk_${hash(`${params.path}:${startLine}:${endLine}:${content}`)}`,
      projectId: params.projectId,
      fileId: params.fileId,
      path: params.path,
      content,
      startLine,
      endLine,
      tokenEstimate: estimateTokens(content),
      symbols: params.symbols
        .filter((symbol) => symbol.line >= startLine && symbol.line <= endLine)
        .map((symbol) => symbol.name)
    });
  }

  return chunks;
}

function appendIndexTrace(params: {
  store: ReturnType<typeof readLocalStore>;
  projectId: string;
  message: string;
  metadata: Record<string, unknown>;
}): void {
  const trace = [
    ...(params.store.tables.trace_events as TraceEventRecord[]),
    {
      id: `trace_${Date.now()}_index`,
      projectId: params.projectId,
      kind: "mcp",
      action: "index_codebase",
      message: params.message,
      createdAt: new Date().toISOString(),
      metadata: params.metadata
    } satisfies TraceEventRecord
  ];
  params.store.tables.trace_events = trace.slice(-TRACE_RETENTION_LIMIT);
}

export function getIndexHealth(repoRoot: string = process.cwd()): {
  indexed: boolean;
  stale: boolean;
  staleReason?: string;
  indexedAt?: string;
  fileCount: number;
  chunkCount: number;
  symbolCount: number;
} {
  const paths = resolveProjectPaths(repoRoot);
  const store = readLocalStore(paths.storePath);
  const files = store.tables.repo_files as RepoFileRecord[];
  const chunks = store.tables.repo_chunks as RepoChunkRecord[];
  const symbols = store.tables.repo_symbols as RepoSymbolRecord[];
  const indexedAt = files.map((file) => file.indexedAt).sort().at(-1);

  if (files.length === 0 || chunks.length === 0) {
    return { indexed: false, stale: false, fileCount: files.length, chunkCount: chunks.length, symbolCount: symbols.length };
  }

  for (const file of files) {
    if (!fs.existsSync(file.absolutePath)) {
      return {
        indexed: true,
        stale: true,
        staleReason: `Indexed file is missing: ${file.path}`,
        indexedAt,
        fileCount: files.length,
        chunkCount: chunks.length,
        symbolCount: symbols.length
      };
    }

    if (indexedAt && fs.statSync(file.absolutePath).mtimeMs > Date.parse(indexedAt)) {
      return {
        indexed: true,
        stale: true,
        staleReason: `Indexed file changed after last index: ${file.path}`,
        indexedAt,
        fileCount: files.length,
        chunkCount: chunks.length,
        symbolCount: symbols.length
      };
    }
  }

  return {
    indexed: true,
    stale: false,
    indexedAt,
    fileCount: files.length,
    chunkCount: chunks.length,
    symbolCount: symbols.length
  };
}

export function indexCodebase(repoRoot: string = process.cwd()): IndexResult {
  const init = initializeProject(repoRoot);
  const config = loadRepoBrainConfig({ configPath: init.configPath });
  const store = readLocalStore(init.storePath);
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];
  if (!project) {
    throw new Error("Cream Soda project record is missing from the local store.");
  }
  const ignorePatterns = [...new Set([...DEFAULT_IGNORE_PATTERNS, ...(config.ignorePatterns ?? []), ...readGitignore(init.repoRoot)])];
  const sensitivePathPatterns = [...new Set([...DEFAULT_SENSITIVE_PATH_PATTERNS, ...(config.sensitivePathPatterns ?? [])])];
  const discovered = discoverFiles({ root: init.repoRoot, ignorePatterns, sensitivePathPatterns });
  const files: RepoFileRecord[] = [];
  const chunks: RepoChunkRecord[] = [];
  const symbols: RepoSymbolRecord[] = [];
  const indexedAt = new Date().toISOString();
  const previous = {
    files: store.tables.repo_files.length,
    chunks: store.tables.repo_chunks.length,
    symbols: store.tables.repo_symbols.length,
    contextPacks: store.tables.context_packs.length,
    retrievalEvents: store.tables.retrieval_events.length,
    taxonomyLabels: store.tables.repo_taxonomy_labels.length,
    dependencyEdges: store.tables.repo_dependency_edges.length
  };

  for (const absolutePath of discovered.files) {
    const relativePath = toRelative(init.repoRoot, absolutePath);
    const raw = fs.readFileSync(absolutePath, "utf8");
    const content = redactText(raw);
    const fileId = `file_${hash(relativePath)}`;
    const fileRecord: RepoFileRecord = {
      id: fileId,
      projectId: project.id,
      path: relativePath,
      absolutePath,
      language: languageFor(relativePath),
      sizeBytes: Buffer.byteLength(raw),
      hash: hash(content),
      indexedAt
    };
    const fileSymbols = extractSymbols({ content, fileId, path: relativePath, projectId: project.id });
    files.push(fileRecord);
    symbols.push(...fileSymbols);
    chunks.push(...chunkFile({ content, fileId, path: relativePath, projectId: project.id, symbols: fileSymbols }));
  }

  store.tables.repo_files = files;
  store.tables.repo_chunks = chunks;
  store.tables.repo_symbols = symbols;
  store.tables.context_packs = [] satisfies ContextPackRecord[];
  store.tables.retrieval_events = [] satisfies RetrievalEventRecord[];
  store.tables.repo_taxonomy_labels = [] satisfies RepoTaxonomyLabelRecord[];
  store.tables.repo_dependency_edges = [] satisfies RepoDependencyEdgeRecord[];
  appendIndexTrace({
    store,
    projectId: project.id,
    message: `Indexed ${files.length} files and invalidated stale derived index data.`,
    metadata: {
      previous,
      filesIndexed: files.length,
      chunksIndexed: chunks.length,
      symbolsIndexed: symbols.length,
      skippedPaths: discovered.skipped.length
    }
  });
  writeLocalStore(init.storePath, store);

  return {
    projectId: project.id,
    repoRoot: init.repoRoot,
    filesIndexed: files.length,
    chunksIndexed: chunks.length,
    symbolsIndexed: symbols.length,
    skippedPaths: discovered.skipped
  };
}

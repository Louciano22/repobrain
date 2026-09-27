import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDefaultProjectConfig, loadRepoBrainConfig } from "@repobrain/config";
import {
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_SENSITIVE_PATH_PATTERNS,
  RuntimeBoundaryError,
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
const MAX_FILES = 20000;
const MAX_ENTRIES = 50000;
const MAX_DEPTH = 40;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_GITIGNORE_BYTES = 128 * 1024;
const MAX_CONFIG_BYTES = 128 * 1024;

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

function readBoundedRegularFile(filePath: string, maxBytes: number): Buffer {
  // The descriptor and fstat refer to the same file. O_NOFOLLOW rejects a final-component symlink.
  const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
  let descriptor: number;
  try { descriptor = fs.openSync(filePath, flags); } catch {
    throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda input is not a safe regular file.");
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maxBytes) {
      throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda input exceeds the safe file boundary.");
    }
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    if (offset > maxBytes) {
      throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda input exceeds the safe file boundary.");
    }
    return buffer.subarray(0, offset);
  } catch (error) {
    if (error instanceof RuntimeBoundaryError) throw error;
    throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda input could not be read safely.");
  } finally {
    fs.closeSync(descriptor);
  }
}

function assertSafeIndexRoot(root: string): void {
  // Reject symlinked ancestors as well as a symlinked root before initializeProject writes.
  let candidate = path.resolve(root);
  for (;;) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(candidate); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new RuntimeBoundaryError("REPO_NOT_FOUND", "Cream Soda repo root does not exist.");
      }
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new RuntimeBoundaryError("PATH_OUTSIDE_ALLOWED_ROOTS", "Cream Soda root must be a real directory.");
    }
    if (candidate === path.dirname(candidate)) break;
    candidate = path.dirname(candidate);
  }

  const projectDir = path.join(root, ".repobrain");
  let projectStat: fs.Stats;
  try { projectStat = fs.lstatSync(projectDir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!projectStat.isDirectory() || projectStat.isSymbolicLink()) {
    throw new RuntimeBoundaryError("PATH_OUTSIDE_ALLOWED_ROOTS", "Cream Soda project directory is unsafe.");
  }
  for (const entry of ["config.json", "store.json", "store.json.tmp", "schema.json", "traces"]) {
    const candidatePath = path.join(projectDir, entry);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(candidatePath); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink() || (entry === "traces" ? !stat.isDirectory() : !stat.isFile())) {
      throw new RuntimeBoundaryError("PATH_OUTSIDE_ALLOWED_ROOTS", "Cream Soda project storage entry is unsafe.");
    }
  }
}

function readGitignore(root: string): string[] {
  const gitignorePath = path.join(root, ".gitignore");
  try { fs.lstatSync(gitignorePath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const patterns = readBoundedRegularFile(gitignorePath, MAX_GITIGNORE_BYTES)
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => (line.endsWith("/") ? `${line}**` : line));
  if (patterns.length > 256 || patterns.some((pattern) => pattern.length > 512)) {
    throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda ignore pattern budget exceeded.");
  }
  return patterns;
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
  let entries = 0;

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH) throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda traversal depth exceeded.");
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(dir) !== dir) {
      throw new RuntimeBoundaryError("PATH_OUTSIDE_ALLOWED_ROOTS", "Cream Soda source directory is unsafe.");
    }
    const handle = fs.opendirSync(dir);
    try {
      let entry: fs.Dirent | null;
      while ((entry = handle.readSync()) !== null) {
      if (++entries > MAX_ENTRIES) throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda traversal budget exceeded.");
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
        walk(absolute, depth + 1);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        if (files.length >= MAX_FILES) throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda file budget exceeded.");
        files.push(absolute);
      } else if (entry.isSymbolicLink()) {
        skipped.push({ path: relative, reason: "symlink" });
      }
      }
    } finally {
      handle.closeSync();
    }
  }

  walk(params.root, 0);
  files.sort();
  skipped.sort((a, b) => a.path.localeCompare(b.path, "en"));
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
  assertSafeIndexRoot(repoRoot);
  const paths = resolveProjectPaths(repoRoot);
  if (fs.existsSync(paths.configPath) && fs.lstatSync(paths.configPath).size > MAX_CONFIG_BYTES) {
    throw new RuntimeBoundaryError("CONFIG_INVALID", "Cream Soda config budget exceeded.");
  }
  const config = fs.existsSync(paths.configPath)
    ? loadRepoBrainConfig({ configPath: paths.configPath })
    : createDefaultProjectConfig(paths.repoRoot);
  if (!Array.isArray(config.ignorePatterns) || !Array.isArray(config.sensitivePathPatterns)) {
    throw new RuntimeBoundaryError("CONFIG_INVALID", "Cream Soda path policies must be arrays.");
  }
  const ignorePatterns = [...new Set([...DEFAULT_IGNORE_PATTERNS, ...config.ignorePatterns, ...readGitignore(paths.repoRoot)])];
  const sensitivePathPatterns = [...new Set([...DEFAULT_SENSITIVE_PATH_PATTERNS, ...config.sensitivePathPatterns])];
  if (ignorePatterns.length > 400 || sensitivePathPatterns.length > 128 ||
      [...ignorePatterns, ...sensitivePathPatterns].some((pattern) => typeof pattern !== "string" || pattern.length > 512)) {
    throw new RuntimeBoundaryError("CONFIG_INVALID", "Cream Soda path pattern budget exceeded.");
  }
  const discovered = discoverFiles({ root: paths.repoRoot, ignorePatterns, sensitivePathPatterns });
  const input: Array<{ absolutePath: string; relativePath: string; raw: string; sizeBytes: number }> = [];
  let totalReadBytes = 0;
  for (const absolutePath of discovered.files) {
    const relativePath = toRelative(paths.repoRoot, absolutePath);
    if (isIgnoredPath(relativePath, ignorePatterns) || isSensitivePath(relativePath, sensitivePathPatterns)) continue;
    const parent = path.dirname(absolutePath);
    let candidate = parent;
    while (candidate !== paths.repoRoot) {
      const stat = fs.lstatSync(candidate);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new RuntimeBoundaryError("PATH_OUTSIDE_ALLOWED_ROOTS", "Cream Soda source directory is unsafe.");
      }
      candidate = path.dirname(candidate);
    }
    if (fs.realpathSync(parent) !== parent) {
      throw new RuntimeBoundaryError("PATH_OUTSIDE_ALLOWED_ROOTS", "Cream Soda source directory is unsafe.");
    }
    const data = readBoundedRegularFile(absolutePath, MAX_SOURCE_BYTES);
    totalReadBytes += data.byteLength;
    if (totalReadBytes > MAX_TOTAL_SOURCE_BYTES) {
      throw new RuntimeBoundaryError("PATH_IGNORED", "Cream Soda total source budget exceeded.");
    }
    input.push({ absolutePath, relativePath, raw: data.toString("utf8"), sizeBytes: data.byteLength });
  }
  // No project initialization or index-store mutation occurs until all input checks pass.
  assertSafeIndexRoot(repoRoot);
  const init = initializeProject(repoRoot);
  const store = readLocalStore(init.storePath);
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];
  if (!project) throw new Error("Cream Soda project record is missing from the local store.");
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

  for (const { absolutePath, relativePath, raw, sizeBytes } of input) {
    const content = redactText(raw);
    const fileId = `file_${hash(relativePath)}`;
    const fileRecord: RepoFileRecord = {
      id: fileId,
      projectId: project.id,
      path: relativePath,
      absolutePath,
      language: languageFor(relativePath),
      sizeBytes,
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

import crypto from "node:crypto";
import path from "node:path";
import type {
  ArchitectureMapResult,
  RepoChunkRecord,
  RepoDependencyEdgeRecord,
  RepoFileRecord,
  RepoProjectRecord,
  RepoTaxonomyLabelRecord,
  TraceEventRecord
} from "@repobrain/shared-types";
import { readLocalStore, resolveProjectPaths, writeLocalStore } from "@repobrain/storage";

function hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function roleFor(filePath: string): RepoTaxonomyLabelRecord["role"] {
  if (
    filePath.startsWith(".github/") ||
    filePath === "package.json" ||
    filePath === "pnpm-workspace.yaml" ||
    filePath === "turbo.json" ||
    filePath.startsWith("tsconfig")
  ) {
    return "config";
  }
  if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("__tests__") || filePath.startsWith("packages/testing/")) return "test";
  if (filePath.endsWith(".md") || filePath.startsWith("docs/") || filePath.includes("/docs/")) return "docs";
  if (filePath.startsWith("packages/core/")) return "storage";
  if (filePath.endsWith("package.json") && filePath.includes("/providers/")) return "provider";
  if (filePath.endsWith("package.json") && filePath.includes("/config/")) return "config";
  if (filePath.endsWith("package.json") && filePath.includes("/retrieval/")) return "retrieval";
  if (filePath.endsWith("package.json") && filePath.includes("/indexer/")) return "indexer";
  if (filePath.endsWith("package.json") && filePath.includes("/storage/")) return "storage";
  if (filePath.endsWith("package.json") && filePath.includes("/graph/")) return "graph";
  if (filePath.endsWith("package.json") && filePath.includes("/taxonomy/")) return "taxonomy";
  if (filePath.endsWith("package.json") && filePath.includes("/session-memory/")) return "session";
  if (filePath.endsWith("package.json") && filePath.includes("/mcp-server/")) return "mcp";
  if (filePath.endsWith("package.json") && filePath.includes("/cli/")) return "cli";
  if (filePath.endsWith("package.json") && filePath.includes("/desktop-web/")) return "ui";
  if (filePath.startsWith("apps/cli/")) return "cli";
  if (filePath.startsWith("apps/mcp-server/")) return "mcp";
  if (filePath.startsWith("apps/docs-site/") || filePath.includes("/docs/") || filePath.endsWith(".md")) return "docs";
  if (filePath.startsWith("apps/desktop-web/")) return "ui";
  if (filePath.startsWith("packages/config/")) return "config";
  if (filePath.startsWith("packages/storage/")) return "storage";
  if (filePath.startsWith("packages/providers/")) return "provider";
  if (filePath.startsWith("packages/indexer/")) return "indexer";
  if (filePath.startsWith("packages/retrieval/")) return "retrieval";
  if (filePath.startsWith("packages/taxonomy/")) return "taxonomy";
  if (filePath.startsWith("packages/graph/")) return "graph";
  if (filePath.startsWith("packages/session-memory/")) return "session";
  if (filePath.startsWith("packages/observability/")) return "observability";
  if (filePath.startsWith("packages/testing/") || filePath.includes(".test.") || filePath.includes(".spec.")) return "test";
  if (filePath.includes("provider") || filePath.includes("resolver") || filePath.includes("registry") || filePath.includes("adapter")) return "provider";
  if (filePath.includes("config") || filePath.includes("env") || filePath.includes("settings")) return "config";
  if (filePath.includes("storage") || filePath.includes("store") || filePath.includes("schema")) return "storage";
  if (filePath.includes("retrieval") || filePath.includes("search") || filePath.includes("context-pack")) return "retrieval";
  if (filePath.includes("indexer") || filePath.includes("pipeline") || filePath.includes("chunk")) return "indexer";
  if (filePath.includes("critical-path") || filePath.includes("graph") || filePath.includes("dependency")) return "graph";
  if (filePath.includes("taxonomy") || filePath.includes("map")) return "taxonomy";
  if (filePath.includes("trace") || filePath.includes("session")) return "session";
  if (filePath.includes("mcp")) return "mcp";
  if (filePath.includes("cli") || filePath.includes("command")) return "cli";
  if (filePath.endsWith(".tsx") || filePath.includes("component") || filePath.includes("page") || filePath.includes("layout")) return "ui";
  return "unknown";
}

function classifyFile(file: RepoFileRecord): Omit<RepoTaxonomyLabelRecord, "id" | "projectId" | "fileId" | "path" | "createdAt"> {
  const reasons: string[] = [];
  const role = roleFor(file.path);
  let zone: RepoTaxonomyLabelRecord["zone"] = "safe";
  let confidence = 0.55;

  if (role !== "unknown") {
    reasons.push(`architecture role:${role}`);
    confidence += 0.15;
  }

  if (
    ["cli", "mcp", "config", "storage", "provider", "indexer", "retrieval", "taxonomy", "graph", "session"].includes(role) ||
    file.path.endsWith("package.json")
  ) {
    zone = "core";
    reasons.push("core runtime or package surface");
    confidence += 0.15;
  }

  const isSensitiveConfig =
    role === "config" &&
    (file.path.includes("local-config") ||
      file.path.includes("project-config") ||
      file.path.includes("provider") ||
      file.path.includes("secret") ||
      file.path.includes(".env"));

  if (
    role === "provider" ||
    role === "mcp" ||
    isSensitiveConfig ||
    file.path.includes("filesystem") ||
    file.path.includes("security") ||
    file.path.includes("secrets") ||
    file.path.includes("storage/src/project-store")
  ) {
    zone = "danger";
    reasons.push("changes can affect local boundaries, secrets, package wiring, or agent entrypoints");
    confidence += 0.15;
  }

  if (role === "docs" || role === "test" || file.path.endsWith(".css")) {
    zone = "safe";
    reasons.push("documentation, styling, or test-support surface");
  }

  return { zone, role, confidence: Math.min(confidence, 0.95), reasons };
}

function importSpecs(content: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /import\s+[^'"]*from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /require\(["']([^"']+)["']\)/g
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) specs.add(match[1]);
    }
  }
  return [...specs];
}

function resolveImport(fromPath: string, spec: string, allPaths: Set<string>): { toPath: string; kind: RepoDependencyEdgeRecord["kind"]; reasons: string[] } {
  if (spec.startsWith("@repobrain/")) {
    const packageName = spec.split("/")[1];
    const target = `packages/${packageName}/src/index.ts`;
    return {
      toPath: allPaths.has(target) ? target : spec,
      kind: "workspace",
      reasons: [`workspace package:${spec}`]
    };
  }

  if (spec.startsWith(".")) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec));
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}/index.ts`, `${base}/index.tsx`];
    const target = candidates.find((candidate) => allPaths.has(candidate));
    return {
      toPath: target ?? spec,
      kind: "relative",
      reasons: [target ? "resolved relative import" : "unresolved relative import"]
    };
  }

  return { toPath: spec, kind: "external", reasons: [`external dependency:${spec}`] };
}

export function buildArchitectureMap(repoRoot: string = process.cwd()): ArchitectureMapResult {
  const paths = resolveProjectPaths(repoRoot);
  const store = readLocalStore(paths.storePath);
  const project = (store.tables.repo_projects as RepoProjectRecord[])[0];
  if (!project) throw new Error("Cream Soda project record is missing from the local store.");

  const files = store.tables.repo_files as RepoFileRecord[];
  const chunks = store.tables.repo_chunks as RepoChunkRecord[];
  const allPaths = new Set(files.map((file) => file.path));
  const createdAt = new Date().toISOString();
  const labels: RepoTaxonomyLabelRecord[] = files.map((file) => {
    const classification = classifyFile(file);
    return {
      id: `tax_${hash(file.path)}`,
      projectId: project.id,
      fileId: file.id,
      path: file.path,
      createdAt,
      ...classification
    };
  });
  const edges: RepoDependencyEdgeRecord[] = [];

  for (const chunk of chunks) {
    for (const spec of importSpecs(chunk.content)) {
      const resolved = resolveImport(chunk.path, spec, allPaths);
      edges.push({
        id: `edge_${hash(`${chunk.path}:${spec}`)}`,
        projectId: project.id,
        fromPath: chunk.path,
        toPath: resolved.toPath,
        importSpec: spec,
        kind: resolved.kind,
        confidence: resolved.toPath === spec && resolved.kind === "relative" ? 0.45 : 0.85,
        reasons: resolved.reasons
      });
    }
  }

  const roles: Record<string, number> = {};
  for (const label of labels) {
    roles[label.role] = (roles[label.role] ?? 0) + 1;
  }

  const traceEvent: TraceEventRecord = {
    id: `trace_${Date.now()}_taxonomy`,
    projectId: project.id,
    kind: "taxonomy",
    action: "build_architecture_map",
    message: `Classified ${labels.length} files and derived ${edges.length} dependency edges.`,
    createdAt,
    metadata: {
      files: labels.length,
      edges: edges.length,
      danger: labels.filter((label) => label.zone === "danger").length
    }
  };

  store.tables.repo_taxonomy_labels = labels;
  store.tables.repo_dependency_edges = edges;
  store.tables.trace_events = [...store.tables.trace_events, traceEvent];
  writeLocalStore(paths.storePath, store);

  return {
    projectId: project.id,
    generatedAt: createdAt,
    labels,
    edges,
    summary: {
      files: labels.length,
      safe: labels.filter((label) => label.zone === "safe").length,
      core: labels.filter((label) => label.zone === "core").length,
      danger: labels.filter((label) => label.zone === "danger").length,
      roles
    }
  };
}

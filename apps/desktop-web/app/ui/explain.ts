import type { CriticalPathHint, RetrievalResult, ScoreFactor } from "@repobrain/shared-types";

export function summarizeFactors(factors: ScoreFactor[] | undefined, fallbackReasons: string[], limit: number = 3): string {
  if (!factors || factors.length === 0) return fallbackReasons.slice(0, limit).join("; ");
  return [...new Set(factors.map((factor) => factor.label))].slice(0, limit).join("; ");
}

export function fileGroup(filePath: string): "primary" | "supporting" | "integration" | "coverage" {
  if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("/testing/")) return "coverage";
  if (filePath.includes("/providers/") || filePath.includes("/retrieval/") || filePath.includes("/indexer/") || filePath.includes("/graph/")) {
    return "primary";
  }
  if (filePath.includes("/config/") || filePath.includes("/storage/") || filePath.includes("/core/") || filePath.includes("secrets")) {
    return "supporting";
  }
  return "integration";
}

export function contextPackSummary(results: RetrievalResult[]): string {
  const groups = new Set(results.map((result) => fileGroup(result.chunk.path)));
  const parts: string[] = [];
  if (groups.has("primary")) parts.push("primary implementation files");
  if (groups.has("supporting")) parts.push("supporting config/runtime files");
  if (groups.has("integration")) parts.push("adjacent integration files");
  if (groups.has("coverage")) parts.push("test coverage files");
  return parts.length > 0
    ? `Selected ${parts.join(", ")} based on retrieval score, architecture role, and query match.`
    : "No matching chunks were selected.";
}

export function criticalFactorLabels(hint: CriticalPathHint): string[] {
  if (hint.factors.length > 0) {
    const labels: string[] = [];
    if (hint.factors.some((factor) => factor.kind === "query_relevance" || factor.kind === "path_role_match")) labels.push("query relevance");
    if (hint.factors.some((factor) => factor.kind === "dependency_centrality")) labels.push("dependency centrality");
    if (hint.factors.some((factor) => factor.kind === "architecture_role")) labels.push("architecture role");
    if (hint.factors.some((factor) => factor.kind === "risk")) labels.push("risk");
    if (hint.factors.some((factor) => factor.kind === "generated_artifact_penalty")) labels.push("generated artifact penalty");
    return labels.length > 0 ? labels : ["taxonomy signal"];
  }

  const labels: string[] = [];
  if (hint.reasons.some((reason) => reason.includes("query role match") || reason.includes("query path terms"))) labels.push("query relevance");
  if (hint.reasons.some((reason) => reason.includes("dependency centrality") || reason.includes("depend on this path"))) labels.push("dependency centrality");
  if (hint.reasons.some((reason) => reason.includes("architecture role"))) labels.push("architecture role");
  if (hint.zone === "danger" || hint.reasons.some((reason) => reason.includes("sensitive runtime"))) labels.push("risk");
  return labels.length > 0 ? labels : ["taxonomy signal"];
}

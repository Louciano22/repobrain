import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { indexCodebase } from "@repobrain/indexer";
import { rankIndexedFiles } from "@repobrain/retrieval";
import type { RepoChunkRecord } from "@repobrain/shared-types";
import { readLocalStore } from "@repobrain/storage";
import { evaluateRanking, type RankingCase, type RankingReport } from "./benchmark.js";
import { heldoutRepositories } from "./heldout-fixtures.js";
import { heldoutJudgments, type JudgedCase } from "./heldout-judgments.js";
import { lexicalBaseline } from "./lexical-baseline.js";

const K = 5;
const suiteVersion = "public-evaluation-split.v2";
// Deliberate fixture updates require a new suite version and a reviewed digest change.
const reviewedFixtureSha256 = "55972154a85e8b22dd753065eafba8221b64159a3f8969113ae023e3b782dc2d";

function summary(report: RankingReport) {
  return {
    count: report.caseCount,
    hitAt5: report.hitRateAtK,
    precisionAt5: report.meanPrecisionAtK,
    recallAt5: report.meanRecallAtK,
    mrrAt5: report.meanReciprocalRankAtK
  };
}

function fixtureDigest(): string {
  const fixture = {
    repositories: heldoutRepositories.map((repo) => ({
      id: repo.id,
      files: Object.entries(repo.files).sort(([left], [right]) => left.localeCompare(right, "en"))
    })),
    judgments: heldoutJudgments
  };
  return createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
}

function retrievalDigest(): string {
  const modulePath = fileURLToPath(new URL("./search.js", import.meta.resolve("@repobrain/retrieval")));
  return createHash("sha256").update(fs.readFileSync(modulePath)).digest("hex");
}

function checkJudgments(): void {
  assert.equal(heldoutRepositories.length, 2);
  assert.equal(heldoutJudgments.length, 12);
  const ids = new Set<string>();
  for (const entry of heldoutJudgments) {
    assert.ok(!ids.has(entry.id), `Repeated judgment: ${entry.id}`);
    ids.add(entry.id);
    const repo = heldoutRepositories.find((candidate) => candidate.id === entry.repositoryId);
    assert.ok(repo, `Missing fixture: ${entry.repositoryId}`);
    assert.ok(entry.relevantPaths.length > 0);
    for (const relevantPath of entry.relevantPaths) assert.ok(relevantPath in repo.files, `Unknown judged path: ${relevantPath}`);
  }
}

function writeFixture(root: string, files: Record<string, string>): void {
  assert.ok(Object.keys(files).length <= 20, "Fixture file budget exceeded.");
  assert.ok(Object.values(files).reduce((total, content) => total + Buffer.byteLength(content), 0) <= 32768, "Fixture byte budget exceeded.");
  for (const [filePath, content] of Object.entries(files)) {
    assert.ok(!path.isAbsolute(filePath) && !filePath.split("/").includes(".."), "Unsafe fixture path.");
    const absolute = path.join(root, filePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
}

function score(cases: RankingCase[]): ReturnType<typeof summary> {
  return summary(evaluateRanking(suiteVersion, cases, K));
}

checkJudgments();
assert.equal(fixtureDigest(), reviewedFixtureSha256, "Evaluation fixture changed without reviewed version update.");
assert.deepEqual(lexicalBaseline({ "b.ts": "needle", "a.ts": "needle", "c.ts": "nothing" }, "needle"), ["a.ts", "b.ts"]);

const creamCases: RankingCase[] = [];
const baselineCases: RankingCase[] = [];
const counts: Record<string, number> = {};
for (const fixture of heldoutRepositories) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cream-soda-public-eval-"));
  try {
    writeFixture(root, fixture.files);
    const index = indexCodebase(root);
    const store = readLocalStore(path.join(root, ".repobrain/store.json"));
    const indexedPaths = (store.tables.repo_files as Array<{ path: string }>).map((file) => file.path);
    const chunks = store.tables.repo_chunks as RepoChunkRecord[];
    assert.ok(indexedPaths.length >= 8 && index.filesIndexed === indexedPaths.length);
    assert.ok(indexedPaths.every((filePath) => filePath in fixture.files));
    assert.ok(indexedPaths.every((filePath) => !filePath.includes("/dist/")), "Generated artifacts should be excluded.");
    const indexedFiles: Record<string, string> = Object.create(null);
    for (const chunk of chunks) indexedFiles[chunk.path] = `${indexedFiles[chunk.path] ?? ""}\n${chunk.content}`;
    assert.deepEqual(Object.keys(indexedFiles).sort(), [...indexedPaths].sort());
    counts[fixture.id] = indexedPaths.length;

    for (const judgment of heldoutJudgments.filter((entry) => entry.repositoryId === fixture.id)) {
      assert.ok(judgment.relevantPaths.every((filePath) => indexedPaths.includes(filePath)));
      const creamPaths = rankIndexedFiles(chunks, judgment.query, K);
      const basePaths = lexicalBaseline(indexedFiles, judgment.query).slice(0, K);
      creamCases.push({ id: judgment.id, query: judgment.query, relevantPaths: judgment.relevantPaths, retrievedPaths: creamPaths });
      baselineCases.push({ id: judgment.id, query: judgment.query, relevantPaths: judgment.relevantPaths, retrievedPaths: basePaths });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function slice(judgments: JudgedCase[]): { count: number; creamSoda: ReturnType<typeof summary>; lexical: ReturnType<typeof summary> } {
  const ids = new Set(judgments.map((entry) => entry.id));
  const creamSoda = score(creamCases.filter((entry) => ids.has(entry.id)));
  const lexical = score(baselineCases.filter((entry) => ids.has(entry.id)));
  return { count: ids.size, creamSoda, lexical };
}

const slices = Object.fromEntries(
  [...new Set(heldoutJudgments.map((entry) => entry.slice))].sort().map((name) => [name, slice(heldoutJudgments.filter((entry) => entry.slice === name))])
);
const byRepository = Object.fromEntries(
  heldoutRepositories.map((fixture) => [fixture.id, slice(heldoutJudgments.filter((entry) => entry.repositoryId === fixture.id))])
);
const report = {
  schemaVersion: "cream-soda-public-eval.v1",
  suiteVersion,
  fixtureSha256: reviewedFixtureSha256,
  retrievalModuleSha256: retrievalDigest(),
  retrievalMode: "exact",
  baseline: "binary-token-overlap.v1",
  k: K,
  repositoryCount: heldoutRepositories.length,
  indexedFileCounts: counts,
  total: slice(heldoutJudgments),
  byRepository,
  slices
};
assert.equal(report.total.count, 12);
assert.equal(Object.values(report.slices).reduce((sum, item) => sum + item.count, 0), 12);
assert.deepEqual(creamCases.map((entry) => entry.id), baselineCases.map((entry) => entry.id));
console.log(`CREAMSODA_PUBLIC_EVAL_JSON=${JSON.stringify(report)}`);
console.log("Cream Soda public evaluation split completed (descriptive metrics only; no performance gate).");

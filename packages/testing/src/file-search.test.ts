import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rankIndexedFiles, searchCodebase } from "@repobrain/retrieval";
import type { RepoChunkRecord } from "@repobrain/shared-types";
import { initializeProject, readLocalStore, writeLocalStore } from "@repobrain/storage";

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cream-soda-file-search-"));
const cli = path.resolve(import.meta.dirname, "../../../apps/cli/dist/index.js");

function chunk(id: string, filePath: string, content: string): RepoChunkRecord {
  return { id, projectId: "file-search", fileId: filePath, path: filePath, content, symbols: [], startLine: 1, endLine: 3, tokenEstimate: 10 };
}

try {
  const { storePath } = initializeProject(repo);
  const store = readLocalStore(storePath);
  const chunks = [
    chunk("a-1", "src/one.ts", "cache eviction cache eviction"),
    chunk("a-2", "src/one.ts", "cache eviction cache eviction"),
    chunk("b-1", "src/two.ts", "cache eviction"),
    chunk("c-1", "src/three.ts", "unrelated")
  ];
  store.tables.repo_chunks = chunks;
  writeLocalStore(storePath, store);

  const query = "cache eviction";
  const chunkResults = searchCodebase({ repoRoot: repo, query, mode: "exact", limit: 2 }).results;
  assert.deepEqual(chunkResults.map((entry) => entry.chunk.path), ["src/one.ts", "src/one.ts"]);

  const fileResults = searchCodebase({ repoRoot: repo, query, mode: "exact", limit: 2, resultUnit: "file" }).results;
  assert.deepEqual(fileResults.map((entry) => entry.chunk.path), rankIndexedFiles(chunks, query, 2));
  assert.deepEqual(fileResults.map((entry) => entry.chunk.id), ["a-1", "b-1"]);
  assert.equal(fileResults[0]?.score, chunkResults[0]?.score);

  const cliResult = spawnSync(process.execPath, [cli, "search", query, "--repo", repo], { encoding: "utf8" });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.match(cliResult.stdout, /Top files \(best matching excerpt per file\)/);
  assert.match(cliResult.stdout, /1\. src\/one\.ts:/);
  assert.match(cliResult.stdout, /2\. src\/two\.ts:/);
  assert.equal((cliResult.stdout.match(/src\/one\.ts:/g) ?? []).length, 1);
  console.log("Cream Soda search shows distinct files while chunk search remains available.");
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}

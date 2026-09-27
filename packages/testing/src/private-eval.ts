import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rankIndexedFiles } from "@repobrain/retrieval";
import type { RepoChunkRecord } from "@repobrain/shared-types";
import { evaluateRanking, type RankingCase, type RankingReport } from "./benchmark.js";
import { lexicalBaseline } from "./lexical-baseline.js";

const MAX_CORPUS_BYTES = 1024 * 1024;
const MAX_STORE_BYTES = 32 * 1024 * 1024;
const MAX_CASES = 100;
const MAX_REPOS = 10;
const MAX_CHUNKS = 20000;
const MAX_TOTAL_STORE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_CHUNKS = 40000;
const MAX_TOTAL_CONTENT_CHARS = 32 * 1024 * 1024;
const K = 5;
const invalid = () => new Error("Private evaluation input is invalid or outside the authorized boundary.");

type Judgment = { repo: string; query: string; relevantPaths: string[] };
type Summary = { count: number; hitAt5: number; precisionAt5: number; recallAt5: number; mrrAt5: number };
export type PrivateEvalReport = {
  schemaVersion: "cream-soda-private-eval.v1";
  mode: "read-only-exact";
  baseline: "binary-token-overlap.v1";
  k: 5;
  repositoryCount: number;
  indexedFileCount: number;
  total: { creamSoda: Summary; lexical: Summary };
  limitations: "descriptive-only";
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelative(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 240 && !value.includes("\\") &&
    !value.includes("\0") && !path.posix.isAbsolute(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function realDirectory(directory: string): string {
  const absolute = path.resolve(directory);
  let current = absolute;
  while (true) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalid();
    if (current === path.dirname(current)) break;
    current = path.dirname(current);
  }
  if (fs.realpathSync(absolute) !== absolute) throw invalid();
  return absolute;
}

function boundedFile(file: string, maximum: number): Buffer {
  const absolute = path.resolve(file);
  realDirectory(path.dirname(absolute));
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maximum || fs.realpathSync(absolute) !== absolute) throw invalid();
    const buffer = Buffer.allocUnsafe(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(fd, buffer, offset, buffer.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    if (offset > maximum) throw invalid();
    return buffer.subarray(0, offset);
  } finally {
    fs.closeSync(fd);
  }
}

function parseJudgments(bytes: Buffer): Judgment[] {
  const document: unknown = JSON.parse(bytes.toString("utf8"));
  if (!object(document) || Object.keys(document).sort().join(",") !== "cases,schemaVersion" || document.schemaVersion !== "cream-soda-private-judgments.v1" ||
    !Array.isArray(document.cases) || document.cases.length < 1 || document.cases.length > MAX_CASES) throw invalid();
  const judgments: Judgment[] = [];
  for (const entry of document.cases) {
    if (!object(entry) || Object.keys(entry).sort().join(",") !== "query,relevantPaths,repo" ||
      typeof entry.repo !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(entry.repo) ||
      typeof entry.query !== "string" || !entry.query.trim() || entry.query.length > 1000 ||
      !Array.isArray(entry.relevantPaths) || entry.relevantPaths.length < 1 || entry.relevantPaths.length > 20 ||
      !entry.relevantPaths.every(safeRelative) || new Set(entry.relevantPaths).size !== entry.relevantPaths.length) throw invalid();
    judgments.push(entry as Judgment);
  }
  if (new Set(judgments.map((entry) => entry.repo)).size > MAX_REPOS) throw invalid();
  const keys = judgments.map((entry) => `${entry.repo}\0${entry.query.trim().replace(/\s+/g, " ").toLowerCase()}`);
  if (new Set(keys).size !== keys.length) throw invalid();
  return judgments;
}

function readChunks(repoRoot: string): { chunks: RepoChunkRecord[]; storeBytes: number; contentChars: number } {
  realDirectory(repoRoot);
  const projectDir = realDirectory(path.join(repoRoot, ".repobrain"));
  const bytes = boundedFile(path.join(projectDir, "store.json"), MAX_STORE_BYTES);
  const store: unknown = JSON.parse(bytes.toString("utf8"));
  if (!object(store) || !object(store.tables) || !Array.isArray(store.tables.repo_chunks) ||
    !Array.isArray(store.tables.repo_files) || store.tables.repo_chunks.length > MAX_CHUNKS ||
    store.tables.repo_files.length > MAX_CHUNKS) throw invalid();
  const paths = new Set<string>();
  for (const file of store.tables.repo_files) {
    if (!object(file) || !safeRelative(file.path) || paths.has(file.path)) throw invalid();
    paths.add(file.path);
  }
  const chunks = store.tables.repo_chunks;
  let contentChars = 0;
  for (const chunk of chunks) {
    if (!object(chunk) || !safeRelative(chunk.path) || !paths.has(chunk.path) ||
      typeof chunk.id !== "string" || !Array.isArray(chunk.symbols) || !chunk.symbols.every((item) => typeof item === "string") ||
      typeof chunk.content !== "string" || chunk.content.length > 2 * 1024 * 1024) throw invalid();
    contentChars += chunk.content.length;
    if (contentChars > MAX_TOTAL_CONTENT_CHARS) throw invalid();
  }
  return { chunks: chunks as RepoChunkRecord[], storeBytes: bytes.length, contentChars };
}

function summary(report: RankingReport): Summary {
  return { count: report.caseCount, hitAt5: report.hitRateAtK, precisionAt5: report.meanPrecisionAtK,
    recallAt5: report.meanRecallAtK, mrrAt5: report.meanReciprocalRankAtK };
}

/** Explicit opt-in; only reads existing local indices, and never persists private queries or labels. */
export function runPrivateEvaluation(params: { corpusFile: string; reposRoot: string; allowPrivateEval: boolean }): PrivateEvalReport {
  try {
    if (params.allowPrivateEval !== true || !path.isAbsolute(params.corpusFile) || !path.isAbsolute(params.reposRoot)) throw invalid();
    const root = realDirectory(params.reposRoot);
    if (root === path.parse(root).root || root === path.resolve(os.homedir()) ||
      boundedFile(path.join(root, ".cream-soda-private-eval-root"), 64).toString("utf8") !== "cream-soda-private-eval.v1\n") throw invalid();
    const corpus = path.resolve(params.corpusFile);
    if (corpus === root || corpus.startsWith(`${root}${path.sep}`) || corpus === process.cwd() || corpus.startsWith(`${process.cwd()}${path.sep}`)) throw invalid();
    const judgments = parseJudgments(boundedFile(corpus, MAX_CORPUS_BYTES));
    const byRepo = new Map<string, { chunks: RepoChunkRecord[]; files: Record<string, string> }>();
    let indexedFileCount = 0;
    let totalStoreBytes = 0;
    let totalChunks = 0;
    let totalContentChars = 0;
    for (const repo of new Set(judgments.map((entry) => entry.repo))) {
      const repoRoot = path.join(root, repo);
      if (path.dirname(repoRoot) !== root) throw invalid();
      const read = readChunks(repoRoot);
      totalStoreBytes += read.storeBytes;
      totalChunks += read.chunks.length;
      totalContentChars += read.contentChars;
      if (totalStoreBytes > MAX_TOTAL_STORE_BYTES || totalChunks > MAX_TOTAL_CHUNKS || totalContentChars > MAX_TOTAL_CONTENT_CHARS) throw invalid();
      const { chunks } = read;
      const files: Record<string, string> = Object.create(null);
      for (const chunk of chunks) files[chunk.path] = `${files[chunk.path] ?? ""}\n${chunk.content}`;
      indexedFileCount += Object.keys(files).length;
      if (indexedFileCount > MAX_CHUNKS) throw invalid();
      byRepo.set(repo, { chunks, files });
    }
    const creamCases: RankingCase[] = [];
    const baselineCases: RankingCase[] = [];
    for (const [index, entry] of judgments.entries()) {
      const indexed = byRepo.get(entry.repo)!;
      if (!entry.relevantPaths.every((file) => Object.hasOwn(indexed.files, file))) throw invalid();
      const common = { id: `${index}`, query: entry.query, relevantPaths: entry.relevantPaths };
      creamCases.push({ ...common, retrievedPaths: rankIndexedFiles(indexed.chunks, entry.query, K) });
      baselineCases.push({ ...common, retrievedPaths: lexicalBaseline(indexed.files, entry.query).slice(0, K) });
    }
    return {
      schemaVersion: "cream-soda-private-eval.v1", mode: "read-only-exact", baseline: "binary-token-overlap.v1", k: K,
      repositoryCount: byRepo.size, indexedFileCount,
      total: { creamSoda: summary(evaluateRanking("private", creamCases, K)), lexical: summary(evaluateRanking("private", baselineCases, K)) },
      limitations: "descriptive-only"
    };
  } catch {
    throw invalid();
  }
}

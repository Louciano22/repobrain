import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { rankIndexedFiles } from "@repobrain/retrieval";
import { runPrivateEvaluation } from "./private-eval.js";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "cream-private-eval-test-"));
const reposRoot = path.join(work, "repos");
const repo = path.join(reposRoot, "trusted");
const projectDir = path.join(repo, ".repobrain");
const corpusFile = path.join(work, "judgments.json");
const secret = "SECRET_PRIVATE_QUERY_CANARY_70618";
const sourceSecret = "SOURCE_CANARY_61807";
fs.mkdirSync(projectDir, { recursive: true });
fs.writeFileSync(path.join(reposRoot, ".cream-soda-private-eval-root"), "cream-soda-private-eval.v1\n");
const chunks = [
  { id: "one", path: "src/target.ts", content: `payment authorization ${sourceSecret}`, symbols: [] },
  { id: "two", path: "src/target.ts", content: "payment authorization additional chunk", symbols: [] },
  { id: "three", path: "src/other.ts", content: "weather forecast", symbols: [] }
];
const storeFile = path.join(projectDir, "store.json");
fs.writeFileSync(storeFile, JSON.stringify({ tables: { repo_files: [{ path: "src/target.ts" }, { path: "src/other.ts" }], repo_chunks: chunks } }));
function writeCorpus(cases: unknown): void {
  fs.writeFileSync(corpusFile, JSON.stringify({ schemaVersion: "cream-soda-private-judgments.v1", cases }));
}
function failsWithoutEcho(run: () => unknown): void {
  assert.throws(run, (error: Error) => error.message === "Private evaluation input is invalid or outside the authorized boundary." &&
    !error.message.includes(secret) && !error.message.includes(work));
}
try {
  const cases = [{ repo: "trusted", query: `payment authorization ${secret}`, relevantPaths: ["src/target.ts"] }];
  writeCorpus(cases);
  const before = fs.readFileSync(storeFile);
  const report = runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true });
  const crowded = Array.from({ length: 6 }, (_, index) => ({ id: `crowd-${index}`, path: "src/target.ts", content: "payment authorization", symbols: [] }));
  assert.deepEqual(new Set(rankIndexedFiles([...crowded, { id: "next", path: "src/other.ts", content: "payment", symbols: [] }] as never, "payment", 2)), new Set(["src/target.ts", "src/other.ts"]));
  assert.equal(report.total.creamSoda.count, 1);
  assert.equal(report.total.lexical.count, 1);
  assert.equal(report.total.creamSoda.hitAt5, 1);
  assert.deepEqual(fs.readFileSync(storeFile), before, "queries must not be appended to store");
  const reportJson = JSON.stringify(report);
  for (const privateValue of [secret, sourceSecret, "src/target.ts", work, "trusted"]) {
    assert.ok(!reportJson.includes(privateValue), "report must contain only aggregate data");
  }

  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: false }));
  writeCorpus([{ ...cases[0], repo: "../outside" }]);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  writeCorpus([{ ...cases[0], relevantPaths: ["../secret.ts"] }]);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  writeCorpus([{ ...cases[0], relevantPaths: ["src/missing.ts"] }]);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  writeCorpus([cases[0], { ...cases[0], query: `  payment    authorization ${secret.toLowerCase()} ` }]);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  writeCorpus(cases);

  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot: path.parse(work).root, corpusFile, allowPrivateEval: true }));
  fs.unlinkSync(path.join(reposRoot, ".cream-soda-private-eval-root"));
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  fs.writeFileSync(path.join(reposRoot, ".cream-soda-private-eval-root"), "cream-soda-private-eval.v1\n");

  const linked = path.join(work, "linked.json");
  fs.symlinkSync(corpusFile, linked);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile: linked, allowPrivateEval: true }));
  const linkedStore = path.join(work, "real-store.json");
  fs.renameSync(storeFile, linkedStore);
  fs.symlinkSync(linkedStore, storeFile);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  fs.unlinkSync(storeFile);
  fs.renameSync(linkedStore, storeFile);
  const linkedRepo = path.join(reposRoot, "linked-repo");
  fs.symlinkSync(repo, linkedRepo);
  writeCorpus([{ ...cases[0], repo: "linked-repo" }]);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  writeCorpus(cases);

  fs.writeFileSync(storeFile, "invalid JSON");
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  fs.writeFileSync(storeFile, before);
  fs.truncateSync(storeFile, 32 * 1024 * 1024 + 1);
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  fs.writeFileSync(storeFile, before);

  fs.writeFileSync(corpusFile, "x".repeat(1024 * 1024 + 1));
  failsWithoutEcho(() => runPrivateEvaluation({ reposRoot, corpusFile, allowPrivateEval: true }));
  writeCorpus(cases);

  const cli = spawnSync(process.execPath, [path.join(import.meta.dirname, "private-eval-cli.js"), "--repos-root", reposRoot, "--corpus", linked, "--allow-private-eval"], { encoding: "utf8" });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, "");
  assert.ok(!cli.stderr.includes(work) && !cli.stderr.includes(secret));
  console.log("Private evaluation opt-in, output privacy, bounded input, and read-only checks passed.");
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

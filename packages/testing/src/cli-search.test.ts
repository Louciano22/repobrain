import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const checkout = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(checkout, "apps/cli/dist/index.js");
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cream-soda-cli-search-"));

function invoke(...args: string[]): string {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: checkout, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

try {
  fs.writeFileSync(path.join(repo, "example.ts"), "export const receiptCollector = 'local evidence';\n");
  invoke("init", repo);
  invoke("index", repo);
  const query = "receiptCollector local evidence";
  const positional = invoke("search", query, repo);
  const flagged = invoke("search", query, "--repo", repo);
  assert.equal(flagged, positional);
  assert.match(flagged, /example\.ts:/);
  console.log("Cream Soda search accepts positional and --repo paths with identical results.");
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}

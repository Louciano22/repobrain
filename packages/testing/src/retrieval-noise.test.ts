import assert from "node:assert/strict";
import { rankIndexedFiles } from "@repobrain/retrieval";
import type { RepoChunkRecord } from "@repobrain/shared-types";

function chunk(path: string, content: string, symbols: string[] = []): RepoChunkRecord {
  return { id: path, projectId: "noise-fixture", fileId: path, path, content, symbols, startLine: 1, endLine: 1, tokenEstimate: 20 };
}

const repeated = "cache eviction policy ".repeat(80);
const chunks = [
  chunk("lib/cache/eviction.ts", "export function chooseEvictionPolicy() { return 'lru'; }", ["chooseEvictionPolicy"]),
  chunk("docs/cache.md", `# Cache guide\n${repeated}`),
  chunk("app/cache/page.tsx", `export default function Page() { return '${repeated}'; }`, ["Page"]),
  chunk("tests/cache.test.ts", "test('cache eviction policy', () => {});", ["test"]),
  chunk("lib/health/smoke-test.ts", "export function checkRuntimeHealth() { return true; }", ["checkRuntimeHealth"]),
  chunk("docs/health.md", "# Health checks\nRuntime health check troubleshooting. ".repeat(20)),
  chunk("lib/contest.ts", "export function scoreContestWinners() { return 1; }", ["scoreContestWinners"]),
  chunk("docs/contest.md", "Contest winner score calculation. ".repeat(20)),
];

const implementation = rankIndexedFiles(chunks, "Where is cache eviction policy chosen?", 5);
assert.equal(implementation[0], "lib/cache/eviction.ts", "repeated UI or docs words must not bury concise implementation");

const page = rankIndexedFiles(chunks, "Which page displays cache eviction policy?", 5);
assert.equal(page[0], "app/cache/page.tsx", "explicit UI intent should still find the page");

const test = rankIndexedFiles(chunks, "Where are cache eviction policy tests?", 5);
assert.equal(test[0], "tests/cache.test.ts", "explicit test intent should still find the test");

const productionSmoke = rankIndexedFiles(chunks, "Where is the runtime health check implemented?", 5);
assert.equal(productionSmoke[0], "lib/health/smoke-test.ts", "production code with test in its filename must not be treated as a test suite");
assert.equal(rankIndexedFiles(chunks, "Where is contest winner score calculated?", 5)[0], "lib/contest.ts", "a name containing test must not be classified as a test suite");
assert.deepEqual(rankIndexedFiles(chunks, "Where is cache eviction policy chosen?", 5), implementation);
console.log("Cream Soda retrieval noise and intent fixture passed.");

import assert from "node:assert/strict";
import { evaluateRanking } from "./benchmark.js";

const report = evaluateRanking("metric-unit.v1", [
  { id: "one", query: "first", relevantPaths: ["a.ts", "b.ts"], retrievedPaths: ["x.ts", "a.ts", "a.ts", "b.ts"] },
  { id: "two", query: "second", relevantPaths: ["z.ts"], retrievedPaths: ["x.ts"] }
], 3);

assert.equal(report.caseCount, 2);
assert.deepEqual(report.cases[0]?.topPaths, ["x.ts", "a.ts", "b.ts"]);
assert.equal(report.cases[0]?.firstRelevantRank, 2);
assert.equal(report.cases[0]?.precisionAtK, 2 / 3);
assert.equal(report.cases[0]?.recallAtK, 1);
assert.equal(report.hitRateAtK, 0.5);
assert.equal(report.meanReciprocalRankAtK, 0.25);
assert.equal(report.meanRecallAtK, 0.5);
assert.throws(() => evaluateRanking("", [], 0));
assert.throws(() => evaluateRanking("test", [{ id: "empty", query: "q", relevantPaths: [], retrievedPaths: [] }], 5));
assert.throws(() => evaluateRanking("test", [
  { id: "duplicate", query: "a", relevantPaths: ["a"], retrievedPaths: [] },
  { id: "duplicate", query: "b", relevantPaths: ["b"], retrievedPaths: [] }
], 5));

console.log("Cream Soda benchmark metric tests passed");

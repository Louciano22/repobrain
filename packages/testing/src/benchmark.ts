export type RankingCase = {
  id: string;
  query: string;
  relevantPaths: string[];
  retrievedPaths: string[];
};

export type RankingCaseResult = {
  id: string;
  query: string;
  relevantPaths: string[];
  topPaths: string[];
  firstRelevantRank: number | null;
  hitAtK: boolean;
  precisionAtK: number;
  recallAtK: number;
  reciprocalRankAtK: number;
};

export type RankingReport = {
  schemaVersion: "cream-soda-ranking.v1";
  corpus: string;
  k: number;
  caseCount: number;
  hitRateAtK: number;
  meanPrecisionAtK: number;
  meanRecallAtK: number;
  meanReciprocalRankAtK: number;
  cases: RankingCaseResult[];
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Scores unique file paths, not chunks; missing results still count against precision@k. */
export function evaluateRanking(corpus: string, cases: RankingCase[], k: number): RankingReport {
  if (!corpus.trim() || !Number.isSafeInteger(k) || k < 1 || cases.length === 0) {
    throw new Error("A named corpus, at least one case, and a positive integer k are required.");
  }

  const ids = new Set<string>();
  const results = cases.map((entry): RankingCaseResult => {
    if (!entry.id.trim() || !entry.query.trim() || ids.has(entry.id) || entry.relevantPaths.length === 0) {
      throw new Error(`Invalid or duplicate benchmark case: ${entry.id}`);
    }
    ids.add(entry.id);
    const relevant = new Set(entry.relevantPaths);
    const topPaths = [...new Set(entry.retrievedPaths)].slice(0, k);
    const matched = topPaths.filter((candidate) => relevant.has(candidate));
    const rank = topPaths.findIndex((candidate) => relevant.has(candidate));
    return {
      id: entry.id,
      query: entry.query,
      relevantPaths: [...relevant].sort(),
      topPaths,
      firstRelevantRank: rank < 0 ? null : rank + 1,
      hitAtK: rank >= 0,
      precisionAtK: matched.length / k,
      recallAtK: matched.length / relevant.size,
      reciprocalRankAtK: rank < 0 ? 0 : 1 / (rank + 1)
    };
  });

  return {
    schemaVersion: "cream-soda-ranking.v1",
    corpus,
    k,
    caseCount: results.length,
    hitRateAtK: average(results.map((result) => Number(result.hitAtK))),
    meanPrecisionAtK: average(results.map((result) => result.precisionAtK)),
    meanRecallAtK: average(results.map((result) => result.recallAtK)),
    meanReciprocalRankAtK: average(results.map((result) => result.reciprocalRankAtK)),
    cases: results
  };
}

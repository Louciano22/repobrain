# Ranking benchmark foundation

`pnpm test` runs the existing synthetic provider-repository regression suite and prints one machine-readable `CREAMSODA_BENCHMARK_JSON=` line. The v1 report contains per-query paths and Hit@5, Precision@5, Recall@5, and reciprocal rank, plus their aggregate means. It scores unique file paths rather than individual chunks. A missing result counts against Precision@5.

The corpus is generated in `packages/testing/src/ranking-eval.test.ts`. Its seven queries and declared relevant paths are public, synthetic development fixtures—not proprietary evaluation data, a held-out test set, or evidence of real-world performance. Existing top-k and source-over-artifact assertions, a Hit@5 gate of 1.0, a synthetic MRR@5 floor of 0.85, and repeated-ranking determinism are CI gates. These are regression checks for this toy fixture, not product-quality claims. Reports contain no source excerpts or provider credentials.

Next steps: add separately reviewed, versioned multi-repo fixtures and held-out judgments; compare against a simple text-search baseline on the same inputs; publish per-slice regressions and only set quality thresholds after recording the baseline. Keep any private customer corpus outside the public repository, subject to consent and retention rules.

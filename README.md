# Cream Soda

> Cream Soda is the new name for RepoBrain. Existing `repobrain` commands, `@repobrain/*` packages, `.repobrain/` data, and `REPOBRAIN_*` environment variables remain supported during the compatibility period.

**Stop making AI coding agents rediscover your repo every session.**

Cream Soda is repository intelligence by LouChi AI: local-first, architecture-aware, and model-agnostic. It indexes a real codebase into a project-local memory layer, then exposes ranked search, context packs, critical-path hints, trace data, and MCP tools without hidden cloud sync.

## Current MVP

Cream Soda is currently source-first and not yet packaged for npm. The current MVP includes working local indexing, hybrid search, context pack generation, taxonomy/map output, critical-path scoring, trace/replay, CLI workflows, stdio MCP tools, local UI pages, structured ranking factors, and regression tests.
Packages are still marked `private` and are not configured for npm publishing yet.

## Why It Exists

Coding agents waste time and tokens relearning the same repo shape: where provider logic lives, which files are central, what code is risky, which paths should be ignored, and what context belongs in a task prompt. Cream Soda gives agents a compact, explainable repo memory so every session does not start from zero.

## What It Does

- Indexes a local repository into a project-local `.repobrain/` store.
- Runs exact, keyword, and provider-aware local semantic retrieval with safe fallback metadata.
- Builds token-budgeted, explanation-rich context packs for coding-agent tasks.
- Classifies files into architecture roles and safe/core/danger zones.
- Surfaces dependency-aware critical-path hints for central, blocking, and risky files.
- Persists retrieval events, trace events, session steps, and replayable local history.
- Uses structured score factors and ranking evals to keep ranking quality testable.
- Exposes the same local data through CLI, MCP tool responses, and the local UI.

## Quickstart

Requirements: Node.js 22+, pnpm 10+, and a local repo you want Cream Soda to inspect.

```bash
pnpm install
pnpm build
cp .env.example .env.local

pnpm --filter @repobrain/cli exec node dist/index.js init .
pnpm --filter @repobrain/cli exec node dist/index.js index .
pnpm --filter @repobrain/cli exec node dist/index.js status .
```

Open the local UI:

```bash
REPOBRAIN_PROJECT_ROOT="$PWD" pnpm --filter @repobrain/desktop-web dev
```

Then visit `http://localhost:3000/ui`.

## CLI Overview

All commands run against the current directory unless a repo path or explicit `--repo` flag is provided.

```bash
pnpm --filter @repobrain/cli exec node dist/index.js search "where is provider resolution handled"
pnpm --filter @repobrain/cli exec node dist/index.js context "add a new provider" --mode balanced
pnpm --filter @repobrain/cli exec node dist/index.js map .
pnpm --filter @repobrain/cli exec node dist/index.js critical-path "provider changes"
pnpm --filter @repobrain/cli exec node dist/index.js trace .
pnpm --filter @repobrain/cli exec node dist/index.js trace replay .
pnpm --filter @repobrain/cli exec node dist/index.js config .
```

## Example Output

These are shortened example output excerpts from the current CLI.

### Search

```bash
node apps/cli/dist/index.js search "where is provider resolution handled"
```

```text
Cream Soda search
Query: where is provider resolution handled
Mode: hybrid
Semantic: fallback
Results: 8

Top matches
1. packages/providers/src/resolver.ts:1-80 score=180
   Why: architecture role match: provider; source-of-truth implementation file; provider resolution path
```

### Context Pack

```bash
node apps/cli/dist/index.js context "add a new provider" --mode balanced
```

```text
Cream Soda context pack
Query: add a new provider
Mode: balanced
Tokens: 1602/3600
Files: 6

Why this pack
Selected primary implementation files, supporting config/runtime files, and adjacent integration files based on retrieval score, architecture role, and query match.
```

### Critical Path

```bash
node apps/cli/dist/index.js critical-path "provider changes"
```

```text
Cream Soda critical path
Query: provider changes
Central files: 12
Likely blockers: 10
Risky files: 10

Central files
- packages/providers/src/index.ts
  score=69 role=provider zone=danger
  factors=query relevance, dependency centrality, architecture role, risk
```

### Trace

```bash
node apps/cli/dist/index.js trace
```

```text
Cream Soda session trace
Retrieval events: 3
Context packs: 2
Trace events: 63
Session steps: 66
```


## MCP Overview

When using stdio MCP, launch the server from the authorized repository root. Stdio rejects selection of a different root argument and forces tool calls to the launch root; this is not yet a filesystem sandbox. Agents cannot call `clear_index` through stdio. See [MCP trust boundary](docs/mcp-trust-boundary.md) for remaining limitations. Do not run this first hardening slice against untrusted repositories with access to unrelated private files.

Cream Soda exposes a stdio MCP transport for agent hosts and keeps a local JSON runner for smoke tests. Each tool returns a versioned `mcp.v1` envelope with `ok`, `tool`, `sessionId`, `requestId`, `data`, and `meta` fields.

```bash
pnpm --filter @repobrain/mcp-server start
pnpm --filter @repobrain/mcp-server exec node dist/index.js \
  --tool get_context_pack \
  --repo "$PWD" \
  --session local-agent-session \
  --query "add a new provider" \
  --mode quick
```

Stdio tools in scope: `index_codebase`, `search_code`, `get_context_pack`, `get_architecture_map`, `get_critical_path`, `explain_retrieval`, `get_session_trace`, and `get_index_status`. The operator-facing local runner additionally exposes `clear_index`.

## Why Not Just Use Code Search?

Code search finds text. Cream Soda adds local repo memory around that text: architecture roles, danger-zone hints, dependency-aware critical paths, token-budgeted context packs, session traces, and explainable ranking factors. The goal is not to replace grep. The goal is to give coding agents a compact, trusted view of what matters for a task.

## How It Works

1. `repobrain init` creates a local `.repobrain/` project store and config.
2. `repobrain index` discovers safe files, chunks content, extracts symbols, and skips ignored/sensitive paths.
3. Search combines exact, keyword, local semantic fallback, path-role weighting, and structured score factors.
4. Context packs select ranked chunks under a token budget and explain why files were included.
5. Taxonomy and dependency maps power critical-path hints and traceable agent-facing MCP responses.

## Architecture Snapshot

Cream Soda is a pnpm/Turborepo workspace with local UI and docs apps plus focused packages for config, storage, providers, indexing, retrieval, taxonomy, graph analysis, session memory, observability, orchestration, shared types, UI primitives, and testing.

Runtime surfaces:

- `apps/cli`: terminal workflow for init, indexing, retrieval, context, map, critical path, trace, config, and status.
- `apps/mcp-server`: stdio MCP server and JSON runner for agent-facing tool calls.
- `apps/desktop-web`: local Next.js UI for search, context packs, repo map, critical path, trace, and config.
- `apps/docs-site`: concise docs surface for launch and release validation.

## Environment And Security

Start from `.env.example`. Provider keys are optional for the MVP; when missing, retrieval remains local and marks remote semantic behavior as `fallback`. Configure `local-embedding` to enable deterministic local semantic scoring without a cloud call.

Cream Soda stores project metadata in the legacy-compatible `.repobrain/` directory and ignores that directory by default. It is designed around explicit local paths, ignored/sensitive path rules, UI-safe config exposure, and redacted provider secret handling. There is no silent cloud sync in the MVP.

## Roadmap

- Broaden ranking evaluation queries against larger fixture repos.
- Add optional local filesystem watcher support.
- Improve source/generated artifact pairing for more build systems.
- Expand optional provider adapters without making cloud services required.
- Prepare package publishing once the source-distributed MVP has settled.

## Release Smoke Test

Use `docs/smoke-test.md` before tagging a release or publishing a demo branch.

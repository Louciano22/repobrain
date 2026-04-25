# RepoBrain Release Smoke Test

Run this checklist before tagging a release or sharing a demo branch.

## Workspace

```bash
pnpm install
pnpm build
pnpm check
pnpm test
pnpm --filter @repobrain/cli exec node dist/index.js --help
pnpm --filter @repobrain/mcp-server exec node dist/index.js
```

Expected result:

- Build exits successfully.
- CLI help lists `init`, `index`, `search`, `context`, `map`, `critical-path`, `trace`, `config`, and `status`.
- MCP contract output includes `version: "mcp.v1"` and all tool contracts.
- Smoke tests cover duplicate indexing, sensitive path skipping, stale index detection, invalid config, missing repo, and MCP envelopes.

## Local Project Flow

```bash
cp .env.example .env.local
pnpm --filter @repobrain/cli exec node dist/index.js init .
pnpm --filter @repobrain/cli exec node dist/index.js index .
pnpm --filter @repobrain/cli exec node dist/index.js search "where is provider resolution handled"
pnpm --filter @repobrain/cli exec node dist/index.js context "add a new provider" --mode balanced
pnpm --filter @repobrain/cli exec node dist/index.js trace replay .
pnpm --filter @repobrain/cli exec node dist/index.js map .
pnpm --filter @repobrain/cli exec node dist/index.js critical-path "provider changes"
pnpm --filter @repobrain/cli exec node dist/index.js trace .
pnpm --filter @repobrain/cli exec node dist/index.js status .
```

Expected result:

- `.repobrain/config.json` and `.repobrain/store.json` are created.
- `index` reports file, chunk, and symbol counts.
- Search returns local results with semantic fallback when no embedding provider is configured.
- Context packs include files, token counts, explanations, and content.
- Map, critical path, and trace commands return local persisted data.

## MCP Tool Flow

```bash
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool index_codebase --repo "$PWD" --session smoke
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool search_code --repo "$PWD" --session smoke --query "where is provider resolution handled"
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool get_context_pack --repo "$PWD" --session smoke --query "add a new provider" --mode quick
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool get_architecture_map --repo "$PWD" --session smoke
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool get_critical_path --repo "$PWD" --session smoke
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool explain_retrieval --repo "$PWD" --session smoke
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool get_session_trace --repo "$PWD" --session smoke
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool get_index_status --repo "$PWD" --session smoke
```

Expected result:

- Every response is valid JSON.
- Every response has `version: "mcp.v1"`, `sessionId`, `requestId`, `data`, and `meta.contract`.
- Invalid input returns a safe error envelope, for example:

```bash
pnpm --filter @repobrain/mcp-server exec node dist/index.js --tool search_code --repo "$PWD" --session smoke
```

For an MCP-compatible host, use stdio mode:

```bash
pnpm --filter @repobrain/mcp-server start
```

## Local UI And Docs

```bash
REPOBRAIN_PROJECT_ROOT="$PWD" pnpm --filter @repobrain/desktop-web dev
pnpm --filter @repobrain/docs-site dev
```

Expected result:

- `/`, `/docs`, `/ui`, `/ui/search?q=where%20is%20provider%20resolution%20handled`, `/ui/context-packs?q=add%20a%20new%20provider&mode=balanced`, `/ui/repo-map`, `/ui/critical-path?q=provider%20changes`, `/ui/session-trace`, and `/ui/config` render.
- Docs home includes install, CLI, MCP, env, and smoke-test guidance.
- Mobile width does not break the docs or local UI shells.

## Release Notes

- Confirm `.repobrain/`, `.env.local`, build outputs, and provider secrets are not committed.
- Confirm `.env.example` contains placeholders only.
- Confirm package publish status is accurate in `README.md`.

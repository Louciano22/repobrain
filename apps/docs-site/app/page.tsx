export default function DocsHomePage() {
  return (
    <main className="docs-shell">
      <nav className="docs-nav">
        <strong>RepoBrain Docs</strong>
        <div>
          <a href="#what">What</a>
          <a href="#install">Install</a>
          <a href="#cli">CLI</a>
          <a href="#mcp">MCP</a>
          <a href="#features">Features</a>
          <a href="#trace">Trace</a>
          <a href="#release">Release</a>
        </div>
      </nav>

      <section className="docs-panel hero">
        <p className="eyebrow">Local-first · model-agnostic · open-source</p>
        <h1>Stop making coding agents rediscover your repo.</h1>
        <p>
          RepoBrain is local-first, architecture-aware, model-agnostic repo intelligence for AI coding agents. It exposes
          ranked search, context packs, critical-path hints, trace data, and MCP tools from a project-local store.
        </p>
        <div className="docs-actions">
          <a href="#install">Install</a>
          <a href="#mcp">MCP tools</a>
          <a href="#smoke">Smoke test</a>
        </div>
      </section>

      <section className="docs-grid" id="what">
        <article className="docs-panel">
          <p className="eyebrow">What is RepoBrain?</p>
          <h2>A local repo memory layer.</h2>
          <p>
            RepoBrain indexes files, chunks, symbols, taxonomy labels, dependency edges, context packs, and traces into
            `.repobrain/` so agents can ask for bounded repo context.
          </p>
        </article>
        <article className="docs-panel">
          <p className="eyebrow">Why it exists</p>
          <h2>Agents start cold.</h2>
          <p>
            Repo discovery, repeated context stuffing, architecture drift, and opaque long-running sessions waste tokens
            before real engineering work starts.
          </p>
        </article>
      </section>

      <section className="docs-panel" id="install">
        <p className="eyebrow">Get started</p>
        <h2>Install from a workspace checkout.</h2>
        <p>RepoBrain is currently source-distributed. Packages are private and not configured for npm publishing yet.</p>
        <pre>{`pnpm install
pnpm build
cp .env.example .env.local
pnpm --filter @repobrain/cli exec node dist/index.js init .
pnpm --filter @repobrain/cli exec node dist/index.js index .
pnpm --filter @repobrain/cli exec node dist/index.js status .`}</pre>
      </section>

      <section className="docs-grid" id="cli">
        <article className="docs-panel">
          <p className="eyebrow">CLI workflow</p>
          <h2>Index, retrieve, map, trace.</h2>
          <pre>{`pnpm --filter @repobrain/cli exec node dist/index.js search "where is provider resolution handled"
pnpm --filter @repobrain/cli exec node dist/index.js context "add a new provider" --mode balanced
pnpm --filter @repobrain/cli exec node dist/index.js map .
pnpm --filter @repobrain/cli exec node dist/index.js critical-path "provider changes"
pnpm --filter @repobrain/cli exec node dist/index.js trace .`}</pre>
        </article>
        <article className="docs-panel">
          <p className="eyebrow">Local UI</p>
          <h2>Screenshot-ready local views.</h2>
          <pre>{`REPOBRAIN_PROJECT_ROOT="$PWD" pnpm --filter @repobrain/desktop-web dev`}</pre>
          <p>
            Open <code>/ui/search?q=where%20is%20provider%20resolution%20handled</code>,{" "}
            <code>/ui/context-packs?q=add%20a%20new%20provider&mode=balanced</code>, or{" "}
            <code>/ui/critical-path?q=provider%20changes</code>.
          </p>
        </article>
      </section>

      <section className="docs-panel" id="mcp">
        <p className="eyebrow">Agent integration</p>
        <h2>MCP-facing tool envelopes.</h2>
        <p>
          The MCP server supports stdio for agent hosts and a JSON runner for local smoke tests. Responses use stable
          <code>mcp.v1</code> envelopes with tool contracts, request IDs, session IDs, explanation metadata, and safe
          fallback details.
        </p>
          <pre>{`pnpm --filter @repobrain/mcp-server start
pnpm --filter @repobrain/mcp-server exec node dist/index.js \\
  --tool get_context_pack \\
  --repo "$PWD" \\
  --session local-agent-session \\
  --query "add a new provider" \\
  --mode quick`}</pre>
      </section>

      <section className="docs-grid" id="features">
        <article className="docs-panel">
          <p className="eyebrow">Context packs</p>
          <h2>Budgeted context with reasons.</h2>
          <p>
            Context packs group primary implementation files, supporting config/runtime files, adjacent integrations,
            and test coverage when relevant. Modes are <code>quick</code>, <code>balanced</code>, and <code>deep</code>.
          </p>
        </article>
        <article className="docs-panel">
          <p className="eyebrow">Critical path</p>
          <h2>What is most likely to matter?</h2>
          <p>
            Critical-path output blends query relevance, dependency centrality, architecture role, and risk so agents
            start with the highest-leverage files.
          </p>
        </article>
        <article className="docs-panel">
          <p className="eyebrow">Trace</p>
          <h2>Observe the local session.</h2>
          <p>
            Trace views summarize retrieval events, context pack assembly, MCP calls, and recent session steps without
            sending local repo data to a cloud service.
          </p>
        </article>
        <article className="docs-panel">
          <p className="eyebrow">Demo commands</p>
          <h2>Copy-paste launch examples.</h2>
          <pre>{`node apps/cli/dist/index.js search "where is provider resolution handled"
node apps/cli/dist/index.js context "add a new provider" --mode balanced
node apps/cli/dist/index.js critical-path "provider changes"
node apps/cli/dist/index.js trace`}</pre>
        </article>
      </section>

      <section className="docs-grid" id="trace">
        <article className="docs-panel">
          <p className="eyebrow">Trace / replay</p>
          <h2>Local observability for agent runs.</h2>
          <p>
            Trace output summarizes retrieval events, context pack assembly, MCP calls, trace events, and recent session
            steps. Replay reads the same local session memory.
          </p>
          <pre>{`node apps/cli/dist/index.js trace
node apps/cli/dist/index.js trace replay`}</pre>
        </article>
        <article className="docs-panel">
          <p className="eyebrow">Screenshot slots</p>
          <h2>Launch asset targets.</h2>
          <p>
            Capture terminal search, terminal context pack, terminal critical path, UI search, UI context pack, UI
            critical path, and a short CLI-to-UI demo GIF. Suggested paths live in the root README.
          </p>
        </article>
      </section>

      <section className="docs-grid" id="release">
        <article className="docs-panel">
          <p className="eyebrow">Environment</p>
          <h2>No required cloud secrets.</h2>
          <p>
            Start with <code>.env.example</code>. Provider keys are optional; <code>local-embedding</code> enables local
            semantic scoring, and missing remote providers are reported as safe fallback metadata.
          </p>
        </article>
        <article className="docs-panel" id="smoke">
          <p className="eyebrow">Release checklist</p>
          <h2>Smoke test before sharing.</h2>
          <p>
            Follow <code>docs/smoke-test.md</code> to validate build, CLI, MCP tools, local UI routes, env templates, and
            secret hygiene.
          </p>
        </article>
      </section>
    </main>
  );
}

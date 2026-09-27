import Link from "next/link";

export default function DocsPage() {
  return (
    <main className="marketing-shell docs-home">
      <header className="marketing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">RB</span>
          <span>
            <strong>Cream Soda Docs</strong>
            <small>install · configure · integrate</small>
          </span>
        </Link>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/ui">Local UI</Link>
          <a href="https://github.com/Louciano22/louchi-templates">GitHub</a>
        </nav>
      </header>

      <section className="hero-panel">
        <p className="eyebrow">Docs home</p>
        <h1>Local repo memory for AI coding agents.</h1>
        <p className="hero-copy">
          Cream Soda is local-first, architecture-aware, model-agnostic repository intelligence. Start with init and indexing,
          then use ranked retrieval, context packs, critical-path hints, and trace views.
        </p>
        <div className="cta-row">
          <a className="button button-primary" href="#install">
            Get started
          </a>
          <Link className="button" href="/ui/config">
            Configure providers
          </Link>
          <a className="button" href="https://github.com/Louciano22/louchi-templates">
            GitHub
          </a>
        </div>
      </section>

      <section className="marketing-grid two">
        <article className="marketing-card" id="install">
          <p className="eyebrow">Install</p>
          <pre>{`pnpm install
pnpm build
pnpm --filter @repobrain/cli exec node dist/index.js init .
pnpm --filter @repobrain/cli exec node dist/index.js index .`}</pre>
        </article>
        <article className="marketing-card">
          <p className="eyebrow">Use</p>
          <h2>CLI and MCP first.</h2>
          <p>
            Cream Soda is designed for coding-agent workflows: initialize local state, inspect ranked explanations, then
            connect the stdio MCP server or JSON runner to request bounded repo context.
          </p>
        </article>
      </section>

      <section className="marketing-grid">
        <article className="marketing-card compact">
          <h2>Local-first storage</h2>
          <p>Project metadata lives in `.repobrain/`.</p>
        </article>
        <article className="marketing-card compact">
          <h2>Provider agnostic</h2>
          <p>Local defaults, explicit remote opt-in.</p>
        </article>
        <article className="marketing-card compact">
          <h2>Explainable retrieval</h2>
          <p>Search, context packs, critical path, trace, and replay use structured score factors.</p>
        </article>
      </section>

      <section className="marketing-grid two">
        <article className="marketing-card">
          <p className="eyebrow">CLI examples</p>
          <pre>{`node apps/cli/dist/index.js search "where is provider resolution handled"
node apps/cli/dist/index.js context "add a new provider" --mode balanced
node apps/cli/dist/index.js critical-path "provider changes"
node apps/cli/dist/index.js trace`}</pre>
        </article>
        <article className="marketing-card">
          <p className="eyebrow">MCP</p>
          <h2>Agent-facing tool responses.</h2>
          <p>
            The MCP server exposes indexed search, context packs, architecture maps, critical path, retrieval
            explanations, session trace, index status, and clear-index tools through stable local envelopes.
          </p>
        </article>
      </section>
    </main>
  );
}

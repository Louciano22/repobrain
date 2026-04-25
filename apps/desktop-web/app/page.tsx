import Link from "next/link";

const features = [
  "Local repo indexing",
  "Hybrid semantic + exact retrieval",
  "Architecture-aware context packs",
  "Safe/danger zone tagging",
  "Critical-path hints",
  "MCP server and session trace"
];

const steps = [
  "Initialize a repo-local .repobrain store.",
  "Map files, symbols, chunks, dependency edges, and provider config.",
  "Serve bounded context packs to CLI, MCP clients, and the local UI."
];

export default function HomePage() {
  return (
    <main className="marketing-shell">
      <header className="marketing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">RB</span>
          <span>
            <strong>RepoBrain</strong>
            <small>local-first repo intelligence</small>
          </span>
        </Link>
        <nav>
          <Link href="/docs">Docs</Link>
          <Link href="/ui">Local UI</Link>
          <a href="https://github.com/Louciano22/louchi-templates">GitHub</a>
        </nav>
      </header>

      <section className="hero-panel">
        <p className="eyebrow">Local-first · model-agnostic · open-source</p>
        <h1>Stop making coding agents rediscover your repo.</h1>
        <p className="hero-copy">
          RepoBrain is local-first, architecture-aware, model-agnostic repo intelligence for AI coding agents working in
          real codebases.
        </p>
        <div className="cta-row">
          <a className="button button-primary" href="#install">
            Install
          </a>
          <Link className="button" href="/docs">
            View docs
          </Link>
          <a className="button" href="https://github.com/Louciano22/louchi-templates">
            GitHub
          </a>
        </div>
      </section>

      <section className="marketing-grid two">
        <article className="marketing-card">
          <p className="eyebrow">Problem</p>
          <h2>Agents waste context before they start working.</h2>
          <p>
            Repo discovery, repeated manual context stuffing, architecture drift, and opaque long-running agent behavior
            burn tokens and slow down real engineering work.
          </p>
        </article>
        <article className="marketing-card">
          <p className="eyebrow">Trust model</p>
          <h2>Local runtime first.</h2>
          <p>
            RepoBrain starts from a project-local store, explicit provider configuration, and safe filesystem boundaries.
            Remote providers are optional, never assumed.
          </p>
        </article>
      </section>

      <section className="marketing-card">
        <p className="eyebrow">How it works</p>
        <div className="step-list">
          {steps.map((step, index) => (
            <div className="step" key={step}>
              <strong>{index + 1}</strong>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-grid">
        {features.map((feature) => (
          <article className="marketing-card compact" key={feature}>
            <h2>{feature}</h2>
          </article>
        ))}
      </section>

      <section className="marketing-grid two">
        <article className="marketing-card">
          <p className="eyebrow">Architecture snapshot</p>
          <h2>CLI + MCP + local UI over one project-local schema.</h2>
          <p>
            The foundation is split into packages for config, storage, providers, indexing, retrieval, graph, taxonomy,
            session memory, and observability.
          </p>
        </article>
        <article className="marketing-card" id="install">
          <p className="eyebrow">Get started</p>
          <pre>{`pnpm install
pnpm build
pnpm --filter @repobrain/cli exec node dist/index.js init .
pnpm --filter @repobrain/cli exec node dist/index.js index .`}</pre>
          <div className="cta-row">
            <Link className="button button-primary" href="/docs">
              Read install docs
            </Link>
            <Link className="button" href="/ui/config">
              Open config UI
            </Link>
          </div>
        </article>
      </section>

      <section className="marketing-card">
        <p className="eyebrow">OSS roadmap</p>
        <p>
          Current MVP: indexing, local semantic-ready retrieval, context packs, taxonomy, critical-path mapping, MCP
          stdio tools, local UI pages, ranking evals, and trace replay. Next milestones focus on local watcher support,
          richer optional provider adapters, and deeper automated test coverage.
        </p>
      </section>
    </main>
  );
}

import { searchCodebase } from "@repobrain/retrieval";
import { ShellPanel, ShellState } from "@repobrain/ui";
import { AppShell } from "../../shell";
import { summarizeFactors } from "../explain";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const repoRoot = process.env.REPOBRAIN_PROJECT_ROOT ?? process.cwd();

  let body: React.ReactNode;
  if (!query) {
    body = (
      <section className="shell-grid">
        <ShellState state="empty" title="No query yet" detail="Add ?q=your-symbol-or-topic to run local hybrid search." />
        <ShellState state="loading" title="Loading state" detail="Search results stream from local store reads." />
        <ShellState state="success" title="Success state" detail="Results include score, file range, and inclusion reasons." />
      </section>
    );
  } else {
    try {
      const result = searchCodebase({ repoRoot, query, limit: 12 });
      body =
        result.results.length === 0 ? (
          <ShellState state="empty" title="No matches" detail={`No indexed chunks matched "${query}".`} />
        ) : (
          <section className="config-list">
            <ShellPanel title={`Results for "${result.query}"`}>
              <div className="metric-row">
                <span>Mode: {result.mode}</span>
                <span>Semantic: {result.semanticStatus}</span>
                <span>Results: {result.results.length}</span>
              </div>
            </ShellPanel>
            {result.results.map((item, index) => (
              <div className="config-row" key={item.chunk.id}>
                <div className="result-heading">
                  <strong>
                    {index + 1}. {item.chunk.path}:{item.chunk.startLine}-{item.chunk.endLine}
                  </strong>
                  <span className="score-pill">score {item.score}</span>
                </div>
                <span>Why: {summarizeFactors(item.factors, item.reasons)}</span>
                <pre className="compact-code">{item.chunk.content.slice(0, 900)}</pre>
              </div>
            ))}
          </section>
        );
    } catch (error) {
      body = (
        <ShellState
          state="error"
          title="Search unavailable"
          detail={error instanceof Error ? error.message : "RepoBrain search failed safely."}
        />
      );
    }
  }

  return (
    <AppShell
      title="Search"
      subtitle="Ranked local retrieval with score, semantic status, file ranges, and concise factor-backed reasons."
    >
      {body}
    </AppShell>
  );
}

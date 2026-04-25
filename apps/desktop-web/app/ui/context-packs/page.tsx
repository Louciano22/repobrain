import { buildContextPack } from "@repobrain/retrieval";
import { ShellPanel, ShellState } from "@repobrain/ui";
import { AppShell } from "../../shell";
import { contextPackSummary, fileGroup, summarizeFactors } from "../explain";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ q?: string; mode?: string }>;
};

export default async function ContextPacksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const repoRoot = process.env.REPOBRAIN_PROJECT_ROOT ?? process.cwd();
  const mode = params?.mode === "quick" || params?.mode === "balanced" || params?.mode === "deep" ? params.mode : "balanced";

  let body: React.ReactNode;
  if (!query) {
    body = (
      <section className="shell-grid">
        <ShellState
          state="empty"
          title="No context pack yet"
          detail="Add ?q=task-intent&mode=quick|balanced|deep to generate a local pack."
        />
        <ShellState state="loading" title="Loading state" detail="Pack generation reads only the local index." />
        <ShellState state="success" title="Success state" detail="Packs explain files, reasons, budget, and mode." />
      </section>
    );
  } else {
    try {
      const result = buildContextPack({ repoRoot, query, mode });
      const groups = [
        { id: "primary", title: "Primary implementation files" },
        { id: "supporting", title: "Supporting config/runtime files" },
        { id: "integration", title: "Adjacent integration files" },
        { id: "coverage", title: "Test coverage files" }
      ] as const;
      body =
        result.results.length === 0 ? (
          <ShellState state="empty" title="No context available" detail={`No indexed chunks matched "${query}".`} />
        ) : (
          <section className="config-list">
            <ShellPanel title={`Context pack ${result.pack.id}`}>
              <div className="metric-row">
                <span>Query: {result.pack.query}</span>
                <span>Mode: {result.pack.mode}</span>
                <span>
                  Tokens: {result.pack.tokenEstimate}/{result.pack.tokenBudget}
                </span>
                <span>Files: {result.pack.files.length}</span>
              </div>
              <p>Why this pack: {contextPackSummary(result.results)}</p>
            </ShellPanel>
            {groups.map((group) => {
              const entries = result.results.filter((item) => fileGroup(item.chunk.path) === group.id);
              if (entries.length === 0) return null;
              return (
                <ShellPanel title={group.title} key={group.id}>
                  <div className="mini-list">
                    {entries.map((item) => (
                      <div className="mini-row" key={item.chunk.id}>
                        <strong>
                          {item.chunk.path}:{item.chunk.startLine}-{item.chunk.endLine}
                        </strong>
                        <span className="score-pill">score {item.score}</span>
                        <small>{summarizeFactors(item.factors, item.reasons)}</small>
                      </div>
                    ))}
                  </div>
                </ShellPanel>
              );
            })}
            <ShellPanel title="Why these chunks were included">
              <ul>
                {result.pack.explanation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ShellPanel>
            <pre className="compact-code">{result.content}</pre>
          </section>
        );
    } catch (error) {
      body = (
        <ShellState
          state="error"
          title="Context generation unavailable"
          detail={error instanceof Error ? error.message : "RepoBrain context pack generation failed safely."}
        />
      );
    }
  }

  return (
    <AppShell
      title="Context Packs"
      subtitle="Budgeted task context grouped by implementation, runtime support, adjacent integration, and test coverage."
    >
      {body}
    </AppShell>
  );
}

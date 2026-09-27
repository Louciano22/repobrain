import { getCriticalPath } from "@repobrain/graph";
import { ShellPanel, ShellState } from "@repobrain/ui";
import { AppShell } from "../../shell";
import { criticalFactorLabels, summarizeFactors } from "../explain";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ q?: string }>;
};

function HintCard({ hint }: { hint: ReturnType<typeof getCriticalPath>["centralFiles"][number] }) {
  return (
    <div className="config-row">
      <div className="result-heading">
        <strong>{hint.path}</strong>
        <span className="score-pill">score {hint.score}</span>
      </div>
      <span>
        role={hint.role} · zone={hint.zone} · factors={criticalFactorLabels(hint).join(", ")}
      </span>
      <span>Why: {summarizeFactors(hint.factors, hint.reasons)}</span>
      <span>Adjacent: {hint.adjacentDependencies.slice(0, 6).join(", ") || "none detected"}</span>
      <span>Blockers: {hint.blockers.join(", ") || "none detected"}</span>
    </div>
  );
}

export default async function CriticalPathPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const repoRoot = process.env.REPOBRAIN_PROJECT_ROOT ?? process.cwd();
  let body: React.ReactNode;

  try {
    const result = getCriticalPath(repoRoot, query);
    body =
      result.centralFiles.length === 0 ? (
        <ShellState state="empty" title="No critical path yet" detail="Run `repobrain index` and `repobrain map` first." />
      ) : (
        <section className="config-list">
          <ShellPanel title="Critical path summary">
            <div className="metric-row">
              <span>Query: {query || "global graph"}</span>
              <span>Generated: {result.generatedAt}</span>
              <span>Central files: {result.centralFiles.length}</span>
              <span>Likely blockers: {result.likelyBlockers.length}</span>
              <span>Risky files: {result.riskyFiles.length}</span>
            </div>
          </ShellPanel>
          <ShellPanel title="Central files">
            <div className="config-list">
              {result.centralFiles.slice(0, 10).map((hint) => (
                <HintCard hint={hint} key={hint.path} />
              ))}
            </div>
          </ShellPanel>
          <ShellPanel title="Likely blockers">
            <div className="mini-list">
              {result.likelyBlockers.slice(0, 8).map((hint) => (
                <div className="mini-row" key={hint.path}>
                  <strong>{hint.path}</strong>
                  <small>{hint.blockers.join(", ") || "none detected"}</small>
                  <small>Factors: {criticalFactorLabels(hint).join(", ")}</small>
                </div>
              ))}
            </div>
          </ShellPanel>
          <ShellPanel title="Risky files">
            <div className="mini-list">
              {result.riskyFiles.slice(0, 8).map((hint) => (
                <div className="mini-row" key={hint.path}>
                  <strong>{hint.path}</strong>
                  <small>
                    role={hint.role} · score={hint.score} · adjacent={hint.adjacentDependencies.length}
                  </small>
                </div>
              ))}
            </div>
          </ShellPanel>
        </section>
      );
  } catch (error) {
    body = (
      <ShellState
        state="error"
        title="Critical path unavailable"
        detail={error instanceof Error ? error.message : "Cream Soda critical-path generation failed safely."}
      />
    );
  }

  return (
    <AppShell
      title="Critical Path"
      subtitle="Central files, likely blockers, risky files, and score factors for the current task query."
    >
      {body}
    </AppShell>
  );
}

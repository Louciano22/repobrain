import { getSessionTrace } from "@repobrain/session-memory";
import { ShellPanel, ShellState } from "@repobrain/ui";
import { AppShell } from "../../shell";

export const dynamic = "force-dynamic";

export default function SessionTracePage() {
  const repoRoot = process.env.REPOBRAIN_PROJECT_ROOT ?? process.cwd();
  let body: React.ReactNode;

  try {
    const trace = getSessionTrace(repoRoot);
    const hasEvents = trace.retrievalEvents.length + trace.contextPacks.length + trace.traceEvents.length > 0;
    body = !hasEvents ? (
      <ShellState state="empty" title="No trace events yet" detail="Run search, context, map, or critical-path commands first." />
    ) : (
      <section className="config-list">
        <ShellPanel title="Trace summary">
          <p>
            Retrieval events: {trace.retrievalEvents.length} · Context packs: {trace.contextPacks.length} · Trace
            events: {trace.traceEvents.length} · Session steps: {trace.sessionSteps.length}
          </p>
        </ShellPanel>
        {trace.traceEvents.slice(0, 18).map((event) => (
          <div className="config-row" key={event.id}>
            <strong>
              {event.kind}/{event.action}
            </strong>
            <span>{event.createdAt}</span>
            <span>{event.message}</span>
          </div>
        ))}
        {trace.contextPacks.slice(0, 8).map((pack) => (
          <div className="config-row" key={pack.id}>
            <strong>
              context_pack/{pack.mode}: {pack.query}
            </strong>
            <span>
              Files: {pack.files.join(", ")} · Tokens: {pack.tokenEstimate}/{pack.tokenBudget}
            </span>
            <span>{pack.explanation.join("; ")}</span>
          </div>
        ))}
      </section>
    );
  } catch (error) {
    body = (
      <ShellState
        state="error"
        title="Session trace unavailable"
        detail={error instanceof Error ? error.message : "Cream Soda session trace failed safely."}
      />
    );
  }

  return (
    <AppShell title="Session Trace" subtitle="Local retrieval events, context pack assembly, and trace explanations.">
      {body}
    </AppShell>
  );
}

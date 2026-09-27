import { buildArchitectureMap } from "@repobrain/taxonomy";
import { ShellPanel, ShellState } from "@repobrain/ui";
import { AppShell } from "../../shell";

export const dynamic = "force-dynamic";

export default function RepoMapPage() {
  const repoRoot = process.env.REPOBRAIN_PROJECT_ROOT ?? process.cwd();
  let body: React.ReactNode;

  try {
    const map = buildArchitectureMap(repoRoot);
    body =
      map.labels.length === 0 ? (
        <ShellState state="empty" title="No indexed files" detail="Run `repobrain index` before building the repo map." />
      ) : (
        <section className="config-list">
          <ShellPanel title="Taxonomy summary">
            <p>
              Files: {map.summary.files} · Safe: {map.summary.safe} · Core: {map.summary.core} · Danger:{" "}
              {map.summary.danger} · Edges: {map.edges.length}
            </p>
          </ShellPanel>
          <ShellPanel title="Architecture roles">
            <ul>
              {Object.entries(map.summary.roles)
                .sort((left, right) => right[1] - left[1])
                .map(([role, count]) => (
                  <li key={role}>
                    {role}: {count}
                  </li>
                ))}
            </ul>
          </ShellPanel>
          {map.labels.slice(0, 24).map((label) => (
            <div className="config-row" key={label.id}>
              <strong>
                {label.path} · {label.zone} · {label.role}
              </strong>
              <span>{label.reasons.join("; ")}</span>
            </div>
          ))}
        </section>
      );
  } catch (error) {
    body = (
      <ShellState
        state="error"
        title="Repo map unavailable"
        detail={error instanceof Error ? error.message : "Cream Soda taxonomy failed safely."}
      />
    );
  }

  return (
    <AppShell title="Repo Map" subtitle="Rules-based local taxonomy, safe/danger zones, and dependency edges.">
      {body}
    </AppShell>
  );
}

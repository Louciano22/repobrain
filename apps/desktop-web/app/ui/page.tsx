import { getProjectOverview } from "@repobrain/storage";
import { ShellPanel, ShellState } from "@repobrain/ui";
import { AppShell } from "../shell";

export const dynamic = "force-dynamic";

export default function UiPage() {
  const repoRoot = process.env.REPOBRAIN_PROJECT_ROOT ?? process.cwd();
  const overview = getProjectOverview(repoRoot);

  return (
    <AppShell title="Control Plane" subtitle="Local UI shell for repo map, context, trace, and config views.">
      {overview.initialized ? (
        <>
          <section className="shell-grid">
            <ShellState state="success" title="Initialized" detail={overview.project.name} />
            <ShellState state="success" title="Repo root" detail={overview.repoRoot} />
            <ShellState state="success" title="Registered tables" detail={String(Object.keys(overview.tableCounts).length)} />
          </section>
          <ShellPanel title="Local store">
            <p>Project state is loaded from the project-local `.repobrain` store.</p>
          </ShellPanel>
        </>
      ) : (
        <>
          <ShellState state="empty" title="Not initialized" detail={`Run repobrain init for ${overview.repoRoot}.`} />
          <ShellPanel title="Local store">
            <p>No project-local `.repobrain` store was found for this repo root.</p>
          </ShellPanel>
        </>
      )}
    </AppShell>
  );
}

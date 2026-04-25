import Link from "next/link";
import type { Route } from "next";
import { ShellPanel, ShellState } from "@repobrain/ui";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/ui", label: "Overview" },
  { href: "/ui/search", label: "Search" },
  { href: "/ui/context-packs", label: "Context Packs" },
  { href: "/ui/repo-map", label: "Repo Map" },
  { href: "/ui/critical-path", label: "Critical Path" },
  { href: "/ui/session-trace", label: "Session Trace" },
  { href: "/ui/config", label: "Config" }
];

export function AppShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">RB</span>
          <span>
            <strong>RepoBrain</strong>
            <small>local-first control plane</small>
          </span>
        </Link>
        <nav aria-label="RepoBrain shell routes">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <div className="topbar">
          <span>Local runtime shell</span>
          <span>CLI · MCP · UI</span>
        </div>
        <header className="page-header">
          <p className="eyebrow">Foundation shell</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
        {children}
      </section>
    </main>
  );
}

export function RouteShell({ title, description }: { title: string; description: string }) {
  return (
    <AppShell title={title} subtitle={description}>
      <section className="shell-grid">
        <ShellState state="loading" title="Loading state" detail="Reserved for runtime data fetches." />
        <ShellState state="empty" title="Empty state" detail="Reserved for first-run local projects." />
        <ShellState state="error" title="Error state" detail="Reserved for local runtime failures." />
      </section>
      <ShellPanel title="Success state">
        <p>This route shell is wired and ready for local runtime data.</p>
      </ShellPanel>
    </AppShell>
  );
}

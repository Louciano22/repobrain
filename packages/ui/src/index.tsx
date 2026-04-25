import type { ReactNode } from "react";
import type { RuntimeState } from "@repobrain/shared-types";

export const designTokens = {
  color: {
    background: "#05070b",
    panel: "#0b111a",
    border: "#1d2a3a",
    text: "#eef5ff",
    muted: "#8a9bb0",
    accent: "#42f59b",
    info: "#6ca6ff",
    warning: "#f6c45c",
    danger: "#ff6b7a"
  }
} as const;

export function ShellBadge({ children }: { children: ReactNode }) {
  return <span className="shell-badge">{children}</span>;
}

export function ShellPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="shell-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ShellState({
  state,
  title,
  detail
}: {
  state: RuntimeState;
  title: string;
  detail: string;
}) {
  return (
    <div className={`shell-state shell-state-${state}`} role={state === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

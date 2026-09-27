import Link from "next/link";
import { ShellState } from "@repobrain/ui";

export default function NotFound() {
  return (
    <main className="workspace" aria-label="Cream Soda not found">
      <ShellState
        state="empty"
        title="Route not found"
        detail="This Cream Soda page does not exist. Return to the local UI overview."
      />
      <Link className="button button-primary" href="/ui">
        Open Cream Soda UI
      </Link>
    </main>
  );
}

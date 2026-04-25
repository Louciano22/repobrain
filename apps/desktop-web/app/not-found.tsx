import Link from "next/link";
import { ShellState } from "@repobrain/ui";

export default function NotFound() {
  return (
    <main className="workspace" aria-label="RepoBrain not found">
      <ShellState
        state="empty"
        title="Route not found"
        detail="This RepoBrain page does not exist. Return to the local UI overview."
      />
      <Link className="button button-primary" href="/ui">
        Open RepoBrain UI
      </Link>
    </main>
  );
}

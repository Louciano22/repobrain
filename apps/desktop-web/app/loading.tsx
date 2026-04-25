import { ShellState } from "@repobrain/ui";

export default function Loading() {
  return <ShellState state="loading" title="Loading RepoBrain" detail="Preparing the local UI shell." />;
}

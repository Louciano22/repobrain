"use client";

import { ShellState } from "@repobrain/ui";

export default function Error() {
  return <ShellState state="error" title="RepoBrain shell error" detail="The local UI shell could not render." />;
}

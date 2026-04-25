import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoBrain Docs | Local Repo Intelligence",
  description: "Docs for RepoBrain, a local-first, architecture-aware repo intelligence layer for AI coding agents."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

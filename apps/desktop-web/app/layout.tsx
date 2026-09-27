import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cream Soda | Repository Intelligence",
  description: "Local-first, architecture-aware, model-agnostic repo intelligence for AI coding agents."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

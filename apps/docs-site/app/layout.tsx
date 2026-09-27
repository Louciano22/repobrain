import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cream Soda Docs | Repository Intelligence",
  description: "Docs for Cream Soda, repository intelligence by LouChi AI."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BRIEFD",
  description: "Turn messy standup updates into executive digests",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  );
}

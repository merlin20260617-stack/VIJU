import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIJU Shipping Transactions",
  description: "Private transaction service for VIJU shipping management.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

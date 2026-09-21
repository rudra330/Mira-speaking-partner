import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mira — A space to be heard",
  description: "Talk naturally with Mira, your AI conversation companion. Live voice, thoughtful replies, and your conversations in one place.",
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

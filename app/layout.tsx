import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./drive.css";
import { AuthProvider } from "@/components/auth/auth-provider";

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
      <head><link rel="preload" href="/avatars/mira-brunette.glb" as="fetch" crossOrigin="anonymous" /></head>
      <body className="antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-jb-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const siteUrl = process.env.APP_URL?.startsWith("https") ? process.env.APP_URL : "https://mindvirusexperiment.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MIND VIRUS — 20 AGENT EXPERIMENT",
    template: "%s — MIND VIRUS",
  },
  description:
    "A live experiment: can an idea introduced to one AI agent spread to nineteen others through conversation alone? Inspired by 'Mind Viruses: Self-Propagating Ideas in Multi-Agent LLM Systems' (arXiv 2608.10218).",
  openGraph: {
    title: "MIND VIRUS — 20 AGENT EXPERIMENT",
    description: "IDEA -> INFECT -> PERSIST -> PROPAGATE. Twenty AI agents, one shared room, one seeded idea. Watch it spread, or fail to.",
    images: ["/logo.png"],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MIND VIRUS — 20 AGENT EXPERIMENT",
    description: "Twenty AI agents, one shared room, one seeded idea. Watch it spread, or fail to.",
    images: ["/logo.png"],
    site: "@themindvirusexp",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-fg">{children}</body>
    </html>
  );
}

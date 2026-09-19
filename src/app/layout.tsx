import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://knowsys.vercel.app"),
  title: {
    default: "KnowSys — systems engineering, in depth",
    template: "%s · KnowSys",
  },
  description:
    "The systems underneath, from the cache line up. Operating systems, concurrency, storage engines, distributed systems and cloud infrastructure — every chapter interrogated with the same six questions.",
};

/* Palette and mode are both set before first paint. Two attributes rather than
   one: the palette picks the colour family, data-theme picks light or dark
   within it, and each palette declares its own sensible default mode. */
const boot = `
try {
  var p = localStorage.getItem("ks-palette") || "aurora";
  var m = localStorage.getItem("ks-mode");
  var d = document.documentElement;
  d.setAttribute("data-palette", p);
  d.setAttribute("data-theme", m || (p === "blueprint" ? "light" : "dark"));
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-palette="aurora" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} min-h-screen`}>
        <div className="aurora-bg" aria-hidden />
        <div className="grid-layer" aria-hidden />
        <div className="rules-layer" aria-hidden />
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
/* Chapter prose is set in a serif. Measured against KnowML, which runs Source
   Serif 4 at a 66-character measure: sans at 82 characters per line was the
   readability gap, not contrast, which is near identical between the two. */
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://knowsys.vercel.app"),
  title: {
    default: "KnowSys — systems engineering, in depth",
    template: "%s · KnowSys",
  },
  description:
    "The systems underneath, from the cache line up. Operating systems, concurrency, storage engines, distributed systems and cloud infrastructure — every chapter built from the problem it solves, with real measurements.",
};

/* Mode is set before first paint so there's no flash. Light unless the reader
   has chosen dark: long-form reading on paper is the default this site is
   designed around, and the dark theme is tuned separately, not inverted. */
const boot = `
try {
  var m = localStorage.getItem("ks-mode");
  document.documentElement.setAttribute("data-theme", m === "dark" ? "dark" : "light");
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* The font variables must live on <html>, not <body>. Tailwind declares
       --font-sans: var(--font-inter) at :root, and a nested var() resolves in
       the scope where the OUTER property was declared. With the classes on
       <body>, --font-inter was undefined at :root, --font-sans became invalid,
       the whole font-family declaration dropped, and every page rendered in
       the system font. */
    <html
      lang="en"
      data-theme="light"
      className={`${inter.variable} ${mono.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}

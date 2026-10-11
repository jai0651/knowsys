import type { Metadata } from "next";

/* One place for the facts every page's metadata repeats. */
export const SITE = {
  url: "https://knowsys.tech",
  name: "KnowSys",
  title: "KnowSys: learn how computers really run your code",
  description:
    "A free, in-depth course on systems engineering: CPUs, memory, the Linux kernel, concurrency, databases, distributed systems and the cloud, taught step by step with interactive diagrams and real measurements.",
  keywords: [
    "systems engineering", "operating systems", "computer architecture", "Linux kernel",
    "concurrency", "distributed systems", "database internals", "system design",
    "performance engineering", "site reliability engineering", "learn systems programming",
  ],
};

/** Canonical URL plus share-card tags for a page. Pages that set none inherit
 *  the layout's, which name the homepage, so a shared link to /labs would
 *  preview as the homepage and tell crawlers it's a copy of "/". */
export function pageMeta(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE.name, locale: "en_US", url: path, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

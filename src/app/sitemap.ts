import type { MetadataRoute } from "next";
import { topics, labs } from "@/lib/manifest";
import { readDoc } from "@/lib/mdx";
import { allPosts } from "@/lib/posts";
import { allProjects } from "@/lib/projects";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const u = (path: string) => `${SITE.url}${path}`;
  /* lastmod only where there's a real date. Stamping every page with the
     build time told crawlers the whole site changed on every deploy, and
     Google stops trusting a sitemap's dates once they're shown to be noise.
     Hub pages take the date of the newest thing they list. */
  const chapters = topics
    .filter((p) => p.status === "live")
    .map((p) => {
      const updated = readDoc("chapters", p.slug)?.frontmatter.updated;
      return { url: u(p.href), ...(updated && { lastModified: new Date(updated) }), changeFrequency: "monthly" as const, priority: 0.9 };
    });
  const posts = allPosts().map((p) => ({ url: u(`/blog/${p.slug}`), lastModified: new Date(p.date), changeFrequency: "yearly" as const, priority: 0.7 }));
  const newest = (xs: { lastModified?: Date }[]) => {
    const t = Math.max(0, ...xs.map((x) => x.lastModified?.getTime() ?? 0));
    return t ? { lastModified: new Date(t) } : {};
  };
  return [
    { url: u("/"), ...newest([...chapters, ...posts]), changeFrequency: "weekly", priority: 1 },
    { url: u("/sections"), ...newest(chapters), changeFrequency: "weekly", priority: 0.8 },
    { url: u("/projects"), changeFrequency: "monthly", priority: 0.8 },
    { url: u("/blog"), ...newest(posts), changeFrequency: "weekly", priority: 0.7 },
    { url: u("/labs"), changeFrequency: "monthly", priority: 0.7 },
    ...chapters,
    ...allProjects().map((p) => ({ url: u(`/projects/${p.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...posts,
    ...labs.filter((l) => l.status === "live").map((l) => ({ url: u(l.href), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}

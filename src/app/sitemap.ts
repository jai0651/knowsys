import type { MetadataRoute } from "next";
import { topics, labs } from "@/lib/manifest";
import { readDoc } from "@/lib/mdx";
import { allPosts } from "@/lib/posts";
import { allProjects } from "@/lib/projects";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const u = (path: string) => `${SITE.url}${path}`;
  const today = new Date();
  const chapters = topics
    .filter((p) => p.status === "live")
    .map((p) => {
      const updated = readDoc("chapters", p.slug)?.frontmatter.updated;
      return { url: u(p.href), lastModified: updated ? new Date(updated) : today, changeFrequency: "monthly" as const, priority: 0.9 };
    });
  return [
    { url: u("/"), lastModified: today, changeFrequency: "weekly", priority: 1 },
    { url: u("/sections"), lastModified: today, changeFrequency: "weekly", priority: 0.8 },
    { url: u("/projects"), lastModified: today, changeFrequency: "monthly", priority: 0.8 },
    { url: u("/blog"), lastModified: today, changeFrequency: "weekly", priority: 0.7 },
    { url: u("/labs"), lastModified: today, changeFrequency: "monthly", priority: 0.4 },
    ...chapters,
    ...allProjects().map((p) => ({ url: u(`/projects/${p.slug}`), lastModified: today, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...allPosts().map((p) => ({ url: u(`/blog/${p.slug}`), lastModified: new Date(p.date), changeFrequency: "yearly" as const, priority: 0.7 })),
    ...labs.filter((l) => l.status === "live").map((l) => ({ url: u(l.href), lastModified: today, priority: 0.5 })),
  ];
}

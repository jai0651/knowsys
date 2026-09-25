import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DIR = path.join(process.cwd(), "content/posts");

/* Posts are the other half of the site. A chapter is reference: it answers a
   fixed set of questions about one subject and gets re-read. A post is one
   story — an outage, a reproduction, a number that was wrong — told start to
   finish and read once. No spine, no archetype, no manifest entry: the files in
   content/posts are the list. */
export interface PostMeta {
  slug: string;
  title: string;
  dek: string;
  /** ISO date, YYYY-MM-DD. Sorts the index. */
  date: string;
  readingTime: string;
  /** What kind of story: Incident, Reproduction, Field guide, Myth. */
  kicker: string;
  tags: string[];
  /** Chapter slugs this post leans on. Rendered as "go deeper" cards. */
  related: string[];
}

export interface Post extends PostMeta {
  body: string;
}

function read(file: string): Post {
  const { data, content } = matter(fs.readFileSync(path.join(DIR, file), "utf8"));
  return {
    slug: file.replace(/\.mdx$/, ""),
    title: data.title,
    dek: data.dek ?? "",
    date: String(data.date instanceof Date ? data.date.toISOString().slice(0, 10) : data.date),
    readingTime: data.readingTime ?? "",
    kicker: data.kicker ?? "Post",
    tags: data.tags ?? [],
    related: data.related ?? [],
    body: content,
  };
}

export function allPosts(): Post[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map(read)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));
}

export function postBySlug(slug: string): Post | undefined {
  return allPosts().find((p) => p.slug === slug);
}

export function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = path.join(process.cwd(), "content");

export interface Frontmatter {
  title?: string;
  dek?: string;
  readingTime?: string;
  /** Beginner, Intermediate or Advanced */
  level?: string;
  prereqs?: string;
  versions?: string;
  updated?: string;
}

export interface Doc {
  frontmatter: Frontmatter;
  body: string;
}

/** Returns null when a chapter has a manifest entry but no MDX file yet, which
 *  is the normal state for a stub. The route renders the spine skeleton then. */
export function readDoc(kind: "chapters" | "labs", slug: string): Doc | null {
  const file = path.join(ROOT, kind, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  return { frontmatter: data as Frontmatter, body: content };
}

export interface Outline {
  id: string;
  n: string;
  label: string;
  cmd?: string;
  subs: { id: string; n: string; label: string }[];
}

/** Pull the real section tree out of a chapter's MDX so the rail reflects what
 *  the chapter actually contains rather than the generic six-section skeleton.
 *  Parsed from source rather than from the rendered DOM because the rail is a
 *  server component and there is no DOM to read. */
export function outlineOf(body: string): Outline[] {
  const out: Outline[] = [];
  const re =
    /<SectionHeading\s+n="([^"]+)"(?:\s+cmd="([^"]*)")?\s+id="([^"]+)"\s*>([\s\S]*?)<\/SectionHeading>|<Sub\s+n="([^"]+)"\s+title="([^"]+)"/g;

  for (const m of body.matchAll(re)) {
    if (m[3]) {
      out.push({
        id: m[3],
        n: m[1],
        cmd: m[2] || undefined,
        label: m[4].replace(/<[^>]+>/g, "").trim(),
        subs: [],
      });
    } else if (m[5] && out.length) {
      out[out.length - 1].subs.push({
        id: `s${m[5].replace(/\./g, "-")}`,
        n: m[5],
        label: m[6],
      });
    }
  }
  return out;
}

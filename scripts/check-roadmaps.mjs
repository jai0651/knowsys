// Checks src/lib/roadmaps.ts against the chapters it points at: every slug
// must be a chapter, every section id must be a SectionHeading id in that
// chapter, and every /topics, /labs and /projects link in the prose must
// resolve. Section ids get renamed when chapters are rewritten, and a dead
// anchor just lands at the top of the page, so nobody notices without this.
import { readFileSync, existsSync, readdirSync } from "node:fs";

const src = readFileSync("src/lib/roadmaps.ts", "utf8");
const chapters = new Map(
  readdirSync("content/chapters")
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const body = readFileSync(`content/chapters/${f}`, "utf8");
      const ids = new Set([...body.matchAll(/<(?:SectionHeading|DeepDive)[^>]*?\bid="([^"]+)"/g)].map((m) => m[1]));
      return [f.replace(/\.mdx$/, ""), ids];
    }),
);

const errors = [];
const checkAnchor = (slug, id, where) => {
  const ids = chapters.get(slug);
  if (!ids) return errors.push(`${where}: no chapter "${slug}"`);
  if (id && !ids.has(id)) errors.push(`${where}: ${slug} has no section #${id}`);
};

// { slug: "x" } and { slug: "x", parts: [ { id: "y", ... }, ... ] }
for (const m of src.matchAll(/\{\s*slug:\s*"([^"]+)"(?:,\s*parts:\s*\[([\s\S]*?)\]\s*\})?/g)) {
  const [, slug, parts] = m;
  checkAnchor(slug, null, "read");
  for (const p of (parts ?? "").matchAll(/id:\s*"([^"]+)"/g)) checkAnchor(slug, p[1], "read");
}

// links in prose and extras
for (const m of src.matchAll(/\/topics\/([a-z0-9-]+)(?:#([a-z0-9-]+))?/g)) checkAnchor(m[1], m[2], "link");
for (const m of src.matchAll(/\/(labs|projects)\/([a-z0-9-]+)/g)) {
  const [, kind, slug] = m;
  const ok = kind === "projects" ? existsSync(`content/projects/${slug}.mdx`) : existsSync(`content/labs`) && readdirSync("content/labs").some((f) => f.startsWith(slug));
  if (!ok) errors.push(`link: no ${kind.slice(0, -1)} "${slug}"`);
}

if (errors.length) {
  console.error(`roadmaps: ${errors.length} broken reference(s)\n  ` + [...new Set(errors)].join("\n  "));
  process.exit(1);
}
console.log("roadmaps: every chapter, section and link resolves");

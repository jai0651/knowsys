#!/usr/bin/env node
/* Lint the MDX before it reaches the browser.

   Two failure modes, both of which are silent until runtime and both of which
   will recur across 43 chapters:

   1. HTML attribute names. MDX compiles raw tags as JSX, so `class` and `for`
      are invalid and React logs "Invalid DOM property" in the console — a
      warning, not an error, so the page still renders and you miss it.

   2. Unregistered components. `<Foo>` with no Foo in mdxComponents throws
      _missingMdxReference and the route 500s. Catching that here beats
      catching it by loading the page.

       node scripts/check-mdx.mjs
*/
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content");

/** DOM attributes React renames. Anything here in MDX is a bug. */
const BAD_ATTRS = {
  class: "className", for: "htmlFor", colspan: "colSpan", rowspan: "rowSpan",
  tabindex: "tabIndex", readonly: "readOnly", maxlength: "maxLength",
  srcset: "srcSet", autofocus: "autoFocus", "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap", "fill-rule": "fillRule",
  "clip-path": "clipPath", "font-size": "fontSize", "text-anchor": "textAnchor",
};

/** Components the MDX runtime provides. Parsed from the map so the two can't drift. */
function registered() {
  const src = readFileSync(join(ROOT, "src/components/mdx-components.tsx"), "utf8");
  const body = src.slice(src.indexOf("mdxComponents: MDXComponents = {"));
  return new Set([...body.matchAll(/^\s{2}([A-Z][A-Za-z0-9]*),/gm)].map((m) => m[1]));
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".mdx") ? [p] : [];
  });
}

/** Section ids each archetype's spine requires. A chapter assigned one
 *  archetype but written in another's shape is the drift this catches — it
 *  happened once already and produced sixteen identically-structured chapters. */
const SPINE = {
  mechanism:  ["contract", "layout", "hot-path", "failure", "cost", "operating"],
  phenomenon: ["observe", "mechanism", "controls", "measurements", "act"],
  decision:   ["choice", "options", "crossover", "choosing", "mistakes"],
  model:      ["question", "model", "origin", "breaks", "applying"],
};

function archetypes() {
  const m = JSON.parse(readFileSync(join(ROOT, "content/manifest.json"), "utf8"));
  const out = {};
  for (const g of m.groups)
    for (const p of g.pages)
      if (p.kind === "topic") out[p.id] = p.archetype ?? "mechanism";
  return out;
}

const known = registered();
const ARCH = archetypes();
const files = walk(CONTENT);
let problems = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    for (const [bad, good] of Object.entries(BAD_ATTRS)) {
      if (new RegExp(`\\b${bad}=["{]`).test(line)) {
        console.log(`  ${rel}:${i + 1}  ${bad}= should be ${good}=`);
        problems++;
      }
    }
  });

  // Does the chapter wear the shape its manifest entry claims?
  const slug = file.split("/").pop().replace(/\.mdx$/, "");
  if (ARCH[slug] && rel.includes("chapters/")) {
    const want = SPINE[ARCH[slug]];
    const have = new Set([...src.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]));
    const missing = want.filter((id) => !have.has(id));
    if (missing.length > 1) {
      console.log(
        `  ${rel}  archetype "${ARCH[slug]}" wants [${want.join(", ")}] — missing ${missing.join(", ")}`,
      );
      problems++;
    }
  }

  // A parent section must not share a title with a subsection inside it. The
  // bulk rename produced eleven of these, and each one put two identical rows
  // in the search index pointing at different anchors.
  {
    const heads = [
      ...[...src.matchAll(/<SectionHeading[^>]*>([^<]*)<\/SectionHeading>/g)].map((m) => m[1].trim()),
      ...[...src.matchAll(/<Sub\s+n="[^"]*"\s+title="([^"]*)"/g)].map((m) => m[1].trim()),
    ].filter(Boolean);
    const seen = new Map();
    for (const h of heads) seen.set(h, (seen.get(h) ?? 0) + 1);
    for (const [h, n] of seen) {
      if (n > 1) {
        console.log(`  ${rel}  heading ${JSON.stringify(h)} appears ${n} times — a parent section is reusing a subsection's title`);
        problems++;
      }
    }
  }

  // Components used but not provided. Strip fenced code first so a C++ template
  // or a shell heredoc does not read as a JSX tag.
  const prose = src.replace(/```[\s\S]*?```/g, "");
  const used = new Set([...prose.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]));
  for (const c of used) {
    if (!known.has(c)) {
      console.log(`  ${rel}  <${c}> is not in mdxComponents — the page will 500`);
      problems++;
    }
  }
}

console.log(`${files.length} MDX file(s) checked, ${known.size} components registered`);
if (problems) {
  console.log(`\nFAIL: ${problems} problem(s)`);
  process.exit(1);
}
console.log("clean");

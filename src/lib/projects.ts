import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DIR = path.join(process.cwd(), "content/projects");

/* Build-it-yourself guides. Not tutorials: each one motivates the project,
   lays out the milestones and the ideas each one teaches, names the traps,
   and points at the chapters and references that fill in the rest. The files
   in content/projects are the list, ordered by `order`. */
export interface ProjectMeta {
  slug: string;
  title: string;
  tagline: string;
  /** 1 (a long weekend) to 5 (a serious side project) */
  difficulty: number;
  time: string;
  languages: string[];
  icon: string;
  order: number;
  /** chapter slugs this project exercises */
  chapters: string[];
}
export interface Project extends ProjectMeta { body: string }

function read(file: string): Project {
  const { data, content } = matter(fs.readFileSync(path.join(DIR, file), "utf8"));
  return {
    slug: file.replace(/\.mdx$/, ""),
    title: data.title,
    tagline: data.tagline ?? "",
    difficulty: Number(data.difficulty ?? 3),
    time: data.time ?? "",
    languages: data.languages ?? [],
    icon: data.icon ?? "◆",
    order: Number(data.order ?? 99),
    chapters: data.chapters ?? [],
    body: content,
  };
}

export function allProjects(): Project[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".mdx")).map(read).sort((a, b) => a.order - b.order);
}

export function projectBySlug(slug: string): Project | undefined {
  return allProjects().find((p) => p.slug === slug);
}

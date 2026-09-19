import manifest from "../../content/manifest.json";
import type { Archetype } from "./spine";

export type Kind = "topic" | "lab";
export type Status = "stub" | "live";

export interface Page {
  id: string;
  slug: string;
  href: string;
  num: string;
  title: string;
  short: string;
  hook: string;
  kind: Kind;
  status: Status;
  group: string;
  groupSlug: string;
  /** Which section spine this chapter uses. Absent on labs. */
  archetype?: Archetype;
}

export interface Group {
  name: string;
  slug: string;
  colour: string;
  pages: Page[];
}

/** Tailwind colour key per group, so a group's colour is one lookup, not a
 *  conditional repeated in six components. Keys match `--color-*` in globals.css. */
const GROUP_COLOUR: Record<string, string> = {
  "the-machine": "machine",
  "the-operating-system": "os",
  concurrency: "conc",
  "data-storage-engines": "data",
  "distributed-systems": "dist",
  "cloud-infrastructure": "cloud",
  "designing-running-systems": "ops",
  "the-labs": "lab",
};

export const SPINE = manifest.spine as string[];

export const groups: Group[] = (manifest.groups as unknown as Group[]).map((g) => ({
  ...g,
  colour: GROUP_COLOUR[g.slug] ?? "accent",
}));

export const allPages: Page[] = groups.flatMap((g) => g.pages);
export const topics: Page[] = allPages.filter((p) => p.kind === "topic");
export const labs: Page[] = allPages.filter((p) => p.kind === "lab");
export const livePages: Page[] = allPages.filter((p) => p.status === "live");

export function pageBySlug(slug: string): Page | undefined {
  return allPages.find((p) => p.slug === slug);
}

export function groupOf(page: Page): Group {
  return groups.find((g) => g.slug === page.groupSlug)!;
}

export function colourOf(page: Page): string {
  return GROUP_COLOUR[page.groupSlug] ?? "accent";
}

/** Previous and next in reading order, across group boundaries. Labs are
 *  excluded so a chapter's "next" is always another chapter. */
export function neighbours(slug: string): { prev?: Page; next?: Page } {
  const list = topics;
  const i = list.findIndex((p) => p.slug === slug);
  if (i === -1) return {};
  return { prev: list[i - 1], next: list[i + 1] };
}

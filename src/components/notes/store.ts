"use client";

import { useCallback, useEffect, useState } from "react";

export const COLOURS = ["mint", "sky", "amber", "rose"] as const;
export type Colour = (typeof COLOURS)[number];

export interface Highlight {
  id: string;
  colour: Colour;
  note?: string;
  /** anchor */
  text: string;
  occurrence: number;
  start: number;
  end: number;
  created: number;
}

export interface PageNotes {
  freeNotes: string;
  highlights: Highlight[];
}

const EMPTY: PageNotes = { freeNotes: "", highlights: [] };
const key = (path: string) => `ks-notes::${path}`;

export function read(path: string): PageNotes {
  try {
    const raw = localStorage.getItem(key(path));
    if (!raw) return EMPTY;
    const v = JSON.parse(raw);
    return { freeNotes: v.freeNotes ?? "", highlights: v.highlights ?? [] };
  } catch {
    return EMPTY;
  }
}

function write(path: string, v: PageNotes) {
  try {
    if (!v.freeNotes && !v.highlights.length) localStorage.removeItem(key(path));
    else localStorage.setItem(key(path), JSON.stringify(v));
  } catch {
    /* quota, or private mode. Losing a note is better than throwing mid-read. */
  }
}

/** Per-page notes, persisted to localStorage. Nothing leaves the device. */
export function useNotes(path: string) {
  const [notes, setNotes] = useState<PageNotes>(EMPTY);
  const [ready, setReady] = useState(false);

  // Hydration: the server has no localStorage, so the first paint must match
  // the server's empty state and the real value arrives on the next tick.
  useEffect(() => {
    setNotes(read(path));
    setReady(true);
  }, [path]);

  const update = useCallback(
    (fn: (prev: PageNotes) => PageNotes) => {
      setNotes((prev) => {
        const next = fn(prev);
        write(path, next);
        return next;
      });
    },
    [path],
  );

  return { notes, ready, update };
}

/** One highlight per line, grouped under the chapter title. Deliberately plain
 *  Markdown so it pastes into Obsidian, Notion or a PR description. */
export function toMarkdown(title: string, url: string, n: PageNotes): string {
  const lines = [`# ${title}`, "", url, ""];
  if (n.highlights.length) {
    lines.push("## Highlights", "");
    for (const h of [...n.highlights].sort((a, b) => a.start - b.start)) {
      lines.push(`> ${h.text.replace(/\s+/g, " ").trim()}`);
      if (h.note) lines.push("", `${h.note}`);
      lines.push("");
    }
  }
  if (n.freeNotes.trim()) {
    lines.push("## Notes", "", n.freeNotes.trim(), "");
  }
  return lines.join("\n");
}

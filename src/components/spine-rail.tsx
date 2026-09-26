"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface RailItem {
  id: string;
  n: string;
  label: string;
  cmd?: string;
  subs?: { id: string; n: string; label: string }[];
}

/* "On this page". The section you're reading is marked, and its subsections
   unfold beneath it; the rest stay one line each so the whole chapter fits on
   screen. The tail (project, trade-offs, interview) is set apart below. */
export function SpineRail({
  spine, tail, title = "On this page",
}: {
  spine: RailItem[];
  tail: RailItem[];
  title?: string;
}) {
  const ids = useMemo(
    () => [...spine, ...tail].flatMap((s) => [s.id, ...(s.subs ?? []).map((x) => x.id)]),
    [spine, tail],
  );
  const [active, setActive] = useState(spine[0]?.id ?? "");

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => Boolean(e));
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);

  const activeTop = [...spine, ...tail].findIndex(
    (s) => s.id === active || (s.subs ?? []).some((x) => x.id === active),
  );

  const item = (s: RailItem, i: number, dim = false) => {
    const open = activeTop === i;
    return (
      <li key={s.id}>
        <a
          href={`#${s.id}`}
          className={cn(
            "-ml-px block border-l py-[5px] pl-3.5 leading-snug transition-colors",
            open ? "border-accent font-medium text-ink" : "border-transparent hover:text-ink",
            !open && (dim ? "text-faint" : "text-muted"),
          )}
        >
          {s.label}
        </a>
        {open && (s.subs?.length ?? 0) > 0 && (
          <ul className="mb-1 ml-3.5">
            {s.subs!.map((sub) => (
              <li key={sub.id}>
                <a
                  href={`#${sub.id}`}
                  className={cn(
                    "block py-[3px] pl-3 text-[12.5px] leading-snug transition-colors",
                    sub.id === active ? "text-accent" : "text-faint hover:text-muted",
                  )}
                >
                  {sub.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside className="hidden w-[230px] shrink-0 xl:block">
      <nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 pl-2 text-[13.5px]">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</div>
        <ul className="border-l border-line">{spine.map((s, i) => item(s, i))}</ul>
        {tail.length > 0 && (
          <ul className="mt-5 border-l border-line">
            {tail.map((s, i) => item(s, spine.length + i, true))}
          </ul>
        )}
        <a
          href="#"
          className="mt-6 inline-block pl-3.5 text-[12.5px] text-faint transition-colors hover:text-ink"
        >
          ↑ Back to top
        </a>
      </nav>
    </aside>
  );
}

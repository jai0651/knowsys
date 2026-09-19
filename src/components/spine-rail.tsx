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

/* The signature element. The six questions are the point of the site, so they
   get a persistent rail rather than a list of links: a lit node per question,
   a line that fills as you read, and subsections that unfold only for the
   question you are currently inside. */
export function SpineRail({
  spine, tail, title = "Mechanism",
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
      { rootMargin: "-92px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);

  const activeTop = spine.findIndex(
    (s) => s.id === active || (s.subs ?? []).some((x) => x.id === active),
  );
  const inTail = tail.some((t) => t.id === active);
  const progress =
    activeTop === -1 ? (inTail ? 100 : 0) : (activeTop / Math.max(spine.length - 1, 1)) * 100;

  return (
    <aside className="hidden w-[236px] shrink-0 xl:block">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-10 pr-4">
        <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          {title}
        </div>

        <div className="relative">
          <span className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-px bg-line" />
          <span
            className="absolute left-[7px] top-2 w-px bg-accent transition-[height] duration-500 ease-out"
            style={{ height: `calc((100% - 1rem) * ${progress / 100})` }}
          />

          {spine.map((s, i) => {
            const open = activeTop === i;
            const past = activeTop > i || activeTop === -1;
            const on = s.id === active;
            return (
              <div key={s.id}>
                <a href={`#${s.id}`} className="group relative flex items-start gap-3 py-[7px]">
                  <span
                    className={cn(
                      "relative z-10 mt-[5px] grid size-[15px] shrink-0 place-items-center rounded-full border transition-all duration-300",
                      open
                        ? "border-accent bg-accent shadow-[0_0_0_4px_var(--accent-soft),0_0_14px_2px_var(--glow)]"
                        : past
                          ? "border-accent/70 bg-accent/70"
                          : "border-line-2 bg-bg",
                    )}
                  >
                    <span
                      className={cn(
                        "size-[5px] rounded-full",
                        open || past ? "bg-bg" : "bg-transparent",
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1 pt-px">
                    <span
                      className={cn(
                        "block text-[12.8px] leading-snug transition-colors",
                        on ? "font-semibold text-ink" : open ? "font-medium text-ink" : "text-muted group-hover:text-ink",
                      )}
                    >
                      {s.label}
                    </span>
                    {s.cmd && (
                      <span
                        className={cn(
                          "mt-0.5 block truncate font-mono text-[10px] transition-all",
                          open ? "text-accent opacity-100" : "text-faint opacity-0 group-hover:opacity-70",
                        )}
                      >
                        {s.cmd}
                      </span>
                    )}
                  </span>
                </a>

                {/* subsections unfold only for the question you are inside */}
                {open && (s.subs?.length ?? 0) > 0 && (
                  <div className="mb-1 ml-[26px] border-l border-line pl-2.5">
                    {s.subs!.map((sub) => (
                      <a
                        key={sub.id}
                        href={`#${sub.id}`}
                        className={cn(
                          "block py-[4px] text-[11.8px] leading-snug transition-colors",
                          sub.id === active ? "font-medium text-accent" : "text-faint hover:text-muted",
                        )}
                      >
                        <span className="tnum mr-1.5 font-mono text-[10px] opacity-60">{sub.n}</span>
                        {sub.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 border-t border-line pt-4">
          {tail.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "block py-[5px] pl-[26px] text-[12.2px] leading-snug transition-colors",
                s.id === active ? "font-medium text-ink" : "text-faint hover:text-muted",
              )}
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

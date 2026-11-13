"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, FlaskConical, Flag, Hammer, SkipForward } from "lucide-react";
import { useDone } from "@/lib/progress";
import { cn } from "@/lib/utils";
import type { Route, Stage } from "@/lib/roadmaps";

export type Titles = Record<string, { title: string; num: string }>;

/* `code`, **bold** and [text](href), which is all the roadmap prose uses. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
        if (p.startsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) return <Link key={i} href={m[2]}>{m[1]}</Link>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

const stageId = (r: Route, i: number) => `${r.id}-${i + 1}`;
const slugsOf = (s: Stage) => [...new Set(s.read.map((x) => x.slug))];
const track = (r: Route) => ({ ["--track" as string]: `var(--c-${r.colour})` }) as React.CSSProperties;

export function Roadmaps({ routes, titles }: { routes: Route[]; titles: Titles }) {
  const done = useDone();
  const [mode, setMode] = useState<"map" | "text">("map");
  const [open, setOpen] = useState<Record<string, number | null>>({});

  // #machine-3 opens stage 3 of roadmap A; #machine just scrolls to it
  useEffect(() => {
    const fromHash = () => {
      const m = location.hash.slice(1).match(/^([a-z]+)-(\d+)$/);
      const r = m && routes.find((x) => x.id === m[1]);
      if (!m || !r) return;
      const i = Number(m[2]) - 1;
      if (i < 0 || i >= r.stages.length) return;
      setOpen((o) => ({ ...o, [r.id]: i }));
      requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [routes]);

  const stageDone = (s: Stage) => slugsOf(s).every((x) => done.includes(x));
  const toggle = (r: Route, i: number) => {
    const next = open[r.id] === i ? null : i;
    setOpen({ ...open, [r.id]: next });
    history.replaceState(null, "", next === null ? `#${r.id}` : `#${stageId(r, next)}`);
  };

  return (
    <>
      {/* view switch */}
      <div className="mb-10 flex flex-wrap items-center gap-3 font-[family-name:var(--font-inter)]">
        <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">View</span>
        <div className="inline-flex rounded-full border border-line bg-surface-2 p-1">
          {(["map", "text"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-semibold transition",
                mode === m ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted hover:text-ink",
              )}
            >
              {m === "map" ? "Map" : "Full text"}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-faint">Full text opens every stage, for reading straight through or ⌘F.</span>
      </div>

      {/* chooser */}
      <section id="pick" className="mb-16 scroll-mt-24">
        <h2 className="mb-2 text-[24px] font-bold tracking-[-0.015em] text-ink">Which one is yours</h2>
        <p className="mb-6 max-w-2xl text-[15.5px] leading-relaxed text-muted">
          Pick by where you are now and what you want to be able to do, not by what sounds most advanced.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {routes.map((r) => {
            const all = [...new Set(r.stages.flatMap(slugsOf))];
            const n = all.filter((s) => done.includes(s)).length;
            return (
              <a
                key={r.id}
                href={`#${r.id}`}
                style={track(r)}
                className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--track)]"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-md bg-[color-mix(in_srgb,var(--track)_16%,transparent)] text-[12px] font-extrabold text-[color-mix(in_srgb,var(--track)_60%,var(--ink))]">{r.letter}</span>
                  <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">Roadmap {r.letter}</span>
                  {n > 0 && <span className="ml-auto text-[12px] text-faint">{n}/{all.length} chapters done</span>}
                </div>
                <div className="mb-1.5 text-[15.5px] font-semibold leading-snug text-ink"><Inline text={r.from} /></div>
                <p className="mb-4 text-[14px] leading-relaxed text-muted">{r.pitch}</p>
                <div className="mt-auto flex items-center gap-1.5 text-[13.5px] font-semibold text-[color-mix(in_srgb,var(--track)_60%,var(--ink))]">
                  {r.title} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-1 text-[12.5px] text-faint">{r.length}</div>
              </a>
            );
          })}
        </div>
        <div className="mt-6 rounded-xl border border-line bg-surface-2 px-5 py-4 text-[14.5px] leading-relaxed text-muted">
          <b className="font-semibold text-ink">On the time estimates.</b> They assume an hour or two on weekday evenings, and that you run
          the code in each chapter, not just read it. Reading alone is a lot faster and doesn&rsquo;t stick the same way. Mark chapters
          complete as you go and the map ticks off each stage.
        </div>
      </section>

      {routes.map((r, ri) => {
        const next = r.stages.findIndex((s) => !stageDone(s));
        const openIdx = open[r.id] ?? null;
        return (
          <section key={r.id} id={r.id} style={track(r)} className="mb-20 scroll-mt-24">
            <div className="mb-1 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-[color-mix(in_srgb,var(--track)_60%,var(--ink))]">
              {String(ri + 2).padStart(2, "0")} · Roadmap {r.letter}
            </div>
            <h2 className="mb-2 text-[26px] font-bold leading-tight tracking-[-0.015em] text-ink">{r.title}</h2>
            <p className="mb-4 max-w-2xl text-[16px] leading-relaxed text-muted">{r.lede}</p>

            {/* the map */}
            <div role="group" aria-label={`Stages in roadmap ${r.letter}`} className="relative mb-4 flex flex-col gap-1 py-3 md:flex-row md:gap-2 md:pt-6">
              {r.stages.map((s, i) => {
                const isDone = stageDone(s);
                const isNext = i === next;
                const isOpen = mode === "map" && openIdx === i;
                return (
                  <div key={i} className="group/node relative min-w-0 md:flex-1">
                    {i > 0 && (
                      <span aria-hidden className="absolute left-[23px] top-[-10px] h-[14px] w-0.5 bg-[color-mix(in_srgb,var(--track)_40%,transparent)] md:left-[calc(-50%-4px)] md:top-[23px] md:h-0.5 md:w-[calc(100%+8px)]" />
                    )}
                    <button
                      onClick={() => toggle(r, i)}
                      aria-expanded={mode === "text" || isOpen}
                      aria-controls={stageId(r, i)}
                      className="relative z-[1] flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left md:flex-col md:gap-2 md:text-center"
                    >
                      <span
                        className={cn(
                          "grid size-[42px] shrink-0 place-items-center rounded-full border-2 font-mono text-[13px] font-bold transition",
                          isDone
                            ? "border-ok bg-ok text-white"
                            : isOpen
                              ? "border-[var(--track)] bg-[var(--track)] text-white shadow-[0_0_0_5px_color-mix(in_srgb,var(--track)_20%,transparent)]"
                              : "border-[color-mix(in_srgb,var(--track)_65%,var(--bg))] bg-bg text-[color-mix(in_srgb,var(--track)_60%,var(--ink))] group-hover/node:shadow-[0_0_0_4px_color-mix(in_srgb,var(--track)_16%,transparent)]",
                        )}
                      >
                        {isDone ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-[13px] font-bold leading-tight", isOpen ? "text-ink" : "text-muted group-hover/node:text-ink")}>{s.node}</span>
                        {isNext && !isDone && <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-accent">next</span>}
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-faint md:hidden">{s.goal}</span>
                      </span>
                    </button>
                    {/* hover card, desktop only */}
                    <div
                      className={cn(
                        "pointer-events-none invisible absolute top-full z-20 mt-1 hidden w-[260px] rounded-xl border border-line-2 bg-surface p-3.5 opacity-0 shadow-[var(--shadow)] transition md:block",
                        "group-hover/node:visible group-hover/node:opacity-100",
                        i === 0 ? "left-0" : i === r.stages.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                      )}
                    >
                      <div className="mb-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.07em] text-[color-mix(in_srgb,var(--track)_60%,var(--ink))]">Stage {i + 1} · {s.time}</div>
                      <div className="mb-2 font-[family-name:var(--font-serif)] text-[14px] leading-snug text-ink">{s.goal}</div>
                      <div className="text-[11.5px] text-faint">
                        {slugsOf(s).length} chapter{slugsOf(s).length > 1 ? "s" : ""} · click to {isOpen ? "close" : "open"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {mode === "map" && openIdx === null && (
              <p className="mb-2 pl-1 text-[13px] italic text-faint">Hover a stage for what it gets you, click to open its reading list and checkpoint.</p>
            )}

            {r.stages.map((s, i) => (
              <StageView
                key={i}
                r={r}
                s={s}
                i={i}
                titles={titles}
                done={done}
                hidden={mode === "map" && openIdx !== i}
              />
            ))}

            <div className="mt-6 rounded-xl border border-line bg-surface-2 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-muted [&_strong]:text-ink">
              <Inline text={r.total} />
            </div>
          </section>
        );
      })}
    </>
  );
}

function StageView({
  r, s, i, titles, done, hidden,
}: {
  r: Route; s: Stage; i: number; titles: Titles; done: string[]; hidden: boolean;
}) {
  const last = i === r.stages.length - 1;
  return (
    <div
      id={stageId(r, i)}
      hidden={hidden}
      className="my-6 scroll-mt-24 rounded-r-xl border-l-2 border-[var(--track)] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--track)_5%,transparent),transparent_45%)] py-2 pl-6 pr-2"
    >
      <div className="not-prose mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-[family-name:var(--font-inter)]">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[color-mix(in_srgb,var(--track)_60%,var(--ink))]">Stage {i + 1}</span>
        <h3 className="text-[19px] font-bold tracking-[-0.01em] text-ink">{s.title}</h3>
        <span className="flex items-center gap-1 font-mono text-[11.5px] text-faint"><Clock className="size-3" />{s.time}</span>
      </div>

      {/* what to read */}
      <div className="not-prose mb-5 space-y-2 font-[family-name:var(--font-inter)]">
        {s.read.map((x) => {
          const t = titles[x.slug];
          const isDone = done.includes(x.slug);
          return (
            <div key={x.slug} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
              <Link href={`/topics/${x.slug}`} className="flex items-center gap-2.5 text-[14.5px] font-semibold text-ink hover:text-accent">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full font-mono text-[10.5px] font-bold", isDone ? "bg-ok text-white" : "border border-line-2 text-muted")}>
                  {isDone ? <Check className="size-3" strokeWidth={3} /> : t?.num}
                </span>
                {t?.title ?? x.slug}
                {!x.parts && <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-faint">whole chapter</span>}
              </Link>
              {x.parts && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-[34px]">
                  {x.parts.map((p) => (
                    <Link key={p.id} href={`/topics/${x.slug}#${p.id}`} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[12.5px] text-muted transition hover:border-[var(--track)] hover:text-ink">
                      {p.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {s.body.map((p, k) => (
        <p key={k} className="mb-4 font-[family-name:var(--font-serif)] text-[17px] leading-[1.7] text-ink [&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_strong]:font-bold">
          <Inline text={p} />
        </p>
      ))}

      <div className="not-prose my-5 rounded-xl border border-ok/30 bg-ok/[0.05] px-4 py-3.5 font-[family-name:var(--font-inter)]">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ok">
          <Flag className="size-3.5" /> {last ? "Final checkpoint" : `Checkpoint before stage ${i + 2}`}
        </div>
        {s.checkpoint.map((c, k) => (
          <p key={k} className="mb-2 text-[15px] leading-relaxed text-ink last:mb-0 [&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.88em]">
            <Inline text={c} />
          </p>
        ))}
      </div>

      {s.skip && (
        <div className="not-prose my-5 rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3.5 font-[family-name:var(--font-inter)]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-warn">
            <SkipForward className="size-3.5" /> Skip on the first pass
          </div>
          <p className="text-[14.5px] leading-relaxed text-ink [&_a]:text-accent [&_a]:underline"><Inline text={s.skip} /></p>
        </div>
      )}

      {s.extra && (
        <div className="not-prose mb-3 flex flex-wrap gap-2 font-[family-name:var(--font-inter)]">
          {s.extra.map((e) => (
            <Link key={e.href} href={e.href} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted transition hover:border-[var(--track)] hover:text-ink">
              {e.href.startsWith("/labs") ? <FlaskConical className="size-3.5" /> : <Hammer className="size-3.5" />}
              {e.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

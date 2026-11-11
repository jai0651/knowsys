"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, Boxes, Check, ChevronRight, Flag, Sparkles, TriangleAlert, Database, Gauge, Layers, Lightbulb, ListTree, Lock, Minus, Network, Plug, Plus, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* Components for system design case studies.

     <Think>      stop and design it yourself before reading on; a hint and
                  one good answer are revealed on demand
     <Decision>   the options that were on the table, what each costs, which
                  one was chosen; the reasons go in the children
     <Elsewhere>  the same idea in other systems, for readers who want depth
     <Zoom>       where we are, from the whole system down to a data structure
     <DeepDive>   a closed box of engineering detail (schema, indexes, why this
                  database or queue and not the others); the one-line answer
                  shows while it's closed, the rest opens on demand
     <Insight>    one sentence the reader should leave the section holding;
                  3–5 per chapter, never one per section
     <Checkpoint> after a long stretch: what the design has so far, what still
                  breaks, and an optional self-check that starts closed
     <Stack>      the technology picked for each layer, why, and what it beat;
                  each row can link to the DeepDive that argues it */

export function Think({
  q, hint, children,
}: {
  q: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const [showHint, setShowHint] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="my-9 rounded-xl border border-accent/30 bg-accent/[0.05] p-5 font-[family-name:var(--font-inter)]">
      <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">
        <Lightbulb className="size-3.5" /> Your turn: design it before reading on
      </div>
      <p className="mb-4 font-[family-name:var(--font-serif)] text-[18.5px] leading-snug text-ink">{q}</p>
      {showHint && hint && (
        <p className="mb-4 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14.5px] leading-relaxed text-muted">
          <b className="font-semibold text-ink">Hint.</b> {hint}
        </p>
      )}
      {open && (
        <div className="mb-4 border-t border-line pt-4 text-[15.5px] leading-relaxed text-ink [&>p:last-child]:mb-0 [&>p]:mb-2.5 [&_ul]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {hint && !showHint && !open && (
          <button onClick={() => setShowHint(true)} className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-muted transition hover:border-accent hover:text-ink">
            Show a hint
          </button>
        )}
        <button onClick={() => setOpen(!open)} className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-[13.5px] font-medium text-ink transition hover:bg-accent/20">
          {open ? "Hide the answer" : "I've thought about it: show one answer"}
        </button>
      </div>
    </div>
  );
}

export function Decision({
  q, options, children,
}: {
  q: string;
  options: { name: string; how: string; good: string[]; bad: string[]; chosen?: boolean }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="not-prose my-10 rounded-2xl border border-line bg-surface p-5 font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-6">
      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Decision</div>
      <p className="mb-4 font-[family-name:var(--font-serif)] text-[19px] leading-snug text-ink">{q}</p>
      <div className={cn("grid gap-3", options.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {options.map((o) => (
          <div
            key={o.name}
            className={cn(
              "relative rounded-xl border p-4",
              o.chosen ? "border-data bg-data/[0.07] shadow-[0_0_0_1px_var(--c-data)]" : "border-line bg-surface-2",
            )}
          >
            {o.chosen && (
              <span className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-md bg-data px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-bg">
                <Check className="size-3" /> chosen
              </span>
            )}
            <div className="mb-1 text-[15px] font-semibold text-ink">{o.name}</div>
            <div className="mb-3 text-[13.5px] leading-snug text-muted">{o.how}</div>
            <ul className="space-y-1.5 text-[13.5px] leading-snug">
              {o.good.map((g) => (
                <li key={g} className="flex gap-1.5 text-ink"><Plus className="mt-0.5 size-3.5 shrink-0 text-data" />{g}</li>
              ))}
              {o.bad.map((b) => (
                <li key={b} className="flex gap-1.5 text-muted"><Minus className="mt-0.5 size-3.5 shrink-0 text-bad" />{b}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {children && (
        <div className="prose-sm mt-4 border-t border-line pt-4 text-[15px] leading-relaxed text-ink [&>p:last-child]:mb-0 [&>p]:mb-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export function Elsewhere({ items }: { items: { where: string; how: string }[] }) {
  return (
    <aside className="not-prose my-8 rounded-xl border border-line bg-surface-2 px-5 py-4 font-[family-name:var(--font-inter)]">
      <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-accent-2">The same idea elsewhere</div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.where} className="flex gap-2 text-[14.5px] leading-snug">
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint" />
            <span><b className="font-semibold text-ink">{it.where}.</b> <span className="text-muted">{it.how}</span></span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function Zoom({ path }: { path: string[] }) {
  return (
    <div className="not-prose my-6 flex flex-wrap items-center gap-1 font-mono text-[11.5px] text-faint">
      <span className="mr-1 uppercase tracking-wider">zoom</span>
      {path.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3" />}
          <span className={cn("rounded px-1.5 py-0.5", i === path.length - 1 ? "bg-accent/15 text-ink" : "bg-surface-2")}>{p}</span>
        </span>
      ))}
    </div>
  );
}

/* A real photo or illustration from outside the site. Every one carries its
   credit and licence, linked to the page it came from. */
export function Picture({
  src, alt, caption, credit, href, narrow, paper,
}: {
  src: string;
  alt: string;
  caption?: string;
  credit: string;
  href?: string;
  narrow?: boolean;
  /** draw on a white card: for line drawings with a transparent background */
  paper?: boolean;
}) {
  return (
    <figure className={cn("not-prose my-10", narrow ? "mx-auto max-w-[520px]" : "lg:-mx-6")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className={cn("w-full rounded-xl border border-line", paper ? "bg-white p-4" : "bg-white/[0.02]")} />
      <figcaption className="mt-2.5 px-1 font-[family-name:var(--font-inter)]">
        {caption && <span className="block text-[14.5px] leading-relaxed text-muted">{caption}</span>}
        <span className="mt-1 block text-[11.5px] text-faint">
          {href ? <a href={href} target="_blank" rel="noopener" className="underline decoration-line-2 underline-offset-2 hover:text-ink">{credit}</a> : credit}
        </span>
      </figcaption>
    </figure>
  );
}

/* ── DeepDive ───────────────────────────────────────────────────────────
   Closed by default so the story reads straight through. The kind chip and
   the one-line answer are visible while closed, so a reader skimming for
   "which database, and why" gets the answer without opening anything. */

const KINDS = {
  database:    { label: "Database",      icon: Database, tone: "text-data bg-data/10 border-data/30" },
  schema:      { label: "Schema",        icon: Layers,   tone: "text-data bg-data/10 border-data/30" },
  index:       { label: "Index",         icon: ListTree, tone: "text-accent bg-accent/10 border-accent/30" },
  stream:      { label: "Queue / stream", icon: Activity, tone: "text-dist bg-dist/10 border-dist/30" },
  cache:       { label: "Cache",         icon: Zap,      tone: "text-machine bg-machine/10 border-machine/30" },
  api:         { label: "API",           icon: Plug,     tone: "text-accent-2 bg-accent-2/10 border-accent-2/30" },
  realtime:    { label: "Real-time",     icon: Network,  tone: "text-cloud bg-cloud/10 border-cloud/30" },
  consistency: { label: "Consistency",   icon: Lock,     tone: "text-bad bg-bad/10 border-bad/30" },
  scaling:     { label: "Scaling",       icon: Gauge,    tone: "text-ops bg-ops/10 border-ops/30" },
  storage:     { label: "Storage",       icon: Boxes,    tone: "text-os bg-os/10 border-os/30" },
} as const;

export type DeepDiveKind = keyof typeof KINDS;

export function DeepDive({
  kind, title, answer, id, children,
}: {
  kind: DeepDiveKind;
  /** the engineering question, e.g. "Why Kafka for the event log, not RabbitMQ?" */
  title: string;
  /** one sentence: the answer, visible while the box is closed */
  answer: string;
  /** anchor, so a <Stack> row can link here */
  id?: string;
  children: React.ReactNode;
}) {
  const k = KINDS[kind];
  const Icon = k.icon;
  const ref = useRef<HTMLDetailsElement>(null);
  // a link to #id (from a <Stack> row, or shared) opens the box it points at
  useEffect(() => {
    if (!id) return;
    const open = () => {
      if (location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [id]);
  return (
    <details ref={ref} id={id} className="group my-8 scroll-mt-24 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow)] lg:-mx-6">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 font-[family-name:var(--font-inter)] transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className={cn("mt-0.5 flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", k.tone)}>
          <Icon className="size-3" /> {k.label}
        </span>
        <span className="flex-1">
          <span className="block text-[15.5px] font-semibold leading-snug text-ink">{title}</span>
          <span className="mt-1 block text-[14px] leading-snug text-muted">{answer}</span>
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[12px] text-faint">
          <span className="hidden sm:inline group-open:hidden">Open</span>
          <span className="hidden group-open:sm:inline">Close</span>
          <ChevronRight className="size-4 transition-transform duration-200 group-open:rotate-90" />
        </span>
      </summary>
      <div className="border-t border-line px-5 pb-2 pt-5 text-[16px] [&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:font-[family-name:var(--font-inter)] [&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-[0.06em] [&_h4]:text-faint [&_h4:first-child]:mt-0">
        {children}
      </div>
    </details>
  );
}

/* ── Stack ──────────────────────────────────────────────────────────────
   The engineering blueprint: one row per layer of the design. */
export function Stack({
  title = "The engineering blueprint", rows,
}: {
  title?: string;
  rows: { layer: string; pick: string; why: string; over?: string; href?: string }[];
}) {
  return (
    <div className="not-prose my-10 overflow-hidden rounded-2xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-6">
      <div className="border-b border-line px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">{title}</div>
      <div className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.layer} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[150px_1fr] sm:gap-4">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">{r.layer}</div>
            <div>
              <div className="text-[15px] font-semibold text-ink">
                {r.href ? <a href={r.href} className="underline decoration-line-2 underline-offset-2 hover:decoration-current">{r.pick}</a> : r.pick}
              </div>
              <div className="mt-0.5 text-[14px] leading-snug text-muted">{r.why}</div>
              {r.over && <div className="mt-1 text-[13px] leading-snug text-faint"><b className="font-semibold">Over:</b> {r.over}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Insight ────────────────────────────────────────────────────────────── */
export function Insight({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose my-8 flex gap-3 border-l-[3px] border-accent bg-accent/[0.06] py-3 pl-4 pr-5 font-[family-name:var(--font-inter)] lg:-mx-6">
      <Sparkles className="mt-1 size-4 shrink-0 text-accent" />
      <div>
        <div className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-accent">Insight</div>
        <div className="font-[family-name:var(--font-serif)] text-[17.5px] leading-snug text-ink [&_code]:font-mono [&_code]:text-[0.85em]">{children}</div>
      </div>
    </div>
  );
}

/* ── Checkpoint ─────────────────────────────────────────────────────────── */
export function Checkpoint({
  n, have, broken, q, children,
}: {
  n: number;
  /** what the design can do now, one short line each */
  have: string[];
  /** the problem the next section picks up */
  broken?: string;
  /** optional self-check; its answer is the children, closed until asked */
  q?: string;
  children?: React.ReactNode;
}) {
  return (
    <div id={`checkpoint-${n}`} className="not-prose my-12 scroll-mt-24 rounded-2xl border border-ok/30 bg-ok/[0.04] p-5 font-[family-name:var(--font-inter)] lg:-mx-6">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-ok">
        <Flag className="size-3.5" /> Checkpoint {n}: where the design stands
      </div>
      <ul className="space-y-1.5">
        {have.map((h) => (
          <li key={h} className="flex gap-2 text-[14.5px] leading-snug text-ink">
            <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.5} />{h}
          </li>
        ))}
      </ul>
      {broken && (
        <div className="mt-3 flex gap-2 rounded-lg bg-warn/10 px-3 py-2 text-[14px] leading-snug text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span><b className="font-semibold">Still broken:</b> {broken}</span>
        </div>
      )}
      {q && (
        <details className="group mt-3 rounded-lg border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[14px] text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-open:rotate-90" />
            <span><b className="font-semibold">Check yourself:</b> {q}</span>
          </summary>
          <div className="border-t border-line px-3 py-2.5 text-[14px] leading-relaxed text-muted [&>p:last-child]:mb-0 [&>p]:mb-2">{children}</div>
        </details>
      )}
    </div>
  );
}

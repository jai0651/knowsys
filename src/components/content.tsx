import { cn } from "@/lib/utils";
import { Panel } from "./terminal-frame";

const FLAT_CODE =
  "[&_pre]:!my-0 [&_pre]:!border-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_figure]:!my-0 [&_pre]:font-mono";

/* ── Callout ─────────────────────────────────────────────────────────────
   The moment something clicks. The label says what it is — "Why the naive
   version deadlocks" — never "Key insight". */
export function Callout({
  label, kind = "teach", children,
}: {
  label: string;
  kind?: "teach" | "warn" | "note";
  children: React.ReactNode;
}) {
  const tone = {
    teach: { bar: "bg-accent", text: "text-accent", glow: "shadow-[0_0_10px_1px_var(--glow)]" },
    warn:  { bar: "bg-machine", text: "text-machine", glow: "" },
    note:  { bar: "bg-os", text: "text-os", glow: "" },
  }[kind];

  return (
    <div className="glass relative my-7 overflow-hidden rounded-2xl p-5 pl-6">
      <span className={cn("absolute inset-y-4 left-0 w-[2.5px] rounded-full", tone.bar, tone.glow)} />
      <div className={cn("mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]", tone.text)}>
        {label}
      </div>
      <div className="[&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{children}</div>
    </div>
  );
}

/* ── TryIt ───────────────────────────────────────────────────────────────
   Runnable code. Every one compiles and runs in CI, and Output is diffed
   against what it actually printed. */
export function TryIt({
  what, lang = "cpp", toolchain, children,
}: {
  what: string;
  lang?: string;
  toolchain?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel
      className="my-7"
      label={what}
      bodyClassName="p-0"
      right={
        <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-faint">
          {toolchain ?? lang}
        </span>
      }
    >
      <div className={cn("overflow-x-auto px-5 pt-4 text-[13.3px] leading-relaxed", FLAT_CODE)}>
        {children}
      </div>
    </Panel>
  );
}

/** Goes inside TryIt. What the code printed, and what to notice in it. */
export function Output({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 mt-4 border-t border-line bg-surface-2 px-5 py-4 text-[14px] leading-relaxed [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
        <span className="size-1 rounded-full bg-accent shadow-[0_0_6px_1px_var(--glow)]" />
        output
      </div>
      {children}
    </div>
  );
}

/* ── SourceRead ──────────────────────────────────────────────────────────
   Quoted upstream source, pinned to a tag. Reading the real thing instead of
   describing it is the whole differentiator. */
export function SourceRead({
  file, repo, tag, href, children,
}: {
  file: string;
  repo: string;
  tag: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Panel
      className="my-7"
      label={file}
      tone="muted"
      bodyClassName="p-0"
      right={
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-faint transition-colors hover:border-line-2 hover:text-accent"
        >
          {repo} @ {tag} ↗
        </a>
      }
    >
      <div className={cn("overflow-x-auto px-5 py-4 text-[12.8px] leading-relaxed", FLAT_CODE)}>
        {children}
      </div>
    </Panel>
  );
}

/* ── Cost ────────────────────────────────────────────────────────────────
   A measurement, with its provenance attached. Numbers are set large and
   tabular because comparing them is the point. */
export function Cost({
  items,
}: {
  items: { what: string; value: string; source: string }[];
}) {
  return (
    <div className="glass my-7 grid gap-px overflow-hidden rounded-2xl bg-line sm:grid-cols-2">
      {items.map((it, i) => (
        <div key={i} className="bg-bg/40 p-4 backdrop-blur-sm">
          <div className="tnum mb-1 text-[22px] font-semibold leading-none tracking-tight text-accent">
            {it.value}
          </div>
          <div className="mb-2 text-[13.5px] leading-snug text-ink">{it.what}</div>
          <div className="font-mono text-[10.5px] leading-snug text-faint">{it.source}</div>
        </div>
      ))}
    </div>
  );
}

/* ── QA ──────────────────────────────────────────────────────────────────
   Interview questions, collapsed so the chapter reads straight through. */
export function QA({
  level = "intermediate", q, children,
}: {
  level?: "beginner" | "intermediate" | "deep";
  q: string;
  children: React.ReactNode;
}) {
  const tone = {
    beginner: "text-data bg-data/10",
    intermediate: "text-dist bg-dist/10",
    deep: "text-machine bg-machine/10",
  }[level];

  return (
    <details className="group glass mb-2 overflow-hidden rounded-xl">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 text-[14.5px] text-ink transition-colors hover:bg-surface-2">
        <span
          className={cn(
            "mt-[3px] shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider",
            tone,
          )}
        >
          {level}
        </span>
        <span className="flex-1 leading-snug">{q}</span>
        <span className="mt-1 shrink-0 text-faint transition-transform duration-200 group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-line px-4 py-3.5 pl-[84px] text-[14px] leading-relaxed text-muted [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
        {children}
      </div>
    </details>
  );
}

/* ── WildCard ────────────────────────────────────────────────────────────
   Named systems and named outages. */
export function WildCard({
  name, children, verdict,
}: {
  name: string;
  children: React.ReactNode;
  verdict?: string;
}) {
  return (
    <div className="glass glass-hover rounded-2xl p-4">
      <div className="mb-1.5 font-mono text-[12.5px] font-semibold text-accent">{name}</div>
      <div className="text-[13.8px] leading-relaxed text-muted [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
        {children}
      </div>
      {verdict && (
        <div className="mt-3 border-t border-line pt-2.5 text-[13px] text-ink">{verdict}</div>
      )}
    </div>
  );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="my-6 grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function StubNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-3 border-l border-line py-1 pl-4 text-[14.5px] leading-relaxed text-faint">
      {children}
    </p>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { groups, topics, labs, livePages, pageBySlug, type Page } from "@/lib/manifest";
import { readDoc } from "@/lib/mdx";
import { allPosts, formatDate } from "@/lib/posts";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  machine: "bg-machine", os: "bg-os", conc: "bg-conc", data: "bg-data",
  dist: "bg-dist", cloud: "bg-cloud", ops: "bg-ops", lab: "bg-lab",
};
const TEXT: Record<string, string> = {
  machine: "text-machine", os: "text-os", conc: "text-conc", data: "text-data",
  dist: "text-dist", cloud: "text-cloud", ops: "text-ops", lab: "text-lab",
};

/* A path through the book for someone who doesn't know where to start: the
   machine, then what the kernel builds on it, then what goes wrong when
   threads share it. Each builds on the one before. */
const START_HERE = [
  { slug: "01-cpu-architecture", why: "Why the same work can run five times faster" },
  { slug: "02-memory-hierarchy", why: "The 68× hiding in where your data sits" },
  { slug: "04-virtual-memory", why: "What an address really is" },
  { slug: "06-processes-scheduling", why: "Where the missing milliseconds go" },
  { slug: "13-locks", why: "Why count++ loses updates, and how locks fix it" },
];

const PROMISES = [
  ["Built from the problem", "Every chapter starts from what breaks without the idea, then builds the fix one step at a time, the way a good lecture does."],
  ["Measured, not remembered", "Numbers come from programs run on real hardware for the chapter, or they link to where they came from."],
  ["The real source", "Where it matters you read the actual kernel, glibc or Redis code, pinned to a version, not a paraphrase."],
];

export default function Home() {
  const chapterGroups = groups.filter((g) => g.slug !== "the-labs");
  const posts = allPosts().slice(0, 4);
  const path = START_HERE.map((s) => {
    const p = pageBySlug(s.slug)!;
    return { ...s, page: p, time: readDoc("chapters", s.slug)?.frontmatter.readingTime };
  });

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-[1180px] px-5 pb-28 sm:px-8">
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section className="grid gap-12 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
          <div>
            <p className="mb-5 text-[14px] font-medium text-accent">
              A field guide to the systems underneath your code
            </p>
            <h1 className="mb-7 font-[family-name:var(--font-serif)] text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[62px]">
              How computers really run your programs
            </h1>
            <p className="mb-9 max-w-[54ch] font-[family-name:var(--font-serif)] text-[19px] leading-relaxed text-muted sm:text-[20.5px]">
              Long-form chapters on CPUs, memory, the kernel, concurrency and storage,
              for engineers who want to understand what&rsquo;s happening underneath, not just
              which flag to set. Each one starts from a problem, builds the idea step by
              step, and measures it on real hardware.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/topics/01-cpu-architecture"
                className="group inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-[15px] font-medium text-bg transition-opacity hover:opacity-90"
              >
                Start with chapter 01
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/sections"
                className="inline-flex items-center gap-2 rounded-lg border border-line-2 px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-surface"
              >
                Browse all chapters
              </Link>
            </div>
            <p className="tnum mt-6 text-[13px] text-faint">
              {livePages.length} of {topics.length} chapters written · {allPosts().length} field notes
            </p>
          </div>

          {/* the reading path */}
          <aside className="self-start rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)]">
            <div className="mb-1 text-[13px] font-semibold text-ink">New here? Start with these</div>
            <p className="mb-5 text-[13px] leading-relaxed text-faint">
              Five chapters, in order. Each one builds on the one before.
            </p>
            <ol className="space-y-1">
              {path.map((s, i) => (
                <li key={s.slug}>
                  <Link
                    href={s.page.href}
                    className="group -mx-2 flex gap-3.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line-2 text-[12px] font-semibold text-muted">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug text-ink">
                        {s.page.short}
                      </span>
                      <span className="block text-[13px] leading-snug text-faint">
                        {s.why}
                        {s.time && ` · ${s.time.replace(/^~/, "")}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        {/* ── field notes ──────────────────────────────────────────────── */}
        {posts.length > 0 && (
          <section className="border-t border-line py-16">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="mb-2 text-[26px] font-bold tracking-[-0.02em] text-ink sm:text-[30px]">
                  Field notes
                </h2>
                <p className="max-w-[56ch] text-[15.5px] leading-relaxed text-muted">
                  Real outages and bugs, told start to finish, each with a reproduction you
                  can run.
                </p>
              </div>
              <Link href="/blog" className="inline-flex items-center gap-1 text-[14.5px] font-medium text-accent hover:text-accent-hover">
                All field notes <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid gap-x-10 gap-y-2 sm:grid-cols-2">
              {posts.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group border-t border-line py-5">
                  <div className="mb-2 flex items-center gap-2 text-[12.5px] text-faint">
                    <span className="font-semibold uppercase tracking-[0.06em] text-accent">{p.kicker}</span>
                    <span>{formatDate(p.date)}</span>
                  </div>
                  <div className="mb-1.5 font-[family-name:var(--font-serif)] text-[22px] font-semibold leading-snug text-ink group-hover:text-accent">
                    {p.title}
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted">{p.dek}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── the book ─────────────────────────────────────────────────── */}
        <section className="border-t border-line py-16">
          <h2 className="mb-2 text-[26px] font-bold tracking-[-0.02em] text-ink sm:text-[30px]">
            What&rsquo;s in the book
          </h2>
          <p className="mb-10 max-w-[60ch] text-[15.5px] leading-relaxed text-muted">
            {topics.length} chapters in {chapterGroups.length} parts, from the processor up to
            distributed systems, plus {labs.length} interactive labs. The first two parts are
            complete; the rest are being written.
          </p>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {chapterGroups.map((g) => {
              const live = g.pages.filter((p) => p.status === "live");
              return (
                <div key={g.slug}>
                  <Link href={`/sections#${g.slug}`} className="mb-3 flex items-center gap-2.5">
                    <span className={cn("size-2 rounded-full", DOT[g.colour])} />
                    <span className={cn("text-[15px] font-semibold", TEXT[g.colour])}>{g.name}</span>
                    <span className="tnum ml-auto text-[12.5px] text-faint">
                      {live.length}/{g.pages.length}
                    </span>
                  </Link>
                  <ul className="space-y-0.5 border-l border-line">
                    {g.pages.map((p: Page) => (
                      <li key={p.slug}>
                        <Link
                          href={p.href}
                          className={cn(
                            "-ml-px block border-l border-transparent py-1 pl-3.5 text-[14.5px] leading-snug transition-colors hover:border-ink hover:text-ink",
                            p.status === "live" ? "text-muted" : "text-faint/70",
                          )}
                        >
                          {p.short}
                          {p.status !== "live" && <span className="ml-1.5 text-[11.5px]">· soon</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── why trust it ─────────────────────────────────────────────── */}
        <section className="border-t border-line py-16">
          <h2 className="mb-10 text-[26px] font-bold tracking-[-0.02em] text-ink sm:text-[30px]">
            How it&rsquo;s written
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {PROMISES.map(([head, body]) => (
              <div key={head}>
                <div className="mb-2 font-[family-name:var(--font-serif)] text-[19px] font-semibold text-ink">{head}</div>
                <p className="text-[15px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-line pt-8 text-[13px] text-faint">
          <span className="font-[family-name:var(--font-serif)] font-semibold text-muted">KnowSys</span> · a sibling to{" "}
          <a href="https://knowml.vercel.app" className="underline decoration-line-2 underline-offset-2 hover:text-ink">
            KnowML
          </a>
        </footer>
      </main>
    </>
  );
}

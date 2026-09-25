import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Terrain } from "@/components/terrain";
import { groups, topics, labs, livePages, countOf } from "@/lib/manifest";
import { cn } from "@/lib/utils";
import { allPosts, formatDate } from "@/lib/posts";

const DOT: Record<string, string> = {
  machine: "bg-machine", os: "bg-os", conc: "bg-conc", data: "bg-data",
  dist: "bg-dist", cloud: "bg-cloud", ops: "bg-ops", lab: "bg-lab",
};
const FROM: Record<string, string> = {
  machine: "from-machine", os: "from-os", conc: "from-conc", data: "from-data",
  dist: "from-dist", cloud: "from-cloud", ops: "from-ops", lab: "from-lab",
};

const SHAPE_CARDS = [
  {
    name: "Mechanism",
    blurb: "A system you can open up and trace one operation through.",
    steps: "contract → layout → hot path → failure → cost → operating",
    count: `${countOf("mechanism")} chapters`,
  },
  {
    name: "Decision",
    blurb: "Several viable options, and the measured point where one overtakes another.",
    steps: "choice → options → crossover → choosing → mistakes",
    count: `${countOf("decision")} chapters`,
  },
  {
    name: "Model",
    blurb: "A small piece of theory that predicts something, and its limits.",
    steps: "question → model → origin → breaks → applying",
    count: `${countOf("model")} chapters`,
  },
  {
    name: "Phenomenon",
    blurb: "An effect you can observe and reproduce, not a component you can open.",
    steps: "observe → why → controls → measurements → act",
    count: `${countOf("phenomenon")} chapters`,
  },
];

const RULES = [
  ["Every number is derived here or attributed.",
   "Systems writing is full of folklore figures that were true on a 2012 spinning disk. If a latency appears, so does where it came from."],
  ["Every code block compiles and runs in CI.",
   "C++ by default, with the compiler, the flags and the kernel named. Shell transcripts say which machine produced them."],
  ["The real source, quoted.",
   "Fifteen lines of kernel/futex/core.c beat a paragraph describing it, so that's what you get — linked at a pinned tag."],
  ["Versions are named.",
   "Kernel 6.12 scheduling isn't kernel 5.4 scheduling, and a chapter that won't say which will be quietly wrong in two years."],
];

export default function Home() {
  const chapterGroups = groups.filter((g) => g.slug !== "the-labs");
  const posts = allPosts().slice(0, 4);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-[1180px] px-5 pb-24 sm:px-8">
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section className="pt-12 sm:pt-20">
          <div className="glass relative overflow-hidden rounded-[28px] p-8 sm:p-14">
            {/* a soft accent bloom inside the glass, so the panel looks lit */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-32 size-[420px] rounded-full opacity-60 blur-[90px]"
              style={{ background: "var(--glow)" }}
            />
            <Terrain className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] w-full opacity-[0.55]" />
            <div className="relative">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_1px_var(--glow)]" />
                <span className="tnum font-mono text-[11.5px] text-muted">
                  {livePages.length} of {topics.length} chapters written
                </span>
              </div>

              <h1 className="mb-6 max-w-[16ch] text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[64px]">
                The systems underneath, from the{" "}
                <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
                  cache line
                </span>{" "}
                up
              </h1>

              <p className="mb-9 max-w-[58ch] text-[17px] leading-relaxed text-muted">
                For engineers who already read the docs and the top three blog posts, and
                found them shallow. Futexes through to consensus, S3 through to the page
                cache, and the source that implements all of it.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/sections"
                  className="group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14.5px] font-semibold text-deep shadow-[0_8px_30px_-8px_var(--glow)] transition-all hover:bg-accent-hover hover:shadow-[0_10px_36px_-6px_var(--glow)]"
                >
                  Browse everything
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/labs"
                  className="glass glass-hover inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-medium text-ink"
                >
                  Open a lab
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── field notes ──────────────────────────────────────────────── */}
        {posts.length > 0 && (
          <section className="pt-20">
            <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-accent">
              Field notes
            </div>
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <h2 className="max-w-[24ch] text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[36px]">
                Real outages, told start to finish
              </h2>
              <Link href="/blog" className="inline-flex items-center gap-1 text-[14px] font-medium text-accent">
                All of them <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {posts.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="glass glass-hover group rounded-2xl p-5">
                  <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] text-faint">
                    <span className="uppercase tracking-wider text-accent">{p.kicker}</span>
                    <span>{formatDate(p.date)}</span>
                  </div>
                  <div className="mb-1.5 text-[16px] font-semibold leading-snug text-ink">{p.title}</div>
                  <p className="text-[13.5px] leading-relaxed text-muted">{p.dek}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── the shapes ───────────────────────────────────────────── */}
        <section className="pt-20">
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-accent">
            How everything here is written
          </div>
          <h2 className="mb-4 max-w-[24ch] text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[36px]">
            Four shapes, and a chapter only gets the one that fits it
          </h2>
          <p className="mb-10 max-w-[62ch] text-[16px] leading-relaxed text-muted">
            A mutex and a queueing model are not the same kind of subject, so they
            don&rsquo;t get the same sections. Each chapter declares its shape, and CI
            fails if the sections don&rsquo;t match &mdash; which is how a template stops
            being something you can feel.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {SHAPE_CARDS.map((s) => (
              <div key={s.name} className="glass rounded-2xl p-5">
                <div className="mb-1.5 flex items-baseline gap-2.5">
                  <span className="text-[15.5px] font-semibold text-ink">{s.name}</span>
                  <span className="tnum font-mono text-[11px] text-faint">{s.count}</span>
                </div>
                <p className="mb-3 text-[13.5px] leading-relaxed text-muted">{s.blurb}</p>
                <div className="font-mono text-[11.5px] leading-relaxed text-accent">
                  {s.steps}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── groups ───────────────────────────────────────────────────── */}
        <section className="pt-20">
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-accent">
            What&rsquo;s in here
          </div>
          <h2 className="mb-4 text-[28px] font-bold tracking-[-0.02em] text-ink sm:text-[36px]">
            {topics.length} chapters, {labs.length} labs, {chapterGroups.length} groups
          </h2>
          <p className="mb-10 max-w-[62ch] text-[16px] leading-relaxed text-muted">
            {livePages.length === 0
              ? "None are written yet. The stubs carry their six questions and say so on the page."
              : `${livePages.length} written so far. The rest are stubs, and they say so on the page.`}{" "}
            The machine and the operating system are the most complete: that&rsquo;s the layer every other group stands on.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chapterGroups.map((g) => (
              <Link
                key={g.slug}
                href={`/sections#${g.slug}`}
                className="glass glass-hover group relative overflow-hidden rounded-2xl p-5"
              >
                <span
                  className={cn(
                    "absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent opacity-60 transition-opacity group-hover:opacity-100",
                    FROM[g.colour],
                  )}
                />
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className={cn("size-2 rounded-full", DOT[g.colour])} />
                  <span className="text-[15.5px] font-semibold text-ink">{g.name}</span>
                  <span className="tnum ml-auto font-mono text-[11px] text-faint">
                    {g.pages.length}
                  </span>
                </div>
                <div className="text-[13px] leading-relaxed text-muted">
                  {g.pages.slice(0, 3).map((p) => p.short).join(" · ")}
                  {g.pages.length > 3 && " …"}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── rules ────────────────────────────────────────────────────── */}
        <section className="pt-20">
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-accent">
            The rules
          </div>
          <h2 className="mb-10 text-[28px] font-bold tracking-[-0.02em] text-ink sm:text-[36px]">
            What this site promises
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {RULES.map(([head, body]) => (
              <div key={head} className="glass rounded-2xl p-5">
                <div className="mb-2 text-[14.5px] font-semibold text-ink">{head}</div>
                <p className="text-[13.5px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-20 border-t border-line pt-8 text-[12.5px] text-faint">
          <span className="text-accent">KnowSys</span> · a sibling to{" "}
          <a href="https://knowml.vercel.app" className="transition-colors hover:text-accent">
            KnowML
          </a>
        </footer>
      </main>
    </>
  );
}

import Link from "next/link";
import type { Page } from "@/lib/manifest";
import type { Frontmatter } from "@/lib/mdx";
import { PageStats } from "./page-stats";
import { cn } from "@/lib/utils";

const TEXT: Record<string, string> = {
  machine: "text-machine", os: "text-os", conc: "text-conc", data: "text-data",
  dist: "text-dist", cloud: "text-cloud", ops: "text-ops", lab: "text-lab",
};
const FROM: Record<string, string> = {
  machine: "from-machine", os: "from-os", conc: "from-conc", data: "from-data",
  dist: "from-dist", cloud: "from-cloud", ops: "from-ops", lab: "from-lab",
};

/* A datasheet header rather than a hero. The facts that decide whether this
   chapter is worth your next half hour — how long, which versions, what it
   assumes — are the first thing on the page, in a grid you can scan. */
export function ChapterHeader({
  page, colour, fm,
}: {
  page: Page;
  colour: string;
  fm?: Frontmatter;
}) {
  const specs = [
    { k: "status", v: page.status === "live" ? "written" : "stub", lit: page.status === "live" },
    { k: "length", v: fm?.readingTime ?? "—" },
    { k: "pinned to", v: fm?.versions ?? "—" },
    { k: "assumes", v: fm?.prereqs ?? "—" },
  ];

  return (
    <header className="mb-10">
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-faint">
        <Link href="/" className="transition-colors hover:text-accent">~</Link>
        <span className="opacity-40">/</span>
        <Link href={`/sections#${page.groupSlug}`} className="transition-colors hover:text-accent">
          {page.group}
        </Link>
        <span className="opacity-40">/</span>
        <span className={cn("tnum", TEXT[colour])}>{page.num}</span>
        <span className="flex-1" />
        <PageStats pageId={page.slug} />
      </nav>

      <h1 className="mb-4 text-[36px] font-bold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[46px]">
        {page.title}
      </h1>

      <p className="mb-7 max-w-[62ch] text-[17.5px] leading-relaxed text-muted">
        {fm?.dek ?? page.hook}
      </p>

      <div className="glass relative overflow-hidden rounded-2xl">
        <span
          className={cn(
            "absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent opacity-70",
            FROM[colour],
          )}
        />
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {specs.map((s) => (
            <div key={s.k} className="bg-bg/30 px-4 py-3 backdrop-blur-sm">
              <dt className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.13em] text-faint">
                {s.k}
              </dt>
              <dd
                className={cn(
                  "flex items-center gap-1.5 text-[12.5px] leading-snug",
                  s.lit ? "text-accent" : "text-ink",
                )}
              >
                {s.lit && (
                  <span className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_1px_var(--glow)]" />
                )}
                {s.v}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

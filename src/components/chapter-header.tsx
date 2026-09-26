import Link from "next/link";
import type { Page } from "@/lib/manifest";
import type { Frontmatter } from "@/lib/mdx";
import { PageStats } from "./page-stats";
import { cn } from "@/lib/utils";

const TEXT: Record<string, string> = {
  machine: "text-machine", os: "text-os", conc: "text-conc", data: "text-data",
  dist: "text-dist", cloud: "text-cloud", ops: "text-ops", lab: "text-lab",
};
const BG: Record<string, string> = {
  machine: "bg-machine", os: "bg-os", conc: "bg-conc", data: "bg-data",
  dist: "bg-dist", cloud: "bg-cloud", ops: "bg-ops", lab: "bg-lab",
};

/* A title page, not a datasheet. It used to open with a four-cell spec grid,
   which made every chapter look like a dashboard before the first sentence.
   The facts are still here (how long, what it assumes, which versions) but
   as one quiet line under the title, where a book would put them. */
export function ChapterHeader({
  page, colour, fm,
}: {
  page: Page;
  colour: string;
  fm?: Frontmatter;
}) {
  const stub = page.status !== "live";

  return (
    <header className="mb-12">
      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className={cn("size-2 rounded-full", BG[colour])} />
        <Link
          href={`/sections#${page.groupSlug}`}
          className={cn("font-medium transition-opacity hover:opacity-75", TEXT[colour])}
        >
          {page.group}
        </Link>
        <span className="text-faint">·</span>
        <span className="tnum text-faint">Chapter {page.num}</span>
        {stub && (
          <span className="ml-1 rounded border border-line px-1.5 py-px text-[11px] text-faint">
            not written yet
          </span>
        )}
        <span className="flex-1" />
        <PageStats pageId={page.slug} />
      </div>

      <h1 className="mb-5 font-[family-name:var(--font-serif)] text-[38px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[50px]">
        {page.title}
      </h1>

      <p className="mb-7 max-w-[60ch] font-[family-name:var(--font-serif)] text-[19px] leading-relaxed text-muted sm:text-[21px]">
        {fm?.dek ?? page.hook}
      </p>

      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-3 text-[13px]">
        {fm?.readingTime && (
          <div className="flex gap-1.5">
            <dt className="text-faint">Read</dt>
            <dd className="text-muted">{fm.readingTime.replace(/^~/, "")}</dd>
          </div>
        )}
        {fm?.prereqs && (
          <div className="flex gap-1.5">
            <dt className="text-faint">Assumes</dt>
            <dd className="text-muted">{fm.prereqs}</dd>
          </div>
        )}
        {fm?.versions && (
          <div className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-faint">Versions</dt>
            <dd className="text-muted">{fm.versions}</dd>
          </div>
        )}
        {!fm && <dd className="text-faint">{page.hook}</dd>}
      </dl>
    </header>
  );
}

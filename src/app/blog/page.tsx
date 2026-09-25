import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { allPosts, formatDate } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Field notes",
  description: "Outages, reproductions and wrong numbers, each told start to finish.",
};

export default function BlogIndex() {
  const posts = allPosts();
  const tags = [...new Set(posts.flatMap((p) => p.tags))].sort();

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-14 sm:px-8">
        <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-accent">
          Field notes
        </div>
        <h1 className="mb-4 text-[36px] font-bold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[46px]">
          One story at a time
        </h1>
        <p className="mb-6 max-w-[60ch] text-[16.5px] leading-relaxed text-muted">
          The chapters are reference. These are one-sitting reads: a real outage, a bug you
          can reproduce on a laptop, a number everyone quotes that turns out to be wrong.
          Each one ends by pointing at the chapter that explains the machinery.
        </p>
        {tags.length > 0 && (
          <div className="mb-12 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-md border border-line px-2 py-0.5 font-mono text-[10.5px] text-faint"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="glass glass-hover group rounded-2xl p-6"
            >
              <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-faint">
                <span className="rounded-md bg-accent-soft px-1.5 py-px uppercase tracking-wider text-accent">
                  {p.kicker}
                </span>
                <span>{formatDate(p.date)}</span>
                {p.readingTime && <span>· {p.readingTime}</span>}
              </div>
              <h2 className="mb-2 text-[21px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                {p.title}
              </h2>
              <p className="mb-3 text-[14.5px] leading-relaxed text-muted">{p.dek}</p>
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                Read it <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
          {posts.length === 0 && <p className="text-muted">Nothing here yet.</p>}
        </div>
      </main>
    </>
  );
}

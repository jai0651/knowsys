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
      <main className="relative mx-auto max-w-[1100px] px-5 pb-28 pt-16 sm:px-8">
        <div aria-hidden className="hero-glow -top-10 h-[420px]" />
        <h1 className="mb-4 text-[42px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[56px]">
          Field <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">notes</span>
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
                className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] font-medium text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-accent"
            >
              <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-faint">
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent">{p.kicker}</span>
                <span>{formatDate(p.date)}</span>
                {p.readingTime && <span>· {p.readingTime}</span>}
              </div>
              <h2 className="mb-2 text-[21px] font-bold leading-snug tracking-[-0.015em] text-ink">
                {p.title}
              </h2>
              <p className="mb-4 flex-1 text-[15px] leading-relaxed text-muted">{p.dek}</p>
              <span className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent">
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

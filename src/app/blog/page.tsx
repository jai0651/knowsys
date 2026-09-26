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
        <h1 className="mb-4 font-[family-name:var(--font-serif)] text-[40px] font-semibold leading-[1.08] tracking-[-0.015em] text-ink sm:text-[52px]">
          Field notes
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
                className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col">
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group border-t border-line py-7"
            >
              <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-faint">
                <span className="font-semibold uppercase tracking-[0.06em] text-accent">{p.kicker}</span>
                <span>{formatDate(p.date)}</span>
                {p.readingTime && <span>· {p.readingTime}</span>}
              </div>
              <h2 className="mb-2 font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-snug text-ink transition-colors group-hover:text-accent">
                {p.title}
              </h2>
              <p className="mb-3 text-[16px] leading-relaxed text-muted">{p.dek}</p>
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

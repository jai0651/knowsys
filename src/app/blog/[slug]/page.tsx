import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { PageCard } from "@/components/page-card";
import { Mdx } from "@/components/mdx";
import { Notes } from "@/components/notes/notes";
import { ReadingProgress } from "@/components/reading-progress";
import { allPosts, postBySlug, formatDate } from "@/lib/posts";
import { pageBySlug, colourOf, type Page } from "@/lib/manifest";

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return {};
  return { title: post.title, description: post.dek };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();

  const related = post.related.map(pageBySlug).filter((p): p is Page => Boolean(p));
  const more = allPosts().filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <>
      <TopNav />
      <ReadingProgress />
      <main className="mx-auto max-w-[740px] px-5 pb-28 pt-14 sm:px-8">
        <header className="mb-12 border-b border-line pb-10">
          <nav className="mb-8 text-[13px]">
            <Link href="/blog" className="text-faint transition-colors hover:text-ink">← Field notes</Link>
          </nav>
          <div className="mb-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-faint">
            <span className="font-semibold uppercase tracking-[0.06em] text-accent">{post.kicker}</span>
            <span>{formatDate(post.date)}</span>
            {post.readingTime && <span>· {post.readingTime}</span>}
          </div>
          <h1 className="mb-6 font-[family-name:var(--font-serif)] text-[38px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[50px]">
            {post.title}
          </h1>
          <p className="max-w-[60ch] font-[family-name:var(--font-serif)] text-[20px] leading-relaxed text-muted sm:text-[21px]">{post.dek}</p>
          {post.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {post.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
        </header>

        <article className="prose" id="chapter-body">
          <Mdx source={post.body} />
        </article>

        {related.length > 0 && (
          <section className="mt-16">
            <div className="mb-4 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-accent">
              The machinery behind this story
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((p) => (
                <PageCard key={p.slug} page={p} colour={colourOf(p)} />
              ))}
            </div>
          </section>
        )}

        {more.length > 0 && (
          <section className="mt-14 border-t border-line pt-10">
            <div className="mb-4 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-faint">
              More field notes
            </div>
            <div className="flex flex-col gap-3">
              {more.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="glass glass-hover rounded-xl p-4">
                  <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">{p.kicker}</div>
                  <div className="text-[15px] font-semibold leading-snug text-ink">{p.title}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Notes title={post.title} />
    </>
  );
}

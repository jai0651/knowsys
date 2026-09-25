import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { PageCard } from "@/components/page-card";
import { Mdx } from "@/components/mdx";
import { Notes } from "@/components/notes/notes";
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
      <main className="mx-auto max-w-[720px] px-5 pb-24 pt-12 sm:px-8">
        <header className="mb-10">
          <nav className="mb-6 flex items-center gap-1.5 font-mono text-[11.5px] text-faint">
            <Link href="/" className="transition-colors hover:text-accent">~</Link>
            <span className="opacity-40">/</span>
            <Link href="/blog" className="transition-colors hover:text-accent">field notes</Link>
          </nav>
          <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-faint">
            <span className="rounded-md bg-accent-soft px-1.5 py-px uppercase tracking-wider text-accent">
              {post.kicker}
            </span>
            <span>{formatDate(post.date)}</span>
            {post.readingTime && <span>· {post.readingTime}</span>}
          </div>
          <h1 className="mb-5 text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
            {post.title}
          </h1>
          <p className="max-w-[60ch] text-[18px] leading-relaxed text-muted">{post.dek}</p>
          {post.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {post.tags.map((t) => (
                <span key={t} className="rounded-md border border-line px-2 py-0.5 font-mono text-[10.5px] text-faint">
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
                <Link key={p.slug} href={`/blog/${p.slug}`} className="glass glass-hover rounded-2xl p-4">
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

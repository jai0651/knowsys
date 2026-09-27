import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { Mdx } from "@/components/mdx";
import { SpineRail } from "@/components/spine-rail";
import { MobileToc } from "@/components/mobile-toc";
import { ReadingProgress } from "@/components/reading-progress";
import { PageCard } from "@/components/page-card";
import { Difficulty } from "@/components/difficulty";
import { Notes } from "@/components/notes/notes";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";
import { allProjects, projectBySlug } from "@/lib/projects";
import { outlineOf } from "@/lib/mdx";
import { pageBySlug, colourOf, type Page } from "@/lib/manifest";

export function generateStaticParams() {
  return allProjects().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = projectBySlug(slug);
  if (!p) return {};
  const url = `/projects/${p.slug}`;
  const title = `Build ${p.title}`;
  return {
    title,
    description: p.tagline,
    keywords: [title, `${p.title} from scratch`, "build your own", "systems project", ...p.languages],
    alternates: { canonical: url },
    openGraph: { type: "article", title, description: p.tagline, url },
    twitter: { card: "summary_large_image", title, description: p.tagline },
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = projectBySlug(slug);
  if (!p) notFound();
  const outline = outlineOf(p.body);
  const chapters = p.chapters.map(pageBySlug).filter((c): c is Page => Boolean(c));
  const all = allProjects();
  const i = all.findIndex((x) => x.slug === slug);
  const next = all[(i + 1) % all.length];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: `Build ${p.title}`,
          description: p.tagline,
          url: `${SITE.url}/projects/${p.slug}`,
          image: `${SITE.url}/projects/${p.slug}/opengraph-image`,
          step: [...p.body.matchAll(/<Milestone\s+n=\{(\d+)\}\s+title="([^"]+)"/g)].map((m) => ({ "@type": "HowToStep", position: Number(m[1]), name: m[2], url: `${SITE.url}/projects/${p.slug}#m${m[1]}` })),
        }}
      />
      <TopNav />
      <ReadingProgress />
      <div className="mx-auto flex max-w-[1320px] gap-10 px-5 sm:px-6">
        <main className="min-w-0 flex-1 pb-28 pt-10">
          <div className="mx-auto max-w-[760px]">
            <header className="relative mb-10 border-b border-line pb-10">
              <div aria-hidden className="hero-glow -top-16 h-[380px]" />
              <nav className="mb-6 text-[13px]">
                <Link href="/projects" className="text-faint hover:text-ink">← All projects</Link>
              </nav>
              <div className="mb-5 flex items-center gap-4">
                <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-[26px] text-white shadow-[0_10px_24px_-10px_var(--accent)]">{p.icon}</span>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent">Build it yourself</span>
              </div>
              <h1 className="mb-4 text-[38px] font-extrabold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[52px]">
                Build <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">{p.title}</span>
              </h1>
              <p className="mb-6 max-w-[62ch] text-[18.5px] leading-relaxed text-muted">{p.tagline}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-line bg-surface px-3 py-1.5"><Difficulty level={p.difficulty} /></span>
                {p.time && <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-muted">⏱ {p.time}</span>}
                {p.languages.length > 0 && (
                  <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-muted">{p.languages.join(" · ")}</span>
                )}
              </div>
            </header>

            <article className="prose" id="chapter-body">
              <Mdx source={p.body} />
            </article>

            {chapters.length > 0 && (
              <section className="mt-16">
                <h2 className="mb-4 text-[22px] font-bold tracking-[-0.02em] text-ink">Chapters that back this project</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {chapters.map((c) => <PageCard key={c.slug} page={c} colour={colourOf(c)} />)}
                </div>
              </section>
            )}

            {next && next.slug !== slug && (
              <Link href={`/projects/${next.slug}`} className="group mt-12 flex items-center justify-between rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] transition hover:border-accent">
                <span>
                  <span className="block text-[12.5px] text-faint">Next project</span>
                  <span className="text-[17px] font-bold text-ink">{next.icon} {next.title}</span>
                </span>
                <span className="text-accent transition-transform group-hover:translate-x-1">→</span>
              </Link>
            )}
          </div>
        </main>
        <SpineRail spine={outline} />
      </div>
      {outline.length > 0 && <MobileToc items={outline} />}
      <Notes title={p.title} />
    </>
  );
}

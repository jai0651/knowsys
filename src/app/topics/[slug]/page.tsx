import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
import { SpineRail } from "@/components/spine-rail";
import { ChapterHeader } from "@/components/chapter-header";
import { SectionHeading } from "@/components/section";
import { StubNote } from "@/components/content";
import { Mdx } from "@/components/mdx";
import { readDoc, outlineOf } from "@/lib/mdx";
import { topics, pageBySlug, neighbours, colourOf } from "@/lib/manifest";
import { shapeOf } from "@/lib/spine";
import { Notes } from "@/components/notes/notes";
import { ReadingProgress } from "@/components/reading-progress";

export function generateStaticParams() {
  return topics.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = pageBySlug(slug);
  if (!page) return {};
  return { title: page.title, description: page.hook };
}

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pageBySlug(slug);
  if (!page || page.kind !== "topic") notFound();

  const doc = readDoc("chapters", slug);

  /* A written chapter drives the rail from its own headings; a stub falls back
     to the generic skeleton, which is also exactly what it renders. */
  const shape = shapeOf(page.archetype);
  const parsed = doc ? outlineOf(doc.body) : [];
  /* Every numbered section goes in the rail, in page order. The archetype
     spine used to split them into two lists; the new chapter format is
     organised by topic, so there's one list. */
  const railSpine = parsed.length ? parsed : shape.spine.map((s) => ({ ...s, n: "", subs: [] }));
  const railTail = parsed.length ? [] : shape.tail.map((s) => ({ ...s, n: "", subs: [] }));
  const minutes = parseInt(doc?.frontmatter.readingTime?.replace(/\D/g, "") ?? "", 10) || undefined;
  const allSections = [...shape.spine, ...shape.tail];
  const { prev, next } = neighbours(slug);
  const colour = colourOf(page);

  return (
    <>
      <TopNav />
      {doc && <ReadingProgress />}
      <div className="mx-auto flex max-w-[1480px] gap-10 px-5 sm:px-6">
        <Sidebar currentSlug={slug} />

        <main className="min-w-0 flex-1 pb-28 pt-9">
          <div className="mx-auto max-w-[740px]">
            <ChapterHeader page={page} colour={colour} fm={doc?.frontmatter} outline={parsed} />

            <article className="prose" id="chapter-body">
              {doc ? (
                <Mdx source={doc.body} />
              ) : (
                allSections.map((s, i) => (
                  <section key={s.id} id={s.id} className="scroll-mt-28">
                    <SectionHeading n={String(i + 1).padStart(2, "0")} cmd={s.cmd}>
                      {s.label}
                    </SectionHeading>
                    <StubNote>{s.what}</StubNote>
                  </section>
                ))
              )}
            </article>

            <nav className="mt-20 grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
              {prev ? (
                <Link href={prev.href} className="group rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)] transition hover:border-accent">
                  <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-faint">
                    <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" /> Previous · {prev.num}
                  </div>
                  <div className="text-[16.5px] font-bold leading-snug text-ink">{prev.title}</div>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={next.href}
                  className="group rounded-xl border border-line bg-surface p-4 text-right shadow-[var(--shadow)] transition hover:border-accent sm:col-start-2"
                >
                  <div className="mb-1 flex items-center justify-end gap-1.5 text-[12.5px] text-faint">
                    Next · {next.num} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="text-[16.5px] font-bold leading-snug text-ink">{next.title}</div>
                </Link>
              )}
            </nav>
          </div>
        </main>

        <SpineRail spine={railSpine} tail={railTail} minutes={minutes} />
      </div>

      <Notes title={page.title} />
    </>
  );
}

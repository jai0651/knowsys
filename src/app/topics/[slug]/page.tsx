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
  const spineIds = new Set(shape.spine.map((s) => s.id));
  const railSpine = parsed.length
    ? parsed.filter((s) => spineIds.has(s.id))
    : shape.spine.map((s) => ({ ...s, n: "", subs: [] }));
  const railTail = parsed.length
    ? parsed.filter((s) => !spineIds.has(s.id))
    : shape.tail.map((s) => ({ ...s, n: "", subs: [] }));
  const allSections = [...shape.spine, ...shape.tail];
  const { prev, next } = neighbours(slug);
  const colour = colourOf(page);

  return (
    <>
      <TopNav />
      {doc && <ReadingProgress />}
      <div className="mx-auto flex max-w-[1440px] gap-6 px-5 pt-10 sm:px-8">
        <Sidebar currentSlug={slug} />

        <main className="min-w-0 flex-1 pb-24">
          <div className="mx-auto max-w-[700px]">
            <ChapterHeader page={page} colour={colour} fm={doc?.frontmatter} />

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
                <Link href={prev.href} className="group rounded-xl p-4 transition-colors hover:bg-surface">
                  <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-faint">
                    <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" /> Previous · {prev.num}
                  </div>
                  <div className="font-[family-name:var(--font-serif)] text-[18px] font-semibold leading-snug text-ink">{prev.title}</div>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={next.href}
                  className="group rounded-xl p-4 text-right transition-colors hover:bg-surface sm:col-start-2"
                >
                  <div className="mb-1 flex items-center justify-end gap-1.5 text-[12.5px] text-faint">
                    Next · {next.num} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="font-[family-name:var(--font-serif)] text-[18px] font-semibold leading-snug text-ink">{next.title}</div>
                </Link>
              )}
            </nav>
          </div>
        </main>

        <SpineRail spine={railSpine} tail={railTail} />
      </div>

      <Notes title={page.title} />
    </>
  );
}

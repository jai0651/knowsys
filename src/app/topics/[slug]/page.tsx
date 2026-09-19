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
      <div className="mx-auto flex max-w-[1560px] gap-2 px-4 pt-8 sm:px-6">
        <Sidebar currentSlug={slug} />

        <main className="min-w-0 flex-1 pb-24">
          <div className="mx-auto max-w-[768px] px-1 sm:px-6">
            <ChapterHeader page={page} colour={colour} fm={doc?.frontmatter} />

            <article className="prose">
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

            <nav className="mt-16 grid gap-3 sm:grid-cols-2">
              {prev ? (
                <Link href={prev.href} className="glass glass-hover group rounded-2xl p-4">
                  <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint">
                    <ArrowLeft className="size-3" /> previous
                  </div>
                  <div className="text-[14.5px] font-medium leading-snug text-ink">{prev.title}</div>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={next.href}
                  className="glass glass-hover group rounded-2xl p-4 text-right sm:col-start-2"
                >
                  <div className="mb-1.5 flex items-center justify-end gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint">
                    next <ArrowRight className="size-3" />
                  </div>
                  <div className="text-[14.5px] font-medium leading-snug text-ink">{next.title}</div>
                </Link>
              )}
            </nav>
          </div>
        </main>

        <SpineRail spine={railSpine} tail={railTail} title={shape.name} />
      </div>
    </>
  );
}

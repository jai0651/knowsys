import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
import { Panel } from "@/components/terminal-frame";
import { labs, pageBySlug } from "@/lib/manifest";

export function generateStaticParams() {
  return labs.map((p) => ({ slug: p.slug }));
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

export default async function LabPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pageBySlug(slug);
  if (!page || page.kind !== "lab") notFound();

  return (
    <>
      <TopNav />
      <div className="mx-auto flex max-w-[1560px] gap-2 px-4 pt-8 sm:px-6">
        <Sidebar currentSlug={slug} />
        <main className="min-w-0 flex-1 pb-24 sm:px-6">
          <div className="mx-auto max-w-[900px]">
            <nav className="mb-5 font-mono text-[12px] text-faint">
              <Link href="/" className="hover:text-accent">~</Link>
              <span className="px-1.5">/</span>
              <Link href="/labs" className="hover:text-accent">labs</Link>
              <span className="px-1.5">/</span>
              <span className="text-lab">{page.num}</span>
            </nav>

            <h1 className="mb-4 text-[34px] font-bold leading-[1.15] tracking-tight text-ink sm:text-[42px]">
              {page.title}
            </h1>
            <p className="mb-8 text-[17px] leading-relaxed text-muted">{page.hook}</p>

            <Panel
              label={`${slug} — not built yet`}
              right={<span className="font-mono text-[10px] text-faint">stub</span>}
            >
              <div className="grid min-h-[260px] place-items-center text-center">
                <div>
                  <div className="prompt mb-2 font-mono text-[13px] text-accent-dim">
                    ./{slug} --step
                  </div>
                  <p className="text-[14px] text-faint">
                    The lab runs in the browser, one step at a time, on an example small
                    enough to check by hand.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </main>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
import { Roadmaps, type Titles } from "@/components/roadmap";
import { ROUTES, OFF_ROUTE } from "@/lib/roadmaps";
import { topics, pageBySlug } from "@/lib/manifest";
import { pageMeta } from "@/lib/site";

export const metadata: Metadata = pageMeta(
  "/roadmaps",
  "Learning roadmaps",
  "Six ordered routes through KnowSys: the machine and the OS, concurrency, databases, distributed systems, running things in production, and a one-month system design interview plan. Each stage has a reading list down to the section, a checkpoint you can perform, a time estimate and what to skip.",
);

export default function RoadmapsPage() {
  const titles: Titles = Object.fromEntries(topics.map((p) => [p.slug, { title: p.title, num: p.num }]));
  return (
    <>
      <TopNav />
      <div className="mx-auto flex max-w-[1560px] gap-2 px-4 pt-8 sm:px-6">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-24 sm:px-6">
          <div className="mx-auto max-w-[920px]">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">Guide · {ROUTES.length} routes</div>
            <h1 className="mb-3 text-[42px] font-extrabold tracking-[-0.035em] text-ink sm:text-[52px]">
              Learning <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">roadmaps</span>
            </h1>
            <p className="mb-6 max-w-2xl text-[16.5px] leading-relaxed text-muted">
              {topics.length} chapters is a library, not a course. These are {ROUTES.length} routes through it, in order, each with
              a time cost, a checkpoint you have to pass, and a list of what to leave unread for now.
            </p>
            <div className="mb-10 max-w-2xl rounded-xl border border-accent/25 bg-accent/[0.05] px-5 py-4 text-[14.5px] leading-relaxed text-ink">
              A <b>suggested order, not a prerequisite chain</b>. Nothing is locked, so go straight to the page that helps with
              today&rsquo;s problem and backfill later. The skip lists matter more than they look: people mostly stall by trying
              to read everything.
            </div>

            <Roadmaps routes={ROUTES} titles={titles} />

            <section id="off-route" className="mb-16 scroll-mt-24">
              <div className="mb-1 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-faint">
                {String(ROUTES.length + 2).padStart(2, "0")}
              </div>
              <h2 className="mb-2 text-[26px] font-bold tracking-[-0.015em] text-ink">The chapters no roadmap sends you to</h2>
              <p className="mb-5 max-w-2xl text-[16px] leading-relaxed text-muted">
                Not because they&rsquo;re less good. They answer questions you&rsquo;ll only have in particular jobs, so read them when
                the question shows up. The case studies the interview route skips are in the{" "}
                <Link href="/sections#system-design-case-studies" className="font-medium text-accent underline underline-offset-2">full list</Link>.
              </p>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {OFF_ROUTE.map((o) => {
                  const p = pageBySlug(o.slug);
                  if (!p) return null;
                  return (
                    <Link key={o.slug} href={p.href} className="flex flex-col gap-0.5 px-5 py-3 transition hover:bg-surface-2 sm:flex-row sm:items-baseline sm:gap-4">
                      <span className="w-[300px] shrink-0 text-[14.5px] font-semibold text-ink">
                        <span className="mr-2 font-mono text-[12px] text-faint">{p.num}</span>{p.title}
                      </span>
                      <span className="text-[14px] text-muted">{o.when}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}

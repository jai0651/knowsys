import type { Metadata } from "next";
import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
import { PageCard } from "@/components/page-card";
import { groups, topics, labs, SPINE } from "@/lib/manifest";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Browse every chapter",
  description: "Every chapter and lab, grouped by subject.",
};

const DOT: Record<string, string> = {
  machine: "bg-machine", os: "bg-os", conc: "bg-conc", data: "bg-data",
  dist: "bg-dist", cloud: "bg-cloud", ops: "bg-ops", lab: "bg-lab",
};

export default function SectionsPage() {
  return (
    <>
      <TopNav />
      <div className="mx-auto flex max-w-[1560px] gap-2 px-4 pt-8 sm:px-6">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-24 sm:px-6">
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-accent">Everything</div>
          <h1 className="mb-3 text-[34px] font-bold tracking-tight text-ink sm:text-[40px]">
            Every chapter
          </h1>
          <p className="mb-12 max-w-2xl text-[15.5px] leading-relaxed text-muted">
            {topics.length} chapters and {labs.length} labs. Each chapter takes one of four
            shapes (mechanism, phenomenon, decision or model) and a mechanism chapter walks{" "}
            <span className="font-mono text-[13.5px] text-accent">{SPINE.join(" → ")}</span>.
          </p>

          {groups.map((g) => (
            <section key={g.slug} id={g.slug} className="mb-12 scroll-mt-20">
              <div className="mb-4 flex items-center gap-2.5">
                <span className={cn("size-2 rounded-full", DOT[g.colour])} />
                <h2 className="font-mono text-[12px] font-semibold uppercase tracking-[0.09em] text-muted">
                  {g.name}
                </h2>
                <span className="font-mono text-[11px] text-faint">{g.pages.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.pages.map((p) => (
                  <PageCard key={p.slug} page={p} colour={g.colour} />
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </>
  );
}

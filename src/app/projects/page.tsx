import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Difficulty } from "@/components/difficulty";
import { allProjects } from "@/lib/projects";

export const metadata: Metadata = {
  alternates: { canonical: "/projects" },
  title: "Build it yourself",
  description: "Game engines, browsers, kernels, containers, databases: the projects that teach systems best, with a roadmap for each.",
};

export default function ProjectsPage() {
  const projects = allProjects();
  return (
    <>
      <TopNav />
      <main className="relative mx-auto max-w-[1200px] px-5 pb-28 pt-16 sm:px-8">
        <div aria-hidden className="hero-glow -top-10 h-[460px]" />
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted shadow-[var(--shadow)]">
          <span className="size-1.5 rounded-full bg-gradient-to-r from-accent to-accent-2" />
          {projects.length} projects · roadmaps, not recipes
        </span>
        <h1 className="mb-5 max-w-[20ch] text-[44px] font-extrabold leading-[1.03] tracking-[-0.04em] text-ink sm:text-[62px]">
          Build it <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">yourself</span>
        </h1>
        <p className="mb-14 max-w-[62ch] text-[18px] leading-relaxed text-muted">
          The fastest way to understand a system is to build a small one. Each project here
          tells you why it&rsquo;s worth doing, breaks it into milestones you can finish one
          weekend at a time, names the ideas each milestone teaches and the traps that catch
          everyone, and points you at the chapters and references that fill in the rest. You
          write the code.
        </p>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.slug}
              href={`/projects/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] transition hover:-translate-y-1 hover:border-accent"
            >
              <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-[22px] text-on-accent shadow-[0_10px_24px_-10px_var(--accent)]">
                {p.icon}
              </span>
              <h2 className="mb-2 text-[20px] font-bold leading-snug tracking-[-0.02em] text-ink">{p.title.charAt(0).toUpperCase() + p.title.slice(1)}</h2>
              <p className="mb-5 flex-1 text-[14.5px] leading-relaxed text-muted">{p.tagline}</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {p.languages.map((l) => (
                  <span key={l} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[12px] text-muted">{l}</span>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-line pt-4">
                <Difficulty level={p.difficulty} />
                <span className="text-[12.5px] text-faint">{p.time}</span>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent">
                See the roadmap <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

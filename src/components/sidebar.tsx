import Link from "next/link";
import { groups } from "@/lib/manifest";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  machine: "bg-machine", os: "bg-os", conc: "bg-conc", data: "bg-data",
  dist: "bg-dist", cloud: "bg-cloud", ops: "bg-ops", lab: "bg-lab",
};
const GLOW: Record<string, string> = {
  machine: "shadow-machine/50", os: "shadow-os/50", conc: "shadow-conc/50",
  data: "shadow-data/50", dist: "shadow-dist/50", cloud: "shadow-cloud/50",
  ops: "shadow-ops/50", lab: "shadow-lab/50",
};

export function Sidebar({ currentSlug }: { currentSlug?: string }) {
  return (
    <aside className="hidden w-[276px] shrink-0 lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-10 pr-3">
        <div className="glass rounded-2xl p-2">
          {groups.map((g) => {
            const open = g.pages.some((p) => p.slug === currentSlug) || !currentSlug;
            return (
              <details key={g.slug} open={open} className="group">
                <summary className="flex cursor-pointer list-none items-start gap-2.5 rounded-xl px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted transition-colors hover:bg-surface-2 hover:text-ink">
                  <span className={cn("mt-[3px] size-[7px] shrink-0 rounded-full shadow-[0_0_8px_0px]", DOT[g.colour], GLOW[g.colour])} />
                  <span className="flex-1 leading-tight">{g.name}</span>
                  <span className="tnum shrink-0 font-mono text-[10px] font-normal text-faint">
                    {g.pages.filter((p) => p.status === "live").length}/{g.pages.length}
                  </span>
                </summary>
                <div className="mb-2 ml-[13px] border-l border-line pl-2.5">
                  {g.pages.map((p) => {
                    const active = p.slug === currentSlug;
                    return (
                      <Link
                        key={p.slug}
                        href={p.href}
                        className={cn(
                          "relative block rounded-lg px-2.5 py-[6.5px] text-[12.8px] leading-snug transition-colors",
                          active
                            ? "bg-accent-soft font-medium text-ink"
                            : "text-muted hover:bg-surface-2 hover:text-ink",
                          p.status === "stub" && !active && "opacity-50",
                        )}
                      >
                        {active && (
                          <span className="absolute -left-[11px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_8px_1px_var(--glow)]" />
                        )}
                        <span className="tnum mr-2 font-mono text-[10.5px] text-faint">{p.num}</span>
                        {p.short}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

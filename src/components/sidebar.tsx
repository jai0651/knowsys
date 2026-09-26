import Link from "next/link";
import { groups } from "@/lib/manifest";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  machine: "bg-machine", os: "bg-os", conc: "bg-conc", data: "bg-data",
  dist: "bg-dist", cloud: "bg-cloud", ops: "bg-ops", lab: "bg-lab",
};

/* The table of contents for the whole book. Plain type on the page, no box:
   it's there to orient you, and it shouldn't compete with the chapter. The
   group you're in is open; the others fold to one line each. */
export function Sidebar({ currentSlug }: { currentSlug?: string }) {
  return (
    <aside className="hidden w-[250px] shrink-0 lg:block">
      <nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 pr-4 text-[13.5px]">
        {groups.map((g) => {
          const open = g.pages.some((p) => p.slug === currentSlug) || !currentSlug;
          const written = g.pages.filter((p) => p.status === "live").length;
          return (
            <details key={g.slug} open={open} className="group mb-1">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1.5 pr-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted transition-colors hover:text-ink">
                <span className={cn("size-[7px] shrink-0 rounded-full", DOT[g.colour])} />
                <span className="flex-1 leading-tight">{g.name}</span>
                <span className="tnum text-[11px] font-normal normal-case tracking-normal text-faint">
                  {written}/{g.pages.length}
                </span>
              </summary>
              <div className="mb-3 ml-[3px] border-l border-line">
                {g.pages.map((p) => {
                  const active = p.slug === currentSlug;
                  const stub = p.status === "stub";
                  return (
                    <Link
                      key={p.slug}
                      href={p.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative -ml-px block border-l py-[5px] pl-3.5 leading-snug transition-colors",
                        active
                          ? "border-accent font-medium text-ink"
                          : "border-transparent hover:border-line-2 hover:text-ink",
                        !active && (stub ? "text-faint/70" : "text-muted"),
                      )}
                    >
                      <span className="tnum mr-2 text-[11px] text-faint">{p.num}</span>
                      {p.short}
                    </Link>
                  );
                })}
              </div>
            </details>
          );
        })}
      </nav>
    </aside>
  );
}

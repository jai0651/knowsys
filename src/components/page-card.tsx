import Link from "next/link";
import type { Page } from "@/lib/manifest";
import { cn } from "@/lib/utils";

const TEXT: Record<string, string> = {
  machine: "text-machine", os: "text-os", conc: "text-conc", data: "text-data",
  dist: "text-dist", cloud: "text-cloud", ops: "text-ops", lab: "text-lab",
};
const FROM: Record<string, string> = {
  machine: "from-machine", os: "from-os", conc: "from-conc", data: "from-data",
  dist: "from-dist", cloud: "from-cloud", ops: "from-ops", lab: "from-lab",
};

export function PageCard({ page, colour }: { page: Page; colour: string }) {
  return (
    <Link
      href={page.href}
      className="glass glass-hover group relative flex flex-col overflow-hidden rounded-2xl p-4"
    >
      {/* group colour as a hairline across the top, lighting up on hover */}
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent opacity-50 transition-opacity group-hover:opacity-100",
          FROM[colour],
        )}
      />

      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn("tnum font-mono text-[11px] font-semibold", TEXT[colour])}>
          {page.num}
        </span>
        {page.status === "stub" ? (
          <span className="rounded-md border border-line px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wider text-faint">
            stub
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wider text-accent">
            <span className="size-1 rounded-full bg-accent" />
            written
          </span>
        )}
      </div>

      <div className="mb-1.5 text-[15px] font-semibold leading-snug text-ink">{page.title}</div>
      <div className="text-[13.2px] leading-relaxed text-muted">{page.hook}</div>
    </Link>
  );
}

import { cn } from "@/lib/utils";

/* A section heading with the shell line that describes it. The command is set
   small and dim above the title — present for the reader who wants it, quiet
   enough not to compete with the heading. */
export function SectionHeading({
  n, cmd, id, children, className,
}: {
  n?: string;
  cmd?: string;
  /* The anchor the TOC, search and shared links point at. This prop was
     accepted and then dropped, so no chapter section had an id and every
     "On this page" link went nowhere. */
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div id={id} className={cn("mb-6 mt-20 scroll-mt-24 first:mt-0", className)}>
      {n && (
        <div className="tnum mb-2 font-[family-name:var(--font-inter)] text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">
          Section {n.replace(/^0/, "")}
        </div>
      )}
      <h2 className="font-[family-name:var(--font-inter)] text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[33px]">
        {children}
      </h2>
      {cmd && (
        <div className="mt-2 truncate font-mono text-[12px] text-faint" title="A command that shows this on a real system">
          <span className="opacity-60">$ </span>
          {cmd}
        </div>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";

/* A section heading with the shell line that describes it. The command is set
   small and dim above the title — present for the reader who wants it, quiet
   enough not to compete with the heading. */
export function SectionHeading({
  n, cmd, children, className,
}: {
  n?: string;
  cmd?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 mt-16 scroll-mt-28 first:mt-0", className)}>
      {cmd && (
        <div className="mb-2.5 flex items-center gap-2 font-mono text-[11.5px] text-accent-dim">
          <span className="text-accent opacity-70">$</span>
          {cmd}
        </div>
      )}
      <h2 className="flex items-baseline gap-3 text-[27px] font-bold leading-tight tracking-[-0.015em] text-ink sm:text-[31px]">
        {n && <span className="tnum font-mono text-[15px] font-medium text-faint">{n}</span>}
        {children}
      </h2>
    </div>
  );
}

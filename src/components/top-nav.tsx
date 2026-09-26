import Link from "next/link";
import { Search } from "./search";
import { ThemeToggle } from "./theme-toggle";
import { MobileMenu } from "./mobile-menu";
import { ProgressPill } from "./progress-pill";
import { groups, livePages } from "@/lib/manifest";

const LINKS = [
  { href: "/sections", label: "Chapters" },
  { href: "/labs", label: "Labs" },
  { href: "/blog", label: "Field notes" },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6">
        <MobileMenu groups={groups.map((g) => ({ slug: g.slug, name: g.name, pages: g.pages }))} />
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.02em] text-ink">
          <span className="size-[26px] rounded-lg bg-gradient-to-br from-accent to-accent-2 shadow-[0_0_20px_-4px_var(--accent)]" />
          KnowSys
        </Link>
        <nav className="ml-4 hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <Search />
        <ProgressPill total={livePages.filter((p) => p.kind === "topic").length} />
        <ThemeToggle />
      </div>
    </header>
  );
}

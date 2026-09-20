import Link from "next/link";
import { PaletteSwitcher } from "./palette-switcher";
import { Search } from "./search";

const LINKS = [
  { href: "/sections", label: "Chapters" },
  { href: "/labs", label: "Labs" },
];

export function TopNav() {
  return (
    <div className="pointer-events-none sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <header className="glass pointer-events-auto mx-auto flex h-14 max-w-[1560px] items-center gap-4 rounded-2xl px-4 sm:px-5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative grid size-7 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
            <span className="size-2 rounded-full bg-accent shadow-[0_0_12px_2px_var(--glow)]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Know<span className="text-accent">Sys</span>
          </span>
        </Link>

        <div className="flex-1" />

        <nav className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Search />
        <PaletteSwitcher />
      </header>
    </div>
  );
}

import Link from "next/link";
import { Search } from "./search";
import { ThemeToggle } from "./theme-toggle";
import { MobileMenu } from "./mobile-menu";
import { groups } from "@/lib/manifest";

const LINKS = [
  { href: "/sections", label: "Chapters" },
  { href: "/blog", label: "Field notes" },
  { href: "/labs", label: "Labs" },
];

/* A flat bar with a hairline under it. It used to be a floating glass pill;
   on a page you read for twenty minutes the chrome should be the quietest
   thing on the screen. */
export function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <MobileMenu groups={groups.map((g) => ({ slug: g.slug, name: g.name, pages: g.pages }))} />
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="font-[family-name:var(--font-serif)] text-[21px] font-semibold tracking-[-0.01em] text-ink">
            KnowSys
          </span>
        </Link>

        <nav className="ml-4 hidden items-center sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-[14px] text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />
        <Search />
        <ThemeToggle />
      </div>
    </header>
  );
}

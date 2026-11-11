"use client";

import { Children, isValidElement, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";

const LANG: Record<string, string> = {
  cpp: "C++", c: "C", sh: "Shell", bash: "Shell", shell: "Shell", console: "Shell",
  go: "Go", rust: "Rust", python: "Python", py: "Python", asm: "Assembly",
  js: "JavaScript", ts: "TypeScript", sql: "SQL", ini: "Config", yaml: "YAML",
  json: "JSON", text: "Output", txt: "Output", diff: "Diff", swift: "Swift",
};

/* Blocks longer than FOLD lines start folded to PEEK lines, so a long
   listing doesn't push the explanation off the screen. The count comes from
   rehype-pretty-code's [data-line] spans, so it's known at render time and
   the page doesn't jump after load. */
const FOLD = 16;
const PEEK = 12;

function countLines(children: React.ReactNode): number {
  let n = 0;
  Children.forEach(children, (c) => {
    if (!isValidElement<{ children?: React.ReactNode; "data-line"?: string }>(c)) return;
    if (c.props["data-line"] !== undefined) n++;
    else n += countLines(c.props.children);
  });
  return n;
}

/* Every fenced block gets a header with its language and a copy button.
   Copying reads the rendered text, so what lands on the clipboard is exactly
   what's on the page. */
export function CodeBlock(props: React.ComponentProps<"pre"> & { "data-language"?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [done, setDone] = useState(false);
  const lang = props["data-language"];
  const lines = countLines(props.children);
  const foldable = lines > FOLD;
  const [folded, setFolded] = useState(true);
  const isFolded = foldable && folded;

  async function copy() {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ""));
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {}
  }

  return (
    <div className="code-block group/code relative my-7 overflow-hidden rounded-xl border border-line bg-[var(--code-bg)]">
      <div className="code-head flex h-9 items-center justify-between border-b border-line px-4 text-[11.5px] text-faint">
        <span className="font-medium">{(lang && LANG[lang]) ?? lang ?? "Code"}</span>
        <button
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 opacity-70 transition hover:bg-surface-2 hover:text-ink hover:opacity-100"
        >
          {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="relative">
        <pre
          {...props}
          ref={ref}
          style={isFolded ? { maxHeight: `calc(${PEEK} * 1.65 * 13.5px + 1rem)`, overflow: "hidden" } : undefined}
          className="overflow-x-auto py-4 text-[13.5px] leading-[1.65]"
        />
        {isFolded && <div className="code-fade pointer-events-none absolute inset-x-0 bottom-0 h-20" aria-hidden />}
      </div>
      {foldable && (
        <button
          onClick={() => {
            if (!folded) ref.current?.closest(".code-block")?.scrollIntoView({ block: "nearest" });
            setFolded(!folded);
          }}
          className="code-fold flex w-full items-center justify-center gap-1.5 border-t border-line py-2 font-[family-name:var(--font-inter)] text-[12.5px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <ChevronDown className={`size-3.5 transition-transform ${folded ? "" : "rotate-180"}`} />
          {folded ? `Show all ${lines} lines` : "Fold it back"}
        </button>
      )}
    </div>
  );
}

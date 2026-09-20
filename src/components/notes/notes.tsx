"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Highlighter, StickyNote, Trash2, X } from "lucide-react";
import { occurrenceAt, paint, rangeToOffsets, unwrap, type Anchor } from "@/lib/anchor";
import { COLOURS, toMarkdown, useNotes, type Colour, type Highlight } from "./store";
import { cn } from "@/lib/utils";

const ROOT_ID = "chapter-body";
const uid = () => "h" + Math.random().toString(36).slice(2, 10);

/* ──────────────────────────────────────────────────────────────────────────
   Highlights are painted into server-rendered MDX by direct DOM mutation, not
   by React. That is safe here precisely because the article is a server
   component that never re-renders: React has no virtual DOM opinion about the
   <mark> elements, so it will not fight them or throw them away.
   ────────────────────────────────────────────────────────────────────────── */

export function Notes({ title }: { title: string }) {
  const path = usePathname();
  const { notes, ready, update } = useNotes(path);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<{ x: number; y: number; anchor: Anchor } | null>(null);
  /* An existing highlight the reader has clicked. Without this, removing one
     meant opening the drawer and finding it in a list, which is a long way
     round for "I didn't mean that". */
  const [active, setActive] = useState<{ x: number; y: number; id: string } | null>(null);
  const painted = useRef(false);

  const root = () => document.getElementById(ROOT_ID);

  /* ── paint ──────────────────────────────────────────────────────────── */
  const repaint = useCallback((list: Highlight[]) => {
    const el = root();
    if (!el) return;
    el.querySelectorAll("mark.hl").forEach((m) => unwrap(m as HTMLElement));
    for (const h of list) {
      const pieces = paint(el, h, () => {
        const m = document.createElement("mark");
        m.className = `hl hl-${h.colour}${h.note ? " has-note" : ""}`;
        m.dataset.hid = h.id;
        if (h.note) m.title = h.note;
        return m;
      });
      /* A highlight crossing inline markup paints as several <mark>s. Round
         only the outer edges so the run reads as one band, not a row of pills. */
      if (pieces.length) {
        pieces[0].classList.add("hl-first");
        pieces[pieces.length - 1].classList.add("hl-last");
      }
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    repaint(notes.highlights);
    painted.current = true;
  }, [ready, notes.highlights, repaint]);

  /* ── selection ──────────────────────────────────────────────────────── */
  useEffect(() => {
    function onUp(e: MouseEvent) {
      if ((e.target as HTMLElement)?.closest?.("[data-notes-ui]")) return;
      const s = window.getSelection();
      const el = root();
      if (!s || s.isCollapsed || !el) return setSel(null);
      const range = s.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return setSel(null);

      const at = rangeToOffsets(el, range);
      if (!at || at.text.trim().length < 2) return setSel(null);

      const rect = range.getBoundingClientRect();
      setSel({
        x: rect.left + rect.width / 2,
        y: rect.top,
        anchor: { ...at, occurrence: occurrenceAt(el, at.start, at.text) },
      });
    }
    function onDown(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (el?.closest?.("[data-notes-ui]")) return;
      setSel(null);
      const mark = el?.closest?.("mark.hl") as HTMLElement | null;
      if (mark?.dataset.hid) {
        const r = mark.getBoundingClientRect();
        setActive({ x: r.left + r.width / 2, y: r.top, id: mark.dataset.hid });
      } else {
        setActive(null);
      }
    }
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  /* ── mutations ──────────────────────────────────────────────────────── */
  function add(colour: Colour, note?: string) {
    if (!sel) return;
    const h: Highlight = { id: uid(), colour, note, ...sel.anchor, created: Date.now() };
    update((p) => ({ ...p, highlights: [...p.highlights, h] }));
    window.getSelection()?.removeAllRanges();
    setSel(null);
  }
  function remove(id: string) {
    update((p) => ({ ...p, highlights: p.highlights.filter((h) => h.id !== id) }));
  }
  function recolour(id: string, colour: Colour) {
    update((p) => ({
      ...p,
      highlights: p.highlights.map((h) => (h.id === id ? { ...h, colour } : h)),
    }));
  }
  function setNote(id: string, note: string) {
    update((p) => ({
      ...p,
      highlights: p.highlights.map((h) => (h.id === id ? { ...h, note: note || undefined } : h)),
    }));
  }
  function jump(id: string) {
    const m = root()?.querySelector(`mark.hl[data-hid="${id}"]`);
    m?.scrollIntoView({ block: "center", behavior: "smooth" });
    m?.classList.add("hl-flash");
    setTimeout(() => m?.classList.remove("hl-flash"), 1200);
  }
  function exportMd() {
    const md = toMarkdown(title, location.href, notes);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${path.split("/").pop() || "notes"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const count = notes.highlights.length;

  return (
    <>
      {/* ── the launcher, bottom right ─────────────────────────────────── */}
      <button
        data-notes-ui
        onClick={() => setOpen((o) => !o)}
        aria-label="Notes and highlights"
        className="glass glass-hover fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] text-ink"
      >
        <Highlighter className="size-4 text-accent" />
        <span className="hidden sm:inline">Notes</span>
        {count > 0 && (
          <span className="tnum grid min-w-[20px] place-items-center rounded-full bg-accent px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-deep">
            {count}
          </span>
        )}
      </button>

      {/* ── selection toolbar ──────────────────────────────────────────── */}
      {sel && (
        <div
          data-notes-ui
          className="glass-panel fixed z-[60] flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl p-1.5"
          style={{ left: sel.x, top: sel.y - 10 }}
        >
          {COLOURS.map((c) => (
            <button
              key={c}
              onClick={() => add(c)}
              aria-label={`Highlight ${c}`}
              className={cn("size-6 rounded-lg ring-1 ring-inset ring-white/15 transition-transform hover:scale-110", `swatch-${c}`)}
            />
          ))}
          <span className="mx-0.5 h-5 w-px bg-line" />
          <button
            onClick={() => add("mint", " ")}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <StickyNote className="size-3.5" /> Note
          </button>
        </div>
      )}

      {/* ── clicked-highlight menu ─────────────────────────────────────── */}
      {active && (() => {
        const h = notes.highlights.find((x) => x.id === active.id);
        if (!h) return null;
        return (
          <div
            data-notes-ui
            className="glass-panel fixed z-[60] w-[260px] -translate-x-1/2 -translate-y-full rounded-xl p-2"
            style={{ left: Math.min(Math.max(active.x, 140), window.innerWidth - 140), top: active.y - 10 }}
          >
            <div className="flex items-center gap-1 px-1 pb-2">
              {COLOURS.map((c) => (
                <button
                  key={c}
                  onClick={() => recolour(active.id, c)}
                  aria-label={`Recolour ${c}`}
                  className={cn(
                    "size-6 rounded-lg ring-1 ring-inset transition-transform hover:scale-110",
                    `swatch-${c}`,
                    h.colour === c ? "ring-2 ring-ink" : "ring-white/15",
                  )}
                />
              ))}
              <span className="flex-1" />
              <button
                onClick={() => { remove(active.id); setActive(null); }}
                aria-label="Remove highlight"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted transition-colors hover:bg-machine/15 hover:text-machine"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            </div>
            <textarea
              autoFocus={!!h.note}
              value={h.note ?? ""}
              onChange={(e) => setNote(active.id, e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full resize-y rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-2"
            />
          </div>
        );
      })()}

      {/* ── drawer ─────────────────────────────────────────────────────── */}
      {open && (
        <>
          <div className="fixed inset-0 z-[55] bg-deep/70 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
          <aside
            data-notes-ui
            className="glass-panel fixed right-0 top-0 z-[60] flex h-full w-full max-w-[430px] flex-col"
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Highlighter className="size-4 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">Notes</div>
                <div className="truncate text-[11.5px] text-faint">{title}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-faint">
                Free notes
              </div>
              <textarea
                value={notes.freeNotes}
                onChange={(e) => update((p) => ({ ...p, freeNotes: e.target.value }))}
                placeholder="Anything — a number to remember, a gap to revisit…"
                className="mb-6 min-h-[120px] w-full resize-y rounded-xl border border-line bg-surface-2 p-3 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-line-2"
              />

              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.13em] text-faint">
                Highlights
                <span className="tnum text-accent">{count}</span>
              </div>

              {count === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-4 text-[13px] leading-relaxed text-faint">
                  Select any text in the chapter to highlight it or attach a note.
                  Everything saves automatically, and only on this device.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...notes.highlights]
                    .sort((a, b) => a.start - b.start)
                    .map((h) => (
                      <div key={h.id} className="group rounded-xl border border-line bg-surface-2 p-3">
                        <div className="flex items-start gap-2.5">
                          <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", `swatch-${h.colour}`)} />
                          <button
                            onClick={() => jump(h.id)}
                            className="flex-1 text-left text-[13px] leading-relaxed text-ink hover:text-accent"
                          >
                            {h.text.length > 180 ? h.text.slice(0, 180) + "…" : h.text}
                          </button>
                          <button
                            onClick={() => remove(h.id)}
                            aria-label="Delete highlight"
                            className="shrink-0 text-faint opacity-0 transition-opacity hover:text-machine group-hover:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <textarea
                          value={h.note ?? ""}
                          onChange={(e) => setNote(h.id, e.target.value)}
                          placeholder="Add a note…"
                          rows={h.note ? 2 : 1}
                          className="mt-2 w-full resize-y rounded-lg border border-line bg-bg/40 px-2.5 py-1.5 text-[12.5px] text-muted outline-none placeholder:text-faint focus:border-line-2"
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>

            <footer className="flex gap-2 border-t border-line px-5 py-3.5">
              <button
                onClick={exportMd}
                disabled={!count && !notes.freeNotes.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line py-2 text-[12.5px] text-ink transition-colors hover:border-line-2 hover:bg-surface-2 disabled:opacity-40"
              >
                <Download className="size-3.5" /> Export .md
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete all notes and highlights on this page?")) {
                    update(() => ({ freeNotes: "", highlights: [] }));
                  }
                }}
                disabled={!count && !notes.freeNotes.trim()}
                className="rounded-lg border border-line px-3 py-2 text-[12.5px] text-muted transition-colors hover:border-machine/50 hover:text-machine disabled:opacity-40"
              >
                Clear
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

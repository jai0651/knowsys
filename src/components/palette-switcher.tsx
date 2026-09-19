"use client";

import { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";

const PALETTES = [
  { id: "aurora",    name: "Aurora",    hint: "teal glass, mint light",     swatch: ["#061419", "#2ee6b0", "#45c8f5"] },
  { id: "blueprint", name: "Blueprint", hint: "paper, ink, drawing blue",   swatch: ["#faf9f6", "#2b5fd9", "#14161a"] },
  { id: "graphite",  name: "Graphite",  hint: "neutral grey, one signal",   swatch: ["#111111", "#ff5c35", "#ededed"] },
  { id: "plum",      name: "Plum",      hint: "aubergine, acid lime",       swatch: ["#15111c", "#bfff3c", "#c89bff"] },
];

export function PaletteSwitcher() {
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState("aurora");
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    const d = document.documentElement;
    setPalette(d.getAttribute("data-palette") ?? "aurora");
    setMode(d.getAttribute("data-theme") ?? "dark");
  }, []);

  function pick(id: string) {
    const d = document.documentElement;
    const nextMode = id === "blueprint" ? "light" : "dark";
    d.setAttribute("data-palette", id);
    d.setAttribute("data-theme", nextMode);
    setPalette(id);
    setMode(nextMode);
    try {
      localStorage.setItem("ks-palette", id);
      localStorage.setItem("ks-mode", nextMode);
    } catch {}
    setOpen(false);
  }

  function toggleMode() {
    const next = mode === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setMode(next);
    try {
      localStorage.setItem("ks-mode", next);
    } catch {}
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        onClick={toggleMode}
        aria-label={mode === "dark" ? "Switch to light" : "Switch to dark"}
        className="glass glass-hover grid size-9 place-items-center rounded-xl text-muted hover:text-ink"
      >
        {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change palette"
        aria-expanded={open}
        className="glass glass-hover grid size-9 place-items-center rounded-xl text-muted hover:text-ink"
      >
        <Palette className="size-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass absolute right-0 top-11 z-50 w-[248px] rounded-2xl p-1.5">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex shrink-0 -space-x-1.5">
                  {p.swatch.map((c) => (
                    <span
                      key={c}
                      className="size-4 rounded-full ring-1 ring-black/25"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-[11.5px] text-faint">{p.hint}</span>
                </span>
                {palette === p.id && <Check className="size-3.5 shrink-0 text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

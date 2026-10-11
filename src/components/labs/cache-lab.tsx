"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/* Three caches with the same six slots, fed the same requests one at a time.
   LRU keeps a recency list, LFU keeps a count per cached key, and W-TinyLFU
   keeps a one-slot window, a segmented main region and a count-min sketch
   that decides who gets in. Every step shows the hit or miss, the eviction
   and the reason, so the hit rates can be checked by hand. */

// --- sim start
export const CAPACITY = 6;
/* Caffeine's split: the window is 1% of the cache and the rest is main, of
   which 80% may be protected. At six slots that rounds to 1, 5 and 4. */
export const WINDOW_MAX = CAPACITY - Math.floor(0.99 * CAPACITY);
export const MAIN_MAX = CAPACITY - WINDOW_MAX;
export const PROTECTED_MAX = Math.floor(0.8 * MAIN_MAX);
export const SKETCH_ROWS = 4;
export const SKETCH_WIDTH = 16;
export const COUNTER_MAX = 15;
/* After ten increments per cache slot, every counter is halved. */
export const SAMPLE_SIZE = 10 * CAPACITY;

export interface Outcome {
  hit: boolean;
  evicted: string | null;
  note: string;
}

export interface Duel {
  candidate: string;
  cf: number;
  victim: string;
  vf: number;
  admitted: boolean;
}

export interface WOutcome extends Outcome {
  duel: Duel | null;
  reset: boolean;
}

export interface LfuEntry { key: string; count: number; last: number }

export interface SimState {
  t: number;
  lru: string[]; // most recent first
  lfu: LfuEntry[];
  win: string[]; // most recent first
  prob: string[];
  prot: string[];
  sketch: number[][];
  added: number;
  resets: number;
  hits: [number, number, number];
}

export function initState(): SimState {
  return {
    t: 0, lru: [], lfu: [], win: [], prob: [], prot: [],
    sketch: Array.from({ length: SKETCH_ROWS }, () => Array(SKETCH_WIDTH).fill(0)),
    added: 0, resets: 0, hits: [0, 0, 0],
  };
}

const SEEDS = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];

/* FNV-1a with a per-row seed, then the murmur3 finaliser to spread short keys. */
export function slot(key: string, row: number): number {
  let h = (2166136261 ^ SEEDS[row]) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % SKETCH_WIDTH;
}

export function estimate(sketch: number[][], key: string): number {
  let m = Infinity;
  for (let r = 0; r < SKETCH_ROWS; r++) m = Math.min(m, sketch[r][slot(key, r)]);
  return m;
}

/* Bump all four counters (saturating at 15). Once SAMPLE_SIZE increments have
   landed, halve every counter: the ageing step. */
function increment(s: SimState, key: string): boolean {
  let changed = false;
  for (let r = 0; r < SKETCH_ROWS; r++) {
    const c = slot(key, r);
    if (s.sketch[r][c] < COUNTER_MAX) { s.sketch[r][c] += 1; changed = true; }
  }
  if (changed) s.added += 1;
  if (s.added >= SAMPLE_SIZE) {
    for (const row of s.sketch) for (let c = 0; c < row.length; c++) row[c] >>= 1;
    s.added = Math.floor(s.added / 2);
    s.resets += 1;
    return true;
  }
  return false;
}

function lruAccess(s: SimState, k: string): Outcome {
  const i = s.lru.indexOf(k);
  if (i >= 0) {
    s.lru.splice(i, 1);
    s.lru.unshift(k);
    return { hit: true, evicted: null, note: `${k} is cached: a hit. It moves to the front of the recency list.` };
  }
  s.lru.unshift(k);
  if (s.lru.length > CAPACITY) {
    const v = s.lru.pop()!;
    return { hit: false, evicted: v, note: `${k} misses. The cache is full, so ${v}, the least recently used key, is evicted.` };
  }
  return { hit: false, evicted: null, note: `${k} misses and takes an empty slot.` };
}

/* LFU counts only while a key is cached, and breaks ties by evicting the key
   used longest ago. A key that leaves loses its count. */
function lfuAccess(s: SimState, k: string): Outcome {
  const e = s.lfu.find((x) => x.key === k);
  if (e) {
    e.count += 1;
    e.last = s.t;
    return { hit: true, evicted: null, note: `${k} is cached: a hit. Its count goes up to ${e.count}.` };
  }
  let evicted: string | null = null;
  let note = `${k} misses and takes an empty slot with a count of 1.`;
  if (s.lfu.length >= CAPACITY) {
    let v = s.lfu[0];
    for (const x of s.lfu) if (x.count < v.count || (x.count === v.count && x.last < v.last)) v = x;
    const ties = s.lfu.filter((x) => x.count === v.count).length;
    s.lfu = s.lfu.filter((x) => x !== v);
    evicted = v.key;
    note = `${k} misses. ${v.key} has the lowest count (${v.count})${ties > 1 ? " and was used longest ago of those" : ""}, so it's evicted and ${k} enters with a count of 1.`;
  }
  s.lfu.push({ key: k, count: 1, last: s.t });
  return { hit: false, evicted, note };
}

function wAccess(s: SimState, k: string): WOutcome {
  const reset = increment(s, k);
  const aged = reset ? " The sketch just reached its sample size, so every counter was halved." : "";
  let i = s.win.indexOf(k);
  if (i >= 0) {
    s.win.splice(i, 1);
    s.win.unshift(k);
    return { hit: true, evicted: null, duel: null, reset, note: `${k} is in the window: a hit.${aged}` };
  }
  i = s.prot.indexOf(k);
  if (i >= 0) {
    s.prot.splice(i, 1);
    s.prot.unshift(k);
    return { hit: true, evicted: null, duel: null, reset, note: `${k} is in protected: a hit. It moves to the front of protected.${aged}` };
  }
  i = s.prob.indexOf(k);
  if (i >= 0) {
    s.prob.splice(i, 1);
    s.prot.unshift(k);
    let more = "";
    if (s.prot.length > PROTECTED_MAX) {
      const d = s.prot.pop()!;
      s.prob.unshift(d);
      more = ` Protected is over its ${PROTECTED_MAX} slots, so its oldest key, ${d}, drops back to probation.`;
    }
    return { hit: true, evicted: null, duel: null, reset, note: `${k} is in probation: a hit, so it's promoted to protected.${more}${aged}` };
  }

  s.win.unshift(k);
  if (s.win.length <= WINDOW_MAX) {
    return { hit: false, evicted: null, duel: null, reset, note: `${k} misses and enters the window.${aged}` };
  }
  const cand = s.win.pop()!;
  if (s.prob.length + s.prot.length < MAIN_MAX) {
    s.prob.unshift(cand);
    return { hit: false, evicted: null, duel: null, reset, note: `${k} misses and enters the window, pushing ${cand} out. The main region has room, so ${cand} moves into probation without a contest.${aged}` };
  }
  const fromProt = s.prob.length === 0;
  const victim = fromProt ? s.prot[s.prot.length - 1] : s.prob[s.prob.length - 1];
  const cf = estimate(s.sketch, cand);
  const vf = estimate(s.sketch, victim);
  const admitted = cf > vf;
  const duel: Duel = { candidate: cand, cf, victim, vf, admitted };
  const where = fromProt ? "the oldest key in protected (probation is empty)" : "the oldest key in probation";
  if (admitted) {
    if (fromProt) s.prot.pop(); else s.prob.pop();
    s.prob.unshift(cand);
    return { hit: false, evicted: victim, duel, reset, note: `${k} misses and enters the window, pushing out ${cand}, the candidate. The victim is ${victim}, ${where}. The sketch says ${cand} ≈ ${cf} and ${victim} ≈ ${vf}. ${cf} beats ${vf}, so ${cand} is admitted to probation and ${victim} is evicted.${aged}` };
  }
  return { hit: false, evicted: cand, duel, reset, note: `${k} misses and enters the window, pushing out ${cand}, the candidate. The victim is ${victim}, ${where}. The sketch says ${cand} ≈ ${cf} and ${victim} ≈ ${vf}. ${cf} isn't more than ${vf}, so ${cand} is rejected and the main region is unchanged.${aged}` };
}

function clone(s: SimState): SimState {
  return {
    ...s,
    lru: [...s.lru], lfu: s.lfu.map((e) => ({ ...e })), win: [...s.win], prob: [...s.prob], prot: [...s.prot],
    sketch: s.sketch.map((r) => [...r]), hits: [...s.hits] as [number, number, number],
  };
}

export interface StepResult { state: SimState; out: [Outcome, Outcome, WOutcome] }

export function step(prev: SimState, key: string): StepResult {
  const s = clone(prev);
  s.t += 1;
  const out: [Outcome, Outcome, WOutcome] = [lruAccess(s, key), lfuAccess(s, key), wAccess(s, key)];
  out.forEach((o, i) => { if (o.hit) s.hits[i] += 1; });
  return { state: s, out };
}

/* Every state along the trace, so stepping back is just an index. */
export function timeline(trace: string[]): { states: SimState[]; outs: StepResult["out"][] } {
  const states = [initState()];
  const outs: StepResult["out"][] = [];
  for (const k of trace) {
    const r = step(states[states.length - 1], k);
    states.push(r.state);
    outs.push(r.out);
  }
  return { states, outs };
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand: () => number, keys: string[], weights: number[]): string {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < keys.length; i++) { x -= weights[i]; if (x < 0) return keys[i]; }
  return keys[keys.length - 1];
}

const LETTERS = "ABCDEFGHIJKLMNOP".split("");

export function loopTrace(): string[] {
  const out: string[] = [];
  for (let r = 0; r < 10; r++) out.push(..."ABCDEFG".split(""));
  return out;
}

/* Key of rank r is requested with weight 1/(r+1), the same skew as the chapter's simulation. */
export function zipfTrace(): string[] {
  const rand = mulberry32(25);
  const w = LETTERS.map((_, r) => 1 / (r + 1));
  return Array.from({ length: 150 }, () => pick(rand, LETTERS, w));
}

export function scanTrace(): string[] {
  const rand = mulberry32(7);
  const hot = "ABCDE".split("");
  const w = hot.map(() => 1);
  const before = Array.from({ length: 40 }, () => pick(rand, hot, w));
  const scan = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);
  const after = Array.from({ length: 30 }, () => pick(rand, hot, w));
  return [...before, ...scan, ...after];
}

export function phaseTrace(): string[] {
  const rand = mulberry32(11);
  const a = "ABCDE".split("");
  const b = "VWXYZ".split("");
  const w = [1, 1, 1, 1, 1];
  return [
    ...Array.from({ length: 60 }, () => pick(rand, a, w)),
    ...Array.from({ length: 120 }, () => pick(rand, b, w)),
  ];
}

export const MAX_TRACE = 400;

/* Keys split on spaces or commas; "(A B C)*5" repeats a group. */
export function parseTrace(text: string): string[] {
  const expanded = text.replace(/\(([^()]*)\)\s*[*x×]\s*(\d+)/g, (_, body: string, n: string) =>
    Array(Math.min(Number(n), MAX_TRACE)).fill(body).join(" "));
  return expanded.split(/[\s,]+/).filter(Boolean).map((k) => k.slice(0, 8)).slice(0, MAX_TRACE);
}
// --- sim end

type PresetId = "loop" | "zipf" | "scan" | "phase" | "custom";

const PRESETS: { id: Exclude<PresetId, "custom">; label: string; blurb: string; make: () => string[] }[] = [
  { id: "loop", label: "Loop", blurb: "Seven keys read in order, ten times over. One more key than fits.", make: loopTrace },
  { id: "zipf", label: "Skewed", blurb: "150 requests over 16 keys. A is twice as popular as B, three times as popular as C, and so on.", make: zipfTrace },
  { id: "scan", label: "Scan", blurb: "Five hot keys, then a one-off scan of twelve keys, then the hot keys again.", make: scanTrace },
  { id: "phase", label: "Phase change", blurb: "A to E are hot for 60 requests, then V to Z take over for 120.", make: phaseTrace },
];

const POLICIES = [
  { name: "LRU", text: "text-os", border: "border-os/40", bg: "bg-os", soft: "bg-os/15", stroke: "stroke-os" },
  { name: "LFU", text: "text-conc", border: "border-conc/40", bg: "bg-conc", soft: "bg-conc/15", stroke: "stroke-conc" },
  { name: "W-TinyLFU", text: "text-dist", border: "border-dist/40", bg: "bg-dist", soft: "bg-dist/15", stroke: "stroke-dist" },
] as const;

const pct = (h: number, n: number) => (n === 0 ? "–" : `${((100 * h) / n).toFixed(0)}%`);

function Slot({ k, sub, hot, faint }: { k?: string; sub?: string; hot?: boolean; faint?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-7 min-w-0 items-center justify-between gap-1 rounded border px-2 font-[family-name:var(--font-jetbrains)] text-[12.5px]",
        k ? "border-line-2 bg-bg" : "border-dashed border-line text-faint",
        hot && "border-accent bg-accent/10 text-ink",
        faint && "opacity-60",
      )}
    >
      <span className="truncate">{k ?? "·"}</span>
      {sub !== undefined && <span className="tnum shrink-0 text-[11px] text-faint">{sub}</span>}
    </div>
  );
}

function Evicted({ k }: { k: string | null }) {
  return (
    <div className="mt-2 h-5 text-[12px] text-faint">
      {k && <>evicted <span className="font-[family-name:var(--font-jetbrains)] text-machine line-through">{k}</span></>}
    </div>
  );
}

function Chart({ outs, pos }: { outs: StepResult["out"][]; pos: number }) {
  const n = outs.length;
  if (n === 0) return null;
  const W = 600, H = 110, padL = 30, padB = 16;
  const lines: string[] = [[], [], []].map((_, p) => {
    let h = 0;
    const pts: string[] = [];
    for (let i = 0; i < pos; i++) {
      if (outs[i][p].hit) h += 1;
      const x = padL + ((i + 1) / n) * (W - padL - 4);
      const y = 4 + (1 - h / (i + 1)) * (H - padB - 4);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Running hit rate of each policy">
      {[0, 0.5, 1].map((f) => {
        const y = 4 + (1 - f) * (H - padB - 4);
        return (
          <g key={f}>
            <line x1={padL} x2={W - 4} y1={y} y2={y} className="stroke-line" strokeWidth={1} />
            <text x={padL - 4} y={y + 3} textAnchor="end" className="fill-faint text-[10px]">{f * 100}%</text>
          </g>
        );
      })}
      <text x={W - 4} y={H - 3} textAnchor="end" className="fill-faint text-[10px]">request {n}</text>
      <text x={padL} y={H - 3} className="fill-faint text-[10px]">1</text>
      {lines.map((pts, p) => pts && (
        <polyline key={p} points={pts} fill="none" className={POLICIES[p].stroke} strokeWidth={p === 2 ? 2.2 : 1.8} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function CacheLab() {
  const [preset, setPreset] = useState<PresetId>("loop");
  const [custom, setCustom] = useState("(A B C D E F G)*3 A B A B C");
  const [draft, setDraft] = useState(custom);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);

  const trace = useMemo(
    () => (preset === "custom" ? parseTrace(custom) : PRESETS.find((p) => p.id === preset)!.make()),
    [preset, custom],
  );
  const { states, outs } = useMemo(() => timeline(trace), [trace]);
  const s = states[pos];
  const last = pos > 0 ? outs[pos - 1] : null;
  const done = pos >= trace.length;

  useEffect(() => {
    if (!playing) return;
    if (done) { setPlaying(false); return; }
    const id = setTimeout(() => setPos((p) => Math.min(p + 1, trace.length)), 280);
    return () => clearTimeout(id);
  }, [playing, pos, done, trace.length]);

  const choose = (p: PresetId) => { setPreset(p); setPos(0); setPlaying(false); };
  const curKey = pos > 0 ? trace[pos - 1] : null;
  const slotsOfKey = curKey ? Array.from({ length: SKETCH_ROWS }, (_, r) => slot(curKey, r)) : null;
  const blurb = preset === "custom" ? "Your trace. Keys split on spaces or commas, and (A B C)*5 repeats a group." : PRESETS.find((p) => p.id === preset)!.blurb;

  const btn = "rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · three caches, one trace</div>
          <div className="text-[14px] text-muted">Six slots each. Every step sends the next request to all three.</div>
        </div>
        <div className="flex flex-wrap rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Trace">
          {[...PRESETS.map((p) => ({ id: p.id as PresetId, label: p.label })), { id: "custom" as PresetId, label: "Custom" }].map((p) => (
            <button
              key={p.id}
              onClick={() => choose(p.id)}
              aria-pressed={preset === p.id}
              className={cn("rounded-md px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent", preset === p.id ? "bg-ink text-bg" : "text-muted hover:text-ink")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-5 pt-4">
        <div className="text-[13.5px] text-muted">{blurb}</div>
        {preset === "custom" && (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => { e.preventDefault(); setCustom(draft); setPos(0); setPlaying(false); }}
          >
            <label className="sr-only" htmlFor="cache-lab-trace">Custom trace</label>
            <textarea
              id="cache-lab-trace"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="min-w-0 flex-1 rounded-lg border border-line-2 bg-bg px-3 py-2 font-[family-name:var(--font-jetbrains)] text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
            />
            <button type="submit" className={btn}>Load trace</button>
          </form>
        )}
        <div className="max-h-[7.5rem] overflow-y-auto rounded-lg border border-line bg-bg/60 p-2" aria-label="Access trace">
          <div className="flex flex-wrap gap-1">
            {trace.map((k, i) => {
              const o = i < pos ? outs[i] : null;
              return (
                <button
                  key={i}
                  onClick={() => { setPos(i + 1); setPlaying(false); }}
                  title={`Jump to request ${i + 1}`}
                  aria-label={`Request ${i + 1}: ${k}`}
                  className={cn(
                    "flex flex-col items-center rounded px-1 pt-0.5 font-[family-name:var(--font-jetbrains)] text-[11.5px] leading-tight focus-visible:outline-2 focus-visible:outline-accent",
                    i === pos - 1 ? "bg-accent/15 text-ink ring-1 ring-accent" : i === pos ? "text-ink" : o ? "text-muted" : "text-faint",
                  )}
                >
                  {k}
                  <span className="mt-0.5 mb-0.5 flex gap-px">
                    {POLICIES.map((p, j) => (
                      <span key={p.name} className={cn("h-1 w-1.5 rounded-[1px]", o ? (o[j].hit ? p.bg : "bg-line-2") : "bg-transparent")} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="text-[12px] text-faint">Under each request, three marks: a coloured one is a hit for LRU, LFU or W-TinyLFU, in that order. Click any request to jump there.</div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-3">
        {POLICIES.map((p, j) => {
          const o = last ? last[j] : null;
          return (
            <div key={p.name} className={cn("min-w-0 rounded-lg border p-3", p.border)}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className={cn("text-[14px] font-semibold", p.text)}>{p.name}</span>
                <span className="tnum text-[12px] text-faint">{s.hits[j]}/{pos} hits</span>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <span className="tnum font-[family-name:var(--font-serif)] text-[34px] font-semibold leading-none text-ink">{pct(s.hits[j], pos)}</span>
                {o && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", o.hit ? "bg-data/15 text-data" : "bg-machine/15 text-machine")}>
                    {o.hit ? "HIT" : "MISS"}
                  </span>
                )}
              </div>

              {j === 0 && (
                <>
                  <div className="mb-1 text-[11px] text-faint">most recently used at the top</div>
                  <div className="grid gap-1">
                    {Array.from({ length: CAPACITY }, (_, i) => <Slot key={i} k={s.lru[i]} hot={s.lru[i] === curKey} />)}
                  </div>
                  <div className="mt-1 text-[11px] text-faint">bottom slot is evicted next</div>
                </>
              )}

              {j === 1 && (() => {
                const sorted = [...s.lfu].sort((a, b) => b.count - a.count || b.last - a.last);
                return (
                  <>
                    <div className="mb-1 flex justify-between text-[11px] text-faint"><span>highest count</span><span>count</span></div>
                    <div className="grid gap-1">
                      {Array.from({ length: CAPACITY }, (_, i) => (
                        <Slot key={i} k={sorted[i]?.key} sub={sorted[i] ? String(sorted[i].count) : undefined} hot={sorted[i]?.key === curKey} />
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-faint">bottom slot is evicted next</div>
                  </>
                );
              })()}

              {j === 2 && (
                <>
                  <div className="mb-1 text-[11px] text-faint">window · LRU · {WINDOW_MAX} slot</div>
                  <div className="grid gap-1">
                    {Array.from({ length: WINDOW_MAX }, (_, i) => (
                      <Slot key={i} k={s.win[i]} sub={s.win[i] ? `≈${estimate(s.sketch, s.win[i])}` : undefined} hot={s.win[i] === curKey} />
                    ))}
                  </div>
                  <div className="mt-2 mb-1 text-[11px] text-faint">main · protected (up to {PROTECTED_MAX})</div>
                  <div className="grid gap-1">
                    {s.prot.length === 0 && <Slot />}
                    {s.prot.map((k) => <Slot key={k} k={k} sub={`≈${estimate(s.sketch, k)}`} hot={k === curKey} />)}
                  </div>
                  <div className="mt-2 mb-1 text-[11px] text-faint">main · probation (bottom is the victim)</div>
                  <div className="grid gap-1">
                    {Array.from({ length: Math.max(1, MAIN_MAX - s.prot.length) }, (_, i) => (
                      <Slot key={i} k={s.prob[i]} sub={s.prob[i] ? `≈${estimate(s.sketch, s.prob[i])}` : undefined} hot={s.prob[i] === curKey} />
                    ))}
                  </div>
                  {last && last[2].duel && (
                    <div className="mt-2 rounded border border-line bg-bg/60 px-2 py-1.5 font-[family-name:var(--font-jetbrains)] text-[11.5px] text-muted">
                      gate: <span className={last[2].duel.admitted ? "text-data" : "text-machine"}>{last[2].duel.candidate} ≈{last[2].duel.cf}</span>
                      {" vs "}
                      <span className={last[2].duel.admitted ? "text-machine" : "text-data"}>{last[2].duel.victim} ≈{last[2].duel.vf}</span>
                      {" → "}{last[2].duel.admitted ? "admit" : "reject"}
                    </div>
                  )}
                </>
              )}

              <Evicted k={o ? o.evicted : null} />
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 px-5 pb-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 rounded-lg border border-dist/40 p-3">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-dist">Count-min sketch</span>
            <span className="tnum text-[11.5px] text-faint">halves in {SAMPLE_SIZE - s.added} · halved {s.resets}×</span>
          </div>
          <div className="text-[11.5px] text-faint">4 rows × {SKETCH_WIDTH} counters, 0 to {COUNTER_MAX}. {curKey ? <>The outlined cells are <span className="font-[family-name:var(--font-jetbrains)] text-ink">{curKey}</span>&apos;s; its estimate is the smallest, {estimate(s.sketch, curKey)}.</> : "Every request bumps one counter per row."}</div>
          <div className="mt-2 grid gap-px" style={{ gridTemplateColumns: `repeat(${SKETCH_WIDTH}, minmax(0, 1fr))` }}>
            {s.sketch.flatMap((row, r) => row.map((v, c) => (
              <div
                key={`${r}-${c}`}
                className={cn(
                  "tnum flex aspect-square items-center justify-center rounded-[2px] font-[family-name:var(--font-jetbrains)] text-[10px]",
                  v === 0 ? "bg-surface-2 text-faint" : v < 4 ? "bg-dist/15 text-ink" : v < 8 ? "bg-dist/30 text-ink" : "bg-dist/50 text-ink",
                  slotsOfKey && slotsOfKey[r] === c && "ring-1 ring-accent",
                )}
              >
                {v}
              </div>
            )))}
          </div>
        </div>
        <div className="min-w-0 rounded-lg border border-line p-3">
          <div className="mb-1 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="font-semibold text-muted">Running hit rate</span>
            {POLICIES.map((p) => (
              <span key={p.name} className={cn("flex items-center gap-1", p.text)}>
                <span className={cn("inline-block h-0.5 w-3", p.bg)} />{p.name}
              </span>
            ))}
          </div>
          {pos === 0 ? <div className="py-8 text-center text-[13px] text-faint">Step to start the chart.</div> : <Chart outs={outs} pos={pos} />}
        </div>
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="min-h-[4.5em] space-y-1 text-[14px] leading-relaxed text-ink" aria-live="polite">
          {!last ? (
            <div>Press Step to send request 1, <span className="font-[family-name:var(--font-jetbrains)]">{trace[0] ?? "–"}</span>, to all three caches, or Run whole trace to see where the hit rates end up.</div>
          ) : (
            <>
              <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Request {pos} of {trace.length}: {curKey}</div>
              {POLICIES.map((p, j) => (
                <div key={p.name}><span className={cn("font-semibold", p.text)}>{p.name}.</span> {last[j].note}</div>
              ))}
            </>
          )}
          {done && trace.length > 0 && (
            <div className="pt-1 text-[13.5px] font-medium text-muted">
              End of trace. LRU {pct(s.hits[0], pos)}, LFU {pct(s.hits[1], pos)}, W-TinyLFU {pct(s.hits[2], pos)}.
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button onClick={() => { setPos((p) => Math.max(0, p - 1)); setPlaying(false); }} disabled={pos === 0} className={btn}>Back</button>
          <button
            onClick={() => setPos((p) => Math.min(p + 1, trace.length))}
            disabled={done}
            className="rounded-lg bg-accent px-4 py-1.5 text-[13.5px] font-medium text-bg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Step
          </button>
          <button onClick={() => setPlaying((x) => !x)} disabled={done} className={btn}>{playing ? "Pause" : "Play"}</button>
          <button onClick={() => { setPos(trace.length); setPlaying(false); }} disabled={done} className={btn}>Run whole trace</button>
          <button onClick={() => { setPos(0); setPlaying(false); }} className="ml-auto text-[13px] text-faint underline decoration-line-2 underline-offset-2 hover:text-ink">Reset</button>
        </div>
      </div>
    </div>
  );
}

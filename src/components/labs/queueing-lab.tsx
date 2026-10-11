"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

/* One queue in front of one server (or four), driven by a seeded
   discrete-event simulation. Each click processes one event, an arrival or a
   completion, so you can watch a queue form by hand. The plot puts the
   simulated mean and p99 next to the formulas from chapters 16 and 42, and
   the toggles change the one thing those formulas say matters: how variable
   the work is, how many servers share the line, and whether the line has an
   end. Times are in milliseconds and the mean service time S is 1 ms, so a
   latency in ms is also a latency in service times. */

/* --- sim --- */

export type Dist = "const" | "exp" | "mix";

export interface Config {
  rho: number;          // utilisation of each server, 0..1
  dist: Dist;           // service-time distribution, mean 1 ms in every case
  servers: 1 | 4;       // servers sharing the one queue
  cap: number | null;   // waiting slots; null means the queue never fills
  seed: number;
}

/** Squared coefficient of variation of the service time: variance / mean². */
export const CS2: Record<Dist, number> = { const: 0, exp: 1, mix: 9 };

export interface Job { id: number; arrive: number; service: number; start: number }
export interface Done { id: number; arrive: number; start: number; service: number; end: number; server: number }

export interface Sim {
  cfg: Config;
  t: number;              // clock, ms
  rng: number;            // PRNG state
  nextId: number;
  nextArrival: number;    // time of the next arrival
  queue: Job[];           // waiting, oldest first
  busy: (Job | null)[];   // one slot per server
  arrived: number;
  dropped: number;
  completed: number;
  sumLat: number;
  busyTime: number;       // server-milliseconds of work done so far
  recent: Done[];         // newest first, at most 5
  msg: string;
}

/** mulberry32: returns a uniform in [0, 1) and the next state. */
export function rand(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/* The variable mix: one job in ten is long. Short jobs average 1/3 ms and
   long ones 7 ms, so the mean is 0.9 × 1/3 + 0.1 × 7 = 1 ms and
   E[X²] = 2(0.9/9 + 0.1 × 49) = 10, which makes Cs² = 10 − 1 = 9. */
export const LONG_P = 0.1, LONG_MEAN = 7, SHORT_MEAN = 1 / 3;

function draw(s: Sim): number {
  const [u, r] = rand(s.rng);
  s.rng = r;
  return u;
}

function expo(s: Sim, mean: number): number {
  return -mean * Math.log(1 - draw(s));
}

function serviceTime(s: Sim): number {
  const d = s.cfg.dist;
  if (d === "const") return 1;
  if (d === "exp") return expo(s, 1);
  return expo(s, draw(s) < LONG_P ? LONG_MEAN : SHORT_MEAN);
}

/** Arrivals per ms: c servers each busy ρ of the time with 1 ms jobs. */
export const arrivalRate = (cfg: Config) => cfg.servers * cfg.rho; // S = 1 ms

export function fresh(cfg: Config): Sim {
  const s: Sim = {
    cfg, t: 0, rng: cfg.seed >>> 0, nextId: 1, nextArrival: 0, queue: [],
    busy: Array.from({ length: cfg.servers }, () => null),
    arrived: 0, dropped: 0, completed: 0, sumLat: 0, busyTime: 0, recent: [], msg: "",
  };
  s.nextArrival = expo(s, 1 / arrivalRate(cfg));
  return s;
}

const ms = (x: number) => (x > 0 && x < 0.005 ? "under 0.01 ms" : `${x.toFixed(2)} ms`);

/** Process the next event in place. Completions win ties, so a server frees
    before a job arriving at the same instant looks for one. */
export function advance(s: Sim, quiet = false, onDone?: (d: Done) => void): void {
  let k = -1, tEnd = Infinity;
  s.busy.forEach((j, i) => { if (j && j.start + j.service < tEnd) { tEnd = j.start + j.service; k = i; } });
  const tNext = Math.min(tEnd, s.nextArrival);
  s.busyTime += (tNext - s.t) * s.busy.filter(Boolean).length;
  s.t = tNext;
  const many = s.cfg.servers > 1;
  const srv = (i: number) => (many ? `server ${i + 1}` : "the server");

  if (tEnd <= s.nextArrival) {
    const j = s.busy[k]!;
    const d: Done = { id: j.id, arrive: j.arrive, start: j.start, service: j.service, end: s.t, server: k };
    s.completed += 1;
    s.sumLat += d.end - d.arrive;
    onDone?.(d);
    const next = s.queue.shift();
    s.busy[k] = next ? { ...next, start: s.t } : null;
    if (!quiet) {
      s.recent = [d, ...s.recent].slice(0, 5);
      const wait = d.start - d.arrive;
      s.msg =
        `t = ${ms(s.t)}. Job #${d.id} finishes on ${srv(k)}. It waited ${ms(wait)} and was served for ${ms(d.service)}, ` +
        `so its latency is ${ms(d.end - d.arrive)}` +
        (wait > d.service ? `, and most of that was waiting. ` : `. `) +
        (next
          ? `Job #${next.id} leaves the queue and starts, after waiting ${ms(s.t - next.arrive)}.`
          : `The queue is empty, so ${srv(k)} goes idle until the next arrival.`);
    }
    return;
  }

  const job: Job = { id: s.nextId++, arrive: s.t, service: serviceTime(s), start: s.t };
  s.arrived += 1;
  s.nextArrival = s.t + expo(s, 1 / arrivalRate(s.cfg));
  const free = s.busy.findIndex((b) => b === null);
  if (free >= 0) {
    s.busy[free] = job;
    if (!quiet) s.msg = `t = ${ms(s.t)}. Job #${job.id} arrives needing ${ms(job.service)} of work. ${many ? `Server ${free + 1} is` : "The server is"} free, so it starts at once and waits nothing.`;
  } else if (s.cfg.cap !== null && s.queue.length >= s.cfg.cap) {
    s.dropped += 1;
    if (!quiet) s.msg = `t = ${ms(s.t)}. Job #${job.id} arrives and all ${s.cfg.cap} waiting slots are full, so it's turned away. That's ${s.dropped} dropped out of ${s.arrived} arrivals.`;
  } else {
    s.queue.push(job);
    if (!quiet) s.msg = `t = ${ms(s.t)}. Job #${job.id} arrives needing ${ms(job.service)} of work. ${many ? "Every server is" : "The server is"} busy, so it joins the queue at position ${s.queue.length}.`;
  }
}

/** One event, as a pure function for the UI. */
export function step(s: Sim): Sim {
  const n: Sim = { ...s, queue: [...s.queue], busy: [...s.busy], recent: [...s.recent] };
  advance(n);
  return n;
}

export interface RunResult { rho: number; mean: number; p99: number; dropFrac: number; util: number; jobs: number }

/** Run many jobs quietly. The first `warm` completions are thrown away so the
    empty starting queue doesn't flatter the result. Seeded per point, so the
    same seed and settings always give the same numbers. */
export function runMany(cfg: Config, jobs = 100_000, warm = 10_000): RunResult {
  const seed = (cfg.seed * 1_000_003 + Math.round(cfg.rho * 1000) * 7919) >>> 0;
  const s = fresh({ ...cfg, seed });
  const lat = new Float64Array(jobs);
  let n = 0, seen = 0;
  while (n < jobs) {
    advance(s, true, (d) => { seen += 1; if (seen > warm && n < jobs) lat[n++] = d.end - d.arrive; });
  }
  lat.sort();
  let sum = 0;
  for (let i = 0; i < jobs; i++) sum += lat[i];
  return {
    rho: cfg.rho, mean: sum / jobs, p99: lat[Math.floor(0.99 * jobs)],
    dropFrac: s.arrived ? s.dropped / s.arrived : 0,
    util: s.busyTime / (s.t * cfg.servers), jobs,
  };
}

/** Erlang C: probability an arrival waits, c servers each busy ρ. */
export function erlangC(c: number, rho: number): number {
  const a = c * rho;
  let term = 1, sum = 1;            // k = 0
  for (let k = 1; k < c; k++) { term *= a / k; sum += term; }
  const top = (term * a) / c / (1 - rho); // a^c / c! · 1/(1 − ρ)
  return top / (sum + top);
}

/** Mean time in system in service times. Exact for M/M/c (Erlang C) and for
    one server with any service distribution (Pollaczek–Khinchine). For c > 1
    with non-exponential service it's the usual approximation that scales the
    M/M/c wait by (1 + Cs²)/2. Ignores drops. */
export function theoryMean(cfg: Pick<Config, "rho" | "dist" | "servers">): number {
  const wqMMc = erlangC(cfg.servers, cfg.rho) / (cfg.servers * (1 - cfg.rho));
  return 1 + wqMMc * (1 + CS2[cfg.dist]) / 2;
}

/** p99 of time in system for M/M/1, where it's exponential with mean 1/(1 − ρ). */
export function theoryP99(cfg: Pick<Config, "rho" | "dist" | "servers">): number | null {
  return cfg.servers === 1 && cfg.dist === "exp" ? Math.log(100) / (1 - cfg.rho) : null;
}

export const isExact = (cfg: Pick<Config, "dist" | "servers">) => cfg.servers === 1 || cfg.dist === "exp";

/* --- ui --- */

const DIST_LABEL: Record<Dist, string> = { const: "Constant", exp: "Exponential", mix: "High-variance" };
const SWEEP = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95];
const CAP = 8;
/* Seed 9 at ρ = 0.7 has a burst early on: five jobs are waiting by t = 7 ms. */
const START: Config = { rho: 0.7, dist: "exp", servers: 1, cap: null, seed: 9 };
type Metric = "mean" | "p99";
type Shape = Pick<Config, "dist" | "servers" | "cap">;

const shapeKey = (c: Shape & { seed: number }) => `${c.dist}|${c.servers}|${c.cap ?? "inf"}|${c.seed}`;
const shapeLabel = (c: Shape) =>
  `${DIST_LABEL[c.dist].toLowerCase()}, ${c.servers === 1 ? "1 server" : "4 servers"}${c.cap !== null ? `, ${c.cap} slots` : ""}`;

const btn = "rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40";

function Toggle<T extends string | number>({
  label, value, options, onPick,
}: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-faint">{label}</span>
      <div role="group" aria-label={label} className="flex w-fit flex-wrap rounded-lg border border-line-2 p-0.5 text-[13px]">
        {options.map(([v, l]) => (
          <button
            key={String(v)}
            aria-pressed={value === v}
            onClick={() => onPick(v)}
            className={cn(
              "rounded-md px-2.5 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              value === v ? "bg-ink text-bg" : "text-muted hover:text-ink",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ id, sub, tone }: { id: number; sub?: string; tone: "q" | "s" | "d" }) {
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center rounded-md border px-1.5 py-0.5 font-[family-name:var(--font-jetbrains)] text-[12px] leading-tight",
        tone === "q" && "border-conc/50 bg-conc/10 text-ink",
        tone === "s" && "border-os/60 bg-os/15 text-ink",
        tone === "d" && "border-data/50 bg-data/10 text-ink",
      )}
    >
      #{id}
      {sub && <span className="text-[10.5px] text-muted">{sub}</span>}
    </span>
  );
}

function LatencyPlot({
  cfg, metric, points, ghost,
}: { cfg: Config; metric: Metric; points: RunResult[]; ghost: Shape | null }) {
  const clip = useId();
  const W = 520, H = 290, L = 46, R = 12, T = 14, B = 42;
  const pw = W - L - R, ph = H - T - B;
  const ymax = metric === "mean" ? 25 : 100;
  const px = (x: number) => L + x * pw;
  const py = (y: number) => T + ph - (Math.min(y, ymax * 1.2) / ymax) * ph;
  const curve = (f: (r: number) => number | null) => {
    const pts: string[] = [];
    for (let r = 0.005; r < 0.9951; r += 0.005) {
      const y = f(r);
      if (y !== null) pts.push(`${px(r).toFixed(1)},${py(y).toFixed(1)}`);
    }
    return pts.length ? `M${pts.join("L")}` : null;
  };
  const th = (shape: Shape) => (r: number) =>
    metric === "mean" ? theoryMean({ ...shape, rho: r }) : theoryP99({ ...shape, rho: r });
  const main = curve(th(cfg));
  const ghostPath = ghost ? curve(th(ghost)) : null;
  const yTicks = Array.from({ length: 6 }, (_, i) => (ymax * i) / 5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`Latency against utilisation: ${metric} latency, theory curve and ${points.length} simulated points`}>
      <defs>
        <clipPath id={clip}><rect x={L} y={T} width={pw} height={ph} /></clipPath>
      </defs>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={L + pw} y1={py(v)} y2={py(v)} stroke="var(--line)" />
          <text x={L - 8} y={py(v) + 4} textAnchor="end" fill="var(--faint)" fontSize="13">{v}</text>
        </g>
      ))}
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
        <text key={v} x={px(v)} y={T + ph + 18} textAnchor="middle" fill="var(--faint)" fontSize="13">{v}</text>
      ))}
      <line x1={L} x2={L + pw} y1={T + ph} y2={T + ph} stroke="var(--line-2)" />
      <line x1={L} x2={L} y1={T} y2={T + ph} stroke="var(--line-2)" />
      <text x={L + pw / 2} y={H - 4} textAnchor="middle" fill="var(--muted)" fontSize="13.5">utilisation ρ</text>
      <text x={13} y={T + ph / 2} textAnchor="middle" fill="var(--muted)" fontSize="13.5" transform={`rotate(-90 13 ${T + ph / 2})`}>
        {metric} latency, ms
      </text>

      <line x1={px(cfg.rho)} x2={px(cfg.rho)} y1={T} y2={T + ph} stroke="var(--c-machine)" strokeDasharray="4 4" strokeWidth="1.2" />
      <g clipPath={`url(#${clip})`}>
        {ghostPath && <path d={ghostPath} fill="none" stroke="var(--faint)" strokeWidth="1.6" strokeDasharray="6 5" />}
        {main && <path d={main} fill="none" stroke="var(--accent)" strokeWidth="2.2" />}
      </g>
      {points.map((p) => {
        const v = metric === "mean" ? p.mean : p.p99;
        const x = px(p.rho);
        if (v > ymax) {
          return (
            <g key={p.rho}>
              <path d={`M${x - 6},${T + 9} L${x + 6},${T + 9} L${x},${T} Z`} fill="var(--c-os)" />
              <text x={x} y={T + 22} textAnchor="middle" fill="var(--c-os)" fontSize="11">{Math.round(v)}</text>
            </g>
          );
        }
        return <circle key={p.rho} cx={x} cy={py(v)} r="5" fill="var(--c-os)" stroke="var(--surface)" strokeWidth="1.5" />;
      })}
    </svg>
  );
}

export function QueueingLab() {
  const [cfg, setCfg] = useState<Config>(START);
  const [sim, setSim] = useState<Sim>(() => fresh(START));
  const [playing, setPlaying] = useState(false);
  const [metric, setMetric] = useState<Metric>("mean");
  const [points, setPoints] = useState<Record<string, RunResult[]>>({});
  const [ghost, setGhost] = useState<Shape | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSim((s) => step(s)), 650);
    return () => clearInterval(id);
  }, [playing]);

  const change = (patch: Partial<Config>) => {
    const next = { ...cfg, ...patch };
    const shapeChanged = next.dist !== cfg.dist || next.servers !== cfg.servers || next.cap !== cfg.cap;
    if (shapeChanged) setGhost({ dist: cfg.dist, servers: cfg.servers, cap: cfg.cap });
    setCfg(next);
    setSim(fresh(next));
    setPlaying(false);
    setNote(null);
  };

  const key = shapeKey(cfg);
  const pts = points[key] ?? [];
  const addPoints = (rs: RunResult[]) =>
    setPoints((p) => {
      const keep = (p[key] ?? []).filter((x) => !rs.some((r) => r.rho === x.rho));
      return { ...p, [key]: [...keep, ...rs].sort((a, b) => a.rho - b.rho) };
    });

  const runHere = () => {
    const r = runMany(cfg);
    addPoints([r]);
    const tm = theoryMean(cfg);
    setNote(
      `${r.jobs.toLocaleString("en-US")} jobs at ρ = ${cfg.rho.toFixed(2)}: mean latency ${r.mean.toFixed(1)} ms, p99 ${r.p99.toFixed(1)} ms. ` +
      `The ${isExact(cfg) ? "formula" : "approximation"} predicts a mean of ${tm.toFixed(1)} ms` +
      (cfg.cap !== null ? ` with no limit on the queue, and ${(r.dropFrac * 100).toFixed(1)}% of arrivals were dropped.` : ".") +
      ` The servers were busy ${(r.util * 100).toFixed(0)}% of the time.`,
    );
  };

  const sweep = () => {
    const rs = SWEEP.map((rho) => runMany({ ...cfg, rho }));
    addPoints(rs);
    const hi = rs[rs.length - 1];
    setNote(
      `Ran ${SWEEP.length} loads, ${rs[0].jobs.toLocaleString("en-US")} jobs each. From ρ = 0.1 to 0.5 the mean goes from ${rs[0].mean.toFixed(1)} to ${rs[4].mean.toFixed(1)} ms; ` +
      `from 0.8 to 0.95, a much shorter stretch, it goes from ${rs[7].mean.toFixed(1)} to ${hi.mean.toFixed(1)} ms.` +
      (cfg.cap !== null ? ` At 0.95, ${(hi.dropFrac * 100).toFixed(1)}% of arrivals were dropped.` : ""),
    );
  };

  const tMean = theoryMean(cfg);
  const tP99 = theoryP99(cfg);
  const meanSoFar = sim.completed ? sim.sumLat / sim.completed : null;
  const utilSoFar = sim.t > 0 ? sim.busyTime / (sim.t * cfg.servers) : null;
  const shownQ = sim.queue.slice(0, 12);

  const formula = cfg.servers === 1
    ? cfg.dist === "exp"
      ? `M/M/1: W = S / (1 − ρ) = ${tMean.toFixed(2)} ms`
      : `Pollaczek–Khinchine: W = S + ρS(1 + Cs²) / (2(1 − ρ)) = ${tMean.toFixed(2)} ms, with Cs² = ${CS2[cfg.dist]}`
    : cfg.dist === "exp"
      ? `M/M/4 (Erlang C): ${(erlangC(4, cfg.rho) * 100).toFixed(0)}% of arrivals wait; W = ${tMean.toFixed(2)} ms`
      : `M/M/4 wait × (1 + Cs²)/2, an approximation: W ≈ ${tMean.toFixed(2)} ms`;

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · one line, one server</div>
          <div className="text-[14px] text-muted">Every job needs 1 ms of work on average. Set how busy the server is, then step through arrivals and completions.</div>
        </div>
      </div>

      <div className="grid gap-4 border-b border-line px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between text-[11.5px] font-semibold uppercase tracking-[0.07em] text-faint">
            Utilisation ρ (each server)
            <span className="tnum font-[family-name:var(--font-jetbrains)] text-[15px] font-semibold normal-case tracking-normal text-ink">{cfg.rho.toFixed(2)}</span>
          </span>
          <input
            type="range" min={0.1} max={0.99} step={0.01} value={cfg.rho}
            onChange={(e) => change({ rho: Number(e.target.value) })}
            aria-label="Utilisation"
            className="w-full accent-[var(--accent)]"
          />
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          <Toggle label="Service time" value={cfg.dist}
            options={[["const", "Constant"], ["exp", "Exponential"], ["mix", "High-variance"]]}
            onPick={(dist) => change({ dist })} />
          <Toggle label="Servers" value={cfg.servers}
            options={[[1, "1"], [4, "4, one shared queue"]]}
            onPick={(servers) => change({ servers })} />
          <Toggle label="Queue" value={cfg.cap === null ? "inf" : "cap"}
            options={[["inf", "Unbounded"], ["cap", `${CAP} slots, then drop`]]}
            onPick={(v) => change({ cap: v === "cap" ? CAP : null })} />
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-faint">Seed</span>
            <button onClick={() => change({ seed: cfg.seed + 1 })} className={cn(btn, "w-fit py-1.5 font-[family-name:var(--font-jetbrains)]")}
              aria-label={`Seed ${cfg.seed}, press for the next seed`}>
              {cfg.seed} ▸
            </button>
          </div>
        </div>
      </div>

      {/* the queue itself */}
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-[auto_1fr_auto]">
        <div className="rounded-lg border border-line p-3">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-faint">Next arrival</div>
          <div className="tnum mt-1 font-[family-name:var(--font-jetbrains)] text-[13px] text-ink">#{sim.nextId} at {ms(sim.nextArrival)}</div>
          <div className="tnum mt-0.5 text-[12px] text-faint">clock {ms(sim.t)}</div>
        </div>
        <div className="min-w-0 rounded-lg border border-conc/40 p-3">
          <div className="flex items-baseline justify-between text-[11.5px] font-semibold uppercase tracking-[0.07em] text-faint">
            <span>Queue</span>
            <span className="tnum normal-case tracking-normal">{sim.queue.length}{cfg.cap !== null ? ` of ${cfg.cap}` : ""} waiting</span>
          </div>
          <div className="mt-2 flex min-h-[34px] flex-wrap items-center gap-1.5">
            {sim.queue.length === 0 && <span className="text-[13px] text-faint">empty</span>}
            {shownQ.map((j) => <Chip key={j.id} id={j.id} tone="q" sub={`${j.service.toFixed(2)}`} />)}
            {sim.queue.length > shownQ.length && <span className="text-[12.5px] text-muted">+{sim.queue.length - shownQ.length} more</span>}
            {cfg.cap !== null && Array.from({ length: Math.max(0, cfg.cap - sim.queue.length) }, (_, i) => (
              <span key={`e${i}`} className="h-[34px] w-[30px] rounded-md border border-dashed border-line-2" aria-hidden />
            ))}
          </div>
          <div className="mt-1.5 text-[11.5px] text-faint">oldest first · number under each job is its work in ms</div>
        </div>
        <div className="rounded-lg border border-os/40 p-3 sm:min-w-[170px]">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-faint">{cfg.servers === 1 ? "Server" : "Servers"}</div>
          <div className="mt-2 grid gap-1.5">
            {sim.busy.map((j, i) => {
              const frac = j ? Math.min(1, (sim.t - j.start) / j.service) : 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  {cfg.servers > 1 && <span className="w-3 text-[11.5px] text-faint">{i + 1}</span>}
                  {j ? <Chip id={j.id} tone="s" /> : <span className="text-[12.5px] text-faint">idle</span>}
                  {j && (
                    <div className="flex-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full bg-os" style={{ width: `${frac * 100}%` }} />
                      </div>
                      <div className="tnum mt-0.5 text-[11px] text-faint">done at {ms(j.start + j.service)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-5 pb-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0 overflow-x-auto">
          <table className="tnum w-full text-left font-[family-name:var(--font-jetbrains)] text-[12.5px]">
            <caption className="mb-1 text-left font-[family-name:var(--font-inter)] text-[11.5px] font-semibold uppercase tracking-[0.07em] text-faint">Last finished, newest first</caption>
            <thead className="text-faint">
              <tr><th className="pr-3 font-normal">job</th><th className="pr-3 font-normal">arrived</th><th className="pr-3 font-normal">waited</th><th className="pr-3 font-normal">served</th><th className="font-normal">latency</th></tr>
            </thead>
            <tbody className="text-ink">
              {sim.recent.length === 0 && <tr><td colSpan={5} className="py-1 font-[family-name:var(--font-inter)] text-faint">nothing yet</td></tr>}
              {sim.recent.map((d) => (
                <tr key={d.id}>
                  <td className="pr-3">#{d.id}</td>
                  <td className="pr-3">{d.arrive.toFixed(2)}</td>
                  <td className={cn("pr-3", d.start - d.arrive > 0.005 && "text-conc")}>{(d.start - d.arrive).toFixed(2)}</td>
                  <td className="pr-3">{d.service.toFixed(2)}</td>
                  <td className="font-semibold">{(d.end - d.arrive).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-1">
          <div className="text-faint">finished <span className="tnum text-ink">{sim.completed}</span></div>
          <div className="text-faint">mean latency <span className="tnum text-ink">{meanSoFar === null ? "–" : ms(meanSoFar)}</span></div>
          <div className="text-faint">busy so far <span className="tnum text-ink">{utilSoFar === null ? "–" : `${Math.round(utilSoFar * 100)}%`}</span></div>
          {cfg.cap !== null && <div className="text-faint">dropped <span className="tnum text-machine">{sim.dropped}</span></div>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-5 pb-4">
        <button onClick={() => { setNote(null); setSim((s) => step(s)); }} className={cn(btn, "border-transparent bg-accent text-on-accent hover:bg-accent-hover")}>
          Step one event
        </button>
        <button onClick={() => { setNote(null); setPlaying((p) => !p); }} className={btn}>{playing ? "Pause" : "Play"}</button>
        <button onClick={() => { setNote(null); setSim((s) => { let n = s; for (let i = 0; i < 50; i++) n = step(n); return n; }); }} className={btn}>
          +50 events
        </button>
        <button onClick={() => { setPlaying(false); setNote(null); setSim(fresh(cfg)); }} className={btn}>Reset</button>
      </div>

      {/* the curve */}
      <div className="border-t border-line px-5 py-4">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div className="text-[13px] text-muted">
            <span className="font-[family-name:var(--font-jetbrains)] text-[12.5px] text-ink">{formula}</span>
            {metric === "p99" && (
              <div className="mt-0.5 text-[12.5px] text-faint">
                {tP99 !== null ? `p99 for M/M/1 is ln(100) × W ≈ 4.6 W = ${tP99.toFixed(1)} ms` : "No simple formula for the p99 here, so the plot shows only the simulation."}
              </div>
            )}
          </div>
          <Toggle label="Plot" value={metric} options={[["mean", "Mean"], ["p99", "p99"]]} onPick={setMetric} />
        </div>
        <LatencyPlot cfg={cfg} metric={metric} points={pts} ghost={ghost} />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-accent" />theory, {shapeLabel(cfg)}{cfg.cap !== null ? " (as if unbounded)" : ""}</span>
          {ghost && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-faint" />previous: {shapeLabel(ghost)}</span>}
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-os" />simulated, seed {cfg.seed}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0 border-l border-dashed border-machine" />your ρ</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={runHere} className={btn}>Run 100,000 jobs at ρ = {cfg.rho.toFixed(2)}</button>
          <button onClick={sweep} className={btn}>Sweep ρ from 0.1 to 0.95</button>
          <button onClick={() => { setPoints((p) => ({ ...p, [key]: [] })); setNote(null); }} className={btn} disabled={pts.length === 0}>Clear points</button>
        </div>
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="min-h-[3.2em] text-[14.5px] leading-relaxed text-ink" aria-live="polite">
          {note ?? (sim.msg || `Press "Step one event". The first job arrives at ${ms(sim.nextArrival)}, and at ρ = ${cfg.rho.toFixed(2)} a new one arrives every ${(1 / arrivalRate(cfg)).toFixed(2)} ms on average.`)}
        </div>
      </div>
    </div>
  );
}

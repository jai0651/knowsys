"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* One cache line, two to four cores, and you are the scheduler. The line holds
   either a counter (CAS increment) or a lock word (a spinlock). Each core has
   its own copy of the line in its L1 cache, tagged with a MESI state, and every
   step shows what the coherence protocol had to do to let that core read or
   write. The point is the bill: how many times the line had to travel. */

export type Mode = "cas" | "tas" | "ttas";
export type MESI = "M" | "E" | "S" | "I";
export type Op = "load" | "cas" | "test" | "tas" | "cs" | "release";

/** Steps a lock holder spends inside its critical section. The data it
    protects lives on a different cache line, so these steps touch nothing here. */
export const CS_LEN = 2;
/** Increments (CAS mode) or lock acquisitions (lock modes) per core, by hand. */
export const ROUNDS = 2;

export function program(mode: Mode, hold = CS_LEN): Op[] {
  const cs: Op[] = Array.from({ length: hold }, () => "cs");
  if (mode === "cas") return ["load", "cas"];
  if (mode === "tas") return ["tas", ...cs, "release"];
  return ["test", "tas", ...cs, "release"];
}

export interface Core { pc: number; old: number | null; done: number; state: MESI }
export interface Sim {
  mode: Mode;
  rounds: number;     // increments or acquisitions each core will do
  hold: number;       // steps a lock holder spends in its critical section
  value: number;      // the current value of the word (wherever the valid copy is)
  mem: number;        // what main memory holds; stale while some core has it Modified
  cores: Core[];
  transfers: number;  // times the line's data had to arrive at a core whose copy was Invalid
  invals: number;     // copies in other cores marked Invalid
  failed: number;     // CAS attempts that changed nothing
  owner: number | null;
  log: string[];
  last: { from: number | "mem"; to: number } | null;
}

export const coreName = (i: number) => `Core ${"ABCD"[i]}`;

export function fresh(mode: Mode, n: number, rounds = ROUNDS, hold = CS_LEN): Sim {
  return {
    mode, rounds, hold, value: 0, mem: 0, transfers: 0, invals: 0, failed: 0, owner: null, log: [], last: null,
    cores: Array.from({ length: n }, () => ({ pc: 0, old: null, done: 0, state: "I" as MESI })),
  };
}

/* ---- the coherence protocol, cut down to one line ---- */

interface Bus { transfer: boolean; inval: number; from: number | "mem" | null; note: string }

/** Core c reads the line. A hit costs nothing; a miss fetches it. */
function busRead(s: Sim, c: number): Bus {
  const me = s.cores[c];
  if (me.state !== "I") return { transfer: false, inval: 0, from: null, note: `a hit in its own cache (${me.state}), so nothing crosses between cores` };
  const owner = s.cores.findIndex((k, i) => i !== c && (k.state === "M" || k.state === "E"));
  const sharer = s.cores.findIndex((k, i) => i !== c && k.state === "S");
  s.transfers += 1;
  if (owner >= 0) {
    const wasM = s.cores[owner].state === "M";
    if (wasM) s.mem = s.value;
    s.cores[owner].state = "S";
    me.state = "S";
    return { transfer: true, inval: 0, from: owner, note: `a miss: ${coreName(owner)} held it ${wasM ? "Modified, so it writes the value back and hands over a copy" : "Exclusive and hands over a copy"}; both now hold it Shared` };
  }
  if (sharer >= 0) {
    me.state = "S";
    return { transfer: true, inval: 0, from: sharer, note: "a miss: another core sends a copy, and it joins the Shared readers" };
  }
  me.state = "E";
  return { transfer: true, inval: 0, from: "mem", note: "a miss: no other core has it, so it comes from memory as Exclusive" };
}

/** Core c needs to write (a store or any atomic read-modify-write). It must hold
    the only copy, so every other copy is invalidated first. */
function busOwn(s: Sim, c: number): Bus {
  const me = s.cores[c];
  if (me.state === "M" || me.state === "E") {
    const was = me.state;
    me.state = "M";
    return { transfer: false, inval: 0, from: null, note: was === "E" ? "it held the only copy (Exclusive), so it writes with no traffic and the line turns Modified" : "it already owns the line (Modified), so no traffic" };
  }
  const others = s.cores.map((k, i) => ({ k, i })).filter(({ k, i }) => i !== c && k.state !== "I");
  const owner = others.find(({ k }) => k.state === "M" || k.state === "E");
  if (owner && owner.k.state === "M") s.mem = s.value;
  for (const { k } of others) k.state = "I";
  s.invals += others.length;
  const killed = others.length === 0 ? "" : ` and ${others.map(({ i }) => coreName(i)).join(", ")} ${others.length === 1 ? "is" : "are"} invalidated`;
  if (me.state === "S") {
    me.state = "M";
    return { transfer: false, inval: others.length, from: null, note: `it has a Shared copy, so it only sends an invalidation${killed}` };
  }
  me.state = "M";
  s.transfers += 1;
  const from = owner ? owner.i : others.length ? others[0].i : "mem";
  return { transfer: true, inval: others.length, from, note: `its copy is Invalid, so the line comes over from ${from === "mem" ? "memory" : coreName(from)}${killed}` };
}

/* ---- one step of one core ---- */

export function step(prev: Sim, c: number, quiet = false): Sim {
  const prog = program(prev.mode, prev.hold);
  if (prev.cores[c].done >= prev.rounds) return prev;
  const s: Sim = { ...prev, cores: prev.cores.map((k) => ({ ...k })), log: quiet ? prev.log : [...prev.log] };
  const me = s.cores[c];
  const op = prog[me.pc];
  const name = coreName(c);
  const say = (m: string) => { if (!quiet) s.log.push(m); };
  const track = (b: Bus) => { if (b.from !== null) s.last = { from: b.from, to: c }; else s.last = null; };
  const finish = () => {
    me.done += 1;
    me.pc = 0;
    me.old = null;
  };

  if (op === "load") {
    const b = busRead(s, c);
    track(b);
    me.old = s.value;
    me.pc = 1;
    say(`${name} reads x = ${s.value}: ${b.note}.`);
  } else if (op === "cas") {
    const expect = me.old ?? 0;
    const b = busOwn(s, c);
    track(b);
    if (s.value === expect) {
      s.value = expect + 1;
      say(`${name}: CAS(x, ${expect}, ${expect + 1}) succeeds. To compare and write, ${b.note}. x is now ${s.value}.`);
      finish();
    } else {
      s.failed += 1;
      me.old = s.value;
      say(`${name}: CAS(x, ${expect}, ${expect + 1}) fails, because x is ${s.value} now. A failed CAS still needs the line to itself: ${b.note}. It keeps the ${s.value} it found and will retry with ${s.value} → ${s.value + 1}.`);
    }
  } else if (op === "test") {
    const b = busRead(s, c);
    track(b);
    if (s.value === 0) {
      me.pc = 1;
      say(`${name} reads lock = 0, free: ${b.note}. Now it tries the CAS.`);
    } else {
      say(`${name} reads lock = 1, still held, so it spins: ${b.note}.`);
    }
  } else if (op === "tas") {
    const b = busOwn(s, c);
    track(b);
    if (s.value === 0) {
      s.value = 1;
      s.owner = c;
      me.pc += 1;
      say(`${name}: CAS(lock, 0, 1) succeeds and it holds the lock. To write, ${b.note}.`);
    } else {
      s.failed += 1;
      if (s.mode === "ttas") me.pc = 0;
      say(`${name}: CAS(lock, 0, 1) fails, the lock is held. Even so, ${b.note}.${s.mode === "ttas" ? " It goes back to reading." : " It tries again."}`);
    }
  } else if (op === "cs") {
    const k = me.pc - prog.indexOf("cs") + 1;
    me.pc += 1;
    s.last = null;
    say(`${name} works inside the critical section (${k} of ${s.hold}). That data is on another line, so this line sees no traffic.`);
  } else if (op === "release") {
    const b = busOwn(s, c);
    track(b);
    s.value = 0;
    s.owner = null;
    say(`${name} releases: lock = 0. A plain store still needs ownership: ${b.note}.`);
    finish();
  }
  return s;
}

export function finished(s: Sim): boolean {
  return s.cores.every((k) => k.done >= s.rounds);
}

/* ---- seeded scheduler ---- */

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

/** Pick a random unfinished core at every step and run it. */
export function pick(s: Sim, rand: () => number): number {
  const live = s.cores.map((k, i) => (k.done < s.rounds ? i : -1)).filter((i) => i >= 0);
  return live[Math.floor(rand() * live.length)];
}

export interface RunResult { transfers: number; invals: number; failed: number; steps: number }

export function run(mode: Mode, n: number, rounds: number, seed: number, hold = CS_LEN): RunResult {
  const rand = mulberry32(seed);
  let s = fresh(mode, n, rounds, hold);
  let steps = 0;
  while (!finished(s)) {
    s = step(s, pick(s, rand), true);
    steps += 1;
  }
  return { transfers: s.transfers, invals: s.invals, failed: s.failed, steps };
}

/* ---- the widget ---- */

const CORE_TONE = [
  { text: "text-os", border: "border-os/40", bg: "bg-os", soft: "bg-os/15" },
  { text: "text-conc", border: "border-conc/40", bg: "bg-conc", soft: "bg-conc/15" },
  { text: "text-data", border: "border-data/40", bg: "bg-data", soft: "bg-data/15" },
  { text: "text-dist", border: "border-dist/40", bg: "bg-dist", soft: "bg-dist/15" },
];

const STATE_STYLE: Record<MESI, string> = {
  M: "border-machine/50 bg-machine/15 text-machine",
  E: "border-ok/50 bg-ok/15 text-ok",
  S: "border-cloud/50 bg-cloud/15 text-cloud",
  I: "border-line-2 bg-surface-2 text-faint",
};
const STATE_WORD: Record<MESI, string> = { M: "Modified", E: "Exclusive", S: "Shared", I: "Invalid" };

const MODES: { id: Mode; label: string; sub: string }[] = [
  { id: "cas", label: "CAS ++", sub: "Each core adds 1 to the counter x, twice, with a CAS loop." },
  { id: "tas", label: "TAS lock", sub: "Each core takes a spinlock twice: retry the CAS until it works." },
  { id: "ttas", label: "TTAS lock", sub: "Same lock, but spin on a plain read and CAS only when it looks free." },
];

function label(op: Op, mode: Mode, k: number, old: number | null): string {
  if (op === "load") return "old = x";
  if (op === "cas") return old === null ? "CAS(x, old, old+1)" : `CAS(x, ${old}, ${old + 1})`;
  if (op === "test") return "while (lock != 0) {}";
  if (op === "tas") return mode === "tas" ? "while (!CAS(lock, 0, 1)) {}" : "if (!CAS(lock, 0, 1)) retry";
  if (op === "cs") return `critical section ${k}/${CS_LEN}`;
  return "lock = 0";
}

const BULK_ROUNDS = 100;
const BULK_CORES = [2, 3, 4, 8];
const BULK_HOLDS = [2, 10, 50];

export function LockLab() {
  const [mode, setMode] = useState<Mode>("cas");
  const [n, setN] = useState(2);
  const [s, setS] = useState<Sim>(() => fresh("cas", 2));
  const [auto, setAuto] = useState(false);
  const [seed, setSeed] = useState(1);
  const [hold, setHold] = useState(10);
  const [bulk, setBulk] = useState<{ seed: number; hold: number; rows: { n: number; tas: RunResult; ttas: RunResult }[] } | null>(null);
  const rand = useRef(mulberry32(7));
  const prog = program(mode);
  const done = finished(s);

  const reset = (m = mode, k = n) => {
    setMode(m);
    setN(k);
    setS(fresh(m, k));
    setAuto(false);
    rand.current = mulberry32(7);
  };

  useEffect(() => {
    if (!auto) return;
    if (done) { setAuto(false); return; }
    const id = setTimeout(() => setS((x) => (finished(x) ? x : step(x, pick(x, rand.current)))), 700);
    return () => clearTimeout(id);
  }, [auto, s, done]);

  const runBulk = (h = hold, sd = seed) => {
    setBulk({
      seed: sd,
      hold: h,
      rows: BULK_CORES.map((k) => ({ n: k, tas: run("tas", k, BULK_ROUNDS, sd, h), ttas: run("ttas", k, BULK_ROUNDS, sd, h) })),
    });
  };
  const per = (r: RunResult, k: number) => (r.transfers / (k * BULK_ROUNDS)).toFixed(1);

  const unit = mode === "cas" ? "increments" : "acquisitions";
  const fmt = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto min-w-[14rem] flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · one cache line, {n} cores</div>
          <div className="text-[14px] text-muted">{MODES.find((m) => m.id === mode)!.sub} Click a core to run its next step.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => reset(m.id)}
                aria-pressed={mode === m.id}
                className={cn("rounded-md px-2.5 py-1.5 transition-colors", mode === m.id ? "bg-ink text-bg" : "text-muted hover:text-ink")}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Number of cores">
            {[2, 3, 4].map((k) => (
              <button
                key={k}
                onClick={() => reset(mode, k)}
                aria-pressed={n === k}
                aria-label={`${k} cores`}
                className={cn("rounded-md px-2.5 py-1.5 transition-colors", n === k ? "bg-ink text-bg" : "text-muted hover:text-ink")}
              >
                {k} cores
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* the shared line and the bill */}
      <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-[auto_1fr]">
        <div className="flex items-end gap-5">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">{mode === "cas" ? "x (the counter)" : "lock word"}</div>
            <div className="tnum font-[family-name:var(--font-serif)] text-[40px] font-semibold leading-none text-ink">{s.value}</div>
          </div>
          <div className="pb-1 text-[12.5px] text-muted">
            <div>memory holds <span className="tnum font-semibold text-ink">{s.mem}</span>{s.cores.some((k) => k.state === "M") && s.mem !== s.value ? <span className="text-machine"> (stale)</span> : null}</div>
            {mode !== "cas" && <div>lock: {s.owner === null ? "free" : <span className={CORE_TONE[s.owner].text}>held by {coreName(s.owner)}</span>}</div>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { k: "Line transfers", v: s.transfers, tone: "text-machine" },
            { k: "Invalidations", v: s.invals, tone: "text-ink" },
            { k: "Failed CAS", v: s.failed, tone: "text-ink" },
          ].map((c) => (
            <div key={c.k} className="rounded-lg border border-line bg-bg/60 px-2 py-2">
              <div className={cn("tnum font-[family-name:var(--font-jetbrains)] text-[22px] font-semibold leading-tight", c.tone)}>{c.v}</div>
              <div className="text-[11.5px] leading-tight text-faint">{c.k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-3 p-5", n === 2 ? "sm:grid-cols-2" : n === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {s.cores.map((core, i) => {
          const tone = CORE_TONE[i];
          const fin = core.done >= ROUNDS;
          const arrived = s.last && s.last.to === i;
          const sent = s.last && s.last.from === i;
          const csStart = prog.indexOf("cs");
          return (
            <div key={i} className={cn("flex flex-col rounded-lg border p-3.5", tone.border)}>
              <div className="mb-2 flex items-center justify-between">
                <span className={cn("text-[14px] font-semibold", tone.text)}>{coreName(i)}</span>
                <span className="tnum text-[12px] text-faint">{Math.min(core.done, ROUNDS)}/{ROUNDS} {unit}</span>
              </div>

              <div className={cn("mb-3 flex items-center gap-3 rounded-md border px-2.5 py-2", STATE_STYLE[core.state])}>
                <span className="font-[family-name:var(--font-jetbrains)] text-[24px] font-bold leading-none">{core.state}</span>
                <div className="min-w-0 text-[12px] leading-tight">
                  <div className="font-semibold">L1 copy · {STATE_WORD[core.state]}</div>
                  <div className="opacity-80">
                    {core.state === "I" ? "no usable copy" : `${mode === "cas" ? "x" : "lock"} = ${s.value}`}
                    {arrived ? " · just arrived" : sent ? " · just sent" : ""}
                  </div>
                </div>
              </div>

              <ol className="mb-2 space-y-0.5 font-[family-name:var(--font-jetbrains)] text-[12.5px]">
                {prog.map((op, k) => {
                  const here = !fin && k === core.pc;
                  return (
                    <li key={k} className={cn("flex items-center gap-1.5 rounded px-1.5 py-0.5", here ? cn(tone.soft, "text-ink") : "text-faint")}>
                      <span className="w-3 shrink-0 text-center">{here ? "▸" : ""}</span>
                      <span className="break-all">{label(op, mode, k - csStart + 1, core.old)}</span>
                    </li>
                  );
                })}
              </ol>
              {mode === "cas" && (
                <div className="mb-2 text-[12.5px] text-muted">register old = <span className="tnum font-semibold text-ink">{core.old ?? "–"}</span></div>
              )}

              <button
                onClick={() => setS((x) => step(x, i))}
                disabled={fin}
                className={cn("mt-auto w-full rounded-lg px-3 py-2 text-[14px] font-medium text-bg transition-opacity disabled:opacity-40", tone.bg)}
              >
                {fin ? "Finished" : `Step ${"ABCD"[i]}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="min-h-[4.2em] text-[14.5px] leading-relaxed text-ink" aria-live="polite">
          {s.log.length === 0
            ? mode === "cas"
              ? "Try this: step A once (it reads x), step B through a whole increment, then step A's CAS. Watch the state badges and the transfer count."
              : mode === "tas"
                ? "Step A until it holds the lock, then step B a few times while A is inside. Then try the same with 3 cores."
                : "Same lock, but waiters read before they CAS. Let A take the lock, then step the other cores while A is inside and watch the transfer count."
            : s.log[s.log.length - 1]}
        </div>
        {done && (
          <div className="mt-2 text-[14px] font-medium text-data">
            Done: {fmt(ROUNDS * n)} {unit}, {s.transfers} line transfers, {s.invals} invalidations, {s.failed} failed CAS.
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAuto((a) => !a)}
            disabled={done}
            className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2 disabled:opacity-40"
          >
            {auto ? "Pause" : "Auto (random scheduler)"}
          </button>
          <button onClick={() => reset()} className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2">
            Reset
          </button>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { runBulk(hold, seed); setSeed((x) => x + 1); }}
              className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2"
            >
              Run {BULK_ROUNDS} acquisitions per core: TAS against TTAS
            </button>
            <span className="text-[12.5px] text-faint">hold the lock for</span>
            <div className="flex rounded-lg border border-line-2 p-0.5 text-[12.5px]" role="group" aria-label="Critical section length">
              {BULK_HOLDS.map((h) => (
                <button
                  key={h}
                  onClick={() => { setHold(h); if (bulk) runBulk(h, bulk.seed); }}
                  aria-pressed={hold === h}
                  className={cn("rounded-md px-2 py-1 transition-colors", hold === h ? "bg-ink text-bg" : "text-muted hover:text-ink")}
                >
                  {h} steps
                </button>
              ))}
            </div>
          </div>
          {bulk && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[19rem] text-left text-[13px]">
                <thead className="text-[11.5px] uppercase tracking-[0.05em] text-faint">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">Cores</th>
                    <th className="py-1 pr-3 font-semibold">TAS</th>
                    <th className="py-1 pr-3 font-semibold">TTAS</th>
                    <th className="py-1 font-semibold">TAS ÷ TTAS</th>
                  </tr>
                </thead>
                <tbody className="tnum font-[family-name:var(--font-jetbrains)]">
                  {bulk.rows.map((r) => (
                    <tr key={r.n} className="border-t border-line">
                      <td className="py-1 pr-3 text-ink">{r.n}</td>
                      <td className="py-1 pr-3 text-machine">{per(r.tas, r.n)}</td>
                      <td className="py-1 pr-3 text-ink">{per(r.ttas, r.n)}</td>
                      <td className="py-1 text-muted">{(r.tas.transfers / r.ttas.transfers).toFixed(1)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1.5 text-[12.5px] text-faint">
                Line transfers per acquisition. Random scheduler, seed {bulk.seed}, lock held for {bulk.hold} steps each time. Click Run again for another seed.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

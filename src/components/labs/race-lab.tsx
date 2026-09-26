"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/* Two threads, one shared counter, and you are the scheduler. Each click runs
   one instruction of one thread, so you can produce the lost update by hand,
   then turn the lock on and watch the same interleaving become impossible. */

type Op = "lock" | "load" | "add" | "store" | "unlock";
const PLAIN: Op[] = ["load", "add", "store"];
const LOCKED: Op[] = ["lock", "load", "add", "store", "unlock"];
const PER_THREAD = 2;

interface T { pc: number; reg: number | null; done: number }
interface S { count: number; owner: 0 | 1 | null; t: [T, T]; stores: number; log: string[]; lost: number }

const fresh = (): S => ({
  count: 0, owner: null, stores: 0, lost: 0, log: [],
  t: [{ pc: 0, reg: null, done: 0 }, { pc: 0, reg: null, done: 0 }],
});

const LABEL: Record<Op, string> = {
  lock: "lock(m)", load: "r = count", add: "r = r + 1", store: "count = r", unlock: "unlock(m)",
};

function step(s: S, i: 0 | 1, prog: Op[], per = PER_THREAD, quiet = false): S {
  const me = s.t[i];
  if (me.done >= per) return s;
  const op = prog[me.pc];
  const name = `T${i + 1}`;
  const n: S = { ...s, t: [{ ...s.t[0] }, { ...s.t[1] }] as [T, T], log: quiet ? s.log : [...s.log] };
  const say = (m: string) => { if (!quiet) n.log.push(m); };
  const t = n.t[i];

  if (op === "lock") {
    if (n.owner !== null && n.owner !== i) {
      say(`${name} tries lock(m), but T${n.owner + 1} holds it. ${name} waits.`);
      return n;
    }
    n.owner = i;
    say(`${name} takes the lock.`);
  } else if (op === "load") {
    t.reg = n.count;
    say(`${name} loads count into its register: r = ${t.reg}.`);
  } else if (op === "add") {
    t.reg = (t.reg ?? 0) + 1;
    say(`${name} adds one in its register: r = ${t.reg}.`);
  } else if (op === "store") {
    n.count = t.reg ?? 0;
    n.stores += 1;
    if (n.count < n.stores) {
      n.lost += 1;
      say(`${name} stores ${n.count}. That overwrites an increment: ${n.stores} increments done, count says ${n.count}.`);
    } else {
      say(`${name} stores ${n.count}.`);
    }
  } else if (op === "unlock") {
    n.owner = null;
    say(`${name} releases the lock.`);
  }

  t.pc += 1;
  if (t.pc >= prog.length) {
    t.pc = 0;
    t.reg = null;
    t.done += 1;
  }
  return n;
}

/* Many increments under a random scheduler, to show the by-hand result isn't
   a fluke. Each step picks a thread at random, so interleavings vary run to
   run exactly the way preemption makes them vary on real hardware. */
function simulate(locked: boolean, per: number): number {
  const prog = locked ? LOCKED : PLAIN;
  let s: S = fresh();
  while (s.t[0].done < per || s.t[1].done < per) {
    let i = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
    if (s.t[i].done >= per) i = (1 - i) as 0 | 1;
    s = step(s, i, prog, per, true);
  }
  return s.count;
}

export function RaceLab() {
  const [locked, setLocked] = useState(false);
  const [s, setS] = useState<S>(fresh);
  const [sim, setSim] = useState<{ locked: boolean; results: number[] } | null>(null);
  const prog = locked ? LOCKED : PLAIN;
  const finished = s.t[0].done >= PER_THREAD && s.t[1].done >= PER_THREAD;

  const reset = (l = locked) => { setLocked(l); setS(fresh()); };

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · you are the scheduler</div>
          <div className="text-[14px] text-muted">Each thread runs <code className="rounded bg-[var(--code-bg)] px-1 text-[12.5px]">count++</code> twice. Click to run one instruction.</div>
        </div>
        <div className="flex rounded-lg border border-line-2 p-0.5 text-[13px]">
          {[false, true].map((l) => (
            <button
              key={String(l)}
              onClick={() => reset(l)}
              className={cn("rounded-md px-3 py-1.5 transition-colors", locked === l ? "bg-ink text-bg" : "text-muted hover:text-ink")}
            >
              {l ? "With a lock" : "No lock"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_1fr]">
        {([0, 1] as const).map((i) => {
          const t = s.t[i];
          const blocked = prog[t.pc] === "lock" && s.owner !== null && s.owner !== i;
          const doneT = t.done >= PER_THREAD;
          return (
            <div key={i} className={cn("rounded-lg border p-4", i === 0 ? "border-os/40" : "border-conc/40", i === 1 && "sm:order-3")}>
              <div className="mb-3 flex items-center justify-between">
                <span className={cn("text-[14px] font-semibold", i === 0 ? "text-os" : "text-conc")}>Thread {i + 1}</span>
                <span className="tnum text-[12.5px] text-faint">{Math.min(t.done, PER_THREAD)}/{PER_THREAD} done</span>
              </div>
              <ol className="mb-3 space-y-1 font-[family-name:var(--font-jetbrains)] text-[13px]">
                {prog.map((op, k) => (
                  <li
                    key={op}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1",
                      !doneT && k === t.pc ? (i === 0 ? "bg-os/15 text-ink" : "bg-conc/15 text-ink") : "text-faint",
                    )}
                  >
                    <span className="w-3 text-center">{!doneT && k === t.pc ? "▸" : ""}</span>
                    {LABEL[op]}
                  </li>
                ))}
              </ol>
              <div className="mb-3 text-[13px] text-muted">
                register r = <span className="tnum font-semibold text-ink">{t.reg ?? "–"}</span>
              </div>
              <button
                onClick={() => setS((x) => step(x, i, prog))}
                disabled={doneT}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-[14px] font-medium transition-opacity disabled:opacity-40",
                  i === 0 ? "bg-os text-bg" : "bg-conc text-bg",
                )}
              >
                {doneT ? "Finished" : blocked ? `Step T${i + 1} (waits)` : `Step T${i + 1}`}
              </button>
            </div>
          );
        })}

        <div className="flex flex-col items-center justify-center gap-3 px-2 sm:order-2">
          <div className="text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Shared memory</div>
            <div className="tnum font-[family-name:var(--font-serif)] text-[46px] font-semibold leading-none text-ink">{s.count}</div>
            <div className="text-[12.5px] text-faint">count</div>
          </div>
          {locked && (
            <div className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium", s.owner === null ? "bg-surface-2 text-muted" : s.owner === 0 ? "bg-os/15 text-os" : "bg-conc/15 text-conc")}>
              lock: {s.owner === null ? "free" : `held by T${s.owner + 1}`}
            </div>
          )}
          <button onClick={() => reset()} className="text-[13px] text-faint underline decoration-line-2 underline-offset-2 hover:text-ink">
            Reset
          </button>
        </div>
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="min-h-[3.2em] text-[14.5px] leading-relaxed text-ink">
          {s.log.length === 0
            ? locked
              ? "Try the same trick as before: load in T1, then switch to T2. See what the lock does."
              : "Try this: step T1 once (it loads 0), then step T2 through a whole increment, then finish T1."
            : s.log[s.log.length - 1]}
        </div>
        {finished && (
          <div className={cn("mt-2 text-[14px] font-medium", s.count === PER_THREAD * 2 ? "text-data" : "text-machine")}>
            Four increments ran, and count is {s.count}.{" "}
            {s.count === PER_THREAD * 2 ? "Nothing was lost." : `${PER_THREAD * 2 - s.count} ${PER_THREAD * 2 - s.count === 1 ? "was" : "were"} lost, and nothing reported an error.`}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            onClick={() => setSim({ locked, results: Array.from({ length: 5 }, () => simulate(locked, 1000)) })}
            className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2"
          >
            Now let a random scheduler run 1,000 each, five times
          </button>
          {sim && (
            <span className="tnum text-[13.5px] text-muted">
              {sim.locked ? "With lock" : "No lock"}: {sim.results.join(", ")}{" "}
              <span className="text-faint">(should be 2,000)</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

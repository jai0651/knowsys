"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/* Two transactions, a tiny table, and you choose the interleaving. Every row
   version is kept, Postgres-style, with the xmin that created it and the xmax
   that replaced it, so you can watch each transaction's snapshot decide which
   versions it sees. Switch the isolation level and replay the same order:
   read committed and repeatable read let the doctors' write skew through,
   repeatable read stops the counter's lost update, and serializable (SSI)
   catches both.

   The model follows Postgres closely but not completely: two transactions,
   one table, SIREAD locks on the whole table (what a sequential scan takes),
   and none of SSI's read-only optimisations. */

export type Scenario = "doctors" | "counter";
export type Level = "rc" | "rr" | "ser";
type Status = "idle" | "active" | "waiting" | "committed" | "aborted";
type Clog = Record<number, "running" | "committed" | "aborted">;

export interface Snap { xmin: number; xmax: number; xip: number[] }
export interface Tuple { n: number; key: string; val: number | boolean; xmin: number; xmax: number }
interface Pending { key: string; val: number | boolean; snap: Snap }
export interface Txn {
  pc: number; xid: number | null; snap: Snap | null; status: Status; r: number | null;
  doomed: boolean; siread: boolean; startedAt: number; commitAt: number;
  pending: Pending | null; error: string | null; attempt: number; skipped: boolean;
}
export interface S {
  scenario: Scenario; level: Level; tuples: Tuple[]; clog: Clog; nextXid: number; clock: number;
  t: [Txn, Txn];
  /** rw[i]: an rw-antidependency from Ti to the other one (Ti read something the other wrote). */
  rw: [boolean, boolean];
  log: string[];
}

const BASE_XID = 100;
const WW = "ERROR 40001: could not serialize access due to concurrent update";
const RW = "ERROR 40001: could not serialize access due to read/write dependencies among transactions";
export const LEVEL_NAME: Record<Level, string> = { rc: "Read committed", rr: "Repeatable read", ser: "Serializable" };

const nm = (i: number) => `T${i + 1}`;
const other = (i: 0 | 1) => (1 - i) as 0 | 1;
const myKey = (s: S, i: number) => (s.scenario === "counter" ? "n" : i === 0 ? "alice" : "bob");

const freshTxn = (attempt = 1): Txn => ({
  pc: 0, xid: null, snap: null, status: "idle", r: null, doomed: false, siread: false,
  startedAt: -1, commitAt: -1, pending: null, error: null, attempt, skipped: false,
});

export function init(scenario: Scenario, level: Level): S {
  const tuples: Tuple[] = scenario === "doctors"
    ? [
        { n: 1, key: "alice", val: true, xmin: BASE_XID, xmax: 0 },
        { n: 2, key: "bob", val: true, xmin: BASE_XID, xmax: 0 },
      ]
    : [{ n: 1, key: "n", val: 0, xmin: BASE_XID, xmax: 0 }];
  return {
    scenario, level, tuples, clog: { [BASE_XID]: "committed" }, nextXid: BASE_XID + 1, clock: 0,
    t: [freshTxn(), freshTxn()], rw: [false, false], log: [],
  };
}

export function script(s: S, i: number): string[] {
  if (s.scenario === "doctors") {
    return [
      "SELECT count(*) FROM doctors WHERE on_call",
      `IF count >= 2: UPDATE doctors SET on_call = false WHERE name = '${myKey(s, i)}'`,
      "COMMIT",
    ];
  }
  const r = s.t[i].r;
  return ["SELECT n FROM counter", `UPDATE counter SET n = ${r === null ? "r + 1" : r + 1}`, "COMMIT"];
}

/* ── Visibility, after HeapTupleSatisfiesMVCC ─────────────────────────────── */

export const inSnap = (x: number, snap: Snap) => x >= snap.xmax || snap.xip.includes(x);

export function takeSnap(s: S, i: number): Snap {
  const own = s.t[i].xid;
  const xip = s.t
    .filter((t) => (t.status === "active" || t.status === "waiting") && t.xid !== null && t.xid !== own)
    .map((t) => t.xid as number)
    .sort((a, b) => a - b);
  return { xmin: Math.min(s.nextXid, ...xip), xmax: s.nextXid, xip };
}

export function visible(t: Tuple, snap: Snap, my: number | null, clog: Clog): { vis: boolean; why: string } {
  const v = `version #${t.n}`;
  if (t.xmin !== my) {
    if (clog[t.xmin] === "aborted") return { vis: false, why: `${v} was made by xid ${t.xmin}, which aborted` };
    if (inSnap(t.xmin, snap))
      return { vis: false, why: `${v} was made by xid ${t.xmin}, which had not committed when the snapshot was taken` };
  }
  if (t.xmax === 0) return { vis: true, why: `${v} is live` };
  if (t.xmax === my) return { vis: false, why: `${v} was replaced by this transaction itself` };
  if (clog[t.xmax] === "aborted") return { vis: true, why: `${v} was replaced by xid ${t.xmax}, which aborted` };
  if (inSnap(t.xmax, snap))
    return { vis: true, why: `${v} was replaced by xid ${t.xmax}, but that change is invisible to the snapshot` };
  return { vis: false, why: `${v} was replaced by xid ${t.xmax}, which committed before the snapshot` };
}

/** The snapshot Ti's next statement would read with. */
export function snapFor(s: S, i: number): Snap {
  const t = s.t[i];
  return s.level === "rc" || !t.snap ? takeSnap(s, i) : t.snap;
}

const snapText = (sn: Snap) => `xmax ${sn.xmax}, running [${sn.xip.join(", ")}]`;

/* ── One step of one transaction ──────────────────────────────────────────── */

function abort(n: S, i: 0 | 1, err: string): string {
  const t = n.t[i];
  t.status = "aborted";
  t.error = err;
  t.pending = null;
  t.siread = false;
  if (t.xid !== null) n.clog[t.xid] = "aborted";
  n.rw = [false, false];
  const o = other(i);
  if (n.t[o].status === "waiting") return " " + resume(n, o, `${nm(i)}'s abort released the row lock.`);
  return "";
}

/** SSI: two consecutive rw edges between the two transactions. */
function checkCycle(n: S, i: 0 | 1): { aborted: boolean; msg: string } {
  if (n.level !== "ser" || !(n.rw[0] && n.rw[1])) return { aborted: false, msg: "" };
  const o = other(i);
  if (n.t[o].status === "committed") {
    const tail = abort(n, i, RW);
    return {
      aborted: true,
      msg: ` That closes the dangerous structure, ${nm(o)} → ${nm(i)} → ${nm(o)}, and ${nm(o)} has already committed, so ${nm(i)} is the one that must go: ${RW}.${tail}`,
    };
  }
  return {
    aborted: false,
    msg: ` Now there's an rw edge each way, the dangerous structure. Both are still running, so Postgres doesn't abort yet: an anomaly needs one of them to commit first. Whichever commits first wins.`,
  };
}

function conflictIn(n: S, i: 0 | 1): void {
  const o = other(i);
  const to = n.t[o];
  const concurrent = to.status !== "committed" || to.commitAt > n.t[i].startedAt;
  if (n.level === "ser" && to.siread && to.status !== "aborted" && concurrent) n.rw[o] = true;
}

/** Try to write key := val. Returns narration; may set waiting or abort. */
function write(n: S, i: 0 | 1, key: string, val: number | boolean, stmtSnap: Snap, resumed: boolean): string {
  const t = n.t[i];
  const me = nm(i);
  if (t.xid === null) {
    t.xid = n.nextXid++;
    n.clog[t.xid] = "running";
  }
  const v = n.tuples.find((x) => x.key === key && visible(x, stmtSnap, t.xid, n.clog).vis)!;
  let target = v;
  let lead = resumed ? "" : `${me} gets xid ${t.xid} on its first write. `;
  if (v.xmax !== 0 && v.xmax !== t.xid) {
    const st = n.clog[v.xmax];
    const holder = n.t.findIndex((x) => x.xid === v.xmax);
    if (st === "running") {
      t.status = "waiting";
      t.pending = { key, val, snap: stmtSnap };
      return `${lead}The version of ${key} it sees (#${v.n}) has xmax ${v.xmax}: ${nm(holder)} replaced it and hasn't committed, so ${me} waits for ${nm(holder)}'s row lock.`;
    }
    if (st === "committed") {
      if (n.level !== "rc") {
        const tail = abort(n, i, WW);
        return `${lead}Version #${v.n} of ${key}, the one in ${me}'s snapshot, was replaced by xid ${v.xmax}, which committed after that snapshot. First updater wins: ${WW}.${tail}`;
      }
      while (target.xmax !== 0 && n.clog[target.xmax] === "committed")
        target = n.tuples.find((x) => x.key === key && x.xmin === target.xmax)!;
      lead += `Read committed follows the update chain from #${v.n} to the newest version, #${target.n}, re-checks the WHERE clause (still matches), and writes on top of it. `;
    }
  }
  // Postgres runs the SSI check before the write itself (heap_update calls
  // CheckForSerializableConflictIn first), so an abort here leaves no version.
  let ssi = "";
  const before = n.rw[other(i)];
  conflictIn(n, i);
  if (!before && n.rw[other(i)])
    ssi = ` ${nm(other(i))} had read this table, so SSI records an rw edge ${nm(other(i))} → ${me}.`;
  const cyc = checkCycle(n, i);
  if (cyc.aborted) return `${lead}Before writing ${key}, ${me} checks the SIREAD locks.${ssi}${cyc.msg}`;
  target.xmax = t.xid;
  n.tuples.push({ n: n.tuples.length + 1, key, val, xmin: t.xid, xmax: 0 });
  t.pc += 1;
  let msg = `${lead}${me} sets xmax ${t.xid} on #${target.n} and adds version #${n.tuples.length} (${key} = ${fmt(val)}, xmin ${t.xid}).`;
  if (n.scenario === "counter" && n.level === "rc" && target !== v)
    msg += ` But ${me} computed ${fmt(val)} from n = ${t.r}, so the increment in #${target.n} is overwritten.`;
  return msg + ssi + cyc.msg;
}

function resume(n: S, i: 0 | 1, why: string): string {
  const t = n.t[i];
  const p = t.pending!;
  t.status = "active";
  t.pending = null;
  return `${why} ${nm(i)}'s waiting UPDATE wakes up. ` + write(n, i, p.key, p.val, p.snap, true);
}

const fmt = (v: number | boolean) => (typeof v === "boolean" ? (v ? "on call" : "off call") : String(v));

export function step(s: S, i: 0 | 1): S {
  const n: S = structuredClone(s);
  const t = n.t[i];
  const me = nm(i);
  const say = (m: string) => n.log.push(m);
  if (t.status === "committed" || t.status === "aborted" || t.pc >= 3) return s;
  if (t.status === "waiting") {
    say(`${me} is still waiting for the other transaction's row lock. Step the other one.`);
    return n;
  }
  n.clock += 1;
  if (t.doomed) {
    say(`${me} was marked to fail when the other transaction committed, so its next statement gets ${RW}.` + abort(n, i, RW));
    return n;
  }
  if (t.status === "idle") {
    t.status = "active";
    t.startedAt = n.clock;
    if (n.level !== "rc") t.snap = takeSnap(n, i);
  }

  if (t.pc === 0) {
    const snap = snapFor(n, i);
    const checks = n.tuples.map((x) => ({ x, ...visible(x, snap, t.xid, n.clog) }));
    const seen = checks.filter((c) => c.vis).map((c) => c.x);
    t.r = n.scenario === "doctors" ? seen.filter((x) => x.val === true).length : (seen[0].val as number);
    const fresh = n.level === "rc" ? "takes a new snapshot for this statement" : "takes its transaction snapshot";
    const notes = checks.filter((c) => c.x.xmin !== BASE_XID || c.x.xmax !== 0).map((c) => c.why);
    let msg = `${me} ${fresh} (${snapText(snap)}) and ${n.scenario === "doctors" ? `counts ${t.r} on call` : `reads n = ${t.r}`}.`;
    if (notes.length) msg += ` It checks each version: ${notes.join("; ")}.`;
    if (n.level === "ser") {
      t.siread = true;
      msg += ` Serializable also leaves an SIREAD lock on the table.`;
      const o = other(i);
      const ox = n.t[o].xid;
      const before = n.rw[i];
      if (ox !== null && n.clog[ox] !== "aborted" && n.tuples.some((x) => (x.xmin === ox || x.xmax === ox) && inSnap(ox, snap)))
        n.rw[i] = true;
      if (!before && n.rw[i]) msg += ` It skipped a change by ${nm(o)} that its snapshot can't see, so SSI records an rw edge ${me} → ${nm(o)}.`;
      msg += checkCycle(n, i).msg;
    }
    t.pc = 1;
    say(msg);
    return n;
  }

  if (t.pc === 1) {
    if (n.scenario === "doctors" && (t.r ?? 0) < 2) {
      t.skipped = true;
      t.pc = 2;
      say(`${me} saw only ${t.r} doctor on call, so ${myKey(n, i)} stays on call and nothing is written.`);
      return n;
    }
    const val = n.scenario === "doctors" ? false : (t.r ?? 0) + 1;
    say(write(n, i, myKey(n, i), val, snapFor(n, i), false));
    return n;
  }

  // COMMIT
  let msg = "";
  const o = other(i);
  if (n.level === "ser" && n.rw[0] && n.rw[1] && (n.t[o].status === "active" || n.t[o].status === "waiting") && !n.t[o].doomed) {
    n.t[o].doomed = true;
    msg = `Before ${me} commits, SSI looks for the dangerous structure and finds it, with ${nm(o)} still running. It lets ${me} commit and marks ${nm(o)} to fail, so a retry of ${nm(o)} will see ${me}'s committed write. `;
  }
  if (t.xid !== null) n.clog[t.xid] = "committed";
  t.status = "committed";
  t.commitAt = n.clock;
  t.pc = 3;
  const head = t.xid === null
    ? `${me} commits. It wrote nothing, so it never needed an xid.`
    : `${me} commits: the commit log now records xid ${t.xid} as committed.`;
  let tail = "";
  if (n.t[o].status === "waiting") tail = " " + resume(n, o, `${me}'s commit released the row lock.`);
  say(msg + head + tail);
  return n;
}

export function retry(s: S, i: 0 | 1): S {
  if (s.t[i].status !== "aborted") return s;
  const n: S = structuredClone(s);
  n.t[i] = freshTxn(s.t[i].attempt + 1);
  n.log.push(`${nm(i)} starts again from the top, the way an application's retry loop would. Its old xid stays in the commit log as aborted, and its versions are invisible to everyone.`);
  return n;
}

/* ── Outcome and exhaustive search ───────────────────────────────────────── */

export const finished = (s: S) => s.t.every((t) => t.status === "committed" || t.status === "aborted");

/** Committed state of each key, as a brand-new reader would see it. */
export function finalState(s: S): Record<string, number | boolean> {
  const snap: Snap = { xmin: s.nextXid, xmax: s.nextXid, xip: [] };
  const out: Record<string, number | boolean> = {};
  for (const x of s.tuples) if (visible(x, snap, null, s.clog).vis) out[x.key] = x.val;
  return out;
}

export type Outcome = "anomaly" | "abort" | "clean";
export function outcome(s: S): Outcome {
  const f = finalState(s);
  const bad = s.scenario === "doctors"
    ? f.alice === false && f.bob === false
    : (f.n as number) !== s.t.filter((t) => t.status === "committed" && t.xid !== null).length;
  if (bad) return "anomaly";
  return s.t.some((t) => t.status === "aborted") ? "abort" : "clean";
}

/** Every order in which the two scripts can interleave (waiting removes choices). */
export function explore(scenario: Scenario, level: Level) {
  const res = { orders: 0, anomaly: 0, abort: 0, clean: 0 };
  const go = (s: S) => {
    const can = ([0, 1] as const).filter((i) => s.t[i].status === "idle" || s.t[i].status === "active");
    if (can.length === 0) {
      res.orders += 1;
      res[outcome(s)] += 1;
      return;
    }
    for (const i of can) go(step(s, i));
  };
  go(init(scenario, level));
  return res;
}

/* ── The widget ──────────────────────────────────────────────────────────── */

const CLASSIC: (0 | 1)[] = [0, 1, 0, 1, 0, 1];
const TONE = ["os", "conc"] as const;

export function MvccLab() {
  const [scenario, setScenario] = useState<Scenario>("doctors");
  const [level, setLevel] = useState<Level>("rr");
  const [s, setS] = useState<S>(() => init("doctors", "rr"));
  const [queue, setQueue] = useState<(0 | 1)[]>([]);
  const [all, setAll] = useState<{ key: string; r: ReturnType<typeof explore> } | null>(null);

  useEffect(() => {
    if (queue.length === 0) return;
    const id = setTimeout(() => {
      setS((x) => step(x, queue[0]));
      setQueue((q) => q.slice(1));
    }, 1100);
    return () => clearTimeout(id);
  }, [queue]);

  const reset = (sc = scenario, lv = level) => {
    setScenario(sc);
    setLevel(lv);
    setQueue([]);
    setS(init(sc, lv));
  };

  const done = finished(s);
  const out = done ? outcome(s) : null;
  const f = finalState(s);
  const xidOwner = (x: number) => s.t.findIndex((t) => t.xid === x);
  const allKey = `${scenario}-${level}`;

  return (
    <div className="not-prose my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto min-w-[14rem]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · you choose the interleaving</div>
          <div className="text-[14px] text-muted">
            {scenario === "doctors"
              ? "Two on-call doctors each check the rota, then take themselves off call."
              : "Two transactions each read a counter and write back one more."}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Scenario">
            {(["doctors", "counter"] as const).map((sc) => (
              <button
                key={sc}
                onClick={() => reset(sc, level)}
                aria-pressed={scenario === sc}
                className={cn("rounded-md px-3 py-1.5 transition-colors", scenario === sc ? "bg-ink text-bg" : "text-muted hover:text-ink")}
              >
                {sc === "doctors" ? "Write skew" : "Lost update"}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Isolation level">
            {(["rc", "rr", "ser"] as const).map((lv) => (
              <button
                key={lv}
                onClick={() => reset(scenario, lv)}
                aria-pressed={level === lv}
                className={cn("rounded-md px-2.5 py-1.5 transition-colors", level === lv ? "bg-ink text-bg" : "text-muted hover:text-ink")}
              >
                {LEVEL_NAME[lv]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {([0, 1] as const).map((i) => {
          const t = s.t[i];
          const lines = script(s, i);
          const tone = TONE[i];
          const sn = t.status === "idle" ? null : level === "rc" ? null : t.snap;
          const over = t.status === "committed" || t.status === "aborted";
          return (
            <div key={i} className={cn("rounded-lg border p-4", i === 0 ? "border-os/40" : "border-conc/40")}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className={cn("text-[14px] font-semibold", i === 0 ? "text-os" : "text-conc")}>
                  T{i + 1}{t.attempt > 1 ? ` · retry ${t.attempt - 1}` : ""}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[12px] font-medium",
                    t.status === "committed" ? "bg-data/15 text-data"
                      : t.status === "aborted" ? "bg-machine/15 text-machine"
                      : t.status === "waiting" ? "bg-ops/15 text-ops"
                      : "bg-surface-2 text-muted",
                  )}
                >
                  {t.status === "idle" ? "not started" : t.status === "active" && t.doomed ? "active · marked to fail" : t.status}
                </span>
              </div>
              <div className="mb-3 space-y-1 font-[family-name:var(--font-jetbrains)] text-[12.5px]">
                {lines.map((line, k) => (
                  <div
                    key={k}
                    className={cn(
                      "flex gap-2 rounded px-2 py-1",
                      !over && k === t.pc ? (i === 0 ? "bg-os/15 text-ink" : "bg-conc/15 text-ink") : k < t.pc ? "text-muted" : "text-faint",
                      k === 1 && t.skipped && "line-through",
                    )}
                  >
                    <span className="w-3 shrink-0 text-center">{!over && k === t.pc ? "▸" : k < t.pc ? "✓" : ""}</span>
                    <span className="break-words">{line}</span>
                  </div>
                ))}
              </div>
              <div className="mb-3 space-y-0.5 text-[12.5px] text-muted">
                <div>
                  xid <span className="tnum font-semibold text-ink">{t.xid ?? "none yet"}</span>
                  <span className="text-faint"> · {scenario === "doctors" ? "count" : "r"} = </span>
                  <span className="tnum font-semibold text-ink">{t.r ?? "–"}</span>
                </div>
                <div className="tnum">
                  snapshot:{" "}
                  {level === "rc"
                    ? <span className="text-faint">new one per statement</span>
                    : sn
                      ? <span className="font-[family-name:var(--font-jetbrains)] text-ink">{snapText(sn)}</span>
                      : <span className="text-faint">taken at first statement</span>}
                </div>
                {t.error && <div className="font-[family-name:var(--font-jetbrains)] text-[11.5px] text-machine">{t.error}</div>}
              </div>
              {t.status === "aborted" ? (
                <button
                  onClick={() => { setQueue([]); setS((x) => retry(x, i)); }}
                  className="w-full rounded-lg border border-line-2 px-3 py-2 text-[14px] font-medium text-ink hover:bg-surface-2"
                >
                  Retry T{i + 1}
                </button>
              ) : (
                <button
                  onClick={() => { setQueue([]); setS((x) => step(x, i)); }}
                  disabled={over}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-[14px] font-medium transition-opacity disabled:opacity-40",
                    i === 0 ? "bg-os text-bg" : "bg-conc text-bg",
                  )}
                >
                  {over ? "Finished" : t.status === "waiting" ? `T${i + 1} is waiting` : `Step T${i + 1}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">
            Row versions in table {scenario === "doctors" ? "doctors" : "counter"}
          </div>
          <div className="text-[12px] text-faint">● = visible to that transaction&apos;s next statement</div>
        </div>
        <div role="table" aria-label="Row versions" className="overflow-x-auto rounded-lg border border-line">
          <div role="row" className="grid min-w-[22rem] grid-cols-[2.2rem_1fr_1fr_3.6rem_3.6rem_2.6rem_2.6rem] gap-x-2 border-b border-line bg-surface-2 px-3 py-2 text-[12px] font-semibold text-muted">
            <span role="columnheader">#</span>
            <span role="columnheader">row</span>
            <span role="columnheader">value</span>
            <span role="columnheader">xmin</span>
            <span role="columnheader">xmax</span>
            <span role="columnheader" className="text-os">T1</span>
            <span role="columnheader" className="text-conc">T2</span>
          </div>
          {s.tuples.map((x) => {
            const vis = ([0, 1] as const).map((i) => {
              const t = s.t[i];
              if (t.status === "committed" || t.status === "aborted") return null;
              return visible(x, snapFor(s, i), t.xid, s.clog).vis;
            });
            const dead = s.clog[x.xmin] === "aborted";
            const xidCell = (v: number) => {
              if (v === 0) return <span className="text-faint">0</span>;
              const st = s.clog[v];
              const ow = xidOwner(v);
              return (
                <span
                  title={st}
                  className={cn(
                    "tnum",
                    st === "running" && (ow === 0 ? "text-os" : "text-conc"),
                    st === "aborted" && "text-faint line-through",
                    st === "committed" && "text-ink",
                  )}
                >
                  {v}{st === "running" ? "*" : ""}
                </span>
              );
            };
            return (
              <div
                role="row"
                key={x.n}
                className={cn(
                  "grid min-w-[22rem] grid-cols-[2.2rem_1fr_1fr_3.6rem_3.6rem_2.6rem_2.6rem] gap-x-2 border-b border-line px-3 py-1.5 font-[family-name:var(--font-jetbrains)] text-[12.5px] last:border-b-0",
                  dead && "opacity-50",
                )}
              >
                <span role="cell" className="text-faint">{x.n}</span>
                <span role="cell" className="text-ink">{x.key}</span>
                <span role="cell" className={cn(typeof x.val === "boolean" && !x.val ? "text-machine" : "text-ink")}>{fmt(x.val)}</span>
                <span role="cell">{xidCell(x.xmin)}</span>
                <span role="cell">{xidCell(x.xmax)}</span>
                {vis.map((v, i) => (
                  <span role="cell" key={i} aria-label={v === null ? "finished" : v ? "visible" : "not visible"} className={cn(v ? (i === 0 ? "text-os" : "text-conc") : "text-faint")}>
                    {v === null ? "" : v ? "●" : "○"}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 text-[12px] text-faint">
          * still running. Struck out: aborted. The commit log:{" "}
          <span className="tnum font-[family-name:var(--font-jetbrains)]">
            {Object.entries(s.clog).map(([x, st]) => `${x} ${st}`).join(" · ")}
          </span>
        </div>

        {level === "ser" && (
          <div className="mt-4 grid items-center gap-3 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,15rem)_1fr]">
            <svg viewBox="0 0 260 96" className="w-full max-w-[15rem]" role="img" aria-label={`rw edges: T1 to T2 ${s.rw[0] ? "present" : "absent"}, T2 to T1 ${s.rw[1] ? "present" : "absent"}`}>
              <path d="M 66 36 Q 130 2 194 36" fill="none" strokeWidth="2" strokeDasharray={s.rw[0] ? undefined : "4 4"} className={cn("stroke-current", s.rw[0] ? "text-os" : "text-line-2")} />
              <path d="M 194 36 l -9 -1 l 4 -7 z" className={cn("fill-current", s.rw[0] ? "text-os" : "text-line-2")} />
              <path d="M 194 60 Q 130 94 66 60" fill="none" strokeWidth="2" strokeDasharray={s.rw[1] ? undefined : "4 4"} className={cn("stroke-current", s.rw[1] ? "text-conc" : "text-line-2")} />
              <path d="M 66 60 l 9 1 l -4 7 z" className={cn("fill-current", s.rw[1] ? "text-conc" : "text-line-2")} />
              {[0, 1].map((i) => (
                <g key={i}>
                  <circle cx={i === 0 ? 46 : 214} cy={48} r={20} strokeWidth="2" className={cn("fill-current stroke-current", i === 0 ? "text-os/15" : "text-conc/15")} />
                  <circle cx={i === 0 ? 46 : 214} cy={48} r={20} strokeWidth="2" fill="none" className={cn("stroke-current", i === 0 ? "text-os" : "text-conc")} />
                  <text x={i === 0 ? 46 : 214} y={53} textAnchor="middle" className="fill-current text-ink" fontSize="14" fontWeight="600">T{i + 1}</text>
                </g>
              ))}
              <text x={130} y={14} textAnchor="middle" fontSize="11" className="fill-current text-faint">rw</text>
              <text x={130} y={92} textAnchor="middle" fontSize="11" className="fill-current text-faint">rw</text>
            </svg>
            <div className="text-[13px] leading-relaxed text-muted">
              <div>
                SIREAD locks:{" "}
                <span className="text-ink">
                  {s.t.map((t, i) => (t.siread ? `T${i + 1} on the whole table` : null)).filter(Boolean).join(", ") || "none yet"}
                </span>
              </div>
              <div>
                An arrow Tx → Ty means Tx read something Ty wrote, which Tx&apos;s snapshot can&apos;t see.{" "}
                {s.rw[0] && s.rw[1] && <span className="font-medium text-machine">Both arrows: the dangerous structure.</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="min-h-[4.8em] text-[14.5px] leading-relaxed text-ink" aria-live="polite">
          {s.log.length === 0
            ? scenario === "doctors"
              ? "Try this: step T1 (it counts the doctors on call), then T2, then let each take itself off call and commit. Watch which versions each one can see."
              : "Try this: step T1 to read n, then T2, then UPDATE in T1 and UPDATE in T2. One of them will have to wait."
            : s.log[s.log.length - 1]}
        </div>
        {done && out && (
          <div className={cn("mt-2 text-[14px] font-medium", out === "anomaly" ? "text-machine" : "text-data")}>
            {scenario === "doctors"
              ? out === "anomaly"
                ? "Both transactions committed and nobody is on call. Each saw two doctors, each acted correctly on what it saw, and the rule broke anyway: write skew."
                : `On call now: ${["alice", "bob"].filter((k) => f[k] === true).join(" and ")}. ${out === "abort" ? "One transaction was aborted instead of breaking the rule; retry it to see it stay on call." : "The rule held."}`
              : out === "anomaly"
                ? `n = ${f.n}, but ${s.t.filter((t) => t.status === "committed").length} increments committed and nobody got an error: a lost update.`
                : `n = ${f.n}. ${out === "abort" ? "The loser got an error instead of silently losing its increment; retry it." : "Every committed increment counted."}`}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            onClick={() => { const fresh = init(scenario, level); setS(fresh); setQueue(CLASSIC); }}
            disabled={queue.length > 0}
            className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2 disabled:opacity-40"
          >
            {queue.length > 0 ? "Playing…" : "Play T1, T2, T1, T2, T1, T2"}
          </button>
          <button
            onClick={() => setAll({ key: allKey, r: explore(scenario, level) })}
            className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2"
          >
            Try every interleaving
          </button>
          <button onClick={() => reset()} className="text-[13px] text-faint underline decoration-line-2 underline-offset-2 hover:text-ink">
            Reset
          </button>
          {all && all.key === allKey && (
            <span className="tnum basis-full text-[13.5px] text-muted">
              {LEVEL_NAME[level]}, {all.r.orders} orders:{" "}
              <span className={all.r.anomaly ? "font-medium text-machine" : ""}>{all.r.anomaly} {scenario === "doctors" ? "left nobody on call" : "lost an update"}</span>,{" "}
              {all.r.abort} ended in a serialization failure, {all.r.clean} ran clean.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

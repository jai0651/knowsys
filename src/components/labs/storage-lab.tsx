"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/* The same stream of keys goes into a B+tree and an LSM tree, one operation
   per click. The B+tree changes pages in place and splits them when they
   overflow; the LSM tree buffers writes in a memtable, flushes sorted files
   and merges them in the background. Three counters per engine (write, read
   and space amplification) show where each design pays.

   Everything below the UI line is pure and deterministic: the page replays the
   whole operation history on every render, so toggling the compaction style or
   the bloom filters re-derives the state rather than mutating it. */

/* ------------------------------------------------------------------ */
/* Parameters, small enough to check by hand                           */
/* ------------------------------------------------------------------ */

export const LEAF_CAP = 3; // keys per B+tree page (order 4: at most 4 children)
export const MEM_CAP = 4; // memtable entries before a flush
export const FILE_CAP = 4; // entries per SSTable written by compaction
export const L0_TRIGGER = 2; // L0 files that start a compaction
export const TIERED_L1_RUNS = 3; // tiered: L1 runs that start a full merge
export const BLOOM_BITS_PER_KEY = 4;
export const BLOOM_HASHES = 2;
export const MAX_OPS = 80;

export type OpKind = "put" | "del" | "get";
export interface Op { kind: OpKind; k: number }
export type Style = "leveled" | "tiered";

const opText = (o: Op) => `${o.kind === "del" ? "delete" : o.kind === "get" ? "look up" : "put"} ${o.k}`;
const list = (ks: number[]) => `[${ks.join(" ")}]`;

/* ------------------------------------------------------------------ */
/* B+tree                                                              */
/* ------------------------------------------------------------------ */

export interface BNode { id: number; leaf: boolean; keys: number[]; kids: number[] }
export interface BTree {
  nodes: Record<number, BNode>;
  root: number;
  next: number;
  pagesWritten: number;
  readsByWrites: number;
}
export interface BResult { tree: BTree; wrote: number[]; path: number[]; note: string; found: boolean | null }

export function bEmpty(): BTree {
  return { nodes: { 1: { id: 1, leaf: true, keys: [], kids: [] } }, root: 1, next: 2, pagesWritten: 0, readsByWrites: 0 };
}

function bClone(t: BTree): BTree {
  const nodes: Record<number, BNode> = {};
  for (const id in t.nodes) {
    const n = t.nodes[id];
    nodes[id] = { id: n.id, leaf: n.leaf, keys: [...n.keys], kids: [...n.kids] };
  }
  return { ...t, nodes };
}

/** Child index for key k: keys at or above a separator go to its right. */
const childIndex = (n: BNode, k: number) => n.keys.filter((s) => s <= k).length;

export function bPath(t: BTree, k: number): number[] {
  const path = [t.root];
  let n = t.nodes[t.root];
  while (!n.leaf) {
    n = t.nodes[n.kids[childIndex(n, k)]];
    path.push(n.id);
  }
  return path;
}

export function bLeaves(t: BTree): BNode[] {
  const out: BNode[] = [];
  const walk = (id: number) => {
    const n = t.nodes[id];
    if (n.leaf) out.push(n);
    else n.kids.forEach(walk);
  };
  walk(t.root);
  return out;
}

export const bKeys = (t: BTree) => bLeaves(t).flatMap((l) => l.keys);
export const bHeight = (t: BTree) => bPath(t, 0).length;
export const bPages = (t: BTree) => Object.keys(t.nodes).length;
/** Slots in leaf pages. Index pages are left out: with hundreds of keys per
 *  page they are a fraction of a percent of a real tree. */
export const bLeafSlots = (t: BTree) => bLeaves(t).length * LEAF_CAP;

export function bApply(t0: BTree, op: Op): BResult {
  const t = bClone(t0);
  const path = bPath(t, op.k);
  const pathText = path.map((id) => `p${id}`).join(" → ");
  const leaf = t.nodes[path[path.length - 1]];
  const has = leaf.keys.includes(op.k);

  if (op.kind === "get") {
    return {
      tree: t, wrote: [], path, found: has,
      note: `reads ${pathText} (${path.length} page${path.length > 1 ? "s" : ""}) and ${has ? `finds ${op.k} in leaf p${leaf.id}` : `finds no ${op.k} in leaf p${leaf.id}, so it isn't stored`}.`,
    };
  }

  t.readsByWrites += path.length;

  if (op.kind === "del") {
    if (!has) {
      return { tree: t, wrote: [], path, found: false, note: `reads ${pathText} to find leaf p${leaf.id}, sees no ${op.k} there, and writes nothing.` };
    }
    leaf.keys = leaf.keys.filter((x) => x !== op.k);
    t.pagesWritten += 1;
    return {
      tree: t, wrote: [leaf.id], path, found: true,
      note: `reads ${pathText}, removes ${op.k} from leaf p${leaf.id} in place, and writes that page back: 1 page. Like Postgres, it doesn't merge a part-empty page with its neighbour.`,
    };
  }

  // put
  if (has) {
    t.pagesWritten += 1;
    return {
      tree: t, wrote: [leaf.id], path, found: true,
      note: `finds ${op.k} already in leaf p${leaf.id}, overwrites its value in place, and writes the whole page back: 1 page for one changed value.`,
    };
  }

  const rightmost = path.every((id, i) => i === path.length - 1 || t.nodes[id].kids[t.nodes[id].kids.length - 1] === path[i + 1]);
  leaf.keys = [...leaf.keys, op.k].sort((a, b) => a - b);
  const wrote = new Set<number>([leaf.id]);

  if (leaf.keys.length <= LEAF_CAP) {
    t.pagesWritten += 1;
    return { tree: t, wrote: [leaf.id], path, found: null, note: `walks ${pathText}, finds room in leaf p${leaf.id}, and writes it: 1 page.` };
  }

  const parts: string[] = [];
  let node = leaf;
  let level = path.length - 1;
  while (node.keys.length > LEAF_CAP) {
    const right: BNode = { id: t.next++, leaf: node.leaf, keys: [], kids: [] };
    let sep: number;
    if (node.leaf) {
      const full = list(node.keys);
      const atEdge = rightmost && op.k === node.keys[node.keys.length - 1];
      const cut = atEdge ? LEAF_CAP : Math.ceil(node.keys.length / 2);
      right.keys = node.keys.slice(cut);
      node.keys = node.keys.slice(0, cut);
      sep = right.keys[0];
      parts.push(
        atEdge
          ? `Leaf p${node.id} overflows with ${full}. It's the rightmost leaf and ${op.k} is the largest key yet, so, like Postgres, it keeps p${node.id} full at ${list(node.keys)} and starts new page p${right.id} with ${list(right.keys)}.`
          : `Leaf p${node.id} overflows with ${full}, so it splits: ${list(node.keys)} stay, ${list(right.keys)} move to new page p${right.id}.`,
      );
    } else {
      const mid = 2;
      sep = node.keys[mid];
      right.keys = node.keys.slice(mid + 1);
      right.kids = node.kids.slice(mid + 1);
      node.keys = node.keys.slice(0, mid);
      node.kids = node.kids.slice(0, mid + 1);
      parts.push(`That gives p${node.id} four separators, one too many, so it splits as well: ${list(node.keys)} stay, ${list(right.keys)} go to new page p${right.id}, and ${sep} moves up.`);
    }
    t.nodes[right.id] = right;
    wrote.add(right.id);

    if (level === 0) {
      const root: BNode = { id: t.next++, leaf: false, keys: [sep], kids: [node.id, right.id] };
      t.nodes[root.id] = root;
      t.root = root.id;
      wrote.add(root.id);
      parts.push(`There was no parent, so a new root p${root.id} holds separator ${sep} and the tree is one level taller.`);
      break;
    }
    const parent = t.nodes[path[level - 1]];
    const idx = parent.kids.indexOf(node.id);
    parent.kids.splice(idx + 1, 0, right.id);
    parent.keys.splice(idx, 0, sep);
    wrote.add(parent.id);
    if (node.leaf) parts.push(`Separator ${sep} is copied up into p${parent.id} so searches can find p${right.id}.`);
    node = parent;
    level -= 1;
  }
  t.pagesWritten += wrote.size;
  parts.push(`${wrote.size} pages written for one key.`);
  return { tree: t, wrote: [...wrote], path, found: null, note: parts.join(" ") };
}

/* ------------------------------------------------------------------ */
/* LSM tree                                                            */
/* ------------------------------------------------------------------ */

export interface Entry { k: number; seq: number; tomb: boolean }
export interface SFile { id: number; entries: Entry[]; m: number; bits: number }
export interface Run { files: SFile[] } // sorted and non-overlapping inside a run
export interface Lsm {
  mem: Entry[]; // one entry per key, sorted
  l0: Run[]; // newest first, one file each
  l1: Run[]; // newest first; leveled keeps exactly one
  next: number;
  flushWritten: number;
  compactWritten: number;
}
export type ProbeResult = "bloom" | "hit" | "miss";
export interface Probe { file: number; level: 0 | 1; result: ProbeResult; checked: number[] }
export interface LResult {
  lsm: Lsm;
  created: number[];
  probes: Probe[];
  reads: number;
  note: string;
  found: boolean | null;
}

export function lEmpty(): Lsm {
  return { mem: [], l0: [], l1: [], next: 1, flushWritten: 0, compactWritten: 0 };
}

/** 32-bit mixer (the murmur3 finaliser), seeded per hash function. */
export function hash(k: number, i: number): number {
  let x = (Math.imul(k, 0x9e3779b1) + Math.imul(i + 1, 0x85ebca77)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export const bloomPositions = (k: number, m: number) => Array.from({ length: BLOOM_HASHES }, (_, i) => hash(k, i) % m);

export function makeFile(id: number, entries: Entry[]): SFile {
  const m = Math.max(8, BLOOM_BITS_PER_KEY * entries.length);
  let bits = 0;
  for (const e of entries) for (const p of bloomPositions(e.k, m)) bits |= 1 << p;
  return { id, entries, m, bits };
}

export const bloomMaybe = (f: SFile, k: number) => bloomPositions(k, f.m).every((p) => (f.bits >> p) & 1);
const fMin = (f: SFile) => f.entries[0].k;
const fMax = (f: SFile) => f.entries[f.entries.length - 1].k;
const range = (f: SFile) => (fMin(f) === fMax(f) ? `${fMin(f)}` : `${fMin(f)}–${fMax(f)}`);
const overlaps = (a: SFile, b: SFile) => fMin(a) <= fMax(b) && fMin(b) <= fMax(a);
const fileList = (fs: SFile[]) => fs.map((f) => `F${f.id}`).join(", ");

function lClone(l: Lsm): Lsm {
  return { ...l, mem: [...l.mem], l0: l0Copy(l.l0), l1: l0Copy(l.l1) };
}
const l0Copy = (rs: Run[]) => rs.map((r) => ({ files: [...r.files] }));

/** Every stored entry, newest place first: memtable, L0, then L1. */
function allEntries(l: Lsm): Entry[] {
  return [...l.mem, ...l.l0.flatMap((r) => r.files.flatMap((f) => f.entries)), ...l.l1.flatMap((r) => r.files.flatMap((f) => f.entries))];
}

export function lNewest(l: Lsm): Map<number, Entry> {
  const m = new Map<number, Entry>();
  for (const e of allEntries(l)) {
    const cur = m.get(e.k);
    if (!cur || e.seq > cur.seq) m.set(e.k, e);
  }
  return m;
}

export function lKeys(l: Lsm): number[] {
  return [...lNewest(l).values()].filter((e) => !e.tomb).map((e) => e.k).sort((a, b) => a - b);
}

/** Stored entries split into live values, stale versions and tombstones. */
export function lSpace(l: Lsm) {
  const newest = lNewest(l);
  let live = 0, stale = 0, tombs = 0;
  for (const e of allEntries(l)) {
    const isNewest = newest.get(e.k)?.seq === e.seq;
    if (!isNewest) stale += 1;
    else if (e.tomb) tombs += 1;
    else live += 1;
  }
  return { total: live + stale + tombs, live, stale, tombs };
}

export function isStale(l: Lsm, e: Entry): boolean {
  return lNewest(l).get(e.k)?.seq !== e.seq;
}

/** Merge runs: newest version of each key wins; tombstones go only at the bottom. */
function merge(files: SFile[], dropTombs: boolean) {
  const best = new Map<number, Entry>();
  let inCount = 0;
  for (const f of files) for (const e of f.entries) {
    inCount += 1;
    const cur = best.get(e.k);
    if (!cur || e.seq > cur.seq) best.set(e.k, e);
  }
  const kept = [...best.values()].sort((a, b) => a.k - b.k);
  const out = dropTombs ? kept.filter((e) => !e.tomb) : kept;
  return { out, inCount, stale: inCount - kept.length, tombsDropped: kept.length - out.length };
}

function chunk(l: Lsm, entries: Entry[]): SFile[] {
  const files: SFile[] = [];
  for (let i = 0; i < entries.length; i += FILE_CAP) files.push(makeFile(l.next++, entries.slice(i, i + FILE_CAP)));
  return files;
}

const pairwiseDisjoint = (fs: SFile[]) => fs.every((a, i) => fs.every((b, j) => i === j || !overlaps(a, b)));

function mergeSummary(m: ReturnType<typeof merge>, outFiles: SFile[]) {
  const drops: string[] = [];
  if (m.stale) drops.push(`${m.stale} stale version${m.stale > 1 ? "s" : ""}`);
  if (m.tombsDropped) drops.push(`${m.tombsDropped} tombstone${m.tombsDropped > 1 ? "s" : ""}`);
  return `${m.inCount} entries in${drops.length ? `, ${drops.join(" and ")} dropped` : ""}, ${m.out.length} rewritten${outFiles.length ? ` as ${fileList(outFiles)}` : ""}.`;
}

function compact(l: Lsm, style: Style, created: number[]): string[] {
  const notes: string[] = [];
  if (l.l0.length < L0_TRIGGER) return notes;
  const l0Files = l.l0.flatMap((r) => r.files);
  const lo = Math.min(...l0Files.map(fMin));
  const hi = Math.max(...l0Files.map(fMax));

  if (style === "leveled") {
    const run = l.l1[0] ?? { files: [] };
    const hit = run.files.filter((f) => fMax(f) >= lo && fMin(f) <= hi);
    const rest = run.files.filter((f) => !hit.includes(f));
    if (hit.length === 0 && pairwiseDisjoint(l0Files)) {
      l.l1 = [{ files: [...rest, ...l0Files].sort((a, b) => fMin(a) - fMin(b)) }];
      l.l0 = [];
      notes.push(`L0 has ${l0Files.length} files, which starts a compaction. They overlap neither each other nor anything in L1, so they move down untouched (a trivial move): 0 entries rewritten.`);
      return notes;
    }
    const m = merge([...l0Files, ...hit], true);
    const outFiles = chunk(l, m.out);
    created.push(...outFiles.map((f) => f.id));
    l.compactWritten += m.out.length;
    l.l1 = [{ files: [...rest, ...outFiles].sort((a, b) => fMin(a) - fMin(b)) }];
    l.l0 = [];
    notes.push(
      `L0 has ${l0Files.length} files covering ${lo}–${hi}, which starts a leveled compaction. ${hit.length ? `L1 files ${fileList(hit)} overlap that range, so they're read and rewritten whole along with L0, including keys nobody touched` : "Nothing in L1 overlaps, but the L0 files overlap each other, so they're merged"}: ${mergeSummary(m, outFiles)}`,
    );
    return notes;
  }

  // tiered: L0's runs become one new run in L1; existing L1 runs are left alone
  const bottom = l.l1.length === 0;
  if (pairwiseDisjoint(l0Files)) {
    l.l1 = [{ files: [...l0Files].sort((a, b) => fMin(a) - fMin(b)) }, ...l.l1];
    l.l0 = [];
    notes.push(`L0 has ${l0Files.length} files, which starts a tiered merge. They don't overlap, so they move down as one new run in L1 with nothing rewritten. L1 now holds ${l.l1.length} run${l.l1.length > 1 ? "s" : ""}.`);
  } else {
    const m = merge(l0Files, bottom);
    const outFiles = chunk(l, m.out);
    created.push(...outFiles.map((f) => f.id));
    l.compactWritten += m.out.length;
    l.l1 = [{ files: outFiles }, ...l.l1];
    l.l0 = [];
    notes.push(
      `L0 has ${l0Files.length} files, which starts a tiered merge. They merge into one new run in L1, and the older L1 runs aren't touched: ${mergeSummary(m, outFiles)}${!bottom ? " Tombstones stay, because older runs beneath may still hold the keys they delete." : ""} L1 now holds ${l.l1.length} run${l.l1.length > 1 ? "s" : ""}.`,
    );
  }
  if (l.l1.length >= TIERED_L1_RUNS) {
    const files = l.l1.flatMap((r) => r.files);
    const m = merge(files, true);
    const outFiles = chunk(l, m.out);
    created.push(...outFiles.map((f) => f.id));
    l.compactWritten += m.out.length;
    l.l1 = outFiles.length ? [{ files: outFiles }] : [];
    notes.push(`That's ${TIERED_L1_RUNS} runs in L1, so they all merge into one. Nothing older exists, so tombstones can finally go: ${mergeSummary(m, outFiles)}`);
  }
  return notes;
}

export function lApply(l0: Lsm, op: Op, seq: number, style: Style, bloom: boolean): LResult {
  const l = lClone(l0);
  const created: number[] = [];

  if (op.kind === "get") {
    const inMem = l.mem.find((e) => e.k === op.k);
    if (inMem) {
      return {
        lsm: l, created, probes: [], reads: 0, found: !inMem.tomb,
        note: inMem.tomb
          ? `finds a tombstone for ${op.k} in the memtable, in RAM, so the key is deleted. 0 files read.`
          : `finds ${op.k} in the memtable, in RAM. 0 files read.`,
      };
    }
    const probes: Probe[] = [];
    const steps: string[] = ["checks the memtable (no)"];
    let reads = 0;
    let found: boolean | null = false;
    let foundAt = "";
    const runs: [Run, 0 | 1][] = [...l.l0.map((r) => [r, 0] as [Run, 0]), ...l.l1.map((r) => [r, 1] as [Run, 1])];
    let rangeSkips = 0;
    outer: for (const [run, level] of runs) {
      const f = run.files.find((x) => fMin(x) <= op.k && op.k <= fMax(x));
      if (!f) { rangeSkips += 1; continue; }
      const checked = bloomPositions(op.k, f.m);
      if (bloom && !bloomMaybe(f, op.k)) {
        probes.push({ file: f.id, level, result: "bloom", checked });
        steps.push(`F${f.id}'s bloom filter says no, so it's skipped`);
        continue;
      }
      reads += 1;
      const e = f.entries.find((x) => x.k === op.k);
      if (e) {
        probes.push({ file: f.id, level, result: "hit", checked });
        found = !e.tomb;
        foundAt = e.tomb ? `reads F${f.id} and meets a tombstone, so ${op.k} is deleted` : `reads F${f.id} and finds ${op.k}`;
        break outer;
      }
      probes.push({ file: f.id, level, result: "miss", checked });
      steps.push(bloom ? `F${f.id}'s filter says maybe, but reading it finds nothing (a false positive)` : `reads F${f.id} and finds nothing`);
    }
    if (!foundAt) found = false;
    const tail = foundAt || `concludes ${op.k} isn't stored`;
    const skip = rangeSkips ? ` ${rangeSkips} run${rangeSkips > 1 ? "s were" : " was"} ruled out by key range alone.` : "";
    return {
      lsm: l, created, probes, reads, found,
      note: `${[...steps, tail].join(", then ")}. ${reads} file${reads === 1 ? "" : "s"} read.${skip}`,
    };
  }

  const entry: Entry = { k: op.k, seq, tomb: op.kind === "del" };
  const had = l.mem.some((e) => e.k === op.k);
  l.mem = [...l.mem.filter((e) => e.k !== op.k), entry].sort((a, b) => a.k - b.k);
  const notes = [
    op.kind === "del"
      ? `writes a tombstone for ${op.k} into the memtable${had ? ", replacing the entry there" : ""}. It doesn't look to see whether ${op.k} exists, and nothing is read.`
      : `puts ${op.k} into the memtable in RAM${had ? ", replacing the older entry there" : ""}. Nothing is read and nothing reaches disk yet.`,
  ];

  if (l.mem.length >= MEM_CAP) {
    const f = makeFile(l.next++, l.mem);
    l.l0 = [{ files: [f] }, ...l.l0];
    l.flushWritten += f.entries.length;
    created.push(f.id);
    l.mem = [];
    notes.push(`The memtable is full, so it's flushed as SSTable F${f.id} in L0 covering ${range(f)}: ${f.entries.length} entries written in one sequential file.`);
    notes.push(...compact(l, style, created));
  }
  return { lsm: l, created, probes: [], reads: 0, found: null, note: notes.join(" ") };
}

/* ------------------------------------------------------------------ */
/* Replay and presets                                                  */
/* ------------------------------------------------------------------ */

export interface World {
  b: BTree;
  l: Lsm;
  userWrites: number;
  last: { op: Op; b: BResult; l: LResult } | null;
  lastGet: { op: Op; b: BResult; l: LResult } | null;
}

export function replay(ops: Op[], style: Style, bloom: boolean): World {
  let b = bEmpty();
  let l = lEmpty();
  let userWrites = 0;
  let last: World["last"] = null;
  let lastGet: World["lastGet"] = null;
  ops.forEach((op, i) => {
    const br = bApply(b, op);
    const lr = lApply(l, op, i + 1, style, bloom);
    b = br.tree;
    l = lr.lsm;
    if (op.kind !== "get") userWrites += 1;
    last = { op, b: br, l: lr };
    if (op.kind === "get") lastGet = last;
  });
  return { b, l, userWrites, last, lastGet };
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

function randomKeys(seed: number, n: number): number[] {
  const r = mulberry32(seed);
  const pool = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

const P = (k: number): Op => ({ kind: "put", k });
const D = (k: number): Op => ({ kind: "del", k });

export const PRESETS: Record<"seq" | "rand" | "churn", { label: string; ops: Op[] }> = {
  seq: { label: "Sequential", ops: Array.from({ length: 14 }, (_, i) => P(i + 1)) },
  rand: { label: "Random", ops: randomKeys(7, 14).map(P) },
  churn: {
    label: "Updates & deletes",
    ops: [P(12), P(47), P(5), P(33), P(81), P(20), P(64), P(9), P(47), D(33), D(81), D(40), P(70), P(12)],
  },
};
export type PresetId = keyof typeof PRESETS;

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

const fmt = (x: number) => (Number.isFinite(x) ? `${x.toFixed(1)}×` : "–");
const mono = "font-[family-name:var(--font-jetbrains)]";

function Segmented<T extends string | boolean>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-line-2 p-0.5 text-[13px]">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn("rounded-md px-2.5 py-1.5 transition-colors", value === v ? "bg-ink text-bg" : "text-muted hover:text-ink")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Meter({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "data" | "dist" }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 px-3 py-2">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</div>
      <div className={cn("tnum font-[family-name:var(--font-serif)] text-[24px] font-semibold leading-tight", tone === "data" ? "text-data" : "text-dist")}>{value}</div>
      <div className="text-[12.5px] leading-snug text-muted">{detail}</div>
    </div>
  );
}

const SLOT = 19, NODE_H = 24, GAP = 7, ROW = 58, PAD = 8;
const NODE_W = SLOT * LEAF_CAP;

function TreeSvg({ t, wrote, path }: { t: BTree; wrote: number[]; path: number[] }) {
  const leaves = bLeaves(t);
  const pos: Record<number, { x: number; y: number }> = {};
  leaves.forEach((n, i) => { pos[n.id] = { x: PAD + i * (NODE_W + GAP), y: 0 }; });
  const height = bHeight(t);
  const place = (id: number, depth: number): number => {
    const n = t.nodes[id];
    if (n.leaf) { pos[id].y = PAD + depth * ROW; return pos[id].x; }
    const xs = n.kids.map((c) => place(c, depth + 1));
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    pos[id] = { x, y: PAD + depth * ROW };
    return x;
  };
  place(t.root, 0);
  const W = Math.max(PAD * 2 + leaves.length * (NODE_W + GAP) - GAP, 200);
  const H = PAD * 2 + (height - 1) * ROW + NODE_H + 12;
  const ids = Object.keys(t.nodes).map(Number);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ maxHeight: 260 }} role="img" aria-label={`B+tree with ${ids.length} pages and height ${height}`}>
      {ids.map((id) => {
        const n = t.nodes[id];
        if (n.leaf) return null;
        return n.kids.map((c, i) => {
          const onPath = path.includes(id) && path.includes(c);
          return (
            <line
              key={`${id}-${c}`}
              x1={pos[id].x + i * SLOT} y1={pos[id].y + NODE_H}
              x2={pos[c].x + NODE_W / 2} y2={pos[c].y}
              className={onPath ? "stroke-lab" : "stroke-line-2"} strokeWidth={onPath ? 2 : 1}
            />
          );
        });
      })}
      {leaves.slice(0, -1).map((n, i) => (
        <line key={`r${n.id}`} x1={pos[n.id].x + NODE_W} y1={pos[n.id].y + NODE_H / 2} x2={pos[leaves[i + 1].id].x} y2={pos[n.id].y + NODE_H / 2} className="stroke-line-2" strokeDasharray="2 2" />
      ))}
      {ids.map((id) => {
        const n = t.nodes[id];
        const p = pos[id];
        const isNew = wrote.includes(id);
        const onPath = path.includes(id);
        return (
          <g key={id}>
            <rect
              x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={3}
              className={cn(isNew ? "fill-data/15 stroke-data" : onPath ? "fill-lab/10 stroke-lab" : n.leaf ? "fill-bg stroke-line-2" : "fill-surface-2 stroke-line-2")}
              strokeWidth={isNew || onPath ? 2 : 1}
            />
            {Array.from({ length: LEAF_CAP - 1 }, (_, i) => (
              <line key={i} x1={p.x + (i + 1) * SLOT} y1={p.y} x2={p.x + (i + 1) * SLOT} y2={p.y + NODE_H} className="stroke-line" />
            ))}
            {n.keys.map((k, i) => (
              <text key={i} x={p.x + i * SLOT + SLOT / 2} y={p.y + NODE_H / 2 + 4} textAnchor="middle" className={cn("fill-ink", n.leaf ? "" : "fill-muted")} style={{ fontSize: 12, fontFamily: "var(--font-jetbrains)" }}>
                {k}
              </text>
            ))}
            <text x={p.x + NODE_W / 2} y={p.y + NODE_H + 10} textAnchor="middle" className="fill-faint" style={{ fontSize: 8.5, fontFamily: "var(--font-jetbrains)" }}>
              p{id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BloomBits({ f, checked }: { f: SFile; checked?: number[] }) {
  return (
    <svg viewBox={`0 0 ${f.m * 5} 5`} className="mt-1 block h-[5px]" style={{ width: f.m * 5 }} aria-hidden>
      {Array.from({ length: f.m }, (_, i) => (
        <rect
          key={i} x={i * 5 + 0.5} y={0.5} width={4} height={4}
          className={cn((f.bits >> i) & 1 ? "fill-dist" : "fill-line", checked?.includes(i) && "stroke-lab")}
          strokeWidth={checked?.includes(i) ? 1 : 0}
        />
      ))}
    </svg>
  );
}

function EntryChip({ e, stale }: { e: Entry; stale: boolean }) {
  return (
    <span
      title={e.tomb ? `tombstone for ${e.k}` : stale ? `stale version of ${e.k}` : `${e.k}`}
      className={cn(
        "tnum inline-block min-w-[1.6em] rounded px-1 text-center text-[12px]",
        mono,
        e.tomb ? "bg-machine/15 text-machine line-through" : "bg-surface-2 text-ink",
        stale && "opacity-40",
      )}
    >
      {e.k}
    </span>
  );
}

function FileCard({ f, l, isNew, probe, bloomOn }: { f: SFile; l: Lsm; isNew: boolean; probe?: Probe; bloomOn: boolean }) {
  const r = probe?.result;
  return (
    <div
      className={cn(
        "rounded-md border px-1.5 py-1",
        isNew ? "border-dist bg-dist/10" : r === "hit" ? "border-lab bg-lab/10" : r === "miss" ? "border-lab border-dashed" : r === "bloom" ? "border-line opacity-60" : "border-line bg-bg/40",
      )}
    >
      <div className={cn("flex items-baseline justify-between gap-2 text-[10.5px] text-faint", mono)}>
        <span>F{f.id}</span>
        <span>{range(f)}</span>
      </div>
      <div className="mt-0.5 flex gap-0.5">
        {f.entries.map((e) => <EntryChip key={`${e.k}-${e.seq}`} e={e} stale={isStale(l, e)} />)}
      </div>
      {bloomOn && <BloomBits f={f} checked={probe?.checked} />}
      {r && (
        <div className={cn("mt-0.5 text-[10.5px]", r === "bloom" ? "text-faint" : "text-lab")}>
          {r === "bloom" ? "bloom: no, skipped" : r === "hit" ? "read: found" : bloomOn ? "read: false positive" : "read: not here"}
        </div>
      )}
    </div>
  );
}

function LsmView({ l, created, probes, bloomOn, style }: { l: Lsm; created: number[]; probes: Probe[]; bloomOn: boolean; style: Style }) {
  const probeOf = (id: number) => probes.find((p) => p.file === id);
  const level = (name: string, sub: string, runs: Run[]) => (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-ink">{name}</span>
        <span className="text-[11.5px] text-faint">{sub}</span>
      </div>
      {runs.length === 0 ? (
        <div className="rounded-md border border-dashed border-line px-2 py-1.5 text-[12px] text-faint">empty</div>
      ) : (
        <div className="space-y-1.5">
          {runs.map((run, i) => (
            <div key={i} className="flex flex-wrap items-start gap-1.5">
              {runs.length > 1 && <span className={cn("pt-1 text-[10.5px] text-faint", mono)}>run {i + 1}</span>}
              {run.files.map((f) => <FileCard key={f.id} f={f} l={l} isNew={created.includes(f.id)} probe={probeOf(f.id)} bloomOn={bloomOn} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[12px] font-semibold text-ink">Memtable</span>
          <span className="text-[11.5px] text-faint">RAM · flushes at {MEM_CAP}</span>
        </div>
        <div className="flex min-h-[30px] flex-wrap items-center gap-0.5 rounded-md border border-line bg-surface-2/60 px-1.5 py-1">
          {l.mem.length === 0 ? <span className="text-[12px] text-faint">empty</span> : l.mem.map((e) => <EntryChip key={`${e.k}-${e.seq}`} e={e} stale={false} />)}
          {Array.from({ length: MEM_CAP - l.mem.length }, (_, i) => <span key={i} className="inline-block h-[18px] w-[1.6em] rounded border border-dashed border-line" />)}
        </div>
      </div>
      {level("L0", "newest first · files may overlap", l.l0)}
      {level("L1", style === "leveled" ? "one sorted run · files don't overlap" : `up to ${TIERED_L1_RUNS} runs, newest first`, l.l1)}
    </div>
  );
}

export function StorageLab() {
  const [preset, setPreset] = useState<PresetId>("seq");
  const [style, setStyle] = useState<Style>("leveled");
  const [bloom, setBloom] = useState(true);
  const [ops, setOps] = useState<Op[]>([]);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [custom, setCustom] = useState("");

  const w = useMemo(() => replay(ops, style, bloom), [ops, style, bloom]);
  const queue = PRESETS[preset].ops;
  const full = ops.length >= MAX_OPS;
  const atEnd = pos >= queue.length;

  const push = (op: Op) => setOps((o) => (o.length >= MAX_OPS ? o : [...o, op]));
  const step = () => {
    if (atEnd || full) return;
    push(queue[pos]);
    setPos((p) => p + 1);
  };
  const reset = (p: PresetId = preset) => { setPreset(p); setOps([]); setPos(0); setPlaying(false); };

  useEffect(() => {
    if (!playing) return;
    if (pos >= queue.length || ops.length >= MAX_OPS) { setPlaying(false); return; }
    const id = setTimeout(() => {
      setOps((o) => [...o, queue[pos]]);
      setPos((p) => p + 1);
    }, 750);
    return () => clearTimeout(id);
  }, [playing, pos, queue, ops.length]);

  const k = Number(custom);
  const valid = Number.isInteger(k) && k >= 1 && k <= 99 && !full;
  const doCustom = (kind: OpKind) => { if (valid) push({ kind, k }); };

  const last = w.last;
  const getShown = last?.op.kind === "get" ? last : null;
  const bWrote = last && last.op.kind !== "get" ? last.b.wrote : [];
  const bPathShown = getShown ? getShown.b.path : [];
  const created = last && last.op.kind !== "get" ? last.l.created : [];
  const probes = getShown ? getShown.l.probes : [];

  const liveKeys = bKeys(w.b).length;
  const bPagesN = bPages(w.b);
  const bSlotsWritten = w.b.pagesWritten * LEAF_CAP;
  const lWritten = w.l.flushWritten + w.l.compactWritten;
  const sp = lSpace(w.l);
  const lg = w.lastGet;

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · two storage engines, one stream of keys</div>
          <div className="text-[14px] text-muted">Each click sends the next operation to both engines.</div>
        </div>
        <Segmented label="Key sequence" value={preset} onChange={(p) => reset(p)} options={(Object.keys(PRESETS) as PresetId[]).map((p) => [p, PRESETS[p].label])} />
      </div>

      <div className="space-y-3 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-center gap-1" aria-label="Upcoming operations">
          {queue.map((o, i) => (
            <span
              key={i}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11.5px]", mono,
                i < pos ? "text-faint line-through decoration-line-2" : i === pos ? "bg-accent-soft text-ink ring-1 ring-accent" : "text-muted",
              )}
            >
              {o.kind === "del" ? `del ${o.k}` : o.k}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={step} disabled={atEnd || full} className="rounded-lg bg-ink px-3 py-1.5 text-[13.5px] font-medium text-bg transition-opacity disabled:opacity-40">
            {atEnd ? "Sequence done" : `Step: ${opText(queue[pos])}`}
          </button>
          <button onClick={() => setPlaying((p) => !p)} disabled={atEnd || full} className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2 disabled:opacity-40">
            {playing ? "Pause" : "Run"}
          </button>
          <button onClick={() => reset()} className="rounded-lg px-2 py-1.5 text-[13.5px] text-faint underline decoration-line-2 underline-offset-2 hover:text-ink">
            Reset
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <label htmlFor="storage-lab-key" className="text-[13px] text-muted">Key</label>
            <input
              id="storage-lab-key" type="number" min={1} max={99} inputMode="numeric" value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doCustom("get"); }}
              placeholder="1–99"
              className={cn("w-[4.5em] rounded-md border border-line-2 bg-bg px-2 py-1 text-[13px] text-ink", mono)}
            />
            {(["put", "del", "get"] as OpKind[]).map((kind) => (
              <button key={kind} onClick={() => doCustom(kind)} disabled={!valid} className="rounded-md border border-line-2 px-2 py-1 text-[13px] text-ink hover:bg-surface-2 disabled:opacity-40">
                {kind === "put" ? "Put" : kind === "del" ? "Delete" : "Look up"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-faint">LSM compaction</span>
            <Segmented label="Compaction style" value={style} onChange={setStyle} options={[["leveled", "Leveled"], ["tiered", "Tiered"]]} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-faint">Bloom filters</span>
            <Segmented label="Bloom filters" value={bloom} onChange={setBloom} options={[[true, "On"], [false, "Off"]]} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-data/40 p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-data">B+tree</span>
            <span className="text-[12px] text-faint">{LEAF_CAP} keys per page · {bPagesN} pages · height {bHeight(w.b)}</span>
          </div>
          <TreeSvg t={w.b} wrote={bWrote} path={bPathShown} />
          <div className="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-1">
            <Meter tone="data" label="Write amp" value={fmt(bSlotsWritten / w.userWrites)}
              detail={`${w.b.pagesWritten} pages × ${LEAF_CAP} slots = ${bSlotsWritten} for ${w.userWrites} writes; ${w.b.readsByWrites} pages read to find where`} />
            <Meter tone="data" label="Last lookup" value={lg ? `${lg.b.path.length} read${lg.b.path.length === 1 ? "" : "s"}` : "–"}
              detail={lg ? `look up ${lg.op.k}: one page per level` : "Look up a key to count reads"} />
            <Meter tone="data" label="Space amp" value={fmt(bLeafSlots(w.b) / liveKeys)}
              detail={`${bLeafSlots(w.b)} slots in ${bLeaves(w.b).length} leaf pages for ${liveKeys} live keys`} />
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-dist/40 p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-dist">LSM tree</span>
            <span className="text-[12px] text-faint">{style} · {FILE_CAP} entries per SSTable</span>
          </div>
          <LsmView l={w.l} created={created} probes={probes} bloomOn={bloom} style={style} />
          <div className="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-1">
            <Meter tone="dist" label="Write amp" value={fmt(lWritten / w.userWrites)}
              detail={`flushes ${w.l.flushWritten} + compaction ${w.l.compactWritten} = ${lWritten} entries for ${w.userWrites} writes; 0 read`} />
            <Meter tone="dist" label="Last lookup" value={lg ? `${lg.l.reads} read${lg.l.reads === 1 ? "" : "s"}` : "–"}
              detail={lg ? `look up ${lg.op.k}${bloom ? `; ${lg.l.probes.filter((p) => p.result === "bloom").length} skipped by bloom` : ""}` : "Look up a key to count reads"} />
            <Meter tone="dist" label="Space amp" value={fmt(sp.total / liveKeys)}
              detail={`${sp.total} entries held for ${liveKeys} live keys: ${sp.stale} stale, ${sp.tombs} tombstone${sp.tombs === 1 ? "" : "s"}`} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-faint">
            <span><span className={cn("rounded bg-machine/15 px-1 text-machine line-through", mono)}>9</span> tombstone</span>
            <span><span className={cn("rounded bg-surface-2 px-1 text-ink opacity-40", mono)}>9</span> stale version</span>
            {bloom && <span>dots: the file&apos;s bloom filter bits</span>}
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4" aria-live="polite">
        {last ? (
          <div className="space-y-1.5 text-[14.5px] leading-relaxed text-ink">
            <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Step {ops.length}: {opText(last.op)}</div>
            <p><span className="font-semibold text-data">B+tree</span> {last.b.note}</p>
            <p><span className="font-semibold text-dist">LSM</span> {last.l.note}</p>
          </div>
        ) : (
          <div className="min-h-[3.2em] text-[14.5px] leading-relaxed text-ink">
            Press Step to send key {queue[0].k} to both engines. Watch which pages the B+tree rewrites, and when the LSM tree&apos;s memtable fills up.
          </div>
        )}
        {full && <div className="mt-2 text-[13.5px] text-machine">That&apos;s {MAX_OPS} operations, as much as this lab draws clearly. Reset to start again.</div>}
      </div>
    </div>
  );
}

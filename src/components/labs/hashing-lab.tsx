"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/* Forty-eight keys on a hash ring. Add or remove a node and the lab counts
   exactly which keys change owner, under the ring, under hash mod N and under
   rendezvous hashing, so the three can be compared on the same change. A
   slider gives each node more tokens (virtual nodes) and a bar chart shows
   the shares evening out. Everything below the PURE markers is deterministic
   and exported so it can be tested without React. */

/* PURE START */

export type Scheme = "ring" | "mod" | "hrw";

export const NODE_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];
export const KEYS = Array.from({ length: 48 }, (_, i) => `user:${i + 1}`);
export const VNODE_STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 100, 128, 160, 200];
export const MIN_NODES = 2;

/** 32-bit FNV-1a over the string's UTF-16 code units. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** MurmurHash3's finaliser. FNV-1a alone leaves similar strings ("user:41",
 *  "user:42") close together in the high bits; this scrambles them apart. */
export function fmix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const hash32 = (s: string): number => fmix32(fnv1a(s));
export const toDeg = (h: number): number => (h / 2 ** 32) * 360;
export const KEY_HASH = KEYS.map(hash32);

export interface Token { pos: number; node: string; i: number }

/** Every node gets `vnodes` tokens, placed by hashing "node-A#0", "node-A#1"… */
export function buildRing(nodes: string[], vnodes: number): Token[] {
  const ring: Token[] = [];
  for (const node of nodes)
    for (let i = 0; i < vnodes; i++) ring.push({ pos: hash32(`node-${node}#${i}`), node, i });
  return ring.sort((a, b) => a.pos - b.pos || (a.node < b.node ? -1 : 1));
}

/** Index of the first token at or after h, wrapping to 0: binary search. */
export function successorIndex(ring: Token[], h: number): number {
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ring[mid].pos < h) lo = mid + 1;
    else hi = mid;
  }
  return lo === ring.length ? 0 : lo;
}

export const ringOwner = (ring: Token[], h: number): string => ring[successorIndex(ring, h)].node;

/** hash mod N over the node list in name order. */
export const modOwner = (nodes: string[], h: number): string => nodes[h % nodes.length];

/** Rendezvous (highest random weight): score every node, keep the highest. */
export function hrwOwner(nodes: string[], key: string): string {
  let best = nodes[0];
  let top = -1;
  for (const n of nodes) {
    const s = hash32(`${key}|${n}`);
    if (s > top) { top = s; best = n; }
  }
  return best;
}

export function assign(scheme: Scheme, nodes: string[], vnodes: number, keys = KEYS, hashes = KEY_HASH): string[] {
  if (scheme === "mod") return hashes.map((h) => modOwner(nodes, h));
  if (scheme === "hrw") return keys.map((k) => hrwOwner(nodes, k));
  const ring = buildRing(nodes, vnodes);
  return hashes.map((h) => ringOwner(ring, h));
}

/** Fraction of the circle each node owns: the arc from the previous token up to each of its tokens. */
export function ringShares(ring: Token[], nodes: string[]): number[] {
  const share = new Map(nodes.map((n) => [n, 0]));
  for (let j = 0; j < ring.length; j++) {
    const prev = ring[(j - 1 + ring.length) % ring.length].pos;
    const len = (ring[j].pos - prev + 2 ** 32) % 2 ** 32;
    share.set(ring[j].node, (share.get(ring[j].node) ?? 0) + len / 2 ** 32);
  }
  return nodes.map((n) => share.get(n) ?? 0);
}

export function maxOverMean(v: number[]): number {
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return mean === 0 ? 0 : Math.max(...v) / mean;
}

export const movedIdx = (before: string[], after: string[]): number[] =>
  before.flatMap((o, i) => (o !== after[i] ? [i] : []));

/** Add the first unused name, keeping the list in name order. */
export function addNode(nodes: string[]): { nodes: string[]; node: string } | null {
  const node = NODE_NAMES.find((n) => !nodes.includes(n));
  if (!node) return null;
  return { node, nodes: NODE_NAMES.filter((n) => n === node || nodes.includes(n)) };
}

export const removeNode = (nodes: string[], node: string): string[] => nodes.filter((n) => n !== node);

/** "3 from A, 2 from C", counting moves by the node they came from or went to. */
function breakdown(names: string[], dir: "from" | "to"): string {
  const c = new Map<string, number>();
  for (const n of names) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([n, k]) => `${k} ${dir} ${n}`).join(", ");
}

const deg = (h: number) => `${Math.round(toDeg(h))}°`;
const keysWord = (k: number) => (k === 1 ? "1 key" : `${k} keys`);
function nameList(idx: number[]): string {
  const names = idx.map((i) => KEYS[i]);
  return names.length <= 5 ? names.join(", ") : `${names.slice(0, 4).join(", ")} and ${names.length - 4} more`;
}

export type Ev =
  | { kind: "add" | "remove"; node: string; prev: string[] }
  | { kind: "vnodes"; prevV: number };

/** The narration line for the last event, in the voice of the selected scheme. */
export function describe(ev: Ev, nodes: string[], vnodes: number, scheme: Scheme): string {
  if (ev.kind === "vnodes") {
    const now = maxOverMean(ringShares(buildRing(nodes, vnodes), nodes));
    const was = maxOverMean(ringShares(buildRing(nodes, ev.prevV), nodes));
    const t = vnodes === 1 ? "1 token" : `${vnodes} tokens`;
    return `Each node now has ${t}, ${nodes.length * vnodes} on the ring. The busiest node owns ${now.toFixed(2)}× the mean share, ${now <= was ? "down" : "up"} from ${was.toFixed(2)}× with ${ev.prevV}. Re-placing every token is a reconfiguration rather than a join, so the move counts start fresh.`;
  }
  const { node, prev } = ev;
  const before = assign(scheme, prev, vnodes);
  const after = assign(scheme, nodes, vnodes);
  const moved = movedIdx(before, after);
  const k = moved.length;
  const add = ev.kind === "add";

  if (scheme === "mod") {
    const between = moved.filter((i) => before[i] !== node && after[i] !== node).length;
    return `Under hash mod N a key's owner is the node at position (hash mod N) in the list. Going from ${prev.length} to ${nodes.length} nodes changes that remainder for most keys: ${k} of ${KEYS.length} moved, and ${between} of them moved between two nodes that were there all along.`;
  }
  if (scheme === "hrw") {
    if (add)
      return `Rendezvous hashing scores every node for each key and keeps the highest score. ${node}'s new score beat the old winner for ${keysWord(k)}, and ${k === 1 ? "it" : "they all"} moved to ${node}. Every other key kept its winner, so nothing else moved.`;
    return `${node}'s ${keysWord(k)} each fall to their second-highest scorer (${breakdown(moved.map((i) => after[i]), "to")}). Keys ${node} didn't win still have the same winner, so they stay where they are.`;
  }

  const modK = movedIdx(assign("mod", prev, vnodes), assign("mod", nodes, vnodes)).length;
  const tail = ` For comparison, hash mod N moved ${modK} of ${KEYS.length} on the same change.`;
  const newRing = buildRing(nodes, vnodes);
  const oldRing = buildRing(prev, vnodes);

  if (add && vnodes === 1) {
    const j = newRing.findIndex((t) => t.node === node);
    const tok = newRing[j];
    const pred = newRing[(j - 1 + newRing.length) % newRing.length];
    const old = ringOwner(oldRing, tok.pos);
    const body = k === 0
      ? `No key happens to sit in that arc, so nothing moves at all.`
      : `That's ${keysWord(k)} (${nameList(moved)}), and ${k === 1 ? "it moves" : "they all move"} from ${old} to ${node}.`;
    return `Node ${node} joins at ${deg(tok.pos)}. The token before it, going anticlockwise, is ${pred.node}'s at ${deg(pred.pos)}, so the keys between ${deg(pred.pos)} and ${deg(tok.pos)} now meet ${node} first instead of ${old}. ${body} Every other key meets the same token as before.${tail}`;
  }
  if (add)
    return `Node ${node} joins with ${vnodes} tokens. Each token cuts into the arc it lands in and takes the keys between it and the token before it. ${keysWord(k)} moved, every one to ${node}${k ? ` (${breakdown(moved.map((i) => before[i]), "from")})` : ""}. No key moved between two old nodes.${tail}`;
  if (vnodes === 1) {
    const mine = oldRing.findIndex((t) => t.node === node);
    const tok = oldRing[mine];
    const succ = oldRing[(mine + 1) % oldRing.length];
    return `Node ${node} leaves, taking its token at ${deg(tok.pos)}. Its keys walk on clockwise to the next token, ${succ.node}'s at ${deg(succ.pos)}. ${keysWord(k)} moved, exactly the ones ${node} held, all to ${succ.node}. No other key's first token changed.${tail}`;
  }
  return `Node ${node} leaves with its ${vnodes} tokens. Each of its arcs joins the next token clockwise, so its ${keysWord(k)} spread out (${breakdown(moved.map((i) => after[i]), "to")}). Keys ${node} didn't hold stay put.${tail}`;
}

export interface Bulk { n: number; moved: Record<Scheme, number> | null; ideal: number | null; ringMaxMean: number }

/** The same comparison on n generated keys, to show the 48-key result isn't luck. */
export function bulkStats(ev: Ev | null, nodes: string[], vnodes: number, n = 100_000): Bulk {
  const keys = Array.from({ length: n }, (_, i) => `key:${i}`);
  const hashes = keys.map(hash32);
  const now = (s: Scheme) => assign(s, nodes, vnodes, keys, hashes);
  const ringNow = now("ring");
  const counts = new Map(nodes.map((x) => [x, 0]));
  for (const o of ringNow) counts.set(o, (counts.get(o) ?? 0) + 1);
  const ringMaxMean = maxOverMean(nodes.map((x) => counts.get(x) ?? 0));
  if (!ev || ev.kind === "vnodes") return { n, moved: null, ideal: null, ringMaxMean };
  const frac = (s: Scheme, after: string[]) =>
    movedIdx(assign(s, ev.prev, vnodes, keys, hashes), after).length / n;
  return {
    n,
    ringMaxMean,
    ideal: ev.kind === "add" ? 1 / nodes.length : 1 / ev.prev.length,
    moved: { ring: frac("ring", ringNow), mod: frac("mod", now("mod")), hrw: frac("hrw", now("hrw")) },
  };
}

/* PURE END */

const COLOR: Record<string, { v: string; bg: string; text: string; border: string }> = {
  A: { v: "var(--color-os)", bg: "bg-os", text: "text-os", border: "border-os/50" },
  B: { v: "var(--color-conc)", bg: "bg-conc", text: "text-conc", border: "border-conc/50" },
  C: { v: "var(--color-data)", bg: "bg-data", text: "text-data", border: "border-data/50" },
  D: { v: "var(--color-dist)", bg: "bg-dist", text: "text-dist", border: "border-dist/50" },
  E: { v: "var(--color-machine)", bg: "bg-machine", text: "text-machine", border: "border-machine/50" },
  F: { v: "var(--color-cloud)", bg: "bg-cloud", text: "text-cloud", border: "border-cloud/50" },
  G: { v: "var(--color-ops)", bg: "bg-ops", text: "text-ops", border: "border-ops/50" },
  H: { v: "var(--color-lab)", bg: "bg-lab", text: "text-lab", border: "border-lab/50" },
};

const SCHEMES: { id: Scheme; label: string }[] = [
  { id: "ring", label: "Ring" },
  { id: "mod", label: "hash mod N" },
  { id: "hrw", label: "Rendezvous" },
];

const C = 180;
const polar = (r: number, d: number): [number, number] => {
  const a = (d * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};
function arcPath(r: number, d0: number, d1: number): string {
  const span = (d1 - d0 + 360) % 360 || 360;
  if (span >= 359.99) {
    const [x, y] = polar(r, d0);
    const [x2, y2] = polar(r, d0 + 180);
    return `M${x} ${y}A${r} ${r} 0 1 1 ${x2} ${y2}A${r} ${r} 0 1 1 ${x} ${y}`;
  }
  const [x0, y0] = polar(r, d0);
  const [x1, y1] = polar(r, d0 + span);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

interface S { nodes: string[]; vnodes: number; scheme: Scheme; ev: Ev | null; bulk: Bulk | null }
const fresh = (): S => ({ nodes: ["A", "B", "C", "D"], vnodes: 1, scheme: "ring", ev: null, bulk: null });
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function HashingLab() {
  const [s, setS] = useState<S>(fresh);
  const { nodes, vnodes, scheme, ev } = s;

  const ring = useMemo(() => buildRing(nodes, vnodes), [nodes, vnodes]);
  const shares = useMemo(() => ringShares(ring, nodes), [ring, nodes]);
  const owners = useMemo(() => assign(scheme, nodes, vnodes), [scheme, nodes, vnodes]);
  const counts = useMemo(() => {
    const own = assign("ring", nodes, vnodes);
    return nodes.map((n) => own.filter((o) => o === n).length);
  }, [nodes, vnodes]);

  const membership = ev && ev.kind !== "vnodes" ? ev : null;
  const movedBy = useMemo(() => {
    if (!membership) return null;
    const out = {} as Record<Scheme, { idx: number[]; before: string[] }>;
    for (const sc of ["ring", "mod", "hrw"] as Scheme[]) {
      const before = assign(sc, membership.prev, vnodes);
      out[sc] = { idx: movedIdx(before, assign(sc, nodes, vnodes)), before };
    }
    return out;
  }, [membership, nodes, vnodes]);
  const moved = new Set(movedBy?.[scheme].idx ?? []);

  // Merge adjacent same-owner arcs so 1,600 tokens draw as a few hundred paths.
  const arcs = useMemo(() => {
    const out: { d0: number; d1: number; node: string }[] = [];
    for (let j = 0; j < ring.length; j++) {
      const d0 = toDeg(ring[(j - 1 + ring.length) % ring.length].pos);
      const d1 = toDeg(ring[j].pos);
      const last = out[out.length - 1];
      if (last && last.node === ring[j].node) last.d1 = d1;
      else out.push({ d0, d1, node: ring[j].node });
    }
    if (out.length > 1 && out[0].node === out[out.length - 1].node) {
      out[0].d0 = out[out.length - 1].d0;
      out.pop();
    }
    return out;
  }, [ring]);

  const ratio = maxOverMean(shares);
  const scale = Math.max(2, ratio); // bar width as a multiple of a fair share
  const add = addNode(nodes);
  const narration = ev
    ? describe(ev, nodes, vnodes, scheme)
    : "Each dot is one of 48 keys, coloured by the first node token you meet walking clockwise from it. Add node E and watch which dots change colour.";

  const doAdd = () => setS((x) => {
    const r = addNode(x.nodes);
    return r ? { ...x, nodes: r.nodes, ev: { kind: "add", node: r.node, prev: x.nodes }, bulk: null } : x;
  });
  const doRemove = (n: string) => setS((x) =>
    x.nodes.length <= MIN_NODES ? x : { ...x, nodes: removeNode(x.nodes, n), ev: { kind: "remove", node: n, prev: x.nodes }, bulk: null });
  const setV = (v: number) => setS((x) => (v === x.vnodes ? x : { ...x, vnodes: v, ev: { kind: "vnodes", prevV: x.vnodes }, bulk: null }));

  const vIndex = VNODE_STEPS.indexOf(vnodes);
  const showLabels = scheme === "ring" && vnodes === 1;

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · count the keys that move</div>
          <div className="text-[14px] text-muted">48 keys, placed by a real 32-bit hash. Add or remove a node and see who changes owner.</div>
        </div>
        <div className="flex rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Assignment scheme">
          {SCHEMES.map((sc) => (
            <button
              key={sc.id}
              onClick={() => setS((x) => ({ ...x, scheme: sc.id }))}
              aria-pressed={scheme === sc.id}
              className={cn("rounded-md px-3 py-1.5 transition-colors", scheme === sc.id ? "bg-ink text-bg" : "text-muted hover:text-ink")}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div>
          <svg viewBox="0 0 360 360" className="mx-auto block w-full max-w-[420px]" role="img"
            aria-label={`Hash ring with ${nodes.length} nodes and ${KEYS.length} keys, coloured by owner under ${SCHEMES.find((x) => x.id === scheme)?.label}`}>
            <circle cx={C} cy={C} r={128} fill="none" stroke="var(--color-line-2)" strokeWidth={1} />
            {scheme === "ring" && arcs.map((a, i) => (
              <path key={i} d={arcPath(128, a.d0, a.d1)} fill="none" stroke={COLOR[a.node].v} strokeWidth={9} strokeOpacity={0.55} />
            ))}
            {scheme === "ring" && ring.map((t) => {
              const d = toDeg(t.pos);
              const [x0, y0] = polar(134, d);
              const [x1, y1] = polar(vnodes > 32 ? 140 : 148, d);
              return <line key={`${t.node}${t.i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke={COLOR[t.node].v} strokeWidth={vnodes > 32 ? 1 : 2} />;
            })}
            {showLabels && ring.map((t) => {
              const [x, y] = polar(162, toDeg(t.pos));
              return (
                <text key={t.node} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}
                  fill={COLOR[t.node].v} style={{ fontFamily: "var(--font-jetbrains)" }}>
                  {t.node}
                </text>
              );
            })}
            {KEYS.map((k, i) => {
              const [x, y] = polar(i % 2 ? 104 : 116, toDeg(KEY_HASH[i]));
              const m = moved.has(i);
              return (
                <g key={k}>
                  <title>{`${k} at ${Math.round(toDeg(KEY_HASH[i]))}°, owner ${owners[i]}${m && movedBy ? ` (was ${movedBy[scheme].before[i]})` : ""}`}</title>
                  {m && <circle cx={x} cy={y} r={8} fill="none" stroke="var(--color-ink)" strokeWidth={1.75} />}
                  <circle cx={x} cy={y} r={m ? 5 : 4} fill={COLOR[owners[i]].v} />
                </g>
              );
            })}
            <text x={C} y={C - 10} textAnchor="middle" fontSize={30} fontWeight={600} fill="var(--color-ink)" style={{ fontFamily: "var(--font-serif)" }}>
              {movedBy ? movedBy[scheme].idx.length : "–"}
            </text>
            <text x={C} y={C + 14} textAnchor="middle" fontSize={11.5} fill="var(--color-faint)">
              {movedBy ? `of ${KEYS.length} keys moved` : "keys moved"}
            </text>
          </svg>
          <p className="mt-2 text-center text-[12.5px] text-faint">
            {scheme === "ring"
              ? "Coloured band: the arc each node owns. Ticks: tokens. Circled dots: keys that just moved."
              : "Keys keep their hash positions, but the ring plays no part in who owns them."}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Nodes</div>
            <div className="flex flex-wrap gap-2">
              {nodes.map((n) => (
                <span key={n} className={cn("inline-flex items-center gap-1.5 rounded-lg border py-1 pl-2.5 pr-1 text-[13.5px]", COLOR[n].border)}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", COLOR[n].bg)} aria-hidden />
                  <span className="font-[family-name:var(--font-jetbrains)] font-semibold text-ink">{n}</span>
                  <button
                    onClick={() => doRemove(n)}
                    disabled={nodes.length <= MIN_NODES}
                    aria-label={`Remove node ${n}`}
                    className="rounded px-1.5 text-faint hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={doAdd}
                disabled={!add}
                className="rounded-lg bg-ink px-3 py-1 text-[13.5px] font-medium text-bg transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
              >
                {add ? `Add node ${add.node}` : "Ring is full"}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">
              Keys moved by the last change{membership ? ` (${membership.prev.length} → ${nodes.length} nodes)` : ""}
            </div>
            <div className="space-y-1.5">
              {SCHEMES.map((sc) => {
                const k = movedBy?.[sc.id].idx.length;
                return (
                  <div key={sc.id} className="grid grid-cols-[6.5rem_1fr_3.2rem] items-center gap-2 text-[13px]">
                    <span className={cn(scheme === sc.id ? "font-semibold text-ink" : "text-muted")}>{sc.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${((k ?? 0) / KEYS.length) * 100}%` }} />
                    </span>
                    <span className="tnum text-right text-ink">{k ?? "–"}<span className="text-faint">/{KEYS.length}</span></span>
                  </div>
                );
              })}
              {membership && (
                <div className="text-[12.5px] text-faint">
                  Least possible: the {membership.kind === "add" ? "new node's" : "leaving node's"} fair share, about{" "}
                  {Math.round(KEYS.length / (membership.kind === "add" ? nodes.length : membership.prev.length))} keys.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Ring share per node</span>
              <span className="tnum text-[12.5px] text-muted">busiest ÷ mean <span className="font-semibold text-ink">{ratio.toFixed(2)}</span></span>
            </div>
            <div className="space-y-1">
              {nodes.map((n, i) => (
                <div key={n} className="grid grid-cols-[1.2rem_1fr_6.2rem] items-center gap-2 text-[12.5px]">
                  <span className={cn("font-[family-name:var(--font-jetbrains)] font-semibold", COLOR[n].text)}>{n}</span>
                  <span className="relative h-3 rounded bg-surface-2">
                    <span className={cn("block h-full rounded opacity-80", COLOR[n].bg)} style={{ width: `${(shares[i] * nodes.length * 100) / scale}%` }} />
                    <span className="absolute inset-y-[-2px] w-px bg-ink/60" style={{ left: `${100 / scale}%` }} aria-hidden />
                  </span>
                  <span className="tnum text-right text-muted">{pct(shares[i])} · {counts[i]} keys</span>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[12px] text-faint">The thin line marks a fair share, 1/{nodes.length} of the circle.</div>
          </div>

          <label className="block">
            <span className="mb-1 flex items-baseline justify-between text-[13px]">
              <span className="text-muted">Virtual nodes (tokens) per node</span>
              <span className="tnum font-semibold text-ink">{vnodes}</span>
            </span>
            <input
              type="range"
              min={0}
              max={VNODE_STEPS.length - 1}
              step={1}
              value={vIndex}
              onChange={(e) => setV(VNODE_STEPS[Number(e.target.value)])}
              aria-valuetext={`${vnodes} tokens per node`}
              className="w-full accent-[var(--color-accent)]"
            />
            <span className="flex justify-between text-[11.5px] text-faint"><span>1</span><span>200</span></span>
          </label>
        </div>
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="min-h-[3.2em] text-[14.5px] leading-relaxed text-ink">{narration}</div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            onClick={() => setS((x) => ({ ...x, bulk: bulkStats(x.ev, x.nodes, x.vnodes) }))}
            className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2"
          >
            Repeat with 100,000 keys
          </button>
          <button onClick={() => setS(fresh())} className="text-[13px] text-faint underline decoration-line-2 underline-offset-2 hover:text-ink">
            Reset
          </button>
          {s.bulk && (
            <span className="tnum text-[13.5px] text-muted">
              {s.bulk.moved
                ? <>Moved: ring {pct(s.bulk.moved.ring)}, mod N {pct(s.bulk.moved.mod)}, rendezvous {pct(s.bulk.moved.hrw)} <span className="text-faint">(least possible {pct(s.bulk.ideal ?? 0)})</span>. </>
                : null}
              Ring busiest ÷ mean: {s.bulk.ringMaxMean.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

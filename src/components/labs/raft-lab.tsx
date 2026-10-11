"use client";

import { useEffect, useReducer, useState } from "react";
import { cn } from "@/lib/utils";

/* Five Raft servers and every message between them, delivered one at a time.
   The reader is the network: deliver a message, drop it, crash a server, or
   cut the cluster in two, and the narration names the rule from the Raft
   paper (Ongaro & Ousterhout, 2014, Figure 2) that decided what happened.

   Everything below the UI line is pure and deterministic, so it can be tested
   for the two safety properties: at most one leader per term, and a committed
   entry is never lost. */

/* ───────────────────────── model ───────────────────────── */

export const N = 5;
export const MAJORITY = 3;

export type Role = "follower" | "candidate" | "leader";
export interface Entry { term: number; cmd: string }
export interface Server {
  id: number;
  up: boolean;
  role: Role;
  term: number; // currentTerm (on disk)
  votedFor: number | null; // on disk
  log: Entry[]; // on disk; index i lives at log[i - 1]
  commitIndex: number; // volatile
  votes: number[]; // candidate only: who granted a vote this term
  nextIndex: number[]; // leader only
  matchIndex: number[]; // leader only
  leaderId: number | null;
}

interface Base { id: number; from: number; to: number; term: number }
export type Msg =
  | (Base & { type: "RV"; lastLogIndex: number; lastLogTerm: number })
  | (Base & { type: "RVR"; granted: boolean })
  | (Base & { type: "AE"; prevLogIndex: number; prevLogTerm: number; entries: Entry[]; leaderCommit: number })
  | (Base & { type: "AER"; success: boolean; prevLogIndex: number; matchIndex: number; lastIndex: number });
type NewMsg<M = Msg> = M extends Msg ? Omit<M, "id"> : never;

export interface Note { rule: string; text: string; aside?: string }
export interface Opts {
  /** Break the election restriction: voters skip the up-to-date log check. */
  skipUpToDate?: boolean;
  /** Break the Figure 8 rule: a leader commits older-term entries by counting replicas. */
  countOldTerms?: boolean;
}
export interface State {
  servers: Server[];
  msgs: Msg[];
  nextMsgId: number;
  side: number[]; // partition side per server; equal sides can talk
  committed: number[]; // committed[i - 1] = term of the entry committed at index i
  leaders: Record<number, number>; // term -> leader
  violations: string[];
  stats: { elections: number; leaders: number; commits: number; overwritten: number };
  cmdCounter: number;
  opts: Opts;
  note: Note | null;
}

export type Action =
  | { kind: "deliver"; id: number }
  | { kind: "drop"; id: number }
  | { kind: "duplicate"; id: number }
  | { kind: "timeout"; s: number }
  | { kind: "heartbeat"; s: number }
  | { kind: "client"; s: number; cmd?: string }
  | { kind: "crash"; s: number }
  | { kind: "restart"; s: number }
  | { kind: "side"; s: number }
  | { kind: "partition"; side: number[] }
  | { kind: "heal" };

export const nm = (i: number) => `S${i + 1}`;
const ids = Array.from({ length: N }, (_, i) => i);
const lastIndex = (s: Server) => s.log.length;
export const termAt = (s: Server, i: number) => (i === 0 ? 0 : (s.log[i - 1]?.term ?? -1));
const lastTerm = (s: Server) => termAt(s, s.log.length);
const ent = (i: number, t: number) => `${i}·t${t}`;
const logEnd = (i: number, t: number) => (i === 0 ? "an empty log" : `a log ending at ${ent(i, t)}`);
const names = (xs: number[]) =>
  xs.length <= 1 ? xs.map(nm).join("") : `${xs.slice(0, -1).map(nm).join(", ")} and ${nm(xs[xs.length - 1])}`;

export function makeServer(id: number, p: Partial<Server> = {}): Server {
  return {
    id, up: true, role: "follower", term: 0, votedFor: null, log: [], commitIndex: 0, votes: [],
    nextIndex: Array(N).fill(1), matchIndex: Array(N).fill(0), leaderId: null, ...p,
  };
}

export function makeState(servers: Server[], p: Partial<State> = {}): State {
  return {
    servers, msgs: [], nextMsgId: 1, side: Array(N).fill(0), committed: [], leaders: {}, violations: [],
    stats: { elections: 0, leaders: 0, commits: 0, overwritten: 0 }, cmdCounter: 0, opts: {}, note: null, ...p,
  };
}

function clone(st: State): State {
  return {
    ...st,
    servers: st.servers.map((s) => ({
      ...s, log: s.log.slice(), votes: s.votes.slice(), nextIndex: s.nextIndex.slice(), matchIndex: s.matchIndex.slice(),
    })),
    msgs: st.msgs.slice(), side: st.side.slice(), committed: st.committed.slice(), leaders: { ...st.leaders },
    violations: st.violations.slice(), stats: { ...st.stats },
  };
}

const say = (st: State, rule: string, text: string) => { st.note = { rule, text }; };
function violation(st: State, text: string) {
  if (!st.violations.includes(text) && st.violations.length < 30) st.violations.push(text);
}

const reachable = (st: State, a: number, b: number) => st.servers[b].up && st.side[a] === st.side[b];

function send(st: State, m: NewMsg): boolean {
  if (!reachable(st, m.from, m.to)) return false;
  st.msgs.push({ ...m, id: st.nextMsgId++ } as Msg);
  return true;
}

function sendAE(st: State, l: Server, f: number): boolean {
  const prev = l.nextIndex[f] - 1;
  return send(st, {
    type: "AE", from: l.id, to: f, term: l.term, prevLogIndex: prev, prevLogTerm: termAt(l, prev),
    entries: l.log.slice(prev), leaderCommit: l.commitIndex,
  });
}

/** Sends AppendEntries to every follower; returns who couldn't be reached. */
function broadcastAE(st: State, l: Server): number[] {
  return ids.filter((f) => f !== l.id && !sendAE(st, l, f));
}

const unreachableNote = (st: State, out: number[]) => {
  if (out.length === 0) return "";
  const down = out.filter((i) => !st.servers[i].up);
  const cut = out.filter((i) => st.servers[i].up);
  const parts: string[] = [];
  if (down.length) parts.push(`${names(down)} ${down.length === 1 ? "is" : "are"} down`);
  if (cut.length) parts.push(`${names(cut)} ${cut.length === 1 ? "is" : "are"} on the other side of the partition`);
  return ` ${parts.join(", and ")}, so ${out.length === 1 ? "that copy goes" : "those copies go"} nowhere.`;
};

function commitTo(st: State, s: Server, upto: number) {
  if (upto <= s.commitIndex) return;
  for (let i = 1; i <= upto; i++) {
    const t = termAt(s, i);
    const c = st.committed[i - 1];
    if (c === undefined) { st.committed[i - 1] = t; st.stats.commits++; }
    else if (c !== t) violation(st, `Index ${i} was committed twice, as t${c} and as t${t}.`);
  }
  s.commitIndex = upto;
}

function becomeLeader(st: State, s: Server) {
  const prev = st.leaders[s.term];
  if (prev !== undefined && prev !== s.id) violation(st, `Two leaders in term ${s.term}: ${nm(prev)} and ${nm(s.id)}.`);
  st.leaders[s.term] = s.id;
  st.committed.forEach((t, i) => {
    if (termAt(s, i + 1) !== t) violation(st, `${nm(s.id)} became leader of term ${s.term} without committed entry ${ent(i + 1, t)}.`);
  });
  s.role = "leader";
  s.leaderId = s.id;
  s.nextIndex = Array(N).fill(lastIndex(s) + 1);
  s.matchIndex = Array(N).fill(0);
  s.matchIndex[s.id] = lastIndex(s);
  st.stats.leaders++;
  return broadcastAE(st, s);
}

/** The leader's commit rule: the highest index stored on a majority, but only
 *  if that entry is from the leader's own term (Raft §5.4.2, Figure 8). */
function advanceCommit(st: State, l: Server): string {
  let best = 0;
  for (let n = lastIndex(l); n > l.commitIndex; n--) {
    if (l.matchIndex.filter((m) => m >= n).length >= MAJORITY) { best = n; break; }
  }
  if (best === 0) {
    const n = l.commitIndex + 1;
    if (n > lastIndex(l)) return "";
    const have = l.matchIndex.filter((m) => m >= n).length;
    return ` Entry ${n} is on ${have} of ${N} servers. It needs ${MAJORITY} before ${nm(l.id)} can commit it.`;
  }
  const t = termAt(l, best);
  if (t === l.term || st.opts.countOldTerms) {
    const from = l.commitIndex + 1;
    commitTo(st, l, best);
    const span = from === best ? `entry ${best}` : `entries ${from} to ${best}`;
    return ` Entry ${ent(best, t)} is now on a majority and is from the current term, so ${nm(l.id)} commits ${span} and applies ${from === best ? "it" : "them"}.`;
  }
  return ` Entry ${ent(best, t)} is on a majority, but it was written in term ${t}, not the current term ${l.term}. ${nm(l.id)} doesn't count replicas of older-term entries (the Figure 8 rule). It will commit them once an entry from term ${l.term} reaches a majority.`;
}

function deliver(st: State, id: number) {
  const k = st.msgs.findIndex((m) => m.id === id);
  if (k < 0) return;
  const m = st.msgs[k];
  st.msgs.splice(k, 1);
  const r = st.servers[m.to];
  if (!reachable(st, m.from, m.to)) {
    say(st, "Lost", `${nm(m.to)} can't be reached, so message #${m.id} is lost.`);
    return;
  }

  let pre = "";
  if (m.term > r.term) {
    pre = `${nm(r.id)} sees term ${m.term}, newer than its own ${r.term}, so it adopts term ${m.term}${r.role !== "follower" ? ` and steps down from ${r.role} to follower` : ""}. `;
    r.term = m.term; r.votedFor = null; r.role = "follower"; r.votes = []; r.leaderId = null;
  }
  const me = nm(r.id), them = nm(m.from);

  if (m.type === "RV") {
    const reply = (granted: boolean) => send(st, { type: "RVR", from: r.id, to: m.from, term: r.term, granted });
    if (m.term < r.term) {
      reply(false);
      say(st, "Stale term", `${pre}${me} is at term ${r.term}, and ${them}'s request is for term ${m.term}. ${me} refuses and replies with its own term, which tells ${them} it's behind.`);
      return;
    }
    const upToDate = m.lastLogTerm > lastTerm(r) || (m.lastLogTerm === lastTerm(r) && m.lastLogIndex >= lastIndex(r));
    if (r.votedFor !== null && r.votedFor !== m.from) {
      reply(false);
      say(st, "One vote per term", `${pre}${me} already voted for ${r.votedFor === r.id ? "itself" : nm(r.votedFor)} in term ${r.term}, so it refuses ${them}. A server votes at most once per term.`);
    } else if (!upToDate && !st.opts.skipUpToDate) {
      reply(false);
      const why = m.lastLogTerm < lastTerm(r) ? "an older last term" : "the same last term but a shorter log";
      say(st, "Election restriction", `${pre}${me} has ${logEnd(lastIndex(r), lastTerm(r))}. ${them} has ${logEnd(m.lastLogIndex, m.lastLogTerm)}, which is less up-to-date (${why}). ${me} refuses, so a server missing entries can't become leader.`);
    } else {
      r.votedFor = m.from;
      reply(true);
      const skipped = !upToDate ? ` It skipped the up-to-date check: its own log is ahead of ${them}'s.` : ` ${them}'s log (${m.lastLogIndex === 0 ? "empty" : `ends at ${ent(m.lastLogIndex, m.lastLogTerm)}`}) is at least as up-to-date as its own (${lastIndex(r) === 0 ? "empty" : `ends at ${ent(lastIndex(r), lastTerm(r))}`}).`;
      say(st, "Vote granted", `${pre}${me} hasn't voted for anyone else in term ${r.term}, so it votes for ${them} and writes the vote to disk.${skipped}`);
    }
    return;
  }

  if (m.type === "RVR") {
    if (r.role !== "candidate" || m.term !== r.term) {
      const why = r.role === "leader" && m.term === r.term
        ? `${me} has already won term ${r.term}, so the extra vote changes nothing.`
        : m.term < r.term
          ? `This vote is for term ${m.term}, and ${me} has moved on to term ${r.term}, so it ignores it.`
          : `${me} is no longer a candidate, so it ignores the reply.`;
      say(st, "Stale reply", pre + why);
      return;
    }
    if (!m.granted) {
      say(st, "Vote refused", `${pre}${them} refused. ${me} has ${r.votes.length} of ${N} votes and needs ${MAJORITY}.`);
      return;
    }
    if (!r.votes.includes(m.from)) r.votes.push(m.from);
    if (r.votes.length >= MAJORITY) {
      const out = becomeLeader(st, r);
      say(st, "Majority wins", `${pre}${them} votes yes. ${me} has ${r.votes.length} votes out of ${N}, a majority, so it is leader of term ${r.term}. No one else can collect ${MAJORITY} votes in this term: each server votes once, and any two majorities share a server. ${me} sends AppendEntries to everyone at once as a heartbeat.${unreachableNote(st, out)}`);
    } else {
      say(st, "Vote counted", `${pre}${them} votes yes. ${me} has ${r.votes.length} of ${N} votes and needs ${MAJORITY}.`);
    }
    return;
  }

  if (m.type === "AE") {
    const reply = (success: boolean, matchIndex: number) =>
      send(st, { type: "AER", from: r.id, to: m.from, term: r.term, success, prevLogIndex: m.prevLogIndex, matchIndex, lastIndex: lastIndex(r) });
    if (m.term < r.term) {
      reply(false, 0);
      say(st, "Stale leader", `${pre}${me} is at term ${r.term}, and this AppendEntries is from term ${m.term}. ${me} rejects it and replies with term ${r.term}, which tells ${them} a newer term has started without it.`);
      return;
    }
    if (r.role === "leader") {
      violation(st, `Two leaders in term ${r.term}: ${me} and ${them}.`);
      return;
    }
    let lead = pre;
    if (r.role === "candidate") {
      r.role = "follower"; r.votes = [];
      lead += `${me} was a candidate in term ${r.term}, but ${them} already leads that term, so ${me} goes back to being a follower. `;
    }
    r.leaderId = m.from;

    const prev = m.prevLogIndex;
    if (prev > lastIndex(r) || termAt(r, prev) !== m.prevLogTerm) {
      reply(false, 0);
      const why = prev > lastIndex(r)
        ? `${me} has no entry at index ${prev} (its log ends at ${lastIndex(r)})`
        : `${me}'s entry ${prev} is from term ${termAt(r, prev)}, but the leader's is from term ${m.prevLogTerm}`;
      say(st, "Consistency check", `${lead}${why}, so it can't attach new entries after ${ent(prev, m.prevLogTerm)}. It rejects, and the leader will retry from an earlier index.`);
      return;
    }

    let cut = "";
    let added = 0;
    m.entries.forEach((e, k) => {
      const idx = prev + 1 + k;
      if (idx <= lastIndex(r)) {
        if (termAt(r, idx) === e.term) return;
        const gone = r.log.slice(idx - 1);
        st.stats.overwritten += gone.length;
        r.log = r.log.slice(0, idx - 1);
        cut = ` Entry ${idx} conflicts: ${me} holds ${gone[0].cmd} from term ${gone[0].term}, the leader has ${e.cmd} from term ${e.term}. ${me} deletes ${gone.length === 1 ? "that entry" : `that entry and the ${gone.length - 1} after it`} (${gone.map((g) => g.cmd).join(", ")}). Only uncommitted entries can ever conflict, so no client was told ${gone.length === 1 ? "it" : "they"} succeeded.`;
      }
      r.log.push(e);
      added++;
    });
    const newLast = prev + m.entries.length;
    const before = r.commitIndex;
    if (m.leaderCommit > r.commitIndex) commitTo(st, r, Math.max(r.commitIndex, Math.min(m.leaderCommit, newLast)));
    reply(true, newLast);

    const what = m.entries.length === 0
      ? `This AppendEntries carries no entries: it's a heartbeat. ${me}'s log matches the leader's at ${prev === 0 ? "the start" : ent(prev, m.prevLogTerm)}.`
      : added === 0
        ? `${me} already holds every entry in this message, so nothing changes.`
        : prev === 0
          ? `Nothing comes before these entries, so the consistency check passes and ${me} takes ${added === 1 ? "the new entry" : `all ${added}`}.`
          : `${me}'s entry ${prev} matches the leader's (${ent(prev, m.prevLogTerm)}), so it takes ${added === 1 ? "the new entry" : `${added} entries`} after it.`;
    const learned = r.commitIndex > before ? ` It learns from the leader that entries up to ${r.commitIndex} are committed and applies them.` : "";
    say(st, cut ? "Conflict: truncate" : m.entries.length === 0 ? "Heartbeat" : "Append", `${lead}${what}${cut}${learned}`);
    return;
  }

  // AER
  if (r.role !== "leader" || m.term !== r.term) {
    say(st, "Stale reply", pre + (r.role !== "leader" ? `${me} is no longer a leader, so it ignores the reply.` : `This reply belongs to term ${m.term}, and ${me} now leads term ${r.term}, so it ignores it.`));
    return;
  }
  const f = m.from;
  if (m.success) {
    r.matchIndex[f] = Math.max(r.matchIndex[f], m.matchIndex);
    r.nextIndex[f] = Math.max(r.nextIndex[f], m.matchIndex + 1);
    const has = m.matchIndex === 0 ? `${them} accepted. Its log is empty, like the leader's` : `${them} accepted. Its log now matches the leader's through index ${m.matchIndex}`;
    say(st, "Match index", `${has}, so matchIndex[${them}] = ${r.matchIndex[f]}.${advanceCommit(st, r)}`);
  } else {
    const target = Math.min(r.nextIndex[f], m.prevLogIndex, m.lastIndex + 1);
    r.nextIndex[f] = Math.max(r.matchIndex[f] + 1, target, 1);
    sendAE(st, r, f);
    say(st, "Back up and retry", `${them} rejected entries after index ${m.prevLogIndex}. ${me} lowers nextIndex[${them}] to ${r.nextIndex[f]} and sends AppendEntries again, starting there.`);
  }
}

function checkSafety(st: State) {
  for (const s of st.servers) {
    for (let i = 1; i <= s.commitIndex; i++) {
      if (termAt(s, i) !== st.committed[i - 1]) {
        violation(st, `${nm(s.id)} treats index ${i} as committed but holds a different entry there than the committed ${ent(i, st.committed[i - 1])}.`);
      }
    }
  }
}

export function apply(prev: State, a: Action): State {
  const st = clone(prev);
  switch (a.kind) {
    case "deliver": deliver(st, a.id); break;
    case "drop": {
      const m = st.msgs.find((x) => x.id === a.id);
      if (!m) break;
      st.msgs = st.msgs.filter((x) => x.id !== a.id);
      const after = {
        RV: `${nm(m.from)} has to win without that vote, or time out and try again in a higher term.`,
        RVR: `${nm(m.to)} never counts that vote.`,
        AE: `${nm(m.from)} will send it again with its next heartbeat. Nothing breaks, it's only slower.`,
        AER: `${nm(m.to)} doesn't learn what ${nm(m.from)} holds until a later reply gets through.`,
      }[m.type];
      say(st, "Message lost", `Message #${m.id} (${TYPE_NAME[m.type]} ${nm(m.from)}→${nm(m.to)}) is dropped by the network. ${after}`);
      break;
    }
    case "duplicate": {
      const m = st.msgs.find((x) => x.id === a.id);
      if (m) st.msgs.push({ ...m, id: st.nextMsgId++ });
      break;
    }
    case "timeout": {
      const s = st.servers[a.s];
      if (!s.up || s.role === "leader") break;
      s.term += 1; s.role = "candidate"; s.votedFor = s.id; s.votes = [s.id]; s.leaderId = null;
      st.stats.elections++;
      const out: number[] = [];
      for (const t of ids) {
        if (t !== s.id && !send(st, { type: "RV", from: s.id, to: t, term: s.term, lastLogIndex: lastIndex(s), lastLogTerm: lastTerm(s) })) out.push(t);
      }
      say(st, "Election timeout", `${nm(s.id)} heard from no leader before its timer ran out. It becomes a candidate, moves to term ${s.term}, votes for itself, and sends RequestVote to the others with its last entry (${lastIndex(s) === 0 ? "none, its log is empty" : ent(lastIndex(s), lastTerm(s))}).${unreachableNote(st, out)}`);
      break;
    }
    case "heartbeat": {
      const l = st.servers[a.s];
      if (!l.up || l.role !== "leader") break;
      const out = broadcastAE(st, l);
      say(st, "Heartbeat", `${nm(l.id)} sends AppendEntries to each follower, starting at that follower's nextIndex and carrying its commitIndex (${l.commitIndex}). A follower that's up to date gets no entries: that's a heartbeat.${unreachableNote(st, out)}`);
      break;
    }
    case "client": {
      const l = st.servers[a.s];
      if (!l.up || l.role !== "leader") break;
      st.cmdCounter += 1;
      const cmd = a.cmd ?? `x=${st.cmdCounter}`;
      l.log.push({ term: l.term, cmd });
      l.matchIndex[l.id] = lastIndex(l);
      const out = broadcastAE(st, l);
      say(st, "Client write", `A client sends ${cmd} to ${nm(l.id)}. The leader appends it at index ${lastIndex(l)}, tagged with its term (${ent(lastIndex(l), l.term)}), and sends AppendEntries to the followers. It isn't committed until a majority holds it.${unreachableNote(st, out)}`);
      break;
    }
    case "crash": {
      const s = st.servers[a.s];
      if (!s.up) break;
      s.up = false;
      st.msgs = st.msgs.filter((m) => m.to !== s.id);
      say(st, "Crash", `${nm(s.id)} crashes. Its term (${s.term}), its vote and its log are on disk and survive. Its role, commitIndex and any leader bookkeeping were in memory and are gone. Messages on their way to it are lost.`);
      break;
    }
    case "restart": {
      const s = st.servers[a.s];
      if (s.up) break;
      Object.assign(s, { up: true, role: "follower", commitIndex: 0, votes: [], leaderId: null, nextIndex: Array(N).fill(1), matchIndex: Array(N).fill(0) });
      say(st, "Restart", `${nm(s.id)} restarts as a follower, with the term, vote and log it saved on disk. Its commitIndex starts at 0 and comes back with the leader's next AppendEntries.`);
      break;
    }
    case "side":
    case "partition":
    case "heal": {
      if (a.kind === "side") st.side[a.s] = 1 - st.side[a.s];
      else if (a.kind === "partition") st.side = a.side.slice();
      else st.side = Array(N).fill(0);
      st.msgs = st.msgs.filter((m) => st.side[m.from] === st.side[m.to]);
      const a0 = ids.filter((i) => st.side[i] === 0), a1 = ids.filter((i) => st.side[i] === 1);
      if (a0.length === 0 || a1.length === 0) {
        st.side = Array(N).fill(0);
        say(st, "Network healed", "Every server can reach every other server again.");
      } else {
        say(st, "Partition", `The network splits: ${names(a0)} can't reach ${names(a1)}. Messages already crossing the cut are lost. Only a side with ${MAJORITY} or more servers can elect a leader or commit anything.`);
      }
      break;
    }
  }
  checkSafety(st);
  return st;
}

/* ─────────────── random runs, for the safety check ─────────────── */

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

export function randomAction(st: State, rnd: () => number, duplicates = true): Action | null {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const up = ids.filter((i) => st.servers[i].up);
  const down = ids.filter((i) => !st.servers[i].up);
  const leaders = up.filter((i) => st.servers[i].role === "leader");
  const others = up.filter((i) => st.servers[i].role !== "leader");
  const parted = st.side.some((x) => x !== st.side[0]);
  const choices: [number, () => Action][] = [];
  if (st.msgs.length) {
    choices.push([10, () => ({ kind: "deliver", id: pick(st.msgs).id })]);
    choices.push([1.2, () => ({ kind: "drop", id: pick(st.msgs).id })]);
    if (duplicates) choices.push([0.5, () => ({ kind: "duplicate", id: pick(st.msgs).id })]);
  }
  if (others.length) choices.push([1.2, () => ({ kind: "timeout", s: pick(others) })]);
  if (leaders.length) {
    choices.push([2, () => ({ kind: "heartbeat", s: pick(leaders) })]);
    choices.push([1.5, () => ({ kind: "client", s: pick(leaders) })]);
  }
  if (down.length < 2 && up.length) choices.push([0.3, () => ({ kind: "crash", s: pick(up) })]);
  if (down.length) choices.push([0.8, () => ({ kind: "restart", s: pick(down) })]);
  choices.push([0.25, () => ({ kind: "partition", side: ids.map(() => (rnd() < 0.5 ? 0 : 1)) })]);
  if (parted) choices.push([0.4, () => ({ kind: "heal" })]);
  const total = choices.reduce((x, c) => x + c[0], 0);
  let r = rnd() * total;
  for (const [w, f] of choices) { if ((r -= w) < 0) return f(); }
  return choices.length ? choices[choices.length - 1][1]() : null;
}

export interface FuzzResult { violations: string[]; elections: number; leaders: number; commits: number; overwritten: number }

export function fuzz(seed: number, steps: number, opts: Opts = {}): FuzzResult {
  const rnd = mulberry32(seed);
  let st = blankCluster(opts);
  for (let i = 0; i < steps; i++) {
    const a = randomAction(st, rnd);
    if (!a) break;
    st = apply(st, a);
  }
  return { violations: st.violations, ...st.stats };
}

/* ─────────────────────── scenarios ─────────────────────── */

export function blankCluster(opts: Opts = {}): State {
  return makeState(ids.map((i) => makeServer(i)), { opts });
}

const e = (term: number, cmd: string): Entry => ({ term, cmd });

export type ScriptStep =
  | (Action & { aside?: string })
  | { kind: "drain"; aside?: undefined }
  | { kind: "pick"; type: Msg["type"]; from: number; to: number; aside?: string };

export interface Scenario { id: string; label: string; intro: string; setup: (o: Opts) => State; script: ScriptStep[] }

export const SCENARIOS: Scenario[] = [
  {
    id: "election",
    label: "Election",
    intro: "Five servers start as followers at term 0 with empty logs. Nobody leads yet. Press Next step to let S1's election timer run out.",
    setup: (o) => blankCluster(o),
    script: [
      { kind: "timeout", s: 0 },
      { kind: "drain" },
      { kind: "client", s: 0, cmd: "x=1", aside: "That was the election. Now a write: a client sends x=1 to the leader." },
      { kind: "drain" },
      { kind: "heartbeat", s: 0, aside: "S1 has committed entry 1, but the followers haven't heard. The commitIndex rides on the next AppendEntries." },
      { kind: "drain" },
    ],
  },
  {
    id: "split",
    label: "Split vote",
    intro: "S3, the leader of term 1, has crashed. Four servers are left, each holding entry 1·t1. The timers of S1 and S4 are about to run out at almost the same moment.",
    setup: (o) => makeState(
      ids.map((i) => makeServer(i, { term: 1, votedFor: 2, log: [e(1, "x=1")], commitIndex: 1, up: i !== 2 })),
      { opts: o, committed: [1], leaders: { 1: 2 }, cmdCounter: 1 },
    ),
    script: [
      { kind: "timeout", s: 0 },
      { kind: "timeout", s: 3, aside: "Before any of S1's requests arrive, S4's timer runs out too. Both are candidates in term 2." },
      { kind: "pick", type: "RV", from: 0, to: 1, aside: "S2 hears from S1 first." },
      { kind: "pick", type: "RV", from: 3, to: 4, aside: "S5 hears from S4 first." },
      { kind: "drain" },
      { kind: "timeout", s: 3, aside: "Each candidate has 2 votes and needs 3, so nobody wins term 2. Raft picks each election timeout at random, so the next timers rarely fire together. This time S4's fires well ahead of S1's." },
      { kind: "drain" },
    ],
  },
  {
    id: "crash",
    label: "Leader crash",
    intro: "S1 leads term 1. Entry 2 (x=2) is on S1, S2 and S3, a majority, so S1 has committed it. S4 and S5 haven't received it, and the followers haven't yet heard that it's committed.",
    setup: (o) => makeState(
      [
        makeServer(0, { term: 1, votedFor: 0, role: "leader", leaderId: 0, log: [e(1, "x=1"), e(1, "x=2")], commitIndex: 2, nextIndex: [3, 3, 3, 2, 2], matchIndex: [2, 2, 2, 1, 1] }),
        makeServer(1, { term: 1, votedFor: 0, leaderId: 0, log: [e(1, "x=1"), e(1, "x=2")], commitIndex: 1 }),
        makeServer(2, { term: 1, votedFor: 0, leaderId: 0, log: [e(1, "x=1"), e(1, "x=2")], commitIndex: 1 }),
        makeServer(3, { term: 1, votedFor: 0, leaderId: 0, log: [e(1, "x=1")], commitIndex: 1 }),
        makeServer(4, { term: 1, votedFor: 0, leaderId: 0, log: [e(1, "x=1")], commitIndex: 1 }),
      ],
      { opts: o, committed: [1, 1], leaders: { 1: 0 }, cmdCounter: 2 },
    ),
    script: [
      { kind: "crash", s: 0 },
      { kind: "timeout", s: 4, aside: "S5's timer runs out first. Watch what S2 and S3 say to it." },
      { kind: "drain" },
      { kind: "timeout", s: 2, aside: "S5 can't win: any three servers include S2 or S3, and both hold entry 2. Next, S3's timer runs out." },
      { kind: "drain" },
      { kind: "client", s: 2, cmd: "x=3", aside: "S3 can't count entry 2 yet, because it's from term 1. A write in term 3 settles it." },
      { kind: "drain" },
      { kind: "restart", s: 0, aside: "S1 comes back." },
      { kind: "heartbeat", s: 2 },
      { kind: "drain" },
    ],
  },
  {
    id: "stale",
    label: "Stale leader",
    intro: "S1 leads term 2, and every server holds entries 1 and 2, both committed. Next, the network splits S1 and S2 away from the other three.",
    setup: (o) => makeState(
      ids.map((i) => makeServer(i, {
        term: 2, votedFor: 0, leaderId: 0, log: [e(1, "x=1"), e(2, "x=2")], commitIndex: 2,
        ...(i === 0 ? { role: "leader" as Role, nextIndex: [3, 3, 3, 3, 3], matchIndex: [2, 2, 2, 2, 2] } : {}),
      })),
      { opts: o, committed: [1, 2], leaders: { 2: 0 }, cmdCounter: 2 },
    ),
    script: [
      { kind: "partition", side: [0, 0, 1, 1, 1] },
      { kind: "client", s: 0, cmd: "x=9", aside: "S1 doesn't know it's cut off. A client on its side writes x=9." },
      { kind: "drain" },
      { kind: "timeout", s: 2, aside: "On the majority side, nobody hears from a leader, and S3's timer runs out." },
      { kind: "drain" },
      { kind: "client", s: 2, cmd: "x=7", aside: "Two servers now believe they lead, in different terms. A client on the majority side writes x=7 to S3." },
      { kind: "drain" },
      { kind: "heal", aside: "The network heals. S1 still thinks it leads term 2." },
      { kind: "heartbeat", s: 0 },
      { kind: "drain" },
      { kind: "heartbeat", s: 2, aside: "Now S3, the real leader, reaches S1 and S2." },
      { kind: "drain" },
    ],
  },
];

/** One press of "Next step": the next scripted event, or the oldest message once the script is done. */
export function runStep(st: State, script: ScriptStep[], pos: number): { st: State; pos: number; idle: boolean } {
  while (pos < script.length && script[pos].kind === "drain" && st.msgs.length === 0) pos++;
  if (pos >= script.length) {
    if (st.msgs.length === 0) {
      return { st: { ...st, note: { rule: "Idle", text: "Nothing is in flight. Fire an election timeout, send a heartbeat, or write to a leader." } }, pos, idle: true };
    }
    return { st: apply(st, { kind: "deliver", id: st.msgs[0].id }), pos, idle: false };
  }
  const step = script[pos];
  let next: State;
  let np = pos + 1;
  if (step.kind === "drain") {
    next = apply(st, { kind: "deliver", id: st.msgs[0].id });
    np = pos;
  } else if (step.kind === "pick") {
    const m = st.msgs.find((x) => x.type === step.type && x.from === step.from && x.to === step.to);
    next = m
      ? apply(st, { kind: "deliver", id: m.id })
      : { ...st, note: { rule: "Off script", text: `The scripted message (${TYPE_NAME[step.type]} ${nm(step.from)}→${nm(step.to)}) isn't in flight any more. The run has gone its own way, so carry on by hand.` } };
  } else {
    next = apply(st, step);
  }
  if (step.aside && next.note && np !== pos) next = { ...next, note: { ...next.note, aside: step.aside } };
  return { st: next, pos: np, idle: false };
}

export function describeStep(st: State, script: ScriptStep[], pos: number): string {
  let p = pos;
  while (p < script.length && script[p].kind === "drain" && st.msgs.length === 0) p++;
  if (p >= script.length) return st.msgs.length ? `deliver the oldest message (#${st.msgs[0].id})` : "nothing scripted; act by hand";
  const s = script[p];
  switch (s.kind) {
    case "drain": return `deliver the oldest message (#${st.msgs[0].id})`;
    case "pick": return `deliver ${TYPE_NAME[s.type]} ${nm(s.from)}→${nm(s.to)}`;
    case "timeout": return `${nm(s.s)}'s election timer runs out`;
    case "client": return `a client writes ${s.cmd ?? "a value"} to ${nm(s.s)}`;
    case "heartbeat": return `${nm(s.s)} sends AppendEntries`;
    case "crash": return `${nm(s.s)} crashes`;
    case "restart": return `${nm(s.s)} restarts`;
    case "partition": return "the network splits";
    case "heal": return "the network heals";
    default: return "next event";
  }
}

const TYPE_NAME: Record<Msg["type"], string> = { RV: "RequestVote", RVR: "vote reply", AE: "AppendEntries", AER: "append reply" };

export function describeMsg(m: Msg): string {
  switch (m.type) {
    case "RV": return `t${m.term} · last ${m.lastLogIndex === 0 ? "none" : ent(m.lastLogIndex, m.lastLogTerm)}`;
    case "RVR": return `t${m.term} · ${m.granted ? "yes" : "no"}`;
    case "AE": return `t${m.term} · prev ${m.prevLogIndex === 0 ? "0" : ent(m.prevLogIndex, m.prevLogTerm)} · ${m.entries.length ? `[${m.entries.map((x, k) => ent(m.prevLogIndex + 1 + k, x.term)).join(" ")}]` : "[] heartbeat"} · commit ${m.leaderCommit}`;
    case "AER": return `t${m.term} · ${m.success ? `ok, has ${m.matchIndex}` : "rejected"}`;
  }
}

/* ───────────────────────── UI ───────────────────────── */

const TERM_CLS = [
  "border-os bg-os/15 text-os",
  "border-conc bg-conc/15 text-conc",
  "border-data bg-data/15 text-data",
  "border-dist bg-dist/15 text-dist",
  "border-machine bg-machine/15 text-machine",
  "border-cloud bg-cloud/15 text-cloud",
  "border-ops bg-ops/15 text-ops",
  "border-lab bg-lab/15 text-lab",
];
const termCls = (t: number) => TERM_CLS[(t - 1 + TERM_CLS.length) % TERM_CLS.length];

const CX = 180, CY = 148, RING = 104, NODE_R = 28;
const pos = (i: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
  return { x: CX + RING * Math.cos(a), y: CY + RING * Math.sin(a) };
};

interface UI { sc: number; sim: State; pos: number; playing: boolean; sel: number; burst: number }
type UIAct =
  | { t: "next" } | { t: "all" } | { t: "act"; a: Action } | { t: "load"; sc: number; opts?: Opts }
  | { t: "play"; on: boolean } | { t: "sel"; s: number };

const load = (sc: number, opts: Opts): UI => {
  const S = SCENARIOS[sc];
  const sim = S.setup(opts);
  sim.note = { rule: "Setup", text: S.intro };
  return { sc, sim, pos: 0, playing: false, sel: 0, burst: 0 };
};

function reducer(u: UI, a: UIAct): UI {
  const script = SCENARIOS[u.sc].script;
  switch (a.t) {
    case "next": {
      const r = runStep(u.sim, script, u.pos);
      return { ...u, sim: r.st, pos: r.pos, playing: u.playing && !r.idle, burst: 0 };
    }
    case "all": {
      let sim = u.sim, n = 0;
      while (sim.msgs.length && n < 200) { sim = apply(sim, { kind: "deliver", id: sim.msgs[0].id }); n++; }
      return { ...u, sim, burst: n };
    }
    case "act": return { ...u, sim: apply(u.sim, a.a), burst: 0 };
    case "load": return { ...load(a.sc, a.opts ?? u.sim.opts), sel: u.sel };
    case "play": return { ...u, playing: a.on };
    case "sel": return { ...u, sel: a.s };
  }
}

export function RaftLab() {
  const [u, dispatch] = useReducer(reducer, 0, (sc) => load(sc, {}));
  const [hover, setHover] = useState<number | null>(null);
  const [chaos, setChaos] = useState<{ runs: number; bad: number; first: string | null; leaders: number; commits: number; overwritten: number; broken: boolean } | null>(null);
  const { sim } = u;
  const script = SCENARIOS[u.sc].script;
  const sel = sim.servers[u.sel];
  const parted = sim.side.some((x) => x !== sim.side[0]);
  const maxLen = Math.max(4, ...sim.servers.map((s) => s.log.length));
  const nextId = sim.msgs[0]?.id;
  const shown = hover ?? nextId;
  const scriptDone = (() => { let p = u.pos; while (p < script.length && script[p].kind === "drain" && sim.msgs.length === 0) p++; return p >= script.length; })();

  useEffect(() => {
    if (!u.playing) return;
    const t = setInterval(() => dispatch({ t: "next" }), 900);
    return () => clearInterval(t);
  }, [u.playing]);

  const runChaos = () => {
    const runs = 200;
    let bad = 0, leaders = 0, commits = 0, overwritten = 0;
    let first: string | null = null;
    for (let seed = 1; seed <= runs; seed++) {
      const r = fuzz(seed, 300, sim.opts);
      if (r.violations.length) { bad++; first ??= `seed ${seed}: ${r.violations[0]}`; }
      leaders += r.leaders; commits += r.commits; overwritten += r.overwritten;
    }
    setChaos({ runs, bad, first, leaders, commits, overwritten, broken: !!sim.opts.skipUpToDate });
  };

  const btn = "rounded-lg border border-line-2 px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · you are the network</div>
          <div className="text-[14px] text-muted">Five Raft servers. Deliver one message at a time, or drop it, crash a server, split the cluster.</div>
        </div>
        <div className="flex flex-wrap rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Scenario">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => dispatch({ t: "load", sc: i })}
              aria-pressed={u.sc === i}
              className={cn("rounded-md px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent", u.sc === i ? "bg-ink text-bg" : "text-muted hover:text-ink")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* step controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <button onClick={() => dispatch({ t: "next" })} className="rounded-lg bg-accent px-3.5 py-1.5 text-[13.5px] font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Next step ▸
        </button>
        <button onClick={() => dispatch({ t: "play", on: !u.playing })} className={btn}>{u.playing ? "Pause" : "Autoplay"}</button>
        <button onClick={() => dispatch({ t: "all" })} disabled={sim.msgs.length === 0} className={btn}>Deliver all in flight</button>
        <button onClick={() => dispatch({ t: "load", sc: u.sc })} className="px-2 text-[13px] text-faint underline decoration-line-2 underline-offset-2 hover:text-ink">Reset</button>
        <span className="w-full text-[12.5px] text-faint sm:ml-auto sm:w-auto">
          {scriptDone ? "Script done. " : ""}Next: {describeStep(sim, script, u.pos)}
        </span>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ring + logs */}
        <div className="min-w-0">
          <svg viewBox="0 0 360 300" className="mx-auto block w-full max-w-[420px]" role="img" aria-label="Five servers in a ring with messages in flight drawn as arrows">
            {sim.msgs.map((m) => {
              const a = pos(m.from), b = pos(m.to);
              const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
              const ux = dx / len, uy = dy / len;
              const off = 10;
              const sx = a.x + ux * (NODE_R + 3) - uy * off, sy = a.y + uy * (NODE_R + 3) + ux * off;
              const ex = b.x - ux * (NODE_R + 5) - uy * off, ey = b.y - uy * (NODE_R + 5) + ux * off;
              const hi = m.id === shown;
              const vote = m.type === "RV" || m.type === "RVR";
              const reply = m.type === "RVR" || m.type === "AER";
              const col = vote ? "stroke-conc fill-conc" : "stroke-dist fill-dist";
              const head = `${ex},${ey} ${ex - ux * 8 - uy * 4},${ey - uy * 8 + ux * 4} ${ex - ux * 8 + uy * 4},${ey - uy * 8 - ux * 4}`;
              return (
                <g key={m.id} className={cn(col, hi ? "opacity-100" : "opacity-45")}>
                  <line x1={sx} y1={sy} x2={ex - ux * 6} y2={ey - uy * 6} strokeWidth={hi ? 2.4 : 1.4} strokeDasharray={reply ? "4 3" : undefined} />
                  <polygon points={head} strokeWidth={0} />
                  {hi && (
                    <text x={(sx + ex) / 2 - uy * 10} y={(sy + ey) / 2 + ux * 10 + 3} textAnchor="middle" className="stroke-none text-[10px] font-semibold" style={{ fontFamily: "var(--font-jetbrains)" }}>
                      {m.type === "RV" ? "RequestVote" : m.type === "AE" ? (m.entries.length ? `AE +${m.entries.length}` : "heartbeat") : m.type === "RVR" ? (m.granted ? "vote yes" : "vote no") : m.success ? "ok" : "reject"}
                    </text>
                  )}
                </g>
              );
            })}
            {sim.servers.map((s) => {
              const p = pos(s.id);
              const isSel = s.id === u.sel;
              return (
                <g
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${nm(s.id)}`}
                  onClick={() => dispatch({ t: "sel", s: s.id })}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); dispatch({ t: "sel", s: s.id }); } }}
                  className="cursor-pointer outline-none [&:focus-visible>circle.sel-ring]:stroke-accent"
                >
                  {sim.side[s.id] === 1 && <circle cx={p.x} cy={p.y} r={NODE_R + 7} className="fill-none stroke-ops" strokeWidth={1.5} strokeDasharray="3 3" />}
                  <circle cx={p.x} cy={p.y} r={NODE_R + 3} className={cn("sel-ring fill-none", isSel ? "stroke-ink" : "stroke-transparent")} strokeWidth={1.5} />
                  <circle
                    cx={p.x} cy={p.y} r={NODE_R}
                    strokeWidth={s.role === "leader" ? 3 : 1.6}
                    strokeDasharray={s.role === "candidate" && s.up ? "5 3" : undefined}
                    className={cn(
                      !s.up ? "fill-surface-2 stroke-faint" :
                      s.role === "leader" ? "fill-accent/15 stroke-accent" :
                      s.role === "candidate" ? "fill-conc/10 stroke-conc" : "fill-bg stroke-line-2",
                    )}
                  />
                  <text x={p.x} y={p.y - 3} textAnchor="middle" className={cn("text-[13px] font-semibold", s.up ? "fill-ink" : "fill-faint")}>{nm(s.id)}</text>
                  <text x={p.x} y={p.y + 12} textAnchor="middle" className="fill-muted text-[10.5px]" style={{ fontFamily: "var(--font-jetbrains)" }}>
                    {s.up ? `t${s.term}` : "down"}
                  </text>
                  <text x={p.x} y={p.y + NODE_R + 14} textAnchor="middle" className={cn("text-[10.5px] font-medium", !s.up ? "fill-faint" : s.role === "leader" ? "fill-accent" : s.role === "candidate" ? "fill-conc" : "fill-muted")}>
                    {s.up ? s.role : `down · t${s.term}`}
                  </text>
                  <text x={p.x} y={p.y + NODE_R + 26} textAnchor="middle" className="fill-faint text-[9.5px]" style={{ fontFamily: "var(--font-jetbrains)" }}>
                    {s.role === "candidate" && s.up ? `votes ${s.votes.length}/${N}` : `voted ${s.votedFor === null ? "–" : nm(s.votedFor)}`}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11.5px] text-faint">
            <span><span className="text-conc">━</span> RequestVote <span className="text-conc">┅</span> reply</span>
            <span><span className="text-dist">━</span> AppendEntries <span className="text-dist">┅</span> reply</span>
            {parted && <span><span className="text-ops">◌</span> other side of the partition</span>}
          </div>

          {/* logs */}
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12px]" style={{ fontFamily: "var(--font-jetbrains)" }}>
              <thead>
                <tr className="text-faint">
                  <th className="px-2 py-1.5 text-left font-normal">log</th>
                  {Array.from({ length: maxLen }, (_, i) => <th key={i} className="px-0.5 py-1.5 font-normal">{i + 1}</th>)}
                  <th className="px-2 py-1.5 text-right font-normal">commit</th>
                </tr>
              </thead>
              <tbody>
                {sim.servers.map((s) => (
                  <tr key={s.id} className={cn("border-t border-line", !s.up && "opacity-50", s.id === u.sel && "bg-surface-2/60")}>
                    <td className="px-2 py-1 font-semibold text-ink">{nm(s.id)}</td>
                    {Array.from({ length: maxLen }, (_, i) => {
                      const x = s.log[i];
                      return (
                        <td key={i} className="px-0.5 py-1">
                          {x ? (
                            <div
                              title={`index ${i + 1}, term ${x.term}, ${x.cmd}${i < s.commitIndex ? ", committed" : ""}`}
                              className={cn("min-w-[38px] rounded border px-0.5 text-center leading-tight", termCls(x.term), i < s.commitIndex ? "border-solid" : "border-dashed")}
                            >
                              <div className="text-[11px] font-semibold">{x.cmd}</div>
                              <div className="text-[9.5px] opacity-80">t{x.term}</div>
                            </div>
                          ) : <div className="min-w-[38px] text-center text-line-2">·</div>}
                        </td>
                      );
                    })}
                    <td className="tnum px-2 py-1 text-right text-ink">{s.commitIndex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[11.5px] text-faint">Solid border: committed on that server. Dashed: not yet. Colour is the term the entry was written in.</div>
          {sim.servers.filter((s) => s.up && s.role === "leader").map((l) => (
            <div key={l.id} className="mt-2 overflow-x-auto text-[11.5px] text-muted" style={{ fontFamily: "var(--font-jetbrains)" }}>
              {nm(l.id)} (leader, t{l.term}) nextIndex [{l.nextIndex.join(" ")}] matchIndex [{l.matchIndex.join(" ")}]
            </div>
          ))}
        </div>

        {/* messages + server controls */}
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">In flight</span>
              <span className="tnum text-[12px] text-faint">{sim.msgs.length} message{sim.msgs.length === 1 ? "" : "s"}</span>
            </div>
            {sim.msgs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center text-[13px] text-faint">No messages on the wire.</div>
            ) : (
              <ul className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                {sim.msgs.map((m) => {
                  const vote = m.type === "RV" || m.type === "RVR";
                  return (
                    <li
                      key={m.id}
                      onMouseEnter={() => setHover(m.id)}
                      onMouseLeave={() => setHover(null)}
                      className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5", m.id === shown ? "border-line-2 bg-surface-2" : "border-line")}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-ink">
                          <span className="tnum text-faint">#{m.id}</span>{" "}
                          <span className={cn("font-semibold", vote ? "text-conc" : "text-dist")}>{TYPE_NAME[m.type]}</span>{" "}
                          {nm(m.from)}→{nm(m.to)}
                          {m.id === nextId && <span className="ml-1.5 rounded bg-accent/15 px-1 text-[10.5px] text-accent">oldest</span>}
                        </div>
                        <div className="truncate text-[11px] text-muted" style={{ fontFamily: "var(--font-jetbrains)" }} title={describeMsg(m)}>{describeMsg(m)}</div>
                      </div>
                      <button onFocus={() => setHover(m.id)} onBlur={() => setHover(null)} onClick={() => dispatch({ t: "act", a: { kind: "deliver", id: m.id } })} aria-label={`Deliver message ${m.id}`} className="rounded-md border border-line-2 px-2 py-1 text-[12px] text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
                        Deliver
                      </button>
                      <button onFocus={() => setHover(m.id)} onBlur={() => setHover(null)} onClick={() => dispatch({ t: "act", a: { kind: "drop", id: m.id } })} aria-label={`Drop message ${m.id}`} className="rounded-md border border-line-2 px-2 py-1 text-[12px] text-machine hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
                        Drop
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Server</span>
              {sim.servers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => dispatch({ t: "sel", s: s.id })}
                  aria-pressed={u.sel === s.id}
                  className={cn("rounded-md px-2 py-0.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-accent", u.sel === s.id ? "bg-ink text-bg" : "border border-line-2 text-muted hover:text-ink")}
                >
                  {nm(s.id)}
                </button>
              ))}
            </div>
            <div className="mb-3 text-[12.5px] text-muted" style={{ fontFamily: "var(--font-jetbrains)" }}>
              {sel.up ? sel.role : "down"} · term {sel.term} · votedFor {sel.votedFor === null ? "none" : nm(sel.votedFor)} · commitIndex {sel.commitIndex}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btn} disabled={!sel.up || sel.role === "leader"} onClick={() => dispatch({ t: "act", a: { kind: "timeout", s: sel.id } })}>Election timeout</button>
              <button className={btn} disabled={!sel.up || sel.role !== "leader"} onClick={() => dispatch({ t: "act", a: { kind: "heartbeat", s: sel.id } })}>Heartbeat</button>
              <button className={btn} disabled={!sel.up || sel.role !== "leader"} onClick={() => dispatch({ t: "act", a: { kind: "client", s: sel.id } })}>Client write</button>
              <button className={btn} onClick={() => dispatch({ t: "act", a: { kind: sel.up ? "crash" : "restart", s: sel.id } })}>{sel.up ? "Crash" : "Restart"}</button>
              <button className={btn} onClick={() => dispatch({ t: "act", a: { kind: "side", s: sel.id } })}>Move across partition</button>
              {parted && <button className={btn} onClick={() => dispatch({ t: "act", a: { kind: "heal" } })}>Heal network</button>}
            </div>
          </div>
        </div>
      </div>

      {/* narration */}
      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="min-h-[4.5em] text-[14.5px] leading-relaxed text-ink" aria-live="polite">
          {sim.note && (
            <>
              <span className="mr-2 inline-block rounded bg-accent/15 px-1.5 py-0.5 align-[1px] text-[11.5px] font-semibold uppercase tracking-[0.05em] text-accent">{sim.note.rule}</span>
              {u.burst > 1 && <span className="text-faint">After {u.burst} deliveries, the last one: </span>}
              {sim.note.text}
              {sim.note.aside && <div className="mt-1.5 text-[13.5px] text-muted">{sim.note.aside}</div>}
            </>
          )}
        </div>
        <div className={cn("mt-2 text-[13.5px] font-medium", sim.violations.length ? "text-machine" : "text-data")}>
          {sim.violations.length
            ? <>Safety broken: {sim.violations.slice(0, 3).join(" ")}{sim.violations.length > 3 ? ` (+${sim.violations.length - 3} more)` : ""}</>
            : <>Safety holds so far: at most one leader per term, and no committed entry lost.</>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button onClick={runChaos} className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
            Run 200 random seeded runs of 300 events
          </button>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={!!sim.opts.skipUpToDate}
              onChange={(ev) => dispatch({ t: "load", sc: u.sc, opts: { ...sim.opts, skipUpToDate: ev.target.checked } })}
              className="accent-[var(--c-machine)]"
            />
            Break it: voters skip the up-to-date check
          </label>
          {chaos && (
            <div className="tnum w-full text-[13.5px] text-muted">
              {chaos.broken ? "Without the election restriction" : "With every rule"}: {chaos.runs} runs, {chaos.leaders.toLocaleString()} leaders elected, {chaos.commits.toLocaleString()} entries committed, {chaos.overwritten.toLocaleString()} uncommitted entries overwritten.{" "}
              <span className={chaos.bad ? "font-medium text-machine" : "font-medium text-data"}>
                {chaos.bad ? `${chaos.bad} runs broke safety. First: ${chaos.first}` : "No run broke safety."}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

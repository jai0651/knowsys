# KnowSys — blueprint

A sibling to KnowML for the systems half of the craft: the machine, the kernel,
concurrency, storage engines, distributed systems, cloud infrastructure, and the
work of running all of it. Same architecture, same build, same prose discipline.
Different subject and a different spine.

Name: **KnowSys**. Sibling to KnowML, cross-linked from its nav.

---

## 1. Why a second site and not 20 more KnowML chapters

KnowML is branded and structured around one interrogation — Representation,
Objective, Architecture, Training, Inference, Deployment. That spine is what
makes it work: a decision tree and a diffusion transformer get the same six
questions, so the twelfth chapter is easier than the third.

Systems topics do not answer those six questions. Redis has no objective
function. A page table has no training loop. Forcing them in produces the thing
KnowML avoided — a pile of unrelated articles behind a shared nav.

So: same engine, new spine.

---

## 2. The four shapes

Every chapter is one of four archetypes, declared in `content/manifest.json` and
enforced by `scripts/check-mdx.mjs`. A chapter whose sections don't match its
declared archetype fails CI.

This started as **one** spine for everything. Sixteen chapters in, the section
lists were byte-identical across all of them — which reads as a template however
good the sentences are, and violates this project's own rule about varying
section shape. Four shapes fixed it.

### Mechanism — a system you can open up

**Contract → Layout → Hot path → Failure → Cost → Operating it**

For a specific thing you can trace one operation through. 27 of 43 chapters.

| | The question | What the section holds |
|---|---|---|
| 1 | **Contract** | What it promises, and what it explicitly does not. |
| 2 | **Layout** | The data structures, as bytes. Not boxes and arrows. |
| 3 | **Hot path** | One operation end to end, at source level, from the real implementation. |
| 4 | **Failure** | A disk lies, a node dies, a clock jumps. |
| 5 | **Cost** | Nanoseconds, cache lines, hops, dollars. Derived or attributed. |
| 6 | **Operating it** | Seeing inside, tuning, what breaks only at scale. |

It holds across the whole subject, which was the test:

| | **Redis** | **VPC** | **A mutex** |
|---|---|---|---|
| Contract | Single-threaded command atomicity | L3 isolation, private CIDR | Mutual exclusion, no fairness |
| Layout | dict, listpack, skiplist | Route tables, ENIs, mapping service | One futex word, a wait queue |
| Hot path | Event loop → command table | Packet → encap → underlay | CAS; then `futex(FUTEX_WAIT)` |
| Failure | Replication lag, split brain | Blackhole routes, NAT exhaustion | Deadlock, convoy, inversion |
| Cost | O(1) lookup, COW fork on RDB | Cross-AZ $/GB, PPS ceiling | 4 ns uncontended, 55× false sharing |
| Operating | `INFO`, `maxmemory-policy` | Flow logs, Reachability Analyzer | `perf lock`, `/proc/lock_stat` |

Tail: Build this · What you give up · In the wild · Interview · Go deeper.

### Phenomenon — an effect, not a component

**What you observe → Why it happens → What controls it → The measurements → What to do**

For emergent behaviour with no single hot path. Chapters 01, 02, 41.

Opens with the surprising observation stated concretely enough to reproduce,
not with a contract. Tail: Reproduce it yourself · In the wild · Interview ·
Go deeper.

### Decision — which of these should I use

**The choice → The options → Where the crossover is → How to choose → What people get wrong**

For several viable options with a measured crossover. Chapters 14, 15, 17, 25,
28, 36, 38, 43.

Every option gets the same four slots via `<Approach>`, so they compare by
position. The crossover section must contain a real measurement — a Decision
chapter without one is an opinion piece. Tail: Decide it for your case ·
In the wild · Interview · Go deeper.

### Model — theory with arithmetic

**The question → The model → Where it comes from → Where it breaks → Using it**

For a small piece of theory that predicts something. Chapters 03, 16, 26, 40, 42.

"Where it breaks" is mandatory and is the section that distinguishes this from a
textbook: state the assumptions and what violating each one does to the
prediction. Tail: Apply it to your numbers · In the wild · Interview · Go deeper.

## 3. Page anatomy

Lifted from KnowML, which converged on this across 40 chapters. Section `id`s
are load-bearing — the TOC rail, the review drill and the search index all read
them.

```
#tldr              the claim, in five sentences
#contract          spine 1
#layout            spine 2
#hot-path          spine 3   ← the longest section, always
#failure           spine 4
#cost              spine 5
#operating         spine 6
#build             "Build this" — one project card, scoped to a weekend
#tradeoffs         what actually breaks
#in-the-wild       .wild-card × 4 — named systems, named incidents
#interview         <details class="qa"> × 8, tagged beginner/intermediate/deep
#resources         .resource-card, papers and source files, every link verified
#related           .related-card, cross-links
```

Two deviations from KnowML, on purpose:

- **No `#math` section.** The maths here is arithmetic — queueing, capacity,
  percentiles — and it belongs inside `#cost` where it is being used.
- **`#hot-path` carries a source-reading block.** The differentiator for this
  subject is reading the real thing: `kernel/futex/core.c`, `src/t_hash.c`,
  `storage/buffer/bufmgr.c`. Quote 15 lines, annotate them, link the file at a
  pinned tag. Never paraphrase code that exists.

Reuse without change: `.tldr`, `.bia`, `.callout-teach`, `.qa`, `.derivation`,
`.tryit`, `.wild-card`, `.resource-card`, `.eq-block`, `.project`, `em.term`.

---

## 4. Runnable code

KnowML's rule — every `<details class="tryit">` block executes in CI — is the
reason its code is trustworthy. Keep it, and widen what counts as runnable.

- **C++ is the default.** Every chapter that can show code in C++ does.
  `std::atomic` with explicit memory orders, `alignas(64)` to kill false
  sharing, `std::chrono::steady_clock` for the timings, raw `syscall()` and
  `futex()` where the point is the boundary. Cache-line bouncing and futex fast
  paths do not demonstrate in a managed language, and the same language across
  43 chapters means the reader never re-learns the idiom.
- **Shell** for the observable ones: `perf stat`, `strace -c`, `ss -ti`,
  `bpftrace` one-liners, `EXPLAIN (ANALYZE, BUFFERS)`.
- **Python** only where C++ would obscure the idea rather than sharpen it — a
  W-TinyLFU trace, a Raft state table. Decide per chapter; do not reach for it
  by default.

`scripts/check-tryit.py` needs a compile-and-run path: `g++ -std=c++20 -O2
-pthread`, capture stdout, diff against the claimed output. Blocks that need a
real kernel or root get a recorded transcript and a line saying which machine
and kernel produced it.

**Pin the toolchain.** A `-O2` C++ benchmark is a statement about one compiler
version. Every timing block says which: `g++ 13.2, -O2, x86-64, kernel 6.12`.

**Every number on the page is derived on the page or attributed to a source.**
This subject is drowning in folklore numbers that were true in 2012. An
unattributed "an SSD does 500k IOPS" is a bug.

---

## 5. The labs

The labs are the reason KnowML is not a blog. Eight candidates, ordered by how
much they teach per hour of build:

| Lab | What you step through |
|---|---|
| **Lock Lab** | A CAS succeeding, then failing. Two threads on one counter, cache line bouncing between cores. |
| **Raft Lab** | An election and a log replication, message by message, with the ability to drop any one of them. |
| **Storage Lab** | The same keys into a B+tree and an LSM. Watch page splits on one side, compaction on the other. |
| **Hashing Lab** | Add and remove nodes from a ring. Count exactly which keys move, and see what virtual nodes fix. |
| **Cache Lab** | LRU, LFU and W-TinyLFU on one trace, hit rate updating per access. |
| **Queueing Lab** | Drag utilization toward 1.0 and watch the latency curve go vertical. |
| **MVCC Lab** | Two transactions, one row. Produce write skew under snapshot isolation, then prevent it. |
| **Packet Lab** | One packet from `write()` to the wire and back, through every layer that touches it. |

Lock Lab and Queueing Lab first — they fix the two intuitions that most senior
engineers are missing.

---

## 6. Prose

`docs/STYLE.md` holds the rules. The short version: this reads as though a staff
engineer wrote it on a Sunday, not as though a model summarised a wiki.

Three checkers, all in `npm test`:

- `scripts/check-ai-tells.py` — the Wikipedia "Signs of AI writing" patterns.
  KnowML's copy ports over unchanged.
- `~/.claude/skills/tech-blog/scripts/check.js` — six measured axes against a
  1,437-sentence corpus of Dan Luu, Julia Evans, Karpathy, Elhage and Wayne.
  Contractions are the loudest tell and the one generated prose always fails.
- `scripts/check-tryit.py` — code executes and its claimed output matches.

Threshold: a chapter does not merge until all three are clean.

---

## 7. Build

Everything comes from KnowML unchanged, which is most of the value of doing this
as a sibling.

```
partials/*.html          the shell, with {{placeholders}}
content/manifest.json    single source of truth — sidebar, cards, graph, prev/next
content/pages.json       per-page config and opt-ins
scripts/build.py         composes the shell into every page; --check-strict in CI
scripts/build-sitemap.py sitemap.xml + llms.txt
assets/css/style.css     2,212 lines, light and dark
```

`build.py` needs no changes. It reads the manifest and writes the shell; it never
touches `<main>`.

Colour tokens are new — seven group colours in place of KnowML's twenty-eight
per-chapter ones. Fewer, and grouped, because seven families read better in a
sidebar than forty-three individual hues.

---

## 8. Directory

```
knowsys/
  index.html  sections.html  roadmaps.html  labs.html  map.html  practice.html  review.html
  topics/     01-…html through 43-…html
  labs/       lock-lab.html … packet-lab.html
  partials/   content/   assets/   scripts/   docs/   api/
```

Deploy as a separate Vercel project. Cross-link from KnowML's nav — the audience
overlaps almost completely, and "the systems work underneath" is already a
phrase in KnowML's hero.

---

## 9. Order of work

1. ~~**Scaffold.**~~ **Done.** 43 chapters and 8 labs as stubs, the shell
   composed from KnowML's `build.py`, a link checker over 4,117 internal
   references, and CI green. `npm run build` regenerates everything from
   `content/manifest.json`.
2. **Write three chapters that are maximally unlike each other** — Redis (22),
   Locks (13), VPC (33). If one spine carries all three, it carries everything.
   Fix the template against what those three teach.
3. **Build Lock Lab.** It is the cheapest lab and it proves the format transfers.
4. **Fill by group**, not by number. Concurrency and Data first: that is where
   the reader is, and Redis and Postgres pull the most traffic.
5. **The Machine last.** Best chapters, hardest to write, and they benefit from
   everything learned on the other six groups.

---

## 10. Open questions

- **Domain.** `knowsys.vercel.app` to start. `knowsys.dev` if it is free.
- **43 is a lot.** Decided: scaffold all 43 so the graph and roadmaps are whole
  from day one, then fill by group. Unwritten chapters show as `coming` in the
  sidebar and are excluded from the sitemap until they have content.
- **Where C++ stops paying.** Settled: C++ first everywhere, Python revisited
  per chapter if it earns its place. The likely friction points are the
  simulation-shaped labs — consistent hashing, W-TinyLFU, queueing curves —
  where the lab is JavaScript in the browser anyway and the `Try it` block is
  the only place a language choice shows.
- **Shared or separate review/drill database.** KnowML's `api/` and Neon schema
  could serve both sites with a `site` column, or KnowSys gets its own.


---

## 11. Where it stands

Phase 1 is done. What exists:

- 43 chapter stubs and 8 lab stubs, each carrying the six-question skeleton,
  each labelled **Stub** in the sidebar, on its browse card, and on the page.
- `index.html`, `sections.html`, `labs.html`, generated from the manifest, so
  the counts on the homepage cannot drift from what is written.
- The shell composed into all 54 pages by KnowML's `build.py`, unmodified
  except for the sidebar's link resolution — KnowML had one content directory
  and assumed `../` meant `topics/`, which broke every topic link from a lab
  page. It now computes each href relative to the page.
- CI: `build.py --check-strict` (pages in sync with partials), `check-links.py`
  (4,117 internal references, all resolving), `check-ai-tells.py` (0 tells).
- `sitemap.xml` lists 3 pages, not 51, because stubs are excluded. `llms.txt`
  describes all 51 and marks the 51 stubs as stubs.

Next: write chapters 22, 13 and 33 against the spine and see what it gets wrong.

Local: `python3 -m http.server 8777` from this directory.

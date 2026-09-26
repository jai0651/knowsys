# KnowSys prose style

> **Chapter structure lives in `docs/CHAPTER_FORMAT.md`** (numbered topical
> sections, step-through diagrams, Why-subheads, tables, a summary). The
> reference chapter is 10. The voice rules below still apply.

The target reader is a senior engineer who has already read the docs and the
top three blog posts. They are here because those were not deep enough. Write
for someone who will notice if you are bluffing.

The failure mode to avoid is not bad writing. It's *even* writing — every
section the same shape, every paragraph the same length, every anecdote closed
with a portable lesson, no contractions, no asides, nothing left open. That
reads as a competent summary of a subject rather than as someone who has been
inside it.

Three checkers enforce what is measurable. Everything below that is judgement.

---

## Measured — `npm test` fails on these

### 1. The six axes (`~/.claude/skills/tech-blog/scripts/check.js`)

Baseline is 1,437 sentences from Dan Luu, Julia Evans, Karpathy, Nelson Elhage
and Hillel Wayne, all pre-2021. Rates are per 100 sentences.

| Axis | Human median | What a generated draft does |
|---|---|---|
| Contractions | 62 | 3–6. **The loudest tell by far.** |
| Parenthetical asides | 18 | near zero |
| Questions to the reader | 5 | near zero |
| Sentences starting "The" | 7 | 18–22 |
| `, which` appositives | 4 | 10–13 |
| Hedges (maybe, probably, a bit) | 9 | 1–2 |

Three phrases appear **zero times** in the entire human corpus. Never write
them: `rather than`, `the reason is`, `is worth noting` / `is worth knowing`.

### 2. AI tells (`scripts/check-ai-tells.py`)

Ported from KnowML unchanged. Wikipedia's "Signs of AI writing" list —
inflated importance, shallow `-ing` phrases, sales language, vague sources,
`delve` / `crucial` / `intricate` / `realm of`, "not just X but Y",
"at its core", "let's dive in", filler like "in order to".

Target is **zero** on a new page. KnowML runs at a low rate across 315k words;
there is no reason to start worse than that.

### 3. Code (`scripts/check-tryit.py`)

Every `<details class="tryit">` block runs in CI and its claimed output has to
match. Shell blocks that need a real kernel carry a recorded transcript and a
line saying which machine produced it.

---

## Not measured — read this before the first draft

**One idea per sentence.** The biggest single problem is a 40-word sentence
chaining three ideas with em-dashes and semicolons. Break it. Then vary length
deliberately: a four-word sentence after a twenty-word one is what makes rhythm.
Target 16–22 words per sentence on average, with real variance.

**Em-dashes are a last resort.** Roughly one per five sentences, no more. A
colon introduces, a full stop separates, brackets hold a genuine aside.

**Enumerable things become lists.** A sequence of steps, a set of options, a
three-way comparison — that is a `<ul>`, not a comma chain. Two lists per page
minimum. Highest-leverage single change on most drafts.

**Bold the term, italicise the contrast.** `<strong>` marks what the reader
should remember, six or more per page. `<em class="term">` on the first
definition of a key term. `<em>` for *this* not *that*.

**Give the insight its own box.** Every chapter has one or two moments where
something clicks. `<div class="callout callout-teach">` with a label that says
what it is: "Why the naive version deadlocks", not "Key insight". One to three
per page.

**No paragraph over ~70 words.**

**Don't close every section with a lesson.** After contractions this is the
loudest tell. Generated prose ends each anecdote with a maxim. State what
happens and move on. Draw a conclusion maybe twice in a chapter, where it was
expensive to learn.

**Leave something unresolved.** At least one thing you don't fully understand,
or a behaviour you can reproduce but not explain. Every thread tied off is the
signature of writing backwards from a conclusion.

**Vary the section shape.** If every section is claim, evidence, implication,
the reader feels the template even when the sentences are fine.

This applies at chapter level too, and it's the rule this project broke first.
Sixteen chapters were written against one spine and came out with identical
section lists. Pick the archetype that fits the topic — Mechanism, Phenomenon,
Decision or Model — and let the shape differ. `npm run check:mdx` enforces the
match against `content/manifest.json`.

---

## Structure — the part the checker cannot see

Read `~/.claude/skills/tech-blog/references/human-patterns.md` before drafting,
not after. Everything below comes from it, plus a measurement of where the first
sixteen chapters failed it.

**Teach it the way a good professor would: build it from a problem.** A
reader arriving at a chapter needs to know what the idea is *for* before they'll
care about its edge cases, and they learn it best by watching it get invented.
The opening, before section 01, does that:

- **Start from a world without the idea.** A machine with no virtual memory, a
  counter two threads increment with no lock, a server with one process per
  connection. Show what breaks, concretely.
- **Introduce the idea as the fix,** and name each term only at the moment the
  reader needs it. Never a paragraph of bolded definitions up front.
- **Work one small example with real numbers.** An address split into page and
  offset; two threads interleaving on one cache line.
- **Then show what the fix costs,** and the next idea that fixes *that*. That
  chain is usually the chapter's whole argument.
- **Ask the reader a question and answer it.** "How many translations does 1 GB
  of random access need?" is how a lecturer checks you're still with them.
- **Only then connect to real systems,** explained in prose using the model just
  built. Two or three, each with its *why*. No bullet lists of product names.
- **Close with one sentence on where the rest of the chapter goes.** Not a
  bulleted syllabus.

Every chapter's opening should read differently, because every subject starts
from a different problem. If two openings share a sentence shape ("The simple
picture:", "Where you'll meet this", "This chapter goes in this order"), one of
them is a template. The worked reference is chapter 04.

Keep process out of the prose. "Other writers' experiments on the same VM" is
about how the chapter got made, not about the subject.

**Put the author back in.** Measured across those chapters: 0 to 5 first-person
references each, against a corpus median of 20.9 per 100 sentences. The
benchmarks in this project were run on a real machine, two of them were wrong
the first time, and one experiment was silently deleted by the optimiser. That
is the strongest material in the chapters and it was buried in callouts and
passive voice. Lead with it.

**Narrate belief, then correction, in the order it happened.** "I vaguely
remembered" and "at first I thought" are sentences generated prose never writes,
because they admit the author's knowledge was partial at the time. A retrospective
that presents the right answer first has thrown away the useful part.

**Moralise rarely, and late.** This is the one the chapters failed hardest: 87
bolded takeaway sentences across sixteen chapters, roughly one per section. Each
is individually defensible; the even distribution is the tell. Budget **two per
chapter**, placed where something was expensive to learn, and put the rest of
the advice in one section at the end.

**Write mostly prose.** Those chapters run 25–60% prose, median 33 — the other
two thirds is tables, cards and code. A reference manual, not something anyone
reads. Tables are for comparisons a reader will scan back to, not for
information that wanted a sentence.

**Leave something open.** At least one thing per chapter you can reproduce but
cannot explain. Chapter 06's 4-thread anomaly and chapter 04's TLB/cache
confound are the model here — state the hypothesis, say it isn't proven, name
the experiment that would settle it.

---

## Specific to this subject

**Every number is derived on the page or attributed.** Systems writing is
drowning in folklore numbers that were true on a 2012 spinning disk. "An NVMe
drive does 500k IOPS" without a source is a bug, not a rounding error. Say the
drive, the queue depth, the block size, and where the number came from.

**Read the real source.** The differentiator over every other systems blog is
quoting the actual code. `kernel/futex/core.c`, `src/t_hash.c`,
`storage/buffer/bufmgr.c`. Quote 15 lines, annotate them, link the file at a
pinned tag or commit. Never paraphrase code that exists and is readable.

**Name the version.** Kernel 6.12 scheduling is not kernel 5.4 scheduling.
Redis 7 listpacks are not Redis 5 ziplists. Postgres 16 vacuum is not Postgres
11 vacuum. A chapter that doesn't say which version it describes will be wrong
within two years and nobody will be able to tell when.

**The concrete beats the intensifier.** A number, a shape, a syscall name, a
named outage. Cut "actually", "essentially", "simply", "of course" unless the
word is doing real work.

**C++ is the house language.** Same idiom across 43 chapters, so the reader
learns it once. Explicit memory orders, never the default `seq_cst`, when the
ordering is the subject. `alignas(64)` where false sharing is the point. Every
timing block names the compiler, the flags, the arch and the kernel.

**Say what it costs.** Not "this is expensive" — 20ns uncontended, 1–2µs
contended, 0.02 $/GB cross-AZ. If you cannot put a number on it you probably
have not measured it, and the reader will be able to tell.

---

## Worked reference

`topics/13-locks.html`, section `id="hot-path"` — once it exists. Until then,
KnowML's `topics/08-attention-transformers.html`, section `id="intuition"`, is
the standard: 248 → 264 words, 24.8 → 10.2 words per sentence, 7 → 0 em-dashes,
0 → 7 bold terms, 0 → 3 list items, central example lifted into a teach callout.

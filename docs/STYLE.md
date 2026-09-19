# KnowSys prose style

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

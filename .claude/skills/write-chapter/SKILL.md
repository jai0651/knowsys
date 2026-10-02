---
name: write-chapter
description: KnowSys procedure for writing or rewriting a chapter in content/chapters/*.mdx so it teaches like OSTEP: one running example, every section derived from the previous one's problem, every term explained at first use, animated Scene diagrams. Use whenever creating, rewriting, restructuring or reviewing a chapter. Load the teach-writing skill first.
---

# Writing a KnowSys chapter

This is a step-by-step procedure. Follow every step in order and skip none. A chapter is
judged by one thing: whether someone who has never met the topic can read it from top to
bottom and understand it. Passing the checkers is necessary but proves nothing about that.

## Step 0: read these first, in full

1. `~/.claude/skills/teach-writing/SKILL.md`, the general rules of teaching prose.
2. `~/.claude/skills/teach-writing/references/research-2026-10.md`, what OSTEP and the
   best explainers do.
3. **`content/chapters/08-filesystems.mdx`, the reference chapter.** Read all of it.
   Everything below is illustrated there. When unsure how to do something, copy how chapter
   08 does it.
4. The chapter you are rewriting, in full. Save a copy first:
   `git show HEAD:content/chapters/<file> > "$SCRATCH/<file>.old"`.

## Step 1: extract what must survive

Write a facts list in your scratch area. It holds everything from the old chapter that the
new one must keep, unless it's wrong:

- every number and measurement, with what it measures
- every `<TryIt>` with its `<Output>`, byte for byte
- every source: `<SourceRead>` quotes, paper and doc names, links (internal and external),
  `[blog post](/blog/...)` links
- every `<QA>`, `<Quiz>` and `<Q>`, every `<WildCard>` in Go deeper and Related chapters
- every named real system and real incident (Postgres, fsyncgate, Kafka, …)
- every claim you suspect is wrong. Check it, fix it in the new text, and list it in your
  final report.

You may not add numbers that aren't in the old chapter, unless you ran a command and got
them, or they are textbook facts you are certain of (4 KB pages, the speed of light). If you
are unsure of a fact, keep the old wording's meaning or leave it out. Never guess.

## Step 2: plan before writing

Write this plan in your scratch file before any prose:

1. **The reader:** a programmer who has never studied this topic, and has read the
   chapters listed in the frontmatter `prereqs`, nothing more.
2. **The one question** the chapter answers, in that reader's words. Ch08: "When I press
   Save, where does my note go, and is it safe?"
3. **The running example:** one small concrete thing used from the opening to the end. Ch08
   uses one note, `notes.txt`, on a toy twelve-block disk. Other ideas: one HTTP request
   from a browser, one row in a table, one `fork()` of a shell, one packet, one lock taken
   by two threads, one message sent to a queue. It must be small enough to draw.
4. **The chain.** List the sections as problem → idea → next problem. Every section must
   start because of the problem the previous one left. Ch08's chain: the disk only knows
   blocks → inodes and directories → reading blocks is slow → page cache → writes go to
   memory → power cut → fsync → overwriting is dangerous → rename → the filesystem's own
   records face the same danger → journal → layers fail quietly → costs → operating it. If
   you can't write "because of X, we now need Y" between two sections, reorder or cut.
5. **The term list:** every technical term the chapter uses, and the paragraph where it is
   first defined. Include the ones that feel obvious (block, page, syscall, metadata, POSIX,
   cgroup, latency, throughput, kernel). A term may not appear before its definition, in
   prose or inside a diagram.
6. **Where each old fact, TryIt and source lands** in the new structure.
7. **Two to four Scene diagrams:** which moment of the running example each one animates.

## Step 3: write the chapter fresh

Write the whole file from the plan. Don't edit the old prose line by line, because its
structure is the problem. Reuse an old sentence only if it already teaches well.

### File shape

```
frontmatter   title, dek, readingTime, level, versions, prereqs, updated (today's date)
opening       no heading; 3–4 paragraphs
01..N         <SectionHeading n="01" id="kebab-id">Title</SectionHeading>
              each with <Sub n="1.1" title="…"> subsections (the number matches the section)
then          Summary · Build this · Interview questions · Go deeper · Related chapters
              (renumbered to follow the last teaching section)
```

- **dek:** one or two sentences in plain words, saying what the reader will follow and
  learn. Ch08: "Follow one small note from the moment you press Save down to the disk and
  back…"
- **readingTime:** words ÷ 200, rounded, e.g. `"~35 min"`.
- **versions:** may stay, but it is never shown and never mentioned in prose.
- **Section ids:** kebab-case. Before renaming an existing id, run
  `grep -rn "<chapter-slug>#" content src`. Keep any id that something links to.

### The opening (no heading)

- Paragraph 1: the running example, as something the reader does or sees ("You type a short
  note… and press Save").
- Paragraph 2: the surprise or the gap, the thing that is less simple than it looks ("The
  disk knows nothing of the sort…").
- Paragraph 3: what does the work, the chapter's one question, and in one sentence where the
  chapter goes.
- No list of what the chapter covers, no glossary, no history, no benchmark.

### Each section

- **First sentence:** picks up the problem the previous section left open. Ch08 §2: "Reading
  a small 4 KB piece … takes about 45 microseconds." That follows from §1 ending "The next
  question is how long it takes to fetch those blocks".
- **Body:** derive, don't describe. Show the naive approach on the running example, how it
  breaks, the mechanism as the fix, then what the fix costs. When something can fail in
  several ways, walk each case as a bullet saying what the reader would see (ch08 §5.1).
- **Last paragraph:** raises the next section's question in a sentence ("Writes go through
  the same cache, and that's where the trouble starts.").
- **Defining a term:** describe the thing in plain words first, then name it in bold
  (`**page cache**`), then use the name in the next sentence. One new term per sentence.
- **Numbers:** round, with scale: "about 45 microseconds", "about 87 times faster", "a
  thousand reads would spend 45 ms waiting". Say when a number varies by machine.
- **Experiments (`<TryIt>`):** placed after the reader knows what they should see. Before
  the block, say what it will do and explain every command or flag it uses (`ln`, `ls -i`).
  After it, say what to notice in the output, line by line if needed, and tie it to the
  model. Explain anything odd in the output (ch08 explains the `@` in `ls` output).
- **Voice:** "we" while working something out together, "you" for the reader, contractions.
  Paragraphs of connected sentences. A paragraph walking through a mechanism can be five or
  six sentences.
- **Never mention the writer's machine or process:** no "measured on Apple M4", "on this
  machine", "I measured", "I verified", "my first attempt", "The machine" callouts. State
  numbers as facts about systems ("on a fast laptop SSD"). This applies to QA answers too:
  "I measured it at 19×" becomes "roughly twenty times the write itself".

### Components: what to use when

**`<Scene>`: the main diagram, for anything that changes state.** Use it whenever things move
between places or change state: pages between disk and cache, packets through queues,
processes between states, rows between buffers and disk, messages between nodes, locks
between threads. Two to four per chapter. Full syntax:

```mdx
<Scene
  title="One 4 KB read(), a miss and then a hit"
  regions={[
    { id: "app", label: "Your app", sub: "buffer", col: 0, row: 0 },
    { id: "cache", label: "Page cache", sub: "RAM · ~0.5 µs", col: 1, row: 0, span: 2 },
    { id: "disk", label: "SSD", sub: "~45 µs per read", col: 0, row: 1, span: 3 },
  ]}
  itemWidth={96}
  frames={[
    { caption: "Your app calls `read()`…",
      items: [
        { id: "b7", at: "disk", label: "block 7", sub: "buy milk" },
        { id: "o1", at: "cache", label: "inode 40 · 0", tone: "dim" },
      ],
      focus: ["cache"], arrow: { from: "app", to: "cache", label: "read()" } },
    { caption: "A **miss**…", add: [{ id: "pg", at: "cache", label: "inode 12 · 0", sub: "empty", tone: "new" }] },
    { caption: "The data arrives…", change: [{ id: "pg", sub: "buy milk", tone: "ok" }], arrow: { from: "disk", to: "cache", label: "data" } },
    { caption: "Evicted…", remove: ["pg"] },
  ]}
/>
```

- **regions** are places, laid out on a grid by `col`, `row` and optional `span`. Use two or
  three rows of one to three regions. `sub` is a short property ("RAM", "survives power
  loss", "~45 µs").
- **items** are things, identified by `id`. An item whose `at` changes glides to the new
  region. A frame either lists every item (`items`) or changes the previous frame with
  `add`, `change` (merge by id), `remove`.
- **tones:** `default`; `accent` (being worked on now); `new` (just created); `dirty`
  (changed, not yet saved); `ok` (done, safe, correct); `bad` (lost, wrong, at risk); `dim`
  (background, irrelevant).
- **focus:** the regions to highlight. **arrow:** a request or copy in flight between two
  regions, with a short code-style label.
- **itemWidth:** raise it (110–140) when labels are longer than about 11 characters. Keep
  labels short: "block 7", "inode 12 · 0", "TxB", "SYN". Put detail in `sub`.
- **caption:** one or two plain sentences, `**bold**` and `` `code` `` allowed, saying what
  happens in this step and why. Captions must not use undefined terms.
- Six or seven frames is typical. The first frame shows the starting state, and the last
  shows the end state and what it means.
- Draw the running example (block 7, inode 12, the reader's request), never a generic "item
  A".

**`<StepSequence>`:** messages between actors over time, when ordering is the point
(handshakes, consensus rounds, fsyncgate). Syntax: `actors={["A","B"]}`,
`messages={[{ from: 0, to: 1, label: "write", note: "caption" }]}`.

**`<Steps>`:** a request passing through fixed layers with nothing else changing. Prefer
`<Scene>` if any state changes.

**Static figures** go inside `<Figure caption="…">`. `<Cells rows={[{ label, cells: [...], cursor }]} cellWidth={64} />`
draws numbered slots (blocks, array cells, ring buffers). `<Tree root={{ label, sub, children: […] }} nodeWidth={112} />`
draws hierarchies. The caption, or the paragraph before, says what to look at.

**`<Predict q="…" options={[…]} answer={i}>explanation</Predict>`:** one or two per chapter,
at a moment where the reader can reason the answer out from what they've just learned. The
wrong options should be what a beginner would plausibly believe.

**`<Why>Question?</Why>`:** a subhead for the question a reader asks at that point, answered
in the paragraph below. Three to eight per chapter.

**`<Callout label="Design implication">` / `<Callout label="Common mistake" kind="warn">`:**
two to five per chapter. Each one states a consequence for how you build or run systems.

**Tables:** for comparisons and for the reference sections. A promises table has
Situation / Promised? / What it means.

**`<Cost items={[{ what, value, source }]} />` and `<Estimate rows result />`:** for the costs
section. `source` says what the number includes ("includes ~350 ns to enter the kernel") and
never names a machine.

### The reference end of the chapter

- **Costs section (if the old chapter had numbers):** put the numbers side by side, then
  work through one realistic calculation (ch08: 10,000 commits a second, then group commit).
- **Operating section:** commands grouped by the question they answer, with a comment
  pointing back to the section that raised it. Then "Rules that hold up", a trade-off
  table, and a symptom → cause → fix table, all in the chapter's vocabulary.
- **Summary:** 8–11 numbered items in the order the chapter taught them, each starting with
  a bold claim the reader can now explain.
- **Build this:** an exercise that makes the reader see the chapter's key effect themselves.
  Keep the old exercise if it's good, and reword it in the new voice.
- **Interview questions:** keep every QA. Rewrite the answers in the chapter's terms, with no
  first-person measurement talk.
- **Go deeper / Related chapters:** keep every card. Add OSTEP's matching chapters as a card
  when they exist.

## Step 4: run what you show

- If you keep a `<TryIt>` unchanged, keep its code and output byte for byte.
- If you change its code, filenames or text, run it exactly as written in a fresh directory
  under your scratch area, and paste the real output. For python, c and cpp:
  `python3 scripts/verify-tryit.py <NN>` checks the first block. Use
  `KNOWSYS_PY=<a python with the needed packages>` if it imports duckdb, boto3 and similar.
  Run shell blocks by hand when they only need local tools. Never change a block you can't
  run (Docker, cloud, root): keep it verbatim.
- Timings vary from run to run. Describe them as approximate in prose.

## Step 5: check

```
npm run -s check:mdx                                                 # must say clean
python3 ~/.claude/skills/teach-writing/scripts/tells.py content/chapters/<file>.mdx   # 0 tells
python3 scripts/check-ai-tells.py content/chapters/<file>.mdx       # 0
grep -n -i -E "measured on|this machine|apple m4|i measured|verified|validated|my first attempt" content/chapters/<file>.mdx   # nothing
```

Fix every hit by rewriting the sentence, never by swapping a synonym.

## Step 6: read it as the newcomer

Read the finished file top to bottom as the reader from Step 2. For every paragraph:

1. Does every word already mean something, given only what came before? Check the term list.
2. Do I know why I'm being told this?
3. Can I picture it, on the running example?
4. Could I explain it back?

Then check each section: does its first sentence follow from the last sentence of the
section before? Then go through Julia Evans's patterns (in the research file): starting
abstract, meaningless jargon, too many concepts at once, unsupported statements, no
examples, "what" without "why". Rewrite whatever fails. Expect to rewrite parts of your
draft at this stage. That's normal.

## Step 7: report

Finish with a short report: the running example and chain you chose; facts you corrected
and why; facts you couldn't check; TryIt blocks you re-ran or kept verbatim; word count;
check results. Don't commit; the coordinator commits.

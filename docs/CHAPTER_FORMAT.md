# Chapter format

Tone, pacing and the ease-in-then-deep arc live in
`.claude/skills/write-chapter/SKILL.md`; this file covers structure, components
and checks. Reference chapters: `06-processes-scheduling` (gentle start),
`04-virtual-memory` (problem-first opening), `10-linux-networking` (components).

The reference chapter is `content/chapters/10-linux-networking.mdx`. Read it in
full before converting or writing a chapter. The model it follows is a good
course lesson (AlgoMaster's system-design lessons are the benchmark the site
owner chose): organised by topic, taught in short steps, with a picture for
every process and a table for every comparison.

## Shape

```
frontmatter   title, dek (1–2 sentences: what you'll learn), readingTime, level
              (Beginner | Intermediate | Advanced), versions, prereqs (short, plain:
              "syscalls, TCP basics"), updated
intro         No heading. Start from something the reader can picture (a running
              example used for the whole chapter), raise the chapter's one question,
              and say in a sentence where the chapter goes.
01..N         Numbered sections by TOPIC, in teaching order, simple → deep.
              <SectionHeading n="01" id="kebab-id">Title</SectionHeading>
              Each has 1–6 <Sub n="1.1" title="…"> subsections.
N+1           Summary: a numbered list of 8–10 one-sentence takeaways, each
              starting with a bold claim.
tail          Build this · Interview questions · Go deeper · Related chapters
              (keep the existing tail content; renumber).
```

Section ids are free-form kebab-case now (the archetype spine is retired).
Every `<Sub>` number must match its section (`2.1` under `02`).

## Teaching rules

- **Connected paragraphs.** A paragraph is a chain of reasoning (because, so, but,
  which means). Length follows the thought; never chop an explanation into
  fragments. Each section ends on the question the next one answers.
- **Answer the next question.** Use `<Why>Why …?</Why>` subheads for the
  question a learner would ask at that point, and answer it directly in the
  paragraph below. 3–8 per chapter.
- **A picture for every process.** Anything that happens in steps (a request,
  a fault, a lock acquisition, a handshake, a scheduling decision) gets a
  step-through diagram:
  - `<Steps title lanes={[{t, s, icon}]} steps={[[laneIndex, "caption"]]} />`
    for a pipeline: one thing moving through fixed stages (max 6 lanes).
  - `<StepSequence title actors={[…]} messages={[{from, to, label, note}]} />`
    for messages between actors over time.
  Captions are one or two plain sentences; `**bold**` and `` `code` `` work.
  At least 2 diagrams per chapter, 3–4 for long ones. Each must show something
  specific to the topic, not a generic flow.
- **A table for every comparison.** Options vs trade-offs, symptom → cause →
  fix, defaults and what they mean. Use markdown tables (they render as cards)
  or `<Compare>` for numeric data.
- **Callouts carry the consequence.** `<Callout label="Design implication">`
  for what this means for how you build systems; `kind="warn"` with
  `label="Common mistake"` for a frequent error. 2–5 per chapter.
- **Predict before revealing.** At least one `<Predict q options answer>`
  explanation `</Predict>` at a point where the reader can reason it out.
- **Voice.** A person talking: "we" while designing, "you" for the reader,
  contractions. Real systems named (Postgres, Kubernetes, Redis, nginx, the JVM…).
  Never narrate the writer's own process: no "measured on my M4", "I verified",
  "my first attempt". Numbers are stated as facts about the system, rounded and
  given a sense of scale. `toolchain` on TryIt is for maintainers and isn't shown.

## What to keep from the old chapters

Every fact, number, version, source link, `<SourceRead>` quote, `<TryIt>` /
`<Output>` block and measurement stays, unless it's wrong. Reorganise and
rewrite around them; don't delete evidence. Numbers in new sentences must come
from the existing chapter or a linked source.

## Checks

```
npm run -s check:mdx
python3 scripts/check-ai-tells.py content/chapters/<file>.mdx      # 0 tells
node ~/.claude/skills/tech-blog/scripts/check.js content/chapters/<file>.mdx
node -e "import('@mdx-js/mdx').then(async m=>{await m.compile(require('fs').readFileSync(process.argv[1],'utf8'));console.log('ok')})" <file>
```

The tech-blog checker was tuned on personal blogs. Fix any "phrases to cut" it
reports; for the axes (hedges, "The" openers), stay inside the range but don't
contort a clear teaching sentence to do it.

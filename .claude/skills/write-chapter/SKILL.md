---
name: write-chapter
description: KnowSys layer for writing or rewriting a chapter in content/chapters/*.mdx. Use whenever creating, rewriting, restructuring or reviewing a chapter, its opening, sections or diagrams. Load the teach-writing skill too; it holds the tone, arc and banned phrasing.
---

# Writing a KnowSys chapter

**First load the `teach-writing` skill** (`~/.claude/skills/teach-writing`). It
holds the rules that apply to every chapter: ease the reader in then go deep,
the arc, sentence rules, banned phrasing, evidence rules. This file only adds
what is specific to this repo.

Then read `docs/CHAPTER_FORMAT.md` (component syntax) and a reference chapter:

| Chapter | Use it for |
|---|---|
| `06-processes-scheduling` | Gentle start: hands-on first, then depth. The model for OS chapters |
| `04-virtual-memory` | Opening built from a problem, one worked numeric example |
| `10-linux-networking` | Component usage, diagrams, tables |

## How the arc maps onto MDX

- Opening: prose under the frontmatter, no heading.
- Section 01 "touch it": a `<TryIt what lang toolchain>` with an `<Output>`
  block. The output must come from a command you ran; the `toolchain` line names
  the machine.
- Simple model: `<Steps>` for a pipeline (max 6 lanes), `<StepSequence>` for
  messages between actors, a markdown table for from / to / because.
- Breaks then fix: a `<Predict q options answer>` with a small worked number.
- Subheads that ask the reader's next question: `<Why>…</Why>`, 3–8 per chapter.
- Callouts carry a consequence: `<Callout label="Design implication">` and
  `kind="warn"` with `label="Common mistake"`, 2–5 per chapter.
- At least 2 diagrams per chapter, 3–4 for long ones.
- Close: numbered Summary, then Build this, Interview questions, Go deeper,
  Related chapters (keep existing tail content, renumber).
- Keep every `<SourceRead>` quote, measurement and source link.

## Rewriting a chapter

1. Save the old file: `git show HEAD:content/chapters/<file> > $SCRATCH/old.mdx`.
2. Follow the rewrite steps in `teach-writing`. Renumber `SectionHeading n`,
   every `Sub n` (must match its section), and prose such as "section 6 shows".
   `grep -n -E '[Ss]ection [0-9]+'` afterwards (two-digit references and the
   `versions:` frontmatter line are easy to miss when renumbering by regex).
   Don't shift section numbers that cite an outside paper or spec ("Llama 3
   paper, section 3.3.4"); read each hit rather than trusting the regex. Renumbering misses these: plural ("sections 3 to 5"), line-broken ("section\n4"),
   and cross-chapter refs ("chapter 16, sections 2 to 4") when the target chapter
   was itself renumbered. Grep for all three. Diff old and new refs
   (`git show HEAD:<file> | grep -n -E '[Ss]ection [0-9]+'`) and check every
   one that sits inside a WildCard/paper citation.
3. Update `updated:` and `level:` in the frontmatter. Check other files for links
   to section ids you renamed.
4. One chapter at a time, and open the page (`npm run dev`, `/topics/<id>`)
   before moving on.

## Checks

Run every `<TryIt>` exactly as written, from a clean directory, and paste what it
prints. `python3 scripts/verify-tryit.py <n>` does this for the python, c and
cpp blocks; shell blocks (Docker, Redis, openssl) you run by hand. Things that
went wrong before: a command that needs `docker run` shown without it, a
setup step (`sleep`, waiting for a server) missing from the block, output
whitespace that didn't match, and a claim like "both times 68.3 ns" true of one
run only. Say when numbers vary, and give the range.

```
npm run -s check:mdx
python3 scripts/check-ai-tells.py content/chapters/<file>.mdx      # 0 tells
python3 ~/.claude/skills/teach-writing/scripts/tells.py content/chapters/<file>.mdx
node ~/.claude/skills/tech-blog/scripts/check.js content/chapters/<file>.mdx
node -e "import('@mdx-js/mdx').then(async m=>{await m.compile(require('fs').readFileSync(process.argv[1],'utf8'));console.log('ok')})" <file>
```

The tech-blog checker was tuned on personal blogs. Fix "phrases to cut"; a
slightly high "sentences starting The" isn't worth contorting a clear sentence.
Design choices are shown as HTML mockups, never as option lists in chat.

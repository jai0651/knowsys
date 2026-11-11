---
name: write-case-study
description: KnowSys procedure for writing a System Design Case Study chapter (content/chapters/49+, "Designing X"). Use when creating or rewriting a case study. Builds on write-chapter; Uber (ch 50) is the reference.
---

# Writing a system design case study

Load `.claude/skills/write-chapter/SKILL.md` and `docs/CHAPTER_FORMAT.md` first; everything there still applies. Then read `content/chapters/50-design-uber.mdx` end to end. It is the template, and the user rated it above WhatsApp (ch 49). Match its voice, length (8–11k words), pacing and component use.

## Shape

- **One running example.** A named person doing one concrete thing (Priya taps Request outside Pune station). Every section returns to it. Open with the scene, then the problem hidden in it, then one bold question the chapter answers.
- **Requirements and scale first**, with real dated figures and a `<Think>` back-of-envelope estimate the reader does before the answer.
- **Version 1 is the naive design.** Each later section starts from exactly where the previous design breaks, and fixes it. Naive → breaks → fix, never a catalogue of components.
- **Go top to bottom**: boxes, then a component, then its data structure or algorithm, with `<Zoom path=[...]>` showing the depth. Every case study reaches at least one real data structure/algorithm in detail (bit layouts, the actual algorithm, the math).
- **Tradeoffs are the point.** Each major choice is a `<Decision>` with the real options, pluses/minuses, what was chosen and why. Name what the company actually chose, and when it changed its mind (dated).
- `<Elsewhere>` after key techniques: where the same idea shows up in other systems.
- Tail: interview-style `<QA>`s, a `<Quiz>`, Go-deeper `<CardGrid>` of primary sources, Related chapters. Copy the Uber tail's structure.

## Engineering boxes (required)

A story alone doesn't get anyone through an interview. Readers also want to know which database, which queue, which cache, which index, and why each one won. That detail goes in closed boxes so the story still reads straight through. Uber (ch 50) is the reference for all of these.

- **6–10 `<DeepDive kind title answer id>`s**, placed where the story makes the choice, not saved up for the end. `answer` is the one-line answer and stays visible while the box is closed. Inside go real artefacts: `CREATE TABLE` / `CREATE INDEX` with a comment on which query each index serves, Redis/Kafka commands, partition keys, TTLs, and a comparison table of the options (Kafka vs RabbitMQ vs SQS, Postgres vs Cassandra vs Spanner…) with what the company actually picked and when. Use `####` for sub-headings inside a box.
- Every case study covers at least: the **API** (endpoints, transport, idempotency), the **primary database and why**, the **schema with its indexes and shard key**, the **queue/stream** and its partition key, the **cache** (key design, TTL, what happens when it's stale), and the **real-time channel** if there is one. Kinds: `database schema index stream cache api realtime consistency scaling storage`.
- **One `<Stack rows>` blueprint** in "The whole system": layer, pick, why, `over` (what it beat), `href="#dd-…"` to the box that argues it.
- **3 `<Checkpoint n have broken q>`s** at the big turns (roughly a third, half and three quarters through): what the design has now, what still breaks (the next section's problem), and a self-check whose answer is the children.
- **3–5 `<Insight>`s**, one sentence each, at the ideas a reader should leave holding. Never one per section; that's the "lesson at the end of every section" tell.
- Where the company's internals aren't public, say so inside the box and give the standard design ("this is the shape a design needs, not their columns").
- Code blocks over 16 lines fold automatically; don't split code to dodge that.

## Voice

Run `node ~/.claude/skills/tech-blog/scripts/check.js` on the chapter, and on the DeepDive text alone (strip code and tables). Both must read within the human range: contractions, the odd aside and question, honest hedges where internals are guessed, few sentences opening with "The", no "rather than" / "the reason is" / "which is why".

## Visuals (required)

- **4+ `<SystemDiagram>`s** with animated step-through request paths (see `src/components/` for the props; copy usage from ch 49/50). The final one is the full design.
- **6–10 real images** via `<Picture>` with `credit` and `href`. Only images with a confirmed reusable licence: Wikimedia Commons (check the file page licence), public-domain/government, or open-source project docs under Apache/MIT/CC. Never blog, news, or company marketing images. Download to `public/images/designs/<slug>/`, record the licence in the credit line. Images must teach something (a diagram, a real artefact), not decorate.
- 2–3 runnable `<TryIt>` experiments where a small computation makes the point (see ch 50). Run `scripts/verify-tryit.py` if it applies.

## Evidence

- Research from primary sources: engineering blogs of the company itself, conference talks, papers, filings, open-source docs. Date every number ("in 2023, …").
- If internals are unpublished, say "unpublished" and reason about what a design would need; never invent internals or numbers.
- No provenance lines ("I verified", "measured on…"). State facts plainly. See the memory rule on this.

## Checks before handing back

Confirm the engineering boxes above are all present. Run the four checks in `docs/CHAPTER_FORMAT.md` (check:mdx clean, 0 AI tells, tech-blog checker in human range, MDX compiles), and confirm every image path exists. Don't edit `content/manifest.json`, shared components or other chapters; report the manifest entry (title, hook, short) instead.

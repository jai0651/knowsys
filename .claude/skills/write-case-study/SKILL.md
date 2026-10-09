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

## Visuals (required)

- **4+ `<SystemDiagram>`s** with animated step-through request paths (see `src/components/` for the props; copy usage from ch 49/50). The final one is the full design.
- **6–10 real images** via `<Picture>` with `credit` and `href`. Only images with a confirmed reusable licence: Wikimedia Commons (check the file page licence), public-domain/government, or open-source project docs under Apache/MIT/CC. Never blog, news, or company marketing images. Download to `public/images/designs/<slug>/`, record the licence in the credit line. Images must teach something (a diagram, a real artefact), not decorate.
- 2–3 runnable `<TryIt>` experiments where a small computation makes the point (see ch 50). Run `scripts/verify-tryit.py` if it applies.

## Evidence

- Research from primary sources: engineering blogs of the company itself, conference talks, papers, filings, open-source docs. Date every number ("in 2023, …").
- If internals are unpublished, say "unpublished" and reason about what a design would need; never invent internals or numbers.
- No provenance lines ("I verified", "measured on…"). State facts plainly. See the memory rule on this.

## Checks before handing back

Run the four checks in `docs/CHAPTER_FORMAT.md` (check:mdx clean, 0 AI tells, tech-blog checker in human range, MDX compiles), and confirm every image path exists. Don't edit `content/manifest.json`, shared components or other chapters; report the manifest entry (title, hook, short) instead.

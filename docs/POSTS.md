# Field notes — how a post differs from a chapter

A chapter is reference. It answers a fixed set of questions about one subject,
in the order its archetype dictates, and people come back to it. A post is one
story told start to finish and read in one sitting, on a phone, on a train.
Everything in `docs/STYLE.md` still applies. This file covers what changes.

Posts live in `content/posts/<slug>.mdx`. There is no manifest entry: the
directory is the list, sorted by `date`.

```yaml
---
title: "You paid for four CPUs and got throttled at 40%"
dek: "One sentence that makes someone who has been paged for this stop scrolling."
date: "2026-09-25"
readingTime: "~12 min"
kicker: "Incident"          # Incident · Reproduction · Field guide · Myth
tags: ["linux", "cgroups", "kubernetes"]
related: ["06-processes-scheduling", "11-containers"]   # chapter slugs
---
```

## The shape

There isn't a required one, and that's deliberate. What most good posts here
end up doing:

1. **Set the scene first.** One or two short paragraphs before the incident:
   what the system is, what the reader already uses it for, and why this
   failure matters to anyone running it. Then the symptom: a graph that makes
   no sense, a p99 that doubled when nothing changed. The reader should know
   why they're reading before the mystery starts.
2. **The wrong theories, in the order people had them.** This is the fun part
   and the part generated writing skips. The first two explanations everyone
   reaches for are usually plausible and usually wrong, and knowing *why* they
   are wrong teaches more than the right answer.
3. **The machinery.** Just enough of the mechanism to make the symptom
   inevitable. Link to the chapter for the rest; don't rewrite it.
4. **Reproduce it.** A program that shows the effect on a laptop or in
   `docker run`. This is what makes a post trustworthy, not the citations.
5. **What to do on Monday.** The config line, the metric to alert on, the
   question to ask in design review. Short, and in one place at the end.

## Rules specific to posts

- **Real incidents only, and attributed.** Every outage named here happened and
  links to its postmortem, mailing-list thread, commit or talk. No composite
  "a company I worked with" stories, and no invented first-person war stories.
  "I" is for what the author actually ran while writing the post.
- **Measured on the page or attributed.** Same rule as chapters. Say which
  machine: `Apple M4, macOS 26` or `Docker Desktop, linuxkit 6.10, aarch64`.
- **1,800–3,500 words.** Long enough to earn the reproduction, short enough to
  finish.
- **Fun comes from the specifics.** The 40 ms that turns out to be two
  timers disagreeing. The leap second that made a futex spin. Not from jokes,
  exclamation marks, or telling the reader it will be fun.
- **One callout, maybe two.** The moment the mystery resolves gets a
  `<Callout label="...">`. The rest is prose.
- **Headings are plain `##` markdown.** Posts do not use `<SectionHeading>`;
  they have no spine and no rail.

All three checkers run on posts: `npm run check:mdx`,
`python3 scripts/check-ai-tells.py content/posts/<slug>.mdx`, and
`node ~/.claude/skills/tech-blog/scripts/check.js content/posts/<slug>.mdx`.

import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { Callout, TryIt, Output, SourceRead, Cost, QA, WildCard, CardGrid, StubNote } from "./content";
import { SectionHeading } from "./section";
import { Sub, Approach, Estimate, Figure, Quiz, Q, Compare } from "./scaffold";
import { MemoryLayout, Flow, Sequence, Tree, Cells, Plot } from "./diagrams";
import { Panel } from "./terminal-frame";

export const mdxComponents: MDXComponents = {
  Callout,
  TryIt,
  Output,
  SourceRead,
  Cost,
  QA,
  WildCard,
  CardGrid,
  StubNote,
  SectionHeading,
  Panel,
  Sub,
  Approach,
  Estimate,
  Figure,
  Quiz,
  Q,
  Compare,
  MemoryLayout,
  Flow,
  Sequence,
  Tree,
  Cells,
  Plot,
  h2: (props) => (
    <h2
      {...props}
      className="mt-14 scroll-mt-20 text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]"
    />
  ),
  h3: (props) => (
    <h3 {...props} className="mt-9 scroll-mt-20 text-[19px] font-semibold text-ink" />
  ),
  a: ({ href = "", ...props }) =>
    href.startsWith("/") ? (
      <Link href={href} {...props} />
    ) : (
      <a href={href} target="_blank" rel="noopener" {...props} />
    ),
  pre: (props) => (
    <pre
      {...props}
      className="glass my-6 overflow-x-auto rounded-2xl p-5 text-[13.3px] leading-relaxed"
      style={{ background: "var(--code-bg)" }}
    />
  ),
};

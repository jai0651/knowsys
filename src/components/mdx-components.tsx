import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { Callout, TryIt, Output, SourceRead, Cost, QA, WildCard, CardGrid, StubNote } from "./content";
import { SectionHeading } from "./section";
import { Sub, Approach, Estimate, Figure, Quiz, Q, Compare } from "./scaffold";
import { MemoryLayout, Flow, Sequence, Tree, Cells, Plot } from "./diagrams";
import { Panel } from "./terminal-frame";
import { CodeBlock } from "./code-block";

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
      className="mb-4 mt-14 scroll-mt-24 text-[25px] font-bold leading-tight tracking-[-0.015em] text-ink sm:text-[28px]"
    />
  ),
  h3: (props) => (
    <h3 {...props} className="mb-3 mt-10 scroll-mt-24 text-[19px] font-semibold tracking-[-0.01em] text-ink" />
  ),
  a: ({ href = "", ...props }) =>
    href.startsWith("/") ? (
      <Link href={href} {...props} />
    ) : (
      <a href={href} target="_blank" rel="noopener" {...props} />
    ),
  pre: (props) => <CodeBlock {...props} />,
};

import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { Callout, TryIt, Output, SourceRead, Cost, QA, WildCard, CardGrid, StubNote } from "./content";
import { SectionHeading, Why } from "./section";
import { Steps, StepSequence } from "./steps";
import { Scene } from "./scene";
import { SystemDiagram } from "./system-diagram";
import { Think, Decision, Elsewhere, Zoom, Picture } from "./design";
import { Predict } from "./predict";
import { RaceLab } from "./labs/race-lab";
import { LockLab } from "./labs/lock-lab";
import { QueueingLab } from "./labs/queueing-lab";
import { RaftLab } from "./labs/raft-lab";
import { StorageLab } from "./labs/storage-lab";
import { HashingLab } from "./labs/hashing-lab";
import { CacheLab } from "./labs/cache-lab";
import { MvccLab } from "./labs/mvcc-lab";
import { PacketLab } from "./labs/packet-lab";
import { Milestone } from "./milestone";
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
  Why,
  Steps,
  StepSequence,
  Scene,
  SystemDiagram,
  Think,
  Decision,
  Elsewhere,
  Zoom,
  Picture,
  Predict,
  RaceLab,
  LockLab,
  QueueingLab,
  RaftLab,
  StorageLab,
  HashingLab,
  CacheLab,
  MvccLab,
  PacketLab,
  Milestone,
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

import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { mdxComponents } from "./mdx-components";
import { mdxOptions } from "@/lib/rehype";

/* Compiled with @mdx-js/mdx directly rather than next-mdx-remote.
   next-mdx-remote v6 runs remove-javascript-expressions on every document — a
   sensible default when the MDX is user-submitted, and exactly wrong here. It
   silently drops every expression attribute, so <Cost items={[...]} /> arrives
   as <Cost /> with no error. Our content is in-repo and trusted. */
export async function Mdx({ source }: { source: string }) {
  const { default: Content } = await evaluate(source, {
    ...runtime,
    ...mdxOptions,
  } as Parameters<typeof evaluate>[1]);

  return <Content components={mdxComponents} />;
}

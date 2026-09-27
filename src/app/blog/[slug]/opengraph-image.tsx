import { ogImage, OG_SIZE } from "@/lib/og";
import { allPosts, postBySlug } from "@/lib/posts";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "KnowSys field note";

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = postBySlug(slug);
  return ogImage({ kicker: `Field note · ${p?.kicker ?? ""}`, title: p?.title ?? "KnowSys", dek: p?.dek });
}

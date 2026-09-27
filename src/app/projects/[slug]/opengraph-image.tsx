import { ogImage, OG_SIZE } from "@/lib/og";
import { allProjects, projectBySlug } from "@/lib/projects";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "KnowSys project roadmap";

export function generateStaticParams() {
  return allProjects().map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = projectBySlug(slug);
  return ogImage({ kicker: "Build it yourself", title: p ? `Build ${p.title}` : "KnowSys", dek: p?.tagline });
}

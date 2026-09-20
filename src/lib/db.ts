import { neon } from "@neondatabase/serverless";

/** Page ids are namespaced because this database is shared with KnowML.
 *  Both sites number chapters from 01, so an un-namespaced "22-redis" and
 *  "22-world-models" would be fine but "01-..." would not stay fine for long. */
export const NS = "ks:";

export const hasDb = () => Boolean(process.env.DATABASE_URL);

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/** Slugs only. Keeps anything else out of a query and out of the table. */
export const validId = (s: unknown): s is string =>
  typeof s === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(s);

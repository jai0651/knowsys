import { NextResponse } from "next/server";
import { getSql, hasDb, validId, NS } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Per-page view and like counters.
 *
 * Ported from KnowML's api/counters.js. The table is shared between the two
 * sites and page ids are namespaced with "ks:".
 *
 * Nothing identifying is stored. There is no IP column, no user agent and no
 * cookie — a like is held in the reader's own localStorage, so the server only
 * ever sees an increment or a decrement. */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET(req: Request) {
  const pageId = new URL(req.url).searchParams.get("pageId");
  if (!validId(pageId)) return json({ error: "invalid pageId" }, 400);
  if (!hasDb()) return json({ pageId, views: 0, likes: 0, disabled: true });

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT views, likes FROM page_counters WHERE page_id = ${NS + pageId}
    `;
    const r = rows[0] ?? { views: 0, likes: 0 };
    return json({ pageId, views: Number(r.views), likes: Number(r.likes) });
  } catch (e) {
    console.error("counters GET:", e);
    return json({ pageId, views: 0, likes: 0, error: true });
  }
}

export async function POST(req: Request) {
  let body: { pageId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad body" }, 400);
  }
  const { pageId, action } = body;
  if (!validId(pageId)) return json({ error: "invalid pageId" }, 400);
  if (!["view", "like", "unlike"].includes(action ?? ""))
    return json({ error: "action must be view, like or unlike" }, 400);
  if (!hasDb()) return json({ pageId, views: 0, likes: 0, disabled: true });

  const id = NS + pageId;
  try {
    const sql = getSql();
    let rows;
    if (action === "view") {
      rows = await sql`
        INSERT INTO page_counters (page_id, views, likes) VALUES (${id}, 1, 0)
        ON CONFLICT (page_id) DO UPDATE SET views = page_counters.views + 1
        RETURNING views, likes`;
    } else if (action === "like") {
      rows = await sql`
        INSERT INTO page_counters (page_id, views, likes) VALUES (${id}, 0, 1)
        ON CONFLICT (page_id) DO UPDATE SET likes = page_counters.likes + 1
        RETURNING views, likes`;
    } else {
      rows = await sql`
        INSERT INTO page_counters (page_id, views, likes) VALUES (${id}, 0, 0)
        ON CONFLICT (page_id) DO UPDATE SET likes = GREATEST(page_counters.likes - 1, 0)
        RETURNING views, likes`;
    }
    const r = rows[0];
    return json({ pageId, views: Number(r.views), likes: Number(r.likes) });
  } catch (e) {
    console.error("counters POST:", e);
    return json({ error: "internal" }, 500);
  }
}

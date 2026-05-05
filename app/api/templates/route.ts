import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/utils/mongodb/client";
import { COLLECTIONS } from "@/utils/supabase/constant";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  const db = await getDb();
  const filter = key ? { key } : {};
  const templates = await db
    .collection(COLLECTIONS.TEMPLATES)
    .find(filter, { projection: { _id: 1, key: 1, name: 1, value: 1 } })
    .toArray();

  return NextResponse.json(
    templates.map((t) => ({ ...t, id: t._id })),
  );
}

import { NextResponse } from "next/server";
import { runMainAgent } from "@/lib/agents/MainAgent";
import { getDb } from "@/utils/mongodb/client";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, sessionId } = body as {
      message: string;
      sessionId?: string;
    };

    if (!message || typeof message !== "string" || message.trim() === "") {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'message' string." },
        { status: 400 },
      );
    }

    const db = await getDb();
    const org = await db
      .collection(COLLECTIONS.ORGANIZATIONS)
      .findOne({ _id: DEFAULT_ORG_ID } as unknown as import("mongodb").Filter<import("mongodb").Document>, { projection: { assistant_name: 1 } });

    const { output, sessionId: resolvedSessionId } = await runMainAgent({
      userMessage: message.trim(),
      sessionId,
      assistantName: (org?.assistant_name as string | null) ?? null,
    });

    return NextResponse.json({ output, sessionId: resolvedSessionId });
  } catch (error) {
    console.error("[agent/route] Unhandled error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

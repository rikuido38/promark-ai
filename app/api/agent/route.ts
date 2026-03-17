import { NextResponse } from "next/server";
import { runMainAgent } from "@/lib/agents/MainAgent";
import { createClient } from "@/utils/supabase/server";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";

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

    const supabase = await createClient();
    const { data: org } = await supabase
      .from(TABLES.ORGANIZATIONS)
      .select("assistant_name")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    const { output, sessionId: resolvedSessionId } = await runMainAgent({
      userMessage: message.trim(),
      sessionId,
      assistantName: org?.assistant_name ?? null,
      supabase,
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

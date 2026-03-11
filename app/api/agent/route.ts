import { NextResponse } from "next/server";
import { AgentResponse } from "@/types/agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt } = body;

    // TODO: Initialize and call Google ADK Agent here
    // For now, return a scaffolded text response

    const responsePayload: AgentResponse = {
      type: "text",
      content: `I received your prompt: "${prompt}". The ADK integration is being set up.`,
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("Agent Route Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

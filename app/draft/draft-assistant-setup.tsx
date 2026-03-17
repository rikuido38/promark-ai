"use client";

import { useEffect } from "react";
import { useAIAssistant } from "@/components/ai-assistant-provider";
import type { MessageHandlerResult } from "@/components/assistant-chatbot";

/**
 * Registers an illustration-generation message handler with the global AI
 * assistant while the Draft page is mounted.  Sends the user's prompt to
 * POST /api/generation/illustration and returns the signed image URL so the
 * chatbot can render it inline.
 */
export function DraftAssistantSetup() {
  const { setMessageHandler } = useAIAssistant();

  useEffect(() => {
    const handler = async (message: string): Promise<MessageHandlerResult> => {
      const res = await fetch("/api/generation/illustration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: message }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Generation failed");
      }

      const data = (await res.json()) as { signedUrl: string; path: string };
      return {
        content: "Here's your generated illustration:",
        imageUrl: data.signedUrl,
      };
    };

    setMessageHandler(handler);
    return () => setMessageHandler(undefined);
  }, [setMessageHandler]);

  return null;
}

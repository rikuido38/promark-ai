"use client";

import { useEffect } from "react";
import { useAIAssistant } from "@/components/ai-assistant-provider";
import type { AssistantOutput } from "@/types/agent";

/**
 * Registers an illustration-generation message handler with the global AI
 * assistant while the Draft page is mounted.  Sends the user's prompt to
 * POST /api/generation/illustration and returns the signed image URL so the
 * chatbot can render it inline.
 */
export function DraftAssistantSetup() {
  const { setMessageHandler, setAvailableModels } = useAIAssistant();

  useEffect(() => {
    setAvailableModels(["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5"]);

    const handler = async (message: string, model?: string): Promise<AssistantOutput> => {
      const res = await fetch("/api/generation/illustration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: message, model }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Generation failed");
      }

      const data = (await res.json()) as { output: AssistantOutput; sessionId: string };
      return data.output;
    };

    setMessageHandler(handler);
    return () => {
      setMessageHandler(undefined);
      setAvailableModels([]);
    };
  }, [setMessageHandler, setAvailableModels]);

  return null;
}

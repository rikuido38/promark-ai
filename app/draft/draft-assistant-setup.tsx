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
    setAvailableModels(["gpt-image-2", "gpt-image-1.5"]);

    const handler = async (message: string, model?: string): Promise<AssistantOutput> => {
      // The chatbot appends attachment URLs as "\n\nAttached images:\n{url}\n{url}".
      // Split them out so we can send a clean prompt + structured URL list.
      const attachSplit = message.split("\n\nAttached images:\n");
      const prompt = attachSplit[0].trim();
      const sampleImageUrls = attachSplit[1]
        ? attachSplit[1].split("\n").map((u) => u.trim()).filter(Boolean)
        : [];

      const res = await fetch("/api/generation/illustration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, sampleImageUrls }),
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

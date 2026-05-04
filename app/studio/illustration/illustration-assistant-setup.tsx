"use client";

import { useEffect } from "react";
import { useAIAssistant } from "@/components/ai-assistant-provider";
import type { AssistantOutput } from "@/types/agent";
import type { GenerationSettings } from "@/types/generation-settings";

/**
 * Registers an illustration-generation message handler with the global AI
 * assistant while the Studio Illustration page is mounted.
 */
export function IllustrationAssistantSetup() {
  const { setMessageHandler, setAvailableModels, setAssistantIdentifier } = useAIAssistant();

  useEffect(() => {
    setAvailableModels(["gpt-image-2", "gpt-image-1.5"]);
    setAssistantIdentifier("draft-illustration");

    const handler = async (
      message: string,
      model?: string,
      settings?: GenerationSettings,
    ): Promise<AssistantOutput> => {
      const attachSplit = message.split("\n\nAttached images:\n");
      const prompt = attachSplit[0].trim();
      const sampleImageUrls = attachSplit[1]
        ? attachSplit[1].split("\n").map((u) => u.trim()).filter(Boolean)
        : [];

      const res = await fetch("/api/generation/illustration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, sampleImageUrls, settings }),
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
      setAssistantIdentifier(undefined);
    };
  }, [setMessageHandler, setAvailableModels, setAssistantIdentifier]);

  return null;
}

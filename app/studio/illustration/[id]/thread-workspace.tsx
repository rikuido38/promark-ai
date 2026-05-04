"use client";

import { useState, useEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AssistantChatbot, type Message } from "@/components/assistant-chatbot";
import { ImagePreviewPanel } from "./image-preview-panel";
import { saveChatMessage, markNewChatDone } from "./actions";
import type { MediaItem, AssistantOutput } from "@/types/agent";
import type { GenerationSettings } from "@/types/generation-settings";
import type { StudioThreadChat } from "./actions";

interface ThreadWorkspaceProps {
  threadId: string;
  initialPrompt?: string;
  initialModel?: string;
  isNewChat: boolean;
  chatHistory: StudioThreadChat[];
}

async function illustrationHandler(
  message: string,
  model?: string,
  settings?: GenerationSettings,
): Promise<AssistantOutput> {
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
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Generation failed");
  }

  const data = (await res.json()) as { output: AssistantOutput; sessionId: string };
  return data.output;
}

/** Convert DB chat rows to the Message shape AssistantChatbot expects. */
function historyToMessages(history: StudioThreadChat[]): Message[] {
  return history.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    medias: row.image_signed_urls.map((url, i) => ({
      filename: row.image_storage_paths[i] ?? url,
      signedUrl: url,
      type: "image" as const,
      storagePath: row.image_storage_paths[i],
    })),
  }));
}

export function ThreadWorkspace({
  threadId,
  initialPrompt,
  initialModel,
  isNewChat,
  chatHistory,
}: ThreadWorkspaceProps) {
  // isNewChat comes from the DB — use it only to fire the DB update.
  // For the actual auto-send decision we use chatHistory.length === 0 so
  // there is no dependency on DB round-trip timing.
  const isNewChatLocal = chatHistory.length === 0;

  // Flip is_new_chat to false immediately on mount (parallel with AI auto-trigger)
  useEffect(() => {
    if (isNewChat) {
      markNewChatDone(threadId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Collect all medias from history + live responses for the right panel
  const [allMedias, setAllMedias] = useState<MediaItem[]>(() =>
    chatHistory.flatMap((row) =>
      row.image_signed_urls.map((url, i) => ({
        filename: row.image_storage_paths[i] ?? url,
        signedUrl: url,
        type: "image" as const,
        storagePath: row.image_storage_paths[i],
      })),
    ),
  );

  const handleSendMessage = async (
    message: string,
    model?: string,
    settings?: GenerationSettings,
  ): Promise<AssistantOutput> => {
    // Save user message
    await saveChatMessage(threadId, "user", message);

    const output = await illustrationHandler(message, model, settings);

    // Collect image storage paths from medias
    const imageStoragePaths = (output.medias ?? [])
      .filter((m) => m.storagePath)
      .map((m) => m.storagePath as string);

    // Save AI response (text + image paths)
    await saveChatMessage(threadId, "assistant", output.text, imageStoragePaths);

    // Update preview panel with new images
    if (output.medias && output.medias.length > 0) {
      setAllMedias((prev) => {
        const existingUrls = new Set(prev.map((m) => m.signedUrl));
        const newMedias = output.medias.filter((m) => !existingUrls.has(m.signedUrl));
        return [...prev, ...newMedias];
      });
    }

    // Return text-only to the chatbot — images shown in right panel only
    return { ...output, medias: [] };
  };

  const restoredMessages = isNewChatLocal ? undefined : historyToMessages(chatHistory);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Left: AI Chat */}
      <ResizablePanel defaultSize={45} minSize={30}>
        <div className="h-full flex flex-col overflow-hidden bg-white">
          <AssistantChatbot
            title="Illustration Assistant"
            systemMessage="Hi! Describe what you'd like to illustrate and I'll generate on-brand illustrations for you."
            onSendMessage={handleSendMessage}
            availableModels={["gpt-image-2", "gpt-image-1.5"]}
            pageKey="draft-illustration"
            autoSendMessage={isNewChatLocal ? initialPrompt : undefined}
            initialModel={initialModel}
            initialMessages={restoredMessages}
          />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: Image Preview */}
      <ResizablePanel defaultSize={55} minSize={30}>
        <ImagePreviewPanel medias={allMedias} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}


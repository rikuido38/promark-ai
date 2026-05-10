"use client";

import { useState, useEffect, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AssistantChatbot, type AssistantChatbotHandle, type Message } from "@/components/assistant-chatbot";
import { ImagePreviewPanel } from "./image-preview-panel";
import { saveChatMessage, markNewChatDone, upsertStudioThread } from "./actions";
import type { MediaRecord, StudioThreadChat } from "./actions";
import type { MediaItem, AssistantOutput } from "@/types/agent";
import type { GenerationSettings } from "@/types/generation-settings";
import { useAIAssistant } from "@/components/ai-assistant-provider";

interface ThreadWorkspaceProps {
  assetId: string;
  threadId: string;
  initialPrompt?: string;
  initialModel?: string;
  isNewChat: boolean;
  chatHistory: StudioThreadChat[];
  initialMedias?: Array<{ filename: string; signedUrl: string; storagePath: string; seed_details?: string }>;
  latestVersion?: { signedUrl: string; storagePath: string; version: number };
}

async function illustrationHandler(
  message: string,
  model?: string,
  settings?: GenerationSettings,
): Promise<AssistantOutput> {
  const attachSplit = message.split("\n\n__IMG_REFS__\n");
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
    medias: row.role === "assistant"
      ? row.image_signed_urls.map((url, i) => ({
          filename: row.medias[i]?.storagePath ?? url,
          signedUrl: url,
          type: "image" as const,
          storagePath: row.medias[i]?.storagePath,
          seed_details: row.medias[i]?.seed_details,
        }))
      : [],
  }));
}

export function ThreadWorkspace({
  assetId,
  threadId,
  initialPrompt,
  initialModel,
  isNewChat,
  chatHistory,
  initialMedias,
  latestVersion,
}: ThreadWorkspaceProps) {
  // isNewChat comes from the DB — use it only to fire the DB update.
  // For the actual auto-send decision we use chatHistory.length === 0 so
  // there is no dependency on DB round-trip timing.
  const isNewChatLocal = chatHistory.length === 0;
  const chatbotRef = useRef<AssistantChatbotHandle>(null);
  const [requestedPreviewUrl, setRequestedPreviewUrl] = useState<{ url: string; seq: number } | undefined>(undefined);
  const { assistantName, avatarUrl } = useAIAssistant();

  // Compute the initial media list once (shared by allMedias and currentMedia init).
  const getInitialMediaList = (): MediaItem[] => {
    if (initialMedias && initialMedias.length > 0) {
      return initialMedias.map((m) => ({
        filename: m.filename,
        signedUrl: m.signedUrl,
        type: "image" as const,
        storagePath: m.storagePath,
        seed_details: m.seed_details,
      }));
    }
    const fromHistory = chatHistory.flatMap((row) =>
      row.image_signed_urls.map((url, i) => ({
        filename: row.medias[i]?.storagePath ?? url,
        signedUrl: url,
        type: "image" as const,
        storagePath: row.medias[i]?.storagePath,
        seed_details: row.medias[i]?.seed_details,
      })),
    );
    if (fromHistory.length > 0) return fromHistory;
    // Fall back to the latest published version so the panel isn't blank on revisit.
    if (latestVersion) {
      return [{
        filename: latestVersion.storagePath,
        signedUrl: latestVersion.signedUrl,
        type: "image" as const,
        storagePath: latestVersion.storagePath,
      }];
    }
    return [];
  };

  // The image currently active in the preview panel — auto-attached to every AI message.
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(() => {
    const list = getInitialMediaList();
    return list.length > 0 ? (list.at(-1) ?? null) : null;
  });

  const handleEditorExport = (base64: string) => {
    chatbotRef.current?.sendMessage(
      `Please refine this edited image.\n\n__IMG_REFS__\n${base64}`,
    );
  };

  // Flip is_new_chat to false immediately on mount (parallel with AI auto-trigger)
  useEffect(() => {
    if (isNewChat) {
      markNewChatDone(threadId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the preview panel with images from the last assistant reply on load.
  // Falls back to scanning full chat history if the dedicated query returned nothing.
  const [allMedias, setAllMedias] = useState<MediaItem[]>(getInitialMediaList);

  const handleSendMessage = async (
    message: string,
    model?: string,
    settings?: GenerationSettings,
  ): Promise<AssistantOutput> => {
    // Strip attachment URLs from the displayed user message (they are only for the API)
    const displayMessage = message.split("\n\n__IMG_REFS__\n")[0].trim();
    // Ensure the studio_threads record exists (handles legacy assets created before studio_threads)
    await upsertStudioThread(assetId, "illustration");
    await saveChatMessage(threadId, "user", displayMessage);

    // Auto-prepend the current working image so AI always has the latest canvas as context.
    let messageForAI = message;
    if (currentMedia) {
      const [promptPart, existingRefs] = message.split("\n\n__IMG_REFS__\n");
      const refList = existingRefs ? existingRefs.split("\n").filter(Boolean) : [];
      if (!refList.includes(currentMedia.signedUrl)) {
        refList.unshift(currentMedia.signedUrl);
      }
      messageForAI = `${promptPart}\n\n__IMG_REFS__\n${refList.join("\n")}`;
    }

    const output = await illustrationHandler(messageForAI, model, settings);

    // Collect structured media records from medias.
    // Deduplicate by storagePath — raw.medias (with seed_details) comes first so it wins.
    const seenPaths = new Set<string>();
    const mediaRecords: MediaRecord[] = (output.medias ?? [])
      .filter((m) => m.storagePath)
      .filter((m) => {
        const path = m.storagePath as string;
        if (seenPaths.has(path)) return false;
        seenPaths.add(path);
        return true;
      })
      .map((m) => ({ storagePath: m.storagePath as string, seed_details: m.seed_details }));

    // Strip any <img> tags the LLM may have embedded — images are shown in the right panel only
    // eslint-disable-next-line unicorn/prefer-string-replace-all
    const textOnly = output.text.replace(/<img\b[^>]*>/gi, "").trim();
    await saveChatMessage(threadId, "assistant", textOnly, mediaRecords);

    // Update preview panel with new images; the first new image auto-becomes current.
    if (output.medias && output.medias.length > 0) {
      const firstNew = output.medias[0];
      setCurrentMedia(firstNew);
      setRequestedPreviewUrl((prev) => ({ url: firstNew.signedUrl, seq: (prev?.seq ?? 0) + 1 }));
      setAllMedias((prev) => {
        const existingUrls = new Set(prev.map((m) => m.signedUrl));
        const newMedias = output.medias.filter((m) => !existingUrls.has(m.signedUrl));
        return [...prev, ...newMedias];
      });
    }

    // Return medias to the chatbot for thumbnail display
    return { ...output, text: textOnly };
  };

  const restoredMessages = isNewChatLocal ? undefined : historyToMessages(chatHistory);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Left: AI Chat */}
      <ResizablePanel defaultSize={45} minSize={30}>
        <div className="h-full flex flex-col overflow-hidden bg-white">
          <AssistantChatbot
            ref={chatbotRef}
            title={assistantName || "Illustration Assistant"}
            avatarUrl={avatarUrl}
            showWelcomeMessage={false}
            onSendMessage={handleSendMessage}
            availableModels={["gpt-image-2", "gpt-image-1.5"]}
            pageKey="draft-illustration"
            autoSendMessage={isNewChatLocal ? initialPrompt : undefined}
            initialModel={initialModel}
            initialMessages={restoredMessages}
            currentMediaUrl={currentMedia?.signedUrl}
            onUseAsCurrent={(media) => {
              setCurrentMedia(media);
              // Ensure the media is in allMedias (it may be a history image not yet tracked)
              setAllMedias((prev) => {
                if (prev.some((m) => m.signedUrl === media.signedUrl)) return prev;
                return [...prev, media];
              });
              setRequestedPreviewUrl((prev) => ({ url: media.signedUrl, seq: (prev?.seq ?? 0) + 1 }));
            }}
          />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: Image Preview */}
      <ResizablePanel defaultSize={55} minSize={30}>
        <ImagePreviewPanel assetId={assetId} medias={allMedias} onExportBase64={handleEditorExport} requestedUrl={requestedPreviewUrl} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}


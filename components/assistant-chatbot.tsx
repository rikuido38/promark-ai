"use client";

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, Download, ExternalLink, ImageIcon, Loader2, MoreHorizontal, Plus, Send, Sparkles, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConnectedTool } from "@/types/models";
import type { AssistantOutput, MediaItem } from "@/types/agent";
import { uploadChatAttachmentClient, type UploadAttachmentResult } from "@/app/actions/upload-attachment-client";
import { GenerationSettingsButton } from "@/components/generation-settings-dialog";
import type { GenerationSettings, GenerationTabKey } from "@/types/generation-settings";
import { DEFAULT_GENERATION_SETTINGS, tabKeyFromPageKey } from "@/types/generation-settings";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type Message = {
  role: "assistant" | "user";
  content: string;
  medias?: MediaItem[];
  action?: "figma_connect";
  id: string;
};

/** @deprecated Use AssistantOutput directly */
export type MessageHandlerResult = AssistantOutput;
export type MessageHandler = (message: string, model?: string, settings?: GenerationSettings) => Promise<AssistantOutput>;

const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
function stripScripts(html: string): string {
  return html.replaceAll(SCRIPT_TAG_RE, "");
}

/** Imperative handle exposed via ref for programmatic message injection. */
export interface AssistantChatbotHandle {
  /** Immediately sends a message as if the user typed and submitted it. */
  sendMessage: (text: string) => void;
}

export const AssistantChatbot = forwardRef<AssistantChatbotHandle, {
  title?: string;
  systemMessage?: string;
  showWelcomeMessage?: boolean;
  avatarUrl?: string | null;
  connectedTools?: ConnectedTool[];
  onClose?: () => void;
  onSendMessage?: MessageHandler;
  availableModels?: string[];
  pageKey?: string;
  defaultSettings?: Partial<GenerationSettings>;
  autoSendMessage?: string;
  initialModel?: string;
  initialMessages?: Message[];
  onUseAsCurrent?: (media: MediaItem) => void;
  currentMediaUrl?: string;
}>(function AssistantChatbot({
  title = "AI Assistant",
  systemMessage = "How can I help you?",
  showWelcomeMessage = true,
  avatarUrl = null,
  connectedTools = [],
  onClose,
  onSendMessage,
  availableModels,
  pageKey,
  defaultSettings,
  autoSendMessage,
  initialModel,
  initialMessages,
  onUseAsCurrent,
  currentMediaUrl,
}, ref) {
  const figmaTool = connectedTools.find((t) => t.slug === "figma");
  const buildInitialMessages = (): Message[] => {
    // Restored history takes priority — skip the welcome message entirely.
    if (initialMessages && initialMessages.length > 0) return initialMessages;
    // When autoSendMessage is provided the chatbot starts working immediately —
    // skip the welcome message so it doesn't appear before the first response.
    if (autoSendMessage) return [];
    const msgs: Message[] = [];
    if (showWelcomeMessage) {
      msgs.push({ id: "init", role: "assistant", content: systemMessage });
    }
    if (figmaTool && !figmaTool.userConnected) {
      msgs.push({
        id: "figma-prompt",
        role: "assistant",
        content:
          "Your organization has Figma connected! You can link your personal Figma account to let me pull brand assets, components, and styles directly from your Figma files.",
        action: "figma_connect",
      });
    }
    return msgs;
  };

  const [messages, setMessages] = useState<Message[]>(buildInitialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [figmaConnecting, setFigmaConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);
  const [downloadMedia, setDownloadMedia] = useState<MediaItem | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"png" | "svg">("png");
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(initialModel ?? availableModels?.[0] ?? "");
  const [attachments, setAttachments] = useState<UploadAttachmentResult[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(() => {
    const derivedTabKey: GenerationTabKey | undefined = pageKey ? tabKeyFromPageKey(pageKey) : undefined;
    const base = derivedTabKey ? DEFAULT_GENERATION_SETTINGS[derivedTabKey] : DEFAULT_GENERATION_SETTINGS.illustration;
    return { ...base, ...defaultSettings };
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSentRef = useRef(false);

  // Expose sendMessage imperatively so parent components (e.g. ThreadWorkspace)
  // can inject messages from outside (e.g. from the image editor "Send to AI" button).
  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => void handleSendMessage(text),
  }));

  // Auto-send on first mount if a message was provided (e.g. from studio prompt input).
  // NOTE: autoSentRef.current is set INSIDE the timeout callback (not before) so that
  // React strict-mode's double-invoke (mount → cleanup → remount) doesn't permanently
  // block the send: the cleanup clears the first timeout, the remount reschedules it,
  // and only the callback that actually fires marks the ref as done.
  useEffect(() => {
    if (autoSendMessage && !autoSentRef.current) {
      const t = setTimeout(() => {
        if (!autoSentRef.current) {
          autoSentRef.current = true;
          void handleSendMessage(autoSendMessage);
        }
      }, 100);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = "";
    setUploadingAttachment(true);
    try {
      const result = await uploadChatAttachmentClient(file);
      setAttachments((prev) => [...prev, result]);
    } catch (err) {
      console.error("Attachment upload failed:", err);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = (storagePath: string) => {
    setAttachments((prev) => prev.filter((a) => a.storagePath !== storagePath));
  };

  // Sync selectedModel when the available list changes (e.g. on page mount).
  useEffect(() => {
    if (availableModels && availableModels.length > 0) {
      setSelectedModel((prev) => availableModels.includes(prev) ? prev : availableModels[0]);
    }
  }, [availableModels]);

  const handleDownload = async () => {
    if (!downloadMedia) return;
    setIsDownloading(true);
    try {
      const resp = await fetch(downloadMedia.signedUrl);
      if (!resp.ok) throw new Error("Failed to fetch image");
      const blob = await resp.blob();
      const baseName = downloadMedia.filename.replace(/\.[^.]+$/, "");
      if (downloadFormat === "png") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}.png`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCodePoint(...Array.from(bytes.slice(i, i + chunkSize)));
        }
        const base64 = btoa(binary);
        const blobUrl = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = blobUrl; });
        URL.revokeObjectURL(blobUrl);
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.naturalWidth}" height="${img.naturalHeight}"><image href="data:image/png;base64,${base64}" width="${img.naturalWidth}" height="${img.naturalHeight}" /></svg>`;
        const svgBlob = new Blob([svgContent], { type: "image/svg+xml" });
        const svgUrl = URL.createObjectURL(svgBlob);
        const a = document.createElement("a");
        a.href = svgUrl;
        a.download = `${baseName}.svg`;
        a.click();
        URL.revokeObjectURL(svgUrl);
      }
      setDownloadMedia(null);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFigmaConnect = async () => {
    setFigmaConnecting(true);
    try {
      const res = await fetch("/api/integrations/figma/oauth-url");
      if (!res.ok) throw new Error("Failed to get authorization URL");
      const { url } = (await res.json()) as { url: string };
      globalThis.location.href = url;
    } catch (err) {
      console.error(err);
      setFigmaConnecting(false);
    }
  };

  const handleSendMessage = async (messageOverride?: string) => {
    const userMessage = messageOverride ?? inputValue;
    if (!userMessage.trim() && attachments.length === 0) return;
    const currentAttachments = attachments;
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      // Show only the text portion — strip any appended attachment URL block
      content: userMessage.split("\n\n__IMG_REFS__\n")[0].trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setAttachments([]);
    setIsTyping(true);

    // Build the full message: text + attachment signed URLs so the agent can see them
    const messageWithAttachments =
      currentAttachments.length > 0
        ? `${userMessage}\n\n__IMG_REFS__\n${currentAttachments.map((a) => a.signedUrl).join("\n")}`
        : userMessage;

    try {
      let output: AssistantOutput;

      if (onSendMessage) {
        output = await onSendMessage(messageWithAttachments, selectedModel || undefined, generationSettings);
      } else {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageWithAttachments, sessionId }),
        });
        if (!response.ok) throw new Error("Failed to get agent response");
        const data = (await response.json()) as { output: AssistantOutput; sessionId: string };
        setSessionId(data.sessionId);
        output = data.output ?? {
          text: "I couldn't process this request right now.",
          medias: [],
          confidenceScore: 0,
          metadata: {},
        };
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: output.text,
          medias: output.medias,
        },
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "<span class='text-red-500'>Error connecting to the AI agent.</span>",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="w-full flex-1 bg-white flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between shrink-0 lg:flex hidden">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 overflow-hidden ring-1 ring-border/50">
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatarUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
        </div>

        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`p-3 rounded-2xl max-w-[85%] text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-white border rounded-bl-none shadow-sm text-slate-800"
              }`}
            >
              <div dangerouslySetInnerHTML={{ __html: stripScripts(msg.content) }} />
              {msg.medias && msg.medias.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {msg.medias.map((media) => {
                    if (media.type === "image") {
                      return (
                        <div key={media.filename} className="relative group h-20 w-20 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewMedia(media)}
                            className={cn(
                              "h-20 w-20 block rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                              media.signedUrl === currentMediaUrl && "ring-1 ring-red-500",
                            )}
                            style={{
                              backgroundImage: "linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)",
                              backgroundSize: "10px 10px",
                              backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
                              backgroundColor: "#ffffff",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={media.signedUrl}
                              alt={media.filename}
                              crossOrigin="anonymous"
                              className="h-20 w-20 object-cover cursor-pointer"
                            />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-3 w-3" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => {
                                  setDownloadMedia(media);
                                  setDownloadFormat("png");
                                }}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              {onUseAsCurrent && (
                                <DropdownMenuItem onClick={() => onUseAsCurrent(media)}>
                                  <ArrowUpRight className="h-4 w-4 mr-2" />
                                  Send to editor
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    }
                    return (
                      <a
                        key={media.filename}
                        href={media.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-600 underline break-all"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {media.filename}
                      </a>
                    );
                  })}
                </div>
              )}
              {msg.action === "figma_connect" && figmaTool && !figmaTool.userConnected && (
                <button
                  onClick={handleFigmaConnect}
                  disabled={figmaConnecting}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-[#1e1e1e] text-white rounded-lg hover:bg-[#333] disabled:opacity-60 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  {figmaConnecting ? "Redirecting…" : "Connect with Figma"}
                </button>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="p-3 rounded-2xl max-w-[85%] text-sm bg-white border rounded-bl-none shadow-sm text-slate-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
            </div>
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t bg-white shrink-0">
        <div className="rounded-2xl border border-slate-200 bg-white focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-100">
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((a) => (
                <div key={a.storagePath} className="relative group h-16 w-16 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.signedUrl}
                    alt={a.filename}
                    crossOrigin="anonymous"
                    className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                  />
                  <button
                    onClick={() => handleRemoveAttachment(a.storagePath)}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center rounded-full bg-slate-700 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove attachment"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {uploadingAttachment && (
                <div className="h-16 w-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              )}
            </div>
          )}
          <Textarea
            placeholder="Type your message..."
            rows={2}
            className="w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
          />
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <div className="flex items-center gap-1">
            {/* Hidden file input — triggered via label htmlFor, not JS .click() */}
            <input
              id="chat-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={handleFileChange}
            />
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <Plus className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Attach</DropdownMenuLabel>
                  <DropdownMenuItem className="p-0">
                    <label
                      htmlFor={uploadingAttachment ? undefined : "chat-file-input"}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 cursor-pointer ${uploadingAttachment ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      {uploadingAttachment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                      {uploadingAttachment ? "Uploading\u2026" : "Media"}
                    </label>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Tools</DropdownMenuLabel>
                  {connectedTools.filter((t) => t.userConnected).length === 0 ? (
                    <DropdownMenuItem disabled>No tools connected</DropdownMenuItem>
                  ) : (
                    connectedTools
                      .filter((t) => t.userConnected)
                      .map((tool) => (
                        <DropdownMenuItem key={tool.id}>
                          <span className="flex items-center gap-2">
                            {tool.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={tool.logo_url}
                                alt={tool.name}
                                className="h-4 w-4 rounded object-contain"
                              />
                            ) : null}
                            <span>{tool.name}</span>
                          </span>
                        </DropdownMenuItem>
                      ))
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {availableModels && availableModels.length > 1 && (
              <Select value={selectedModel} onValueChange={(val) => setSelectedModel(val ?? "")}>
                <SelectTrigger size="sm" className="h-7 text-xs border-slate-200 bg-slate-50 w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" align="start">
                  {availableModels.map((modelId) => (
                    <SelectItem key={modelId} value={modelId}>
                      {modelId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {pageKey && (() => {
              const derivedTabKey = tabKeyFromPageKey(pageKey);
              return derivedTabKey ? (
                <GenerationSettingsButton
                  tabKey={derivedTabKey}
                  settings={generationSettings}
                  availableModels={availableModels ?? []}
                  onSettingsChange={(s) => {
                    setGenerationSettings(s);
                    if (availableModels?.includes(s.model)) setSelectedModel(s.model);
                  }}
                />
              ) : null;
            })()}
            </div>

            <Button
              size="icon"
              disabled={isTyping}
              className="h-8 w-8 rounded-full bg-slate-900 hover:bg-slate-700 text-white disabled:opacity-50"
              onClick={() => void handleSendMessage()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>


    {/* Download format dialog */}
    {downloadMedia && (
      <Dialog open onOpenChange={() => setDownloadMedia(null)}>
        <DialogContent className="max-w-xs" showCloseButton>
          <DialogTitle className="text-sm font-semibold">Download image</DialogTitle>
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDownloadFormat("png")}
                className={cn(
                  "flex-1 py-2 rounded-lg border text-sm font-medium transition-colors",
                  downloadFormat === "png"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => setDownloadFormat("svg")}
                className={cn(
                  "flex-1 py-2 rounded-lg border text-sm font-medium transition-colors",
                  downloadFormat === "svg"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                SVG
              </button>
            </div>
            <Button
              className="w-full"
              disabled={isDownloading}
              onClick={() => void handleDownload()}
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              {isDownloading ? "Downloading…" : "Download"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}

    {/* Image preview lightbox */}
    {previewMedia && (
      <Dialog open onOpenChange={() => setPreviewMedia(null)}>
        <DialogContent className="max-w-2xl p-2" showCloseButton>
          <DialogTitle className="sr-only">{previewMedia.filename}</DialogTitle>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundImage: "linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
              backgroundColor: "#ffffff",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewMedia.signedUrl}
              alt={previewMedia.filename}
              crossOrigin="anonymous"
              className="w-full h-auto object-contain max-h-[80vh]"
            />
          </div>
        </DialogContent>
      </Dialog>
    )}
  </div>
  );
});

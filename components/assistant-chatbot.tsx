"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, ImageIcon, Plus, Send, Sparkles, X } from "lucide-react";
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

type Message = {
  role: "assistant" | "user";
  content: string;
  medias?: MediaItem[];
  action?: "figma_connect";
  id: string;
};

/** @deprecated Use AssistantOutput directly */
export type MessageHandlerResult = AssistantOutput;
export type MessageHandler = (message: string) => Promise<AssistantOutput>;

export function AssistantChatbot({
  title = "AI Assistant",
  systemMessage = "How can I help you?",
  avatarUrl = null,
  connectedTools = [],
  onClose,
  onSendMessage,
}: {
  title?: string;
  systemMessage?: string;
  avatarUrl?: string | null;
  connectedTools?: ConnectedTool[];
  onClose?: () => void;
  onSendMessage?: MessageHandler;
}) {
  const figmaTool = connectedTools.find((t) => t.slug === "figma");
  const buildInitialMessages = (): Message[] => {
    const msgs: Message[] = [
      { id: "init", role: "assistant", content: systemMessage },
    ];
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

  const handleSendMessage = async () => {
    const userMessage = inputValue;
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    try {
      let output: AssistantOutput;

      if (onSendMessage) {
        output = await onSendMessage(userMessage);
      } else {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage, sessionId }),
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
              <div dangerouslySetInnerHTML={{ __html: msg.content }} />
              {msg.medias && msg.medias.length > 0 && (
                <div className="mt-2 space-y-2">
                  {msg.medias.map((media) =>
                    media.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={media.filename}
                        src={media.signedUrl}
                        alt={media.filename}
                        className="rounded-xl w-full object-contain max-h-72"
                      />
                    ) : (
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
                    ),
                  )}
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
          <Textarea
            placeholder="Type your message..."
            rows={2}
            className="w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <Plus className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Attach</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <ImageIcon className="h-4 w-4" />
                    Media
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

            <Button
              size="icon"
              disabled={isTyping}
              className="h-8 w-8 rounded-full bg-slate-900 hover:bg-slate-700 text-white disabled:opacity-50"
              onClick={handleSendMessage}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

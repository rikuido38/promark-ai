"use client";

import { Button } from "@/components/ui/button";
import { AssistantChatbot } from "@/components/assistant-chatbot";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIAssistant } from "./ai-assistant-provider";

export function GlobalAssistantFAB({
  assistantName,
  avatarUrl,
}: {
  assistantName: string;
  avatarUrl: string | null;
}) {
  const { isOpen, setIsOpen } = useAIAssistant();

  return (
    <Button
      size="icon"
      className={cn(
        "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 transition-transform duration-200 overflow-hidden ring-1 ring-border/50",
        isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100",
        avatarUrl ? "bg-blue-100" : "bg-blue-600 hover:bg-blue-700 text-white"
      )}
      onClick={() => setIsOpen(true)}
    >
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={avatarUrl} alt={assistantName} className="w-full h-full object-cover" />
      ) : (
        <MessageSquare className="h-6 w-6" />
      )}
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles } from "lucide-react";

export function SettingsChatbot({
  title = "AI Assistant",
  systemMessage = "How can I help you?",
  avatarUrl = null,
}: {
  title?: string;
  systemMessage?: string;
  avatarUrl?: string | null;
}) {
  const [messages, setMessages] = useState<
    { role: "assistant" | "user"; content: string }[]
  >([
    {
      role: "assistant",
      content: systemMessage,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue;
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInputValue("");
    setIsTyping(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessage }),
      });

      if (!response.ok) {
        throw new Error("Failed to get agent response");
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content || "I couldn't process this request right now.",
        },
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
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
    <div className="w-full flex-1 border bg-white flex flex-col h-[600px] shadow-sm rounded-lg overflow-hidden">
      <div className="p-4 border-b bg-slate-50 flex items-center gap-3 shrink-0">
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
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
        {messages.map((msg, idx) => (
          <div
            key={idx}
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
        <div className="relative">
          <Input
            placeholder="Type your message..."
            className="pr-12 py-6 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-blue-100"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
          />
          <Button
            size="icon"
            disabled={isTyping}
            className="absolute right-1.5 top-1.5 h-9 w-9 bg-blue-600 hover:bg-blue-700 rounded-lg text-white disabled:opacity-50"
            onClick={handleSendMessage}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

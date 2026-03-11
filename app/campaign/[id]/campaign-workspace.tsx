"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Upload, Sparkles, Layers } from "lucide-react";
import { CampaignAnalysis } from "./campaign-analysis";
import { CampaignPersonalisation } from "./campaign-personalisation";
import { CampaignProduction } from "./campaign-production";
import { CampaignQuality } from "./campaign-quality";

type Phase = "analysis" | "personalisation" | "production" | "quality";

export default function CampaignWorkspace({
  campaign,
  assistantName,
  avatarUrl = null,
}: {
  campaign: any;
  assistantName?: string;
  avatarUrl?: string | null;
}) {
  const [messages, setMessages] = useState<
    { role: "assistant" | "user"; content: string }[]
  >([
    {
      role: "assistant",
      content: `Hi! I'm ${assistantName || "your AI Campaign Manager"} for "${campaign.name}". Let's start the <strong>Analysis Phase</strong>. Please upload any campaign briefs, product specs, or visual assets you have.`,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [activePhase, setActivePhase] = useState<Phase>("analysis");
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

      // Right now the agent returns AgentResponse { type, content, metadata }
      // We will render 'content' if it's text, or handle other types later
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
    <div className="flex w-full h-full relative">
      <div className="flex-1 bg-slate-100/50 flex flex-col h-full overflow-hidden">
        {/* Pipeline Progress Header */}
        <div className="h-16 border-b bg-white flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Pipeline State</h3>
          </div>

          <div className="flex items-center gap-3">
            <PipelineNode
              label="Analysis"
              active={activePhase === "analysis"}
              onClick={() => setActivePhase("analysis")}
            />
            <div className="w-8 border-t-2 border-slate-200 border-dashed" />
            <PipelineNode
              label="Personalisation"
              active={activePhase === "personalisation"}
              onClick={() => setActivePhase("personalisation")}
            />
            <div className="w-8 border-t-2 border-slate-200 border-dashed" />
            <PipelineNode
              label="Production"
              active={activePhase === "production"}
              onClick={() => setActivePhase("production")}
            />
            <div className="w-8 border-t-2 border-slate-200 border-dashed" />
            <PipelineNode
              label="Quality"
              active={activePhase === "quality"}
              onClick={() => setActivePhase("quality")}
            />
          </div>
        </div>

        {/* Artifacts Canvas */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          {activePhase === "analysis" && (
            <CampaignAnalysis campaign={campaign} />
          )}
          {activePhase === "personalisation" && (
            <CampaignPersonalisation campaign={campaign} />
          )}
          {activePhase === "production" && (
            <CampaignProduction campaign={campaign} />
          )}
          {activePhase === "quality" && <CampaignQuality campaign={campaign} />}
        </div>
      </div>
    </div>
  );
}

function PipelineNode({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

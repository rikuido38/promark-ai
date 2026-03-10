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

export default function CampaignWorkspace({ campaign }: { campaign: any }) {
  const [messages, setMessages] = useState<
    { role: "assistant" | "user"; content: string }[]
  >([
    {
      role: "assistant",
      content: `Hi! I'm your AI Campaign Manager for "${campaign.name}". Let's start the <strong>Analysis Phase</strong>. Please upload any campaign briefs, product specs, or visual assets you have.`,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [activePhase, setActivePhase] = useState<Phase>("analysis");

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    setMessages((prev) => [...prev, { role: "user", content: inputValue }]);
    setInputValue("");

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I've received those details. Generating the Visual Blueprint and Product Fact Sheet now. I will notify you when Phase 1 is ready for review.",
        },
      ]);
    }, 1000);
  };

  return (
    <div className="flex w-full h-full relative">
      {/* Left Pane: AI Co-Pilot / Campaign Info */}
      <div className="w-1/3 min-w-[320px] max-w-[450px] border-r bg-white flex flex-col h-full z-10 shadow-sm relative">
        <div className="p-4 border-b bg-slate-50 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">
              AI Campaign Manager
            </h2>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`p-3 rounded-2xl max-w-[85%] text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-white border rounded-bl-none shadow-sm text-slate-800"
                }`}
              >
                <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                {msg.role === "assistant" && idx === 0 && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs bg-slate-50"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Upload Assets
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t bg-white">
          <div className="relative">
            <Input
              placeholder="Message your Campaign Manager..."
              className="pr-12 py-6 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-blue-100"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            />
            <Button
              size="icon"
              className="absolute right-1.5 top-1.5 h-9 w-9 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
              onClick={handleSendMessage}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Pane: Artifacts Workspace & Pipeline Map */}
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

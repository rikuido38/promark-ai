"use client";

import { Target } from "lucide-react";

export function CampaignPersonalisation({ campaign }: { campaign: any }) {
  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center justify-center h-full min-h-[400px] text-center space-y-4">
      <div className="h-16 w-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 mb-2">
        <Target className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-semibold text-slate-800">
        Personalisation Phase
      </h2>
      <p className="text-sm text-slate-500 max-w-md">
        Strategic Segment Briefs will be generated here once the Persona Agent analyzes the outputs from the Analysis Phase.
      </p>
    </div>
  );
}

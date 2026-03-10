"use client";

import { Feather } from "lucide-react";

export function CampaignProduction({ campaign }: { campaign: any }) {
  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center justify-center h-full min-h-[400px] text-center space-y-4">
      <div className="h-16 w-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 mb-2">
        <Feather className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-semibold text-slate-800">
        Production Phase
      </h2>
      <p className="text-sm text-slate-500 max-w-md">
        Generated copy, social media hooks, and key visuals will appear here tailored for each specific segment.
      </p>
    </div>
  );
}

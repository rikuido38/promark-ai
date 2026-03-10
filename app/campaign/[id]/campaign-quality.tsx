"use client";

import { ShieldCheck } from "lucide-react";

export function CampaignQuality({ campaign }: { campaign: any }) {
  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center justify-center h-full min-h-[400px] text-center space-y-4">
      <div className="h-16 w-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 mb-2">
        <ShieldCheck className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-semibold text-slate-800">
        Quality Gate Phase
      </h2>
      <p className="text-sm text-slate-500 max-w-md">
        Pass/Fail logs against brand rules and facts will be accessible here. Assets failing validation will be flagged for review or automated rewrite.
      </p>
    </div>
  );
}

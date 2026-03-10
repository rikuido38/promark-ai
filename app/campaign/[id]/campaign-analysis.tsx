"use client";

import {
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";

export function CampaignAnalysis({ campaign }: { campaign: any }) {
  // Mock data for the artifacts
  const artifacts = [
    {
      id: "visual-blueprint",
      title: "Visual Blueprint",
      description:
        "Extracts brand colors, mood keywords, and composition rules from campaign key visuals.",
      status: "completed",
      agent: "Vision Agent",
      updatedAt: "2 mins ago",
    },
    {
      id: "product-fact-sheet",
      title: "Product Fact Sheet",
      description:
        "Extracts USPs, pricing, and mandatory inclusions from product write-ups.",
      status: "in_progress",
      agent: "Product Agent",
      updatedAt: "Just now",
    },
    {
      id: "voice-tone-mandate",
      title: "Voice & Tone Mandate",
      description:
        "Protects brand identity by defining formality, humor index, and restricted vocabulary.",
      status: "pending",
      agent: "Brand Guardian Agent",
      updatedAt: "-",
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case "in_progress":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-slate-300" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge
            variant="secondary"
            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border-emerald-200"
          >
            Completed
          </Badge>
        );
      case "in_progress":
        return (
          <Badge
            variant="secondary"
            className="bg-blue-50 text-blue-600 hover:bg-blue-50 border-blue-200"
          >
            Generating...
          </Badge>
        );
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return (
          <Badge variant="outline" className="text-slate-500">
            Pending
          </Badge>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Analysis Phase</h2>
          <p className="text-slate-500 mt-1 max-w-xl">
            Agents are analyzing your inputs to establish the foundational
            rules, facts, and visual directions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-white px-3 py-1.5 text-sm flex items-center gap-2 shadow-sm border-blue-200"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
            <span className="text-slate-700 font-medium">
              Generating Foundation
            </span>
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {artifacts.map((artifact) => (
          <Card
            key={artifact.id}
            className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col overflow-hidden"
          >
            <CardHeader className="p-5 pb-4 flex flex-row items-start justify-between space-y-0 relative">
              <div className="space-y-1.5 w-full">
                <CardTitle className="text-lg font-semibold text-slate-800 pr-8">
                  {artifact.title}
                </CardTitle>
                <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  {artifact.agent}
                </div>
              </div>
              <div className="absolute right-5 top-5">
                {getStatusIcon(artifact.status)}
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex-1">
              <p className="text-sm text-slate-600 leading-relaxed">
                {artifact.description}
              </p>
            </CardContent>
            <CardFooter className="p-4 flex items-center justify-between border-t border-slate-100 bg-slate-50">
              {getStatusBadge(artifact.status)}
              <span className="text-xs font-medium text-slate-400">
                {artifact.updatedAt !== "-"
                  ? `Updated ${artifact.updatedAt}`
                  : "Waiting to start"}
              </span>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-200">
        <Button
          disabled
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 disabled:opacity-50"
        >
          Approve & Proceed to Personalisation
        </Button>
      </div>
    </div>
  );
}

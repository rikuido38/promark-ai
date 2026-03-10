"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Plus,
  SlidersHorizontal,
  MoreHorizontal,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Campaign, CampaignStatus } from "@/types/models";

interface CampaignListProps {
  initialCampaigns: Campaign[];
}

type FilterTab = "all" | CampaignStatus;

export default function CampaignList({ initialCampaigns }: CampaignListProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);

  const getFilteredCampaigns = (status: FilterTab) => {
    if (status === "all") return campaigns;
    return campaigns.filter((c) => c.status === status);
  };

  const getCount = (status: FilterTab) => {
    return getFilteredCampaigns(status).length;
  };

  const tabs: { value: FilterTab; label: string }[] = [
    { value: "all", label: "All campaigns" },
    { value: "todo", label: "To do" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="w-full space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-2 bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center bg-slate-50 rounded-lg p-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const count = getCount(tab.value);
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  isActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold",
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-200 text-slate-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pr-2">
          <Button variant="outline" className="text-slate-600 gap-2 h-10">
            <SlidersHorizontal className="h-4 w-4" />
            Filter & Sort
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 gap-2 h-10">
            Add New Campaign
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Campaign List */}
      <div className="space-y-6">
        {(activeTab === "all" || activeTab === "todo") &&
          getCount("todo") > 0 && (
            <CampaignSection
              title="Todo"
              campaigns={getFilteredCampaigns("todo")}
              count={getCount("todo")}
            />
          )}

        {(activeTab === "all" || activeTab === "in_progress") &&
          getCount("in_progress") > 0 && (
            <CampaignSection
              title="In-Progress"
              campaigns={getFilteredCampaigns("in_progress")}
              count={getCount("in_progress")}
            />
          )}

        {(activeTab === "all" || activeTab === "completed") &&
          getCount("completed") > 0 && (
            <CampaignSection
              title="Completed"
              campaigns={getFilteredCampaigns("completed")}
              count={getCount("completed")}
            />
          )}

        {getCount(activeTab) === 0 && (
          <div className="py-12 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            No campaigns found for this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignSection({
  title,
  campaigns,
  count,
}: {
  title: string;
  campaigns: Campaign[];
  count: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <span className="flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
          {count}
        </span>
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <Link
            href={`/campaign/${campaign.id}`}
            key={campaign.id}
            className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all hover:border-slate-300 cursor-pointer block"
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "font-medium transition-colors",
                  campaign.status === "completed"
                    ? "text-slate-500 line-through"
                    : "text-slate-800 group-hover:text-blue-600",
                )}
              >
                {campaign.name}
              </span>
            </div>

            <div className="flex items-center gap-6 mt-4 sm:mt-0 pl-11 sm:pl-0">
              <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-600">
                Marketing
              </span>

              <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                <Calendar className="h-4 w-4" />
                <span>{campaign.end_date || "No date set"}</span>
              </div>

              <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                <MessageSquare className="h-4 w-4" />
                <span>0</span>
              </div>

              <div className="flex items-center h-6 w-6 rounded-full bg-slate-200 justify-center text-xs font-bold text-slate-600 ring-2 ring-white">
                R
              </div>

              <button className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

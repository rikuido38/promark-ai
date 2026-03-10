import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowLeft, FileText, Image as ImageIcon } from "lucide-react";
import Image from "next/image";

interface CampaignSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  campaign: any;
}

export function CampaignSidebar({ campaign, className }: CampaignSidebarProps) {
  return (
    <div
      className={cn(
        "pb-12 border-r md:w-64 flex-col hidden md:flex",
        className,
      )}
    >
      <div className="space-y-4 py-4">
        <div className="px-6 py-2 border-b border-border/40 pb-6 mb-2">
          <Link href="/" className="flex flex-col items-center gap-3 w-full">
            <div className="relative w-[180px] h-[45px]">
              <Image
                src="/ge-master-logo.svg"
                alt="GE Master Logo"
                fill
                style={{ objectFit: "contain" }}
                priority
              />
            </div>
          </Link>
        </div>

        <div className="px-4 py-2">
          <Link
            href={`/project/${campaign.project_id}`}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Project
          </Link>
          <h2 className="text-lg font-bold text-slate-900 truncate">
            {campaign.name}
          </h2>
          {campaign.projects?.name && (
            <p className="text-xs text-slate-500 truncate mt-1">
              Project: {campaign.projects.name}
            </p>
          )}
        </div>

        <div className="px-3 pt-4 border-t">
          <h2 className="mb-2 px-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Setting
          </h2>
          <div className="space-y-1">
            <Link
              href="#"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-900 bg-slate-100"
            >
              <FileText className="h-4 w-4" />
              Campaign details
            </Link>
            <Link
              href="#"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <ImageIcon className="h-4 w-4" />
              Assets
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

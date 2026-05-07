import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowLeft, FolderKanban, Image as ImageIcon, Settings } from "lucide-react";
import Image from "next/image";

interface ProjectSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  project: { id: string; name: string };
  activeItem?: "campaigns" | "assets" | "settings";
}

export function ProjectSidebar({
  project,
  activeItem = "campaigns",
  className,
}: ProjectSidebarProps) {
  const navItems = [
    {
      key: "campaigns" as const,
      label: "Campaigns",
      icon: FolderKanban,
      href: `/project/${project.id}`,
    },
    {
      key: "assets" as const,
      label: "Assets",
      icon: ImageIcon,
      href: `/project/${project.id}/assets`,
    },
    {
      key: "settings" as const,
      label: "Settings",
      icon: Settings,
      href: `/project/${project.id}/settings`,
    },
  ];

  return (
    <div
      className={cn(
        "pb-12 border-r md:w-64 flex-col hidden md:flex",
        className,
      )}
    >
      <div className="space-y-4 py-4">
        {/* Logo */}
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

        {/* Back + project name */}
        <div className="px-4 py-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            All Projects
          </Link>
          <h2 className="text-lg font-bold text-slate-900 truncate">
            {project.name}
          </h2>
        </div>

        {/* Nav */}
        <div className="px-3 pt-4 border-t">
          <div className="space-y-1">
            {navItems.map(({ key, label, icon: Icon, href }) => {
              const isActive = activeItem === key;
              return (
                <Link
                  key={key}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

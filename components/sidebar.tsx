import Link from "next/link";
import { cn } from "@/lib/utils";
import { Users, Settings, Palette, Mic, BookText, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export async function Sidebar({ className }: SidebarProps) {
  const supabase = await createClient();

  // Fetch projects from supabase
  // If the user has access configured via project_users, we'll fetch those projects
  const { data: userData } = await supabase.auth.getUser();

  let projects: any[] = [];
  if (userData?.user) {
    // Attempt to fetch user's specific projects
    const { data } = await supabase
      .from("projects")
      .select("*, project_users!inner(user_id)")
      .eq("project_users.user_id", userData.user.id)
      .order("name");

    if (data && data.length > 0) {
      projects = data;
    } else {
      // Fallback: fetch all projects if the user doesn't have specific assignments
      // or if RLS isn't strictly enforced for listing yet.
      const { data: allProjects } = await supabase
        .from("projects")
        .select("*")
        .order("name");
      if (allProjects) {
        projects = allProjects;
      }
    }
  } else {
    // Fallback if not logged in but testing
    const { data } = await supabase.from("projects").select("*").order("name");
    if (data) {
      projects = data;
    }
  }

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

        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Recent projects
          </h2>
          <div className="space-y-1">
            {projects.length === 0 ? (
              <div className="px-4 py-2 text-sm text-muted-foreground">
                No projects found.
              </div>
            ) : (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/project/${project.id}`}
                  className="flex items-center gap-3 rounded-md px-3 py-2 ml-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  {project.name}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="px-3 pt-6 border-t">
          <h2 className="mb-2 px-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Org Setting
          </h2>
          <div className="space-y-1">
            <Link
              href="#"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Palette className="h-4 w-4" />
              Brand Visual
            </Link>
            <Link
              href="#"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Mic className="h-4 w-4" />
              Voice and Tone
            </Link>
            <Link
              href="#"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <BookText className="h-4 w-4" />
              Brand Guidelines
            </Link>
            <Link
              href="#"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Users className="h-4 w-4" />
              Customer Segmentation
            </Link>
            <Link
              href="#"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Platform Configurations
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import { SidebarClient } from "./sidebar-client";
import { createClient } from "@/utils/supabase/server";
import { TABLES } from "@/utils/supabase/constant";
import type { Project } from "@/types/models";

export async function Sidebar() {
  const supabase = await createClient();
  const { data } = await supabase
    .from(TABLES.PROJECTS)
    .select("id, name, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  return <SidebarClient recentProjects={(data ?? []) as Project[]} />;
}

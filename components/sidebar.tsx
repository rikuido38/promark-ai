import { createClient } from "@/utils/supabase/server";
import { SidebarClient } from "./sidebar-client";
import { TABLES } from "@/utils/supabase/constant";

export async function Sidebar() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let projects: { id: string; name: string }[] = [];
  if (userData?.user) {
    const { data } = await supabase
      .from(TABLES.PROJECTS)
      .select(`*, ${TABLES.PROJECT_USERS}!inner(user_id)`)
      .eq(`${TABLES.PROJECT_USERS}.user_id`, userData.user.id)
      .order("name");

    if (data && data.length > 0) {
      projects = data;
    } else {
      const { data: allProjects } = await supabase
        .from(TABLES.PROJECTS)
        .select("id, name")
        .order("name");
      if (allProjects) projects = allProjects;
    }
  } else {
    const { data } = await supabase.from(TABLES.PROJECTS).select("id, name").order("name");
    if (data) projects = data;
  }

  return <SidebarClient projects={projects} />;
}

import { SidebarClient } from "./sidebar-client";
import { getDb } from "@/utils/mongodb/client";
import { COLLECTIONS } from "@/utils/supabase/constant";
import type { Project } from "@/types/models";

export async function Sidebar() {
  const db = await getDb();
  const data = await db
    .collection(COLLECTIONS.PROJECTS)
    .find({}, { projection: { _id: 1, name: 1, created_at: 1, updated_at: 1 } })
    .sort({ updated_at: -1 })
    .limit(5)
    .toArray();

  const projects = data.map((d) => ({ ...d, id: d._id?.toString() ?? "" })) as unknown as Project[];

  return <SidebarClient recentProjects={projects} />;
}

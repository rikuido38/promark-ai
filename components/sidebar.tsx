import { cookies } from "next/headers";
import { SidebarClient } from "./sidebar-client";
import { getDb } from "@/repository/mongodb/client";
import { getUser } from "@/utils/cognito/auth";
import { getOrganizationMembership } from "@/repository/mongodb/models/organization-user";
import { ORG_COOKIE_NAME } from "@/hooks/use-active-org";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import type { Project } from "@/types/models";

export async function Sidebar() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get(ORG_COOKIE_NAME)?.value ?? DEFAULT_ORG_ID;

  const [user, db] = await Promise.all([getUser(), getDb()]);

  const [membership, projectData] = await Promise.all([
    user ? getOrganizationMembership(user.id, orgId) : null,
    db
      .collection(COLLECTIONS.PROJECTS)
      .find({}, { projection: { _id: 1, name: 1, created_at: 1, updated_at: 1 } })
      .sort({ updated_at: -1 })
      .limit(3)
      .toArray(),
  ]);

  const isOwner = membership?.is_owner ?? false;
  const projects = projectData.map((d) => ({ ...d, id: d._id?.toString() ?? "" })) as unknown as Project[];

  return <SidebarClient recentProjects={projects} isOwner={isOwner} />;
}

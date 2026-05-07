import { redirect } from "next/navigation";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { ProjectSettingsForm } from "./project-settings-form";
import type { MemberEntry } from "@/types/models";

export default async function ProjectSettingsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const projectId = params.id;

  const user = await getUser();
  if (!user) {
    return redirect(`/login?goto=/project/${projectId}/settings`);
  }

  const db = await getDb();

  const project = await db
    .collection(COLLECTIONS.PROJECTS)
    .findOne({ _id: projectId as any });

  if (!project) {
    return redirect("/project");
  }

  // Fetch members with their roles
  const projectUsers = await db
    .collection(COLLECTIONS.PROJECT_USERS)
    .find({ project_id: projectId })
    .toArray();

  // Get user details for each member
  const userIds = projectUsers.map((pu) => pu.user_id).filter(Boolean);
  const userDocs = userIds.length
    ? await db
        .collection("user_profiles")
        .find({ _id: { $in: userIds } })
        .project({ _id: 1, name: 1, email: 1, avatar_url: 1 })
        .toArray()
    : [];

  const userMap = new Map(userDocs.map((u) => [String(u._id), u]));

  const members: MemberEntry[] = projectUsers.map((pu) => {
    const u = userMap.get(String(pu.user_id)) ?? {};
    return {
      id: String(pu.user_id),
      name: (u.name as string) ?? "",
      email: (u.email as string) ?? "",
      avatar_url: (u.avatar_url as string | null) ?? null,
      role: pu.role as MemberEntry["role"],
    };
  });

  return (
    <div className="flex h-screen bg-white">
      <ProjectSidebar
        project={{ id: projectId, name: project.name as string }}
        activeItem="settings"
      />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Project Settings
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage settings and members for{" "}
                <span className="font-medium text-foreground">
                  {project.name as string}
                </span>
              </p>
            </div>

            <ProjectSettingsForm
              projectId={projectId}
              initialName={project.name as string}
              initialDescription={(project.description as string) ?? ""}
              members={members}
              currentUserId={user.id}
            />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

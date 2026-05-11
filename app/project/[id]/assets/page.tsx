import { redirect } from "next/navigation";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { ProjectAssetsGrid } from "./project-assets-grid";
import { ImageIcon } from "lucide-react";

export default async function ProjectAssetsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const projectId = params.id;

  const user = await getUser();
  if (!user) {
    return redirect(`/login?goto=/project/${projectId}/assets`);
  }

  const db = await getDb();

  const project = await db
    .collection(COLLECTIONS.PROJECTS)
    .findOne({ _id: projectId as any });

  if (!project) {
    return redirect("/project");
  }

  return (
    <div className="flex h-screen bg-white">
      <ProjectSidebar
        project={{ id: projectId, name: project.name as string }}
        activeItem="assets"
      />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
                <p className="text-sm text-muted-foreground">
                  Media belonging to or shared with{" "}
                  <span className="font-medium text-foreground">
                    {project.name as string}
                  </span>
                </p>
              </div>
            </div>

            <ProjectAssetsGrid projectId={projectId} />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

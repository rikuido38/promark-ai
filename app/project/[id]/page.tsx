import { redirect } from "next/navigation";
import CampaignList from "./campaign-list";
import { ProjectSidebar } from "@/components/project/project-sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";

export default async function ProjectPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const projectId = params.id;

  const user = await getUser();
  if (!user) {
    return redirect("/login");
  }

  const db = await getDb();

  // Fetch project details
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: projectId as any });

  if (!project) {
    return <div>Project not found</div>;
  }

  // Fetch campaigns for this project
  const campaigns = await db
    .collection(COLLECTIONS.CAMPAIGNS)
    .find({ project_id: projectId })
    .sort({ created_at: -1 })
    .toArray();

  // Cast the campaigns array to explicitly type the status property.
  const typedCampaigns = (campaigns || []).map((c: any) => ({
    id: c._id as string,
    name: c.name,
    project_id: c.project_id,
    start_date: c.start_date,
    end_date: c.end_date,
    status: c.status as "todo" | "in_progress" | "completed",
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));

  return (
    <div className="flex h-screen bg-white">
      <ProjectSidebar project={{ id: projectId, name: project.name as string }} activeItem="campaigns" />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {project.name}
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Manage your campaigns for this project.
                </p>
              </div>
            </div>

            <CampaignList initialCampaigns={typedCampaigns} />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

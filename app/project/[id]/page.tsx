import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CampaignList from "./campaign-list";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export default async function ProjectPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const projectId = params.id;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Fetch project details
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return <div>Project not found</div>;
  }

  // Fetch campaigns for this project
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  // Cast the campaigns array to explicitly type the status property.
  // The enum strings returned from supabase will be narrow typed in CampaignList.
  const typedCampaigns = (campaigns || []).map((c: any) => ({
    id: c.id,
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
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />

        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Manage your campaigns for this project.
                </p>
              </div>
            </div>

            <CampaignList initialCampaigns={typedCampaigns} />
          </div>
        </main>
      </div>
    </div>
  );
}

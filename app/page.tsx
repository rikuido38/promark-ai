import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MetricCard } from "@/components/metric-card";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { TABLES } from "@/utils/supabase/constant";
import {
  Briefcase,
  ListTodo,
  CheckCircle,
  Activity,
  CheckCircle2,
} from "lucide-react";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user's specific projects
  const { data: projectsData } = await supabase
    .from(TABLES.PROJECTS)
    .select(`id, ${TABLES.PROJECT_USERS}!inner(user_id)`)
    .eq(`${TABLES.PROJECT_USERS}.user_id`, user.id);

  const totalProjects = projectsData?.length || 0;
  const projectIds = projectsData?.map((p) => p.id) || [];

  let inProgressCampaigns = 0;
  let completedCampaigns = 0;
  let totalCampaigns = 0;

  if (projectIds.length > 0) {
    const { data: campaignsData } = await supabase
      .from(TABLES.CAMPAIGNS)
      .select("status")
      .in("project_id", projectIds);

    if (campaignsData) {
      totalCampaigns = campaignsData.length;
      inProgressCampaigns = campaignsData.filter(
        (c) => c.status === "in_progress",
      ).length;
      completedCampaigns = campaignsData.filter(
        (c) => c.status === "completed",
      ).length;
    }
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Your Dashboard
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Monitor your projects and campaigns performance
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Total Projects"
                value={totalProjects.toString()}
                trend="Active projects"
                trendUp={true}
                icon={<Briefcase className="h-5 w-5 text-blue-600" />}
                iconClassName="bg-blue-100"
              />
              <MetricCard
                title="Total Campaigns"
                value={totalCampaigns.toString()}
                trend="Across all projects"
                trendUp={true}
                icon={<ListTodo className="h-5 w-5 text-indigo-600" />}
                iconClassName="bg-indigo-100"
              />
              <MetricCard
                title="In Progress"
                value={inProgressCampaigns.toString()}
                trend="Campaigns currently running"
                trendUp={true}
                icon={<Activity className="h-5 w-5 text-amber-600" />}
                iconClassName="bg-amber-100"
              />
              <MetricCard
                title="Completed"
                value={completedCampaigns.toString()}
                trend="Successfully finished"
                trendUp={true}
                icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
                iconClassName="bg-emerald-100"
              />
            </div>
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

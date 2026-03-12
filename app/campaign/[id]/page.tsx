import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CampaignSidebar } from "@/components/campaign-sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import CampaignWorkspace from "./campaign-workspace";
import { getOrganization } from "@/app/brand/actions";
import { TABLES } from "@/utils/supabase/constant";

export default async function CampaignPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const campaignId = params.id;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Fetch campaign details
  const { data: campaign, error: campaignError } = await supabase
    .from(TABLES.CAMPAIGNS)
    .select("*, projects(name)")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return <div>Campaign not found</div>;
  }

  const org = await getOrganization();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <CampaignSidebar campaign={campaign} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-slate-50/50">
        <Header />
        
        <MainAssistantWrapper className="flex-1 overflow-hidden relative flex">
          <CampaignWorkspace 
            campaign={campaign} 
            assistantName={org?.assistant_name || undefined}
            avatarUrl={org?.avatar_url || null}
          />
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

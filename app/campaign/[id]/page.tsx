import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CampaignSidebar } from "@/components/campaign-sidebar";
import { Header } from "@/components/header";
import CampaignWorkspace from "./campaign-workspace";

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
    .from("campaigns")
    .select("*, projects(name)")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return <div>Campaign not found</div>;
  }

  return (
    <div className="flex h-screen bg-white">
      <CampaignSidebar campaign={campaign} />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />
        
        <main className="flex-1 overflow-hidden relative flex">
          <CampaignWorkspace campaign={campaign} />
        </main>
      </div>
    </div>
  );
}

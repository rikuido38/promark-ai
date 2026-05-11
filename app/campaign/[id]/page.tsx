import { redirect } from "next/navigation";
import { CampaignSidebar } from "@/components/campaign-sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import CampaignWorkspace from "./campaign-workspace";
import { getOrganization } from "@/app/brand/actions";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";

export default async function CampaignPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const campaignId = params.id;

  const user = await getUser();
  if (!user) {
    return redirect("/login");
  }

  const db = await getDb();

  // Fetch campaign details
  const campaignDoc = await db
    .collection(COLLECTIONS.CAMPAIGNS)
    .findOne({ _id: campaignId as any });

  if (!campaignDoc) {
    return <div>Campaign not found</div>;
  }

  // Fetch related project name
  const projectDoc = await db
    .collection(COLLECTIONS.PROJECTS)
    .findOne({ _id: campaignDoc.project_id as any }, { projection: { name: 1 } });

  const campaign = {
    ...campaignDoc,
    id: campaignDoc._id as string,
    projects: projectDoc ? { name: projectDoc.name } : null,
  };

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

import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { getOrgGeneralData } from "../actions";
import { OrgGeneralForm } from "./org-general-form";
import { redirect } from "next/navigation";

export default async function OrgGeneralSettingsPage() {
  let data;
  try {
    data = await getOrgGeneralData();
  } catch {
    redirect("/");
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-slate-50/50">
        <Header />
        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">General</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Manage your organization's name and members.
              </p>
            </div>
            <OrgGeneralForm
              orgName={data.name}
              logoUrl={data.logo_url}
              logoPath={data.logo_path}
              members={data.members}
              currentUserId={data.currentUserId}
            />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

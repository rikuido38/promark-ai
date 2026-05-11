import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { getOrganization } from "../../../brand/actions";
import { getRawOrgAvatarPath } from "./actions";
import { AssistantForm } from "./assistant-form";

export default async function AIAssistantSettingsPage() {
  const [org, avatarPath] = await Promise.all([
    getOrganization(),
    getRawOrgAvatarPath(),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-slate-50/50">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">AI Assistant</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Configure your organization's front-facing AI agent.
              </p>
            </div>

            <AssistantForm
              initialName={org?.assistant_name || null}
              initialAvatarUrl={org?.avatar_url || null}
              initialAvatarPath={avatarPath}
            />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

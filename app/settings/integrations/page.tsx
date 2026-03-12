import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { getIntegrations } from "./actions";
import { IntegrationList } from "./integration-list";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const integrations = await getIntegrations();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-slate-50/50">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Integrations
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Discover and manage third-party tools connected to your
                workspace.
              </p>
            </div>

            <IntegrationList initialData={integrations as any} />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

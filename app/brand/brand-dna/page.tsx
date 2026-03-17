import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { getBrandVisualSettings, getContextStaleness, getIllustrationSettings, getOrganization } from "../actions";
import { BrandDnaForm } from "./brand-dna-form";

export default async function BrandDnaPage() {
  const [initialSettings, , initialIllustrationSettings, contextState] = await Promise.all([
    getBrandVisualSettings(),
    getOrganization(),
    getIllustrationSettings(),
    getContextStaleness(),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50/50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto border-t relative">
          <div className="max-w-6xl mx-auto p-4 md:p-8">
            <BrandDnaForm
              key={`${contextState.isStale}-${contextState.status}`}
              initialSettings={initialSettings}
              initialIllustrationSettings={initialIllustrationSettings}
              isStale={contextState.isStale}
              initialStatus={contextState.status}
            />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

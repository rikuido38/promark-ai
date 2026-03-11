import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { getBrandVisualSettings, getOrganization } from "../actions";
import { BrandVisualForm } from "./brand-visual-form";

export default async function BrandVisualSettingsPage() {
  const [initialSettings, org] = await Promise.all([
    getBrandVisualSettings(),
    getOrganization(),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50/50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto border-t relative">
          <div className="max-w-6xl mx-auto p-4 md:p-8">
            <BrandVisualForm initialSettings={initialSettings} />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

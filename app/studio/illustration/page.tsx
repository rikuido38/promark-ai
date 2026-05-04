import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { IllustrationAssistantSetup } from "./illustration-assistant-setup";
import { StudioIllustrationGrid } from "./studio-illustration-grid";
import { StudioPrompt } from "./studio-prompt";

export default function StudioIllustrationPage() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50/50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto border-t relative">
          <IllustrationAssistantSetup />

          {/* Hero prompt area */}
          <div className="flex flex-col items-center justify-center px-6 py-16 border-b bg-white">
            <StudioPrompt />
          </div>

          {/* Illustration grid */}
          <div className="max-w-5xl mx-auto px-6 py-10 w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Your illustrations</h2>
            </div>
            <StudioIllustrationGrid />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}


import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PenLine, ImageIcon, Video, Sparkles } from "lucide-react";
import { DraftAssistantSetup } from "./draft-assistant-setup";
import { DraftGrid } from "./draft-grid";

export default function DraftPage() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50/50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto border-t relative">
          <DraftAssistantSetup />
          <div className="max-w-3xl mx-auto p-8 md:p-12 space-y-8">

            {/* Hero */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
                <PenLine className="w-7 h-7" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Your collection</h1>
              <p className="text-muted-foreground text-base max-w-lg">
                Your personal creative workspace. Craft images and videos that stay true to your brand — powered by your Brand DNA and guided by AI.
              </p>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="images" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="images" className="flex-1 gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Images
                </TabsTrigger>
                <TabsTrigger value="illustrations" className="flex-1 gap-2">
                  <Sparkles className="w-4 h-4" />
                  Illustrations
                </TabsTrigger>
                <TabsTrigger value="videos" className="flex-1 gap-2">
                  <Video className="w-4 h-4" />
                  Videos
                </TabsTrigger>
              </TabsList>

              <TabsContent value="images">
                <DraftGrid mediaType="image" />
              </TabsContent>

              <TabsContent value="illustrations">
                <DraftGrid mediaType="illustration" />
              </TabsContent>

              <TabsContent value="videos">
                <DraftGrid mediaType="video" />
              </TabsContent>
            </Tabs>

          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

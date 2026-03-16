"use client";

import { BrandVisualSettings, IllustrationSettings } from "@/types/settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MasterBrandTab } from "./master-brand-tab";
import { IllustrationsTab } from "./illustrations-tab";

export function BrandDnaForm({
  initialSettings,
  initialIllustrationSettings,
}: {
  initialSettings: BrandVisualSettings | null;
  initialIllustrationSettings: IllustrationSettings | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brand DNA</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Define the core visual rules and aesthetics for your organization.
          These settings will be used by the Vision and Creative APIs.
        </p>
      </div>

      <Tabs defaultValue="master-brand" className="max-w-4xl">
        <TabsList variant="line">
          <TabsTrigger value="master-brand">Master Brand</TabsTrigger>
          <TabsTrigger value="illustrations">Illustrations</TabsTrigger>
        </TabsList>

        <TabsContent value="master-brand">
          <MasterBrandTab initialSettings={initialSettings} />
        </TabsContent>

        <TabsContent value="illustrations">
          <IllustrationsTab initialIllustrationSettings={initialIllustrationSettings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

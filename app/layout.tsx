import type { Metadata } from "next";
import { Public_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AIAssistantProvider } from "@/components/ai-assistant-provider";
import { OrgInitializer } from "@/components/org-initializer";
import { getOrganization } from "./brand/actions";
import { getConnectedUserTools } from "./orgs/settings/integrations/actions";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Promark AI",
  description: "AI-driven solution for targeted marketing content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [org, connectedTools] = await Promise.all([
    getOrganization(),
    getConnectedUserTools(),
  ]);

  return (
    <html lang="en">
      <body
        className={`${publicSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <AIAssistantProvider
          assistantName={org?.assistant_name}
          avatarUrl={org?.avatar_url}
          connectedTools={connectedTools}
        >
          <OrgInitializer />
          {children}
        </AIAssistantProvider>
        <Toaster />
      </body>
    </html>
  );
}

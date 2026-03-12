"use client";

import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { GlobalAssistantFAB } from "./global-assistant-fab";
import type { ConnectedTool } from "@/types/models";


type AIAssistantContextType = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  chatKey: string;
  assistantName: string | null;
  avatarUrl: string | null;
  connectedTools: ConnectedTool[];
};

const AIAssistantContext = createContext<AIAssistantContextType | undefined>(undefined);

export function AIAssistantProvider({
  children,
  assistantName,
  avatarUrl,
  connectedTools = [],
}: {
  children: React.ReactNode;
  assistantName?: string | null;
  avatarUrl?: string | null;
  connectedTools?: ConnectedTool[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Route change reset logic
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Hide the FAB on specific pages
  const HIDDEN_PATHS = ["/project"];
  const shouldShowFAB = !HIDDEN_PATHS.some((path) => pathname.startsWith(path));

  const contextValue = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      chatKey: pathname,
      assistantName: assistantName || null,
      avatarUrl: avatarUrl || null,
      connectedTools,
    }),
    [isOpen, pathname, assistantName, avatarUrl, connectedTools], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <AIAssistantContext.Provider
      value={contextValue}
    >
      {children}
      {shouldShowFAB && (
        <GlobalAssistantFAB 
          assistantName={assistantName || "AI Assistant"} 
          avatarUrl={avatarUrl || null} 
        />
      )}
    </AIAssistantContext.Provider>
  );
}

export function useAIAssistant() {
  const context = useContext(AIAssistantContext);
  if (context === undefined) {
    throw new Error("useAIAssistant must be used within an AIAssistantProvider");
  }
  return context;
}

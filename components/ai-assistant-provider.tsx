"use client";

import { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { GlobalAssistantFAB } from "./global-assistant-fab";
import type { ConnectedTool } from "@/types/models";
import type { MessageHandler } from "@/components/assistant-chatbot";
import type { GenerationSettings } from "@/types/generation-settings";

type AIAssistantContextType = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  openWithMessage: (msg: string, model?: string, settings?: Partial<GenerationSettings>) => void;
  pendingAutoMessage: string | undefined;
  pendingAutoModel: string | undefined;
  pendingAutoSettings: Partial<GenerationSettings> | undefined;
  chatKey: string;
  assistantName: string | null;
  avatarUrl: string | null;
  connectedTools: ConnectedTool[];
  messageHandler: MessageHandler | undefined;
  setMessageHandler: (handler: MessageHandler | undefined) => void;
  availableModels: string[];
  setAvailableModels: (models: string[]) => void;
  assistantIdentifier: string | undefined;
  setAssistantIdentifier: (key: string | undefined) => void;
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
  const [pendingAutoMessage, setPendingAutoMessage] = useState<string | undefined>(undefined);
  const [pendingAutoModel, setPendingAutoModel] = useState<string | undefined>(undefined);
  const [pendingAutoSettings, setPendingAutoSettings] = useState<Partial<GenerationSettings> | undefined>(undefined);
  const [messageHandlerState, setMessageHandlerState] = useState<MessageHandler | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [assistantIdentifier, setAssistantIdentifier] = useState<string | undefined>(undefined);
  const pathname = usePathname();

  const setMessageHandler = useCallback(
    (handler: MessageHandler | undefined) => setMessageHandlerState(() => handler),
    [],
  );

  const openWithMessage = useCallback((msg: string, model?: string, settings?: Partial<GenerationSettings>) => {
    setPendingAutoMessage(msg);
    setPendingAutoModel(model);
    setPendingAutoSettings(settings ?? undefined);
    setIsOpen(true);
  }, []);

  // Auto-clear pending message after it has been consumed by the chatbot
  useEffect(() => {
    if (!pendingAutoMessage) return;
    const t = setTimeout(() => {
      setPendingAutoMessage(undefined);
      setPendingAutoModel(undefined);
      setPendingAutoSettings(undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [pendingAutoMessage]);

  // Route change reset logic
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Hide the FAB on specific pages
  const HIDDEN_PATHS = ["/project", "/studio"];
  const shouldShowFAB = !HIDDEN_PATHS.some((path) => pathname.startsWith(path));

  const contextValue = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      openWithMessage,
      pendingAutoMessage,
      pendingAutoModel,
      pendingAutoSettings,
      chatKey: pathname,
      assistantName: assistantName || null,
      avatarUrl: avatarUrl || null,
      connectedTools,
      messageHandler: messageHandlerState,
      setMessageHandler,
      availableModels,
      setAvailableModels,
      assistantIdentifier,
      setAssistantIdentifier,
    }),
    [isOpen, openWithMessage, pendingAutoMessage, pendingAutoModel, pendingAutoSettings, pathname, assistantName, avatarUrl, connectedTools, messageHandlerState, setMessageHandler, availableModels, setAvailableModels, assistantIdentifier], // eslint-disable-line react-hooks/exhaustive-deps
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

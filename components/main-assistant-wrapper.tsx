"use client";

import { useAIAssistant } from "./ai-assistant-provider";
import { AssistantChatbot } from "@/components/assistant-chatbot";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export function MainAssistantWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isOpen, setIsOpen, chatKey, assistantName, avatarUrl, connectedTools, messageHandler, availableModels, assistantIdentifier, pendingAutoMessage, pendingAutoModel, pendingAutoSettings } =
    useAIAssistant();

  // If chat is entirely disabled for this path, we could conditionally
  // return just `<main className={className}>{children}</main>` here.
  // But our provider's `shouldShowFAB` logic governs if the FAB shows up.
  // To be safe, if `isOpen` is false, it just renders 100% width anyway.

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize={100} minSize={50}>
        <main className={className}>{children}</main>
      </ResizablePanel>

      {isOpen && (
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize={25} minSize={20}>
            <div className="h-full w-full bg-slate-50 border-l shadow-xl flex flex-col overflow-hidden relative">
              <div className="flex-1 overflow-hidden relative">
                <AssistantChatbot
                  key={chatKey}
                  title={assistantName || "AI Assistant"}
                  systemMessage="Hi! I can help you with your marketing campaigns. How can I assist you today?"
                  avatarUrl={avatarUrl}
                  onClose={() => setIsOpen(false)}
                  connectedTools={connectedTools}
                  onSendMessage={messageHandler}
                  availableModels={availableModels}
                  pageKey={assistantIdentifier}
                  autoSendMessage={pendingAutoMessage}
                  initialModel={pendingAutoModel}
                  defaultSettings={pendingAutoSettings}
                />
              </div>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

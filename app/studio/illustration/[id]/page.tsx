import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { ThreadWorkspace } from "./thread-workspace";
import { loadChatHistory, loadLastAssistantImages, loadLatestVersion } from "./actions";

export default async function StudioIllustrationThreadPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const user = await getUser();
  if (!user) redirect("/login");

  const db = await getDb();

  // id is the assetId (user-facing key). Resolve the internal thread_id from it.
  const thread = await db
    .collection(COLLECTIONS.STUDIO_THREADS)
    .findOne({ asset_id: id }, { projection: { thread_id: 1, prompt: 1, model: 1, is_new_chat: 1 } });

  const internalThreadId = (thread?.thread_id as string | undefined) ?? id;

  const [chatHistory, initialMedias, latestVersion] = await Promise.all([
    loadChatHistory(internalThreadId),
    loadLastAssistantImages(internalThreadId),
    loadLatestVersion(id),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50/50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <div className="flex-1 overflow-hidden border-t">
          <ThreadWorkspace
            assetId={id}
            threadId={internalThreadId}
            initialPrompt={(thread?.prompt as string | undefined) ?? undefined}
            initialModel={(thread?.model as string | undefined) ?? undefined}
            isNewChat={(thread?.is_new_chat as boolean | undefined) ?? true}
            chatHistory={chatHistory}
            initialMedias={initialMedias}
            latestVersion={latestVersion ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}

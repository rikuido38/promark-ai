import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { ThreadWorkspace } from "./thread-workspace";
import { loadChatHistory, loadLastAssistantImages } from "./actions";

export default async function StudioIllustrationThreadPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const user = await getUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const [thread, chatHistory, initialMedias] = await Promise.all([
    db
      .collection(COLLECTIONS.STUDIO_THREADS)
      .findOne({ thread_id: id }, { projection: { prompt: 1, model: 1, is_new_chat: 1 } }),
    loadChatHistory(id),
    loadLastAssistantImages(id),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50/50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <div className="flex-1 overflow-hidden border-t">
          <ThreadWorkspace
            threadId={id}
            initialPrompt={(thread?.prompt as string | undefined) ?? undefined}
            initialModel={(thread?.model as string | undefined) ?? undefined}
            isNewChat={(thread?.is_new_chat as boolean | undefined) ?? true}
            chatHistory={chatHistory}
            initialMedias={initialMedias}
          />
        </div>
      </div>
    </div>
  );
}

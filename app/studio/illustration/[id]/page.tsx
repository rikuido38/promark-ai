import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { ThreadWorkspace } from "./thread-workspace";
import { TABLES } from "@/utils/supabase/constant";
import { loadChatHistory } from "./actions";

export default async function StudioIllustrationThreadPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: thread }, chatHistory] = await Promise.all([
    supabase
      .from(TABLES.STUDIO_THREADS)
      .select("prompt, model, is_new_chat")
      .eq("thread_id", id)
      .single(),
    loadChatHistory(id),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50/50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <div className="flex-1 overflow-hidden border-t">
          <ThreadWorkspace
            threadId={id}
            initialPrompt={thread?.prompt ?? undefined}
            initialModel={thread?.model ?? undefined}
            isNewChat={thread?.is_new_chat ?? true}
            chatHistory={chatHistory}
          />
        </div>
      </div>
    </div>
  );
}

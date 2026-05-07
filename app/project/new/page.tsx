import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { getUser } from "@/utils/cognito/auth";
import { NewProjectForm } from "@/components/project/new-project-form";

export default async function NewProjectPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />

        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                New Project
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create a project and invite team members.
              </p>
            </div>

            <NewProjectForm currentUserId={user.id} />
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MainAssistantWrapper } from "@/components/main-assistant-wrapper";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatDate(date: unknown): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date as string);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function ProjectsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const projects = await db
    .collection(COLLECTIONS.PROJECTS)
    .find({})
    .sort({ updated_at: -1 })
    .toArray();

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-50/50">
        <Header />
        <MainAssistantWrapper className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {projects.length} project{projects.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button asChild>
                <Link href="/project/new" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Project
                </Link>
              </Button>
            </div>

            {/* List */}
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
                <FolderKanban className="h-10 w-10 text-muted-foreground/40 mb-4" />
                <p className="text-sm font-medium text-muted-foreground">No projects yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-6">
                  Create your first project to get started.
                </p>
                <Button asChild size="sm">
                  <Link href="/project/new">
                    <Plus className="h-4 w-4 mr-1.5" />
                    New Project
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/60">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Last modified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {projects.map((p) => (
                      <tr
                        key={String(p._id)}
                        className="group hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/project/${String(p._id)}`}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {p.name as string}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground max-w-xs truncate hidden sm:table-cell">
                          {(p.description as string) || <span className="italic opacity-50">No description</span>}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(p.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </MainAssistantWrapper>
      </div>
    </div>
  );
}

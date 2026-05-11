"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { COLLECTIONS } from "@/utils/supabase/constant";
import type { ProjectRole } from "@/types/models";

export async function updateProjectDetails(
  projectId: string,
  name: string,
  description: string,
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Project name is required.");

  const db = await getDb();
  await db.collection(COLLECTIONS.PROJECTS).updateOne(
    { _id: projectId as any },
    {
      $set: {
        name: trimmedName,
        description: description.trim() || null,
        updated_at: new Date().toISOString(),
      },
    },
  );

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/settings`);
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  await db.collection(COLLECTIONS.PROJECT_USERS).updateOne(
    { project_id: projectId, user_id: userId },
    { $set: { role } },
  );

  revalidatePath(`/project/${projectId}/settings`);
}

export async function removeMember(
  projectId: string,
  userId: string,
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  if (user.id === userId) throw new Error("You cannot remove yourself.");

  const db = await getDb();
  await db
    .collection(COLLECTIONS.PROJECT_USERS)
    .deleteOne({ project_id: projectId, user_id: userId });

  revalidatePath(`/project/${projectId}/settings`);
}

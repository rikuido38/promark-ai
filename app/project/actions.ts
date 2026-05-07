"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { assignRole } from "@/lib/permissions/enforcer";
import type { UserProfile, ProjectRole } from "@/types/models";
import { randomUUID } from "node:crypto";

export type NewMember = {
  userId: string;
  role: ProjectRole;
};

export async function createProject(
  name: string,
  description: string,
  members: NewMember[],
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();
  const projectId = randomUUID();
  const now = new Date().toISOString();

  await db.collection(COLLECTIONS.PROJECTS).insertOne({
    _id: projectId as unknown as any,
    name: name.trim(),
    description: description.trim() || null,
    created_at: now,
    updated_at: now,
  });

  const domain = `project:${projectId}`;

  // Insert creator as owner in project_users + Casbin
  const allMembers: NewMember[] = [
    { userId: user.id, role: "owner" },
    ...members.filter((m) => m.userId !== user.id),
  ];

  const projectUserDocs = allMembers.map((m) => ({
    _id: `pu-${m.userId}-${projectId}`,
    user_id: m.userId,
    project_id: projectId,
    role: m.role,
    joined_at: now,
  }));

  await db
    .collection(COLLECTIONS.PROJECT_USERS)
    .insertMany(projectUserDocs as any[]);

  for (const m of allMembers) {
    await assignRole(`user:${m.userId}`, m.role, domain);
  }

  redirect(`/project/${projectId}`);
}

export async function searchUsers(query: string): Promise<UserProfile[]> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  if (!query || query.trim().length < 2) return [];

  const db = await getDb();
  const docs = await db
    .collection<{ name?: string; email?: string; avatar_url?: string | null }>(
      "user_profiles",
    )
    .find(
      {
        _id: { $ne: user.id },
        $or: [
          { name: { $regex: query.trim(), $options: "i" } },
          { email: { $regex: query.trim(), $options: "i" } },
        ],
      },
      { projection: { _id: 1, name: 1, email: 1, avatar_url: 1 } },
    )
    .limit(20)
    .toArray();

  return docs.map((d) => ({
    id: String(d._id),
    name: d.name ?? "",
    email: d.email ?? "",
    avatar_url: d.avatar_url ?? null,
  }));
}

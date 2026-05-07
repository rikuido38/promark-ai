"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MemberInvitePanel } from "@/components/ui/member-invite-dialog";
import { updateProjectDetails, updateMemberRole, removeMember } from "./actions";
import { searchUsers } from "@/app/project/actions";
import type { MemberEntry, ProjectRole } from "@/types/models";

interface ProjectSettingsFormProps {
  projectId: string;
  initialName: string;
  initialDescription: string;
  members: MemberEntry[];
  currentUserId: string;
}

export function ProjectSettingsForm({
  projectId,
  initialName,
  initialDescription,
  members: initialMembers,
  currentUserId,
}: ProjectSettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [members, setMembers] = useState<MemberEntry[]>(initialMembers);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [isDetailsPending, startDetailsTransition] = useTransition();

  const handleDetailsSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDetailsError(null);
    setDetailsSaved(false);
    startDetailsTransition(async () => {
      try {
        await updateProjectDetails(projectId, name, description);
        setDetailsSaved(true);
      } catch (err: unknown) {
        if (err instanceof Error) setDetailsError(err.message);
      }
    });
  };

  const handleChangeRole = async (userId: string, role: ProjectRole) => {
    try {
      await updateMemberRole(projectId, userId, role);
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role } : m)),
      );
    } catch {
      // role stays unchanged on error
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeMember(projectId, userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch {
      // no-op
    }
  };

  const handleInvite = (entries: MemberEntry[]) => {
    setMembers((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const e of entries) map.set(e.id, e);
      return Array.from(map.values());
    });
  };

  return (
    <div className="space-y-10">
      {/* Project details */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">General</h2>
          <p className="text-sm text-muted-foreground">
            Update the project name and description.
          </p>
        </div>

        <form onSubmit={handleDetailsSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isDetailsPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-desc">Description</Label>
            <Textarea
              id="settings-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isDetailsPending}
              rows={3}
            />
          </div>

          {detailsError && (
            <p className="text-sm text-destructive">{detailsError}</p>
          )}
          {detailsSaved && (
            <p className="text-sm text-green-600">Changes saved.</p>
          )}

          <Button type="submit" size="sm" disabled={isDetailsPending}>
            {isDetailsPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </section>

      <div className="border-t" />

      {/* Members */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Invite people and manage access to this project.
          </p>
        </div>

        <MemberInvitePanel
          members={members}
          searchFn={searchUsers}
          onInvite={handleInvite}
          onChangeRole={handleChangeRole}
          onRemove={handleRemove}
          currentUserId={currentUserId}
        />
      </section>
    </div>
  );
}

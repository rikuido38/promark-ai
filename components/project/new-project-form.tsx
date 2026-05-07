"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MemberInvitePanel } from "@/components/ui/member-invite-dialog";
import { createProject, searchUsers, type NewMember } from "@/app/project/actions";
import type { MemberEntry, ProjectRole } from "@/types/models";

export function NewProjectForm({ currentUserId }: { currentUserId: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleInvite = (entries: MemberEntry[]) => {
    setMembers((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const e of entries) map.set(e.id, e);
      return Array.from(map.values());
    });
  };

  const handleChangeRole = (userId: string, role: ProjectRole) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === userId ? { ...m, role } : m)),
    );
  };

  const handleRemove = (userId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await createProject(
          name,
          description,
          members.map((m) => ({ userId: m.id, role: m.role } satisfies NewMember)),
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError(err.message);
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="project-name">
            Project Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="project-name"
            placeholder="e.g. Summer Campaign 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="project-desc">Description</Label>
          <Textarea
            id="project-desc"
            placeholder="Brief description of this project…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
            rows={3}
          />
        </div>

        {/* Members */}
        <div className="space-y-2">
          <Label>Members</Label>
          <MemberInvitePanel
            members={members}
            searchFn={searchUsers}
            onInvite={handleInvite}
            onChangeRole={handleChangeRole}
            onRemove={handleRemove}
            currentUserId={currentUserId}
          />
          <p className="text-xs text-muted-foreground">
            You will be added as owner automatically.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create Project"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => history.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
  );
}

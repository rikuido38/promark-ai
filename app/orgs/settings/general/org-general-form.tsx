"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { OrgMemberPanel } from "@/components/ui/org/org-member-panel";
import type { OrgMember } from "@/components/ui/org/org-member-panel";
import type { UserProfile } from "@/types/models";
import {
  saveOrgGeneralSettings,
  uploadOrgLogo,
  searchUsersForOrg,
  addOrgMembers,
  removeOrgMember,
  setOrgMemberAsOwner,
} from "../actions";

interface OrgGeneralFormProps {
  orgName: string;
  logoUrl: string | null;
  logoPath: string | null;
  members: OrgMember[];
  currentUserId: string;
}

export function OrgGeneralForm({ orgName, logoUrl, logoPath, members: initialMembers, currentUserId }: OrgGeneralFormProps) {
  const router = useRouter();
  const [name, setName] = useState(orgName);
  const [members, setMembers] = useState<OrgMember[]>(initialMembers);
  const [isSaving, startSaving] = useTransition();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(logoUrl);
  const [dbLogoPath, setDbLogoPath] = useState<string | null>(logoPath);

  const hasLogo = dbLogoPath !== null || logoFile !== null;
  const isDirty = name.trim() !== orgName.trim() || logoFile !== null;

  const handleLogoDrop = (file: File) => {
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !hasLogo) return;
    startSaving(async () => {
      try {
        let finalLogoPath = dbLogoPath;
        if (logoFile) {
          const formData = new FormData();
          formData.append("file", logoFile);
          const result = JSON.parse(await uploadOrgLogo(formData)) as { signedUrl: string; path: string };
          finalLogoPath = result.path;
          setDbLogoPath(result.path);
          setLogoPreview(result.signedUrl);
          setLogoFile(null);
        }
        await saveOrgGeneralSettings(name.trim(), finalLogoPath ?? undefined);
        toast.success("Organization settings saved");
        router.refresh();
      } catch {
        toast.error("Failed to save settings");
      }
    });
  };

  const handleAdd = async (users: UserProfile[]) => {
    try {
      await addOrgMembers(users.map((u) => u.id));
      setMembers((prev) => [
        ...prev,
        ...users.map((u) => ({ ...u, is_owner: false })),
      ]);
      toast.success(`Added ${users.length} member${users.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to add members");
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeOrgMember(userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const handleSetOwner = async (userId: string) => {
    try {
      await setOrgMemberAsOwner(userId);
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, is_owner: true } : m)));
      toast.success("Member is now an owner");
    } catch {
      toast.error("Failed to update ownership");
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Organization name + logo */}
      <form onSubmit={handleSave} className="bg-white rounded-lg border shadow-sm p-8 space-y-6">
        <div className="flex items-start gap-6">
          {/* Name */}
          <div className="flex-1 space-y-2">
            <Label htmlFor="org_name" className="text-sm font-medium">
              {"Organization name "}<span className="text-destructive">*</span>
            </Label>
            <Input
              id="org_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your organization name"
              required
            />
          </div>
        </div>

        {/* Logo — 2:1 rectangle */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            {"Logo "}<span className="text-destructive">*</span>
          </Label>
          <ImageDropzone
            imageUrl={logoPreview ?? undefined}
            onImageDrop={handleLogoDrop}
            className="w-48 h-24"
          />
          {!hasLogo && (
            <p className="text-xs text-destructive">Required</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!isDirty || !hasLogo || isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      {/* Members */}
      <div className="bg-white rounded-lg border shadow-sm p-8 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has access to this organization.
          </p>
        </div>
        <OrgMemberPanel
          members={members}
          searchFn={searchUsersForOrg}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onSetOwner={handleSetOwner}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}

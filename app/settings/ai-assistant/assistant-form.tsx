"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { saveAssistantName, uploadAvatarToStorage } from "../actions";
import { AvatarDropzone } from "@/components/ui/avatar-dropzone";

export function AssistantForm({
  initialName,
  initialAvatarUrl,
  initialAvatarPath,
}: {
  initialName: string | null;
  /** Signed URL for display (resolved by the page). */
  initialAvatarUrl: string | null;
  /** Raw storage path stored in the DB (e.g. default/images/assistant_avatar.png). */
  initialAvatarPath: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [name, setName] = useState(initialName || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialAvatarUrl,
  );

  // Raw storage path — never a signed URL. Only this is written to the DB.
  const [dbAvatarPath, setDbAvatarPath] = useState<string | null>(
    initialAvatarPath,
  );

  const isDirty = name !== (initialName || "") || avatarFile !== null;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      let finalPath = dbAvatarPath;
      let finalPreview = avatarPreview;

      if (avatarFile) {
        setUploadingAvatar(true);
        const data = new FormData();
        data.append("file", avatarFile);

        const resultString = await uploadAvatarToStorage(data);
        const result = JSON.parse(resultString);

        finalPath = result.path;
        finalPreview = result.signedUrl;
        setUploadingAvatar(false);
      }

      await saveAssistantName(name.trim(), finalPath);

      setAvatarFile(null);
      setDbAvatarPath(finalPath);
      setAvatarPreview(finalPreview);

      toast.success("Assistant settings saved successfully");
      router.refresh();
    } catch {
      toast.error("Failed to save assistant settings");
      setUploadingAvatar(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = (file: File) => {
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 max-w-2xl bg-white p-8 rounded-lg border shadow-sm"
    >
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Avatar</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Upload a 1:1 ratio square image to represent the AI Assistant.
          </p>
          <div className="relative inline-block">
            {uploadingAvatar && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 rounded-full">
                <span className="text-xs font-medium animate-pulse">
                  Uploading...
                </span>
              </div>
            )}
            <AvatarDropzone
              onImageDrop={handleAvatarUpload}
              imageUrl={avatarPreview || ""}
              className="w-32 h-32"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assistant_name" className="text-sm font-medium">
          Name
        </Label>
        <Input
          id="assistant_name"
          placeholder="e.g. Promark AI Copilot"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          This name will be displayed in the chat interface across the platform.
        </p>
      </div>

      <Button type="submit" disabled={!isDirty || loading || !name.trim()}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}

export type UploadAttachmentResult = {
  storagePath: string;
  signedUrl: string;
  filename: string;
};

/**
 * Uploads a chat attachment image via the /api/upload-attachment route.
 * Uses a regular fetch so the POST goes to the dedicated endpoint
 * instead of the current page URL (which happens with Server Actions).
 */
export async function uploadChatAttachmentClient(file: File): Promise<UploadAttachmentResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload-attachment", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Upload failed.");
  }

  return res.json() as Promise<UploadAttachmentResult>;
}

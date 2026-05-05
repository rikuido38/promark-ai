"use server";

import { getUser } from "@/utils/cognito/auth";
import { createStorageClient } from "@/utils/s3/storage";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";

const ALLOWED_MIME_TYPES = ["image/png", "image/webp", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type UploadAttachmentResult = {
  storagePath: string;
  signedUrl: string;
  filename: string;
};

/**
 * Uploads a chat attachment image (PNG / WEBP / JPEG) to
 * temp/<org_id>/ in Supabase storage and returns a 1-hour signed URL.
 */
export async function uploadChatAttachment(
  formData: FormData,
): Promise<UploadAttachmentResult> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided.");

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Only PNG, WEBP, and JPEG files are allowed.");
  }

  if (file.size > MAX_BYTES) {
    throw new Error("File exceeds the 10 MB size limit.");
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const filename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;

  const bytes = await file.arrayBuffer();
  const storage = createStorageClient();

  const { error: uploadError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: signedData, error: signedError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(storagePath, 60 * 60); // 1-hour URL

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Signed URL creation failed: ${signedError?.message}`);
  }

  return { storagePath, signedUrl: signedData.signedUrl, filename };
}

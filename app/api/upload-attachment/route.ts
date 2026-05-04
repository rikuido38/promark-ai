import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only PNG, WEBP, and JPEG files are allowed." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 10 MB size limit." },
      { status: 400 },
    );
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const filename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `temp/${DEFAULT_ORG_ID}/${filename}`;

  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(storagePath, 60 * 60); // 1-hour URL

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: `Signed URL creation failed: ${signedError?.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    storagePath,
    signedUrl: signedData.signedUrl,
    filename,
  });
}

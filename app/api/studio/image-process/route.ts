import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import sharp from "sharp";

/**
 * POST /api/studio/image-process
 *
 * Body: {
 *   imageUrl: string      — signed URL of the source image
 *   format: "png" | "svg" — export format (svg wraps raster in an <image> element)
 *   crop?: { x: number; y: number; width: number; height: number } — pixel crop rectangle
 * }
 *
 * Returns the processed image as a binary response with appropriate Content-Type.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.imageUrl !== "string") {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const { imageUrl, format = "png", crop } = body as {
    imageUrl: string;
    format?: "png" | "svg";
    crop?: { x: number; y: number; width: number; height: number };
  };

  // Fetch the source image
  const fetchRes = await fetch(imageUrl);
  if (!fetchRes.ok) {
    return NextResponse.json({ error: "Failed to fetch source image" }, { status: 502 });
  }
  const sourceBuffer = Buffer.from(await fetchRes.arrayBuffer());

  let pipeline = sharp(sourceBuffer);

  // Apply crop if provided
  if (crop && crop.width > 0 && crop.height > 0) {
    pipeline = pipeline.extract({
      left: Math.round(crop.x),
      top: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    });
  }

  if (format === "svg") {
    // Wrap the raster image as a PNG-encoded data URI inside an SVG
    const pngBuffer = await pipeline.png().toBuffer();
    const { width, height } = await sharp(pngBuffer).metadata();
    const base64 = pngBuffer.toString("base64");
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><image href="data:image/png;base64,${base64}" width="${width}" height="${height}"/></svg>`;
    return new NextResponse(svgContent, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="illustration.svg"`,
      },
    });
  }

  // Default: PNG
  const pngBuffer = await pipeline.png().toBuffer();
  return new NextResponse(pngBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="illustration.png"`,
    },
  });
}

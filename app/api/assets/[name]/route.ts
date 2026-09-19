import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { assetPath, isSafeAssetName, mimeForAsset } from "@/lib/assets";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  if (!isSafeAssetName(name)) {
    return new NextResponse("not found", { status: 404 });
  }
  try {
    const bytes = await readFile(assetPath(name));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeForAsset(name),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}

/** Read image file metadata without transferring the image again. */
export async function HEAD(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  if (!isSafeAssetName(name)) return new NextResponse(null, { status: 404 });
  try {
    const file = await stat(assetPath(name));
    if (!file.isFile()) return new NextResponse(null, { status: 404 });
    return new NextResponse(null, {
      headers: {
        "Content-Type": mimeForAsset(name),
        "Content-Length": String(file.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

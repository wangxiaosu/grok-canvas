import { NextResponse } from "next/server";
import { saveBufferAsset } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: { kind: "bad_request", message: "expected multipart form" } }, { status: 400 });
  }
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: { kind: "bad_request", message: "no files provided" } }, { status: 400 });
  }

  const saved = [];
  const rejected = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      rejected.push({ name: file.name, reason: "仅支持 PNG / JPEG / WebP" });
      continue;
    }
    if (file.size > MAX_BYTES) {
      rejected.push({ name: file.name, reason: "单张不能超过 20MB" });
      continue;
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    saved.push({ ...(await saveBufferAsset(buffer, file.type)), originalName: file.name });
  }
  return NextResponse.json({ assets: saved, rejected });
}

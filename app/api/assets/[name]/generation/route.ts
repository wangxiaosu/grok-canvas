import { NextResponse } from "next/server";
import { isSafeAssetName, readGenerationRecord } from "@/lib/assets";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isSafeAssetName(name)) return NextResponse.json({ error: "无效的图片名称" }, { status: 400 });
  try {
    const record = await readGenerationRecord(name);
    return NextResponse.json(record ? {
      originalPrompt: record.originalPrompt,
      referenceAssets: record.referenceAssets.filter(isSafeAssetName),
      parameters: "parameters" in record ? record.parameters : undefined,
      ...("firstFrame" in record ? {
        frames: {
          ...(record.firstFrame && isSafeAssetName(record.firstFrame) ? { first: record.firstFrame } : {}),
          ...(record.lastFrame && isSafeAssetName(record.lastFrame) ? { last: record.lastFrame } : {}),
        },
      } : {}),
    } : null, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "生成信息读取失败" }, { status: 500 });
  }
}

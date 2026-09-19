import { NextResponse } from "next/server";
import {
  createCanvas,
  listCanvases,
  loadLastCanvasId,
  saveLastCanvasId,
} from "@/lib/canvas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let canvases = await listCanvases();
  let lastId = await loadLastCanvasId();
  if (!lastId || !canvases.some((item) => item.id === lastId)) {
    lastId = canvases[0]?.id ?? null;
  }
  if (!lastId) {
    const created = await createCanvas();
    canvases = [
      { id: created.id, name: created.name, createdAt: created.createdAt, updatedAt: created.updatedAt },
    ];
    lastId = created.id;
  }
  await saveLastCanvasId(lastId);
  return NextResponse.json({ canvases, lastCanvasId: lastId });
}

export async function POST() {
  const created = await createCanvas();
  await saveLastCanvasId(created.id);
  return NextResponse.json(created, { status: 201 });
}

import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";

const DATA_DIR = dataDir();
const CANVASES_DIR = path.join(DATA_DIR, "canvases");
const APP_STATE_FILE = path.join(DATA_DIR, "app-state.json");
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export type CanvasSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasDoc = {
  id: string;
  name: string;
  schemaVersion: 1;
  revision: number;
  createdAt: string;
  updatedAt: string;
  viewport: { x: number; y: number; zoom: number };
  nodes: unknown[];
  edges: unknown[];
};

export function isSafeCanvasId(id: string): boolean {
  return SAFE_ID.test(id);
}

function canvasPath(id: string): string {
  if (!isSafeCanvasId(id)) {
    throw new Error(`unsafe canvas id: ${id}`);
  }
  return path.join(CANVASES_DIR, `${id}.json`);
}

export function emptyCanvas(id: string): CanvasDoc {
  const now = new Date().toISOString();
  return {
    id,
    name: "未命名画布",
    schemaVersion: 1,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

/** Load a canvas; the default canvas is created on first access. */
export async function loadCanvas(id: string): Promise<CanvasDoc | null> {
  try {
    const raw = await readFile(canvasPath(id), "utf8");
    return JSON.parse(raw) as CanvasDoc;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return id === "default" ? emptyCanvas(id) : null;
    }
    throw error;
  }
}

/**
 * Save with optimistic concurrency: `expectedRevision` must match the stored
 * revision or the save is rejected (returns null) instead of silently
 * overwriting newer state.
 */
export async function saveCanvas(
  doc: Omit<CanvasDoc, "revision" | "updatedAt">,
  expectedRevision: number,
): Promise<CanvasDoc | null> {
  const current = await loadCanvas(doc.id);
  const currentRevision = current?.revision ?? -1;
  if (currentRevision !== expectedRevision) {
    return null;
  }
  const next: CanvasDoc = {
    ...doc,
    revision: currentRevision + 1,
    updatedAt: new Date().toISOString(),
  };
  const file = canvasPath(doc.id);
  await mkdir(CANVASES_DIR, { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next)}\n`, "utf8");
  await rename(tmp, file);
  return next;
}

/** Create a brand-new empty canvas and persist it. */
export async function createCanvas(): Promise<CanvasDoc> {
  const created = await saveCanvas(emptyCanvas(crypto.randomUUID()), -1);
  if (!created) {
    throw new Error("failed to create canvas");
  }
  return created;
}

/** All canvas summaries, newest first by creation time. Corrupt files are skipped. */
export async function listCanvases(): Promise<CanvasSummary[]> {
  await mkdir(CANVASES_DIR, { recursive: true });
  const files = (await readdir(CANVASES_DIR)).filter((file) => file.endsWith(".json"));
  const summaries: CanvasSummary[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(CANVASES_DIR, file), "utf8");
      const doc = JSON.parse(raw) as CanvasDoc;
      summaries.push({ id: doc.id, name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt });
    } catch {
      // 跳过损坏的画布文件
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadLastCanvasId(): Promise<string | null> {
  try {
    const raw = await readFile(APP_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as { lastCanvasId?: unknown };
    return typeof parsed.lastCanvasId === "string" ? parsed.lastCanvasId : null;
  } catch {
    return null;
  }
}

export async function saveLastCanvasId(id: string): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${APP_STATE_FILE}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ lastCanvasId: id })}\n`, "utf8");
  await rename(tmp, APP_STATE_FILE);
}

/** Delete a canvas file. Returns false when it did not exist. Assets are untouched. */
export async function deleteCanvas(id: string): Promise<boolean> {
  try {
    await unlink(canvasPath(id));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

import { saveRemoteAsset, type GenerationSnapshot } from "./assets";
import type { GenerationCount } from "./multi-image";

export type BatchSlot =
  | { status: "success"; asset: { name: string; localUrl: string; bytes: number } }
  | { status: "failed"; error: string };

/** Upstream response violates the count contract; never silently swallow or retry. */
export class BatchProtocolError extends Error {}

export async function persistImageBatch(
  images: Array<{ url: string }>,
  requested: GenerationCount,
  snapshot: GenerationSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<BatchSlot[]> {
  if (images.length > requested) {
    throw new BatchProtocolError(`上游返回 ${images.length} 张图片，超过请求的 ${requested} 张`);
  }
  if (images.length === 0) {
    throw new BatchProtocolError("上游未返回任何图片");
  }
  const slots = await Promise.all(
    images.map(async (image): Promise<BatchSlot> => {
      try {
        const asset = await saveRemoteAsset(image.url, "jpeg", fetchImpl, {
          ...snapshot,
          parameters: { ...snapshot.parameters, count: requested },
        });
        return { status: "success", asset };
      } catch (error) {
        return { status: "failed", error: `图片保存失败：${error instanceof Error ? error.message : String(error)}` };
      }
    }),
  );
  for (let index = images.length; index < requested; index += 1) {
    slots.push({ status: "failed", error: `上游未返回第 ${index + 1} 张图片` });
  }
  return slots;
}

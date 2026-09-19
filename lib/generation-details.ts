/** Displayable history; legacy records intentionally omit unknown parameters and times. */
export type GenerationDetails = {
  originalPrompt?: string;
  referenceAssets: string[];
  /** 视频记录带 duration/audio；aspectRatio 为 null 时图片表示自动、视频表示跟随首帧。 */
  parameters?: {
    aspectRatio?: string | null;
    resolution?: string | null;
    quality?: string | null;
    duration?: number;
    audio?: boolean;
  };
  /** 视频首帧 / 尾帧素材。 */
  frames?: { first?: string; last?: string };
};

export function generationRows(info: GenerationDetails): string[][] {
  const p = info.parameters;
  const video = p?.duration !== undefined;
  return [
    video ? ["时长", `${p?.duration} 秒`] : null,
    p?.aspectRatio === null || p?.aspectRatio === "auto"
      ? ["比例", video ? "跟随首帧" : "自动"]
      : p?.aspectRatio ? ["比例", p.aspectRatio] : null,
    p?.resolution ? ["分辨率", p.resolution.toUpperCase()] : null,
    p?.quality === "low" ? ["画质", "标准"] : p?.quality === "medium" ? ["画质", "增强"] : null,
    video ? ["声音", p?.audio ? "开" : "关"] : null,
  ].filter((row): row is string[] => row !== null);
}

export function displayGenerationPrompt(info: GenerationDetails): string {
  return (info.originalPrompt ?? "").replace(/\[\[image:([a-zA-Z0-9_.-]+)\]\]/g, (_, asset: string) => {
    const index = info.referenceAssets.indexOf(asset);
    return index < 0 ? "参考图" : `参考图 ${index + 1}`;
  });
}

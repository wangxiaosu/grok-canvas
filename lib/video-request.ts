import { compileVideoPrompt, type VideoInput } from "./video-references";

/**
 * 视频生成请求组装（模型固定 grok-imagine-video-1.5，UI 不提供模型选择）。
 * 纯函数：输入素材快照与用户参数，输出请求计划；assetName → data URI 的转换
 * 由路由层用 assetToDataUri 完成（image / last_frame / reference_images 字段）。
 *
 * 参数取值与限制均为 2026-09-14 实测结论：
 * - 仅首帧（无尾帧、无参考图）时比例跟随首帧，必须省略 aspect_ratio
 *   （实测方形首帧强指定竖屏仍出方形，强改无效）；
 * - 有参考图或尾帧时上游拒绝 1080p，最高 720p。
 */

export const VIDEO_MODEL = "grok-imagine-video-1.5";

export const VIDEO_DURATIONS = [6, 10, 15] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export const VIDEO_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

export type VideoParameters = {
  duration: VideoDuration;
  /** null 仅在「仅首帧」模式下合法，表示跟随首帧；其余模式必选。 */
  aspectRatio: VideoAspectRatio | null;
  resolution: VideoResolution;
  audio: boolean;
};

export type VideoRequestPlan = {
  model: typeof VIDEO_MODEL;
  mode: "t2v" | "i2v";
  /** 用户原始提示词（含 @ 标记）。 */
  prompt: string;
  /** 实际发送的提示词（@ 已替换为 <IMAGE_n>）。 */
  compiledPrompt: string;
  firstFrame: string | null;
  lastFrame: string | null;
  /** 提交顺序，<IMAGE_n> 编号由此派生。 */
  references: string[];
  parameters: VideoParameters;
};

/** 有参考图或尾帧时最高 720p；供面板禁用 1080p 并提示原因。 */
export function maxVideoResolution(inputs: VideoInput[]): VideoResolution {
  return inputs.some((input) => input.role !== "first") ? "720p" : "1080p";
}

/** 仅首帧模式：比例跟随首帧，不显示比例选择。 */
export function followsFirstFrame(inputs: VideoInput[]): boolean {
  return inputs.length === 1 && inputs[0]?.role === "first";
}

/** 面板展示与提交前对齐：仅首帧清空比例，参考图/尾帧把 1080p 降到 720p。 */
export function clampVideoParameters(inputs: VideoInput[], parameters: VideoParameters): VideoParameters {
  return {
    duration: parameters.duration,
    aspectRatio: followsFirstFrame(inputs) ? null : (parameters.aspectRatio ?? "16:9"),
    resolution: parameters.resolution === "1080p" && maxVideoResolution(inputs) === "720p" ? "720p" : parameters.resolution,
    audio: parameters.audio,
  };
}

export function buildVideoRequest(prompt: string, inputs: VideoInput[], parameters: VideoParameters): VideoRequestPlan {
  if (!prompt.trim()) {
    throw new Error("提示词不能为空");
  }
  if (!(VIDEO_DURATIONS as readonly number[]).includes(parameters.duration)) {
    throw new Error(`时长只支持 ${VIDEO_DURATIONS.join("/")} 秒`);
  }
  if (parameters.aspectRatio !== null && !(VIDEO_ASPECT_RATIOS as readonly string[]).includes(parameters.aspectRatio)) {
    throw new Error(`比例只支持 ${VIDEO_ASPECT_RATIOS.join(" / ")}`);
  }
  if (!(VIDEO_RESOLUTIONS as readonly string[]).includes(parameters.resolution)) {
    throw new Error(`分辨率只支持 ${VIDEO_RESOLUTIONS.join(" / ")}`);
  }
  // 先编译：角色数量、重复素材、失效 @ 引用由 referenceTokenMap / compileVideoPrompt 把关
  const compiledPrompt = compileVideoPrompt(prompt, inputs);

  const followFirst = followsFirstFrame(inputs);
  if (followFirst && parameters.aspectRatio !== null) {
    throw new Error("仅首帧时比例跟随首帧，不应提交 aspect_ratio");
  }
  if (!followFirst && parameters.aspectRatio === null) {
    throw new Error("请选择视频比例");
  }
  if (parameters.resolution === "1080p" && maxVideoResolution(inputs) === "720p") {
    throw new Error("使用参考图或尾帧时最高支持 720p，请降低分辨率");
  }

  return {
    model: VIDEO_MODEL,
    mode: inputs.length === 0 ? "t2v" : "i2v",
    prompt,
    compiledPrompt,
    firstFrame: inputs.find((input) => input.role === "first")?.assetName ?? null,
    lastFrame: inputs.find((input) => input.role === "last")?.assetName ?? null,
    references: inputs.filter((input) => input.role === "reference").map((input) => input.assetName),
    parameters: { ...parameters },
  };
}

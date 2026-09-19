"use client";

import { useState } from "react";
import { Check, Clock, Volume2, VolumeX } from "lucide-react";
import { ControlButton } from "@/components/ui/control-button";

import { PopoverSurface } from "@/components/ui/popover-surface";
import { Popover } from "@base-ui/react/popover";
import { useDesktopAvailable } from "@/components/desktop-workspace";
import type { GenerationCount } from "@/lib/multi-image";
import type { VideoInput } from "@/lib/video-references";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
  followsFirstFrame,
  maxVideoResolution,
  type VideoAspectRatio,
  type VideoDuration,
  type VideoResolution,
} from "@/lib/video-request";

const COUNT_OPTIONS: GenerationCount[] = [1, 2, 4];

// 与 easy-canvas/lib/models.ts 对齐后剔除冷门比例（手机专属的 19.5:9/9:19.5/20:9/9:20 及 5:2、1:2）
const ASPECT_OPTIONS = [
  "auto",
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "2:1",
  "21:9",
];
const RESOLUTION_OPTIONS = ["1k", "2k"] as const;

function RatioGlyph({ value, size = 11 }: { value: string; size?: number }) {
  const parts = value.split(":").map(Number);
  const ratio = parts.length === 2 && parts[0]! > 0 && parts[1]! > 0 ? parts[0]! / parts[1]! : 1;
  const width = ratio >= 1 ? size : Math.max(4, Math.round(size * ratio));
  const height = ratio >= 1 ? Math.max(4, Math.round(size / ratio)) : size;
  return (
    <span
      className={`shrink-0 rounded-[2px] border border-current ${value === "auto" ? "border-dashed" : ""}`}
      style={{ width, height }}
    />
  );
}

export function CountPicker({ value, disabled, onSelect }: {
  value: GenerationCount;
  disabled?: boolean;
  onSelect: (count: GenerationCount) => void;
}) {
  const available = useDesktopAvailable();
  if (!available) return null;
  return (
    <Popover.Root>
      <Popover.Trigger data-ui-control="true" disabled={disabled} title="生成数量" aria-label={`生成数量：${value} 张`} className="ui-parameter-trigger flex h-8 cursor-default items-center rounded-full bg-muted px-3 text-xs tabular-nums outline-none hover:bg-accent data-popup-open:bg-accent disabled:opacity-40">
        {value}×
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} align="end" className="isolate z-50 outline-none">
          <PopoverSurface className="ui-settings-popup w-40 p-1.5">
            <div className="ui-option-group flex gap-1 rounded-lg bg-muted/50 p-1">
              {COUNT_OPTIONS.map((option) => (
                <ControlButton
                  key={option}
                  type="button"
                  aria-pressed={value === option}
                  onClick={() => onSelect(option)}
                  className={`ui-parameter-option h-8 flex-1 rounded-md text-xs tabular-nums transition-colors ${
                    value === option ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option}×
                </ControlButton>
              ))}
            </div>
          </PopoverSurface>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SettingsPicker({
  aspectRatio,
  resolution,
  onSelect,
}: {
  aspectRatio: string;
  resolution: "1k" | "2k";
  onSelect: (patch: { aspectRatio?: string; resolution?: "1k" | "2k" }) => void;
}) {
  const available = useDesktopAvailable();
  if (!available) return null;
  return (
    <Popover.Root>
      <Popover.Trigger data-ui-control="true" className="ui-parameter-trigger flex h-8 cursor-default items-center gap-2 rounded-full bg-muted px-3 text-xs tabular-nums outline-none hover:bg-accent data-popup-open:bg-accent">
        <RatioGlyph value={aspectRatio} />
        <span className="w-10 text-center">{aspectRatio === "auto" ? "自动" : aspectRatio}</span>
        <span className="text-muted-foreground">·</span>
        <span className="w-6 text-center">{resolution.toUpperCase()}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} align="start" className="isolate z-50 outline-none">
          <PopoverSurface className="ui-settings-popup w-72 p-3">
            <SettingsOptions aspectRatio={aspectRatio} resolution={resolution} onSelect={onSelect} />
          </PopoverSurface>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SettingsOptions({ aspectRatio, resolution, onSelect }: {
  aspectRatio: string;
  resolution: "1k" | "2k";
  onSelect: (patch: { aspectRatio?: string; resolution?: "1k" | "2k" }) => void;
}) {
  return <>
            <p className="px-1 text-xs text-muted-foreground">分辨率</p>
            <div className="ui-option-group mt-1.5 flex gap-1 rounded-lg bg-muted/50 p-1">
              {RESOLUTION_OPTIONS.map((option) => (
                <ControlButton
                  key={option}
                  type="button"
                  aria-pressed={resolution === option}
                  onClick={() => onSelect({ resolution: option })}
                  className={`ui-parameter-option h-10 flex-1 rounded-md text-sm transition-colors ${
                    resolution === option ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.toUpperCase()}
                </ControlButton>
              ))}
            </div>
            <p className="mt-3 px-1 text-xs text-muted-foreground">比例</p>
            <div className="ui-option-group mt-1.5 grid grid-cols-4 gap-1 rounded-lg bg-muted/50 p-1">
              {ASPECT_OPTIONS.map((option) => (
                <ControlButton
                  key={option}
                  type="button"
                  aria-pressed={aspectRatio === option}
                  onClick={() => onSelect({ aspectRatio: option })}
                  className={`ui-parameter-option flex flex-col items-center gap-1.5 rounded-md py-2.5 transition-colors ${
                    aspectRatio === option ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <RatioGlyph value={option} size={18} />
                  <span className="ui-ratio-label text-[10px] leading-none tabular-nums">
                    {option === "auto" ? "自动" : option}
                  </span>
                </ControlButton>
              ))}
            </div>
  </>;
}

export function QualitySwitch({ value, onToggle }: { value: "low" | "medium"; onToggle: (next: "low" | "medium") => void }) {
  const enhanced = value === "medium";
  return (
    <ControlButton
      type="button"
      role="switch"
      aria-label="画质增强"
      aria-checked={enhanced}
      title={enhanced ? "画质增强：开" : "画质增强：关"}
      onClick={() => onToggle(enhanced ? "low" : "medium")}
      className="ui-quality-switch flex h-8 items-center gap-2 rounded-full bg-muted px-3 text-xs hover:bg-accent"
    >
      <span
        className={`text-xs font-semibold transition-colors ${enhanced ? "text-foreground" : "text-muted-foreground"}`}
      >
        HD
      </span>
      <span
        className={`ui-switch-track relative h-[18px] w-8 rounded-full transition-colors ${
          enhanced ? "bg-[#34c759]" : "bg-foreground/20"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all ${
            enhanced ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </span>
    </ControlButton>
  );
}

export type VideoSettingsPatch = {
  duration?: VideoDuration;
  aspectRatio?: VideoAspectRatio | null;
  resolution?: VideoResolution;
};

export function DurationPicker({ value, onSelect }: { value: VideoDuration; onSelect: (next: VideoDuration) => void }) {
  const available = useDesktopAvailable();
  const [open, setOpen] = useState(false);
  if (!available) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        data-ui-control="true"
        title={`时长 ${value} 秒`}
        aria-label={`时长 ${value} 秒`}
        className="ui-parameter-trigger flex h-8 cursor-default items-center gap-1.5 rounded-full bg-muted px-3 text-xs tabular-nums outline-none hover:bg-accent data-popup-open:bg-accent"
      >
        <Clock className="h-3.5 w-3.5" />
        {value}s
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} align="start" className="isolate z-50 outline-none">
          <PopoverSurface className="ui-settings-popup w-28 p-1">
            {VIDEO_DURATIONS.map((option) => (
              <ControlButton
                key={option}
                type="button"
                aria-pressed={value === option}
                onClick={() => { onSelect(option); setOpen(false); }}
                className={`ui-parameter-option flex h-8 w-full items-center justify-between rounded-md px-2 text-sm tabular-nums ${
                  value === option ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option}s
                {value === option ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
              </ControlButton>
            ))}
          </PopoverSurface>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function VideoSettingsPicker({
  aspectRatio,
  resolution,
  inputs = [],
  onSelect,
}: {
  aspectRatio: VideoAspectRatio | null;
  resolution: VideoResolution;
  inputs?: VideoInput[];
  onSelect: (patch: VideoSettingsPatch) => void;
}) {
  const available = useDesktopAvailable();
  if (!available) return null;
  const followFirst = followsFirstFrame(inputs);
  const ratioLabel = followFirst ? "跟随" : (aspectRatio ?? "16:9");
  return (
    <Popover.Root>
      <Popover.Trigger
        data-ui-control="true"
        aria-label={`比例 ${followFirst ? "跟随首帧" : ratioLabel}，分辨率 ${resolution}`}
        className="ui-parameter-trigger flex h-8 cursor-default items-center gap-2 rounded-full bg-muted px-3 text-xs tabular-nums outline-none hover:bg-accent data-popup-open:bg-accent"
      >
        {followFirst ? null : <RatioGlyph value={aspectRatio ?? "16:9"} />}
        <span className="w-10 text-center">{ratioLabel}</span>
        <span className="text-muted-foreground">·</span>
        <span className="w-10 text-center">{resolution}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} align="start" className="isolate z-50 outline-none">
          <PopoverSurface className="ui-settings-popup w-72 p-3">
            <VideoSettingsOptions aspectRatio={aspectRatio} resolution={resolution} inputs={inputs} onSelect={onSelect} />
          </PopoverSurface>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function VideoSettingsOptions({
  aspectRatio,
  resolution,
  inputs = [],
  onSelect,
}: {
  aspectRatio: VideoAspectRatio | null;
  resolution: VideoResolution;
  inputs?: VideoInput[];
  onSelect: (patch: VideoSettingsPatch) => void;
}) {
  const followFirst = followsFirstFrame(inputs);
  const maxResolution = maxVideoResolution(inputs);
  const capped = maxResolution === "720p";
  const shownResolution = resolution === "1080p" && capped ? "720p" : resolution;
  return <>
            <p className="px-1 text-xs text-muted-foreground">分辨率</p>
            <div className="ui-option-group mt-1.5 flex gap-1 rounded-lg bg-muted/50 p-1">
              {VIDEO_RESOLUTIONS.map((option) => {
                const blocked = option === "1080p" && capped;
                return (
                <ControlButton
                  key={option}
                  type="button"
                  aria-pressed={shownResolution === option}
                  disabled={blocked}
                  title={blocked ? "使用参考图或尾帧时最高支持 720p" : undefined}
                  onClick={() => { if (!blocked) onSelect({ resolution: option }); }}
                  className={`ui-parameter-option h-10 flex-1 rounded-md text-sm tabular-nums transition-colors disabled:opacity-40 ${
                    shownResolution === option ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option}
                </ControlButton>
                );
              })}
            </div>
            <p className="mt-3 px-1 text-xs text-muted-foreground">比例</p>
            {followFirst ? (
              <p className="mt-1.5 px-1 text-sm">跟随首帧</p>
            ) : (
            <div className="ui-option-group mt-1.5 grid grid-cols-4 gap-1 rounded-lg bg-muted/50 p-1">
              {VIDEO_ASPECT_RATIOS.map((option) => (
                <ControlButton
                  key={option}
                  type="button"
                  aria-pressed={aspectRatio === option}
                  onClick={() => onSelect({ aspectRatio: option })}
                  className={`ui-parameter-option flex flex-col items-center gap-1.5 rounded-md py-2.5 transition-colors ${
                    aspectRatio === option ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <RatioGlyph value={option} size={18} />
                  <span className="ui-ratio-label text-[10px] leading-none tabular-nums">{option}</span>
                </ControlButton>
              ))}
            </div>
            )}
  </>;
}

export function AudioSwitch({ value, onToggle }: { value: boolean; onToggle: (next: boolean) => void }) {
  const label = value ? "音频：开启" : "音频：关闭";
  return (
    <ControlButton
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={value}
      title={label}
      onClick={() => onToggle(!value)}
      className="ui-quality-switch flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-accent"
    >
      {value
        ? <Volume2 className="h-4 w-4" />
        : <VolumeX className="h-4 w-4 text-muted-foreground" />}
    </ControlButton>
  );
}

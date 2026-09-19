"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useStore, Position, type Node, type NodeProps } from "@xyflow/react";
import { NodeSurface } from "@/components/ui/node-surface";
import { StatusFeedback } from "@/components/ui/status-feedback";
import { useAuth } from "@/components/auth-status";
import { generationStatusFeedback, loginRequired } from "@/lib/generation-auth-feedback";
import type { VideoAspectRatio, VideoDuration, VideoResolution } from "@/lib/video-request";
import type { VideoInput } from "@/lib/video-references";
import type { VideoErrorKind, VideoGenerationRequest } from "@/lib/video-runtime";
import { Video } from "lucide-react";
import { NodeActions } from "./node-actions";
import { NodeTitle } from "./node-title";
import { PlusHandle } from "./image-node";
import { useCanvasActions } from "./flow-canvas";
import { ImagineLoading } from "./imagine-loading";

export type VideoNodeData = {
  name: string;
  assetName: string | null;
  prompt: string;
  draftPrompt?: string;
  duration: VideoDuration;
  aspectRatio: VideoAspectRatio | null;
  resolution: VideoResolution;
  audio: boolean;
  status: "idle" | "running" | "failed";
  taskId?: string | null;
  waitedSeconds?: number;
  errorMessage?: string | null;
  errorKind?: VideoErrorKind | null;
  generationRequest?: VideoGenerationRequest;
  uploadInputs?: VideoInput[];
  attachmentNames?: Record<string, string>;
  sourceNodeId?: string | null;
  [key: string]: unknown;
};

export type VideoFlowNode = Node<VideoNodeData, "video">;

const BOX_SIZE = 280;

function previewRatio(aspectRatio: VideoAspectRatio | null): number {
  if (!aspectRatio) return 16 / 9;
  const parts = aspectRatio.split(":").map(Number);
  const width = parts[0];
  const height = parts[1];
  return width && height && width > 0 && height > 0 ? width / height : 16 / 9;
}

export function defaultVideoNodeData(name: string): VideoNodeData {
  return {
    name,
    assetName: null,
    prompt: "",
    duration: 10,
    aspectRatio: "16:9",
    resolution: "720p",
    audio: true,
    status: "idle",
    uploadInputs: [],
    sourceNodeId: null,
  };
}

export function VideoNode({ id, data, selected, draggable }: NodeProps<VideoFlowNode>) {
  const { generateVideo } = useCanvasActions();
  const { loggedIn, login } = useAuth();
  const zoom = useStore((state) => state.transform[2]);
  const running = data.status === "running";
  const failedFeedback = generationStatusFeedback(loggedIn);
  const [ratio, setRatio] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(data.waitedSeconds ?? 0);

  useEffect(() => {
    setRatio(null);
  }, [data.assetName]);

  useEffect(() => {
    setElapsed(data.waitedSeconds ?? 0);
    if (!running) return;
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, data.waitedSeconds]);

  let boxStyle: CSSProperties;
  if (!data.assetName) {
    const selected = previewRatio(data.aspectRatio);
    boxStyle = selected < 1
      ? { height: BOX_SIZE, width: Math.max(120, Math.round(BOX_SIZE * selected)) }
      : { width: BOX_SIZE, aspectRatio: String(selected) };
  } else if (ratio !== null && ratio < 1) {
    boxStyle = { height: BOX_SIZE, width: Math.max(120, Math.round(BOX_SIZE * ratio)) };
  } else {
    boxStyle = { width: BOX_SIZE, aspectRatio: ratio ? String(ratio) : "16 / 9" };
  }

  return (
    <div className="group relative">
      <NodeActions
        id={id}
        name={data.name}
        assetName={data.assetName}
        selected={selected}
        pinned={draggable === false}
        kind="video"
      />
      <PlusHandle type="target" position={Position.Left} className={selected ? "!opacity-100" : ""} />
      <div className="nodrag absolute -top-7 left-0 flex items-center gap-1.5">
        <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <NodeTitle nodeId={id} name={data.name} />
      </div>
      <NodeSurface selected={selected} zoom={zoom} className="relative flex items-center justify-center" style={boxStyle}>
        {data.assetName ? (
          <video
            src={`/api/assets/${encodeURIComponent(data.assetName)}`}
            className="nodrag nopan h-full w-full object-contain"
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                setRatio(video.videoWidth / video.videoHeight);
              }
            }}
          />
        ) : data.status === "failed" ? (
          <div className="nodrag nopan p-4">
            <StatusFeedback
              tone={loginRequired(loggedIn) ? "muted" : "error"}
              message={loginRequired(loggedIn) ? failedFeedback.message : (data.errorMessage ?? failedFeedback.message)}
              actionLabel={failedFeedback.actionLabel}
              retry={loginRequired(loggedIn) ? () => void login() : () => generateVideo(id, { retry: true })}
            />
          </div>
        ) : running ? (
          <ImagineLoading />
        ) : (
          <Video className="h-8 w-8 text-muted-foreground/40" />
        )}
        {running ? (
          <div role="status" className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-popover px-3 py-1 text-xs text-foreground">
            {`生成中 · 已等待 ${elapsed} 秒`}
          </div>
        ) : null}
      </NodeSurface>
    </div>
  );
}

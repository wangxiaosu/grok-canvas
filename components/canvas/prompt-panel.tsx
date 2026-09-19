"use client";

import { ControlButton } from "@/components/ui/control-button";

import { memo, useState } from "react";
import { useNodesData, useReactFlow, useStore, useViewport } from "@xyflow/react";
import { Tooltip } from "@base-ui/react/tooltip";
import { SettingsPicker, QualitySwitch, CountPicker, DurationPicker, VideoSettingsPicker, AudioSwitch, type VideoSettingsPatch } from "./generation-settings";
import { ArrowUp, Loader2, Plus, X } from "lucide-react";
import { useAuth } from "@/components/auth-status";
import { StatusFeedback } from "@/components/ui/status-feedback";
import { generationStatusFeedback, loginRequired } from "@/lib/generation-auth-feedback";
import { PromptEditor } from "./prompt-editor";
import type { PromptReference } from "@/lib/prompt-references";
import { parseGenerationCount } from "@/lib/multi-image";
import { useCanvasActions, type GenerateOverrides } from "./flow-canvas";
import { ATTACHMENT_MAX, type ImageNodeData } from "./image-node";
import { type VideoNodeData } from "./video-node";
import { clampVideoParameters } from "@/lib/video-request";
import {
  parseVideoEdgeRole,
  referenceTokenMap,
  videoInputsFromSlots,
  type VideoSlot,
} from "@/lib/video-references";
import { VideoInputSlots } from "./video-slots";
import { placeNodePanel } from "@/lib/floating-placement";
import { useDesktopAvailable } from "@/components/desktop-workspace";

const PANEL_WIDTH = 560;


// memo 隔离拖动视口引发的每帧重渲染：定位外壳跟着视口更新，面板内容只在节点数据变化时更新
const PanelBody = memo(function PanelBody({ nodeId, data }: { nodeId: string; data: ImageNodeData }) {
  const available = useDesktopAvailable();
  const { generate, removeEdge, requestAttachmentUpload, isNodeGenerationLocked } = useCanvasActions();
  const { loggedIn, login } = useAuth();
  const { updateNodeData } = useReactFlow();
  const needsLogin = loginRequired(loggedIn);
  const loginFeedback = generationStatusFeedback(loggedIn);

  const hasImage = Boolean(data.assetName);
  const running = data.status === "running";
  // 锁定 = 自身在跑，或它作为来源已有进行中的任务（此时新结果节点正在生成）
  const locked = isNodeGenerationLocked(nodeId);
  const displayPrompt = data.draftPrompt ?? data.prompt;
  const canSubmit = Boolean(displayPrompt.trim()) && !needsLogin && !locked;
  const count = parseGenerationCount(data.generationCount);
  // 有图节点的参数只活在面板本地，提交时经 overrides 传给 generate
  const [localAspectRatio, setLocalAspectRatio] = useState(data.aspectRatio);
  const [localResolution, setLocalResolution] = useState(data.resolution);
  const [localQuality, setLocalQuality] = useState(data.quality);

  const selectSettings = (patch: { aspectRatio?: string; resolution?: "1k" | "2k" }) => {
    if (hasImage) {
      if (patch.aspectRatio !== undefined) setLocalAspectRatio(patch.aspectRatio);
      if (patch.resolution !== undefined) setLocalResolution(patch.resolution);
    } else {
      updateNodeData(nodeId, patch);
    }
  };
  const toggleQuality = (next: "low" | "medium") => {
    if (hasImage) setLocalQuality(next);
    else updateNodeData(nodeId, { quality: next });
  };

  const submit = () => {
    if (!displayPrompt.trim() || locked) return;
    const overrides: GenerateOverrides = hasImage
      ? { prompt: displayPrompt, aspectRatio: localAspectRatio, resolution: localResolution, quality: localQuality, count }
      : { prompt: displayPrompt, count };
    generate(nodeId, overrides);
  };

  const showRestore = hasImage && data.draftPrompt != null && data.draftPrompt.trim() !== data.prompt.trim();

  const incomingEdges = useStore((state) => state.edges).filter((edge) => edge.target === nodeId);
  const sourceNodes = useNodesData(incomingEdges.map((edge) => edge.source));
  const edgeAttachments = incomingEdges.map((edge, index) => ({
    edgeId: edge.id,
    assetName: sourceNodes[index]?.data?.assetName as string | undefined,
    name: sourceNodes[index]?.data?.name as string | undefined,
  }));
  const uploadAttachments = data.uploadAttachments ?? [];
  const attachmentCount = edgeAttachments.length + uploadAttachments.length;
  const references: PromptReference[] = Array.from(new Map([
    ...edgeAttachments.filter((item) => item.assetName).map((item, index) => ({ assetName: item.assetName!, name: item.name || `参考图 ${index + 1}` })),
    ...uploadAttachments.map((assetName, index) => ({ assetName, name: data.attachmentNames?.[assetName] || `上传图片 ${index + 1}` })),
  ].map((item) => [item.assetName, item])).values());

  const removeUploadAttachment = (assetName: string) => {
    updateNodeData(nodeId, { uploadAttachments: uploadAttachments.filter((item) => item !== assetName) });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
        {edgeAttachments.map((item) => (
          <span key={item.edgeId} className="group relative">
            {item.assetName ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/assets/${item.assetName}`}
                alt="参考附件"
                className="h-12 w-12 rounded-md border object-cover"
                draggable={false}
              />
            ) : (
              <span
                className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground"
                title="来源节点还没有图片"
              >
                待生成
              </span>
            )}
            <ControlButton
              className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow hover:text-foreground"
              onClick={() => removeEdge(item.edgeId)}
              aria-label="移除参考附件"
              title="移除（删除连线）"
            >
              <X className="h-3 w-3" />
            </ControlButton>
          </span>
        ))}
        {uploadAttachments.map((assetName) => (
          <span key={assetName} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/assets/${assetName}`}
              alt="上传附件"
              className="h-12 w-12 rounded-md border object-cover"
              draggable={false}
            />
            <ControlButton
              className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow hover:text-foreground"
              onClick={() => removeUploadAttachment(assetName)}
              aria-label="移除上传附件"
              title="移除附件"
            >
              <X className="h-3 w-3" />
            </ControlButton>
          </span>
        ))}
        {attachmentCount < ATTACHMENT_MAX ? (
          <ControlButton
            className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:text-foreground"
            onClick={() => requestAttachmentUpload(nodeId)}
            title={`上传图片作为附件（${attachmentCount}/${ATTACHMENT_MAX}）`}
          >
            <Plus className="h-4 w-4" />
          </ControlButton>
        ) : null}
      </div>

      <PromptEditor
        key={nodeId}
        nodeId={nodeId}
        value={displayPrompt}
        references={references}
        readOnly={running}
        badge={(item) => `#${references.findIndex((reference) => reference.assetName === item.assetName) + 1}`}
        onCommit={(value) => updateNodeData(nodeId, hasImage ? { draftPrompt: value } : { prompt: value })}
        onSubmit={submit}
      />

      {needsLogin ? (
        <div className="px-1 pb-1">
          <StatusFeedback
            compact
            message={loginFeedback.message}
            actionLabel={loginFeedback.actionLabel}
            retry={() => void login()}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <SettingsPicker
          aspectRatio={hasImage ? localAspectRatio : data.aspectRatio}
          resolution={hasImage ? localResolution : data.resolution}
          onSelect={selectSettings}
        />
        <QualitySwitch value={hasImage ? localQuality : data.quality} onToggle={toggleQuality} />
        {showRestore ? (
          <ControlButton
            type="button"
            title="还原为生成这张图片时的提示词"
            onClick={() => updateNodeData(nodeId, { draftPrompt: undefined })}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            还原
          </ControlButton>
        ) : null}
        <div className="flex-1" />
        <CountPicker value={count} disabled={locked} onSelect={(next) => updateNodeData(nodeId, { generationCount: next })} />
        <Tooltip.Provider delay={150}>
          <Tooltip.Root>
            <Tooltip.Trigger
              type="button"
              aria-disabled={!canSubmit}
              onClick={() => { if (canSubmit) submit(); }}
              aria-label={needsLogin ? "生成图片前请先登录" : running ? "生成中" : locked ? "来源节点正在生成" : hasImage ? "生成新图片" : "生成图片"}
              className="ui-generate-button flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Tooltip.Trigger>
            {available && <Tooltip.Portal>
              <Tooltip.Positioner side="top" sideOffset={8} className="z-50">
                <Tooltip.Popup className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md">
                  {needsLogin ? "请先登录" : running ? "生成中…" : locked ? "来源节点正在生成…" : hasImage ? "生成新图片" : "生成（⌘/Ctrl + Enter）"}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>}
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    </>
  );
});

const VideoPanelBody = memo(function VideoPanelBody({ nodeId, data }: { nodeId: string; data: VideoNodeData }) {
  const available = useDesktopAvailable();
  const { generateVideo, isNodeGenerationLocked, removeEdge, requestAttachmentUpload } = useCanvasActions();
  const { loggedIn, login } = useAuth();
  const { updateNodeData, setEdges } = useReactFlow();
  const needsLogin = loginRequired(loggedIn);
  const loginFeedback = generationStatusFeedback(loggedIn);
  const hasVideo = Boolean(data.assetName);
  const running = data.status === "running";
  const locked = isNodeGenerationLocked(nodeId);
  const displayPrompt = data.draftPrompt ?? data.prompt;
  const canSubmit = Boolean(displayPrompt.trim()) && !needsLogin && !locked;
  const [localDuration, setLocalDuration] = useState(data.duration);
  const [localAspectRatio, setLocalAspectRatio] = useState(data.aspectRatio);
  const [localResolution, setLocalResolution] = useState(data.resolution);
  const [localAudio, setLocalAudio] = useState(data.audio);

  const incomingEdges = useStore((state) => state.edges).filter((edge) => edge.target === nodeId);
  const sourceNodes = useNodesData(incomingEdges.map((edge) => edge.source));
  const uploadInputs = data.uploadInputs ?? [];
  const slots: VideoSlot[] = [
    ...incomingEdges.map((edge, index) => ({
      key: `edge:${edge.id}`,
      role: parseVideoEdgeRole((edge.data as { role?: unknown } | undefined)?.role),
      assetName: (sourceNodes[index]?.data?.assetName as string | undefined) ?? null,
      name: (sourceNodes[index]?.data?.name as string | undefined) || `连线 ${index + 1}`,
      edgeId: edge.id,
    })),
    ...uploadInputs.map((item, index) => ({
      key: `upload:${item.assetName}`,
      role: item.role,
      assetName: item.assetName,
      name: data.attachmentNames?.[item.assetName] || `上传图片 ${index + 1}`,
    })),
  ];
  const readyInputs = videoInputsFromSlots(slots);
  const references = readyInputs
    .filter((item) => item.role === "reference")
    .map((item, index) => ({
      assetName: item.assetName,
      name: slots.find((slot) => slot.assetName === item.assetName)?.name || `参考图 ${index + 1}`,
    }));
  // @ 下拉项末尾显示真实接口编号（无首帧 #0 起、有首帧 #1 起），与 <IMAGE_n> 一致
  const tokenByAsset = (() => {
    try {
      return referenceTokenMap(readyInputs);
    } catch {
      return new Map<string, string>();
    }
  })();
  const referenceBadge = (item: PromptReference): string | null => {
    const token = tokenByAsset.get(item.assetName);
    const number = token?.match(/\d+/)?.[0];
    return number ? `#${number}` : null;
  };
  const parameters = clampVideoParameters(readyInputs, {
    duration: hasVideo ? localDuration : data.duration,
    aspectRatio: hasVideo ? localAspectRatio : data.aspectRatio,
    resolution: hasVideo ? localResolution : data.resolution,
    audio: hasVideo ? localAudio : data.audio,
  });

  const persistSlots = (next: VideoSlot[]) => {
    updateNodeData(nodeId, {
      uploadInputs: next.flatMap((slot) => (slot.edgeId || !slot.assetName ? [] : [{ assetName: slot.assetName, role: slot.role }])),
    });
    setEdges((current) => current.map((edge) => {
      const slot = next.find((item) => item.edgeId === edge.id);
      if (!slot) return edge;
      return { ...edge, data: { ...(edge.data as object | undefined), role: slot.role } };
    }));
  };
  const removeSlot = (slot: VideoSlot) => {
    if (slot.edgeId) removeEdge(slot.edgeId);
    else if (slot.assetName) {
      updateNodeData(nodeId, { uploadInputs: uploadInputs.filter((item) => item.assetName !== slot.assetName) });
    }
  };

  const selectSettings = (patch: VideoSettingsPatch) => {
    if (hasVideo) {
      if (patch.duration !== undefined) setLocalDuration(patch.duration);
      if (patch.aspectRatio !== undefined) setLocalAspectRatio(patch.aspectRatio);
      if (patch.resolution !== undefined) setLocalResolution(patch.resolution);
    } else {
      updateNodeData(nodeId, patch);
    }
  };
  const toggleAudio = (next: boolean) => {
    if (hasVideo) setLocalAudio(next);
    else updateNodeData(nodeId, { audio: next });
  };

  const submit = () => {
    if (!displayPrompt.trim() || locked) return;
    generateVideo(nodeId, { prompt: displayPrompt, ...parameters });
  };

  const showRestore = hasVideo && data.draftPrompt != null && data.draftPrompt.trim() !== data.prompt.trim();

  return (
    <>
      <VideoInputSlots
        slots={slots}
        onChange={persistSlots}
        onRemove={removeSlot}
        onUpload={(role) => requestAttachmentUpload(nodeId, role ? { role } : undefined)}
      />
      <PromptEditor
        key={nodeId}
        nodeId={nodeId}
        value={displayPrompt}
        references={references}
        readOnly={running}
        placeholder={references.length ? "描述你想生成的视频，输入 @ 引用参考图" : "描述你想生成的视频"}
        badge={referenceBadge}
        onCommit={(value) => updateNodeData(nodeId, hasVideo ? { draftPrompt: value } : { prompt: value })}
        onSubmit={submit}
      />

      {needsLogin ? (
        <div className="px-1 pb-1">
          <StatusFeedback
            compact
            message={loginFeedback.message}
            actionLabel={loginFeedback.actionLabel}
            retry={() => void login()}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <DurationPicker value={parameters.duration} onSelect={(duration) => selectSettings({ duration })} />
        <VideoSettingsPicker
          aspectRatio={parameters.aspectRatio}
          resolution={parameters.resolution}
          inputs={readyInputs}
          onSelect={selectSettings}
        />
        <AudioSwitch value={parameters.audio} onToggle={toggleAudio} />
        {showRestore ? (
          <ControlButton
            type="button"
            title="还原为生成这段视频时的提示词"
            onClick={() => updateNodeData(nodeId, { draftPrompt: undefined })}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            还原
          </ControlButton>
        ) : null}
        <div className="flex-1" />
        <Tooltip.Provider delay={150}>
          <Tooltip.Root>
            <Tooltip.Trigger
              type="button"
              aria-disabled={!canSubmit}
              onClick={() => { if (canSubmit) submit(); }}
              aria-label={needsLogin ? "生成视频前请先登录" : running ? "生成中" : locked ? "来源节点正在生成" : hasVideo ? "生成新视频" : "生成视频"}
              className="ui-generate-button flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Tooltip.Trigger>
            {available && <Tooltip.Portal>
              <Tooltip.Positioner side="top" sideOffset={8} className="z-50">
                <Tooltip.Popup className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md">
                  {needsLogin ? "请先登录" : running ? "生成中…" : locked ? "来源节点正在生成…" : hasVideo ? "生成新视频" : "生成（⌘/Ctrl + Enter）"}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>}
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    </>
  );
});

/**
 * Fixed-screen-size prompt panel anchored below the selected image node.
 * Rendered as a React Flow child (not in the zoomed viewport), positioned
 * manually from the node position + viewport, so panning moves it with the
 * node while zooming never changes its size.
 */
export function PromptPanel() {
  const { panelNodeId } = useCanvasActions();
  const viewport = useViewport();
  const panelNode = useStore((state) => (panelNodeId ? state.nodeLookup.get(panelNodeId) : undefined));

  if (!panelNodeId || !panelNode) {
    return null;
  }
  // 生成中也允许打开面板：按钮转 loading，编辑器只读
  if (panelNode.type !== "image" && panelNode.type !== "video") {
    return null;
  }

  const { x, y } = panelNode.internals.positionAbsolute;
  const nodeWidth = panelNode.measured?.width ?? 280;
  const nodeHeight = panelNode.measured?.height ?? 280;
  const placement = placeNodePanel({ x: x * viewport.zoom + viewport.x, bottom: (y + nodeHeight) * viewport.zoom + viewport.y, width: nodeWidth * viewport.zoom }, PANEL_WIDTH);

  return (
    <div
      className="ui-prompt-panel nodrag nowheel nopan absolute z-20 rounded-2xl bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/10"
      style={placement}
    >
      {panelNode.type === "video"
        ? <VideoPanelBody key={panelNodeId} nodeId={panelNodeId} data={panelNode.data as VideoNodeData} />
        : <PanelBody key={panelNodeId} nodeId={panelNodeId} data={panelNode.data as ImageNodeData} />}
    </div>
  );
}

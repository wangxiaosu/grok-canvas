"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { compilePrompt, referencePattern } from "@/lib/prompt-references";
import {
  compileVideoPrompt,
  defaultNewVideoRole,
  parseVideoEdgeRole,
  VIDEO_REFERENCE_MAX,
  type VideoInput,
  type VideoInputRole,
} from "@/lib/video-references";
import { clampVideoParameters, type VideoAspectRatio, type VideoDuration, type VideoResolution } from "@/lib/video-request";
import {
  applyGenerationOutcome,
  normalizeNodeResults,
  parseGenerationCount,
  UNCONFIRMED_RESULT_MESSAGE,
  type BatchSlotLike,
  type CandidateResult,
  type GenerationCount,
  type GenerationOutcome,
} from "@/lib/multi-image";
import type { CanvasDoc } from "@/lib/canvas-store";
import { canvasSaveErrorMessage, type CanvasSaveStatus } from "@/lib/save-status";
import { AssetNode } from "./asset-node";
import {
  clearPending,
  dispatchOutcome,
  hasPendingFrom,
  isPending,
  markPending,
  pendingFor,
  registerCanvas,
  stashOrphan,
  takeOrphan,
  unregisterCanvas,
} from "./generation-registry";
import { CanvasControls } from "./canvas-controls";
import { CanvasEmptyState } from "./canvas-empty-state";
import { CandidatePanel } from "./candidate-panel";
import { PromptPanel } from "./prompt-panel";
import { FloatingMenu, MenuItem as MenuButton } from "@/components/ui/floating-menu";
import { ControlButton } from "@/components/ui/control-button";
import { ScissorEdge } from "./scissor-edge";
import { useAuth } from "@/components/auth-status";
import { useDesktopAvailable } from "@/components/desktop-workspace";
import { LOGIN_REQUIRED_MESSAGE, loginRequired } from "@/lib/generation-auth-feedback";
import {
  dispatchVideoView,
  isVideoWatchStopStatus,
  isWatchingVideo,
  recoverVideoJobs,
  registerVideoCanvas,
  rememberSubmittedVideoTask,
  stashVideoOrphan,
  submitVideoJob,
  submittedVideoTask,
  takeVideoOrphan,
  unregisterVideoCanvas,
  videoNodePatchFromView,
  watchVideoTask,
  type VideoGenerationRequest,
  type VideoTaskView,
} from "@/lib/video-runtime";
import {
  ATTACHMENT_MAX,
  defaultImageNodeData,
  ImageNode,
  type ImageFlowNode,
  type ImageNodeData,
} from "./image-node";
import { defaultVideoNodeData, VideoNode, type VideoFlowNode, type VideoNodeData } from "./video-node";

const nodeTypes = { image: ImageNode, asset: AssetNode, video: VideoNode };
const edgeTypes = { scissor: ScissorEdge };

function videoEdgeRole(edge: Edge): VideoInputRole {
  return parseVideoEdgeRole((edge.data as { role?: unknown } | undefined)?.role);
}

function videoOccupancy(nodeId: string, nodes: Node[], edges: Edge[]): Array<{ role: VideoInputRole }> {
  const node = nodes.find((item) => item.id === nodeId);
  const uploads = ((node?.data as VideoNodeData | undefined)?.uploadInputs) ?? [];
  return [
    ...edges.filter((edge) => edge.target === nodeId).map((edge) => ({ role: videoEdgeRole(edge) })),
    ...uploads,
  ];
}

function connectRejectMessage(targetType: string | undefined): string {
  if (targetType === "video") return "无法连线：来源需为图片，且视频素材槽未满";
  if (targetType === "image") return `无法连线：目标需为图片节点，附件最多 ${ATTACHMENT_MAX} 个`;
  return "无法连线：目标需为图片或视频节点";
}

type GenerateOverrides = {
  prompt?: string;
  aspectRatio?: string;
  resolution?: "1k" | "2k";
  quality?: "low" | "medium";
  count?: GenerationCount;
  retry?: boolean;
  retrySlotId?: string;
};

type GenerateVideoOverrides = {
  prompt?: string;
  duration?: VideoDuration;
  aspectRatio?: VideoAspectRatio | null;
  resolution?: VideoResolution;
  audio?: boolean;
  retry?: boolean;
};

type CanvasActions = {
  generate: (nodeId: string, overrides?: GenerateOverrides) => void;
  generateVideo: (nodeId: string, overrides?: GenerateVideoOverrides) => void;
  setPrimaryResult: (nodeId: string, slotId: string) => void;
  copyCandidateAsNode: (sourceNodeId: string, slotId: string) => void;
  openCandidates: (nodeId: string) => void;
  closeCandidates: (restoreFocus?: boolean) => void;
  expandedNodeId: string | null;
  isNodeGenerationLocked: (nodeId: string) => boolean;
  panelNodeId: string | null;
  removeEdge: (edgeId: string) => void;
  requestAttachmentUpload: (nodeId: string, options?: { role?: VideoInputRole }) => void;
};

const CanvasActionsContext = createContext<CanvasActions>({
  generate: () => {},
  generateVideo: () => {},
  setPrimaryResult: () => {},
  copyCandidateAsNode: () => {},
  openCandidates: () => {},
  closeCandidates: () => {},
  expandedNodeId: null,
  isNodeGenerationLocked: () => false,
  panelNodeId: null,
  removeEdge: () => {},
  requestAttachmentUpload: () => {},
});

export type { GenerateOverrides };

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}

type MenuState =
  | { kind: "pane"; x: number; y: number; flow: { x: number; y: number } }
  | { kind: "node"; x: number; y: number; nodeId: string }
  | { kind: "selection"; x: number; y: number; nodeIds: string[] }
  | { kind: "edge"; x: number; y: number; edgeId: string }
  | { kind: "connect-create"; x: number; y: number; flow: { x: number; y: number }; sourceId: string }
  | { kind: "add" }
  | null;

type GenerateResponse = {
  slots?: BatchSlotLike[];
  error?: { kind: string; message: string };
};

type UndoEntry =
  | { type: "delete"; nodes: Node[]; edges: Edge[] }
  | { type: "add"; nodes: Node[]; edges: Edge[] }
  | { type: "move"; items: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number } }> }
  | {
      type: "setPrimary";
      nodeId: string;
      prev: { primaryResultId: string | null; assetName: string | null };
      next: { primaryResultId: string | null; assetName: string | null };
    };

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/**
 * 生成结束时发起画布已不在前台：读最新存档，更新占位节点后整体 PUT。
 * 409 时重取一次再写；图片资产已落盘，失败只丢画布引用。
 * 节点已被删除时暂存 orphan，等待用户撤销删除后补写。
 */
async function persistResultToOriginCanvas(
  canvasId: string,
  sourceNodeId: string,
  outcome: GenerationOutcome,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`/api/canvases/${canvasId}`, { cache: "no-store" });
      if (!response.ok) {
        break;
      }
      const remote = (await response.json()) as CanvasDoc;
      const nodes = remote.nodes as Node[];
      const source = nodes.find((item) => item.id === sourceNodeId);
      if (!source) {
        stashOrphan(canvasId, sourceNodeId, outcome);
        return;
      }
      const patch = applyGenerationOutcome(source.data, outcome, () => crypto.randomUUID());
      if (!patch) {
        return; // 迟到的旧响应或同批次重复回写
      }
      source.data = { ...source.data, ...patch };
      const put = await fetch(`/api/canvases/${canvasId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: remote.revision,
          name: remote.name,
          createdAt: remote.createdAt,
          viewport: remote.viewport,
          nodes,
          edges: remote.edges,
        }),
      });
      if (put.ok) {
        return;
      }
      if (put.status !== 409) {
        break;
      }
    } catch {
      break;
    }
  }
  toast.error("生成完成，但写回原画布失败，请刷新对应画布检查");
}

async function persistVideoToOriginCanvas(
  canvasId: string,
  sourceNodeId: string,
  view: VideoTaskView,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`/api/canvases/${canvasId}`, { cache: "no-store" });
      if (!response.ok) {
        break;
      }
      const remote = (await response.json()) as CanvasDoc;
      const nodes = remote.nodes as Node[];
      const source = nodes.find((item) => item.id === sourceNodeId);
      if (!source) {
        stashVideoOrphan(canvasId, sourceNodeId, view);
        return;
      }
      source.data = { ...source.data, ...videoNodePatchFromView(view) };
      const put = await fetch(`/api/canvases/${canvasId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: remote.revision,
          name: remote.name,
          createdAt: remote.createdAt,
          viewport: remote.viewport,
          nodes,
          edges: remote.edges,
        }),
      });
      if (put.ok) {
        return;
      }
      if (put.status !== 409) {
        break;
      }
    } catch {
      break;
    }
  }
  toast.error("生成完成，但写回原画布失败，请刷新对应画布检查");
}

// 来源右侧不重叠空位：右移一格，被占用则向下避让
function freeSpotRightOf(origin: { x: number; y: number }, nodes: Node[]): { x: number; y: number } {
  let position = { x: origin.x + 380, y: origin.y };
  while (nodes.some((item) => Math.abs(item.position.x - position.x) < 300 && Math.abs(item.position.y - position.y) < 300)) {
    position = { ...position, y: position.y + 360 };
  }
  return position;
}

export function FlowCanvas({
  doc,
  onRegisterFlush,
  onSaveStatus,
}: {
  doc: CanvasDoc;
  onRegisterFlush?: (flush: () => Promise<boolean>) => void;
  onSaveStatus?: (status: CanvasSaveStatus) => void;
}) {
  const desktopAvailable = useDesktopAvailable();
  const { loggedIn, refresh: refreshAuth } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(doc.nodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(doc.edges as Edge[]);
  const [menu, setMenu] = useState<MenuState>(null);
  const [panelNodeId, setPanelNodeId] = useState<string | null>(null);
  // 同时只展开一个候选面板；展开时收起提示词面板
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const expandedNodeIdRef = useRef<string | null>(null);
  expandedNodeIdRef.current = expandedNodeId;
  const openCandidates = useCallback((nodeId: string) => {
    setMenu(null);
    setPanelNodeId(null);
    setExpandedNodeId(nodeId);
  }, []);
  const closeCandidates = useCallback((restoreFocus = true) => {
    const current = expandedNodeIdRef.current;
    setExpandedNodeId(null);
    // 关闭后焦点返回角标入口
    if (current && restoreFocus) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-candidate-badge="${CSS.escape(current)}"]`)?.focus();
      });
    }
  }, []);
  // 小窗口隐藏工作区、节点被删除/撤销掉时关闭候选浮层
  useEffect(() => {
    if (!desktopAvailable) {
      setExpandedNodeId(null);
    }
  }, [desktopAvailable]);
  useEffect(() => {
    if (expandedNodeId && !nodes.some((node) => node.id === expandedNodeId)) {
      setExpandedNodeId(null);
    }
  }, [expandedNodeId, nodes]);
  // React Flow reruns its selection effect when this callback's identity changes.
  // Keep it stable so dismissing the panel cannot immediately reopen it.
  // 提交生成时新结果节点会独占选中，用一次标记跳过这次自动打开面板（提交后收面板、留草稿）
  const suppressPanelForSelectionRef = useRef(false);
  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    // 选中变化（点别的节点/框选）收起候选扇形；焦点不返回角标
    closeCandidates(false);
    if (suppressPanelForSelectionRef.current) {
      suppressPanelForSelectionRef.current = false;
      setPanelNodeId(null);
      return;
    }
    setPanelNodeId(selectedNodes.length === 1 ? (selectedNodes[0]?.id ?? null) : null);
  }, [closeCandidates]);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const { screenToFlowPosition, updateNodeData, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const uploadAtRef = useRef({ x: 0, y: 0 });
  const attachTargetRef = useRef<string | null>(null);
  const attachRoleRef = useRef<VideoInputRole | undefined>(undefined);
  const menuOpenedAtRef = useRef(0);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  // 新建类操作入撤销栈（新建节点/上传/粘贴/连线）
  const pushAdd = useCallback((addedNodes: Node[], addedEdges: Edge[]) => {
    undoStackRef.current.push({ type: "add", nodes: addedNodes, edges: addedEdges });
    redoStackRef.current = [];
  }, []);
  const dragStartRef = useRef<Array<{ id: string; x: number; y: number }>>([]);

  const revisionRef = useRef(doc.revision);
  const viewportRef = useRef<Viewport>(doc.viewport);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const saveOkRef = useRef(true);
  const latestRef = useRef({ nodes, edges });
  latestRef.current = { nodes, edges };
  const skipInitialSaveRef = useRef(true);
  const onSaveStatusRef = useRef(onSaveStatus);
  onSaveStatusRef.current = onSaveStatus;

  const reportSave = (status: CanvasSaveStatus) => {
    saveOkRef.current = status.ok;
    onSaveStatusRef.current?.(status);
    if (!status.ok) {
      toast.error(status.message);
    }
  };

  // ---- 持久化：500ms 防抖自动保存 ----
  const save = useCallback(async () => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      const response = await fetch(`/api/canvases/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: revisionRef.current,
          name: doc.name,
          createdAt: doc.createdAt,
          viewport: viewportRef.current,
          nodes: latestRef.current.nodes,
          edges: latestRef.current.edges,
        }),
      });
      const payload = (await response.json()) as CanvasDoc & { error?: { message: string } };
      if (response.ok) {
        revisionRef.current = payload.revision;
        reportSave({ ok: true });
      } else if (response.status === 409) {
        reportSave({ ok: false, message: canvasSaveErrorMessage({ kind: "conflict" }) });
      } else {
        reportSave({
          ok: false,
          message: canvasSaveErrorMessage({ kind: "http", status: response.status, message: payload.error?.message }),
        });
      }
    } catch {
      reportSave({ ok: false, message: canvasSaveErrorMessage({ kind: "network" }) });
    } finally {
      savingRef.current = false;
    }
  }, [doc]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => void save(), 500);
  }, [save]);

  // 切换画布前调用：停掉防抖、等在途保存、把最新状态落盘，返回是否成功
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    while (savingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await save();
    return saveOkRef.current;
  }, [save]);

  useEffect(() => {
    onRegisterFlush?.(flushSave);
  }, [flushSave, onRegisterFlush]);

  // 卸载（切换画布/删除画布）：停掉未触发的防抖保存
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  // 生成结局落地：整批一次写入；节点已删则暂存 orphan，等撤销删除后补写
  const applyOutcome = useCallback(
    (nodeId: string, outcome: GenerationOutcome) => {
      const node = latestRef.current.nodes.find((item) => item.id === nodeId);
      if (!node) {
        stashOrphan(doc.id, nodeId, outcome);
        return;
      }
      const patch = applyGenerationOutcome(node.data, outcome, () => crypto.randomUUID());
      if (patch) {
        updateNodeData(nodeId, patch);
      }
    },
    [doc.id, updateNodeData],
  );

  // 注册为前台画布接收生成结果；挂载时恢复仍在进行中的 loading 状态、补写 orphan
  useEffect(() => {
    const handlers = { applyOutcome };
    registerCanvas(doc.id, handlers);
    for (const node of latestRef.current.nodes) {
      const orphan = takeOrphan(doc.id, node.id);
      if (orphan) {
        const patch = applyGenerationOutcome(node.data, orphan, () => crypto.randomUUID());
        if (patch) {
          updateNodeData(node.id, patch);
        }
        continue;
      }
      // 刷新后不恢复图片"生成中"：无法确认的任务标记结果未知。视频凭 taskId 恢复轮询。
      if (node.data.status === "running" && !isPending(doc.id, node.id)) {
        if (
          node.type === "video" &&
          ((typeof node.data.taskId === "string" && node.data.taskId) || submittedVideoTask(doc.id, node.id))
        ) {
          continue;
        }
        updateNodeData(node.id, { status: "failed", errorMessage: UNCONFIRMED_RESULT_MESSAGE });
      }
    }
    for (const pendingNodeId of pendingFor(doc.id)) {
      if (latestRef.current.nodes.some((item) => item.id === pendingNodeId)) {
        updateNodeData(pendingNodeId, { status: "running" });
      } else {
        clearPending(doc.id, pendingNodeId);
      }
    }
    return () => unregisterCanvas(doc.id, handlers);
  }, [doc.id, applyOutcome, updateNodeData]);

  const applyVideoView = useCallback(
    (nodeId: string, view: VideoTaskView) => {
      const node = latestRef.current.nodes.find((item) => item.id === nodeId);
      if (!node) {
        stashVideoOrphan(doc.id, nodeId, view);
        if (isVideoWatchStopStatus(view.status)) clearPending(doc.id, nodeId);
        return;
      }
      updateNodeData(nodeId, videoNodePatchFromView(view));
      if (isVideoWatchStopStatus(view.status)) clearPending(doc.id, nodeId);
    },
    [doc.id, updateNodeData],
  );

  const startVideoWatch = useCallback(
    (nodeId: string, taskId: string) => {
      watchVideoTask(doc.id, nodeId, taskId, (view) => {
        if (!dispatchVideoView(doc.id, nodeId, view) && isVideoWatchStopStatus(view.status)) {
          void persistVideoToOriginCanvas(doc.id, nodeId, view);
        }
      });
    },
    [doc.id],
  );

  useEffect(() => {
    const handlers = { applyVideoView };
    registerVideoCanvas(doc.id, handlers);
    for (const node of latestRef.current.nodes) {
      if (node.type !== "video") continue;
      const orphan = takeVideoOrphan(doc.id, node.id);
      if (orphan) updateNodeData(node.id, videoNodePatchFromView(orphan));
    }
    void (async () => {
      try {
        const recovered = await recoverVideoJobs();
        for (const view of recovered) {
          if (view.canvasId !== doc.id) continue;
          applyVideoView(view.nodeId, view);
          if (!isVideoWatchStopStatus(view.status) && view.taskId) {
            startVideoWatch(view.nodeId, view.taskId);
          }
        }
      } catch {
        // 恢复接口失败时仍按节点上的 taskId 自行轮询
      }
      for (const node of latestRef.current.nodes) {
        if (node.type !== "video") continue;
        const taskId =
          (typeof node.data.taskId === "string" && node.data.taskId) || submittedVideoTask(doc.id, node.id);
        if (node.data.status === "running" && taskId && !isWatchingVideo(doc.id, node.id)) {
          startVideoWatch(node.id, taskId);
        }
      }
    })();
    return () => unregisterVideoCanvas(doc.id, handlers);
  }, [doc.id, applyVideoView, startVideoWatch, updateNodeData]);

  // 标题重命名走常规保存通道（与节点编辑共用 revision）
  const prevNameRef = useRef(doc.name);
  useEffect(() => {
    if (prevNameRef.current !== doc.name) {
      prevNameRef.current = doc.name;
      scheduleSave();
    }
  }, [doc.name, scheduleSave]);

  useEffect(() => {
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }
    scheduleSave();
  }, [nodes, edges, scheduleSave]);

  const onMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      viewportRef.current = viewport;
      scheduleSave();
    },
    [scheduleSave],
  );

  // ---- 附件计数：连线附件 + 直传附件共用 5 个名额 ----
  const attachmentCountOf = useCallback((nodeId: string): number => {
    const node = latestRef.current.nodes.find((item) => item.id === nodeId);
    const uploads = (node?.data.uploadAttachments as string[] | undefined) ?? [];
    const incoming = latestRef.current.edges.filter((edge) => edge.target === nodeId).length;
    return uploads.length + incoming;
  }, []);

  // ---- 连线规则：图片附件最多 5；视频首帧/尾帧/参考合计未满；同一源不重复（源无图也可连）----
  const checkConnection = useCallback((connection: Connection | Edge): boolean => {
    const { source, target } = connection;
    if (!source || !target || source === target) {
      return false;
    }
    const sourceNode = latestRef.current.nodes.find((node) => node.id === source);
    const targetNode = latestRef.current.nodes.find((node) => node.id === target);
    if (latestRef.current.edges.some((edge) => edge.target === target && edge.source === source)) {
      return false;
    }
    if (targetNode?.type === "video") {
      if (sourceNode?.type !== "image" && sourceNode?.type !== "asset") {
        return false;
      }
      return defaultNewVideoRole(videoOccupancy(target, latestRef.current.nodes, latestRef.current.edges)) !== null;
    }
    if (targetNode?.type !== "image") {
      return false;
    }
    return attachmentCountOf(target) < ATTACHMENT_MAX;
  }, [attachmentCountOf]);

  const connectEdge = useCallback((connection: Connection): Edge => {
    const targetNode = latestRef.current.nodes.find((node) => node.id === connection.target);
    if (targetNode?.type === "video" && connection.target) {
      return {
        ...connection,
        id: crypto.randomUUID(),
        type: "scissor",
        data: { role: defaultNewVideoRole(videoOccupancy(connection.target, latestRef.current.nodes, latestRef.current.edges)) ?? "reference" },
      };
    }
    return { ...connection, id: crypto.randomUUID(), type: "scissor" };
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!checkConnection(connection)) {
        const targetNode = latestRef.current.nodes.find((node) => node.id === connection.target);
        toast.error(connectRejectMessage(targetNode?.type));
        return;
      }
      const edge = connectEdge(connection);
      setEdges((current) => addEdge(edge, current));
      pushAdd([], [edge]);
    },
    [checkConnection, connectEdge, pushAdd, setEdges],
  );

  // 拖线松开：落在节点框上 → 自动连接；落在空白 → 弹"引用该节点生成"菜单
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: { isValid: boolean | null; fromNode?: Node | null; fromHandle?: { type: string } | null }) => {
      if (connectionState.isValid) {
        return;
      }
      const fromNode = connectionState.fromNode;
      if (!fromNode || connectionState.fromHandle?.type !== "source") {
        return;
      }
      const point = "changedTouches" in event
        ? { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 }
        : { x: event.clientX, y: event.clientY };
      const flow = screenToFlowPosition(point);

      const target = latestRef.current.nodes.find((node) => {
        if (node.id === fromNode.id) {
          return false;
        }
        const width = node.measured?.width ?? 0;
        const height = node.measured?.height ?? 0;
        return (
          flow.x >= node.position.x &&
          flow.x <= node.position.x + width &&
          flow.y >= node.position.y &&
          flow.y <= node.position.y + height
        );
      });
      if (target) {
        const connection = { source: fromNode.id, target: target.id, sourceHandle: null, targetHandle: null };
        if (checkConnection(connection)) {
          const edge = connectEdge(connection);
          setEdges((current) => addEdge(edge, current));
          pushAdd([], [edge]);
        } else {
          toast.error(connectRejectMessage(target.type));
        }
        return;
      }
      setMenu({ kind: "connect-create", x: point.x, y: point.y, flow, sourceId: fromNode.id });
      menuOpenedAtRef.current = Date.now();
    },
    [checkConnection, connectEdge, pushAdd, screenToFlowPosition, setEdges],
  );

  // ---- 节点创建 / 上传 ----
  const viewportCenter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const point = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return screenToFlowPosition(point);
  }, [screenToFlowPosition]);

  const addImageNode = useCallback(
    (at: { x: number; y: number }): ImageFlowNode => {
      const id = crypto.randomUUID();
      const node: ImageFlowNode = {
        id,
        type: "image",
        position: at,
        selected: true,
        data: defaultImageNodeData("图片"),
      };
      // 新节点独占选中并弹出输入框：创建即把注意力放到该节点上
      setNodes((current) => [...current.map((item) => (item.selected ? { ...item, selected: false } : item)), node]);
      setPanelNodeId(id);
      return node;
    },
    [setNodes],
  );

  const addVideoNode = useCallback(
    (at: { x: number; y: number }): VideoFlowNode => {
      const id = crypto.randomUUID();
      const node: VideoFlowNode = {
        id,
        type: "video",
        position: at,
        selected: true,
        data: defaultVideoNodeData("视频"),
      };
      setNodes((current) => [...current.map((item) => (item.selected ? { ...item, selected: false } : item)), node]);
      setPanelNodeId(id);
      return node;
    },
    [setNodes],
  );

  const addAssetNode = useCallback(
    (at: { x: number; y: number }, assetName: string, name: string): Node => {
      const node: Node = {
        id: crypto.randomUUID(),
        type: "asset",
        position: at,
        data: { name, assetName },
      };
      setNodes((current) => [...current, node]);
      return node;
    },
    [setNodes],
  );

  const uploadFiles = useCallback(async (files: File[]) => {
    const form = new FormData();
    for (const file of files) {
      form.append("files", file);
    }
    const response = await fetch("/api/assets/upload", { method: "POST", body: form });
    const payload = (await response.json()) as {
      assets: Array<{ name: string; originalName: string }>;
      rejected: Array<{ name: string; reason: string }>;
    };
    for (const item of payload.rejected) {
      toast.error(`${item.name}：${item.reason}`);
    }
    return payload.assets;
  }, []);

  const onCanvasUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      const assets = await uploadFiles(Array.from(files));
      // 一批上传记一条撤销，避免多张图要按多次 ⌘Z
      const created = assets.map((asset, index) =>
        addAssetNode(
          { x: uploadAtRef.current.x + index * 40, y: uploadAtRef.current.y + index * 40 },
          asset.name,
          asset.originalName,
        ),
      );
      if (created.length > 0) {
        pushAdd(created, []);
      }
    },
    [addAssetNode, pushAdd, uploadFiles],
  );

  const onAttachmentUpload = useCallback(
    async (files: FileList | null) => {
      const nodeId = attachTargetRef.current;
      attachTargetRef.current = null;
      if (!nodeId || !files || files.length === 0) {
        return;
      }
      const file = files[0];
      if (!file) {
        return;
      }
      const node = latestRef.current.nodes.find((item) => item.id === nodeId);
      const requestedRole = attachRoleRef.current;
      attachRoleRef.current = undefined;
      if (node?.type === "video") {
        const occupancy = videoOccupancy(nodeId, latestRef.current.nodes, latestRef.current.edges);
        const role = requestedRole ?? defaultNewVideoRole(occupancy);
        if (!role) {
          toast.error("视频素材槽已满，请先移除");
          return;
        }
        if ((role === "first" || role === "last") && occupancy.some((item) => item.role === role)) {
          toast.error(role === "first" ? "已有首帧" : "已有尾帧");
          return;
        }
        if (role === "reference" && occupancy.filter((item) => item.role === "reference").length >= VIDEO_REFERENCE_MAX) {
          toast.error(`参考图最多 ${VIDEO_REFERENCE_MAX} 张`);
          return;
        }
        const assets = await uploadFiles([file]);
        const uploaded = assets[0];
        if (!uploaded) {
          return;
        }
        const current = ((node.data as VideoNodeData).uploadInputs) ?? [];
        updateNodeData(nodeId, {
          uploadInputs: [...current, { assetName: uploaded.name, role }],
          attachmentNames: { ...((node.data as VideoNodeData).attachmentNames ?? {}), [uploaded.name]: uploaded.originalName },
        });
        return;
      }
      if (attachmentCountOf(nodeId) >= ATTACHMENT_MAX) {
        toast.error(`附件已满 ${ATTACHMENT_MAX} 个，请先移除`);
        return;
      }
      const assets = await uploadFiles([file]);
      const uploaded = assets[0];
      if (!uploaded) {
        return;
      }
      const current = (node?.data.uploadAttachments as string[] | undefined) ?? [];
      updateNodeData(nodeId, { uploadAttachments: [...current, uploaded.name], attachmentNames: { ...(node?.data.attachmentNames as Record<string, string> ?? {}), [uploaded.name]: uploaded.originalName } });
    },
    [attachmentCountOf, updateNodeData, uploadFiles],
  );

  const requestAttachmentUpload = useCallback((nodeId: string, options?: { role?: VideoInputRole }) => {
    attachTargetRef.current = nodeId;
    attachRoleRef.current = options?.role;
    attachInputRef.current?.click();
  }, []);

  // ---- 生成：空节点填自己，有图节点结果落右侧新节点；retrySlotId 单槽重试不新建节点 ----
  const generate = useCallback(
    async (nodeId: string, overrides?: GenerateOverrides) => {
      let node = latestRef.current.nodes.find((item) => item.id === nodeId);
      // 并发锁定：节点自身在跑，或它作为来源已有进行中的任务
      if (!node || node.data.status === "running" || isPending(doc.id, nodeId) || hasPendingFrom(doc.id, nodeId)) {
        return;
      }
      const retrySlotId = overrides?.retrySlotId ?? null;
      let retry: ImageNodeData["generationRequest"] | undefined;
      if (retrySlotId) {
        // 单槽重试：重放原批次快照但数量为 1，只允许重试失败槽
        const slot = ((node.data.results as ImageNodeData["results"]) ?? []).find((item) => item.id === retrySlotId);
        if (!node.data.generationRequest || !slot || slot.status !== "failed") {
          return;
        }
        retry = { ...(node.data.generationRequest as ImageNodeData["generationRequest"] & object), count: 1 };
      } else if (overrides?.retry) {
        retry = node.data.generationRequest as ImageNodeData["generationRequest"];
      }
      const prompt = String(retry?.prompt ?? overrides?.prompt ?? node.data.prompt ?? "").trim();
      const aspectRatio = retry?.aspectRatio ?? overrides?.aspectRatio ?? (node.data.aspectRatio as string);
      const resolution = retry?.resolution ?? overrides?.resolution ?? (node.data.resolution as "1k" | "2k");
      const quality = retry?.quality ?? overrides?.quality ?? (node.data.quality as "low" | "medium");
      const count = retry?.count ?? overrides?.count ?? parseGenerationCount(node.data.generationCount);
      if (!prompt) {
        return;
      }
      // 未登录直接拦截：不发起请求、不改动节点状态，由面板常驻提示引导登录
      if (loginRequired(loggedIn)) {
        toast.error(LOGIN_REQUIRED_MESSAGE);
        return;
      }
      const edgeRefNames = latestRef.current.edges
        .filter((edge) => edge.target === nodeId)
        .map((edge) => latestRef.current.nodes.find((item) => item.id === edge.source)?.data.assetName);
      const missingRefs = edgeRefNames.filter((name) => typeof name !== "string").length;
      const edgeRefs = edgeRefNames.filter((name): name is string => typeof name === "string");
      if (!retry && missingRefs > 0) {
        toast.warning(`有 ${missingRefs} 个附件的来源还没有图片，本次生成未使用`);
      }
      const uploadRefs = (node.data.uploadAttachments as string[] | undefined) ?? [];
      // 节点自身是生成结果；只有连入图片和上传附件参与生成。
      const referenceAssets = retry?.referenceAssets ?? [...new Set([...edgeRefs, ...uploadRefs])];
      if (referenceAssets.length > ATTACHMENT_MAX) {
        toast.error(`参考图超过 ${ATTACHMENT_MAX} 张上限，请先移除多余附件`);
        return;
      }

      try {
        compilePrompt(prompt, referenceAssets);
      } catch (error) {
        toast.error((error as Error).message);
        return;
      }
      const referenceNames = { ...(node.data.attachmentNames as Record<string, string> ?? {}) };
      for (const source of latestRef.current.nodes) {
        if (typeof source.data.assetName === "string" && referenceAssets.includes(source.data.assetName)) {
          referenceNames[source.data.assetName] = String(source.data.name || "参考图");
        }
      }
      const generationId = crypto.randomUUID();
      let pendingSourceNodeId: string | null = (node.data.sourceNodeId as string | null | undefined) ?? null;
      if (!retrySlotId && node.data.assetName) {
        const generationRequest = { prompt, aspectRatio, resolution, quality, count, referenceAssets: [...referenceAssets] };
        const original = node;
        const position = freeSpotRightOf(original.position, latestRef.current.nodes);
        nodeId = crypto.randomUUID();
        node = { id: nodeId, type: "image", position, selected: true, data: {
          ...defaultImageNodeData("图片"), prompt, aspectRatio, resolution, quality, generationCount: count,
          uploadAttachments: [...referenceAssets], attachmentNames: referenceNames,
          generationRequest, sourceNodeId: original.id, status: "running", generationId,
        } };
        pendingSourceNodeId = original.id;
        const pendingNode = node;
        suppressPanelForSelectionRef.current = true;
        setNodes(current => [...current.map(item => ({ ...item, selected: false })), pendingNode]);
      } else if (retrySlotId) {
        updateNodeData(nodeId, { status: "running", generationId, errorMessage: null, retryingSlotId: retrySlotId });
      } else {
        updateNodeData(nodeId, { status: "running", generationId, errorMessage: null, generationRequest: { prompt, aspectRatio, resolution, quality, count, referenceAssets: [...referenceAssets] } });
        setPanelNodeId(null);
      }
      markPending(doc.id, nodeId, pendingSourceNodeId);
      const settle = async (outcome: GenerationOutcome) => {
        // 前台画布（含切回后的新实例）直接更新；不在前台则写回发起画布存档
        if (!dispatchOutcome(doc.id, nodeId, outcome)) {
          await persistResultToOriginCanvas(doc.id, nodeId, outcome);
        }
      };
      try {
        const response = await fetch("/api/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            aspect_ratio: aspectRatio,
            resolution,
            quality,
            count,
            referenceAssets,
          }),
        });
        const payload = (await response.json()) as GenerateResponse;
        if (!response.ok || !Array.isArray(payload.slots)) {
          const message = payload.error?.message ?? `请求失败 (${response.status})`;
          if (payload.error?.kind === "not_logged_in") {
            toast.error(LOGIN_REQUIRED_MESSAGE);
            await refreshAuth().catch(() => {});
          } else {
            toast.error(message);
          }
          await settle({ kind: "failure", generationId, failureKind: "server", message });
          return;
        }
        await settle({ kind: "result", generationId, slots: payload.slots, retrySlotId, prompt });
      } catch {
        toast.error("生成请求失败：网络错误");
        await settle({ kind: "failure", generationId, failureKind: "network" });
      } finally {
        clearPending(doc.id, nodeId);
      }
    },
    [doc.id, loggedIn, refreshAuth, updateNodeData, setNodes],
  );

  const generateVideo = useCallback(
    async (nodeId: string, overrides?: GenerateVideoOverrides) => {
      let node = latestRef.current.nodes.find((item) => item.id === nodeId);
      if (!node || node.type !== "video" || node.data.status === "running" || isPending(doc.id, nodeId) || hasPendingFrom(doc.id, nodeId)) {
        return;
      }
      const data = node.data as VideoNodeData;
      if (overrides?.retry && data.errorKind === "save_failed" && data.taskId) {
        updateNodeData(nodeId, { status: "running", errorMessage: null, errorKind: null });
        markPending(doc.id, nodeId, data.sourceNodeId ?? null);
        startVideoWatch(nodeId, data.taskId);
        return;
      }
      const retryRequest = overrides?.retry ? data.generationRequest : undefined;
      const prompt = String(retryRequest?.prompt ?? overrides?.prompt ?? data.draftPrompt ?? data.prompt ?? "").trim();
      if (!prompt) return;
      if (loginRequired(loggedIn)) {
        toast.error(LOGIN_REQUIRED_MESSAGE);
        return;
      }
      const liveNames: Record<string, string> = { ...(data.attachmentNames ?? {}) };
      let inputs: VideoInput[] = retryRequest?.inputs ?? [];
      if (!retryRequest) {
        const live: VideoInput[] = [];
        let pending = 0;
        for (const edge of latestRef.current.edges.filter((item) => item.target === nodeId)) {
          const source = latestRef.current.nodes.find((item) => item.id === edge.source);
          const assetName = source?.data.assetName;
          const role = videoEdgeRole(edge);
          if (typeof assetName === "string") {
            liveNames[assetName] = String(source?.data.name || liveNames[assetName] || "图片");
            if (!live.some((item) => item.assetName === assetName)) {
              live.push({ assetName, role });
            }
          } else {
            pending += 1;
          }
        }
        for (const upload of data.uploadInputs ?? []) {
          if (!live.some((item) => item.assetName === upload.assetName)) {
            live.push(upload);
          }
        }
        if (pending > 0) {
          toast.warning(`有 ${pending} 个附件的来源还没有图片，本次生成未使用`);
        }
        inputs = live;
      }
      try {
        compileVideoPrompt(prompt, inputs);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "提示词引用无效");
        return;
      }
      const clamped = clampVideoParameters(inputs, {
        duration: retryRequest?.duration ?? overrides?.duration ?? data.duration,
        aspectRatio: retryRequest
          ? retryRequest.aspectRatio
          : overrides?.aspectRatio !== undefined
            ? overrides.aspectRatio
            : data.aspectRatio,
        resolution: retryRequest?.resolution ?? overrides?.resolution ?? data.resolution,
        audio: retryRequest?.audio ?? overrides?.audio ?? data.audio,
      });
      const generationRequest: VideoGenerationRequest = { prompt, ...clamped, inputs };
      let pendingSourceNodeId: string | null = data.sourceNodeId ?? null;
      if (!overrides?.retry && data.assetName) {
        const original = node;
        nodeId = crypto.randomUUID();
        const pendingNode: VideoFlowNode = {
          id: nodeId,
          type: "video",
          position: freeSpotRightOf(original.position, latestRef.current.nodes),
          selected: true,
          data: {
            ...defaultVideoNodeData("视频"),
            prompt,
            duration: generationRequest.duration,
            aspectRatio: generationRequest.aspectRatio,
            resolution: generationRequest.resolution,
            audio: generationRequest.audio,
            uploadInputs: [...inputs],
            attachmentNames: liveNames,
            generationRequest,
            sourceNodeId: original.id,
            status: "running",
            waitedSeconds: 0,
          },
        };
        pendingSourceNodeId = original.id;
        suppressPanelForSelectionRef.current = true;
        setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), pendingNode]);
      } else {
        updateNodeData(nodeId, {
          status: "running",
          prompt,
          duration: generationRequest.duration,
          aspectRatio: generationRequest.aspectRatio,
          resolution: generationRequest.resolution,
          audio: generationRequest.audio,
          generationRequest,
          errorMessage: null,
          errorKind: null,
          taskId: null,
          waitedSeconds: 0,
        });
        setPanelNodeId(null);
      }
      markPending(doc.id, nodeId, pendingSourceNodeId);
      try {
        const created = await submitVideoJob({
          prompt,
          canvasId: doc.id,
          nodeId,
          inputs,
          parameters: {
            prompt,
            duration: generationRequest.duration,
            aspectRatio: generationRequest.aspectRatio,
            resolution: generationRequest.resolution,
            audio: generationRequest.audio,
          },
        });
        rememberSubmittedVideoTask(doc.id, nodeId, created.taskId);
        const pendingView: VideoTaskView = {
          taskId: created.taskId,
          requestId: created.requestId,
          canvasId: doc.id,
          nodeId,
          status: "pending",
          waitedSeconds: 0,
          result: null,
          error: null,
        };
        if (!dispatchVideoView(doc.id, nodeId, pendingView)) {
          void persistVideoToOriginCanvas(doc.id, nodeId, pendingView);
        }
        startVideoWatch(nodeId, created.taskId);
      } catch (error) {
        const kind = (error as { kind?: string }).kind;
        if (kind === "not_logged_in") {
          toast.error(LOGIN_REQUIRED_MESSAGE);
          await refreshAuth().catch(() => {});
        } else {
          toast.error(error instanceof Error ? error.message : "生成请求失败");
        }
        updateNodeData(nodeId, {
          status: "failed",
          errorMessage: kind === "not_logged_in" ? LOGIN_REQUIRED_MESSAGE : (error instanceof Error ? error.message : "生成失败"),
          errorKind: "network",
        });
        clearPending(doc.id, nodeId);
      }
    },
    [doc.id, loggedIn, refreshAuth, startVideoWatch, updateNodeData, setNodes],
  );

  // 生成锁定：节点自身在跑，或它作为来源已有进行中的任务
  const isNodeGenerationLocked = useCallback(
    (nodeId: string) => {
      const node = latestRef.current.nodes.find((item) => item.id === nodeId);
      return !node || node.data.status === "running" || isPending(doc.id, nodeId) || hasPendingFrom(doc.id, nodeId);
    },
    [doc.id],
  );

  // ---- 删除（支持撤销）----
  const deleteNodes = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) {
        return;
      }
      const removedNodes = latestRef.current.nodes.filter((node) => nodeIds.includes(node.id));
      const removedEdges = latestRef.current.edges.filter(
        (edge) => nodeIds.includes(edge.source) || nodeIds.includes(edge.target),
      );
      undoStackRef.current.push({ type: "delete", nodes: removedNodes, edges: removedEdges });
      redoStackRef.current = [];
      setNodes((current) => current.filter((node) => !nodeIds.includes(node.id)));
      setEdges((current) =>
        current.filter((edge) => !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)),
      );
    },
    [setNodes, setEdges],
  );

  // ---- 复制 / 粘贴 / 副本（内部剪贴板，跨画布不共享）----
  const copyNodes = useCallback((nodeIds: string[]) => {
    const nodesToCopy = latestRef.current.nodes.filter((node) => nodeIds.includes(node.id));
    if (nodesToCopy.length === 0) {
      return;
    }
    const edgesToCopy = latestRef.current.edges.filter(
      (edge) => nodeIds.includes(edge.source) && nodeIds.includes(edge.target),
    );
    clipboardRef.current = {
      nodes: nodesToCopy.map((node) => ({
        ...node,
        data: {
          ...node.data,
          // results 深拷贝，副本不与原节点共享槽位引用
          ...(Array.isArray(node.data.results)
            ? { results: (node.data.results as CandidateResult[]).map((item) => ({ ...item })) }
            : {}),
        },
        selected: false,
      })),
      edges: edgesToCopy.map((edge) => ({ ...edge, selected: false })),
    };
  }, []);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) {
      return;
    }
    const OFFSET = 48;
    const idMap = new Map<string, string>();
    const newNodes = clip.nodes.map((node) => {
      const id = crypto.randomUUID();
      idMap.set(node.id, id);
      const data: Record<string, unknown> = { ...node.data };
      if (Array.isArray(node.data.results)) {
        data.results = (node.data.results as CandidateResult[]).map((item) => ({ ...item }));
      }
      // 副本是静态快照：不带 running 状态、不继承运行中任务与未确认状态
      if (data.status === "running") {
        data.status = "idle";
      }
      data.generationId = null;
      data.appliedGenerationId = null;
      data.errorMessage = null;
      if (node.type === "video") {
        data.taskId = null;
        data.waitedSeconds = undefined;
        data.errorKind = null;
      }
      if (node.type === "image") {
        const normalized = normalizeNodeResults(data);
        data.results = normalized.results;
        data.primaryResultId = normalized.primaryResultId;
        data.assetName = normalized.assetName;
      }
      return {
        ...node,
        id,
        position: { x: node.position.x + OFFSET, y: node.position.y + OFFSET },
        selected: true,
        data,
      };
    });
    const newEdges = clip.edges.map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false,
    }));
    setNodes((current) => [
      ...current.map((node) => (node.selected ? { ...node, selected: false } : node)),
      ...newNodes,
    ]);
    setEdges((current) => [...current, ...newEdges]);
    // 连续粘贴在新位置上继续错位
    clipboardRef.current = {
      nodes: newNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          ...(Array.isArray(node.data.results)
            ? { results: (node.data.results as CandidateResult[]).map((item) => ({ ...item })) }
            : {}),
        },
        selected: false,
      })),
      edges: newEdges.map((edge) => ({ ...edge })),
    };
    pushAdd(newNodes, newEdges);
  }, [pushAdd, setNodes, setEdges]);

  const duplicateNodes = useCallback(
    (nodeIds: string[]) => {
      copyNodes(nodeIds);
      pasteClipboard();
    },
    [copyNodes, pasteClipboard],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      const edge = latestRef.current.edges.find((item) => item.id === edgeId);
      if (!edge) {
        return;
      }
      undoStackRef.current.push({ type: "delete", nodes: [], edges: [edge] });
      redoStackRef.current = [];
      setEdges((current) => current.filter((item) => item.id !== edgeId));
    },
    [setEdges],
  );

  const deleteSelection = useCallback(() => {
    const selectedNodeIds = latestRef.current.nodes.filter((node) => node.selected).map((node) => node.id);
    const selectedEdges = latestRef.current.edges.filter((edge) => edge.selected);
    for (const edge of selectedEdges) {
      undoStackRef.current.push({ type: "delete", nodes: [], edges: [edge] });
      redoStackRef.current = [];
    }
    if (selectedEdges.length > 0) {
      const ids = selectedEdges.map((edge) => edge.id);
      setEdges((current) => current.filter((edge) => !ids.includes(edge.id)));
    }
    deleteNodes(selectedNodeIds);
  }, [deleteNodes, setEdges]);

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) {
      return;
    }
    redoStackRef.current.push(entry);
    if (entry.type === "delete") {
      // 恢复删除期间完成的任务结果（orphan 补写，成功/失败都补）
      const restored = entry.nodes.map((node) => {
        if (node.type === "video") {
          const orphan = takeVideoOrphan(doc.id, node.id);
          return orphan ? { ...node, data: { ...node.data, ...videoNodePatchFromView(orphan) } } : node;
        }
        const orphan = takeOrphan(doc.id, node.id);
        if (!orphan) {
          return node;
        }
        const patch = applyGenerationOutcome(node.data, orphan, () => crypto.randomUUID());
        return patch ? { ...node, data: { ...node.data, ...patch } } : node;
      });
      setNodes((current) => [...current, ...restored]);
      setEdges((current) => [...current, ...entry.edges]);
    } else if (entry.type === "add") {
      const nodeIds = entry.nodes.map((node) => node.id);
      const edgeIds = new Set(entry.edges.map((edge) => edge.id));
      setNodes((current) => current.filter((node) => !nodeIds.includes(node.id)));
      setEdges((current) =>
        current.filter(
          (edge) => !edgeIds.has(edge.id) && !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target),
        ),
      );
    } else if (entry.type === "setPrimary") {
      updateNodeData(entry.nodeId, entry.prev);
    } else {
      setNodes((current) =>
        current.map((node) => {
          const item = entry.items.find((candidate) => candidate.id === node.id);
          return item ? { ...node, position: item.from } : node;
        }),
      );
    }
  }, [doc.id, setNodes, setEdges, updateNodeData]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) {
      return;
    }
    undoStackRef.current.push(entry);
    if (entry.type === "delete") {
      const nodeIds = entry.nodes.map((node) => node.id);
      const edgeIds = entry.edges.map((edge) => edge.id);
      setNodes((current) => current.filter((node) => !nodeIds.includes(node.id)));
      setEdges((current) => current.filter((edge) => !edgeIds.includes(edge.id)));
    } else if (entry.type === "add") {
      setNodes((current) => [...current, ...entry.nodes]);
      setEdges((current) => [...current, ...entry.edges]);
    } else if (entry.type === "setPrimary") {
      updateNodeData(entry.nodeId, entry.next);
    } else {
      setNodes((current) =>
        current.map((node) => {
          const item = entry.items.find((candidate) => candidate.id === node.id);
          return item ? { ...node, position: item.to } : node;
        }),
      );
    }
  }, [setNodes, setEdges, updateNodeData]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!desktopAvailable || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="menu"]')) return;
      if (event.key === "Escape") {
        // Nested popovers and reference suggestions handle Escape before it reaches here.
        if (isEditableTarget(event.target) && !(event.target instanceof Element && event.target.closest(".ui-prompt-panel"))) return;
        // Esc 层级：候选面板先于提示词面板/菜单
        if (expandedNodeIdRef.current) {
          closeCandidates();
          return;
        }
        setMenu(null);
        setPanelNodeId(null);
        return;
      }
      if (event.target instanceof HTMLVideoElement) return;
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey) {
        if (event.key === "=" || event.key === "+") {
          event.preventDefault();
          void zoomIn();
          return;
        }
        if (event.key === "-") {
          event.preventDefault();
          void zoomOut();
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          void zoomTo(1);
          return;
        }
        if (!event.shiftKey && event.key.toLowerCase() === "c") {
          const selectedIds = latestRef.current.nodes
            .filter((node) => node.selected)
            .map((node) => node.id);
          if (selectedIds.length > 0) {
            event.preventDefault();
            copyNodes(selectedIds);
          }
          return;
        }
        if (!event.shiftKey && event.key.toLowerCase() === "d") {
          const selectedIds = latestRef.current.nodes
            .filter((node) => node.selected)
            .map((node) => node.id);
          if (selectedIds.length > 0) {
            event.preventDefault();
            duplicateNodes(selectedIds);
          }
          return;
        }
        if (!event.shiftKey && event.key.toLowerCase() === "v") {
          if (clipboardRef.current) {
            event.preventDefault();
            pasteClipboard();
          }
          return;
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [desktopAvailable, closeCandidates, copyNodes, deleteSelection, duplicateNodes, pasteClipboard, redo, undo, zoomIn, zoomOut, zoomTo]);

  // ---- 移动（拖动结束记一次撤销）----
  const onNodeDragStart = useCallback((_event: unknown, _node: Node, draggedNodes: Node[]) => {
    // 拖任何节点收起候选扇形
    closeCandidates(false);
    dragStartRef.current = draggedNodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
    }));
  }, [closeCandidates]);

  const onNodeDragStop = useCallback(() => {
    const items = dragStartRef.current
      .map((start) => {
        const node = latestRef.current.nodes.find((item) => item.id === start.id);
        if (!node || (node.position.x === start.x && node.position.y === start.y)) {
          return null;
        }
        return { id: start.id, from: { x: start.x, y: start.y }, to: { x: node.position.x, y: node.position.y } };
      })
      .filter((item): item is { id: string; from: { x: number; y: number }; to: { x: number; y: number } } => item !== null);
    if (items.length > 0) {
      undoStackRef.current.push({ type: "move", items });
      redoStackRef.current = [];
    }
    dragStartRef.current = [];
  }, []);

  // ---- 设为主图（可撤销）：assetName 始终跟随主图槽 ----
  const setPrimaryResult = useCallback(
    (nodeId: string, slotId: string) => {
      const node = latestRef.current.nodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }
      const results = (node.data.results as ImageNodeData["results"]) ?? [];
      const slot = results.find((item) => item.id === slotId);
      if (!slot || slot.status !== "success" || !slot.assetName) {
        return;
      }
      const prev = {
        primaryResultId: (node.data.primaryResultId as string | null | undefined) ?? null,
        assetName: (node.data.assetName as string | null | undefined) ?? null,
      };
      if (prev.primaryResultId === slotId && prev.assetName === slot.assetName) {
        return;
      }
      const next = { primaryResultId: slotId, assetName: slot.assetName };
      undoStackRef.current.push({ type: "setPrimary", nodeId, prev, next });
      redoStackRef.current = [];
      updateNodeData(nodeId, next);
    },
    [updateNodeData],
  );

  // ---- 复制为节点：复用已保存资产，提示词引用转成可读文字，不带连线与运行状态 ----
  const copyCandidateAsNode = useCallback(
    async (sourceNodeId: string, slotId: string) => {
      const source = latestRef.current.nodes.find((item) => item.id === sourceNodeId);
      if (!source || source.type !== "image") {
        return;
      }
      const data = source.data as ImageNodeData;
      const slot = (data.results ?? []).find((item) => item.id === slotId);
      if (!slot || slot.status !== "success" || !slot.assetName) {
        return;
      }
      const assetName = slot.assetName;
      const defaults = defaultImageNodeData("图片");
      // 记录请求失败整体退回来源节点快照；缺失字段用编辑器默认值，不写回历史记录
      let prompt = data.generationRequest?.prompt ?? data.prompt;
      let aspectRatio = data.generationRequest?.aspectRatio ?? defaults.aspectRatio;
      let resolution = data.generationRequest?.resolution ?? defaults.resolution;
      let quality = data.generationRequest?.quality ?? defaults.quality;
      try {
        const response = await fetch(`/api/assets/${assetName}/generation`, { cache: "no-store" });
        if (response.ok) {
          const record = (await response.json()) as {
            originalPrompt?: string;
            parameters?: { aspectRatio?: string | null; resolution?: string | null; quality?: string | null };
          } | null;
          if (record) {
            if (record.originalPrompt) {
              prompt = record.originalPrompt;
            }
            aspectRatio = record.parameters?.aspectRatio ?? defaults.aspectRatio;
            resolution = record.parameters?.resolution === "2k" ? "2k" : defaults.resolution;
            quality = record.parameters?.quality === "medium" ? "medium" : defaults.quality;
          }
        }
      } catch {
        // 读记录失败：退回来源节点快照
      }
      const displayNames = data.attachmentNames ?? {};
      const readablePrompt = prompt.replace(
        referencePattern(),
        (_token, asset: string) => displayNames[asset] ?? "图片",
      );
      const id = crypto.randomUUID();
      const node: ImageFlowNode = {
        id,
        type: "image",
        position: freeSpotRightOf(source.position, latestRef.current.nodes),
        selected: true,
        data: {
          ...defaults,
          assetName,
          results: [{ id: assetName, assetName, status: "success" }],
          primaryResultId: assetName,
          prompt: readablePrompt,
          aspectRatio,
          resolution,
          quality,
        },
      };
      setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), node]);
      setPanelNodeId(id);
      pushAdd([node], []);
    },
    [pushAdd, setNodes],
  );

  const actions = useMemo(
    () => ({
      generate,
      generateVideo,
      setPrimaryResult,
      copyCandidateAsNode,
      openCandidates,
      closeCandidates,
      expandedNodeId,
      isNodeGenerationLocked,
      panelNodeId,
      removeEdge: deleteEdge,
      requestAttachmentUpload,
    }),
    [generate, generateVideo, setPrimaryResult, copyCandidateAsNode, openCandidates, closeCandidates, expandedNodeId, isNodeGenerationLocked, panelNodeId, deleteEdge, requestAttachmentUpload],
  );

  return (
    <CanvasActionsContext.Provider value={actions}>
      <div
        ref={wrapperRef}
        className="relative h-full w-full"
        onClick={() => {
          // 拖线松开会先弹菜单再触发同一次 click，忽略紧随其后的这次点击
          if (Date.now() - menuOpenedAtRef.current > 200) {
            setMenu(null);
          }
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={checkConnection}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "scissor" }}
          defaultViewport={doc.viewport}
          onMoveEnd={onMoveEnd}
          minZoom={0.1}
          maxZoom={2}
          selectionOnDrag
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          panOnScroll
          zoomOnScroll={false}
          zoomActivationKeyCode={["Meta", "Control"]}
          deleteKeyCode={null}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange}
          onNodeClick={(_event, node) => {
            if (latestRef.current.nodes.filter(item => item.selected).length <= 1) setPanelNodeId(node.id);
          }}
          onPaneClick={() => {
            setPanelNodeId(null);
            closeCandidates(false);
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            const point = { x: event.clientX, y: event.clientY };
            setMenu({ kind: "pane", ...point, flow: screenToFlowPosition(point) });
          }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            setMenu({ kind: "node", x: event.clientX, y: event.clientY, nodeId: node.id });
          }}
          onSelectionContextMenu={(event, selectedNodes) => {
            event.preventDefault();
            setMenu({
              kind: "selection",
              x: event.clientX,
              y: event.clientY,
              nodeIds: selectedNodes.map((node) => node.id),
            });
          }}
          onEdgeContextMenu={(event, edge) => {
            event.preventDefault();
            setMenu({ kind: "edge", x: event.clientX, y: event.clientY, edgeId: edge.id });
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <PromptPanel />
          <CandidatePanel />
          {minimapOpen ? (
            <MiniMap
              pannable
              position="bottom-left"
              nodeColor="#3f3f46"
              maskColor="rgba(9, 9, 11, 0.7)"
              style={{ left: 12, bottom: 56, background: "var(--popover)", borderRadius: 8 }}
            />
          ) : null}
        </ReactFlow>

        {nodes.length === 0 ? (
          <CanvasEmptyState
            onAddImage={() => {
              pushAdd([addImageNode(viewportCenter())], []);
            }}
          />
        ) : null}

        <div className="absolute left-3 top-1/2 z-20 -translate-y-[calc(50%+48px)]">
          <ControlButton
            className="flex size-8 items-center justify-center rounded-full bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 hover:bg-accent"
            aria-label={menu?.kind === "add" ? "关闭添加菜单" : "添加节点"}
            onClick={(event) => {
              event.stopPropagation();
              setMenu((current) => (current?.kind === "add" ? null : { kind: "add" }));
            }}
          >
            {menu?.kind === "add" ? <X className="size-4" /> : <Plus className="size-4" />}
          </ControlButton>
          {menu?.kind === "add" ? (
            <FloatingMenu className="left-full top-0 ml-2" onClose={() => setMenu(null)}>
              <MenuButton
                label="添加图片节点"
                onClick={() => {
                  pushAdd([addImageNode(viewportCenter())], []);
                  setMenu(null);
                }}
              />
              <MenuButton
                label="添加视频节点"
                onClick={() => {
                  pushAdd([addVideoNode(viewportCenter())], []);
                  setMenu(null);
                }}
              />
              <div className="mx-1 my-2 border-t" />
              <MenuButton
                label="上传图片"
                onClick={() => {
                  uploadAtRef.current = viewportCenter();
                  uploadInputRef.current?.click();
                  setMenu(null);
                }}
              />
            </FloatingMenu>
          ) : null}
        </div>

        <CanvasControls
          minimapOpen={minimapOpen}
          onToggleMinimap={() => setMinimapOpen((open) => !open)}
        />

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(event) => {
            void onCanvasUpload(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={attachInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            void onAttachmentUpload(event.target.files);
            event.target.value = "";
          }}
        />

        {menu && menu.kind !== "add" ? (
          <FloatingMenu position={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)}>
            {menu.kind === "pane" ? (
              <>
                <MenuButton
                  label="添加图片节点"
                  onClick={() => {
                    pushAdd([addImageNode(menu.flow)], []);
                    setMenu(null);
                  }}
                />
                <MenuButton
                  label="添加视频节点"
                  onClick={() => {
                    pushAdd([addVideoNode(menu.flow)], []);
                    setMenu(null);
                  }}
                />
                <div className="mx-1 my-2 border-t" />
                <MenuButton
                  label="上传图片"
                  onClick={() => {
                    uploadAtRef.current = menu.flow;
                    uploadInputRef.current?.click();
                    setMenu(null);
                  }}
                />
                <div className="mx-1 my-2 border-t" />
                <MenuButton
                  label="撤销"
                  shortcut="⌘Z"
                  disabled={undoStackRef.current.length === 0}
                  onClick={() => {
                    undo();
                    setMenu(null);
                  }}
                />
                <MenuButton
                  label="重做"
                  shortcut="⇧⌘Z"
                  disabled={redoStackRef.current.length === 0}
                  onClick={() => {
                    redo();
                    setMenu(null);
                  }}
                />
              </>
            ) : null}
            {menu.kind === "node" ? (
              <>
                <MenuButton
                  label="复制"
                  shortcut="⌘C"
                  onClick={() => {
                    copyNodes([menu.nodeId]);
                    setMenu(null);
                  }}
                />
                <MenuButton
                  label="粘贴"
                  shortcut="⌘V"
                  disabled={!clipboardRef.current}
                  onClick={() => {
                    pasteClipboard();
                    setMenu(null);
                  }}
                />
                <MenuButton
                  label="创建副本"
                  shortcut="⌘D"
                  onClick={() => {
                    duplicateNodes([menu.nodeId]);
                    setMenu(null);
                  }}
                />
                <div className="mx-1 my-2 border-t" />
                <MenuButton
                  label="删除"
                  shortcut="⌫"
                  onClick={() => {
                    deleteNodes([menu.nodeId]);
                    setMenu(null);
                  }}
                />
              </>
            ) : null}
            {menu.kind === "selection" ? (
              <>
                <MenuButton
                  label="复制"
                  shortcut="⌘C"
                  onClick={() => {
                    copyNodes(menu.nodeIds);
                    setMenu(null);
                  }}
                />
                <MenuButton
                  label="粘贴"
                  shortcut="⌘V"
                  disabled={!clipboardRef.current}
                  onClick={() => {
                    pasteClipboard();
                    setMenu(null);
                  }}
                />
                <MenuButton
                  label="创建副本"
                  shortcut="⌘D"
                  onClick={() => {
                    duplicateNodes(menu.nodeIds);
                    setMenu(null);
                  }}
                />
                <div className="mx-1 my-2 border-t" />
                <MenuButton
                  label={`删除 ${menu.nodeIds.length} 项`}
                  shortcut="⌫"
                  onClick={() => {
                    deleteNodes(menu.nodeIds);
                    setMenu(null);
                  }}
                />
              </>
            ) : null}
            {menu.kind === "edge" ? (
              <MenuButton
                label="删除连线"
                onClick={() => {
                  deleteEdge(menu.edgeId);
                  setMenu(null);
                }}
              />
            ) : null}
            {menu.kind === "connect-create" ? (
              <>
                <p className="px-2 py-1 text-xs text-muted-foreground">添加节点并引用此图</p>
                <MenuButton
                  label="图片节点"
                  onClick={() => {
                    const node = addImageNode(menu.flow);
                    const edge: Edge = {
                      id: crypto.randomUUID(),
                      source: menu.sourceId,
                      target: node.id,
                      type: "scissor",
                    };
                    setEdges((current) => addEdge(edge, current));
                    pushAdd([node], [edge]);
                    setMenu(null);
                  }}
                />
                <MenuButton
                  label="视频节点"
                  onClick={() => {
                    const node = addVideoNode(menu.flow);
                    const edge: Edge = {
                      id: crypto.randomUUID(),
                      source: menu.sourceId,
                      target: node.id,
                      type: "scissor",
                      // 新节点的首次引用默认首帧（与 connectEdge 同一规则来源）
                      data: { role: defaultNewVideoRole([]) ?? "reference" },
                    };
                    setEdges((current) => addEdge(edge, current));
                    pushAdd([node], [edge]);
                    setMenu(null);
                  }}
                />
              </>
            ) : null}
          </FloatingMenu>
        ) : null}
      </div>
    </CanvasActionsContext.Provider>
  );
}

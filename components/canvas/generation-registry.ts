"use client";

import type { GenerationOutcome } from "@/lib/multi-image";

/**
 * 跨 FlowCanvas 重挂载存活的生成注册表（模块级单例）。
 * 生成请求归属于发起画布：前台画布优先接收结果，画布不在前台时由调用方落盘。
 * 节点在任务运行期间被删除时，结果暂存为 orphan，撤销删除恢复节点后补写。
 */

type CanvasHandlers = {
  applyOutcome: (nodeId: string, outcome: GenerationOutcome) => void;
};

const liveCanvases = new Map<string, CanvasHandlers>();
/** canvasId -> (nodeId -> sourceNodeId)，sourceNodeId 用于同一来源的并发锁定 */
const pendingNodes = new Map<string, Map<string, string | null>>();
const orphans = new Map<string, GenerationOutcome>();

const orphanKey = (canvasId: string, nodeId: string) => `${canvasId}:${nodeId}`;

export function registerCanvas(canvasId: string, handlers: CanvasHandlers): void {
  liveCanvases.set(canvasId, handlers);
}

export function unregisterCanvas(canvasId: string, handlers: CanvasHandlers): void {
  if (liveCanvases.get(canvasId) === handlers) {
    liveCanvases.delete(canvasId);
  }
}

/** 结局派发给前台画布；返回 false 表示该画布不在前台，调用方需自行落盘 */
export function dispatchOutcome(canvasId: string, nodeId: string, outcome: GenerationOutcome): boolean {
  const handlers = liveCanvases.get(canvasId);
  if (!handlers) {
    return false;
  }
  handlers.applyOutcome(nodeId, outcome);
  return true;
}

export function markPending(canvasId: string, nodeId: string, sourceNodeId: string | null = null): void {
  let set = pendingNodes.get(canvasId);
  if (!set) {
    set = new Map();
    pendingNodes.set(canvasId, set);
  }
  set.set(nodeId, sourceNodeId);
}

export function clearPending(canvasId: string, nodeId: string): void {
  const set = pendingNodes.get(canvasId);
  if (!set) {
    return;
  }
  set.delete(nodeId);
  if (set.size === 0) {
    pendingNodes.delete(canvasId);
  }
}

export function isPending(canvasId: string, nodeId: string): boolean {
  return pendingNodes.get(canvasId)?.has(nodeId) ?? false;
}

export function hasPendingFrom(canvasId: string, sourceNodeId: string): boolean {
  const set = pendingNodes.get(canvasId);
  if (!set) {
    return false;
  }
  for (const source of set.values()) {
    if (source === sourceNodeId) {
      return true;
    }
  }
  return false;
}

export function pendingFor(canvasId: string): string[] {
  return [...(pendingNodes.get(canvasId)?.keys() ?? [])];
}

export function stashOrphan(canvasId: string, nodeId: string, outcome: GenerationOutcome): void {
  orphans.set(orphanKey(canvasId, nodeId), outcome);
}

export function takeOrphan(canvasId: string, nodeId: string): GenerationOutcome | undefined {
  const key = orphanKey(canvasId, nodeId);
  const outcome = orphans.get(key);
  if (outcome) {
    orphans.delete(key);
  }
  return outcome;
}

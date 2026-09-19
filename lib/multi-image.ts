export type GenerationCount = 1 | 2 | 4;

export type CandidateStatus = "success" | "failed";

export interface CandidateResult {
  id: string;
  assetName: string | null;
  status: CandidateStatus;
  error?: string;
}

export interface ImageNodeResultsHost {
  assetName?: string | null;
  results?: CandidateResult[];
  primaryResultId?: string | null;
}

export function isGenerationCount(value: unknown): value is GenerationCount {
  return value === 1 || value === 2 || value === 4;
}

export function parseGenerationCount(value: unknown): GenerationCount {
  return isGenerationCount(value) ? value : 1;
}

export function normalizeNodeResults(node: ImageNodeResultsHost): {
  results: CandidateResult[];
  primaryResultId: string | null;
  assetName: string | null;
} {
  if (Array.isArray(node.results)) {
    const primary =
      node.results.find((item) => item.id === node.primaryResultId && item.status === "success") ??
      node.results.find((item) => item.status === "success") ??
      null;
    return {
      results: node.results,
      primaryResultId: primary?.id ?? null,
      assetName: primary?.assetName ?? null,
    };
  }
  if (typeof node.assetName === "string" && node.assetName.length > 0) {
    const legacy: CandidateResult = { id: node.assetName, assetName: node.assetName, status: "success" };
    return { results: [legacy], primaryResultId: legacy.id, assetName: node.assetName };
  }
  return { results: [], primaryResultId: null, assetName: null };
}

export function primaryAssetName(node: ImageNodeResultsHost): string | null {
  return normalizeNodeResults(node).assetName;
}

export function summarizeResults(results: CandidateResult[]): { total: number; succeeded: number; failed: number } {
  const succeeded = results.filter((item) => item.status === "success").length;
  return { total: results.length, succeeded, failed: results.length - succeeded };
}

/** 节点角标文案：单张不显示；全成功 "N 张"，有失败 "3/4 · 1 张失败" */
export function badgeLabel(results: CandidateResult[]): string | null {
  if (results.length <= 1) {
    return null;
  }
  const { total, succeeded, failed } = summarizeResults(results);
  return failed === 0 ? `${total} 张` : `${succeeded}/${total} · ${failed} 张失败`;
}

export const FAN_POSITIONS = ["right", "right-bottom", "bottom"] as const;
export type FanPosition = (typeof FAN_POSITIONS)[number];

/** 扇出弧位分配：主图留在节点，其余候选（含失败槽）按 results 顺序依次填充 右→右下→下 */
export function fanOutSlots(
  results: CandidateResult[],
  primaryResultId: string | null | undefined,
): Array<{ slot: CandidateResult; position: FanPosition }> {
  return results
    .filter((item) => !(item.id === primaryResultId && item.status === "success"))
    .map((slot, index) => ({ slot, position: FAN_POSITIONS[Math.min(index, FAN_POSITIONS.length - 1)]! }));
}

/** 与服务端 BatchSlot 结构对齐，保持本模块无依赖 */
export type BatchSlotLike =
  | { status: "success"; asset: { name: string; localUrl?: string; bytes?: number } }
  | { status: "failed"; error: string };

export type GenerationOutcome =
  | { kind: "result"; generationId: string; slots: BatchSlotLike[]; retrySlotId: string | null; prompt: string }
  | { kind: "failure"; generationId: string; failureKind: "server" | "network"; message?: string };

export const UNCONFIRMED_RESULT_MESSAGE = "未确认生成结果，可能已生成，请手动重试";

export interface GenerationNodeData extends ImageNodeResultsHost {
  generationId?: string | null;
  appliedGenerationId?: string | null;
  prompt?: string;
  status?: string;
  errorMessage?: string | null;
}

export function resultsFromBatchSlots(
  slots: BatchSlotLike[],
  makeId: () => string,
): { results: CandidateResult[]; primaryResultId: string | null; assetName: string | null } {
  const results = slots.map((slot): CandidateResult =>
    slot.status === "success"
      ? { id: makeId(), assetName: slot.asset.name, status: "success" }
      : { id: makeId(), assetName: null, status: "failed", error: slot.error },
  );
  const primary = results.find((item) => item.status === "success") ?? null;
  return { results, primaryResultId: primary?.id ?? null, assetName: primary?.assetName ?? null };
}

export function applySlotRetryResult(
  results: CandidateResult[],
  slotId: string,
  slot: BatchSlotLike,
): CandidateResult[] {
  return results.map((item) => {
    if (item.id !== slotId) {
      return item;
    }
    if (slot.status === "success") {
      const { error: _error, ...rest } = item;
      return { ...rest, status: "success", assetName: slot.asset.name };
    }
    return { ...item, status: "failed", assetName: null, error: slot.error };
  });
}

/**
 * 把一次生成结局折算成节点 data 补丁；返回 null 表示忽略
 * （迟到的旧响应 generationId 不匹配，或同批次已落盘的重复派发）。
 */
export function applyGenerationOutcome(
  data: GenerationNodeData,
  outcome: GenerationOutcome,
  makeId: () => string,
): Record<string, unknown> | null {
  if (data.generationId !== outcome.generationId || data.appliedGenerationId === outcome.generationId) {
    return null;
  }
  if (outcome.kind === "failure") {
    return {
      status: "failed",
      errorMessage: outcome.failureKind === "network" ? UNCONFIRMED_RESULT_MESSAGE : (outcome.message ?? "生成失败"),
      appliedGenerationId: outcome.generationId,
      retryingSlotId: null,
    };
  }
  if (outcome.retrySlotId) {
    const slot = outcome.slots[0];
    if (!slot) {
      return null;
    }
    const results = applySlotRetryResult(Array.isArray(data.results) ? data.results : [], outcome.retrySlotId, slot);
    const currentPrimary = results.find(
      (item) => item.id === data.primaryResultId && item.status === "success",
    );
    const primaryResultId = currentPrimary
      ? currentPrimary.id
      : slot.status === "success"
        ? outcome.retrySlotId
        : null;
    const assetName = results.find((item) => item.id === primaryResultId)?.assetName ?? null;
    return {
      results,
      primaryResultId,
      assetName,
      status: "idle",
      errorMessage: null,
      appliedGenerationId: outcome.generationId,
      retryingSlotId: null,
    };
  }
  const { results, primaryResultId, assetName } = resultsFromBatchSlots(outcome.slots, makeId);
  const succeeded = results.some((item) => item.status === "success");
  return {
    results,
    primaryResultId,
    assetName,
    prompt: outcome.prompt,
    status: succeeded ? "idle" : "failed",
    errorMessage: succeeded ? null : `${results.length} 张全部生成失败`,
    appliedGenerationId: outcome.generationId,
    retryingSlotId: null,
  };
}

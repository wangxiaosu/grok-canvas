export type CanvasSaveStatus = { ok: true } | { ok: false; message: string };

export type CanvasSaveFailure =
  | { kind: "conflict" }
  | { kind: "network" }
  | { kind: "http"; status: number; message?: string };

export function canvasSaveErrorMessage(failure: CanvasSaveFailure): string {
  if (failure.kind === "conflict") {
    return "保存冲突：画布已被更新的版本占用，请刷新页面";
  }
  if (failure.kind === "network") {
    return "保存失败：网络错误";
  }
  return `保存失败：${failure.message ?? failure.status}`;
}

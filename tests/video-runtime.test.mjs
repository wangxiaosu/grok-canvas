import test from "node:test";
import assert from "node:assert/strict";
import {
  isVideoWatchStopStatus,
  videoNodePatchFromView,
} from "../lib/video-runtime.ts";

const view = (status, extra = {}) => ({
  taskId: "task-1",
  requestId: "req-1",
  canvasId: "canvas-1",
  nodeId: "node-1",
  status,
  waitedSeconds: 12,
  result: null,
  error: null,
  ...extra,
});

test("pending stays running and keeps waited seconds", () => {
  const patch = videoNodePatchFromView(view("pending"));
  assert.equal(patch.status, "running");
  assert.equal(patch.taskId, "task-1");
  assert.equal(patch.waitedSeconds, 12);
  assert.equal(patch.errorMessage, null);
  assert.equal(isVideoWatchStopStatus("pending"), false);
});

test("completed writes the local asset and clears errors", () => {
  const patch = videoNodePatchFromView(
    view("completed", { result: { assetName: "clip.mp4", localUrl: "/api/assets/clip.mp4", bytes: 8 } }),
  );
  assert.equal(patch.status, "idle");
  assert.equal(patch.assetName, "clip.mp4");
  assert.equal(patch.errorMessage, null);
  assert.equal(patch.errorKind, null);
  assert.equal(isVideoWatchStopStatus("completed"), true);
});

test("save_failed is a terminal UI failure that retries download, not generation", () => {
  const patch = videoNodePatchFromView(view("save_failed", { error: "视频保存失败：502" }));
  assert.equal(patch.status, "failed");
  assert.equal(patch.errorKind, "save_failed");
  assert.match(patch.errorMessage, /视频保存失败/);
  assert.equal(isVideoWatchStopStatus("save_failed"), true);
});

test("expired and upstream failed are terminal and keep distinct error kinds", () => {
  const expired = videoNodePatchFromView(view("expired", { error: "临时链接已过期，无法恢复" }));
  assert.equal(expired.status, "failed");
  assert.equal(expired.errorKind, "expired");
  const failed = videoNodePatchFromView(view("failed", { error: "上游生成失败（failed）" }));
  assert.equal(failed.errorKind, "server");
  assert.match(failed.errorMessage, /上游生成失败/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { canvasSaveErrorMessage } from "../lib/save-status.ts";

test("conflict and network keep a lasting, specific message", () => {
  assert.equal(
    canvasSaveErrorMessage({ kind: "conflict" }),
    "保存冲突：画布已被更新的版本占用，请刷新页面",
  );
  assert.equal(canvasSaveErrorMessage({ kind: "network" }), "保存失败：网络错误");
});

test("http failures prefer the server message, then the status code", () => {
  assert.equal(
    canvasSaveErrorMessage({ kind: "http", status: 500, message: "磁盘已满" }),
    "保存失败：磁盘已满",
  );
  assert.equal(canvasSaveErrorMessage({ kind: "http", status: 503 }), "保存失败：503");
});

import assert from "node:assert/strict";
import { test } from "node:test";

const {
  isGenerationCount,
  parseGenerationCount,
  normalizeNodeResults,
  primaryAssetName,
  summarizeResults,
  resultsFromBatchSlots,
  applySlotRetryResult,
  badgeLabel,
  fanOutSlots,
} = await import("../lib/multi-image.ts");

test("parseGenerationCount only accepts 1, 2, 4", () => {
  assert.equal(parseGenerationCount(1), 1);
  assert.equal(parseGenerationCount(2), 2);
  assert.equal(parseGenerationCount(4), 4);
  for (const value of [0, 3, 5, 2.5, "2", "4x", null, undefined, {}, [4], NaN]) {
    assert.equal(parseGenerationCount(value), 1);
    assert.equal(isGenerationCount(value), false);
  }
});

test("valid primaryResultId is kept and assetName syncs to the primary slot", () => {
  const node = {
    assetName: "stale.png",
    results: [
      { id: "a", assetName: "first.png", status: "success" },
      { id: "b", assetName: "second.png", status: "success" },
      { id: "c", assetName: null, status: "failed", error: "下载失败" },
    ],
    primaryResultId: "b",
  };
  assert.deepEqual(normalizeNodeResults(node), {
    results: node.results,
    primaryResultId: "b",
    assetName: "second.png",
  });
  assert.equal(primaryAssetName(node), "second.png");
});

test("invalid primaryResultId falls back to the first successful slot", () => {
  const results = [
    { id: "a", assetName: null, status: "failed", error: "上游未返回第 1 张图片" },
    { id: "b", assetName: "ok.png", status: "success" },
  ];
  for (const primaryResultId of ["missing", "a", null, undefined]) {
    const normalized = normalizeNodeResults({ results, primaryResultId });
    assert.equal(normalized.primaryResultId, "b");
    assert.equal(normalized.assetName, "ok.png");
  }
});

test("a batch without any successful slot has no primary and no assetName", () => {
  const results = [
    { id: "a", assetName: null, status: "failed", error: "x" },
    { id: "b", assetName: null, status: "failed", error: "y" },
  ];
  assert.deepEqual(normalizeNodeResults({ results, primaryResultId: "a", assetName: "stale.png" }), {
    results,
    primaryResultId: null,
    assetName: null,
  });
  assert.equal(primaryAssetName({ results: [] }), null);
});

test("legacy nodes without results expose assetName as the single successful candidate", () => {
  const normalized = normalizeNodeResults({ assetName: "old.png" });
  assert.deepEqual(normalized, {
    results: [{ id: "old.png", assetName: "old.png", status: "success" }],
    primaryResultId: "old.png",
    assetName: "old.png",
  });
  assert.equal(primaryAssetName({ assetName: "old.png" }), "old.png");
});

test("empty nodes normalize to an empty candidate list", () => {
  assert.deepEqual(normalizeNodeResults({}), { results: [], primaryResultId: null, assetName: null });
  assert.deepEqual(normalizeNodeResults({ assetName: null }), { results: [], primaryResultId: null, assetName: null });
  assert.equal(primaryAssetName({}), null);
});

test("summarizeResults counts outcomes", () => {
  assert.deepEqual(summarizeResults([
    { id: "a", assetName: "a.png", status: "success" },
    { id: "b", assetName: null, status: "failed", error: "x" },
    { id: "c", assetName: "c.png", status: "success" },
  ]), { total: 3, succeeded: 2, failed: 1 });
  assert.deepEqual(summarizeResults([]), { total: 0, succeeded: 0, failed: 0 });
});

test("resultsFromBatchSlots keeps order and picks the first success as primary", () => {
  let seq = 0;
  const makeId = () => `slot-${++seq}`;
  const { results, primaryResultId, assetName } = resultsFromBatchSlots([
    { status: "failed", error: "上游未返回第 1 张图片" },
    { status: "success", asset: { name: "b.png", localUrl: "/api/assets/b.png", bytes: 10 } },
    { status: "success", asset: { name: "c.png", localUrl: "/api/assets/c.png", bytes: 10 } },
  ], makeId);
  assert.deepEqual(results, [
    { id: "slot-1", assetName: null, status: "failed", error: "上游未返回第 1 张图片" },
    { id: "slot-2", assetName: "b.png", status: "success" },
    { id: "slot-3", assetName: "c.png", status: "success" },
  ]);
  assert.equal(primaryResultId, "slot-2");
  assert.equal(assetName, "b.png");
});

test("resultsFromBatchSlots keeps failed slots with errors when the whole batch fails", () => {
  let seq = 0;
  const { results, primaryResultId, assetName } = resultsFromBatchSlots([
    { status: "failed", error: "x" },
    { status: "failed", error: "y" },
  ], () => `s${++seq}`);
  assert.equal(results.length, 2);
  assert.equal(results[1].error, "y");
  assert.equal(primaryResultId, null);
  assert.equal(assetName, null);
});

test("applySlotRetryResult updates only the target slot and keeps its id", () => {
  const results = [
    { id: "a", assetName: "a.png", status: "success" },
    { id: "b", assetName: null, status: "failed", error: "旧错误" },
  ];
  const succeeded = applySlotRetryResult(results, "b", { status: "success", asset: { name: "b2.png" } });
  assert.equal(succeeded[0], results[0]);
  assert.deepEqual(succeeded[1], { id: "b", assetName: "b2.png", status: "success" });
  const failedAgain = applySlotRetryResult(succeeded, "b", { status: "failed", error: "新错误" });
  assert.deepEqual(failedAgain[1], { id: "b", assetName: null, status: "failed", error: "新错误" });
  assert.deepEqual(applySlotRetryResult(results, "missing", { status: "failed", error: "x" }), results);
});

test("badgeLabel hides single-slot nodes and summarizes multi-slot batches", () => {
  assert.equal(badgeLabel([]), null);
  assert.equal(badgeLabel([{ id: "a", assetName: "a.png", status: "success" }]), null);
  assert.equal(badgeLabel([{ id: "a", assetName: null, status: "failed", error: "x" }]), null);
  assert.equal(badgeLabel([
    { id: "a", assetName: "a.png", status: "success" },
    { id: "b", assetName: "b.png", status: "success" },
  ]), "2 张");
  assert.equal(badgeLabel([
    { id: "a", assetName: "a.png", status: "success" },
    { id: "b", assetName: "b.png", status: "success" },
    { id: "c", assetName: "c.png", status: "success" },
    { id: "d", assetName: null, status: "failed", error: "x" },
  ]), "3/4 · 1 张失败");
  assert.equal(badgeLabel([
    { id: "a", assetName: null, status: "failed", error: "x" },
    { id: "b", assetName: null, status: "failed", error: "y" },
  ]), "0/2 · 2 张失败");
});

test("fanOutSlots keeps the primary on the node and fills arc positions in order", () => {
  const results = [
    { id: "a", assetName: "a.png", status: "success" },
    { id: "b", assetName: "b.png", status: "success" },
    { id: "c", assetName: "c.png", status: "success" },
    { id: "d", assetName: null, status: "failed", error: "x" },
  ];
  assert.deepEqual(fanOutSlots(results, "a").map((item) => [item.slot.id, item.position]), [
    ["b", "right"],
    ["c", "right-bottom"],
    ["d", "bottom"],
  ]);
  // 2 张候选：非主图 1 张扇出到右
  assert.deepEqual(fanOutSlots(results.slice(0, 2), "a").map((item) => [item.slot.id, item.position]), [
    ["b", "right"],
  ]);
  // 失败槽同样占弧位，位置不压缩
  assert.deepEqual(fanOutSlots([results[0], results[3]], "a").map((item) => [item.slot.id, item.position]), [
    ["d", "right"],
  ]);
  // 无主图（全失败）：所有槽按顺序占位
  assert.deepEqual(fanOutSlots([results[3], results[0]], null).map((item) => [item.slot.id, item.position]), [
    ["d", "right"],
    ["a", "right-bottom"],
  ]);
  // 主图引用失败槽时不过滤（失败槽不算主图）
  assert.deepEqual(fanOutSlots(results.slice(0, 2), "x").map((item) => item.slot.id), ["a", "b"]);
  assert.deepEqual(fanOutSlots([], null), []);
});

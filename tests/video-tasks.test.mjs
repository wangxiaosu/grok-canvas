import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Transpile like tests/generation-batch.test.mjs.
const temporary = await mkdtemp(path.join(os.tmpdir(), "grok-video-tasks-"));
after(() => rm(temporary, { recursive: true, force: true }));
await writeFile(path.join(temporary, "package.json"), '{"type":"module"}');
for (const name of ["data-dir", "video-tasks"]) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(temporary, `${name}.js`), output.replace(/from "(\.\/[^".]+)"/g, 'from "$1.js"'));
}

// The store resolves data paths at import time. Tests never touch the user's data.
process.env.GROK_CANVAS_DATA_DIR = temporary;
const {
  VIDEO_TASKS_DIR,
  createVideoTask,
  isTerminalVideoTask,
  listVideoTasks,
  readVideoTask,
  recoverableVideoTasks,
  updateVideoTask,
} = await import(pathToFileURL(path.join(temporary, "video-tasks.js")).href);

const snapshot = () => ({
  model: "grok-imagine-video-1.5",
  mode: "i2v",
  prompt: "[[image:fox.png]] 跑向湖边",
  compiledPrompt: "<IMAGE_0> 跑向湖边",
  firstFrame: null,
  lastFrame: null,
  references: ["fox.png"],
  parameters: { duration: 10, aspectRatio: "16:9", resolution: "720p", audio: true },
});

test("a created task persists as pending with its frozen snapshot", async () => {
  const record = await createVideoTask("req-1", "canvas-1", "node-1", snapshot());
  assert.equal(record.status, "pending");
  const loaded = await readVideoTask(record.taskId);
  assert.equal(loaded.requestId, "req-1");
  assert.equal(loaded.canvasId, "canvas-1");
  assert.equal(loaded.nodeId, "node-1");
  assert.equal(loaded.snapshot.compiledPrompt, "<IMAGE_0> 跑向湖边");
  assert.deepEqual(loaded.snapshot.references, ["fox.png"]);
  assert.equal(isTerminalVideoTask(loaded), false);
});

test("status updates persist and bump updatedAt", async () => {
  const record = await createVideoTask("req-2", "canvas-1", "node-2", snapshot());
  const done = await updateVideoTask(record.taskId, {
    status: "completed",
    remoteUrl: "https://imgen.x.ai/tmp.mp4",
    result: { assetName: "v.mp4", localUrl: "/api/assets/v.mp4", bytes: 123 },
  });
  assert.equal(done.status, "completed");
  assert.ok(done.updatedAt >= record.updatedAt);
  const loaded = await readVideoTask(record.taskId);
  assert.equal(loaded.result.assetName, "v.mp4");
  assert.equal(isTerminalVideoTask(loaded), true);
});

test("save_failed keeps the remote URL for download retry without resubmitting", async () => {
  const record = await createVideoTask("req-3", "canvas-1", "node-3", snapshot());
  await updateVideoTask(record.taskId, {
    status: "save_failed",
    remoteUrl: "https://imgen.x.ai/tmp.mp4",
    error: "图片保存失败：download 502",
  });
  const recoverable = await recoverableVideoTasks();
  const found = recoverable.find((task) => task.taskId === record.taskId);
  assert.equal(found.status, "save_failed");
  assert.equal(found.remoteUrl, "https://imgen.x.ai/tmp.mp4");
  assert.equal(found.requestId, "req-3");
});

test("recoverable tasks are pending or save_failed; terminal tasks are excluded", async () => {
  const pending = await createVideoTask("req-4", "canvas-1", "node-4", snapshot());
  const failed = await createVideoTask("req-5", "canvas-1", "node-5", snapshot());
  await updateVideoTask(failed.taskId, { status: "failed", error: "upstream rejected" });
  const expired = await createVideoTask("req-6", "canvas-1", "node-6", snapshot());
  await updateVideoTask(expired.taskId, { status: "expired", error: "临时链接已过期" });
  const ids = (await recoverableVideoTasks()).map((task) => task.taskId);
  assert.ok(ids.includes(pending.taskId));
  assert.ok(!ids.includes(failed.taskId));
  assert.ok(!ids.includes(expired.taskId));
});

test("listing returns all records ordered by creation; missing ids read as null", async () => {
  const all = await listVideoTasks();
  assert.equal(all.length, 6);
  for (let index = 1; index < all.length; index += 1) {
    assert.ok(all[index - 1].createdAt <= all[index].createdAt);
  }
  assert.equal(await readVideoTask("no-such-task"), null);
  await assert.rejects(updateVideoTask("no-such-task", { status: "failed" }), /视频任务不存在/);
});

test("unsafe task ids are rejected", async () => {
  await assert.rejects(readVideoTask("../app-state"), /unsafe task id/);
});

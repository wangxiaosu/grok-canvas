import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Transpile like tests/generation-batch.test.mjs.
const temporary = await mkdtemp(path.join(os.tmpdir(), "grok-video-request-"));
after(() => rm(temporary, { recursive: true, force: true }));
await writeFile(path.join(temporary, "package.json"), '{"type":"module"}');
for (const name of ["prompt-references", "video-references", "video-request"]) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(path.join(temporary, `${name}.js`), output.replace(/from "(\.\/[^".]+)"/g, 'from "$1.js"'));
}

const { VIDEO_MODEL, buildVideoRequest, clampVideoParameters, followsFirstFrame, maxVideoResolution } = await import(
  pathToFileURL(path.join(temporary, "video-request.js")).href
);

const ref = (assetName) => ({ assetName, role: "reference" });
const params = (overrides = {}) => ({ duration: 10, aspectRatio: "16:9", resolution: "720p", audio: true, ...overrides });

test("text-to-video: no inputs, fixed model, compiled prompt equals prompt", () => {
  const plan = buildVideoRequest("一只纸船漂过湖面", [], params());
  assert.equal(plan.model, VIDEO_MODEL);
  assert.equal(plan.mode, "t2v");
  assert.equal(plan.compiledPrompt, "一只纸船漂过湖面");
  assert.equal(plan.firstFrame, null);
  assert.deepEqual(plan.references, []);
  assert.equal(plan.parameters.aspectRatio, "16:9");
});

test("an empty prompt is rejected even for text-to-video", () => {
  assert.throws(() => buildVideoRequest("   ", [], params()), /提示词不能为空/);
});

test("a single first frame follows the frame and must omit aspect_ratio", () => {
  const inputs = [{ assetName: "city.png", role: "first" }];
  assert.equal(followsFirstFrame(inputs), true);
  const plan = buildVideoRequest("镜头缓慢推进", inputs, params({ aspectRatio: null }));
  assert.equal(plan.mode, "i2v");
  assert.equal(plan.firstFrame, "city.png");
  assert.equal(plan.parameters.aspectRatio, null);
  assert.throws(() => buildVideoRequest("镜头缓慢推进", inputs, params()), /跟随首帧/);
});

test("any other input combination requires an explicit aspect ratio", () => {
  const withRef = [{ assetName: "city.png", role: "first" }, ref("fox.png")];
  assert.equal(followsFirstFrame(withRef), false);
  assert.throws(() => buildVideoRequest("组合", withRef, params({ aspectRatio: null })), /请选择视频比例/);
  assert.throws(() => buildVideoRequest("纯参考", [ref("fox.png")], params({ aspectRatio: null })), /请选择视频比例/);
});

test("reference or last-frame inputs cap resolution at 720p; first frame alone allows 1080p", () => {
  assert.equal(maxVideoResolution([{ assetName: "a.png", role: "first" }]), "1080p");
  assert.equal(maxVideoResolution([ref("a.png")]), "720p");
  assert.equal(maxVideoResolution([{ assetName: "a.png", role: "last" }]), "720p");
  assert.equal(maxVideoResolution([]), "1080p");

  const firstOnly = [{ assetName: "a.png", role: "first" }];
  assert.equal(buildVideoRequest("推进", firstOnly, params({ aspectRatio: null, resolution: "1080p" })).parameters.resolution, "1080p");
  assert.throws(() => buildVideoRequest("组合", [ref("a.png")], params({ resolution: "1080p" })), /最高支持 720p/);
  assert.throws(
    () => buildVideoRequest("组合", [{ assetName: "a.png", role: "last" }], params({ resolution: "1080p" })),
    /最高支持 720p/,
  );
});

test("clampVideoParameters follows the first frame and caps 1080p for refs or last frames", () => {
  const firstOnly = [{ assetName: "a.png", role: "first" }];
  assert.equal(clampVideoParameters(firstOnly, params()).aspectRatio, null);
  assert.equal(clampVideoParameters(firstOnly, params({ resolution: "1080p" })).resolution, "1080p");
  assert.equal(clampVideoParameters([ref("a.png")], params({ resolution: "1080p" })).resolution, "720p");
  assert.equal(clampVideoParameters([{ assetName: "a.png", role: "last" }], params({ resolution: "1080p" })).resolution, "720p");
  assert.equal(clampVideoParameters([], params({ resolution: "1080p" })).resolution, "1080p");
  assert.equal(clampVideoParameters([], params()).aspectRatio, "16:9");
  assert.equal(clampVideoParameters([], params({ aspectRatio: null })).aspectRatio, "16:9");
});

test("duration, ratio and resolution are validated against the v1 sets", () => {
  assert.throws(() => buildVideoRequest("p", [], params({ duration: 7 })), /时长只支持/);
  assert.throws(() => buildVideoRequest("p", [], params({ aspectRatio: "21:9" })), /比例只支持/);
  assert.throws(() => buildVideoRequest("p", [], params({ resolution: "4k" })), /分辨率只支持/);
  assert.equal(buildVideoRequest("p", [], params({ duration: 15 })).parameters.duration, 15);
  assert.equal(buildVideoRequest("p", [], params({ audio: false })).parameters.audio, false);
});

test("@ tokens compile to <IMAGE_n> in the submitted prompt; stale tokens block the request", () => {
  const inputs = [{ assetName: "city.png", role: "first" }, ref("fox.png"), ref("dog.png")];
  const plan = buildVideoRequest("[[image:fox.png]] 跑向 [[image:dog.png]]", inputs, params());
  assert.equal(plan.prompt, "[[image:fox.png]] 跑向 [[image:dog.png]]");
  assert.equal(plan.compiledPrompt, "<IMAGE_1> 跑向 <IMAGE_2>");
  assert.deepEqual(plan.references, ["fox.png", "dog.png"]);
  assert.throws(() => buildVideoRequest("[[image:gone.png]] 跑", inputs, params()), /已不在参考区/);
});

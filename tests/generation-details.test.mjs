import test from 'node:test';
import assert from 'node:assert/strict';
import { generationRows, displayGenerationPrompt } from '../lib/generation-details.ts';
test('legacy history does not invent generation parameters', () => {
  assert.deepEqual(generationRows({ originalPrompt: '九宫格', referenceAssets: [] }), []);
});
test('known quality labels and missing fields', () => {
  assert.deepEqual(generationRows({ referenceAssets: [], parameters: { quality: 'low', resolution: '2k' } }), [['分辨率', '2K'], ['画质', '标准']]);
  assert.deepEqual(generationRows({ referenceAssets: [], parameters: { quality: 'medium' } }), [['画质', '增强']]);
  assert.deepEqual(generationRows({ referenceAssets: [], parameters: { quality: 'unknown' } }), []);
});
test('references remain readable without canvas nodes', () => {
  assert.equal(displayGenerationPrompt({ originalPrompt: '给[[image:abc.jpeg]]换背景', referenceAssets: ['abc.jpeg'] }), '给参考图 1换背景');
});

test('unspecified upstream ratio means auto, absent legacy ratio stays hidden', () => {
  assert.deepEqual(generationRows({ referenceAssets: [], parameters: { aspectRatio: null } }), [['比例', '自动']]);
  assert.deepEqual(generationRows({ referenceAssets: [], parameters: { aspectRatio: 'auto' } }), [['比例', '自动']]);
  assert.deepEqual(generationRows({ referenceAssets: [], parameters: { aspectRatio: '2:3' } }), [['比例', '2:3']]);
  assert.deepEqual(generationRows({ referenceAssets: [], parameters: {} }), []);
});

test('video rows show duration, audio and follow-first-frame ratio', () => {
  assert.deepEqual(
    generationRows({ referenceAssets: [], parameters: { duration: 10, aspectRatio: '16:9', resolution: '720p', audio: true } }),
    [['时长', '10 秒'], ['比例', '16:9'], ['分辨率', '720P'], ['声音', '开']],
  );
  assert.deepEqual(
    generationRows({ referenceAssets: [], parameters: { duration: 15, aspectRatio: null, resolution: '1080p', audio: false } }),
    [['时长', '15 秒'], ['比例', '跟随首帧'], ['分辨率', '1080P'], ['声音', '关']],
  );
});

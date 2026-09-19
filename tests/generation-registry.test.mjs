import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerCanvas,
  unregisterCanvas,
  dispatchOutcome,
  markPending,
  clearPending,
  isPending,
  hasPendingFrom,
  pendingFor,
  stashOrphan,
  takeOrphan,
} from '../components/canvas/generation-registry.ts';
import { applyGenerationOutcome, UNCONFIRMED_RESULT_MESSAGE } from '../lib/multi-image.ts';

const successSlot = { status: 'success', asset: { name: 'a.png' } };
const batchOutcome = (generationId) => ({
  kind: 'result',
  generationId,
  slots: [successSlot],
  retrySlotId: null,
  prompt: 'p',
});

test('outcomes target the placeholder after switching canvases', () => {
  const events = [];
  const old = { applyOutcome: () => assert.fail('unmounted handler') };
  const current = { applyOutcome: (nodeId, outcome) => events.push([nodeId, outcome.kind]) };
  registerCanvas('test', old);
  markPending('test', 'placeholder');
  unregisterCanvas('test', old);
  assert.equal(dispatchOutcome('test', 'placeholder', batchOutcome('g1')), false);
  registerCanvas('test', current);
  assert.equal(isPending('test', 'placeholder'), true);
  assert.equal(dispatchOutcome('test', 'placeholder', batchOutcome('g1')), true);
  assert.equal(dispatchOutcome('test', 'placeholder', { kind: 'failure', generationId: 'g1', failureKind: 'server', message: 'x' }), true);
  assert.deepEqual(events, [['placeholder', 'result'], ['placeholder', 'failure']]);
  clearPending('test', 'placeholder');
  assert.equal(isPending('test', 'placeholder'), false);
  unregisterCanvas('test', current);
});

test('hasPendingFrom locks concurrent submissions from the same source', () => {
  markPending('c1', 'result-node', 'source-node');
  assert.equal(hasPendingFrom('c1', 'source-node'), true);
  assert.equal(hasPendingFrom('c1', 'other'), false);
  assert.equal(hasPendingFrom('other-canvas', 'source-node'), false);
  clearPending('c1', 'result-node');
  assert.equal(hasPendingFrom('c1', 'source-node'), false);
  assert.deepEqual(pendingFor('c1'), []);
});

test('markPending without source does not count as pending from any node', () => {
  markPending('c2', 'n1');
  assert.equal(hasPendingFrom('c2', 'n1'), false);
  assert.equal(isPending('c2', 'n1'), true);
  clearPending('c2', 'n1');
});

test('late responses with a stale generationId are ignored, duplicates are not applied twice', () => {
  const data = { generationId: 'new', appliedGenerationId: 'new' };
  assert.equal(applyGenerationOutcome(data, batchOutcome('old'), () => 'id'), null);
  assert.equal(applyGenerationOutcome(data, batchOutcome('new'), () => 'id'), null);
  const fresh = { generationId: 'new', appliedGenerationId: null };
  assert.notEqual(applyGenerationOutcome(fresh, batchOutcome('new'), () => 'id'), null);
});

test('network failures are marked as unconfirmed, distinct from server failures', () => {
  const data = { generationId: 'g', appliedGenerationId: null };
  const network = applyGenerationOutcome(data, { kind: 'failure', generationId: 'g', failureKind: 'network' }, () => 'id');
  assert.equal(network.status, 'failed');
  assert.equal(network.errorMessage, UNCONFIRMED_RESULT_MESSAGE);
  const server = applyGenerationOutcome(data, { kind: 'failure', generationId: 'g', failureKind: 'server', message: '上游错误' }, () => 'id');
  assert.equal(server.errorMessage, '上游错误');
});

test('orphan outcomes are stashed per canvas:node and consumed on take', () => {
  stashOrphan('c1', 'deleted-node', batchOutcome('g1'));
  stashOrphan('c1', 'deleted-node', { kind: 'failure', generationId: 'g2', failureKind: 'network' });
  assert.equal(takeOrphan('other', 'deleted-node'), undefined);
  const outcome = takeOrphan('c1', 'deleted-node');
  assert.equal(outcome.generationId, 'g2');
  assert.equal(takeOrphan('c1', 'deleted-node'), undefined);
});

test('orphan write-back restores the deleted node outcome', () => {
  stashOrphan('c1', 'n1', batchOutcome('g1'));
  const restoredNode = { data: { status: 'running', generationId: 'g1', appliedGenerationId: null } };
  const orphan = takeOrphan('c1', 'n1');
  const patch = applyGenerationOutcome(restoredNode.data, orphan, () => 'slot-1');
  assert.equal(patch.status, 'idle');
  assert.equal(patch.assetName, 'a.png');
  assert.deepEqual(patch.results, [{ id: 'slot-1', assetName: 'a.png', status: 'success' }]);
  // 节点已发起更新任务时，orphan 里的旧结局被 generationId 校验丢弃
  stashOrphan('c1', 'n2', batchOutcome('g-old'));
  const newer = takeOrphan('c1', 'n2');
  assert.equal(applyGenerationOutcome({ generationId: 'g-new', appliedGenerationId: null }, newer, () => 'x'), null);
});

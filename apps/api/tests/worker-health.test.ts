import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWorkerStatus } from '../src/services/worker-health';

test('worker connected to the queue is online even with no active jobs', async () => {
  assert.equal(await checkWorkerStatus({ getWorkers: async () => [{ id: 'worker', idle: '60' }] }), 'online');
});

test('no workers connected means offline', async () => {
  assert.equal(await checkWorkerStatus({ getWorkers: async () => [] }), 'offline');
});

test('failed inspection reports degraded rather than claiming the worker is offline', async () => {
  assert.equal(await checkWorkerStatus({ getWorkers: async () => { throw new Error('Redis unavailable'); } }), 'degraded');
});

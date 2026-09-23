import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRequestRoutes } from '../src/routes/requests';
import { getRequestService } from '../src/services/requests';
import { getReceptionDestinationService } from '../src/services/reception-destinations';

test('reception endpoint preserves raw JSON and supports existing payload envelopes', async (t) => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  t.after(() => {
    for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
  const sourceId = '9e5694d2-d9d6-4087-b9fb-dd6aecd66eae';
  const mapping = t.mock.method(getReceptionDestinationService(), 'getDestinationForReception', async () => 'mapped-destination');
  const enqueue = t.mock.method(getRequestService(), 'createAndEnqueueRequest', async () => ({
    requestId: 'test-request', status: 'queued', createdAt: '2026-01-01',
  }));
  const app = Fastify();
  t.after(() => app.close());
  await registerRequestRoutes(app);
  const sale = { id_venda: 'VEN-0001', produto: 'Tetra Club', valor: 1497 };
  for (const body of [sale, [sale], {}, false, 0, { ...sale, method: 'business-field', destination_id: 'business-field' }]) {
    const response = await app.inject({ method: 'POST', url: `/v1/requests/${sourceId}`,
      headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) });
    assert.equal(response.statusCode, 202);
    assert.deepEqual(enqueue.mock.calls.at(-1)?.arguments, [
      sourceId, 'mapped-destination', body, undefined, undefined, 'application/json', undefined,
    ]);
  }
  const envelope = { payload: sale, destination_id: 'explicit-destination', method: 'PUT',
    headers: { 'x-custom': 'value' }, content_type: 'application/json', idempotency_key: 'sale-1' };
  const response = await app.inject({ method: 'POST', url: `/v1/requests/${sourceId}`, payload: envelope });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(enqueue.mock.calls.at(-1)?.arguments, [sourceId, envelope.destination_id,
    sale, envelope.headers, envelope.method, envelope.content_type, envelope.idempotency_key]);
  mapping.mock.mockImplementation(async () => null);
  const missing = await app.inject({ method: 'POST', url: `/v1/requests/${sourceId}`, payload: sale });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().error.code, 'MISSING_DESTINATION');
  assert.equal(enqueue.mock.callCount(), 7);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerApiKeyRoutes } from '../src/routes/api-keys';
import { getAuthService } from '../src/services/auth';
import { getReceptionDestinationService } from '../src/services/reception-destinations';

test('creates an additional key for the selected reception without revoking existing keys', async (t) => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  t.after(() => {
    for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const auth = getAuthService();
  const reception = getReceptionDestinationService();
  t.mock.method(reception, 'getSourceName', async (id: string) => id === sourceId ? 'Reception' : null);
  const generate = t.mock.method(auth, 'generateApiKey', async (name: string, id: string) => {
    assert.equal(name, 'Integration');
    assert.equal(id, sourceId);
    return { id: 'new-key-id', key: 'rmgr_test', createdAt: '2026-01-01' };
  });
  const revoke = t.mock.method(auth, 'revokeApiKey', async () => {});
  const app = Fastify();
  t.after(() => app.close());
  await registerApiKeyRoutes(app);
  const response = await app.inject({ method: 'POST', url: '/admin/api-keys', payload: { name: 'Integration', sourceId } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().data.key, 'rmgr_test');
  assert.equal(response.json().data.sourceId, sourceId);
  assert.equal(revoke.mock.callCount(), 0);
  for (const payload of [
    { name: 'Integration', sourceId: 'invalid' },
    { name: 'Integration', sourceId: '22222222-2222-4222-8222-222222222222' },
    { name: '', sourceId },
  ]) {
    const invalid = await app.inject({ method: 'POST', url: '/admin/api-keys', payload });
    assert.equal(invalid.statusCode, 400);
  }
  assert.equal(generate.mock.callCount(), 1);
});

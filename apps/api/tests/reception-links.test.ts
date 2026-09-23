import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSourceRoutes } from '../src/routes/sources';
import { registerReceptionDestinationRoutes } from '../src/routes/reception-destinations';
import { getReceptionDestinationService } from '../src/services/reception-destinations';

test('reception links use the source ID while revocation keeps the API key ID', async (t) => {
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const keyId = '22222222-2222-4222-8222-222222222222';
  const destinationId = '33333333-3333-4333-8333-333333333333';
  const saved = { ...process.env };
  process.env.SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  t.after(() => {
    for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  let mapping: Record<string, unknown> | undefined;
  let revoked = false;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const table = url.pathname.split('/').pop();
    const json = (value: unknown) => new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (table === 'api_keys' && init?.method === 'PATCH') {
      assert.equal(url.searchParams.get('id'), `eq.${keyId}`);
      revoked = true;
      return new Response(null, { status: 204 });
    }
    if (table === 'api_keys') {
      assert.ok(url.searchParams.get('select')?.split(',').includes('source_id'));
      return json([{ id: keyId, source_id: sourceId, name: 'Reception', created_at: '2026-01-01' }]);
    }
    if (table === 'reception_destinations' && init?.method === 'POST') {
      mapping = JSON.parse(String(init.body));
      assert.equal(mapping?.source_id, sourceId);
      assert.equal(mapping?.destination_id, destinationId);
      assert.equal(url.searchParams.get('on_conflict'), 'source_id');
      return new Response(null, { status: 201 });
    }
    if (table === 'reception_destinations') {
      if (url.searchParams.has('source_id')) assert.equal(url.searchParams.get('source_id'), `eq.${sourceId}`);
      return json(mapping ? [{ id: 'mapping-id', ...mapping, created_at: '2026-01-01' }] : []);
    }
    if (table === 'sources') {
      assert.equal(url.searchParams.get('id'), `eq.${sourceId}`);
      return json([{ name: 'Reception' }]);
    }
    if (table === 'destinations') return json({ id: destinationId, name: 'Destination' });
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

  const app = Fastify();
  t.after(() => app.close());
  await registerSourceRoutes(app);
  await registerReceptionDestinationRoutes(app);
  const sources = await app.inject({ method: 'GET', url: '/admin/sources' });
  assert.equal(sources.statusCode, 200);
  const reception = sources.json().data[0];
  assert.equal(reception.id, keyId);
  assert.equal(reception.sourceId, sourceId);
  const created = await app.inject({
    method: 'POST', url: '/admin/reception-destinations',
    payload: { sourceId: reception.sourceId, destinationId },
  });
  assert.equal(created.statusCode, 201);
  const links = await app.inject({ method: 'GET', url: '/admin/reception-destinations' });
  assert.equal(links.statusCode, 200);
  assert.equal(links.json().data[0].sourceName, 'Reception');
  assert.equal(await getReceptionDestinationService().getDestinationForReception(sourceId), destinationId);
  const removed = await app.inject({ method: 'DELETE', url: `/admin/sources/${reception.id}` });
  assert.equal(removed.statusCode, 204);
  assert.equal(revoked, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyJWT, authenticateJWT } from '../src/middleware/jwt-auth';

test('Supabase JWT validation and admin authorization', async (t) => {
  const ec = await generateKeyPair('ES256');
  const rsa = await generateKeyPair('RS256');
  const keys = [
    { ...await exportJWK(ec.publicKey), kid: 'ec', alg: 'ES256' },
    { ...await exportJWK(rsa.publicKey), kid: 'rsa', alg: 'RS256' },
  ];
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const saved = { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_JWT_SECRET, admin: process.env.ADMIN_USER_ID };
  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_JWT_SECRET = 'test-only-secret-with-at-least-32-bytes';
  process.env.ADMIN_USER_ID = 'admin-user';
  t.after(() => {
    server.close();
    for (const [key, value] of Object.entries({ SUPABASE_URL: saved.url, SUPABASE_JWT_SECRET: saved.secret, ADMIN_USER_ID: saved.admin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const issuer = `${process.env.SUPABASE_URL}/auth/v1`;
  const sign = (alg = 'ES256', overrides: Record<string, unknown> = {}) => new SignJWT({
    sub: 'admin-user', email: 'admin@example.test', aud: 'authenticated', iss: issuer,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60, ...overrides,
  }).setProtectedHeader({ alg, kid: alg === 'RS256' ? 'rsa' : 'ec' }).sign(
    alg === 'HS256' ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET) : alg === 'RS256' ? rsa.privateKey : ec.privateKey
  );
  for (const alg of ['ES256', 'RS256', 'HS256']) {
    await t.test(`accepts ${alg}`, async () => assert.equal((await verifyJWT(await sign(alg))).sub, 'admin-user'));
  }
  for (const [name, claims] of Object.entries({ expired: { exp: 1 }, issuer: { iss: 'https://wrong.example/auth/v1' }, audience: { aud: 'anon' }, subject: { sub: '' }, expiration: { exp: undefined } })) {
    await t.test(`rejects invalid ${name}`, async () => assert.rejects(verifyJWT(await sign('ES256', claims)), /Invalid or expired token/));
  }
  await t.test('rejects malformed token', async () => assert.rejects(verifyJWT('invalid'), /Invalid or expired token/));
  await t.test('rejects wrong signature', async () => {
    const other = await generateKeyPair('ES256');
    const token = await new SignJWT({ sub: 'admin-user' }).setProtectedHeader({ alg: 'ES256', kid: 'ec' }).sign(other.privateKey);
    await assert.rejects(verifyJWT(token), /Invalid or expired token/);
  });
  await t.test('rejects authenticated non-admin with 403', async () => {
    let status = 0;
    const reply = { code(value: number) { status = value; return this; }, send() {} };
    await authenticateJWT({ headers: { authorization: `Bearer ${await sign('ES256', { sub: 'other-user' })}` } } as any, reply as any);
    assert.equal(status, 403);
  });
});

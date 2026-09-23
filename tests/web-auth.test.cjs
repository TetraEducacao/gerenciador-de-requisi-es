const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => mocks[name], process: { env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test',
  } }, console, setTimeout, clearTimeout, AbortController, ...globals });
  return exports;
}

test('concurrent API 401s clear the session before a single login redirect', async () => {
  let session = { access_token: 'rejected' };
  let signouts = 0;
  const redirects = [];
  const window = { location: { replace(url) { assert.equal(session, null); redirects.push(url); } } };
  const auth = load('apps/web/src/lib/supabase.ts', { '@supabase/supabase-js': {
    createClient: () => ({ auth: {
      getSession: async () => ({ data: { session } }),
      signOut: async options => {
        assert.equal(options.scope, 'local');
        signouts++;
        await new Promise(resolve => setTimeout(resolve, 5));
        session = null;
        return { error: null };
      },
    } }),
  } }, { window });
  const api = load('apps/web/src/lib/api.ts', { './supabase': auth }, {
    window, fetch: async () => ({ status: 401 }),
  });
  const results = await Promise.allSettled([api.getDashboardMetrics(), api.getRecentActivity(), api.getHealth()]);
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.status === 401));
  assert.equal(signouts, 1);
  assert.deepEqual(redirects, ['/login?reason=session-expired']);
  assert.equal(await auth.getSession(), null);
});

test('204 responses succeed without parsing JSON', async () => {
  const api = load('apps/web/src/lib/api.ts', {}, { fetch: async () => ({ status: 204, ok: true, json() { throw Error('empty body'); } }) });
  await api.deleteDestination('test');
});

test('403 does not redirect or sign out', async () => {
  const api = load('apps/web/src/lib/api.ts', {}, { fetch: async () => ({ status: 403 }) });
  await assert.rejects(api.getDashboardMetrics(), error => error.status === 403);
});

test('health reports API offline when fetch fails', async () => {
  const api = load('apps/web/src/lib/api.ts', {}, { fetch: async () => { throw Error('offline'); } });
  assert.equal((await api.getHealth()).api, 'offline');
});

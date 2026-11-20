// בדיקות יחידה לשרת האישי (server/worker.js), בלי רשת: Azure מדומה.
// הרצה: node tests/worker_test.mjs
import worker from '../server/worker.js';

const results = [];
const ok = (name, cond, extra = '') => { results.push([name, !!cond]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };

const env = { ACCESS_CODE: 'my-secret-code-123', AZURE_KEY: 'azure-key', AZURE_REGION: 'westeurope' };
const ORIGIN = 'https://menim5050-byte.github.io';
let lastAzure = null;
let azureMode = 'ok';
globalThis.fetch = async (url, init) => {
  lastAzure = { url: String(url), init };
  if (azureMode === '401') return new Response('{"error":{"code":401000}}', { status: 401 });
  if (azureMode === '429') return new Response('{"error":{"code":429001}}', { status: 429 });
  const body = JSON.parse(init.body);
  const u = new URL(String(url));
  const out = [{ translations: [{ text: `AZ(${u.searchParams.get('to')}):${body[0].Text}`, to: u.searchParams.get('to') }] }];
  if (!u.searchParams.get('from')) out[0].detectedLanguage = { language: 'ro', score: 1 };
  return new Response(JSON.stringify(out), { status: 200 });
};

const req = (path, { method = 'POST', code = env.ACCESS_CODE, body, origin = ORIGIN } = {}) =>
  worker.fetch(new Request('https://tvt.example.workers.dev' + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(code ? { 'X-Access-Code': code } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }), env);

let r = await req('/translate', { method: 'OPTIONS', code: null });
ok('CORS preflight allowed for the app', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === ORIGIN && /X-Access-Code/.test(r.headers.get('Access-Control-Allow-Headers')));

r = await req('/health', { method: 'GET' });
let d = await r.json();
ok('health with code', r.status === 200 && d.ok && d.translator);
r = await req('/health', { method: 'GET', code: 'wrong-code-xyz' });
ok('health with wrong code -> 401', r.status === 401);

r = await req('/translate', { body: { text: 'שלום', from: 'he', to: 'ro' } });
d = await r.json();
ok('translate he->ro via Azure', r.status === 200 && d.text === 'AZ(ro):שלום' && d.provider === 'azure');
ok('Azure called with key, region, from/to', lastAzure.init.headers['Ocp-Apim-Subscription-Key'] === 'azure-key' && lastAzure.init.headers['Ocp-Apim-Subscription-Region'] === 'westeurope' && /from=he/.test(lastAzure.url) && /to=ro/.test(lastAzure.url));

r = await req('/translate', { body: { text: 'Bună ziua', from: 'auto', to: 'he' } });
d = await r.json();
ok('auto-detect source', d.ok && !/from=/.test(lastAzure.url) && d.detected === 'ro');

r = await req('/translate', { body: { text: '你好', from: 'zh', to: 'pt' } });
ok('language code mapping (zh-Hans, pt-pt)', /from=zh-Hans/.test(lastAzure.url) && /to=pt-pt/.test(lastAzure.url));

r = await req('/translate', { code: 'wrong-code-xyz', body: { text: 'x', from: 'he', to: 'en' } });
ok('wrong code -> 401, Azure not called', r.status === 401);
r = await req('/translate', { code: null, body: { text: 'x', from: 'he', to: 'en' } });
ok('missing code -> 401', r.status === 401);
r = await req('/translate', { body: { text: 'x'.repeat(5001), from: 'he', to: 'en' } });
ok('too long -> 413', r.status === 413);
r = await req('/translate', { body: { text: 'x', from: 'he', to: 'xx' } });
ok('bad language -> 400', r.status === 400);
r = await req('/translate', { body: { text: '   ', from: 'he', to: 'en' } });
ok('empty -> 400', r.status === 400);

azureMode = '401';
r = await req('/translate', { body: { text: 'שלום', from: 'he', to: 'en' } });
d = await r.json();
ok('bad Azure key reported', r.status === 502 && d.error === 'azure-key');
azureMode = '429';
r = await req('/translate', { body: { text: 'שלום', from: 'he', to: 'en' } });
d = await r.json();
ok('Azure limit reported', d.error === 'azure-limit');
azureMode = 'ok';

const weak = await worker.fetch(new Request('https://x/health', { headers: { 'X-Access-Code': 'short' } }), { ACCESS_CODE: 'short', AZURE_KEY: 'k' });
ok('refuses to run with a weak access code', weak.status === 500);

r = await req('/nothing', { method: 'GET' });
ok('unknown path -> 404', r.status === 404);

const fails = results.filter(x => !x[1]).map(x => x[0]);
console.log(`\n${results.length - fails.length}/${results.length} passed. FAILED:`, fails);
process.exit(fails.length ? 1 : 0);

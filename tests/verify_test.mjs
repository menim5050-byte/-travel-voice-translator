// בדיקות יחידה לאימות תרגום (js/translate.js) ולחישוב ביטחון הזיהוי (js/transcribe.js).
// הרצה: node tests/verify_test.mjs
globalThis.localStorage = { _m: { tvt_groq_key: 'gsk_' + 'a'.repeat(40) }, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
globalThis.document = { createElement: () => ({ set innerHTML(v) { this.value = v; } }) };
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`); };

const { confidenceOf } = await import('../js/transcribe.js');
const { verifyTranslation, judgeSameMeaning } = await import('../js/translate.js');

// confidenceOf
ok('confidence: no segments -> null', confidenceOf([]) === null && confidenceOf(undefined) === null);
ok('confidence: avg_logprob -0.1 -> ~0.9', Math.abs(confidenceOf([{ start: 0, end: 2, avg_logprob: -0.1 }]) - 0.9) < 0.01);
ok('confidence: weighted by length', (() => { const c = confidenceOf([{ start: 0, end: 9, avg_logprob: -0.1 }, { start: 9, end: 10, avg_logprob: -2 }]); return c > 0.8 && c < 0.9; })());
ok('confidence: missing logprob ignored', confidenceOf([{ start: 0, end: 1 }, { start: 1, end: 2, avg_logprob: -0.5 }]) === 0.61);

// Mock: Google (clients5.google.com), MyMemory, Groq chat
function mock({ google, mymemory, judge }) {
  const calls = { google: 0, mymemory: 0, groq: 0, models: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const res = (status, body) => ({ ok: status === 200, status, headers: { get: () => null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });
    if (u.includes('google.com')) { calls.google++; return google === 'fail' ? res(500, '') : res(200, [google]); }
    if (u.includes('mymemory')) { calls.mymemory++; return mymemory === 'fail' ? res(500, '') : res(200, { responseStatus: 200, responseData: { translatedText: mymemory }, matches: [] }); }
    if (u.includes('groq.com')) {
      const b = JSON.parse(init.body);
      if (u.includes('/models')) return res(200, { data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }] });
      calls.groq++; calls.models.push(b.model);
      return judge === 'fail' ? res(500, 'x') : res(200, { choices: [{ message: { content: judge } }] });
    }
    return res(404, '');
  };
  return calls;
}

{
  const c = mock({ google: 'איפה התחנה הקרובה?', judge: 'SAME' });
  const r = await verifyTranslation('איפה התחנה הקרובה', 'he', 'Unde este cea mai apropiată stație?', 'ro');
  ok('verify: identical back-translation -> ok without calling the judge', r.status === 'ok' && c.groq === 0 && r.engine === 'google', JSON.stringify(r));
}
{
  const c = mock({ google: 'היכן התחנה הכי קרובה', judge: 'SAME' });
  const r = await verifyTranslation('איפה התחנה הקרובה', 'he', 'x', 'ro');
  ok('verify: different wording judged SAME -> ok, judge ran on the small model', r.status === 'ok' && c.groq === 1 && c.models[0] === 'openai/gpt-oss-20b', JSON.stringify([r, c.models]));
}
{
  mock({ google: 'כמה עולה הלילה', judge: 'DIFFERENT: המחיר הפך לשאלה על הלילה' });
  const r = await verifyTranslation('איפה התחנה הקרובה', 'he', 'x', 'th');
  ok('verify: judge says DIFFERENT -> warn with the reason', r.status === 'warn' && /המחיר/.test(r.note) && r.back === 'כמה עולה הלילה', JSON.stringify(r));
}
{
  const c = mock({ google: 'fail', mymemory: 'איפה התחנה', judge: 'SAME' });
  const r = await verifyTranslation('איפה התחנה', 'he', 'x', 'ar');
  ok('verify: Google fails -> MyMemory used for the back-translation', c.google >= 1 && c.mymemory >= 1 && r.engine === 'mymemory' && r.status === 'ok', JSON.stringify(r));
}
{
  mock({ google: 'fail', mymemory: 'fail', judge: 'SAME' });
  const r = await verifyTranslation('שלום', 'he', 'x', 'ro');
  ok('verify: no back-translation at all -> unknown (never a false approval)', r.status === 'unknown', JSON.stringify(r));
}
{
  mock({ google: 'משהו אחר לגמרי', judge: 'fail' });
  const r = await verifyTranslation('שלום לכולם', 'he', 'x', 'ro');
  ok('verify: judge unavailable -> unknown, back-translation still returned', r.status === 'unknown' && r.back === 'משהו אחר לגמרי', JSON.stringify(r));
}
{
  mock({ google: 'x', judge: 'maybe?' });
  let threw = false; try { await judgeSameMeaning('a', 'b', 'he'); } catch { threw = true; }
  ok('judge: unclear answer -> throws (treated as unknown)', threw);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

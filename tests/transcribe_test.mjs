// בדיקות יחידה ל-js/transcribe.js: סינון קטעים חשודים, סדר המודלים, וגיבוי כשמודל מגיע למגבלה.
// הרצה: node tests/transcribe_test.mjs
globalThis.localStorage = { _m: { tvt_groq_key: 'gsk_' + 'a'.repeat(40) }, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };

const { transcribe, isDubiousSegment, CONVERSATION_MODELS, GROQ_MODEL } = await import('../js/transcribe.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`); };

// מדמה את Groq: רשימת תשובות לפי הסדר, ושומר את המודל שנשלח בכל בקשה
function mockFetch(responses) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, model: init.body.get('model'), language: init.body.get('language') });
    const r = responses.shift();
    return { ok: r.status === 200, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  return seen;
}
const seg = (text, extra = {}) => ({ start: 0, end: 2, text, avg_logprob: -0.3, no_speech_prob: 0.02, compression_ratio: 1.2, ...extra });
const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' });

// isDubiousSegment
ok('normal segment is kept', !isDubiousSegment(seg('איפה השירותים')));
ok('no_speech high AND logprob low -> dubious', isDubiousSegment(seg('תודה שצפיתם', { no_speech_prob: 0.9, avg_logprob: -1.4 })));
ok('no_speech high but confident -> kept', !isDubiousSegment(seg('כן', { no_speech_prob: 0.9, avg_logprob: -0.4 })));
ok('low logprob but clearly speech -> kept', !isDubiousSegment(seg('משפט קשה', { no_speech_prob: 0.1, avg_logprob: -1.6 })));
ok('repetition (compression ratio > 2.4) -> dubious', isDubiousSegment(seg('תודה תודה תודה', { compression_ratio: 3.1 })));
ok('missing metadata -> kept', !isDubiousSegment({ start: 0, end: 1, text: 'שלום' }));

// סדר המודלים
ok('conversation prefers whisper-large-v3, turbo as backup', CONVERSATION_MODELS[0] === 'whisper-large-v3' && CONVERSATION_MODELS[1] === GROQ_MODEL);
{
  const seen = mockFetch([{ status: 200, body: { text: 'שלום', language: 'hebrew', duration: 1, segments: [seg('שלום')] } }]);
  const r = await transcribe(blob, { langKey: 'he', models: CONVERSATION_MODELS, filterDubious: true });
  ok('conversation: first request uses whisper-large-v3 with the speaker language', seen.length === 1 && seen[0].model === 'whisper-large-v3' && seen[0].language === 'he' && r.model === 'whisper-large-v3');
}
{
  const seen = mockFetch([{ status: 200, body: { text: 'hello', language: 'english', duration: 1, segments: [seg('hello')] } }]);
  const r = await transcribe(blob, { langKey: 'auto' });
  ok('default (listening mode) is unchanged: turbo first', seen[0].model === GROQ_MODEL && r.model === GROQ_MODEL && seen[0].language === null);
}
{
  const seen = mockFetch([{ status: 429, body: { error: { message: 'rate limit' } } }, { status: 200, body: { text: 'שלום', language: 'hebrew', duration: 1, segments: [seg('שלום')] } }]);
  const r = await transcribe(blob, { langKey: 'he', models: CONVERSATION_MODELS });
  ok('limit on the first model -> tries the second model', seen.length === 2 && seen[1].model === GROQ_MODEL && r.text === 'שלום');
}
{
  const seen = mockFetch([{ status: 429, body: {} }, { status: 429, body: {} }]);
  let err = null; try { await transcribe(blob, { langKey: 'he', models: CONVERSATION_MODELS }); } catch (e) { err = e; }
  ok('limit on both models -> clear limit error', seen.length === 2 && err && err.code === 'limit');
}
{
  mockFetch([{ status: 401, body: { error: { message: 'bad key' } } }]);
  let err = null; try { await transcribe(blob, { langKey: 'he', models: CONVERSATION_MODELS }); } catch (e) { err = e; }
  ok('bad key is not retried on another model', err && err.code === 'auth');
}

// סינון
{
  const segs = [seg('איפה התחנה הקרובה'), seg('תודה שצפיתם', { start: 2, end: 3, no_speech_prob: 0.93, avg_logprob: -1.5 }), seg('לא לא לא לא', { start: 3, end: 4, compression_ratio: 3 })];
  mockFetch([{ status: 200, body: { text: 'איפה התחנה הקרובה תודה שצפיתם לא לא לא לא', language: 'hebrew', duration: 4, segments: segs } }]);
  const r = await transcribe(blob, { langKey: 'he', filterDubious: true });
  ok('filter: dubious segments removed from the text', r.text === 'איפה התחנה הקרובה' && r.dropped === 2 && r.segments.length === 1, JSON.stringify(r));
  mockFetch([{ status: 200, body: { text: 'תודה שצפיתם', language: 'hebrew', duration: 2, segments: [seg('תודה שצפיתם', { no_speech_prob: 0.95, avg_logprob: -1.8 })] } }]);
  const r2 = await transcribe(blob, { langKey: 'he', filterDubious: true });
  ok('filter: only noise -> empty text (app shows "no speech")', r2.text === '' && r2.dropped === 1);
  mockFetch([{ status: 200, body: { text: 'איפה התחנה הקרובה תודה שצפיתם לא לא לא לא', language: 'hebrew', duration: 4, segments: segs } }]);
  const r3 = await transcribe(blob, { langKey: 'he' });
  ok('no filter requested: text is untouched', r3.text.includes('תודה שצפיתם') && r3.dropped === 0);
  mockFetch([{ status: 200, body: { text: 'שלום עולם', language: 'hebrew', duration: 2 } }]);
  const r4 = await transcribe(blob, { langKey: 'he', filterDubious: true });
  ok('response without segments still works', r4.text === 'שלום עולם' && r4.segments.length === 1);
}

{
  const bodies = [];
  globalThis.fetch = async (u, init) => { bodies.push({ prompt: init.body.get('prompt') }); return { ok: true, status: 200, text: async () => JSON.stringify({ text: 'x', language: 'hebrew', segments: [] }) }; };
  await transcribe(blob, { langKey: 'he', prompt: 'מלון הילטון. איפה התחנה' });
  await transcribe(blob, { langKey: 'he' });
  await transcribe(blob, { langKey: 'he', prompt: 'א'.repeat(900) });
  ok('prompt is sent when given', bodies[0].prompt === 'מלון הילטון. איפה התחנה');
  ok('no prompt field when empty', bodies[1].prompt === null);
  ok('prompt capped to 400 chars', bodies[2].prompt.length === 400);
}

console.log(`${pass}/${pass + fail} passed. FAILED: ${fail ? '[' + fail + ']' : '[]'}`);
process.exit(fail ? 1 : 0);

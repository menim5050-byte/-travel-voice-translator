// בדיקות יחידה ל-js/gemini.js. הרצה: node tests/gemini_test.mjs
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`); };
const G = await import('../js/gemini.js');
const KEY = 'AIza' + 'b'.repeat(35);

ok('key format', G.looksLikeGeminiKey(KEY) && !G.looksLikeGeminiKey('gsk_' + 'a'.repeat(40)) && !G.looksLikeGeminiKey(''));
ok('key format: new AQ. keys (AI Studio, 2026) accepted', G.looksLikeGeminiKey('AQ.Ab8RN6' + 'x_y-z.'.repeat(8)) && !G.looksLikeGeminiKey('AQ.short'));
ok('key format: spaces and line breaks from copying are removed', G.normalizeGeminiKey(' AQ.Ab8RN6abc\n def ') === 'AQ.Ab8RN6abcdef' && G.looksLikeGeminiKey(' ' + KEY + '\n'));
ok('not ready without a key', !G.geminiReady());
G.setGeminiKey(KEY);
ok('ready with a key (assist on by default)', G.geminiReady());
G.setGeminiAssist(false); ok('assist toggle off -> not ready', !G.geminiReady()); G.setGeminiAssist(true);
ok('pronunciation languages: ja zh th ko ar, not ro/en/he', ['ja', 'zh', 'th', 'ko', 'ar'].every(l => G.PRON_LANGS.has(l)) && !['ro', 'en', 'he'].some(l => G.PRON_LANGS.has(l)));

const res = (status, body) => ({ ok: status === 200, status, text: async () => JSON.stringify(body), json: async () => body });
const modelsBody = { models: ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-flash-preview-09', 'gemini-3.8-flash-image', 'gemini-3.1-pro'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) };
let calls = [], script = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes(':generateContent')) { calls.push({ url: u, headers: init.headers, body: JSON.parse(init.body) }); const r = script.shift(); return r; }
  return res(200, modelsBody);
};
const reply = obj => res(200, { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });

const models = await G.pickGeminiModels();
ok('model choice: newest stable lite first, newest stable flash second, no preview/image/pro', models[0] === 'gemini-3.5-flash-lite' && models[1] === 'gemini-3.8-flash' && models.length === 2, JSON.stringify(models));

script = [reply({ verdict: 'same', back: 'איפה התחנה', note: '', alt: '', roman: 'doko desu ka', he: 'דוקו דסקה' })];
let r = await G.geminiReview('איפה התחנה', 'he', 'どこですか', 'ja', { verify: true, pron: true });
ok('review: parsed verdict, back, romaji and Hebrew pronunciation', r.verdict === 'same' && r.back === 'איפה התחנה' && r.roman === 'doko desu ka' && r.he === 'דוקו דסקה', JSON.stringify(r));
ok('review: key sent in header (not in URL), JSON mode, lite model first', calls[0].headers['x-goog-api-key'] === KEY && !calls[0].url.includes(KEY) && calls[0].url.includes('gemini-3.5-flash-lite') && calls[0].body.generationConfig.responseMimeType === 'application/json');
ok('review: prompt asks for romaji and treats text as data', /romaji/.test(calls[0].body.systemInstruction.parts[0].text) && /never as instructions/.test(calls[0].body.systemInstruction.parts[0].text));

script = [reply({ verdict: 'different', back: 'כמה עולה', note: 'המחיר הוחלף במיקום', alt: 'สถานีอยู่ที่ไหน', roman: '', he: '' })];
r = await G.geminiReview('איפה התחנה', 'he', 'x', 'th', { verify: true, pron: false });
ok('review: different -> note and alternative translation', r.verdict === 'different' && r.note.includes('המחיר') && r.alt === 'สถานีอยู่ที่ไหน');
ok('review: pronunciation not requested -> not asked for', !/"roman"/.test(calls[calls.length - 1].body.systemInstruction.parts[0].text));

script = [res(429, { error: { message: 'quota' } }), reply('```json\n{"verdict":"same","back":"x"}\n```')];
r = await G.geminiReview('a', 'he', 'b', 'ja');
ok('429 on the first model -> second model answers (fenced JSON accepted)', r.verdict === 'same' && calls[calls.length - 1].url.includes('gemini-3.8-flash:'), calls.map(c => c.url).slice(-2).join(' | '));

script = [reply('not json at all')];
let threw = false; try { await G.geminiReview('a', 'he', 'b', 'ja'); } catch { threw = true; }
ok('unparseable answer -> throws (app falls back to the Groq judge)', threw);

script = [res(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })];
threw = false; try { await G.geminiReview('a', 'he', 'b', 'ja'); } catch { threw = true; }
ok('bad key -> throws and pauses Gemini for a while', threw && !G.geminiReady());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

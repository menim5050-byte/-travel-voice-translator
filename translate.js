import { LANGS, PHRASES } from './phrasebook.js';

// מופעי Lingva ציבוריים מתנדבים, חלקם נופלים מדי פעם. הרשימה נבדקת לפי הסדר.
export const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://lingva.lunar.icu',
  'https://translate.plausibility.cloud'
];

// אימייל אופציונלי מעלה את מכסת MyMemory מ-5,000 ל-50,000 תווים ליום (נשמר מקומית בלבד)
export function getMyMemoryEmail() {
  try { return localStorage.getItem('tvt.email') || ''; } catch { return ''; }
}

const CACHE_KEY = 'tvt.cache.v1';
const CACHE_MAX = 200;

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveCache(c) {
  try {
    const keys = Object.keys(c);
    if (keys.length > CACHE_MAX) keys.slice(0, keys.length - CACHE_MAX).forEach(k => delete c[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* אחסון מלא או חסום, ממשיכים בלי מטמון */ }
}

const norm = s => s.trim().toLowerCase().replace(/[.!?؟,،\s]+$/g, '').replace(/\s+/g, ' ');

// התאמה מדויקת לשיחון המובנה, עובד אופליין
export function phrasebookLookup(text, from, to) {
  const n = norm(text);
  const hit = PHRASES.find(p => norm(p[from]) === n);
  return hit ? hit[to] : null;
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function viaMyMemory(text, from, to) {
  const email = getMyMemoryEmail();
  let url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
    '&langpair=' + encodeURIComponent(LANGS[from].mm + '|' + LANGS[to].mm);
  if (email) url += '&de=' + encodeURIComponent(email);
  const d = await fetchJson(url, 7000);
  const out = d && d.responseData && d.responseData.translatedText;
  if (Number(d.responseStatus) !== 200 || !out || /MYMEMORY WARNING|INVALID|QUERY LENGTH/i.test(out)) {
    throw new Error('MyMemory: ' + (d.responseDetails || d.responseStatus));
  }
  return out.replace(/^\s*-\s*(.*?)\s*-\s*$/, '$1').trim();
}

async function viaLingva(text, from, to) {
  let lastErr;
  for (const base of LINGVA_INSTANCES) {
    try {
      const url = `${base}/api/v1/${LANGS[from].lingva}/${LANGS[to].lingva}/${encodeURIComponent(text)}`;
      const d = await fetchJson(url, 6000);
      if (d && d.translation) return d.translation;
      throw new Error('empty');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Lingva');
}

/** מחזיר { text, source } כאשר source הוא phrasebook | cache | mymemory | lingva */
export async function translate(text, from, to) {
  const clean = text.trim();
  if (!clean) return { text: '', source: 'none' };
  if (from === to) return { text: clean, source: 'same' };

  const local = phrasebookLookup(clean, from, to);
  if (local) return { text: local, source: 'phrasebook' };

  const key = `${from}|${to}|${clean}`;
  const cache = loadCache();
  if (cache[key]) return { text: cache[key], source: 'cache' };

  if (!navigator.onLine) {
    throw new Error('אין חיבור לאינטרנט. אפשר להשתמש בשיחון המהיר, שעובד גם אופליין.');
  }

  const providers = [['mymemory', viaMyMemory], ['lingva', viaLingva]];
  for (const [name, fn] of providers) {
    try {
      const out = await fn(clean, from, to);
      if (out) {
        cache[key] = out;
        saveCache(cache);
        return { text: out, source: name };
      }
    } catch (e) { /* עוברים לספק הבא */ }
  }
  throw new Error('שירותי התרגום לא זמינים כרגע. בדוק חיבור ונסה שוב, או השתמש בשיחון.');
}

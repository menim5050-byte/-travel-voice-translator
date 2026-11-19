import { LANGUAGES } from './languages.js';
import { PHRASES } from './phrasebook.js';

// מופעי Lingva ציבוריים של מתנדבים, חלקם נופלים מדי פעם. נבדקים לפי הסדר.
export const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://lingva.lunar.icu',
  'https://translate.plausibility.cloud'
];

const EMAIL_KEY = 'tvt_email';
const CACHE_KEY = 'tvt_cache_v2';
const CACHE_MAX = 300;

export function getEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } }
export function setEmail(v) { try { v ? localStorage.setItem(EMAIL_KEY, v) : localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ } }

function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function saveCache(c) {
  try {
    const keys = Object.keys(c);
    if (keys.length > CACHE_MAX) keys.slice(0, keys.length - CACHE_MAX).forEach(k => delete c[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* אחסון מלא או חסום, ממשיכים בלי מטמון */ }
}
export function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } }
export function cacheSize() { return Object.keys(loadCache()).length; }

const norm = s => s.trim().toLowerCase().replace(/[.!?؟,،。！？\s]+$/g, '').replace(/\s+/g, ' ');

// התאמה מדויקת לשיחון המובנה. עובד בלי אינטרנט.
export function phrasebookLookup(text, from, to) {
  const n = norm(text);
  const hit = PHRASES.find(p => p[from] && norm(p[from]) === n);
  return hit && hit[to] ? hit[to] : null;
}

function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

// MyMemory מוסיף לפעמים מרכאות או מקפים סביב התרגום
function tidy(out, src) {
  let t = decodeEntities(out).trim();
  const wrapped = (a, b) => t.startsWith(a) && t.endsWith(b) && !(src.startsWith(a) && src.endsWith(b));
  if (wrapped('"', '"') || wrapped('“', '”') || wrapped('«', '»')) t = t.slice(1, -1).trim();
  t = t.replace(/^-\s*(.*?)\s*-$/, '$1').trim();
  return t;
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function viaMyMemory(text, from, to) {
  let url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
    '&langpair=' + encodeURIComponent(LANGUAGES[from].mm + '|' + LANGUAGES[to].mm);
  const email = getEmail();
  if (email) url += '&de=' + encodeURIComponent(email);
  const d = await fetchJson(url, 7000);
  const out = d && d.responseData && d.responseData.translatedText;
  if (Number(d.responseStatus) !== 200 || !out || /MYMEMORY WARNING|INVALID|QUERY LENGTH/i.test(out)) {
    throw new Error('MyMemory: ' + (d.responseDetails || d.responseStatus));
  }
  return tidy(out, text);
}

async function viaLingva(text, from, to) {
  let lastErr;
  for (const base of LINGVA_INSTANCES) {
    try {
      const url = `${base}/api/v1/${LANGUAGES[from].lingva}/${LANGUAGES[to].lingva}/${encodeURIComponent(text)}`;
      const d = await fetchJson(url, 6000);
      if (d && d.translation) return tidy(d.translation, text);
      throw new Error('empty');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Lingva');
}

/** מחזיר { text, source } כאשר source הוא phrasebook | cache | mymemory | lingva | same */
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
    throw new Error('אין חיבור לאינטרנט. משפטים מהשיחון (משפטים מהירים ו"עוד משפטים") עובדים גם בלי רשת.');
  }

  for (const [name, fn] of [['mymemory', viaMyMemory], ['lingva', viaLingva]]) {
    try {
      const out = await fn(clean, from, to);
      if (out) {
        cache[key] = out;
        saveCache(cache);
        return { text: out, source: name };
      }
    } catch (e) { /* עוברים לספק הבא */ }
  }
  throw new Error('שירותי התרגום לא זמינים כרגע. בדוק חיבור אינטרנט ונסה שוב, או השתמש במשפטים המהירים.');
}

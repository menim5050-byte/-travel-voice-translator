// תמלול הקלטה עם Whisper של Groq (חינמי עם מפתח אישי).
// המפתח נשמר רק בטלפון של המשתמש (localStorage), לא בקוד ולא באתר.
import { LANGUAGES } from './languages.js';

const KEY = 'tvt_groq_key';
export const GROQ_BASE = 'https://api.groq.com/openai/v1';
export const GROQ_MODEL = 'whisper-large-v3-turbo';

export function getGroqKey() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function setGroqKey(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* ignore */ } }
export const looksLikeGroqKey = v => /^gsk_[A-Za-z0-9]{20,}$/.test(String(v || '').trim());

// Whisper מחזיר את שם השפה באנגלית ("romanian"). ממפים לקודים של האפליקציה.
const NAME_TO_KEY = {
  hebrew: 'he', english: 'en', romanian: 'ro', moldavian: 'ro', moldovan: 'ro', arabic: 'ar', thai: 'th', russian: 'ru',
  spanish: 'es', castilian: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', greek: 'el', turkish: 'tr',
  hungarian: 'hu', czech: 'cs', polish: 'pl', dutch: 'nl', flemish: 'nl', japanese: 'ja', korean: 'ko', chinese: 'zh',
  mandarin: 'zh', vietnamese: 'vi', hindi: 'hi'
};
export function detectedLangKey(name) {
  const n = String(name || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LANGUAGES, n)) return n; // כבר קוד ("ro")
  return NAME_TO_KEY[n] || null;
}

function errorFor(status, body) {
  const msg = (() => { try { return JSON.parse(body).error.message || ''; } catch { return String(body || '').slice(0, 160); } })();
  if (status === 401 || status === 403) return { code: 'auth', text: 'מפתח Groq לא תקין. בדוק אותו בהגדרות.' };
  if (status === 429) return { code: 'limit', text: 'הגעת למגבלת השימוש החינמית של Groq. נסה שוב מאוחר יותר.' };
  if (status === 413) return { code: 'too-big', text: 'ההקלטה גדולה מדי לשליחה. נסה הקלטה קצרה יותר.' };
  return { code: 'http', text: `שירות התמלול החזיר שגיאה (${status}). ${msg}`.trim() };
}

/** בודק שהמפתח עובד (ושהדפדפן יכול לפנות ל-Groq). מחזיר true או זורק שגיאה עם text בעברית. */
export async function testGroqKey(key) {
  let res;
  try {
    res = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, referrerPolicy: 'no-referrer' });
  } catch {
    const e = new Error('אין חיבור לשירות Groq (בדוק אינטרנט).'); e.code = 'network'; throw e;
  }
  if (!res.ok) { const x = errorFor(res.status, await res.text().catch(() => '')); const e = new Error(x.text); e.code = x.code; throw e; }
  return true;
}

/**
 * שולח הקלטה לתמלול. langKey = קוד שפה, או 'auto' לזיהוי אוטומטי.
 * מחזיר { text, langKey (שזוהתה או שנבחרה), segments: [{ start, end, text }] }.
 */
export async function transcribe(blob, { langKey = 'auto', filename = 'recording.webm', signal } = {}) {
  const key = getGroqKey();
  if (!key) { const e = new Error('חסר מפתח Groq. הוסף אותו בהגדרות.'); e.code = 'no-key'; throw e; }
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', GROQ_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (langKey && langKey !== 'auto') form.append('language', langKey);
  let res;
  try {
    res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal, referrerPolicy: 'no-referrer'
    });
  } catch (err) {
    const e = new Error(signal && signal.aborted ? 'השליחה בוטלה.' : 'אין חיבור לשירות התמלול. ההקלטה נשמרה, אפשר לנסות שוב.');
    e.code = 'network'; throw e;
  }
  const body = await res.text().catch(() => '');
  if (!res.ok) { const x = errorFor(res.status, body); const e = new Error(x.text); e.code = x.code; throw e; }
  let d;
  try { d = JSON.parse(body); } catch { const e = new Error('תשובה לא צפויה משירות התמלול.'); e.code = 'bad'; throw e; }
  const segments = Array.isArray(d.segments)
    ? d.segments.map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() })).filter(s => s.text)
    : [];
  const text = String(d.text || '').trim();
  return {
    text,
    langKey: langKey !== 'auto' ? langKey : detectedLangKey(d.language),
    detectedName: d.language || '',
    segments: segments.length ? segments : (text ? [{ start: 0, end: Number(d.duration) || 0, text }] : [])
  };
}

// מחבר קטעים קצרים לפסקאות קריאות (עד כ-350 בתים, או הפסקה של יותר מ-2 שניות)
export function groupSegments(segments, maxBytes = 350) {
  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const bytes = s => (enc ? enc.encode(s).length : s.length * 2);
  const out = [];
  let cur = null;
  for (const s of segments) {
    // מחברים לקטע הקודם אם אין הפסקה ארוכה, האורך סביר, והקודם לא הסתיים במשפט שלם (או שהוא קצר מאוד)
    const canMerge = cur && s.start - cur.end <= 2 && bytes(cur.text + ' ' + s.text) <= maxBytes &&
      (!/[.!?؟。！？]$/.test(cur.text) || bytes(cur.text) < 120);
    if (canMerge) { cur.text += ' ' + s.text; cur.end = s.end; continue; }
    if (cur) out.push(cur);
    cur = { start: s.start, end: s.end, text: s.text };
  }
  if (cur) out.push(cur);
  return out;
}

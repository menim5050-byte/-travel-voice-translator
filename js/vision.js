// צילום ותרגום: קריאת טקסט מתמונה (שלט, תפריט, הודעה) ותרגום, עם מודל הראייה של Groq.
// משתמש באותו מפתח Groq האישי שנשמר בטלפון.
import { getGroqKey, GROQ_BASE } from './transcribe.js';

// Groq מחליפה מודלים מדי פעם (Llama 4 Scout הושבת ב-17.7.2026, Qwen 3.6 ב-14.9.2026). לכן לא נועלים שם אחד:
// בודקים מול Groq אילו מודלים קיימים עכשיו, ובוחרים לפי הסדר. מודל שהחזיר "לא קיים" מדולג.
export const VISION_CANDIDATES = [
  'qwen/qwen3.8-27b',
  'meta-models/muse-spark-open'
];
const MODELS_CACHE = 'tvt_groq_models';
const MODELS_MAX_AGE = 24 * 60 * 60 * 1000;
const badModels = new Set();

export async function availableModels(key, force) {
  try {
    const c = JSON.parse(localStorage.getItem(MODELS_CACHE) || 'null');
    if (!force && c && Array.isArray(c.ids) && Date.now() - c.ts < MODELS_MAX_AGE) return c.ids;
  } catch { /* ignore */ }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000); // ברשת חלשה לא מחכים: ממשיכים לפי סדר הרשימה
    let d;
    try {
      const res = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, referrerPolicy: 'no-referrer', signal: ctrl.signal });
      if (!res.ok) return null;
      d = await res.json();
    } finally { clearTimeout(t); }
    const ids = (Array.isArray(d.data) ? d.data : []).filter(m => m && m.id && m.active !== false).map(m => m.id);
    try { localStorage.setItem(MODELS_CACHE, JSON.stringify({ ids, ts: Date.now() })); } catch { /* ignore */ }
    return ids;
  } catch { return null; }
}

/** בוחר מודל ראייה שקיים עכשיו ב-Groq. אם אי אפשר לבדוק, מנסים לפי סדר הרשימה. */
export async function pickVisionModel(key, force) {
  const ids = await availableModels(key, force);
  const usable = VISION_CANDIDATES.filter(m => !badModels.has(m));
  if (ids && ids.length) {
    const hit = usable.find(m => ids.includes(m));
    if (hit) return hit;
    const guess = ids.find(id => !badModels.has(id) && /vision|[-_]vl\b|qwen3\.\d+-\d+b/i.test(id));
    if (guess) return guess;
  }
  return usable[0] || null;
}
export const isModelGone = e => e && (e.status === 404 || (e.status === 400 && !/response_format|json/i.test(e.detail || '') && /model_not_found|decommissioned|does not exist|no longer (available|supported)/i.test(e.detail || '')));

export const ENGLISH_NAME = {
  he: 'Hebrew', en: 'English', ro: 'Romanian', ar: 'Arabic', th: 'Thai', ru: 'Russian', es: 'Spanish', fr: 'French',
  de: 'German', it: 'Italian', pt: 'Portuguese', el: 'Greek', tr: 'Turkish', hu: 'Hungarian', cs: 'Czech', pl: 'Polish',
  nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese (Simplified)', vi: 'Vietnamese', hi: 'Hindi'
};

/** מקטין את התמונה בטלפון לפני השליחה (מהר יותר וזול יותר בגלישה). מחזיר { dataUrl, width, height, bytes }. */
export async function prepareImage(file, maxSide = 1600) {
  let source, w, h, cleanup = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
      w = source.width; h = source.height;
      cleanup = () => { try { source.close(); } catch { /* ignore */ } };
    } catch { source = null; }
  }
  if (!source) {
    const url = URL.createObjectURL(file);
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Object.assign(new Error('לא ניתן לקרוא את התמונה.'), { code: 'bad-image' }));
      img.src = url;
    }).finally(() => URL.revokeObjectURL(url));
    w = source.naturalWidth; h = source.naturalHeight;
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  cleanup();
  let quality = 0.85, dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 3.5 * 1024 * 1024 && quality > 0.4) { quality -= 0.15; dataUrl = canvas.toDataURL('image/jpeg', quality); }
  return { dataUrl, width: cw, height: ch, bytes: Math.round(dataUrl.length * 0.75) };
}

function promptFor(targetKey) {
  const target = ENGLISH_NAME[targetKey] || 'Hebrew';
  return [
    'You help a traveler understand text in a photo (a sign, menu, notice, ticket, label or a screenshot of a message).',
    'Read ALL the readable text in the image, in reading order, and translate it.',
    'Reply with ONLY a JSON object, no markdown, in exactly this shape:',
    '{"language":"<ISO 639-1 code of the main language of the text>",',
    ' "original":"<the text exactly as written in the image, keep line breaks>",',
    ` "translation":"<a faithful, natural translation into ${target}, keep line breaks and keep names, numbers and prices>",`,
    ' "prices":[{"amount":<number>,"currency":"<ISO 4217 code, inferred from symbols or the country if needed, or empty>","text":"<the price as written>"}],',
    ` "note":"<one short sentence in ${target} only if something is unclear, cut off or there is no text; otherwise empty>"}`,
    `If the text is already in ${target}, put it in both "original" and "translation".`,
    'If there is no readable text, return empty "original" and "translation" and explain in "note".'
  ].join('\n');
}

// מוציא JSON מתוך תשובת המודל, גם אם הוא עטף אותה בטקסט או ב-```json
export function parseVisionReply(content) {
  const s = String(content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const d = JSON.parse(s.slice(a, b + 1));
      return {
        language: String(d.language || '').toLowerCase().slice(0, 5),
        original: String(d.original || '').trim(),
        translation: String(d.translation || '').trim(),
        prices: Array.isArray(d.prices) ? d.prices.filter(p => p && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0)
          .map(p => ({ amount: Number(p.amount), currency: String(p.currency || '').trim(), text: String(p.text || '').trim() })) : [],
        note: String(d.note || '').trim()
      };
    } catch { /* נופלים לטקסט חופשי */ }
  }
  return { language: '', original: '', translation: s.replace(/^```\w*|```$/g, '').trim(), prices: [], note: '' };
}

function visionError(status, body) {
  const msg = (() => { try { return JSON.parse(body).error.message || ''; } catch { return String(body || '').slice(0, 160); } })();
  if (status === 401 || status === 403) return { code: 'auth', text: 'מפתח Groq לא תקין. בדוק אותו בהגדרות.', msg };
  if (status === 429) return { code: 'limit', text: 'הגעת למגבלת השימוש החינמית של Groq. נסה שוב מאוחר יותר.', msg };
  if (status === 413) return { code: 'too-big', text: 'התמונה גדולה מדי. נסה לצלם שוב מקרוב יותר.', msg };
  return { code: 'http', text: `שירות הקריאה החזיר שגיאה (${status})${msg ? ': ' + msg.slice(0, 120) : ''}.`, msg };
}

/** שולח תמונה (data URL) ומחזיר { language, original, translation, prices, note }. */
export async function readAndTranslate(dataUrl, targetKey, { signal } = {}) {
  const key = getGroqKey();
  if (!key) throw Object.assign(new Error('חסר מפתח Groq. הוסף אותו בהגדרות.'), { code: 'no-key' });
  const call = async (model, jsonMode) => {
    const body = {
      model,
      temperature: 0.1,
      max_completion_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: promptFor(targetKey) }, { type: 'image_url', image_url: { url: dataUrl } }] }]
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    let res;
    try {
      res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: 'POST', signal, referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch {
      throw Object.assign(new Error(signal && signal.aborted ? 'בוטל.' : 'אין חיבור לשירות. התמונה נשמרה, אפשר לנסות שוב.'), { code: 'network' });
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) { const x = visionError(res.status, text); throw Object.assign(new Error(x.text), { code: x.code, status: res.status, detail: x.msg }); }
    let d;
    try { d = JSON.parse(text); } catch { throw Object.assign(new Error('תשובה לא צפויה מהשירות.'), { code: 'bad' }); }
    const content = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    return parseVisionReply(content);
  };
  let model = await pickVisionModel(key);
  for (let attempt = 0; attempt < 3 && model; attempt++) {
    try {
      try { return await call(model, true); }
      catch (e) {
        // אם מצב JSON לא נתמך, מנסים שוב בלעדיו
        if (e.status === 400 && /response_format|json/i.test(e.detail || '') && !isModelGone(e)) return await call(model, false);
        throw e;
      }
    } catch (e) {
      if (!isModelGone(e)) throw e;
      badModels.add(model);           // המודל הושבת: עוברים לבא שקיים עכשיו
      model = await pickVisionModel(key, true);
    }
  }
  throw Object.assign(new Error('אין כרגע ב-Groq מודל זמין לקריאת תמונות. נסה מאוחר יותר.'), { code: 'no-model' });
}

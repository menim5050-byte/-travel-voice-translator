// שרת אישי למתורגמן (Cloudflare Worker).
// שומר את מפתח התרגום מוסתר, ומתרגם רק למי שיש לו קוד הגישה האישי.
//
// משתנים שמגדירים ב-Cloudflare (Settings ← Variables and Secrets), כולם מסוג Secret:
//   ACCESS_CODE   קוד גישה שבוחרים (לפחות 8 תווים). אותו קוד מדביקים בהגדרות האפליקציה.
//   AZURE_KEY     KEY 1 של שירות Translator ב-Azure
//   AZURE_REGION  האזור של השירות (למשל westeurope)
// רשות (Text):
//   ALLOWED_ORIGIN  כתובת האתר שמותר לו לפנות (ברירת מחדל: האתר של המתורגמן ב-GitHub Pages)

const DEFAULT_ORIGIN = 'https://menim5050-byte.github.io';
const AZURE_URL = 'https://api.cognitive.microsofttranslator.com/translate';
const MAX_CHARS = 5000;

// קודי השפות של האפליקציה ← הקודים של Azure
const LANGS = {
  he: 'he', en: 'en', ro: 'ro', ar: 'ar', th: 'th', ru: 'ru', es: 'es', fr: 'fr', de: 'de', it: 'it',
  pt: 'pt-pt', el: 'el', tr: 'tr', hu: 'hu', cs: 'cs', pl: 'pl', nl: 'nl', ja: 'ja', ko: 'ko', zh: 'zh-Hans',
  vi: 'vi', hi: 'hi'
};
const FROM_AZURE = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [v.toLowerCase(), k]));

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || DEFAULT_ORIGIN).split(',').map(s => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body, status, env, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(env, origin) }
  });
}

// השוואה בזמן קבוע, כדי שאי אפשר יהיה לנחש את הקוד לפי זמני תגובה
function sameCode(a, b) {
  const x = String(a || ''), y = String(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

function checkAccess(request, env) {
  if (!env.ACCESS_CODE || String(env.ACCESS_CODE).length < 8) return 'server-not-configured';
  return sameCode(request.headers.get('X-Access-Code'), env.ACCESS_CODE) ? null : 'bad-code';
}

async function azureTranslate(text, from, to, env) {
  const params = new URLSearchParams({ 'api-version': '3.0', to: LANGS[to] });
  if (from !== 'auto') params.set('from', LANGS[from]);
  const res = await fetch(`${AZURE_URL}?${params}`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_KEY,
      'Ocp-Apim-Subscription-Region': env.AZURE_REGION || 'global',
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify([{ Text: text }])
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error('azure ' + res.status);
    err.status = res.status;
    err.body = body.slice(0, 300);
    throw err;
  }
  const d = JSON.parse(body);
  const item = Array.isArray(d) ? d[0] : null;
  const out = item && item.translations && item.translations[0] && item.translations[0].text;
  if (typeof out !== 'string') throw Object.assign(new Error('azure empty'), { status: 502 });
  const det = item.detectedLanguage && item.detectedLanguage.language;
  return { text: out, detected: det ? (FROM_AZURE[String(det).toLowerCase()] || det) : null };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, origin) });

    if (url.pathname === '/health' && request.method === 'GET') {
      const denied = checkAccess(request, env);
      if (denied) return json({ ok: false, error: denied }, denied === 'bad-code' ? 401 : 500, env, origin);
      return json({ ok: true, translator: !!env.AZURE_KEY, region: env.AZURE_REGION || null, version: 1 }, 200, env, origin);
    }

    if (url.pathname === '/translate' && request.method === 'POST') {
      const denied = checkAccess(request, env);
      if (denied) return json({ ok: false, error: denied }, denied === 'bad-code' ? 401 : 500, env, origin);
      if (!env.AZURE_KEY) return json({ ok: false, error: 'translator-not-configured' }, 500, env, origin);
      let input;
      try { input = await request.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400, env, origin); }
      const text = typeof input.text === 'string' ? input.text.trim() : '';
      const from = input.from === 'auto' ? 'auto' : input.from;
      const to = input.to;
      if (!text) return json({ ok: false, error: 'empty' }, 400, env, origin);
      if (text.length > MAX_CHARS) return json({ ok: false, error: 'too-long', max: MAX_CHARS }, 413, env, origin);
      if (!(to in LANGS) || (from !== 'auto' && !(from in LANGS))) return json({ ok: false, error: 'bad-language' }, 400, env, origin);
      try {
        const r = await azureTranslate(text, from, to, env);
        return json({ ok: true, text: r.text, detected: r.detected, provider: 'azure' }, 200, env, origin);
      } catch (e) {
        // 401/403 = מפתח Azure שגוי או לא פעיל, 429 = מכסה/קצב
        const code = e.status === 401 || e.status === 403 ? 'azure-key' : e.status === 429 ? 'azure-limit' : 'azure-error';
        return json({ ok: false, error: code, status: e.status || 502, detail: e.body || '' }, 502, env, origin);
      }
    }

    return json({ ok: false, error: 'not-found' }, 404, env, origin);
  }
};

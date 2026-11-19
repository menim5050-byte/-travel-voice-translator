// המרת מחירים לשקלים. שערים יומיים מ-ExchangeRate-API (גישה פתוחה, בלי מפתח, דורש קרדיט),
// וגיבוי מ-Frankfurter (שערי הבנק האירופי). השערים נשמרים בטלפון ל-12 שעות, ובלי רשת משתמשים באחרונים.
const KEY = 'tvt_fx';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const RATES_CREDIT = { label: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com' };

function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && d.rates && d.ts ? d : null; } catch { return null; } }
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } }

async function fetchJson(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/** מחזיר { rates (כמה יחידות מכל מטבע שווה שקל אחד), ts, source } או null. */
export async function getRates() {
  const cached = load();
  if (cached && Date.now() - cached.ts < MAX_AGE_MS) return cached;
  try {
    const d = await fetchJson('https://open.er-api.com/v6/latest/ILS');
    if (d && d.result === 'success' && d.rates) { const out = { rates: d.rates, ts: Date.now(), updated: d.time_last_update_utc || '', source: 'er' }; save(out); return out; }
  } catch { /* גיבוי */ }
  try {
    const d = await fetchJson('https://api.frankfurter.app/latest?from=ILS');
    if (d && d.rates) { const out = { rates: { ...d.rates, ILS: 1 }, ts: Date.now(), updated: d.date || '', source: 'ecb' }; save(out); return out; }
  } catch { /* בלי רשת */ }
  return cached; // שערים ישנים עדיפים על כלום
}

// סמלים ומילים נפוצים למטבעות. ¥ תלוי בשפה (יפן או סין).
const SYMBOLS = {
  '฿': 'THB', 'บาท': 'THB', 'baht': 'THB', 'thb': 'THB',
  'lei': 'RON', 'leu': 'RON', 'ron': 'RON',
  '€': 'EUR', 'eur': 'EUR', 'euro': 'EUR', 'euros': 'EUR',
  '$': 'USD', 'us$': 'USD', 'usd': 'USD',
  '£': 'GBP', 'gbp': 'GBP', '₪': 'ILS', 'nis': 'ILS', 'ils': 'ILS', 'ש"ח': 'ILS', 'שח': 'ILS',
  'aed': 'AED', 'د.إ': 'AED', 'dh': 'AED', 'dhs': 'AED', '₺': 'TRY', 'tl': 'TRY', 'try': 'TRY',
  '₽': 'RUB', 'руб': 'RUB', 'р': 'RUB', 'rub': 'RUB', '₩': 'KRW', 'krw': 'KRW', '₫': 'VND', 'vnd': 'VND', 'đ': 'VND',
  '₹': 'INR', 'rs': 'INR', 'inr': 'INR', 'kč': 'CZK', 'czk': 'CZK', 'zł': 'PLN', 'pln': 'PLN', 'ft': 'HUF', 'huf': 'HUF',
  'jd': 'JOD', 'jod': 'JOD', 'egp': 'EGP', 'e£': 'EGP', 'ج.م': 'EGP', '£e': 'EGP'
};

export function normalizeCurrency(cur, langKey) {
  const c = String(cur || '').trim();
  if (/^[A-Z]{3}$/.test(c)) return c;
  const low = c.toLowerCase().replace(/\.$/, '');
  if (low === '¥' || low === '円' || low === '元') return langKey === 'zh' || low === '元' ? 'CNY' : 'JPY';
  return SYMBOLS[low] || SYMBOLS[c] || null;
}

/** מחשב כמה שקלים. מחזיר מספר או null. */
export function toILS(amount, currency, rates) {
  if (!rates || !currency || !Number.isFinite(amount)) return null;
  if (currency === 'ILS') return amount;
  const r = rates[currency];
  return r ? amount / r : null;
}

export const formatILS = n => (n >= 100 ? Math.round(n).toLocaleString('he-IL') : n.toLocaleString('he-IL', { maximumFractionDigits: n < 10 ? 2 : 1 }));

// Service worker: האפליקציה נשמרת בטלפון ונפתחת ממנו מיד, גם בלי אינטרנט ובאינטרנט חלש.
// אסטרטגיה: כל קבצי הגרסה נשמרים יחד בהתקנה, ומוגשים מהטלפון (גרסה שלמה אחת, בלי ערבוב).
// כשיש גרסה חדשה באתר, הדפדפן מוריד אותה ברקע בשלמותה, והיא נכנסת לפעולה בפתיחה הבאה.
// בקשות לשירותי התרגום (דומיין אחר) לא נוגעים בהן.
// VERSION מחושב אוטומטית מתוכן הקבצים: python3 tools/stamp-sw.py
const VERSION = 'tvt-05e01c983c';
const ASSETS = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/app.js', './js/languages.js', './js/phrasebook.js', './js/translate.js', './js/speech.js', './js/ui-strings.js', './js/recorder.js', './js/transcribe.js', './js/vision.js', './js/currency.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // cache:'reload' עוקף את המטמון של הדפדפן, כדי לא לשמור עותק ישן של GitHub Pages
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tvt-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// "שתף אל המתורגמן": טקסט או תמונה שנשלחו מאפליקציה אחרת נשמרים בתיבה, והאפליקציה נפתחת ומטפלת בהם
async function handleShare(req) {
  try {
    const form = await req.formData();
    const inbox = await caches.open('share-inbox');
    const file = form.get('image');
    const text = ['title', 'text', 'url'].map(k => form.get(k)).filter(v => typeof v === 'string' && v.trim()).join('\n').trim();
    const hasImage = !!(file && typeof file === 'object' && file.size);
    if (hasImage) await inbox.put('./__shared-image', new Response(file, { headers: { 'content-type': file.type || 'image/jpeg' } }));
    else await inbox.delete('./__shared-image');
    await inbox.put('./__shared-meta', new Response(JSON.stringify({ text, hasImage, ts: Date.now() }), { headers: { 'content-type': 'application/json' } }));
  } catch (err) { /* האפליקציה תיפתח בכל מקרה */ }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const isNav = req.mode === 'navigate';
    // קובץ שמבוקש עם ?v= של גרסה אחרת (דף מגרסה אחרת): מביאים מהרשת, כדי לא לערבב גרסאות
    const v = url.searchParams.get('v');
    if (!isNav && v && /^[0-9a-f]{10}$/.test(v) && v !== VERSION.slice(4)) {
      try { const res = await fetch(req); if (res.ok) return res; } catch (err) { /* נופלים למטמון */ }
    }
    const hit = await cache.match(isNav ? './index.html' : req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      return (isNav && await cache.match('./index.html')) || Response.error();
    }
  })());
});

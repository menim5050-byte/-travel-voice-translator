"""Service worker test: fast start on a slow network, safe update to a new version, offline after update.
Runs its own server on a temporary copy of the site (port 8775): python3 tests/e2e_update.py
"""
import functools, http.server, pathlib, shutil, subprocess, sys, tempfile, threading, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8775
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS' if cond else 'FAIL'), name, extra)

site = pathlib.Path(tempfile.mkdtemp()) / 'site'
shutil.copytree(ROOT, site, ignore=shutil.ignore_patterns('.git', 'node_modules', 'tests'))
DELAY = {'s': 0.0}

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600')  # כמו GitHub Pages
        super().end_headers()
    def do_GET(self):
        if DELAY['s']: time.sleep(DELAY['s'])
        super().do_GET()

srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=str(site)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://localhost:{PORT}/index.html'
H1 = 'מתורגמן קולי לשיחה בין 2 אנשים'

def deploy(tag):
    idx = site / 'index.html'
    text = idx.read_text(encoding='utf-8')
    import re
    text = re.sub(H1 + r'( v\d+)?', f'{H1} {tag}', text)
    idx.write_text(text, encoding='utf-8')
    subprocess.run([sys.executable, str(site / 'tools' / 'stamp-sw.py')], check=True, capture_output=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL); page.wait_for_load_state('networkidle')
    page.wait_for_function('navigator.serviceWorker.ready.then(() => true)')
    page.reload(); page.wait_for_load_state('networkidle')
    ok('SW controls the page', page.evaluate('!!navigator.serviceWorker.controller'))

    # פתיחה ברשת איטית (3 שניות לכל בקשה): נפתח מהטלפון מיד
    DELAY['s'] = 3.0
    t0 = time.time()
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function("document.querySelectorAll('#quickPhrasesGrid button').length === 12")
    dt = time.time() - t0
    ok('starts fast on a slow network (from the phone)', dt < 1.5, f'{dt:.2f}s')
    DELAY['s'] = 0.0
    page.wait_for_timeout(500)

    # "שתף אל המתורגמן": כמו אנדרואיד, טופס POST אל share-target. ה-SW שומר ומפנה לאפליקציה, והיא מטפלת.
    page.evaluate("""() => { const f = document.createElement('form'); f.method = 'POST'; f.enctype = 'multipart/form-data'; f.action = './share-target';
      const t = document.createElement('textarea'); t.name = 'text'; t.value = 'Bună ziua, mulțumim pentru rezervare'; f.appendChild(t);
      document.body.appendChild(f); f.submit(); }""")
    try:
        page.wait_for_function("document.getElementById('inputB') && document.getElementById('inputB').value.startsWith('Bună ziua')", timeout=10000)
        picked = True
    except Exception:
        picked = False
    ok('share target: shared text arrives in the app (via the service worker)', picked, page.url)
    ok('share target: inbox emptied and address cleaned', page.evaluate("caches.open('share-inbox').then(c => c.keys()).then(k => k.length)") == 0 and 'share-target' not in page.url and 'shared' not in page.url, page.url)
    page.goto(URL); page.wait_for_load_state('networkidle')

    # עדכון כשלא באמצע שיחה: נטען אוטומטית
    deploy('v2')
    page.reload(); page.wait_for_load_state('domcontentloaded')
    try:
        page.wait_for_function("document.querySelector('h1').textContent.includes('v2')", timeout=15000)
        upd = True
    except Exception:
        upd = False
    ok('new version arrives on its own (idle)', upd, page.inner_text('h1'))
    page.wait_for_load_state('networkidle')
    keys = page.evaluate("caches.keys()")
    ok('only one complete version is kept', len([k for k in keys if k.startswith('tvt-')]) == 1, str(keys))

    # עדכון באמצע הקלדה: לא מרענן בלי לשאול
    deploy('v3')
    page.click('#inputA'); page.keyboard.type('משפט באמצע')
    page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
    try:
        page.wait_for_function("document.getElementById('statusBannerText').textContent.includes('גרסה חדשה')", timeout=15000)
        asked = True
    except Exception:
        asked = False
    ok('mid-conversation: asks before reloading', asked and 'v2' in page.inner_text('h1') and page.input_value('#inputA') == 'משפט באמצע')
    if asked:
        page.click('#bannerActionBtn')
        page.wait_for_function("document.querySelector('h1').textContent.includes('v3')", timeout=10000)
        ok('"refresh now" loads the new version', True)

    # אחרי העדכון: עובד בלי אינטרנט
    page.wait_for_load_state('networkidle')
    ctx.set_offline(True)
    page.reload(); page.wait_for_load_state('domcontentloaded')
    page.wait_for_function("document.querySelectorAll('#quickPhrasesGrid button').length === 12")
    ok('offline after update: new version, working', 'v3' in page.inner_text('h1'))
    ok('no JS errors', not errs, str(errs))
    b.close()

srv.shutdown()
shutil.rmtree(site.parent, ignore_errors=True)
fails = [r[0] for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed. FAILED:', fails)
sys.exit(1 if fails else 0)

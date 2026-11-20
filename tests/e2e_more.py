"""Regression tests for the fixes from the 19.11.2026 audit.
Needs a server: python3 -m http.server 8766 (from the repo root), then: python3 tests/e2e_more.py
"""
import json, sys, time, urllib.parse
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8766/index.html'
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS' if cond else 'FAIL'), name, extra)

MOCK = r"""
(() => {
  window.__spoken = []; window.__recs = [];
  window.__voices = window.__voices || [{lang:'he-IL'},{lang:'en-US'},{lang:'ru-RU'},{lang:'th-TH'}];
  const micOpen = () => ['A','B'].some(s => document.getElementById('micBtn'+s).classList.contains('mic-listening'));
  const synth = { speaking:false, pending:false,
    getVoices(){ return window.__voices; },
    speak(u){ window.__spoken.push({text:u.text, lang:u.lang, mic: micOpen()}); setTimeout(()=>{u.onstart&&u.onstart(); u.onend&&u.onend();}, 20); },
    cancel(){}, pause(){}, resume(){}, addEventListener(){} };
  Object.defineProperty(window, 'speechSynthesis', {value: synth, configurable: true});
  window.SpeechSynthesisUtterance = function(t){ this.text = t; };
  window.SpeechRecognition = window.webkitSpeechRecognition = function(){
    const rec = this; rec.stopped = false; window.__recs.push(rec);
    rec.start = () => setTimeout(() => rec.onstart && rec.onstart(), 10);
    rec.stop = () => { if (rec.stopped) return; rec.stopped = true; setTimeout(() => rec.onend && rec.onend(), 80); };
    rec.abort = rec.stop;
  };
  const active = () => [...window.__recs].reverse().find(r => !r.stopped);
  // כמו רומנית בטלפון: תוצאות חלקיות, והזיהוי לא מסיים לבד
  window.__interim = t => active().onresult({resultIndex:0, results:[Object.assign([{transcript:t}], {isFinal:false})]});
  window.__finalNoEnd = t => active().onresult({resultIndex:0, results:[Object.assign([{transcript:t}], {isFinal:true})]});
  window.__say = t => {
    const rec = [...window.__recs].reverse().find(r => !r.stopped);
    rec.onresult({resultIndex:0, results:[Object.assign([{transcript:t}], {isFinal:true})]});
    rec.stopped = true; setTimeout(() => rec.onend && rec.onend(), 20);
  };
})();
"""
CORS = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
mode = {'mm': 'ok', 'google': 'fail', 'lingva': 'fail'}
mm_calls, held = [], []

def mm(route):
    u = route.request.url; mm_calls.append(u)
    q = urllib.parse.parse_qs(urllib.parse.urlparse(u).query)['q'][0]
    m = mode['mm']
    if m == 'hold' or (m == 'hold-first' and not held): held.append((route, q)); return
    if m == 'fail': route.abort(); return
    if m == 'same': out = q
    elif m == 'quota': route.fulfill(status=200, headers=CORS, body=json.dumps({'responseData': {'translatedText': 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  23 HOURS 10 MINUTES'}, 'responseStatus': 429})); return
    else: out = 'MM:' + q
    route.fulfill(status=200, headers=CORS, body=json.dumps({'responseData': {'translatedText': out}, 'responseStatus': 200}))
def release_held():
    while held:
        r, q = held.pop(0)
        try: r.fulfill(status=200, headers=CORS, body=json.dumps({'responseData': {'translatedText': 'MM:' + q}, 'responseStatus': 200}))
        except Exception: pass
def google(route):
    if mode['google'] == 'ok': route.fulfill(status=200, headers=CORS, body=json.dumps([['GG:ok', 'iw']]))
    elif mode['google'] == 'hold': held.append((route, 'g'))
    else: route.abort()
def lingva(route):
    if mode['lingva'] == 'ok': route.fulfill(status=200, headers=CORS, body=json.dumps({'translation': 'LG:ok'}))
    elif mode['lingva'] == 'hold': held.append((route, 'l'))
    else: route.abort()

def new_page(b, init_extra=''):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    # התרגום ב-Groq כבוי בבדיקות הישנות (הן בודקות את MyMemory). סעיף 27 בודק אותו עם ברירת המחדל.
    ctx.add_init_script(init_extra + "if (!window.__groqDefault && localStorage.getItem('tvt_groq_translate') === null) localStorage.setItem('tvt_groq_translate','false');" + MOCK)
    page = ctx.new_page()
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.route('https://api.mymemory.translated.net/**', mm)
    page.route('https://clients5.google.com/**', google)
    for h in ['https://lingva.ml/**', 'https://lingva.lunar.icu/**', 'https://translate.plausibility.cloud/**']:
        page.route(h, lingva)
    page.goto(URL); page.wait_for_load_state('networkidle')
    return ctx, page, errs

def reset():
    mode.update({'mm': 'ok', 'google': 'fail', 'lingva': 'fail'}); release_held(); mm_calls.clear()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    ctx, page, errs = new_page(b)
    cls = lambda sel: page.get_attribute(sel, 'class')
    tap = lambda sel: page.evaluate(f"document.querySelector('{sel}').click()")  # כפתור מאזין מהבהב, ולכן לוחצים ישירות

    # 1. מיקרופון: מעבר מהיר מא׳ לב׳ לא מכבה את ב׳
    tap('#micBtnA'); page.wait_for_timeout(40); tap('#micBtnB'); page.wait_for_timeout(300)
    ok('mic A->B: B keeps listening', 'mic-listening' in cls('#micBtnB'))
    page.evaluate("window.__say('hello there')"); page.wait_for_timeout(200)
    ok('mic A->B: B speech captured', page.input_value('#inputB') == 'hello there', page.input_value('#inputB'))
    # עצירה ולחיצה חוזרת מהירה
    tap('#micBtnA'); page.wait_for_timeout(40); tap('#micBtnA'); page.wait_for_timeout(20); tap('#micBtnA'); page.wait_for_timeout(300)
    ok('mic stop + quick re-tap: still listening', 'mic-listening' in cls('#micBtnA'))
    tap('#micBtnA'); page.wait_for_timeout(200)

    # 2. תשובה ישנה לא דורסת משפט מהיר
    reset(); mode['mm'] = 'hold'
    page.fill('#inputA', 'משפט ארוך שמחכה לרשת'); page.click('#sendBtnA'); page.wait_for_timeout(100)
    page.click('#quickPhrasesGrid button >> nth=0'); page.wait_for_timeout(150)
    release_held(); page.wait_for_timeout(300)
    ok('stale network reply does not overwrite quick phrase', page.inner_text('#outputA') == 'Hello', page.inner_text('#outputA'))

    # 3. אחרי כשל: "הגדל" לא מציג משפט קודם
    reset(); mode['mm'] = 'fail'
    page.fill('#inputA', 'משפט שייכשל בתרגום'); page.click('#sendBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent === 'שגיאה בתרגום.'")
    page.click('#bigTextBtnA'); page.wait_for_timeout(150)
    ok('after failure, big text does not show the previous sentence', not page.is_visible('#bigTextModal') and 'אין עדיין תרגום' in page.inner_text('#statusBannerText'))

    # 4. הקראה אוטומטית לא מתחילה כשהמיקרופון פתוח
    reset(); mode['mm'] = 'hold'; page.evaluate('window.__spoken=[]')
    page.fill('#inputA', 'איפה התחנה הקרובה'); page.press('#inputA', 'Enter'); page.wait_for_timeout(100)
    tap('#micBtnB'); page.wait_for_timeout(100)
    release_held(); page.wait_for_timeout(300)
    spoken = [s for s in page.evaluate('window.__spoken') if s['text'].strip()]
    ok('no auto-speak into an open mic', page.inner_text('#outputA') == 'MM:איפה התחנה הקרובה' and not any(s['mic'] for s in spoken), str(spoken))
    tap('#micBtnB'); page.wait_for_timeout(200)

    # 5. טקסט ארוך מחולק לחלקים של עד 450 בתים
    reset()
    sent = 'זה משפט ארוך מאוד שנועד לבדוק את החלוקה של טקסט לחלקים קטנים לפני שליחה לשירות התרגום. '
    page.fill('#inputA', (sent * 7).strip()); page.click('#sendBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent.startsWith('MM:')", timeout=15000)
    qs = [urllib.parse.parse_qs(urllib.parse.urlparse(u).query)['q'][0] for u in mm_calls]
    ok('long text split into chunks <= 450 bytes', len(qs) >= 2 and all(len(q.encode()) <= 450 for q in qs), f'{len(qs)} chunks, max {max(len(q.encode()) for q in qs)} bytes')

    # 6. כשהכל תקוע: הודעה תוך כ-12 שניות, ובדרך "מנסה שירות גיבוי"
    reset(); mode.update({'mm': 'hold', 'google': 'hold', 'lingva': 'hold'})
    page.click('#dismissBannerBtn') if page.is_visible('#dismissBannerBtn') else None
    t0 = time.time()
    page.fill('#inputA', 'משפט כשהרשת תקועה לגמרי'); page.click('#sendBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent.includes('גיבוי')", timeout=9000)
    t_backup = time.time() - t0
    page.wait_for_function("document.getElementById('statusBannerText').textContent.includes('יותר מדי זמן')", timeout=16000)
    dt = time.time() - t0
    ok('stuck network: backup notice, then error within ~12s', 5 < t_backup < 8 and dt < 13.5, f'backup at {t_backup:.1f}s, error at {dt:.1f}s')
    reset()

    # 7. MyMemory מחזיר את המקור בלי שינוי: מנסים גיבוי
    mode.update({'mm': 'same', 'google': 'ok'})
    page.fill('#inputA', 'משפט שחוזר בלי תרגום'); page.click('#sendBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent === 'GG:ok'", timeout=8000)
    ok('unchanged MyMemory result falls back to backup', True)
    reset()

    # 8. מילה "invalid" בתרגום אמיתי לא נזרקת
    page.route('https://api.mymemory.translated.net/**', lambda r: r.fulfill(status=200, headers=CORS, body=json.dumps({'responseData': {'translatedText': 'My ticket is invalid'}, 'responseStatus': 200})))
    page.fill('#inputA', 'הכרטיס שלי לא תקף'); page.click('#sendBtnA'); page.wait_for_timeout(400)
    ok('translation containing "invalid" kept', page.inner_text('#outputA') == 'My ticket is invalid')
    page.unroute('https://api.mymemory.translated.net/**'); page.route('https://api.mymemory.translated.net/**', mm)

    # 9. מכסה נגמרה: MyMemory מושהה, ואימייל חדש מחזיר אותו
    reset(); mode.update({'mm': 'quota', 'google': 'ok'})
    page.fill('#inputA', 'בדיקת מכסה ראשונה'); page.click('#sendBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent === 'GG:ok'", timeout=8000)
    skip = page.evaluate("JSON.parse(localStorage.getItem('tvt_mm_skip'))")
    ok('quota: pause at most 1 hour', skip and 0 < skip['until'] - time.time() * 1000 <= 3600 * 1000 + 5000)
    n = len(mm_calls); mode['mm'] = 'ok'
    page.evaluate("localStorage.setItem('tvt_email','meni@example.com')")
    page.fill('#inputA', 'בדיקת מכסה עם אימייל'); page.click('#sendBtnA'); page.wait_for_timeout(500)
    ok('quota pause is per email', len(mm_calls) == n + 1 and page.inner_text('#outputA').startswith('MM:'))
    page.evaluate("localStorage.removeItem('tvt_email'); localStorage.removeItem('tvt_mm_skip')")
    reset()

    # 10. "בדוק משמעות"
    page.fill('#inputA', 'בוקר טוב לכולם'); page.click('#sendBtnA'); page.wait_for_timeout(400)
    page.click('#checkBtnA'); page.wait_for_timeout(400)
    ok('check meaning shows back-translation', 'בחזרה לעברית' in page.inner_text('#backA') and 'MM:' in page.inner_text('#backA'), page.inner_text('#backA'))

    # 11. העתקה כפולה לא נתקעת
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.click('#copyBtnA'); page.wait_for_timeout(100); page.click('#copyBtnA'); page.wait_for_timeout(1700)
    ok('copy button returns to its label', page.inner_text('#copyBtnA') == 'העתק', page.inner_text('#copyBtnA'))

    # 12. היסטוריה ומועדפים נשמרים, ומועדף עובד בלי רשת
    n_hist = page.locator('#historyList > div').count()
    page.locator('#historyList > div >> nth=0').locator('button >> nth=0').click()
    ok('star adds a favorite chip', page.is_visible('#favWrap') and page.locator('#favPhrases button').count() == 2)
    page.reload(); page.wait_for_load_state('networkidle')
    ok('history persists after reload', page.locator('#historyList > div').count() == n_hist, f'{n_hist}')
    ok('favorites persist after reload', page.locator('#favPhrases button').count() == 2)
    mode['mm'] = 'fail'; n = len(mm_calls)
    page.locator('#favPhrases button >> nth=0').click(); page.wait_for_timeout(300)
    ok('favorite shows stored translation without network', page.inner_text('#outputA') == 'MM:בוקר טוב לכולם' and len(mm_calls) == n, page.inner_text('#outputA'))
    reset()

    # 13. תצוגה גדולה: נגללת, הכפתורים נראים, Escape ו"חזור" סוגרים
    long_text = 'This is a long sentence for the driver to read. ' * 40
    page.route('https://api.mymemory.translated.net/**', lambda r: r.fulfill(status=200, headers=CORS, body=json.dumps({'responseData': {'translatedText': long_text}, 'responseStatus': 200})))
    page.fill('#inputA', 'משפט שהתרגום שלו ארוך מאוד'); page.click('#sendBtnA'); page.wait_for_timeout(400)
    page.click('#bigTextBtnA'); page.wait_for_timeout(150)
    box = page.locator('#bigTextCloseBtn').bounding_box()
    ok('big text: close button on screen with long text', box and box['y'] + box['height'] <= 844, str(box))
    ok('big text: long text scrolls and its start is not cut off', page.evaluate("(()=>{const m=document.getElementById('bigTextModal');const t=document.getElementById('bigTextLangLabel').getBoundingClientRect();return m.scrollHeight>m.clientHeight && t.top>=0})()"))
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    ok('big text: Escape closes', not page.is_visible('#bigTextModal'))
    page.click('#bigTextBtnA'); page.wait_for_timeout(100)
    page.go_back(); page.wait_for_timeout(300)
    ok('big text: Android back closes it and stays in the app', not page.is_visible('#bigTextModal') and 'index.html' in page.url)
    page.unroute('https://api.mymemory.translated.net/**'); page.route('https://api.mymemory.translated.net/**', mm)

    # 14. אימייל לא תקין לא נראה "נשמר" בפתיחה הבאה
    page.click('#settingsBtn'); page.fill('#optEmail', 'meni@example.com'); page.fill('#optEmail', 'meni.cohen@gm')
    page.click('#closeSettings'); page.click('#settingsBtn')
    ok('settings shows the email that is really saved', page.input_value('#optEmail') == 'meni@example.com' and 'נשמר' in page.inner_text('#emailStatus'))
    ok('voice rows have a play button per language', page.locator('#voiceInfo button').count() >= 6)
    page.click('#closeSettings')

    # 15. פנים-אל-פנים בתאית: הצד של ב׳ בשפה שלו
    page.select_option('#langB', 'th'); page.click('#flipModeBtn'); page.wait_for_timeout(200)
    ok('face-to-face Thai: B side in Thai', page.inner_text('#micLabelB') == 'กดแล้วพูด' and 'คำแปลสำหรับคุณ' in page.inner_text('#targetTagA') and page.get_attribute('#panelB', 'dir') == 'ltr')
    page.click('#quickPhrasesGrid button >> nth=0'); page.wait_for_timeout(200)
    page.click('#bigTextBtnA'); page.wait_for_timeout(100)
    ok('face-to-face: big text for B opens rotated toward B', 'face-to-face-flip' in cls('#bigTextModal'))
    page.click('#bigTextCloseBtn'); page.click('#flipModeBtn'); page.select_option('#langB', 'en')

    # 16. אזור לחיצה מוגדל: נגיעה 10px מעל "הגדל" עדיין פוגעת בו
    hit = page.evaluate("""(()=>{const b=document.getElementById('bigTextBtnA');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();
      const e=document.elementFromPoint(r.left+r.width/2, r.top-10);return e===b;})()""")
    ok('enlarged tap area on small buttons', hit)

    # 17. מלון בלי רשת לשפה בלי תבנית: אנגלית + שם המלון
    mode['mm'] = 'fail'
    page.select_option('#langB', 'ja'); page.fill('#hotelInput', 'Hotel Gracery')
    page.click('#hotelGoBtn'); page.wait_for_timeout(400)
    ok('hotel without network for Japanese: English + hotel name', page.inner_text('#bigTextContent') == 'Please take me to this address: Hotel Gracery', page.inner_text('#bigTextContent'))
    page.click('#bigTextCloseBtn'); page.select_option('#langB', 'en'); reset()

    # 20. דובר ב׳ ברומנית: הזיהוי לא מסיים לבד, האפליקציה מסיימת אחרי שקט ומתרגמת
    page.check('#autoTranslateOnStop'); page.select_option('#langB', 'ro')
    tap('#micBtnB'); page.wait_for_timeout(100)
    page.evaluate("window.__interim('Bună ziua')"); page.wait_for_timeout(400)
    page.evaluate("window.__interim('Bună ziua, unde este gara')")
    t0 = time.time()
    page.wait_for_function("document.getElementById('outputB').textContent.startsWith('MM:')", timeout=6000)
    dt = time.time() - t0
    ok('B in Romanian: ends after silence by itself and translates', 1.5 < dt < 3.5 and 'mic-listening' not in cls('#micBtnB') and page.inner_text('#outputB') == 'MM:Bună ziua, unde este gara', f'{dt:.1f}s {page.inner_text("#outputB")}')
    tap('#micBtnB'); page.wait_for_timeout(100)
    t0 = time.time()
    page.evaluate("window.__finalNoEnd('Mulțumesc pentru ajutor')")
    page.wait_for_function("document.getElementById('outputB').textContent === 'MM:Mulțumesc pentru ajutor'", timeout=4000)
    dt = time.time() - t0
    ok('B: final result without end from recognizer -> translated within ~0.5s', dt < 1.2, f'{dt:.1f}s')
    tap('#micBtnA'); page.wait_for_timeout(100)
    page.evaluate("window.__interim('אני מדבר ועוצר לחשוב')"); page.wait_for_timeout(1200)
    page.evaluate("window.__interim('אני מדבר ועוצר לחשוב רגע ואז ממשיך')"); page.wait_for_timeout(1200)
    ok('short pause (1.2s) does not cut the sentence', 'mic-listening' in cls('#micBtnA'))
    page.wait_for_function("document.getElementById('outputA').textContent === 'MM:אני מדבר ועוצר לחשוב רגע ואז ממשיך'", timeout=4000)
    ok('after the pause, the full sentence is translated', True)
    page.uncheck('#autoTranslateOnStop'); page.select_option('#langB', 'en'); reset()

    # 21. מצב האזנה: שיחה ברומנית לזמן קצוב, תרגום חי לעברית, סיכום
    page.click('#listenOpenBtn'); page.wait_for_timeout(150)
    ok('listen mode opens', page.is_visible('#listenModal') and page.locator('#listenDurations button').count() == 5)
    page.click('#listenModes button[data-mode="live"]')
    ok('live mode: auto-detect not offered', page.evaluate("document.querySelector('#listenLang option[value=auto]').disabled") and page.input_value('#listenLang') != 'auto')
    page.select_option('#listenLang', 'ro')
    page.evaluate("document.querySelector('#listenDurations button').dataset.sec='6'")
    page.click('#listenDurations button >> nth=0')
    n_recs = page.evaluate('window.__recs.length')
    tap('#listenStartBtn'); page.wait_for_timeout(150)
    page.evaluate("window.__finalNoEnd('Bună ziua')"); page.wait_for_timeout(900)
    ok('listen: keeps listening after a sentence (restarts by itself)', page.evaluate('window.__recs.length') >= n_recs + 2 and 'עצור' in page.inner_text('#listenStartBtn'))
    page.evaluate("window.__interim('Unde este gara centrală')")
    page.wait_for_function("document.getElementById('listenRows').innerText.includes('MM:Unde este gara centrală')", timeout=5000)
    rows_text = page.inner_text('#listenRows')
    ok('listen: each sentence translated to Hebrew while listening', 'שלום' in rows_text and 'Bună ziua' in rows_text, rows_text[:120].replace('\n', ' | '))
    page.wait_for_function("document.getElementById('listenStatus').textContent.includes('הסתיימה')", timeout=9000)
    ok('listen: stops by itself when the time is up', 'התחל' in page.inner_text('#listenStartBtn') and '2 משפטים' in page.inner_text('#listenStatus'), page.inner_text('#listenStatus'))
    page.click('#listenCopyBtn'); page.wait_for_timeout(150)
    clip = page.evaluate("navigator.clipboard.readText()")
    ok('listen: copy gives the Hebrew translation', clip == 'שלום\nMM:Unde este gara centrală', repr(clip))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    ok('listen: Escape closes', not page.is_visible('#listenModal'))
    first = page.locator('#historyList > div >> nth=0').inner_text()
    ok('listen: whole conversation saved in history', '🎧 האזנה' in first and 'MM:Unde este gara centrală' in first, first[:80].replace('\n', ' | '))
    page.click('#listenOpenBtn'); page.wait_for_timeout(100)
    ok('listen: remembers live mode', 'תרגום חי' in page.inner_text('#listenModes button.bg-amber-600'))
    tap('#listenStartBtn'); page.wait_for_timeout(150)
    page.evaluate("window.__interim('Mulțumesc mult pentru tot')"); page.wait_for_timeout(300)
    tap('#listenStartBtn')
    page.wait_for_function("document.getElementById('listenStatus').textContent.includes('הסתיימה')", timeout=6000)
    ok('listen: stopping early keeps the last sentence', 'Mulțumesc mult pentru tot' in page.inner_text('#listenRows'))
    page.go_back(); page.wait_for_timeout(200)
    ok('listen: Android back closes it and stays in the app', not page.is_visible('#listenModal') and 'index.html' in page.url)
    reset()
    ok('no JS errors (main page)', not errs, str(errs))
    ctx.close()

    # 22. הקלטה שקטה: מיקרופון מדומה + Groq מדומה
    MEDIA = """(() => {
      const stream = { getTracks: () => [{ stop() { window.__micStopped = true; } }] };
      navigator.mediaDevices.getUserMedia = async () => {
        if (window.__micDenied) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }
        window.__micStopped = false; return stream; };
      window.MediaRecorder = function () {
        this.state = 'inactive'; this.mimeType = 'audio/webm;codecs=opus';
        this.start = () => { this.state = 'recording'; this._t = setInterval(() => this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) }), 200); };
        this.stop = () => { clearInterval(this._t); this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(2000)]) }); this.onstop && this.onstop(); }, 20); };
      };
      window.MediaRecorder.isTypeSupported = m => m.startsWith('audio/webm');
      window.AudioContext = function () {
        this.createMediaStreamSource = () => ({ connect() {} });
        this.createAnalyser = () => ({ fftSize: 512, getByteTimeDomainData(b) { for (let i = 0; i < b.length; i++) b[i] = 128 + Math.round(Math.sin(i) * 40); } });
        this.close = () => {};
      };
    })();"""
    groq = {'mode': 'ok', 'calls': []}
    SEGS = {'language': 'romanian', 'duration': 12.0, 'text': 'x', 'segments': [
        {'start': 0.0, 'end': 2.5, 'text': ' Bună ziua, bine ați venit la castel.'},
        {'start': 6.0, 'end': 8.0, 'text': ' Turul durează aproximativ o oră.'}]}
    def groq_route(route):
        u = route.request.url
        auth = route.request.headers.get('authorization', '')
        if u.endswith('/models'):
            route.fulfill(status=200 if auth.endswith('a' * 40) else 401, headers=CORS, body=json.dumps({'data': []}))
            return
        groq['calls'].append((auth, route.request.post_data_buffer or b''))
        if groq['mode'] == '429':
            route.fulfill(status=429, headers=CORS, body=json.dumps({'error': {'message': 'Rate limit reached'}})); return
        route.fulfill(status=200, headers=CORS, body=json.dumps(SEGS))
    ctx4, page4, errs4 = new_page(b, MEDIA)
    page4.route('https://api.groq.com/**', groq_route)
    tap4 = lambda sel: page4.evaluate(f"document.querySelector('{sel}').click()")
    page4.click('#listenOpenBtn'); page4.wait_for_timeout(150)
    ok('silent mode is the default, auto-detect language', 'הקלטה שקטה' in page4.inner_text('#listenModes button.bg-amber-600') and page4.input_value('#listenLang') == 'auto')
    ok('silent mode without key: hint shown', page4.is_visible('#listenKeyHint'))
    page4.click('#listenKeyBtn'); page4.wait_for_selector('#settings[open]')
    page4.fill('#optGroqKey', 'not-a-key'); page4.click('#saveGroqBtn'); page4.wait_for_timeout(100)
    ok('key format checked', 'gsk_' in page4.inner_text('#groqStatus'))
    page4.fill('#optGroqKey', 'gsk_' + 'b' * 40); page4.click('#saveGroqBtn'); page4.wait_for_timeout(400)
    ok('wrong key reported', 'לא תקין' in page4.inner_text('#groqStatus'), page4.inner_text('#groqStatus'))
    page4.fill('#optGroqKey', 'gsk_' + 'a' * 40); page4.click('#saveGroqBtn')
    page4.wait_for_function("document.getElementById('groqStatus').textContent.includes('עובד')", timeout=3000)
    ok('valid key saved and tested', True)
    page4.click('#closeSettings'); page4.wait_for_timeout(100)
    ok('key hint gone after saving', not page4.is_visible('#listenKeyHint'))
    page4.evaluate("document.querySelector('#listenDurations button').dataset.sec='2'")
    page4.click('#listenDurations button >> nth=0')
    tap4('#listenStartBtn'); page4.wait_for_timeout(500)
    ok('silent: recording with level meter, no speech recognizer used', page4.is_visible('#listenMeter') and 'מקליט בשקט' in page4.inner_text('#listenStatus') and page4.evaluate('window.__recs.length') == 0)
    page4.wait_for_function("document.getElementById('listenStatus').textContent.includes('הסתיים')", timeout=10000)
    rows = page4.inner_text('#listenRows')
    ok('silent: stops by itself, transcribed and translated to Hebrew', 'MM:Bună ziua, bine ați venit la castel. Turul durează aproximativ o oră.' in rows or ('MM:' in rows and 'Turul' in rows), rows[:160].replace('\n', ' | '))
    ok('silent: times shown, language detected', '0:00' in rows and 'רומנית' in page4.inner_text('#listenStatus'), page4.inner_text('#listenStatus'))
    auth, body = groq['calls'][-1]
    ok('silent: one upload with the user key, Whisper model, auto language', auth == 'Bearer gsk_' + 'a' * 40 and b'whisper-large-v3-turbo' in body and b'name="language"' not in body and len(groq['calls']) == 1)
    ok('silent: microphone released', page4.evaluate('window.__micStopped') is True)
    ok('silent: recording can be saved', page4.is_visible('#listenDownload') and page4.get_attribute('#listenDownload', 'href').startswith('blob:'))
    # מגבלת שימוש, ואז ניסיון חוזר מצליח בלי להקליט שוב
    groq['mode'] = '429'
    ok('silent: settings fold away to make room for results', not page4.is_visible('#listenSetup') and page4.is_visible('#listenSetupToggle'))
    page4.click('#listenSetupToggle')
    page4.select_option('#listenLang', 'ro')
    tap4('#listenStartBtn'); page4.wait_for_timeout(400); tap4('#listenStartBtn')
    page4.wait_for_function("document.getElementById('listenStatus').textContent.includes('מגבלת')", timeout=6000)
    ok('silent: limit reached -> clear message and retry button', page4.is_visible('#listenRetryBtn'))
    auth, body = groq['calls'][-1]
    ok('silent: chosen language sent to Whisper', b'name="language"' in body and b'ro' in body)
    groq['mode'] = 'ok'
    page4.click('#listenRetryBtn')
    page4.wait_for_function("document.getElementById('listenStatus').textContent.includes('הסתיים')", timeout=6000)
    ok('silent: retry transcribes the same recording', 'Turul' in page4.inner_text('#listenRows') and not page4.is_visible('#listenRetryBtn'))
    page4.evaluate('window.__micDenied = true')
    tap4('#listenStartBtn'); page4.wait_for_timeout(300)
    ok('silent: blocked microphone -> clear message', 'נחסמה' in page4.inner_text('#listenStatus'), page4.inner_text('#listenStatus'))
    page4.keyboard.press('Escape'); page4.wait_for_timeout(150)
    first = page4.locator('#historyList > div >> nth=0').inner_text()
    ok('silent: conversation saved in history', '🎧 האזנה' in first and 'Turul' in first)
    ok('no JS errors (silent recording)', not errs4, str(errs4))
    ctx4.close()

    # 23. צילום ותרגום + מחירים בשקלים
    from PIL import Image, ImageDraw
    img_path = '/tmp/tvt_test_menu.png'
    im = Image.new('RGB', (1200, 700), 'white'); d = ImageDraw.Draw(im); d.text((40, 40), 'MENU 60 THB', fill='black'); im.save(img_path)
    VISION = {'language': 'th', 'original': 'ข้าวผัด 60 บาท\nน้ำ 20 บาท', 'translation': 'אורז מוקפץ 60 באט\nמים 20 באט',
              'prices': [{'amount': 60, 'currency': 'THB', 'text': 'ข้าวผัด 60 บาท'}, {'amount': 20, 'currency': '฿', 'text': 'น้ำ 20 บาท'}], 'note': ''}
    vis = {'mode': 'ok', 'calls': []}
    def vision_route(route):
        u = route.request.url
        if u.endswith('/models'):
            ok_key = route.request.headers.get('authorization', '').endswith('a' * 40)
            route.fulfill(status=200 if ok_key else 401, headers=CORS, body=json.dumps({'data': [
                {'id': 'qwen/qwen3.8-27b', 'active': True}, {'id': 'meta-models/muse-spark-open', 'active': True}, {'id': 'whisper-large-v3-turbo', 'active': True}]})); return
        body = json.loads(route.request.post_data or '{}')
        vis['calls'].append(body)
        if vis['mode'] == 'gone' and body.get('model') == 'qwen/qwen3.8-27b':
            route.fulfill(status=404, headers=CORS, body=json.dumps({'error': {'message': 'The model `qwen/qwen3.8-27b` does not exist or you do not have access to it.', 'code': 'model_not_found'}})); return
        if vis['mode'] == '401':
            route.fulfill(status=401, headers=CORS, body=json.dumps({'error': {'message': 'Invalid API Key'}})); return
        if vis['mode'] == 'nojson' and 'response_format' in body:
            route.fulfill(status=400, headers=CORS, body=json.dumps({'error': {'message': 'response_format json_object is not supported with images'}})); return
        content = '<think>reading the menu {items}</think>\n' + json.dumps(VISION, ensure_ascii=False)  # מודלים עם "חשיבה"
        route.fulfill(status=200, headers=CORS, body=json.dumps({'choices': [{'message': {'content': content}}]}))
    fx_calls = []
    def fx_route(route):
        fx_calls.append(route.request.url)
        route.fulfill(status=200, headers=CORS, body=json.dumps({'result': 'success', 'time_last_update_utc': 'Thu, 19 Nov 2026 00:00:01 +0000', 'rates': {'ILS': 1, 'THB': 10.0, 'EUR': 0.25}}))
    ctx5, page5, errs5 = new_page(b)
    page5.route('https://api.groq.com/**', vision_route)
    page5.route('https://open.er-api.com/**', fx_route)
    page5.set_input_files('#galleryInput', img_path); page5.wait_for_timeout(300)
    ok('camera: opens, no key -> hint', page5.is_visible('#camModal') and page5.is_visible('#camKeyHint') and page5.is_visible('#camPreview'))
    page5.click('#camKeyBtn'); page5.wait_for_selector('#settings[open]')
    page5.fill('#optGroqKey', 'gsk_' + 'a' * 40); page5.click('#saveGroqBtn'); page5.wait_for_timeout(300); page5.click('#closeSettings')
    page5.wait_for_function("!document.getElementById('camResult').classList.contains('hidden')", timeout=8000)
    ok('camera: continues by itself after the key is saved, Hebrew translation shown', page5.inner_text('#camTranslation') == 'אורז מוקפץ 60 באט\nמים 20 באט', repr(page5.inner_text('#camTranslation')))
    call = vis['calls'][-1]
    img_part = call['messages'][0]['content'][1]['image_url']['url']
    ok('camera: image resized and sent as JPEG to a current vision model', call['model'] == 'qwen/qwen3.8-27b' and img_part.startswith('data:image/jpeg;base64,') and len(img_part) < 3.6 * 1024 * 1024 and 'Hebrew' in call['messages'][0]['content'][0]['text'])
    page5.wait_for_function("document.getElementById('camPriceList').children.length === 2", timeout=5000)
    prices = page5.inner_text('#camPriceList')
    ok('prices: converted to shekels (also from the ฿ symbol)', '≈ ₪6' in prices and '≈ ₪2' in prices, prices.replace('\n', ' | '))
    ok('prices: rates credit shown', 'ExchangeRate-API' in page5.inner_text('#camRatesInfo') and len(fx_calls) == 1)
    ok('camera: original text and language', 'ข้าวผัด' in page5.locator('#camOriginal').text_content() and 'תאילנדית' in page5.inner_text('#camLangName'))
    page5.click('#camBigBtn'); page5.wait_for_timeout(150)
    ok('camera: big text opens above it', page5.is_visible('#bigTextModal') and 'אורז מוקפץ' in page5.inner_text('#bigTextContent'))
    page5.click('#bigTextCloseBtn'); page5.wait_for_timeout(150)
    ok('camera: still open after closing big text', page5.is_visible('#camModal'))
    page5.click('#camAltBtn')
    page5.wait_for_function("document.getElementById('camAlt').textContent.includes('MM:')", timeout=8000)
    ok('camera: alternative translation via the regular chain', 'langpair=th%7Che' in mm_calls[-1])
    # מצב JSON לא נתמך -> ניסיון חוזר בלי, ומטבע מהמטמון (בלי בקשה נוספת)
    def wait_calls(k, ms=8000):
        t0 = time.time()
        while len(vis['calls']) < k and time.time() - t0 < ms / 1000: page5.wait_for_timeout(100)
    vis['mode'] = 'nojson'; n = len(vis['calls'])
    page5.evaluate("document.getElementById('galleryInput').value = ''"); page5.set_input_files('#galleryInput', img_path)
    wait_calls(n + 2)
    page5.wait_for_function("!document.getElementById('camResult').classList.contains('hidden') && document.getElementById('camPriceList').children.length === 2", timeout=8000)
    ok('camera: falls back when JSON mode is refused; rates cached', len(vis['calls']) == n + 2 and 'response_format' not in vis['calls'][-1] and len(fx_calls) == 1)
    # המודל הושבת (404): עוברים לבא שקיים עכשיו, בלי שהמשתמש ירגיש
    vis['mode'] = 'gone'; n = len(vis['calls'])
    page5.evaluate("document.getElementById('galleryInput').value = ''"); page5.set_input_files('#galleryInput', img_path)
    wait_calls(n + 2)
    page5.wait_for_function("!document.getElementById('camResult').classList.contains('hidden')", timeout=8000)
    ok('camera: retired model -> switches to the next available one', [c['model'] for c in vis['calls'][n:n + 2]] == ['qwen/qwen3.8-27b', 'meta-models/muse-spark-open'] and 'אורז מוקפץ' in page5.inner_text('#camTranslation'), str([c['model'] for c in vis['calls'][n:]]))
    vis['mode'] = '401'; n = len(vis['calls'])
    page5.evaluate("document.getElementById('galleryInput').value = ''"); page5.set_input_files('#galleryInput', img_path)
    wait_calls(n + 1)
    page5.wait_for_function("document.getElementById('camStatus').textContent.includes('לא תקין')", timeout=8000)
    ok('camera: wrong key -> clear message and settings hint', page5.is_visible('#camKeyHint'))
    vis['mode'] = 'ok'
    page5.go_back(); page5.wait_for_timeout(250)
    ok('camera: Android back closes it', not page5.is_visible('#camModal'))
    first = page5.locator('#historyList > div >> nth=0').inner_text()
    ok('camera: saved in history', '📷 צילום' in first and 'אורז מוקפץ' in first)

    # 24. "שתף אל המתורגמן": טקסט בשפה זרה (זיהוי אוטומטי), טקסט בעברית, ותמונה
    reset()
    page5.evaluate("""caches.open('share-inbox').then(c => c.put('./__shared-meta', new Response(JSON.stringify({ text: 'Camera este gata, vă așteptăm.', hasImage: false }))))""")
    page5.goto(URL + '?shared=1'); page5.wait_for_load_state('networkidle')
    page5.wait_for_function("document.getElementById('outputB').textContent.startsWith('MM:')", timeout=10000)
    ok('share: foreign text translated to Hebrew with auto-detect', page5.inner_text('#outputB') == 'MM:Camera este gata, vă așteptăm.' and 'langpair=Autodetect%7Che' in mm_calls[-1], mm_calls[-1][-60:])
    ok('share: address cleaned and inbox emptied', '?shared' not in page5.url and page5.evaluate("caches.open('share-inbox').then(c => c.keys()).then(k => k.length)") == 0)
    ok('share: auto-detected entry shows in history', 'זוהתה אוטומטית' in page5.locator('#historyList > div >> nth=0').inner_text())
    page5.evaluate("""caches.open('share-inbox').then(c => c.put('./__shared-meta', new Response(JSON.stringify({ text: 'אני מגיע למלון בשעה שמונה בערב', hasImage: false }))))""")
    page5.goto(URL + '?shared=1'); page5.wait_for_load_state('networkidle')
    page5.wait_for_function("document.getElementById('outputA').textContent.startsWith('MM:')", timeout=8000)
    ok('share: Hebrew text translated to speaker B language', 'langpair=he%7Cen' in mm_calls[-1])
    b64 = __import__('base64').b64encode(open(img_path, 'rb').read()).decode()
    page5.evaluate("""async b64 => { const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)); const c = await caches.open('share-inbox');
      await c.put('./__shared-image', new Response(new Blob([bin], { type: 'image/png' }), { headers: { 'content-type': 'image/png' } }));
      await c.put('./__shared-meta', new Response(JSON.stringify({ text: '', hasImage: true }))); }""", b64)
    page5.goto(URL + '?shared=1'); page5.wait_for_load_state('networkidle')
    page5.wait_for_function("!document.getElementById('camResult').classList.contains('hidden')", timeout=8000)
    ok('share: shared image goes to photo translation', page5.is_visible('#camModal') and 'אורז מוקפץ' in page5.inner_text('#camTranslation'))
    ok('no JS errors (camera, prices, share)', not errs5, str(errs5))
    ctx5.close()

    # 25. שרת אישי (Cloudflare + Microsoft): חיבור בהגדרות, תרגום דרכו, וגיבוי כשהוא נופל
    srv = {'mode': 'ok', 'calls': []}
    def server_route(route):
        u = route.request.url; code = route.request.headers.get('x-access-code', '')
        srv['calls'].append(u)
        if code != 'my-secret-code-123':
            route.fulfill(status=401, headers=CORS, body=json.dumps({'ok': False, 'error': 'bad-code'})); return
        if u.endswith('/health'):
            route.fulfill(status=200, headers=CORS, body=json.dumps({'ok': True, 'translator': True})); return
        if srv['mode'] == 'down':
            route.fulfill(status=502, headers=CORS, body=json.dumps({'ok': False, 'error': 'azure-error'})); return
        body = json.loads(route.request.post_data or '{}')
        route.fulfill(status=200, headers=CORS, body=json.dumps({'ok': True, 'text': 'AZ:' + body['text'], 'provider': 'azure'}))
    reset()
    ctx6, page6, errs6 = new_page(b)
    page6.route('https://tvt-test.example.workers.dev/**', server_route)
    page6.click('#settingsBtn'); page6.wait_for_selector('#settings[open]')
    ok('server: not connected by default', 'לא מחובר' in page6.inner_text('#serverStatus'))
    page6.fill('#optServerUrl', 'tvt-test.example.workers.dev/'); page6.fill('#optServerCode', 'wrong-code-xyz'); page6.click('#saveServerBtn')
    page6.wait_for_function("document.getElementById('serverStatus').textContent.includes('לא נכון')", timeout=5000)
    ok('server: wrong access code reported and not saved', page6.evaluate("localStorage.getItem('tvt_server')") is None)
    page6.fill('#optServerCode', 'my-secret-code-123'); page6.click('#saveServerBtn')
    page6.wait_for_function("document.getElementById('serverStatus').textContent.includes('מחובר')", timeout=5000)
    ok('server: connected, address normalized to https', page6.input_value('#optServerUrl') == 'https://tvt-test.example.workers.dev')
    page6.click('#closeSettings')
    n_mm = len(mm_calls)
    page6.fill('#inputA', 'איפה אפשר לקנות כרטיס לרכבת'); page6.click('#sendBtnA')
    page6.wait_for_function("document.getElementById('outputA').textContent.startsWith('AZ:')", timeout=8000)
    ok('server: translation goes through the personal server first', page6.inner_text('#outputA') == 'AZ:איפה אפשר לקנות כרטיס לרכבת' and len(mm_calls) == n_mm)
    srv['mode'] = 'down'
    page6.fill('#inputA', 'משפט כשהשרת לא זמין בכלל'); page6.click('#sendBtnA')
    page6.wait_for_function("document.getElementById('outputA').textContent.startsWith('MM:')", timeout=10000)
    ok('server: falls back to the regular chain when the server fails', len(mm_calls) == n_mm + 1)
    page6.click('#settingsBtn'); page6.wait_for_selector('#settings[open]')
    ok('server: settings show the last server problem', 'אבל בתרגום האחרון' in page6.inner_text('#serverStatus'), page6.inner_text('#serverStatus'))
    page6.fill('#optServerUrl', ''); page6.click('#saveServerBtn'); page6.wait_for_timeout(200)
    ok('server: disconnect by clearing the address', page6.evaluate("localStorage.getItem('tvt_server')") is None and 'לא מחובר' in page6.inner_text('#serverStatus'))
    page6.click('#closeSettings')
    ok('no JS errors (server)', not errs6, str(errs6))
    ctx6.close()

    # 26. Whisper בשיחה: מיקרופון שקט שמסיים לבד, וזיהוי אוטומטי של מי מדבר
    MEDIA2 = """(() => {
      window.__level = 0.02; window.__gum = 0;
      const stream = { getTracks: () => [{ stop() {} }] };
      navigator.mediaDevices.getUserMedia = async () => { window.__gum++; return stream; };
      window.MediaRecorder = function () {
        this.state = 'inactive'; this.mimeType = 'audio/webm;codecs=opus';
        this.start = () => { this.state = 'recording'; this._t = setInterval(() => this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(3000)], { type: 'audio/webm' }) }), 200); };
        this.stop = () => { clearInterval(this._t); this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(1000)]) }); this.onstop && this.onstop(); }, 20); };
      };
      window.MediaRecorder.isTypeSupported = m => m.startsWith('audio/webm');
      window.AudioContext = function () {
        this.createMediaStreamSource = () => ({ connect() {} });
        this.createAnalyser = () => ({ fftSize: 512, getByteTimeDomainData(b) { const a = Math.round(window.__level * 90); for (let i = 0; i < b.length; i++) b[i] = 128 + (i % 2 ? a : -a); } });
        this.close = () => {};
      };
    })();"""
    wq = {'queue': [], 'calls': []}
    def whisper_route(route):
        u = route.request.url
        if u.endswith('/models'):
            route.fulfill(status=200, headers=CORS, body=json.dumps({'data': [{'id': 'whisper-large-v3-turbo'}]})); return
        wq['calls'].append(route.request.post_data_buffer or b'')
        lang, text = wq['queue'].pop(0) if wq['queue'] else ('english', '')
        route.fulfill(status=200, headers=CORS, body=json.dumps({'language': lang, 'text': text, 'duration': 2.0, 'segments': [{'start': 0, 'end': 2, 'text': text}]}))
    def say(pg, ms=1000):
        pg.evaluate('window.__level = 0.5'); pg.wait_for_timeout(ms); pg.evaluate('window.__level = 0.02')
    reset()
    ctx7, page7, errs7 = new_page(b, "localStorage.setItem('tvt_groq_key','gsk_'+'a'.repeat(40));" + MEDIA2)
    page7.route('https://api.groq.com/**', whisper_route)
    tap7 = lambda sel: page7.evaluate(f"document.querySelector('{sel}').click()")
    page7.click('#settingsBtn'); page7.wait_for_selector('#settings[open]')
    page7.click('#sttEngine button[data-engine="whisper"]')
    ok('whisper engine selectable in settings', page7.evaluate("JSON.parse(localStorage.getItem('tvt_stt_engine'))") == 'whisper')
    page7.click('#closeSettings')
    page7.check('#autoTranslateOnStop')
    wq['queue'].append(('hebrew', 'איפה התחנה הקרובה'))
    tap7('#micBtnA'); page7.wait_for_timeout(700)
    ok('whisper mic: recording quietly (no phone recognizer)', 'mic-listening' in page7.get_attribute('#micBtnA', 'class') and page7.evaluate('window.__recs.length') == 0)
    say(page7, 1000)
    t0 = time.time()
    page7.wait_for_function("document.getElementById('outputA').textContent === 'MM:איפה התחנה הקרובה'", timeout=8000)
    dt = time.time() - t0
    ok('whisper mic: stops by itself after silence, transcribes and translates', dt < 4 and b'name="language"' in wq['calls'][-1] and b'\r\n\r\nhe\r\n' in wq['calls'][-1], f'{dt:.1f}s')
    n = len(wq['calls'])
    tap7('#micBtnB'); page7.wait_for_timeout(300); tap7('#micBtnB'); page7.wait_for_timeout(500)
    ok('whisper mic: nothing said -> no request, clear message', len(wq['calls']) == n and 'לא זוהה דיבור' in page7.inner_text('#interimB'))
    # באג שדווח 20.11: רעש קצר אחרי הלחיצה סגר את ההקלטה לפני שהתחילו לדבר
    n = len(wq['calls']); wq['queue'].append(('hebrew', 'בדיקה אחרי רעש קצר'))
    tap7('#micBtnA'); page7.wait_for_timeout(350); say(page7, 250); page7.wait_for_timeout(3000)
    ok('whisper mic: a short noise after pressing does not close it', 'mic-listening' in page7.get_attribute('#micBtnA', 'class') and len(wq['calls']) == n)
    say(page7, 1000)
    page7.wait_for_function("document.getElementById('outputA').textContent === 'MM:בדיקה אחרי רעש קצר'", timeout=8000)
    ok('whisper mic: then the real sentence is recorded and translated', len(wq['calls']) == n + 1)
    # זיהוי אוטומטי של הדובר: שפה שלישית (רומנית) -> דובר ב׳ מתורגם לעברית; עברית -> דובר א׳
    wq['queue'].append(('romanian', 'Unde este gara centrală din oraș?'))
    page7.click('#autoTalkBtn'); page7.wait_for_timeout(700); say(page7, 900)
    page7.wait_for_function("document.getElementById('outputB').textContent.startsWith('MM:')", timeout=8000)
    ok('auto speaker: Romanian -> speaker B, translated to Hebrew', page7.inner_text('#outputB') == 'MM:Unde este gara centrală din oraș?' and 'langpair=ro%7Che' in mm_calls[-1] and 'רומנית' in page7.inner_text('#autoTalkStatus'), page7.inner_text('#autoTalkStatus'))
    ok('auto speaker: language detection requested (no language sent)', b'name="language"' not in wq['calls'][-1])
    wq['queue'].append(('english', 'תודה רבה על כל העזרה היום'))  # Whisper טועה בשפה, הכתב העברי מכריע
    page7.click('#autoTalkBtn'); page7.wait_for_timeout(700); say(page7, 900)
    page7.wait_for_function("document.getElementById('outputA').textContent === 'MM:תודה רבה על כל העזרה היום'", timeout=8000)
    ok('auto speaker: Hebrew script -> speaker A even if Whisper guessed wrong', 'דובר א׳' in page7.inner_text('#autoTalkStatus'))
    # מצב רציף: אחרי משפט והקראה, מתחיל להאזין שוב לבד
    page7.check('#autoTalkLoop'); g0 = page7.evaluate('window.__gum')
    wq['queue'].append(('romanian', 'Mulțumesc frumos pentru tot ajutorul'))
    page7.click('#autoTalkBtn'); page7.wait_for_timeout(700); say(page7, 900)
    page7.wait_for_function("document.getElementById('outputB').textContent === 'MM:Mulțumesc frumos pentru tot ajutorul'", timeout=8000)
    page7.wait_for_function(f"window.__gum >= {g0 + 2}", timeout=6000)
    ok('auto speaker (continuous): listens again by itself after the answer', 'מאזין' in page7.inner_text('#autoTalkLabel'))
    tap7('#autoTalkBtn'); page7.wait_for_timeout(600)
    ok('auto speaker: tap stops the continuous mode', 'דברו' in page7.inner_text('#autoTalkLabel'))
    page7.evaluate("localStorage.removeItem('tvt_groq_key')"); n = len(wq['calls'])
    page7.click('#autoTalkBtn'); page7.wait_for_timeout(400)
    ok('auto speaker without a Groq key: explains what to do, records nothing', 'מפתח Groq' in page7.inner_text('#autoTalkStatus') and len(wq['calls']) == n and 'דברו' in page7.inner_text('#autoTalkLabel'))
    tap7('#micBtnA'); page7.wait_for_timeout(400)
    ok('whisper mic without a key: hint, no recording', 'mic-listening' not in page7.get_attribute('#micBtnA', 'class') and len(wq['calls']) == n)
    ok('no JS errors (whisper conversation)', not errs7, str(errs7))
    ctx7.close()

    # 27. תרגום עם Groq (המפתח שכבר יש), בלי שרת. ברירת מחדל: דלוק כשיש מפתח.
    gq = {'mode': 'ok', 'calls': []}
    def groq_text_route(route):
        u = route.request.url
        if u.endswith('/models'):
            route.fulfill(status=200, headers=CORS, body=json.dumps({'data': [{'id': 'openai/gpt-oss-120b'}, {'id': 'openai/gpt-oss-20b'}, {'id': 'whisper-large-v3-turbo'}]})); return
        body = json.loads(route.request.post_data or '{}'); gq['calls'].append(body)
        if gq['mode'] == '401':
            route.fulfill(status=401, headers=CORS, body=json.dumps({'error': {'message': 'Invalid API Key'}})); return
        if gq['mode'] == '429-120b' and body.get('model') == 'openai/gpt-oss-120b':
            route.fulfill(status=429, headers={**CORS, 'retry-after': '30'}, body=json.dumps({'error': {'message': 'Rate limit reached'}})); return
        text = body['messages'][-1]['content']
        out = ('Sure! Here is the translation and some notes. ' * 40) if gq['mode'] == 'chatty' else 'GQ:' + text
        route.fulfill(status=200, headers=CORS, body=json.dumps({'choices': [{'message': {'role': 'assistant', 'content': out}}]}))
    reset(); mm_calls.clear()
    ctx8, page8, errs8 = new_page(b, "window.__groqDefault = 1; localStorage.setItem('tvt_groq_key','gsk_'+'a'.repeat(40));")
    page8.route('https://api.groq.com/**', groq_text_route)
    page8.click('#settingsBtn'); page8.wait_for_selector('#settings[open]')
    ok('groq translate: on by default when a key exists', page8.is_checked('#optGroqTranslate'))
    page8.click('#closeSettings')
    page8.fill('#inputA', 'אפשר לקבל חשבון בבקשה'); page8.click('#sendBtnA')
    page8.wait_for_function("document.getElementById('outputA').textContent.startsWith('GQ:')", timeout=8000)
    c = gq['calls'][-1]
    ok('groq translate: used first, no MyMemory call', page8.inner_text('#outputA') == 'GQ:אפשר לקבל חשבון בבקשה' and not mm_calls, page8.inner_text('#outputA'))
    ok('groq translate: strong model, low reasoning hidden, Hebrew->English prompt, text as user message',
       c['model'] == 'openai/gpt-oss-120b' and c.get('reasoning_effort') == 'low' and c.get('include_reasoning') is False
       and 'from Hebrew into English' in c['messages'][0]['content'] and c['messages'][1]['content'] == 'אפשר לקבל חשבון בבקשה', json.dumps(c)[:200])
    gq['mode'] = '429-120b'; n = len(gq['calls'])
    page8.fill('#inputA', 'איפה יש כאן בית מרקחת פתוח'); page8.click('#sendBtnA')
    page8.wait_for_function("document.getElementById('outputA').textContent.startsWith('GQ:')", timeout=8000)
    ok('groq translate: busy model -> second model, still Groq', [x['model'] for x in gq['calls'][n:]] == ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] and not mm_calls)
    gq['mode'] = 'ok'
    page8.click('#genderBBtn'); page8.wait_for_timeout(100)
    ok('gender chip: tap -> the other side is a man', page8.inner_text('#genderBBtn') == '👨')
    page8.click('#genderBBtn'); page8.wait_for_timeout(100)
    ok('gender chip: second tap -> a woman', page8.inner_text('#genderBBtn') == '👩')
    page8.click('#settingsBtn'); page8.wait_for_selector('#settings[open]')
    ok('gender: settings show the chip choice', page8.input_value('#optGenderB') == 'female')
    page8.select_option('#optGenderA', 'male'); page8.click('#closeSettings')
    page8.fill('#inputA', 'אתה יכול לעזור לי עם המזוודה'); page8.click('#sendBtnA')
    page8.wait_for_function("document.getElementById('outputA').textContent === 'GQ:אתה יכול לעזור לי עם המזוודה'", timeout=8000)
    sysmsg = gq['calls'][-1]['messages'][0]['content']
    ok('gender: "a man speaking to a woman" goes into the prompt', 'saying this message is a man' in sysmsg and 'spoken to is a woman' in sysmsg, sysmsg[-300:])
    ok('context: the previous sentences are sent, for context only', '- Same person: איפה יש כאן בית מרקחת פתוח' in sysmsg and 'do NOT translate' in sysmsg)
    page8.fill('#inputB', 'Of course, give it to me'); page8.click('#sendBtnB')
    page8.wait_for_function("document.getElementById('outputB').textContent === 'GQ:Of course, give it to me'", timeout=8000)
    sysmsg = gq['calls'][-1]['messages'][0]['content']
    ok('gender + context from the other side: a woman answering a man', 'saying this message is a woman' in sysmsg and 'spoken to is a man' in sysmsg
       and '- The other person: אתה יכול לעזור לי עם המזוודה' in sysmsg and 'from English into Hebrew' in sysmsg, sysmsg[-300:])
    n = len(gq['calls'])
    page8.click('#genderBBtn'); page8.wait_for_timeout(100)
    page8.fill('#inputA', 'אתה יכול לעזור לי עם המזוודה'); page8.click('#sendBtnA'); page8.wait_for_timeout(1500)
    ok('gender changed -> the same sentence is translated again, not from memory', len(gq['calls']) == n + 1 and 'spoken to is' not in gq['calls'][-1]['messages'][0]['content'])
    gq['mode'] = 'chatty'
    page8.fill('#inputA', 'כמה עולה כרטיס לתחנה המרכזית'); page8.click('#sendBtnA')
    page8.wait_for_function("document.getElementById('outputA').textContent.startsWith('MM:')", timeout=8000)
    ok('groq translate: an answer that is not a translation is rejected -> MyMemory', page8.inner_text('#outputA') == 'MM:כמה עולה כרטיס לתחנה המרכזית')
    gq['mode'] = '401'; mm_calls.clear()
    page8.fill('#inputA', 'תודה על הכל'); page8.click('#sendBtnA')
    page8.wait_for_function("document.getElementById('outputA').textContent.startsWith('MM:')", timeout=8000)
    n = len(gq['calls'])
    page8.fill('#inputA', 'נתראה מחר בבוקר'); page8.click('#sendBtnA')
    page8.wait_for_function("document.getElementById('outputA').textContent === 'MM:נתראה מחר בבוקר'", timeout=8000)
    ok('groq translate: bad key -> regular services, and Groq is not retried right away', len(gq['calls']) == n)
    page8.reload(); page8.wait_for_load_state('networkidle'); gq['mode'] = 'ok'; n = len(gq['calls'])
    page8.click('#settingsBtn'); page8.wait_for_selector('#settings[open]'); page8.uncheck('#optGroqTranslate'); page8.click('#closeSettings')
    page8.fill('#inputA', 'הרכבת יוצאת בעוד עשר דקות'); page8.click('#sendBtnA')
    page8.wait_for_function("document.getElementById('outputA').textContent.startsWith('MM:')", timeout=8000)
    ok('groq translate: switched off in settings -> not used', len(gq['calls']) == n and page8.evaluate("JSON.parse(localStorage.getItem('tvt_groq_translate'))") is False)
    ok('no JS errors (groq translate)', not errs8, str(errs8))
    ctx8.close()

    # 28. מצב האזנה עם Groq: כל ההקלטה מתורגמת בבקשה אחת, ואם התשובה לא תקינה, קטע-קטע
    bq = {'mode': 'ok', 'calls': []}
    def groq_listen_route(route):
        u = route.request.url
        if u.endswith('/models'):
            route.fulfill(status=200, headers=CORS, body=json.dumps({'data': [{'id': 'openai/gpt-oss-120b'}, {'id': 'openai/gpt-oss-20b'}, {'id': 'whisper-large-v3-turbo'}]})); return
        if '/audio/transcriptions' in u:
            route.fulfill(status=200, headers=CORS, body=json.dumps(SEGS)); return
        body = json.loads(route.request.post_data or '{}'); bq['calls'].append(body)
        if 'JSON array' in body['messages'][0]['content']:
            items = json.loads(body['messages'][-1]['content'])
            t = ['only one'] if bq['mode'] == 'bad' else ['GB:' + x for x in items]
            out = json.dumps({'t': t})
        else:
            out = 'GQ:' + body['messages'][-1]['content']
        route.fulfill(status=200, headers=CORS, body=json.dumps({'choices': [{'message': {'role': 'assistant', 'content': out}}]}))
    reset()
    ctx9, page9, errs9 = new_page(b, "window.__groqDefault = 1; localStorage.setItem('tvt_groq_key','gsk_'+'a'.repeat(40));" + MEDIA)
    page9.route('https://api.groq.com/**', groq_listen_route)
    tap9 = lambda sel: page9.evaluate(f"document.querySelector('{sel}').click()")
    def listen_once():
        page9.evaluate("document.querySelector('#listenDurations button').dataset.sec='2'")
        page9.click('#listenDurations button >> nth=0')
        tap9('#listenStartBtn')
        page9.wait_for_function("document.getElementById('listenStatus').textContent.includes('הסתיים')", timeout=12000)
        return page9.inner_text('#listenRows')
    page9.click('#listenOpenBtn'); page9.wait_for_timeout(150)
    rows = listen_once()
    c = bq['calls'][0] if bq['calls'] else {}
    ok('listen + Groq: whole recording translated in ONE request', len(bq['calls']) == 1 and 'GB:Bună ziua, bine ați venit la castel.' in rows and 'GB:Turul durează aproximativ o oră.' in rows and not mm_calls, rows[:120].replace('\n', ' | '))
    ok('listen + Groq: Romanian -> Hebrew, both segments sent together', 'from Romanian into Hebrew' in c.get('messages', [{}])[0].get('content', '') and json.loads(c['messages'][1]['content']) == ['Bună ziua, bine ați venit la castel.', 'Turul durează aproximativ o oră.'])
    bq['mode'] = 'bad'; bq['calls'].clear()
    if page9.is_visible('#listenSetupToggle'): page9.click('#listenSetupToggle')
    rows = listen_once()
    ok('listen + Groq: broken batch answer -> each segment translated on its own', len(bq['calls']) == 3 and 'GQ:Bună ziua, bine ați venit la castel.' in rows and 'GQ:Turul durează aproximativ o oră.' in rows, rows[:120].replace('\n', ' | '))
    ok('no JS errors (listen + Groq)', not errs9, str(errs9))
    ctx9.close()

    # 29. בדיקת מוכנות לטיול
    rq = {'auth': 'ok'}
    def groq_ready_route(route):
        u = route.request.url
        if rq['auth'] == 'bad':
            route.fulfill(status=401, headers=CORS, body=json.dumps({'error': {'message': 'Invalid API Key', 'code': 'invalid_api_key'}})); return
        if u.endswith('/models'):
            route.fulfill(status=200, headers=CORS, body=json.dumps({'data': [{'id': x} for x in ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'whisper-large-v3-turbo', 'qwen/qwen3.8-27b']]})); return
        body = json.loads(route.request.post_data or '{}')
        route.fulfill(status=200, headers=CORS, body=json.dumps({'choices': [{'message': {'role': 'assistant', 'content': 'GQ:' + body['messages'][-1]['content']}}]}))
    reset()
    ctx10, page10, errs10 = new_page(b, "window.__groqDefault = 1; localStorage.setItem('tvt_groq_key','gsk_'+'a'.repeat(40));")
    page10.route('https://api.groq.com/**', groq_ready_route)
    ready_rows = lambda: page10.evaluate("[...document.querySelectorAll('#readyList > div')].map(r => { const s = r.querySelectorAll('span'); return [s[1].textContent, r.dataset.level, s[2].textContent]; })")
    page10.click('#settingsBtn'); page10.wait_for_selector('#settings[open]')
    page10.click('#readyBtn')
    page10.wait_for_function("!document.getElementById('readyBtn').disabled && document.getElementById('readySummary').textContent.length > 6", timeout=15000)
    rr = {t: (lv, h) for t, lv, h in ready_rows()}
    lvl = lambda prefix: next((v for k, v in rr.items() if k.startswith(prefix)), (None, ''))
    ok('readiness: 12 checks shown', len(rr) == 12, str(list(rr.keys())))
    ok('readiness: Groq key, Whisper and camera OK', lvl('מפתח Groq')[0] == 'ok' and lvl('הקלטה שקטה')[0] == 'ok' and lvl('צילום')[0] == 'ok', str(rr)[:300])
    ok('readiness: Groq translation really tested (sample sentence)', lvl('תרגום Groq')[0] == 'ok' and 'GQ:' in lvl('תרגום Groq')[1], lvl('תרגום Groq')[1])
    ok('readiness: MyMemory OK, Google backup down = warning only', lvl('תרגום רגיל')[0] == 'ok' and lvl('גיבוי')[0] == 'warn')
    ok('readiness: phrasebook counted for speaker B language', lvl('שיחון')[0] == 'ok' and 'משפטים' in lvl('שיחון')[1])
    ok('readiness: summary says ready', page10.inner_text('#readySummary').startswith('✓ מוכן לטיול'), page10.inner_text('#readySummary'))
    rq['auth'] = 'bad'
    page10.click('#readyBtn')
    page10.wait_for_function("!document.getElementById('readyBtn').disabled && document.getElementById('readySummary').textContent.length > 6", timeout=15000)
    rr = {t: (lv, h) for t, lv, h in ready_rows()}
    ok('readiness: bad key -> marked to fix, summary says what to fix', lvl('מפתח Groq')[0] == 'bad' and page10.inner_text('#readySummary').startswith('✗'), page10.inner_text('#readySummary'))
    ok('no JS errors (readiness)', not errs10, str(errs10))
    ctx10.close()

    # 18. אחסון פגום לא מפיל את האפליקציה
    bad = """try{localStorage.setItem('tvt_cache_v2','null');localStorage.setItem('tvt_langA','__proto__');
      localStorage.setItem('tvt_history','{"x":1}');localStorage.setItem('tvt_favs','[1,null,{"a":2}]');}catch(e){}"""
    ctx2, page2, errs2 = new_page(b, bad)
    page2.fill('#inputA', 'בדיקה עם אחסון פגום'); page2.click('#sendBtnA'); page2.wait_for_timeout(400)
    ok('corrupted storage: app works', page2.locator('#quickPhrasesGrid button').count() == 12 and page2.inner_text('#outputA').startswith('MM:') and not errs2, str(errs2))
    ctx2.close()

    # 19. קול עברית שמדווח כ-iw-IL
    ctx3, page3, _ = new_page(b, "window.__voices=[{lang:'iw-IL'},{lang:'en-US'}];")
    page3.click('#settingsBtn')
    ok('Hebrew voice reported as iw-IL is recognized', 'עברית: ✓' in page3.inner_text('#voiceInfo'))
    ctx3.close()
    b.close()

fails = [r[0] for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed. FAILED:', fails)
sys.exit(1 if fails else 0)

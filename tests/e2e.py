import json, sys, urllib.parse
from playwright.sync_api import sync_playwright
URL='http://localhost:8766/index.html'; OUT='tests/out'
errors=[]; results=[]
def ok(name, cond, extra=''):
    results.append((name,bool(cond))); print(('PASS' if cond else 'FAIL'), name, extra)

MOCK = """
(() => {
  window.__spoken=[];
  const synth={speaking:false,pending:false,
    getVoices(){return [{lang:'he-IL'},{lang:'en-US'},{lang:'ru-RU'}];},
    speak(u){window.__spoken.push({text:u.text,lang:u.lang});setTimeout(()=>{u.onstart&&u.onstart();u.onend&&u.onend();},5);},
    cancel(){},pause(){},resume(){},addEventListener(){}};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  window.SpeechSynthesisUtterance=function(t){this.text=t;};
  window.__srLang=null; window.__srMode='final';
  window.SpeechRecognition=window.webkitSpeechRecognition=function(){
    this.start=()=>{window.__srLang=this.lang;setTimeout(()=>{this.onstart&&this.onstart();
      setTimeout(()=>{
        const r=[Object.assign([{transcript:'איפה המלון שלי'}],{isFinal: window.__srMode==='final'})];
        this.onresult&&this.onresult({resultIndex:0,results:r}); this.onend&&this.onend();},60);},10);};
    this.stop=()=>{};
  };
})();
"""
CORS={'access-control-allow-origin':'*','content-type':'application/json'}
mm_calls=[]; lingva_calls=[]; mode={'mm':'ok','lingva':'ok'}
def mm(route):
    u=route.request.url; mm_calls.append(u)
    q=urllib.parse.parse_qs(urllib.parse.urlparse(u).query)
    text=q['q'][0]
    if mode['mm']=='ok':
        route.fulfill(status=200,headers=CORS,body=json.dumps({'responseData':{'translatedText':'MM:'+text},'responseStatus':200}))
    elif mode['mm']=='quota':
        route.fulfill(status=200,headers=CORS,body=json.dumps({'responseData':{'translatedText':'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY'},'responseStatus':429}))
    else: route.abort()
def lingva(route):
    lingva_calls.append(route.request.url)
    if mode['lingva']=='ok': route.fulfill(status=200,headers=CORS,body=json.dumps({'translation':'LG:ok'}))
    else: route.abort()

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='he-IL')
    ctx.add_init_script(MOCK)
    page=ctx.new_page()
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.route('https://api.mymemory.translated.net/**',mm)
    page.route('https://lingva.ml/**',lingva)
    page.route('https://lingva.lunar.icu/**',lambda r:r.abort())
    page.route('https://translate.plausibility.cloud/**',lambda r:r.abort())
    page.route('https://www.google.com/maps/**',lambda r:r.fulfill(status=200,body='maps'))

    page.goto(URL); page.wait_for_load_state('networkidle')
    page.screenshot(path=f'{OUT}/m1_home.png',full_page=True)
    ok('rtl+title','מתורגמן' in page.title() and page.evaluate('document.documentElement.dir')=='rtl')
    ok('22 languages per select', page.locator('#langA option').count()==22 and page.locator('#langB option').count()==22)
    ok('quick phrases = 12', page.locator('#quickPhrasesGrid button').count()==12)

    # תרגום מקלדת דרך MyMemory
    page.fill('#inputA','איפה אפשר לאכול ארוחת ערב טובה')
    page.click('#sendBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent.startsWith('MM:')")
    ok('typed translate via MyMemory', 'MM:איפה אפשר' in page.inner_text('#outputA'))
    page.wait_for_timeout(200)
    ok('TTS en-US', page.evaluate('window.__spoken')[-1]['lang']=='en-US')
    ok('history entry', page.locator('#historyList > div').count()==1)
    ok('langpair he|en', 'langpair=he%7Cen' in mm_calls[-1], mm_calls[-1][-60:])

    # מטמון: אותו משפט פעם שנייה לא פונה לרשת (חיכוך: משנים אות כדי לעקוף lastSource ומחזירים)
    n=len(mm_calls)
    page.fill('#inputA','משפט אחר לגמרי אחד'); page.click('#sendBtnA'); page.wait_for_timeout(300)
    page.fill('#inputA','איפה אפשר לאכול ארוחת ערב טובה'); page.click('#sendBtnA'); page.wait_for_timeout(300)
    ok('cache avoids repeat network call', len(mm_calls)==n+1, f'{len(mm_calls)-n} calls')

    # מכסה נגמרה -> Lingva עם iw
    mode['mm']='quota'; lingva_calls.clear()
    page.fill('#inputA','איפה אפשר לקנות מתנות לילדים'); page.click('#sendBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent==='LG:ok'")
    ok('fallback to Lingva on quota', len(lingva_calls)>=1)
    ok('Lingva uses iw for Hebrew', '/api/v1/iw/en/' in lingva_calls[0], lingva_calls[0][:60])

    # כולם נפלו
    mode['mm']='fail'; mode['lingva']='fail'
    page.fill('#inputA','משפט שלא נשמר ולא בשיחון בכלל'); page.click('#sendBtnA')
    page.wait_for_function("!document.getElementById('statusBanner').classList.contains('hidden')")
    ok('error banner when all providers fail','לא זמינים' in page.inner_text('#statusBannerText'))
    page.click('#dismissBannerBtn')
    mode['mm']='ok'; mode['lingva']='ok'

    # מיקרופון (final) בלי תרגום אוטומטי
    page.click('#micBtnA'); page.wait_for_timeout(400)
    ok('STT he-IL', page.evaluate('window.__srLang')=='he-IL')
    ok('mic text in input, no auto-translate', page.input_value('#inputA')=='איפה המלון שלי' and 'נקלט' in page.inner_text('#interimA'))
    ok('mic button reset after end','mic-listening' not in page.get_attribute('#micBtnA','class'))
    # עם תרגום אוטומטי
    page.check('#autoTranslateOnStop'); page.click('#micBtnA')
    page.wait_for_function("document.getElementById('outputA').textContent.includes('איפה המלון')")
    ok('mic + auto translate', True)
    # עם תוצאה זמנית בלבד (Gemini fallback)
    page.evaluate("window.__srMode='interim'")
    page.fill('#inputA',''); page.click('#micBtnA'); page.wait_for_timeout(500)
    ok('interim-only result still captured', page.input_value('#inputA')=='איפה המלון שלי')
    page.uncheck('#autoTranslateOnStop')

    # שיחון אופליין למשפט מהיר + שפה ללא שיחון
    page.select_option('#langB','es')
    page.click('#quickPhrasesGrid button >> nth=0'); page.wait_for_timeout(400)
    ok('quick phrase he->es goes through network', 'langpair=he%7Ces' in mm_calls[-1], mm_calls[-1][-45:])
    page.select_option('#langA','es'); page.select_option('#langB','he')
    n=len(mm_calls)
    page.click('#quickPhrasesGrid button >> nth=0'); page.wait_for_timeout(300)
    ok('es->he quick phrase uses English source, offline phrasebook', page.inner_text('#outputA')=='שלום' and len(mm_calls)==n, page.inner_text('#outputA'))
    page.select_option('#langA','he'); page.select_option('#langB','ru')
    page.click('#quickPhrasesGrid button >> nth=6'); page.wait_for_timeout(250)
    ok('Russian phrase + ru-RU voice', page.inner_text('#outputA')=='Где туалет?' and page.evaluate('window.__spoken')[-1]['lang']=='ru-RU')

    # עוד משפטים
    page.click('#moreToggleBtn')
    ok('more phrases opens', not page.locator('#morePhrases').evaluate("e=>e.classList.contains('hidden')") and page.locator('#morePhrases button').count()>=25)
    page.screenshot(path=f'{OUT}/m2_more.png',full_page=True)
    page.click('#moreToggleBtn')

    # מלון
    page.select_option('#langA','he'); page.select_option('#langB','en')
    page.fill('#hotelInput','Hilton Tel Aviv'); page.click('#hotelGoBtn'); page.wait_for_timeout(300)
    ok('hotel he->en template + address', page.inner_text('#outputA')=='Please take me to this address: Hilton Tel Aviv', page.inner_text('#outputA'))
    page.select_option('#langB','es'); page.click('#hotelGoBtn'); page.wait_for_timeout(500)
    ok('hotel to Spanish: translated template + untouched hotel name', page.inner_text('#outputA').endswith('Hilton Tel Aviv') and page.inner_text('#outputA').startswith('MM:'), page.inner_text('#outputA'))
    page.select_option('#langA','es'); page.select_option('#langB','en'); page.click('#hotelGoBtn'); page.wait_for_timeout(400)
    ok('hotel works when speaker A is not Hebrew', page.inner_text('#outputA')=='Please take me to this address: Hilton Tel Aviv')
    page.select_option('#langA','he'); page.select_option('#langB','en')
    with ctx.expect_page() as pop:
        page.click('#hotelMapBtn')
    ok('maps opens with query', 'maps/search' in pop.value.url and 'Hilton' in pop.value.url)
    pop.value.close()

    # פנים-אל-פנים והגדלה
    page.click('#flipModeBtn')
    ok('face-to-face', 'face-to-face-flip' in page.get_attribute('#panelB','class') and 'פעיל' in page.inner_text('#flipModeLabel'))
    page.click('#switchTurnBtn')
    ok('flip survives turn switch','face-to-face-flip' in page.get_attribute('#panelB','class'))
    page.screenshot(path=f'{OUT}/m3_face.png')
    page.click('#flipModeBtn')
    page.click('#bigTextBtnA'); page.wait_for_selector('#bigTextModal:not(.hidden)')
    ok('big text modal shows translation', 'Hilton' in page.inner_text('#bigTextContent'))
    page.screenshot(path=f'{OUT}/m4_big.png')
    page.click('#bigTextCloseBtn')

    # הגדרות + אימייל
    page.click('#settingsBtn'); page.wait_for_selector('#settings[open]')
    info=page.inner_text('#voiceInfo')
    ok('settings voice info', 'עברית: ✓' in info and 'רומנית: ✗' in info, info[:70])
    page.fill('#optEmail','meni@example.com'); page.dispatch_event('#optEmail','change')
    page.screenshot(path=f'{OUT}/m5_settings.png')
    page.click('#closeSettings')
    page.fill('#inputA','משפט עם אימייל להגדלת מכסה'); page.click('#sendBtnA'); page.wait_for_timeout(400)
    ok('email sent as de=', 'de=meni%40example.com' in mm_calls[-1], mm_calls[-1][-50:])

    # העדפות נשמרות
    page.select_option('#langB','ja'); page.uncheck('#autoSpeakToggle')
    page.reload(); page.wait_for_load_state('networkidle')
    ok('prefs persist', page.input_value('#langB')=='ja' and page.input_value('#hotelInput')=='Hilton Tel Aviv' and not page.is_checked('#autoSpeakToggle'))
    page.select_option('#langB','en'); page.check('#autoSpeakToggle')

    # SW + אופליין
    page.wait_for_function("navigator.serviceWorker.ready.then(()=>true)")
    page.reload(); page.wait_for_load_state('networkidle')
    ok('SW controlling', page.evaluate("!!navigator.serviceWorker.controller"))
    cached=page.evaluate("caches.open('tvt-v3').then(c=>c.keys()).then(k=>k.map(r=>new URL(r.url).pathname.split('/').pop()||'/'))")
    need={'index.html','manifest.json','styles.css','app.js','languages.js','phrasebook.js','translate.js','speech.js','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'}
    ok('all assets cached', need<=set(cached), str(sorted(need-set(cached))))
    ctx.set_offline(True)
    page.reload(); page.wait_for_load_state('domcontentloaded')
    ok('offline reload works', 'מתורגמן' in page.inner_text('h1'))
    page.wait_for_function("!document.getElementById('statusBanner').classList.contains('hidden')")
    ok('offline banner shown','אין חיבור' in page.inner_text('#statusBannerText'))
    page.fill('#inputA','איפה השירותים?'); page.click('#sendBtnA'); page.wait_for_timeout(300)
    ok('phrasebook text translates offline', page.inner_text('#outputA')=='Where is the restroom?', page.inner_text('#outputA'))
    page.click('#quickPhrasesGrid button >> nth=1'); page.wait_for_timeout(200)
    ok('quick phrase offline', page.inner_text('#outputA')=='Thank you very much')
    page.fill('#inputA','משפט חדש שאינו בשיחון'); page.click('#sendBtnA'); page.wait_for_timeout(300)
    ok('offline unknown text -> friendly message','בלי רשת' in page.inner_text('#statusBannerText'), page.inner_text('#statusBannerText')[:50])
    page.screenshot(path=f'{OUT}/m6_offline.png')

    # דסקטופ
    ctx.set_offline(False)
    d=b.new_context(viewport={'width':1280,'height':800}); d.add_init_script(MOCK); dp=d.new_page()
    dp.goto(URL); dp.wait_for_load_state('networkidle'); dp.screenshot(path=f'{OUT}/d1_desktop.png')
    b.close()

real=[e for e in errors if 'Failed to load resource' not in e and 'ERR_FAILED' not in e and 'net::' not in e]
ok('no JS errors', not real, str(real))
fails=[r[0] for r in results if not r[1]]
print('\nFAILED:',fails); sys.exit(1 if fails else 0)

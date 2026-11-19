import { LANGUAGES } from './languages.js';
import { PHRASES, CATEGORY_LABELS, HOTEL_TEMPLATE } from './phrasebook.js';
import { translate, getEmail, setEmail, clearCache, cacheSize } from './translate.js';
import { speak, stopSpeaking, listen, unlockAudio, hasVoice, voicesLoaded, speechSupport } from './speech.js';

const $ = id => document.getElementById(id);

const state = {
  activeMic: null,   // 'A' | 'B' | null
  micHandle: null,
  activeTurn: 'A',
  phraseActor: 'A',
  faceToFace: false,
  lastSourceText: { A: '', B: '' },
  lastSourceLang: { A: '', B: '' },
  lastTranslated: { A: '', B: '' },
  lastTargetLang: { A: 'en', B: 'he' },
  reqId: { A: 0, B: 0 },
  history: []
};

const el = {
  langA: $('langA'), langB: $('langB'),
  micBtnA: $('micBtnA'), micBtnB: $('micBtnB'),
  micLabelA: $('micLabelA'), micLabelB: $('micLabelB'),
  inputA: $('inputA'), inputB: $('inputB'),
  sendBtnA: $('sendBtnA'), sendBtnB: $('sendBtnB'),
  interimA: $('interimA'), interimB: $('interimB'),
  outputA: $('outputA'), outputB: $('outputB'),
  targetTagA: $('targetTagA'), targetTagB: $('targetTagB'),
  speakOutBtnA: $('speakOutBtnA'), speakOutBtnB: $('speakOutBtnB'),
  bigTextBtnA: $('bigTextBtnA'), bigTextBtnB: $('bigTextBtnB'),
  copyBtnA: $('copyBtnA'), copyBtnB: $('copyBtnB'),
  hotelInput: $('hotelInput'), hotelGoBtn: $('hotelGoBtn'), hotelMapBtn: $('hotelMapBtn'),
  bigTextModal: $('bigTextModal'), bigTextLangLabel: $('bigTextLangLabel'),
  bigTextContent: $('bigTextContent'), bigTextSpeakBtn: $('bigTextSpeakBtn'), bigTextCloseBtn: $('bigTextCloseBtn'),
  autoSpeakToggle: $('autoSpeakToggle'), autoTranslateOnStop: $('autoTranslateOnStop'),
  flipModeBtn: $('flipModeBtn'), flipModeLabel: $('flipModeLabel'),
  panelA: $('panelA'), panelB: $('panelB'),
  turnStep1Btn: $('turnStep1Btn'), turnStep2Btn: $('turnStep2Btn'), switchTurnBtn: $('switchTurnBtn'),
  testAudioBtn: $('testAudioBtn'), swapLangsBtn: $('swapLangsBtn'),
  statusBanner: $('statusBanner'), statusBannerBox: $('statusBannerBox'),
  statusBannerText: $('statusBannerText'), dismissBannerBtn: $('dismissBannerBtn'),
  quickPhrasesGrid: $('quickPhrasesGrid'), morePhrases: $('morePhrases'), moreToggleBtn: $('moreToggleBtn'),
  phraseActorA: $('phraseActorA'), phraseActorB: $('phraseActorB'),
  historyList: $('historyList'), emptyHistoryMsg: $('emptyHistoryMsg'), clearHistoryBtn: $('clearHistoryBtn'),
  settingsBtn: $('settingsBtn'), settings: $('settings'), closeSettings: $('closeSettings'),
  optEmail: $('optEmail'), saveEmailBtn: $('saveEmailBtn'), emailStatus: $('emailStatus'), voiceInfo: $('voiceInfo'), cacheInfo: $('cacheInfo'),
  clearCacheBtn: $('clearCacheBtn'), installBtn: $('installBtn')
};

/* ---------- הודעות ---------- */
function showBanner(message, type) {
  el.statusBanner.classList.remove('hidden');
  el.statusBannerText.textContent = message;
  el.statusBannerBox.className = 'rounded-xl px-4 py-2.5 text-xs sm:text-sm flex items-center justify-between gap-3 border ';
  if (type === 'error') el.statusBannerBox.className += 'bg-rose-950/80 border-rose-700 text-rose-200';
  else if (type === 'warn') el.statusBannerBox.className += 'bg-amber-950/80 border-amber-700 text-amber-200';
  else el.statusBannerBox.className += 'bg-indigo-950/80 border-indigo-700 text-indigo-200';
}
function hideBanner() { el.statusBanner.classList.add('hidden'); }

function updateDirectionsAndTags() {
  const langA = LANGUAGES[el.langA.value];
  const langB = LANGUAGES[el.langB.value];
  el.inputA.dir = langA.dir;
  el.inputB.dir = langB.dir;
  el.outputA.dir = langB.dir;
  el.outputB.dir = langA.dir;
  el.targetTagA.textContent = `תרגום עבור דובר ב׳ (${langB.nameHe}):`;
  el.targetTagB.textContent = `תרגום עבור דובר א׳ (${langA.nameHe}):`;
}

/* ---------- הקראה ---------- */
const warnedVoice = new Set();
function speakText(text, langKey) {
  if (!text) return;
  if (!speechSupport.tts) {
    showBanner('הדפדפן אינו תומך בהקראה קולית. התרגום מוצג בטקסט.', 'warn');
    return;
  }
  if (voicesLoaded() && !hasVoice(langKey) && !warnedVoice.has(langKey)) {
    warnedVoice.add(langKey);
    showBanner(`לא נמצא במכשיר קול ל${LANGUAGES[langKey].nameHe}. אפשר להתקין קול בהגדרות הטלפון (המרת טקסט לדיבור). בינתיים אפשר להשתמש ב"הגדל" ולהראות את הטקסט.`, 'warn');
  }
  speak(text, langKey, {
    onError: e => showBanner(`ההקראה הקולית נחסמה או שאין קול מותקן עבור ${LANGUAGES[langKey].nameHe} (${e}). בדוק שהצליל פועל.`, 'warn')
  });
}

/* ---------- תרגום ---------- */
const SRC_LABEL = { phrasebook: 'שיחון', cache: 'זיכרון', mymemory: '', lingva: 'גיבוי', same: '' };

function addHistoryEntry(speaker, sourceLang, targetLang, originalText, translatedText, source) {
  const timeStr = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  state.history.unshift({ speaker, sourceLang, targetLang, originalText, translatedText, timeStr, source: source || '' });
  if (state.history.length > 40) state.history.pop();
  renderHistory();
}

function renderHistory() {
  el.historyList.innerHTML = '';
  if (state.history.length === 0) {
    el.historyList.appendChild(el.emptyHistoryMsg);
    return;
  }
  state.history.forEach(item => {
    const isA = item.speaker === 'A';
    const srcCfg = LANGUAGES[item.sourceLang];
    const tgtCfg = LANGUAGES[item.targetLang];

    const card = document.createElement('div');
    card.className = 'bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-center justify-between text-xs text-slate-400';

    const badge = document.createElement('span');
    badge.className = isA ? 'text-sky-400 font-semibold' : 'text-emerald-400 font-semibold';
    const lbl = SRC_LABEL[item.source] ? ` · ${SRC_LABEL[item.source]}` : '';
    badge.textContent = `${isA ? 'דובר א׳' : 'דובר ב׳'} · ${srcCfg.nameHe} ← ${tgtCfg.nameHe} · ${item.timeStr}${lbl}`;

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition';
    playBtn.textContent = '🔊 השמע';
    playBtn.addEventListener('click', () => { unlockAudio(); speakText(item.translatedText, item.targetLang); });

    topRow.appendChild(badge);
    topRow.appendChild(playBtn);

    const origP = document.createElement('p');
    origP.className = 'text-xs text-slate-300';
    origP.dir = srcCfg.dir;
    origP.textContent = item.originalText;

    const transP = document.createElement('p');
    transP.className = 'text-sm font-medium text-white';
    transP.dir = tgtCfg.dir;
    transP.textContent = item.translatedText;

    card.appendChild(topRow);
    card.appendChild(origP);
    card.appendChild(transP);
    el.historyList.appendChild(card);
  });
}

function rememberResult(speaker, sourceText, sourceLang, translated, targetLang) {
  state.lastSourceText[speaker] = sourceText;
  state.lastSourceLang[speaker] = sourceLang;
  state.lastTranslated[speaker] = translated;
  state.lastTargetLang[speaker] = targetLang;
}

async function handleTranslate(speaker, textOverride, forceSpeak) {
  const isA = speaker === 'A';
  const inputEl = isA ? el.inputA : el.inputB;
  const outputEl = isA ? el.outputA : el.outputB;
  const sourceLang = isA ? el.langA.value : el.langB.value;
  const targetLang = isA ? el.langB.value : el.langA.value;

  const text = (typeof textOverride === 'string' ? textOverride : inputEl.value).trim();
  if (!text) return;
  if (typeof textOverride === 'string') inputEl.value = text;

  if (state.lastSourceText[speaker] === text && state.lastSourceLang[speaker] === sourceLang &&
      state.lastTargetLang[speaker] === targetLang && state.lastTranslated[speaker]) {
    if (forceSpeak || el.autoSpeakToggle.checked) speakText(state.lastTranslated[speaker], targetLang);
    return;
  }

  const myReq = ++state.reqId[speaker];
  outputEl.textContent = 'מתרגם...';
  try {
    const r = await translate(text, sourceLang, targetLang);
    if (myReq !== state.reqId[speaker]) return; // נשלחה בקשה חדשה יותר
    outputEl.textContent = r.text;
    outputEl.dir = LANGUAGES[targetLang].dir;
    rememberResult(speaker, text, sourceLang, r.text, targetLang);
    addHistoryEntry(speaker, sourceLang, targetLang, text, r.text, r.source);
    if (forceSpeak || el.autoSpeakToggle.checked) speakText(r.text, targetLang);
  } catch (err) {
    if (myReq !== state.reqId[speaker]) return;
    outputEl.textContent = 'שגיאה בתרגום.';
    showBanner(err.message || 'אירעה שגיאה בתרגום.', 'error');
  }
}

/* ---------- מיקרופון ---------- */
const MIC_ERRORS = {
  'not-allowed': 'הגישה למיקרופון נחסמה. אשר הרשאת מיקרופון בדפדפן או הקלד טקסט ידנית.',
  'service-not-allowed': 'זיהוי הדיבור חסום בדפדפן הזה. הקלד טקסט או השתמש בדיקטציה של המקלדת.',
  'no-speech': 'לא זוהה דיבור. נסה לדבר קרוב יותר למיקרופון.',
  'network': 'זיהוי הדיבור דורש חיבור לאינטרנט.',
  'language-not-supported': 'שפת הדיבור הזו אינה נתמכת בזיהוי הדיבור של המכשיר. אפשר להקליד.',
  'unsupported': 'זיהוי דיבור אינו נתמך בדפדפן זה. ניתן להקליד טקסט או להשתמש במשפטים המהירים.',
  'start-failed': 'לא ניתן להפעיל את המיקרופון כרגע.'
};

function resetMicButtons() {
  el.micBtnA.classList.remove('mic-listening', 'bg-rose-600', 'hover:bg-rose-500');
  el.micBtnA.classList.add('bg-sky-600', 'hover:bg-sky-500');
  el.micLabelA.textContent = 'לחץ לדיבור (דובר א׳)';
  el.micBtnB.classList.remove('mic-listening', 'bg-rose-600', 'hover:bg-rose-500');
  el.micBtnB.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
  el.micLabelB.textContent = 'לחץ לדיבור (דובר ב׳)';
}

function stopRecognition() {
  if (state.micHandle) state.micHandle.stop();
  state.micHandle = null;
  state.activeMic = null;
  resetMicButtons();
}

function toggleMic(speaker) {
  unlockAudio(); // חייב להיקרא מתוך לחיצה, אחרת נייד יחסום את ההקראה
  stopSpeaking();
  if (!speechSupport.stt) { showBanner(MIC_ERRORS.unsupported, 'warn'); return; }
  if (state.activeMic === speaker) { stopRecognition(); return; }
  stopRecognition();

  const isA = speaker === 'A';
  const langKey = isA ? el.langA.value : el.langB.value;
  const inputEl = isA ? el.inputA : el.inputB;
  const interimEl = isA ? el.interimA : el.interimB;
  const micBtn = isA ? el.micBtnA : el.micBtnB;
  const micLabel = isA ? el.micLabelA : el.micLabelB;

  const handle = listen(langKey, {
    onStart: () => {
      micBtn.classList.remove('bg-sky-600', 'hover:bg-sky-500', 'bg-emerald-600', 'hover:bg-emerald-500');
      micBtn.classList.add('mic-listening', 'bg-rose-600', 'hover:bg-rose-500');
      micLabel.textContent = 'מאזין... (לחץ לעצירה)';
      interimEl.textContent = 'מאזין לדיבור...';
    },
    onInterim: (t, noFinalYet) => {
      interimEl.textContent = t;
      if (noFinalYet) inputEl.value = t;
    },
    onError: code => {
      interimEl.textContent = '';
      if (code !== 'aborted') showBanner(MIC_ERRORS[code] || `שגיאת זיהוי דיבור: ${code}. ניתן להשתמש בהקלדה כחלופה.`, code === 'no-speech' ? 'warn' : 'error');
    },
    onEnd: captured => {
      interimEl.textContent = '';
      stopRecognition();
      if (captured) {
        inputEl.value = captured;
        if (el.autoTranslateOnStop.checked) handleTranslate(speaker, captured);
        else interimEl.textContent = 'הדיבור נקלט — לחץ על "תרגם והשמע" או על כפתור הרמקול 🔊.';
      }
    }
  });
  if (handle) { state.micHandle = handle; state.activeMic = speaker; }
  else resetMicButtons();
}

/* ---------- העתקה ---------- */
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* ignore */ }
  document.body.removeChild(ta);
  if (cb) cb();
}
function copyOutput(speaker, btnEl) {
  const text = state.lastTranslated[speaker];
  if (!text) return;
  const done = () => {
    const orig = btnEl.textContent;
    btnEl.textContent = 'הועתק!';
    setTimeout(() => { btnEl.textContent = orig; }, 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}

/* ---------- משפטים מהירים ושיחון ---------- */
async function usePhrase(p) {
  unlockAudio();
  const actor = state.phraseActor;
  const isA = actor === 'A';
  const sourceLang = isA ? el.langA.value : el.langB.value;
  const targetLang = isA ? el.langB.value : el.langA.value;
  const inputEl = isA ? el.inputA : el.inputB;
  const outputEl = isA ? el.outputA : el.outputB;

  // אם למשפט יש נוסח בשפת הדובר, משתמשים בו. אחרת בנוסח האנגלי כשפת מקור.
  const srcLang = p[sourceLang] ? sourceLang : 'en';
  const srcText = p[srcLang];
  inputEl.value = srcText;

  if (p[targetLang]) {
    outputEl.textContent = p[targetLang];
    outputEl.dir = LANGUAGES[targetLang].dir;
    rememberResult(actor, srcText, sourceLang, p[targetLang], targetLang);
    addHistoryEntry(actor, srcLang, targetLang, srcText, p[targetLang], 'phrasebook');
    if (el.autoSpeakToggle.checked) speakText(p[targetLang], targetLang);
  } else {
    // שפת היעד לא בשיחון: מתרגמים את הנוסח המקורי ברשת
    const myReq = ++state.reqId[actor];
    outputEl.textContent = 'מתרגם...';
    try {
      const r = await translate(srcText, srcLang, targetLang);
      if (myReq !== state.reqId[actor]) return;
      outputEl.textContent = r.text;
      outputEl.dir = LANGUAGES[targetLang].dir;
      rememberResult(actor, srcText, sourceLang, r.text, targetLang);
      addHistoryEntry(actor, srcLang, targetLang, srcText, r.text, r.source);
      if (el.autoSpeakToggle.checked) speakText(r.text, targetLang);
    } catch (err) {
      if (myReq !== state.reqId[actor]) return;
      outputEl.textContent = 'שגיאה בתרגום.';
      showBanner(err.message, 'error');
    }
  }
}

function phraseButton(p) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'text-xs sm:text-sm px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition';
  btn.textContent = p.label || p.he;
  btn.addEventListener('click', () => usePhrase(p));
  return btn;
}

function renderQuickPhrases() {
  el.quickPhrasesGrid.innerHTML = '';
  PHRASES.filter(p => p.quick).forEach(p => el.quickPhrasesGrid.appendChild(phraseButton(p)));

  el.morePhrases.innerHTML = '';
  Object.entries(CATEGORY_LABELS).forEach(([cat, label]) => {
    const items = PHRASES.filter(p => !p.quick && p.cat === cat);
    if (!items.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-2';
    const h = document.createElement('p');
    h.className = 'text-xs text-slate-400';
    h.textContent = label;
    const grid = document.createElement('div');
    grid.className = 'flex flex-wrap gap-2';
    items.forEach(p => grid.appendChild(phraseButton(p)));
    wrap.appendChild(h);
    wrap.appendChild(grid);
    el.morePhrases.appendChild(wrap);
  });
}

/* ---------- העדפות ---------- */
function savePrefs() {
  try {
    localStorage.setItem('tvt_langA', el.langA.value);
    localStorage.setItem('tvt_langB', el.langB.value);
    localStorage.setItem('tvt_hotel', el.hotelInput.value);
    localStorage.setItem('tvt_autoSpeak', el.autoSpeakToggle.checked ? '1' : '0');
    localStorage.setItem('tvt_autoStop', el.autoTranslateOnStop.checked ? '1' : '0');
  } catch (_) { /* ignore */ }
}
function loadPrefs() {
  try {
    const a = localStorage.getItem('tvt_langA');
    const b = localStorage.getItem('tvt_langB');
    const h = localStorage.getItem('tvt_hotel');
    const s = localStorage.getItem('tvt_autoSpeak');
    const t = localStorage.getItem('tvt_autoStop');
    if (a && LANGUAGES[a]) el.langA.value = a;
    if (b && LANGUAGES[b]) el.langB.value = b;
    if (h) el.hotelInput.value = h;
    if (s !== null) el.autoSpeakToggle.checked = s === '1';
    if (t !== null) el.autoTranslateOnStop.checked = t === '1';
  } catch (_) { /* ignore */ }
}

/* ---------- תור, פנים-אל-פנים, הגדלה ---------- */
function setActiveTurn(turn) {
  state.activeTurn = turn;
  const isA = turn === 'A';

  el.panelA.className = isA
    ? 'bg-slate-900 border-2 border-sky-500/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 shadow-lg transition'
    : 'bg-slate-900 border border-slate-800 opacity-85 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 shadow-lg transition';

  el.panelB.className = (!isA
    ? 'bg-slate-900 border-2 border-emerald-500/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 shadow-lg transition-flip transition'
    : 'bg-slate-900 border border-slate-800 opacity-85 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 shadow-lg transition-flip transition')
    + (state.faceToFace ? ' face-to-face-flip' : '');

  el.turnStep1Btn.className = isA
    ? 'px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-sky-600 text-white shadow transition'
    : 'px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition';

  el.turnStep2Btn.className = !isA
    ? 'px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 text-white shadow transition'
    : 'px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
}

let bigTextCurrentLang = 'en';
function openBigText(speaker) {
  const text = state.lastTranslated[speaker];
  if (!text) { showBanner('אין עדיין תרגום להגדלה. תרגם משפט קודם.', 'info'); return; }
  const langKey = state.lastTargetLang[speaker] || 'en';
  const cfg = LANGUAGES[langKey] || LANGUAGES.en;
  bigTextCurrentLang = langKey;
  el.bigTextLangLabel.textContent = `תצוגה ברורה (${cfg.nameHe} · ${cfg.native})`;
  el.bigTextContent.dir = cfg.dir;
  el.bigTextContent.textContent = text;
  el.bigTextModal.classList.remove('hidden');
}

/* ---------- מלון ---------- */
async function hotelGo() {
  unlockAudio();
  const hotel = el.hotelInput.value.trim();
  if (!hotel) {
    showBanner('הקלד קודם את שם המלון או הכתובת בשדה שליד הכפתור.', 'info');
    el.hotelInput.focus();
    return;
  }
  savePrefs();
  setActiveTurn('A');
  const sourceLang = el.langA.value;
  const targetLang = el.langB.value;
  const srcLang = HOTEL_TEMPLATE[sourceLang] ? sourceLang : 'en';
  const srcText = HOTEL_TEMPLATE[srcLang] + hotel;
  el.inputA.value = srcText;

  const myReq = ++state.reqId.A;
  el.outputA.textContent = 'מתרגם...';
  try {
    let tpl = HOTEL_TEMPLATE[targetLang];
    let source = 'phrasebook';
    if (!tpl) {
      const r = await translate(HOTEL_TEMPLATE.en, 'en', targetLang);
      tpl = r.text.replace(/[:：]?\s*$/, ': ');
      source = r.source;
    }
    if (myReq !== state.reqId.A) return;
    const out = tpl + hotel; // שם המלון נשאר כמו שהוקלד
    el.outputA.textContent = out;
    el.outputA.dir = LANGUAGES[targetLang].dir;
    rememberResult('A', srcText, sourceLang, out, targetLang);
    addHistoryEntry('A', srcLang, targetLang, srcText, out, source);
    speakText(out, targetLang);
  } catch (err) {
    if (myReq !== state.reqId.A) return;
    el.outputA.textContent = 'שגיאה בתרגום.';
    showBanner(err.message, 'error');
  }
}

/* ---------- הגדרות והתקנה ---------- */
function refreshSettingsInfo() {
  const keys = ['he', 'en', 'ro', 'ar', 'th', 'ru'];
  if (!speechSupport.tts) el.voiceInfo.textContent = 'הדפדפן אינו תומך בהקראה קולית.';
  else if (!voicesLoaded()) el.voiceInfo.textContent = 'רשימת הקולות עדיין נטענת. נסה שוב בעוד רגע.';
  else {
    const parts = keys.map(k => `${LANGUAGES[k].nameHe}: ${hasVoice(k) ? '✓' : '✗'}`);
    el.voiceInfo.textContent = `קולות במכשיר: ${parts.join(' · ')}. סימן ✗ אומר שחסר קול, ואפשר להתקין אותו בהגדרות הטלפון (המרת טקסט לדיבור).`;
  }
  if (getEmail() && el.emailStatus) { el.emailStatus.className = 'text-xs text-emerald-400 min-h-[1rem]'; el.emailStatus.textContent = 'נשמר ✓'; }
  el.cacheInfo.textContent = `תרגומים שמורים בזיכרון: ${cacheSize()}`;
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  el.installBtn.classList.remove('hidden');
});
window.addEventListener('appinstalled', () => el.installBtn.classList.add('hidden'));

/* ---------- אירועים ---------- */
el.micBtnA.addEventListener('click', () => toggleMic('A'));
el.micBtnB.addEventListener('click', () => toggleMic('B'));
el.sendBtnA.addEventListener('click', () => { unlockAudio(); handleTranslate('A', undefined, true); });
el.sendBtnB.addEventListener('click', () => { unlockAudio(); handleTranslate('B', undefined, true); });

for (const [side, input] of [['A', el.inputA], ['B', el.inputB]]) {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); unlockAudio(); handleTranslate(side); }
  });
}

for (const [side, btn] of [['A', el.speakOutBtnA], ['B', el.speakOutBtnB]]) {
  const input = side === 'A' ? el.inputA : el.inputB;
  btn.addEventListener('click', () => {
    unlockAudio();
    if (input.value.trim()) handleTranslate(side, undefined, true);
    else if (state.lastTranslated[side]) speakText(state.lastTranslated[side], state.lastTargetLang[side]);
  });
}

el.testAudioBtn.addEventListener('click', () => {
  unlockAudio();
  const a = el.langA.value, b = el.langB.value;
  const sample = { he: 'בדיקת שמע, שלום', en: 'Audio test, hello', ro: 'Test audio, bună ziua', ar: 'اختبار الصوت، مرحبا', th: 'ทดสอบเสียง สวัสดี', ru: 'Проверка звука, здравствуйте' };
  const textA = sample[a] || sample.en, textB = sample[b] || sample.en;
  if (!voicesLoaded()) showBanner('הקראה קולית מופעלת. אם אינך שומע קול, בדוק שהמכשיר אינו במצב שקט ושהווליום פתוח.', 'info');
  speak(textA, a, { onEnd: () => speak(textB, b, {}), onError: e => showBanner(`ההקראה נכשלה (${e}). בדוק שהצליל פועל.`, 'warn') });
  if (!hasVoice(a) && voicesLoaded()) showBanner(`חסר קול ל${LANGUAGES[a].nameHe} במכשיר.`, 'warn');
});

el.copyBtnA.addEventListener('click', () => copyOutput('A', el.copyBtnA));
el.copyBtnB.addEventListener('click', () => copyOutput('B', el.copyBtnB));

el.langA.addEventListener('change', () => { updateDirectionsAndTags(); savePrefs(); });
el.langB.addEventListener('change', () => { updateDirectionsAndTags(); savePrefs(); });
el.hotelInput.addEventListener('input', savePrefs);
el.autoSpeakToggle.addEventListener('change', savePrefs);
el.autoTranslateOnStop.addEventListener('change', savePrefs);

el.swapLangsBtn.addEventListener('click', () => {
  const tmp = el.langA.value;
  el.langA.value = el.langB.value;
  el.langB.value = tmp;
  updateDirectionsAndTags();
  savePrefs();
});

el.flipModeBtn.addEventListener('click', () => {
  state.faceToFace = !state.faceToFace;
  el.panelB.classList.toggle('face-to-face-flip', state.faceToFace);
  el.flipModeLabel.textContent = state.faceToFace ? 'מצב פנים-אל-פנים: פעיל' : 'מצב פנים-אל-פנים: כבוי';
});

el.phraseActorA.addEventListener('click', () => {
  state.phraseActor = 'A';
  el.phraseActorA.className = 'px-2.5 py-1 rounded-lg bg-sky-600 text-white font-medium';
  el.phraseActorB.className = 'px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700';
});
el.phraseActorB.addEventListener('click', () => {
  state.phraseActor = 'B';
  el.phraseActorB.className = 'px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-medium';
  el.phraseActorA.className = 'px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700';
});

el.moreToggleBtn.addEventListener('click', () => {
  const open = el.morePhrases.classList.toggle('hidden') === false;
  el.moreToggleBtn.textContent = open ? 'פחות משפטים ▴' : 'עוד משפטים ▾';
  el.moreToggleBtn.setAttribute('aria-expanded', String(open));
});

el.clearHistoryBtn.addEventListener('click', () => { state.history = []; renderHistory(); });
el.dismissBannerBtn.addEventListener('click', hideBanner);

el.turnStep1Btn.addEventListener('click', () => setActiveTurn('A'));
el.turnStep2Btn.addEventListener('click', () => setActiveTurn('B'));
el.switchTurnBtn.addEventListener('click', () => {
  stopRecognition();
  setActiveTurn(state.activeTurn === 'A' ? 'B' : 'A');
});

el.bigTextBtnA.addEventListener('click', () => openBigText('A'));
el.bigTextBtnB.addEventListener('click', () => openBigText('B'));
el.bigTextCloseBtn.addEventListener('click', () => el.bigTextModal.classList.add('hidden'));
el.bigTextModal.addEventListener('click', e => { if (e.target === el.bigTextModal) el.bigTextModal.classList.add('hidden'); });
el.bigTextSpeakBtn.addEventListener('click', () => {
  unlockAudio();
  if (el.bigTextContent.textContent) speakText(el.bigTextContent.textContent, bigTextCurrentLang);
});

el.hotelGoBtn.addEventListener('click', hotelGo);
el.hotelMapBtn.addEventListener('click', () => {
  const hotel = el.hotelInput.value.trim();
  if (!hotel) { showBanner('הקלד קודם את שם המלון או הכתובת כדי לפתוח במפות.', 'info'); el.hotelInput.focus(); return; }
  savePrefs();
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel)}`, '_blank', 'noopener,noreferrer');
});

el.settingsBtn.addEventListener('click', () => { refreshSettingsInfo(); el.settings.showModal(); });
el.closeSettings.addEventListener('click', () => el.settings.close());
el.settings.addEventListener('click', e => { if (e.target === el.settings) el.settings.close(); });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function saveEmail() {
  if (!el.emailStatus) { setEmail(el.optEmail.value.trim()); return; }
  const v = el.optEmail.value.trim();
  if (!v) { setEmail(''); el.emailStatus.className = 'text-xs text-slate-400 min-h-[1rem]'; el.emailStatus.textContent = 'לא מוגדר אימייל.'; return; }
  if (!EMAIL_RE.test(v)) { el.emailStatus.className = 'text-xs text-amber-300 min-h-[1rem]'; el.emailStatus.textContent = 'כתובת האימייל לא תקינה, ולכן לא נשמרה.'; return; }
  setEmail(v);
  el.emailStatus.className = 'text-xs text-emerald-400 min-h-[1rem]';
  el.emailStatus.textContent = 'נשמר ✓';
}
el.optEmail.addEventListener('input', saveEmail);   // נשמר מיד בזמן ההקלדה
el.optEmail.addEventListener('change', saveEmail);
if (el.saveEmailBtn) el.saveEmailBtn.addEventListener('click', saveEmail);
el.clearCacheBtn.addEventListener('click', () => { clearCache(); refreshSettingsInfo(); });
el.installBtn.addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (_) { /* ignore */ }
  deferredInstall = null;
  el.installBtn.classList.add('hidden');
});

window.addEventListener('offline', () => showBanner('אין חיבור לאינטרנט. המשפטים המהירים ו"עוד משפטים" ממשיכים לעבוד, וגם תרגומים ששמורים בזיכרון.', 'warn'));
window.addEventListener('online', () => hideBanner());

/* ---------- אתחול ---------- */
el.optEmail.value = getEmail();
loadPrefs();
setActiveTurn('A');
updateDirectionsAndTags();
renderQuickPhrases();
renderHistory();
if (!speechSupport.stt) {
  showBanner('שים לב: זיהוי דיבור בדפדפן זה אינו זמין (עובד בעיקר ב-Chrome באנדרואיד). ניתן להקליד או לבחור משפטים מהירים.', 'info');
}
if (!navigator.onLine) window.dispatchEvent(new Event('offline'));

if ('serviceWorker' in navigator) {
  // כשגרסה חדשה משתלטת, מרעננים פעם אחת כדי שהדף והקבצים יהיו מאותה גרסה
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* האפליקציה עובדת גם בלי SW */ });
}

import { LANGUAGES } from './languages.js';
import { PHRASES, CATEGORY_LABELS, HOTEL_TEMPLATE } from './phrasebook.js';
import { translate, getEmail, setEmail, clearCache, cacheSize, isLang } from './translate.js';
import { speak, stopSpeaking, listen, unlockAudio, hasVoice, voicesLoaded, speechSupport, isSpeaking } from './speech.js';
import { panelBStrings, PANEL_B_UI } from './ui-strings.js';
const panelBStringsAll = () => PANEL_B_UI;

const $ = id => document.getElementById(id);

const HE = {
  tapA: 'לחץ לדיבור (דובר א׳)', tapB: 'לחץ לדיבור (דובר ב׳)',
  listening: 'מאזין... (לחץ לעצירה)', hearing: 'מאזין לדיבור...',
  captured: 'הדיבור נקלט — לחץ על "תרגם והשמע" או על כפתור הרמקול 🔊.',
  waiting: 'ממתין לדיבור או טקסט...', translating: 'מתרגם...', backup: 'מתרגם... (מנסה שירות גיבוי)',
  failed: 'שגיאה בתרגום.', placeholder: 'הדיבור יופיע כאן, או הקלד טקסט לתרגום...',
  send: '🔊 תרגם והשמע', enlarge: '⛶ הגדל', copy: 'העתק', titleB: 'דובר ב׳'
};

const HISTORY_KEY = 'tvt_history';
const FAV_KEY = 'tvt_favs';
const HISTORY_MAX = 50;
const FAV_MAX = 100;

const state = {
  activeMic: null,   // 'A' | 'B' | null
  micSession: null,  // הסשן הנוכחי של המיקרופון. סשן ישן שמסתיים לא נוגע בחדש.
  activeTurn: 'A',
  phraseActor: 'A',
  faceToFace: false,
  lastSourceText: { A: '', B: '' },
  lastSourceLang: { A: '', B: '' },
  lastTranslated: { A: '', B: '' },
  lastTargetLang: { A: 'en', B: 'he' },
  reqId: { A: 0, B: 0 },
  pending: { A: false, B: false },
  outStatus: { A: 'waiting', B: 'waiting' }, // איזו הודעת מצב מוצגת בתיבת התרגום (או null כשמוצג תרגום)
  history: [],
  favorites: []
};

const el = {
  langA: $('langA'), langB: $('langB'),
  micBtnA: $('micBtnA'), micBtnB: $('micBtnB'),
  micLabelA: $('micLabelA'), micLabelB: $('micLabelB'),
  inputA: $('inputA'), inputB: $('inputB'),
  sendBtnA: $('sendBtnA'), sendBtnB: $('sendBtnB'),
  interimA: $('interimA'), interimB: $('interimB'),
  outBoxA: $('outBoxA'), outBoxB: $('outBoxB'),
  outputA: $('outputA'), outputB: $('outputB'),
  backA: $('backA'), backB: $('backB'),
  targetTagA: $('targetTagA'), targetTagB: $('targetTagB'),
  speakOutBtnA: $('speakOutBtnA'), speakOutBtnB: $('speakOutBtnB'),
  bigTextBtnA: $('bigTextBtnA'), bigTextBtnB: $('bigTextBtnB'),
  copyBtnA: $('copyBtnA'), copyBtnB: $('copyBtnB'),
  shareBtnA: $('shareBtnA'), shareBtnB: $('shareBtnB'),
  checkBtnA: $('checkBtnA'), checkBtnB: $('checkBtnB'),
  titleB: $('titleB'),
  hotelInput: $('hotelInput'), hotelGoBtn: $('hotelGoBtn'), hotelMapBtn: $('hotelMapBtn'),
  bigTextModal: $('bigTextModal'), bigTextLangLabel: $('bigTextLangLabel'), bigTextOriginal: $('bigTextOriginal'),
  bigTextContent: $('bigTextContent'), bigTextSpeakBtn: $('bigTextSpeakBtn'), bigTextCloseBtn: $('bigTextCloseBtn'),
  autoSpeakToggle: $('autoSpeakToggle'), autoTranslateOnStop: $('autoTranslateOnStop'),
  flipModeBtn: $('flipModeBtn'), flipModeLabel: $('flipModeLabel'),
  panelA: $('panelA'), panelB: $('panelB'),
  turnStep1Btn: $('turnStep1Btn'), turnStep2Btn: $('turnStep2Btn'), switchTurnBtn: $('switchTurnBtn'),
  testAudioBtn: $('testAudioBtn'), swapLangsBtn: $('swapLangsBtn'),
  statusBanner: $('statusBanner'), statusBannerBox: $('statusBannerBox'),
  statusBannerText: $('statusBannerText'), dismissBannerBtn: $('dismissBannerBtn'), bannerActionBtn: $('bannerActionBtn'),
  quickPhrasesGrid: $('quickPhrasesGrid'), morePhrases: $('morePhrases'), moreToggleBtn: $('moreToggleBtn'),
  favWrap: $('favWrap'), favPhrases: $('favPhrases'),
  phraseActorA: $('phraseActorA'), phraseActorB: $('phraseActorB'),
  historyList: $('historyList'), emptyHistoryMsg: $('emptyHistoryMsg'), clearHistoryBtn: $('clearHistoryBtn'),
  settingsBtn: $('settingsBtn'), settings: $('settings'), closeSettings: $('closeSettings'),
  optEmail: $('optEmail'), saveEmailBtn: $('saveEmailBtn'), emailStatus: $('emailStatus'), voiceInfo: $('voiceInfo'),
  cacheInfo: $('cacheInfo'), offlineInfo: $('offlineInfo'),
  clearCacheBtn: $('clearCacheBtn'), installBtn: $('installBtn')
};

const other = s => (s === 'A' ? 'B' : 'A');
const outputOf = s => (s === 'A' ? el.outputA : el.outputB);
const backOf = s => (s === 'A' ? el.backA : el.backB);
const boxOf = s => (s === 'A' ? el.outBoxA : el.outBoxB);
const langOf = s => (s === 'A' ? el.langA.value : el.langB.value);
// הצד של דובר ב׳ מדבר בשפה שלו רק במצב פנים-אל-פנים (אז הוא פונה אליו)
const bStrings = () => (state.faceToFace ? panelBStrings(el.langB.value) : null);

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; } catch { return fallback; }
}
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* מלא או חסום */ } }

/* ---------- הודעות (מופיעות בתחתית המסך, תמיד בתוך התצוגה) ---------- */
let bannerTimer = null;
let bannerAction = null;
let bannerIsUpdate = false;
const update = { ready: false, dismissed: false, reload: null };
function placeBanner() {
  // בתוך חלון ההגדרות ההודעה חייבת להיות בתוכו, אחרת היא מוסתרת מאחוריו
  const host = el.settings.open ? el.settings : document.body;
  if (el.statusBanner.parentNode !== host) host.appendChild(el.statusBanner);
  // כשהתצוגה הגדולה פתוחה, ההודעה עולה למעלה כדי לא להסתיר את הכפתורים "סגור" ו"השמע שוב"
  el.statusBanner.classList.toggle('banner-top', !el.bigTextModal.classList.contains('hidden'));
}
function showBanner(message, type, opts = {}) {
  clearTimeout(bannerTimer);
  bannerIsUpdate = !!opts.isUpdate;
  placeBanner();
  el.statusBanner.classList.remove('hidden');
  el.statusBannerText.textContent = message;
  el.statusBannerBox.className = 'max-w-xl mx-auto rounded-xl px-4 py-2.5 text-xs sm:text-sm flex items-center justify-between gap-3 border shadow-2xl pointer-events-auto ';
  if (type === 'error') el.statusBannerBox.className += 'bg-rose-950 border-rose-700 text-rose-100';
  else if (type === 'warn') el.statusBannerBox.className += 'bg-amber-950 border-amber-700 text-amber-100';
  else el.statusBannerBox.className += 'bg-indigo-950 border-indigo-700 text-indigo-100';
  bannerAction = opts.action || null;
  el.bannerActionBtn.classList.toggle('hidden', !bannerAction);
  if (bannerAction) el.bannerActionBtn.textContent = bannerAction.label;
  const sticky = opts.sticky || type === 'error' || bannerAction;
  if (!sticky) bannerTimer = setTimeout(hideBanner, type === 'warn' ? 9000 : 6000);
}
function hideBanner(byUser) {
  clearTimeout(bannerTimer);
  el.statusBanner.classList.add('hidden');
  bannerAction = null;
  if (bannerIsUpdate) { bannerIsUpdate = false; if (byUser) update.dismissed = true; return; }
  // הודעה אחרת החליפה את "גרסה חדשה מוכנה": מחזירים אותה
  if (update.ready && !update.dismissed) showUpdateBanner();
}
function showUpdateBanner() {
  showBanner('גרסה חדשה של האפליקציה מוכנה.', 'info', { isUpdate: true, action: { label: 'רענן עכשיו', fn: () => update.reload() } });
}

/* ---------- המסך נשאר דולק בזמן שיחה ---------- */
let wakeLock = null, wakeRequest = null, wakeTimer = null, wantWake = false;
async function acquireWake() {
  if (!('wakeLock' in navigator) || wakeLock || wakeRequest || document.visibilityState !== 'visible') return;
  try {
    wakeRequest = navigator.wakeLock.request('screen'); // בקשה אחת בכל פעם, גם כשקוראים פעמיים ברצף
    const lock = await wakeRequest;
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    if (!wantWake) lock.release().catch(() => {});
  } catch { /* לא נתמך או נדחה */ } finally { wakeRequest = null; }
}
function keepScreenOn() {
  wantWake = true;
  acquireWake();
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => { wantWake = false; if (wakeLock) wakeLock.release().catch(() => {}); }, 5 * 60 * 1000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantWake) acquireWake(); });

/* ---------- תוויות וכיווני טקסט ---------- */
function updateDirectionsAndTags() {
  const langA = LANGUAGES[el.langA.value];
  const langB = LANGUAGES[el.langB.value];
  el.inputA.dir = langA.dir;
  el.inputB.dir = langB.dir;
  const s = bStrings();
  el.targetTagA.textContent = s ? `${s.forYou} (${langB.native}):` : `תרגום עבור דובר ב׳ (${langB.nameHe}):`;
  el.targetTagB.textContent = `תרגום עבור דובר א׳ (${langA.nameHe}):`;
}

function setBtnLabel(btn, label) { btn.dataset.label = label; btn.textContent = label; }

// הודעת מצב בתיבת התרגום. התיבה של דובר א׳ נקראת על ידי דובר ב׳, ולכן במצב פנים-אל-פנים היא בשפה שלו.
function statusText(speaker, key) {
  const s = speaker === 'A' ? bStrings() : null;
  if (s) return key === 'backup' ? s.translating : s[key];
  return HE[key];
}
function setOutputStatus(speaker, key) {
  const o = outputOf(speaker);
  state.outStatus[speaker] = key;
  o.textContent = statusText(speaker, key);
  o.dir = 'auto';
  o.removeAttribute('lang');
}
function showResult(speaker, text, langKey) {
  const o = outputOf(speaker);
  state.outStatus[speaker] = null;
  o.textContent = text;
  o.dir = LANGUAGES[langKey].dir;
  o.lang = LANGUAGES[langKey].speechCode;
  reveal(speaker);
}
function hideBack(speaker) { const b = backOf(speaker); b.classList.add('hidden'); b.textContent = ''; }

// מביא את תיבת התרגום לתוך המסך אם היא מחוץ לו (למשל אחרי לחיצה על משפט מהיר)
function reveal(speaker) {
  if (state.faceToFace) return;
  const box = boxOf(speaker);
  const r = box.getBoundingClientRect();
  const header = document.querySelector('header');
  const top = header ? header.getBoundingClientRect().bottom : 0;
  if (r.top < top || r.bottom > window.innerHeight) {
    try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { box.scrollIntoView(); }
  }
}

/* ---------- הקראה ---------- */
const warnedVoice = new Set();
function speakText(text, langKey, { auto = false } = {}) {
  if (!text) return;
  if (!speechSupport.tts) {
    showBanner('הדפדפן אינו תומך בהקראה קולית. התרגום מוצג בטקסט.', 'warn');
    return;
  }
  if (state.activeMic) {
    if (auto) return;   // לא מקריאים לתוך מיקרופון פתוח. אפשר ללחוץ 🔊 אחר כך.
    stopRecognition();
  }
  if (voicesLoaded() && !hasVoice(langKey) && !warnedVoice.has(langKey)) {
    warnedVoice.add(langKey);
    showBanner(`לא נמצא במכשיר קול ל${LANGUAGES[langKey].nameHe}. אפשר להתקין קול (הסבר בהגדרות). בינתיים אפשר להשתמש ב"הגדל" ולהראות את הטקסט.`, 'warn');
  }
  speak(text, langKey, {
    onError: e => showBanner(`ההקראה הקולית נחסמה או שאין קול מותקן עבור ${LANGUAGES[langKey].nameHe} (${e}). בדוק שהצליל פועל.`, 'warn')
  });
}

/* ---------- היסטוריה ומועדפים ---------- */
const SRC_LABEL = { phrasebook: 'שיחון', cache: 'זיכרון', mymemory: '', google: 'גיבוי Google', lingva: 'גיבוי', same: '', favorite: 'מועדף' };

const validEntry = e => e && typeof e === 'object' && isLang(e.sourceLang) && isLang(e.targetLang) &&
  typeof e.originalText === 'string' && typeof e.translatedText === 'string' && e.translatedText;
const favKey = e => `${e.sourceLang}|${e.targetLang}|${e.originalText}`;

function saveHistory() { saveJSON(HISTORY_KEY, state.history.slice(0, HISTORY_MAX)); }
function saveFavorites() { saveJSON(FAV_KEY, state.favorites.slice(0, FAV_MAX)); }

function addHistoryEntry(speaker, sourceLang, targetLang, originalText, translatedText, source) {
  state.history.unshift({ speaker, sourceLang, targetLang, originalText, translatedText, ts: Date.now(), source: source || '' });
  if (state.history.length > HISTORY_MAX) state.history.length = HISTORY_MAX;
  saveHistory();
  renderHistory();
}

function timeLabel(ts) {
  const d = new Date(ts || Date.now());
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('he-IL', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isFavorite(e) { const k = favKey(e); return state.favorites.some(f => favKey(f) === k); }
function toggleFavorite(e) {
  const k = favKey(e);
  if (isFavorite(e)) state.favorites = state.favorites.filter(f => favKey(f) !== k);
  else {
    state.favorites.unshift({ sourceLang: e.sourceLang, targetLang: e.targetLang, originalText: e.originalText, translatedText: e.translatedText });
    if (state.favorites.length > FAV_MAX) state.favorites.length = FAV_MAX;
  }
  saveFavorites();
  renderFavorites();
  renderHistory();
}

function renderHistory() {
  el.historyList.textContent = '';
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
    topRow.className = 'flex items-start justify-between gap-2 text-xs text-slate-400';

    const badge = document.createElement('span');
    badge.className = isA ? 'text-sky-400 font-semibold pt-1.5' : 'text-emerald-400 font-semibold pt-1.5';
    const lbl = SRC_LABEL[item.source] ? ` · ${SRC_LABEL[item.source]}` : '';
    badge.textContent = `${isA ? 'דובר א׳' : 'דובר ב׳'} · ${srcCfg.nameHe} ← ${tgtCfg.nameHe} · ${timeLabel(item.ts)}${lbl}`;

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-1.5 shrink-0';

    const fav = isFavorite(item);
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'min-w-[2.75rem] min-h-[2.25rem] px-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition ' + (fav ? 'text-amber-300' : 'text-slate-400');
    favBtn.textContent = fav ? '★' : '☆';
    favBtn.setAttribute('aria-label', fav ? 'הסר מהמועדפים' : 'הוסף למועדפים');
    favBtn.addEventListener('click', () => toggleFavorite(item));

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'min-h-[2.25rem] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition whitespace-nowrap';
    playBtn.textContent = '🔊 השמע';
    playBtn.addEventListener('click', () => { unlockAudio(); speakText(item.translatedText, item.targetLang); });

    actions.appendChild(favBtn);
    actions.appendChild(playBtn);
    topRow.appendChild(badge);
    topRow.appendChild(actions);

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

function renderFavorites() {
  el.favPhrases.textContent = '';
  el.favWrap.classList.toggle('hidden', state.favorites.length === 0);
  state.favorites.forEach(f => {
    const wrap = document.createElement('span');
    wrap.className = 'inline-flex items-stretch rounded-xl border border-amber-700/50 bg-amber-950/30 overflow-hidden';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'text-xs sm:text-sm px-3 py-2 text-amber-100 hover:bg-amber-900/40 transition max-w-[16rem] truncate';
    btn.dir = LANGUAGES[f.sourceLang].dir;
    btn.textContent = f.originalText;
    btn.title = `${LANGUAGES[f.sourceLang].nameHe} ← ${LANGUAGES[f.targetLang].nameHe}: ${f.translatedText}`;
    btn.addEventListener('click', () => useFavorite(f));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'px-2.5 text-amber-300/70 hover:text-rose-300 border-r border-amber-700/50 transition';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'הסר מהמועדפים');
    del.addEventListener('click', () => toggleFavorite(f));
    wrap.appendChild(btn);
    wrap.appendChild(del);
    el.favPhrases.appendChild(wrap);
  });
}

/* ---------- תרגום ---------- */
function rememberResult(speaker, sourceText, sourceLang, translated, targetLang) {
  state.lastSourceText[speaker] = sourceText;
  state.lastSourceLang[speaker] = sourceLang;
  state.lastTranslated[speaker] = translated;
  state.lastTargetLang[speaker] = targetLang;
}

// כל בקשה חדשה מבטלת את הקודמת של אותו דובר, ומנקה את התרגום הקודם
// כדי ש"הגדל", "העתק" ו-🔊 לא יציגו משפט ישן.
function beginRequest(speaker) {
  state.lastTranslated[speaker] = '';
  state.pending[speaker] = true;
  hideBack(speaker);
  return ++state.reqId[speaker];
}
function cancelRequest(speaker) {
  ++state.reqId[speaker];
  if (state.pending[speaker]) { state.pending[speaker] = false; setOutputStatus(speaker, 'waiting'); }
}

function finishResult(speaker, srcText, rememberLang, out, to, source, historyLang, forceSpeak) {
  showResult(speaker, out, to);
  rememberResult(speaker, srcText, rememberLang, out, to);
  addHistoryEntry(speaker, historyLang, to, srcText, out, source);
  if (forceSpeak || el.autoSpeakToggle.checked) speakText(out, to, { auto: !forceSpeak });
}

async function runTranslation(speaker, text, from, to, { forceSpeak = false, rememberLang = from } = {}) {
  const myReq = beginRequest(speaker);
  const current = () => myReq === state.reqId[speaker];
  setOutputStatus(speaker, 'translating');
  reveal(speaker);
  try {
    const r = await translate(text, from, to, { onBackup: () => { if (current()) setOutputStatus(speaker, 'backup'); } });
    if (!current()) return;
    state.pending[speaker] = false;
    finishResult(speaker, text, rememberLang, r.text, to, r.source, from, forceSpeak);
  } catch (err) {
    if (!current()) return;
    state.pending[speaker] = false;
    setOutputStatus(speaker, 'failed');
    showBanner(err.message || 'אירעה שגיאה בתרגום.', 'error');
  }
}

async function handleTranslate(speaker, textOverride, forceSpeak) {
  const inputEl = speaker === 'A' ? el.inputA : el.inputB;
  const sourceLang = langOf(speaker);
  const targetLang = langOf(other(speaker));

  const text = (typeof textOverride === 'string' ? textOverride : inputEl.value).trim();
  if (!text) return;
  if (typeof textOverride === 'string') inputEl.value = text;
  keepScreenOn();

  // אותו משפט בדיוק שכבר תורגם: לא פונים שוב לרשת, רק מציגים ומקריאים
  if (state.lastSourceText[speaker] === text && state.lastSourceLang[speaker] === sourceLang &&
      state.lastTargetLang[speaker] === targetLang && state.lastTranslated[speaker]) {
    ++state.reqId[speaker];
    state.pending[speaker] = false;
    showResult(speaker, state.lastTranslated[speaker], targetLang);
    if (forceSpeak || el.autoSpeakToggle.checked) speakText(state.lastTranslated[speaker], targetLang, { auto: !forceSpeak });
    return;
  }
  await runTranslation(speaker, text, sourceLang, targetLang, { forceSpeak });
}

// "בדוק משמעות": מתרגם את התוצאה חזרה לשפת הדובר
async function checkMeaning(speaker) {
  const text = state.lastTranslated[speaker];
  if (!text) { showBanner('אין עדיין תרגום לבדיקה. תרגם משפט קודם.', 'info'); return; }
  const from = state.lastTargetLang[speaker];
  const to = state.lastSourceLang[speaker] || langOf(speaker);
  const b = backOf(speaker);
  const myReq = state.reqId[speaker];
  b.classList.remove('hidden');
  b.dir = 'rtl';
  b.textContent = 'בודק משמעות...';
  try {
    const r = await translate(text, from, to);
    if (myReq !== state.reqId[speaker]) return;
    b.textContent = '';
    const label = document.createElement('span');
    label.textContent = `↩ בחזרה ל${LANGUAGES[to].nameHe}: `;
    const val = document.createElement('bdi');
    val.textContent = r.text;
    val.className = 'text-slate-200';
    b.appendChild(label);
    b.appendChild(val);
  } catch (err) {
    if (myReq !== state.reqId[speaker]) return;
    b.textContent = 'לא הצלחתי לבדוק כרגע: ' + (err.message || '');
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

function micText(speaker, key) {
  const s = speaker === 'B' ? bStrings() : null;
  if (key === 'tap') return s ? s.tap : (speaker === 'A' ? HE.tapA : HE.tapB);
  return s ? s[key] : HE[key];
}

function resetMicButton(speaker) {
  const btn = speaker === 'A' ? el.micBtnA : el.micBtnB;
  const idle = speaker === 'A' ? ['bg-sky-600', 'hover:bg-sky-500'] : ['bg-emerald-600', 'hover:bg-emerald-500'];
  btn.classList.remove('mic-listening', 'bg-rose-600', 'hover:bg-rose-500');
  btn.classList.add(...idle);
  (speaker === 'A' ? el.micLabelA : el.micLabelB).textContent = micText(speaker, 'tap');
}
function resetMicButtons() { resetMicButton('A'); resetMicButton('B'); }

function stopRecognition() {
  const s = state.micSession;
  state.micSession = null;
  state.activeMic = null;
  if (s && s.handle) s.handle.stop();
  resetMicButtons();
}

function toggleMic(speaker) {
  unlockAudio(); // חייב להיקרא מתוך לחיצה, אחרת נייד יחסום את ההקראה
  stopSpeaking();
  keepScreenOn();
  if (!speechSupport.stt) { showBanner(MIC_ERRORS.unsupported, 'warn'); return; }
  if (state.activeMic === speaker) { stopRecognition(); return; }
  stopRecognition();

  const isA = speaker === 'A';
  const langKey = langOf(speaker);
  const inputEl = isA ? el.inputA : el.inputB;
  const interimEl = isA ? el.interimA : el.interimB;
  const micBtn = isA ? el.micBtnA : el.micBtnB;
  const micLabel = isA ? el.micLabelA : el.micLabelB;

  const session = { handle: null };
  state.micSession = session;
  state.activeMic = speaker;
  const current = () => state.micSession === session;

  const handle = listen(langKey, {
    onStart: () => {
      if (!current()) return;
      micBtn.classList.remove('bg-sky-600', 'hover:bg-sky-500', 'bg-emerald-600', 'hover:bg-emerald-500');
      micBtn.classList.add('mic-listening', 'bg-rose-600', 'hover:bg-rose-500');
      micLabel.textContent = micText(speaker, 'listening');
      interimEl.textContent = micText(speaker, 'hearing');
    },
    onInterim: (t, noFinalYet) => {
      if (!current()) return;
      interimEl.textContent = t;
      if (noFinalYet) inputEl.value = t;
    },
    onError: code => {
      if (!current()) return;
      interimEl.textContent = '';
      if (code !== 'aborted') showBanner(MIC_ERRORS[code] || `שגיאת זיהוי דיבור: ${code}. ניתן להשתמש בהקלדה כחלופה.`, code === 'no-speech' ? 'warn' : 'error');
    },
    onEnd: captured => {
      // רק הסשן הנוכחי מאפס את הכפתורים. סשן ישן שמסתיים באיחור לא עוצר את החדש.
      if (current()) stopRecognition();
      const busy = state.activeMic === speaker; // אותו דובר כבר מאזין שוב
      if (!busy) interimEl.textContent = '';
      if (!captured) return;
      if (!busy) inputEl.value = captured;
      if (el.autoTranslateOnStop.checked) handleTranslate(speaker, captured);
      else if (!busy) interimEl.textContent = micText(speaker, 'captured');
    }
  });
  if (handle) { if (current()) session.handle = handle; else handle.stop(); }
  else if (current()) { state.micSession = null; state.activeMic = null; resetMicButtons(); }
}

/* ---------- העתקה ושיתוף ---------- */
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
const copyTimers = new WeakMap();
function copyOutput(speaker, btnEl) {
  const text = state.lastTranslated[speaker];
  if (!text) { showBanner('אין עדיין תרגום להעתקה.', 'info'); return; }
  if (!btnEl.dataset.label) btnEl.dataset.label = btnEl.textContent;
  const done = () => {
    clearTimeout(copyTimers.get(btnEl));
    btnEl.textContent = '✓ ' + btnEl.dataset.label;
    copyTimers.set(btnEl, setTimeout(() => { btnEl.textContent = btnEl.dataset.label; }, 1400));
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function shareOutput(speaker) {
  const text = state.lastTranslated[speaker];
  if (!text) { showBanner('אין עדיין תרגום לשיתוף.', 'info'); return; }
  navigator.share({ text }).catch(() => { /* המשתמש ביטל */ });
}

/* ---------- משפטים מהירים, שיחון ומועדפים ---------- */
function phraseContext() {
  const actor = state.phraseActor;
  return { actor, sourceLang: langOf(actor), targetLang: langOf(other(actor)), inputEl: actor === 'A' ? el.inputA : el.inputB };
}

async function usePhrase(p) {
  unlockAudio();
  keepScreenOn();
  const { actor, sourceLang, targetLang, inputEl } = phraseContext();
  // אם למשפט יש נוסח בשפת הדובר, משתמשים בו. אחרת בנוסח האנגלי כשפת מקור.
  const srcLang = p[sourceLang] ? sourceLang : 'en';
  const srcText = p[srcLang];
  inputEl.value = srcText;

  if (p[targetLang]) {
    ++state.reqId[actor];        // מבטל תרגום קודם שעוד באוויר, כדי שלא ידרוס את המשפט הזה
    state.pending[actor] = false;
    hideBack(actor);
    finishResult(actor, srcText, sourceLang, p[targetLang], targetLang, 'phrasebook', srcLang, false);
  } else {
    // שפת היעד לא בשיחון: מתרגמים את הנוסח המקורי ברשת
    await runTranslation(actor, srcText, srcLang, targetLang, { rememberLang: sourceLang });
  }
}

async function useFavorite(f) {
  unlockAudio();
  keepScreenOn();
  const { actor, sourceLang, targetLang, inputEl } = phraseContext();
  const direct = f.sourceLang === sourceLang && f.targetLang === targetLang;
  const reverse = f.sourceLang === targetLang && f.targetLang === sourceLang;
  if (direct || reverse) {
    const src = direct ? f.originalText : f.translatedText;
    const out = direct ? f.translatedText : f.originalText;
    inputEl.value = src;
    ++state.reqId[actor];
    state.pending[actor] = false;
    hideBack(actor);
    finishResult(actor, src, sourceLang, out, targetLang, 'favorite', sourceLang, false);
    return;
  }
  inputEl.value = f.originalText;
  await runTranslation(actor, f.originalText, f.sourceLang, targetLang, { rememberLang: f.sourceLang });
}

function phraseButton(p) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'text-xs sm:text-sm px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition';
  btn.textContent = p.label || p.he;
  btn.addEventListener('click', () => usePhrase(p));
  return btn;
}

function renderQuickPhrases() {
  el.quickPhrasesGrid.textContent = '';
  PHRASES.filter(p => p.quick).forEach(p => el.quickPhrasesGrid.appendChild(phraseButton(p)));

  el.morePhrases.textContent = '';
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
    if (isLang(a)) el.langA.value = a;
    if (isLang(b)) el.langB.value = b;
    if (h) el.hotelInput.value = h;
    if (s !== null) el.autoSpeakToggle.checked = s === '1';
    if (t !== null) el.autoTranslateOnStop.checked = t === '1';
  } catch (_) { /* ignore */ }
  const hist = loadJSON(HISTORY_KEY, []);
  state.history = Array.isArray(hist) ? hist.filter(validEntry).slice(0, HISTORY_MAX) : [];
  const favs = loadJSON(FAV_KEY, []);
  state.favorites = Array.isArray(favs) ? favs.filter(validEntry).slice(0, FAV_MAX) : [];
}

function onLanguagesChanged() {
  cancelRequest('A');
  cancelRequest('B');
  updateDirectionsAndTags();
  applyPanelBLocale();
  savePrefs();
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

// בצד של דובר ב׳ (הפוך) כל הטקסטים בשפה שלו, ובצד של דובר א׳ בעברית
function applyPanelBLocale() {
  const s = bStrings();
  if (s) el.panelB.dir = LANGUAGES[el.langB.value].dir; else el.panelB.removeAttribute('dir');
  el.titleB.textContent = s ? s.title : HE.titleB;
  el.inputB.placeholder = s ? s.placeholder : HE.placeholder;
  el.sendBtnB.textContent = s ? s.send : HE.send;
  setBtnLabel(el.bigTextBtnA, s ? s.enlarge : HE.enlarge);
  setBtnLabel(el.copyBtnA, s ? s.copy : HE.copy);
  updateDirectionsAndTags();
  if (state.activeMic !== 'B') resetMicButton('B');
  else {
    el.micLabelB.textContent = micText('B', 'listening');
    const hearing = [HE.hearing, ...Object.values(panelBStringsAll()).map(x => x.hearing)];
    if (hearing.includes(el.interimB.textContent)) el.interimB.textContent = micText('B', 'hearing');
  }
  if (state.outStatus.A) setOutputStatus('A', state.outStatus.A);
}

function applyFaceToFace() {
  const on = state.faceToFace;
  document.body.classList.toggle('f2f', on);
  el.panelB.classList.toggle('face-to-face-flip', on);
  // כל אחד רואה בצד שלו את התרגום שמיועד לו
  if (on) { el.panelA.appendChild(el.outBoxB); el.panelB.appendChild(el.outBoxA); }
  else { el.panelA.appendChild(el.outBoxA); el.panelB.appendChild(el.outBoxB); }
  el.flipModeLabel.textContent = on ? 'מצב פנים-אל-פנים: פעיל' : 'מצב פנים-אל-פנים: כבוי';
  applyPanelBLocale();
  if (on) window.scrollTo({ top: 0 });
}

let bigTextCurrentLang = 'en';
let bigTextPushed = false;
function openBigText(speaker) {
  const text = state.lastTranslated[speaker];
  if (!text) { showBanner('אין עדיין תרגום להגדלה. תרגם משפט קודם.', 'info'); return; }
  const langKey = isLang(state.lastTargetLang[speaker]) ? state.lastTargetLang[speaker] : 'en';
  const cfg = LANGUAGES[langKey];
  bigTextCurrentLang = langKey;
  el.bigTextLangLabel.textContent = `תצוגה ברורה (${cfg.nameHe} · ${cfg.native})`;
  el.bigTextContent.dir = cfg.dir;
  el.bigTextContent.lang = cfg.speechCode;
  const size = text.length > 300 ? 'text-xl sm:text-3xl' : text.length > 140 ? 'text-2xl sm:text-4xl' : 'text-3xl sm:text-5xl';
  el.bigTextContent.className = `${size} font-bold text-white leading-snug break-words w-full`;
  el.bigTextContent.textContent = text;
  const src = state.lastSourceText[speaker];
  el.bigTextOriginal.dir = isLang(state.lastSourceLang[speaker]) ? LANGUAGES[state.lastSourceLang[speaker]].dir : 'auto';
  el.bigTextOriginal.textContent = src && src !== text ? src : '';
  // במצב פנים-אל-פנים, הגדלה מהצד של דובר ב׳ מוצגת הפוכה כדי שהוא יוכל לקרוא
  el.bigTextModal.classList.toggle('face-to-face-flip', state.faceToFace && speaker === 'A');
  el.bigTextModal.classList.remove('hidden');
  el.bigTextModal.scrollTop = 0;
  placeBanner();
  if (!bigTextPushed) { try { history.pushState({ tvtBigText: 1 }, ''); bigTextPushed = true; } catch { /* ignore */ } }
  try { el.bigTextCloseBtn.focus({ preventScroll: true }); } catch { /* ignore */ }
  keepScreenOn();
}
function closeBigText(fromPopState) {
  if (el.bigTextModal.classList.contains('hidden')) return;
  el.bigTextModal.classList.add('hidden');
  placeBanner();
  if (bigTextPushed) {
    bigTextPushed = false;
    if (!fromPopState) { try { history.back(); } catch { /* ignore */ } }
  }
}
// כפתור "חזור" של אנדרואיד סוגר את ההגדלה במקום לצאת מהאפליקציה
window.addEventListener('popstate', () => { bigTextPushed = false; closeBigText(true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBigText(); });

/* ---------- מלון ---------- */
async function hotelGo() {
  unlockAudio();
  keepScreenOn();
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

  const myReq = beginRequest('A');
  setOutputStatus('A', 'translating');
  let tpl = HOTEL_TEMPLATE[targetLang];
  let source = 'phrasebook';
  let outLang = targetLang;
  if (!tpl) {
    try {
      const r = await translate(HOTEL_TEMPLATE.en.trim(), 'en', targetLang);
      tpl = r.text.replace(/[:：]?\s*$/, ': ');
      source = r.source;
    } catch {
      // בלי רשת ובלי תבנית לשפה הזו: מציגים באנגלית, שרוב הנהגים מבינים יותר מעברית
      tpl = HOTEL_TEMPLATE.en;
      outLang = 'en';
      showBanner(`אין כרגע תרגום ל${LANGUAGES[targetLang].nameHe}, ולכן הבקשה מוצגת באנגלית עם שם המלון.`, 'warn');
    }
  }
  if (myReq !== state.reqId.A) return;
  state.pending.A = false;
  const out = tpl + hotel; // שם המלון נשאר כמו שהוקלד
  finishResult('A', srcText, sourceLang, out, outLang, source, srcLang, false);
  openBigText('A'); // מראים לנהג מיד בגדול
}

/* ---------- הגדרות והתקנה ---------- */
function renderVoices() {
  el.voiceInfo.textContent = '';
  if (!speechSupport.tts) { el.voiceInfo.textContent = 'הדפדפן אינו תומך בהקראה קולית.'; return; }
  const loaded = voicesLoaded();
  const keys = [...new Set(['he', 'en', 'ro', 'ar', 'th', 'ru', el.langA.value, el.langB.value])];
  if (!loaded) {
    const p = document.createElement('p');
    p.textContent = 'רשימת הקולות עדיין נטענת. אפשר כבר ללחוץ על כפתורי ההשמעה.';
    el.voiceInfo.appendChild(p);
  }
  keys.forEach(k => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2';
    const t = document.createElement('span');
    t.textContent = `${LANGUAGES[k].nameHe}: ${loaded ? (hasVoice(k) ? '✓ נמצא קול' : '✗ לא נמצא קול') : '…'}`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shrink-0 min-h-[2.25rem] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200';
    b.textContent = '▶ השמע';
    b.setAttribute('aria-label', `השמע דוגמה ב${LANGUAGES[k].nameHe}`);
    b.addEventListener('click', () => {
      unlockAudio();
      speak(LANGUAGES[k].sample, k, { onError: e => showBanner(`ההקראה נכשלה (${e}). בדוק שהצליל פועל.`, 'warn') });
    });
    row.appendChild(t);
    row.appendChild(b);
    el.voiceInfo.appendChild(row);
  });
  const note = document.createElement('p');
  note.className = 'text-slate-500';
  note.textContent = 'באנדרואיד הסימן ✓ לא תמיד אומר שהקול באמת מותקן. כדאי ללחוץ על כפתור ההשמעה ולבדוק שהקול מדבר בשפה הנכונה.';
  el.voiceInfo.appendChild(note);
  if (!loaded) setTimeout(() => { if (el.settings.open && voicesLoaded()) renderVoices(); }, 800);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function setEmailStatus(kind) {
  const map = {
    saved: ['text-emerald-400', 'נשמר ✓'],
    none: ['text-slate-400', 'לא מוגדר אימייל.'],
    invalid: ['text-amber-300', 'כתובת האימייל לא תקינה, ולכן לא נשמרה.']
  };
  const [cls, msg] = map[kind];
  el.emailStatus.className = `text-xs min-h-[1rem] ${cls}`;
  el.emailStatus.textContent = msg;
}
function saveEmail() {
  const v = el.optEmail.value.trim();
  if (!v) { setEmail(''); setEmailStatus('none'); return 'none'; }
  if (!EMAIL_RE.test(v)) { setEmailStatus('invalid'); return 'invalid'; }
  setEmail(v);
  setEmailStatus('saved');
  return 'saved';
}

async function refreshOfflineInfo() {
  el.offlineInfo.textContent = '';
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller || !('caches' in window)) {
      el.offlineInfo.textContent = 'מצב בלי אינטרנט: עדיין לא מוכן (פתח את האפליקציה פעם נוספת עם אינטרנט).';
      return;
    }
    const keys = await caches.keys();
    el.offlineInfo.textContent = keys.some(k => k.startsWith('tvt-'))
      ? '✓ מוכן לעבודה בלי אינטרנט (שיחון, מועדפים ותרגומים שמורים).'
      : 'מצב בלי אינטרנט: עדיין נטען.';
  } catch { /* ignore */ }
}

function refreshSettingsInfo() {
  el.optEmail.value = getEmail(); // מציגים את מה שבאמת שמור, לא טקסט שהוקלד ולא נשמר
  setEmailStatus(getEmail() ? 'saved' : 'none');
  renderVoices();
  el.cacheInfo.textContent = `תרגומים שמורים בזיכרון: ${cacheSize()}`;
  refreshOfflineInfo();
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
  if (state.activeMic) stopRecognition();
  const a = el.langA.value, b = el.langB.value;
  if (!voicesLoaded()) showBanner('הקראה קולית מופעלת. אם אינך שומע קול, בדוק שהמכשיר אינו במצב שקט ושהווליום פתוח.', 'info');
  const fail = e => showBanner(`ההקראה נכשלה (${e}). בדוק שהצליל פועל.`, 'warn');
  // הדוגמה השנייה מתחילה רק כשהראשונה הסתיימה באמת (לא כשנעצרה)
  speak(LANGUAGES[a].sample, a, { onEnd: () => speak(LANGUAGES[b].sample, b, { onError: fail }), onError: fail });
  if (!hasVoice(a) && voicesLoaded()) showBanner(`חסר קול ל${LANGUAGES[a].nameHe} במכשיר. הסבר להתקנה בהגדרות.`, 'warn');
});

el.copyBtnA.addEventListener('click', () => copyOutput('A', el.copyBtnA));
el.copyBtnB.addEventListener('click', () => copyOutput('B', el.copyBtnB));
el.checkBtnA.addEventListener('click', () => { unlockAudio(); checkMeaning('A'); });
el.checkBtnB.addEventListener('click', () => { unlockAudio(); checkMeaning('B'); });
if (navigator.share) {
  el.shareBtnA.classList.remove('hidden');
  el.shareBtnB.classList.remove('hidden');
  el.shareBtnA.addEventListener('click', () => shareOutput('A'));
  el.shareBtnB.addEventListener('click', () => shareOutput('B'));
}

el.langA.addEventListener('change', onLanguagesChanged);
el.langB.addEventListener('change', onLanguagesChanged);
el.hotelInput.addEventListener('input', savePrefs);
el.autoSpeakToggle.addEventListener('change', savePrefs);
el.autoTranslateOnStop.addEventListener('change', savePrefs);

el.swapLangsBtn.addEventListener('click', () => {
  const tmp = el.langA.value;
  el.langA.value = el.langB.value;
  el.langB.value = tmp;
  onLanguagesChanged();
});

el.flipModeBtn.addEventListener('click', () => {
  state.faceToFace = !state.faceToFace;
  applyFaceToFace();
});

el.phraseActorA.addEventListener('click', () => {
  state.phraseActor = 'A';
  el.phraseActorA.className = 'px-3 py-1.5 rounded-lg bg-sky-600 text-white font-medium';
  el.phraseActorB.className = 'px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700';
});
el.phraseActorB.addEventListener('click', () => {
  state.phraseActor = 'B';
  el.phraseActorB.className = 'px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium';
  el.phraseActorA.className = 'px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700';
});

el.moreToggleBtn.addEventListener('click', () => {
  const open = el.morePhrases.classList.toggle('hidden') === false;
  el.moreToggleBtn.textContent = open ? 'פחות משפטים ▴' : 'עוד משפטים ▾';
  el.moreToggleBtn.setAttribute('aria-expanded', String(open));
});

el.clearHistoryBtn.addEventListener('click', () => {
  if (!state.history.length) return;
  if (!window.confirm('למחוק את כל היסטוריית השיחה? (המועדפים נשארים)')) return;
  state.history = [];
  saveHistory();
  renderHistory();
});
el.dismissBannerBtn.addEventListener('click', () => hideBanner(true));
el.bannerActionBtn.addEventListener('click', () => { const a = bannerAction; hideBanner(true); if (a) a.fn(); });

el.turnStep1Btn.addEventListener('click', () => setActiveTurn('A'));
el.turnStep2Btn.addEventListener('click', () => setActiveTurn('B'));
el.switchTurnBtn.addEventListener('click', () => {
  stopRecognition();
  setActiveTurn(state.activeTurn === 'A' ? 'B' : 'A');
});

el.bigTextBtnA.addEventListener('click', () => openBigText('A'));
el.bigTextBtnB.addEventListener('click', () => openBigText('B'));
el.bigTextCloseBtn.addEventListener('click', () => closeBigText());
el.bigTextModal.addEventListener('click', e => { if (e.target === el.bigTextModal) closeBigText(); });
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

el.settingsBtn.addEventListener('click', () => { refreshSettingsInfo(); el.settings.showModal(); placeBanner(); });
el.settings.addEventListener('close', placeBanner);
el.closeSettings.addEventListener('click', () => el.settings.close());
el.settings.addEventListener('click', e => { if (e.target === el.settings) el.settings.close(); });
el.optEmail.addEventListener('input', saveEmail);   // נשמר מיד בזמן ההקלדה
el.optEmail.addEventListener('change', saveEmail);
{
  let flashTimer = null;
  el.saveEmailBtn.addEventListener('click', () => {
    const ok = saveEmail() !== 'invalid';
    const btn = el.saveEmailBtn;
    clearTimeout(flashTimer);
    btn.textContent = ok ? 'נשמר ✓' : 'לא נשמר ✗';
    btn.classList.remove('bg-indigo-600', 'bg-green-600', 'bg-red-600');
    btn.classList.add(ok ? 'bg-green-600' : 'bg-red-600');
    flashTimer = setTimeout(() => {
      btn.textContent = 'שמור';
      btn.classList.remove('bg-green-600', 'bg-red-600');
      btn.classList.add('bg-indigo-600');
    }, 1800);
  });
}
el.clearCacheBtn.addEventListener('click', () => { clearCache(); refreshSettingsInfo(); });
el.installBtn.addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (_) { /* ignore */ }
  deferredInstall = null;
  el.installBtn.classList.add('hidden');
});

window.addEventListener('offline', () => showBanner('אין חיבור לאינטרנט. המשפטים המהירים, "עוד משפטים", המועדפים ותרגומים ששמורים בזיכרון ממשיכים לעבוד.', 'warn', { sticky: true }));
window.addEventListener('online', () => hideBanner());

/* ---------- אתחול ---------- */
let lastActivity = 0;
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { lastActivity = Date.now(); }, { capture: true, passive: true });

el.optEmail.value = getEmail();
loadPrefs();
setActiveTurn('A');
updateDirectionsAndTags();
applyPanelBLocale();
renderQuickPhrases();
renderFavorites();
renderHistory();
if (!speechSupport.stt) {
  showBanner('שים לב: זיהוי דיבור בדפדפן זה אינו זמין. ניתן להקליד או לבחור משפטים מהירים.', 'info');
}
if (!navigator.onLine) window.dispatchEvent(new Event('offline'));
window.__tvtStarted = true; // שומר האתחול ב-index.html יודע שהאפליקציה עלתה
try { sessionStorage.removeItem('tvt_boot_retry'); } catch { /* ignore */ }

if ('serviceWorker' in navigator) {
  // גרסה חדשה נשמרת ברקע בשלמותה. אם באמצע שיחה, שואלים לפני רענון.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  update.reload = () => { if (reloading) return; reloading = true; location.reload(); };
  // מרעננים לבד רק כשבאמת לא משתמשים באפליקציה. אחרת שואלים.
  const busy = () => {
    const a = document.activeElement;
    return !!state.activeMic || state.pending.A || state.pending.B || el.settings.open || isSpeaking() ||
      !el.bigTextModal.classList.contains('hidden') || (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) ||
      Date.now() - lastActivity < 2 * 60 * 1000;
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    update.ready = true;
    if (busy()) showUpdateBanner();
    else update.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    let lastCheck = Date.now();
    // אפליקציה שנשארת פתוחה ברקע בודקת עדכון כשחוזרים אליה
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > 30 * 60 * 1000) {
        lastCheck = Date.now();
        reg.update().catch(() => {});
      }
    });
    return navigator.serviceWorker.ready;
  }).then(() => {
    if (!hadController && !loadJSON('tvt_offline_ready', false)) {
      saveJSON('tvt_offline_ready', true);
      showBanner('✓ האפליקציה נשמרה בטלפון ומוכנה לעבודה גם בלי אינטרנט.', 'info');
    }
  }).catch(() => { /* האפליקציה עובדת גם בלי SW */ });
}

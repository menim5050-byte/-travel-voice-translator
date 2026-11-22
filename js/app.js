import { LANGUAGES } from './languages.js';
import { PHRASES, CATEGORY_LABELS, HOTEL_TEMPLATE } from './phrasebook.js';
import { translate, getEmail, setEmail, clearCache, cacheSize, isLang, getServer, setServer, testServer, normalizeServerUrl, lastServerError, groqTranslateOn, setGroqTranslate, translateBatch, probeTranslator, verifyTranslation } from './translate.js';
import { speak, stopSpeaking, listen, listenLoop, unlockAudio, hasVoice, voicesLoaded, speechSupport, isSpeaking } from './speech.js';
import { panelBStrings, PANEL_B_UI } from './ui-strings.js';
import { startRecording, recordUtterance, recorderSupported, extFor } from './recorder.js';
import { transcribe, getGroqKey, setGroqKey, looksLikeGroqKey, testGroqKey, groupSegments, CONVERSATION_MODELS } from './transcribe.js';
import { prepareImage, readAndTranslate, availableModels, VISION_CANDIDATES } from './vision.js';
import { numberMismatch } from './numcheck.js';
import { getGeminiKey, setGeminiKey, looksLikeGeminiKey, normalizeGeminiKey, geminiAssistOn, setGeminiAssist, geminiReady, geminiReview, testGeminiKey, PRON_LANGS } from './gemini.js';
import { getRates, normalizeCurrency, toILS, formatILS, RATES_CREDIT } from './currency.js';
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
  verifyA: $('verifyA'), verifyB: $('verifyB'),
  pronA: $('pronA'), pronB: $('pronB'),
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
const verifyOf = s => (s === 'A' ? el.verifyA : el.verifyB);
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
function hideBack(speaker) { const b = backOf(speaker); b.classList.add('hidden'); b.textContent = ''; hideVerify(speaker); }
function hideVerify(speaker) {
  const v = verifyOf(speaker); v.classList.add('hidden'); v.textContent = '';
  const p = speaker === 'A' ? el.pronA : el.pronB; p.classList.add('hidden'); p.textContent = '';
}

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
const SRC_LABEL = { azure: '', groq: '', phrasebook: 'שיחון', cache: 'זיכרון', mymemory: '', google: 'גיבוי Google', lingva: 'גיבוי', same: '', favorite: 'מועדף', listen: '', camera: '' };
const AUTO_LANG = { nameHe: 'זוהתה אוטומטית', native: '', dir: 'auto', speechCode: '' };

/* זכר ונקבה בתרגום (דובר א׳ = בעל הטלפון, דובר ב׳ = הצד השני) */
const GENDER_KEY = 'tvt_gender';
const okGender = v => (v === 'male' || v === 'female' ? v : '');
const gender = (() => { const g = loadJSON(GENDER_KEY, {}) || {}; return { A: okGender(g.A), B: okGender(g.B) }; })();
function setGender(speaker, v) {
  gender[speaker] = okGender(v); saveJSON(GENDER_KEY, gender); renderGender();
  state.lastSourceText.A = state.lastSourceText.B = ''; // אותו משפט יתורגם מחדש, לפי המין החדש
}
function renderGender() {
  const b = $('genderBBtn');
  b.textContent = gender.B === 'male' ? '👨' : gender.B === 'female' ? '👩' : '👤 ?';
  b.title = `הצד השני: ${gender.B === 'male' ? 'גבר' : gender.B === 'female' ? 'אישה' : 'לא ידוע'} (לחיצה מחליפה)`;
  $('optGenderA').value = gender.A;
  $('optGenderB').value = gender.B;
}
// מה ש-Groq צריך כדי לתרגם נכון: מי מדבר אל מי, ומה נאמר רגע לפני (עד 3 משפטים מ-15 הדקות האחרונות)
function translateOpts(speaker) {
  const now = Date.now();
  const context = state.history
    .filter(h => h && (h.speaker === 'A' || h.speaker === 'B') && h.source !== 'listen' && h.source !== 'camera' && now - h.ts < 15 * 60000)
    .slice(0, 3).reverse()
    .map(h => ({ who: h.speaker === speaker ? 'self' : 'other', text: String(h.originalText || '') }));
  return { gender: { speaker: gender[speaker], listener: gender[other(speaker)] }, context };
}
const langCfg = k => (isLang(k) ? LANGUAGES[k] : AUTO_LANG);

const validEntry = e => e && typeof e === 'object' && (isLang(e.sourceLang) || e.sourceLang === 'auto') && isLang(e.targetLang) &&
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
    const srcCfg = langCfg(item.sourceLang);
    const tgtCfg = LANGUAGES[item.targetLang];

    const card = document.createElement('div');
    card.className = 'bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start justify-between gap-2 text-xs text-slate-400';

    const badge = document.createElement('span');
    badge.className = isA ? 'text-sky-400 font-semibold pt-1.5' : 'text-emerald-400 font-semibold pt-1.5';
    const lbl = SRC_LABEL[item.source] ? ` · ${SRC_LABEL[item.source]}` : '';
    const who = item.source === 'listen' ? '🎧 האזנה' : item.source === 'camera' ? '📷 צילום' : (isA ? 'דובר א׳' : 'דובר ב׳');
    badge.textContent = `${who} · ${srcCfg.nameHe} ← ${tgtCfg.nameHe} · ${timeLabel(item.ts)}${lbl}`;

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

    if (item.source !== 'listen' && item.source !== 'camera' && isLang(item.sourceLang)) actions.appendChild(favBtn); // טקסט ארוך לא נכנס למועדפים
    actions.appendChild(playBtn);
    topRow.appendChild(badge);
    topRow.appendChild(actions);

    const origP = document.createElement('p');
    origP.className = 'text-xs text-slate-300 whitespace-pre-line';
    origP.dir = srcCfg.dir;
    origP.textContent = item.originalText;

    const transP = document.createElement('p');
    transP.className = 'text-sm font-medium text-white whitespace-pre-line';
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
  state.favorites.filter(f => isLang(f.sourceLang)).forEach(f => {
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
  runVerify(speaker, srcText, historyLang, out, to, source, state.reqId[speaker]);
  // מחיר, שעה או טלפון שהשתנו בתרגום הם הטעות היקרה ביותר, ולכן מתריעים (המספרים מבודדים כדי שלא יתהפכו ב-RTL)
  const mm = numberMismatch(srcText, out);
  if (mm) {
    const f = a => a.map(n => `\u2066${n}\u2069`).join(' ');
    showBanner(`⚠ בדוק מספרים: במקור ${f(mm.source)}, בתרגום ${mm.translated.length ? f(mm.translated) : 'אין ספרות'}. אם מדובר במחיר או בשעה, אמת אותם.`, 'warn');
  }
}

/* ---------- אימות אמינות: תרגום חוזר במנוע אחר, ותווית על מנוע גיבוי ---------- */
const FALLBACK_ENGINE = { mymemory: 'MyMemory', google: 'Google', lingva: 'Lingva' };
const NO_VERIFY_SOURCES = new Set(['phrasebook', 'same', 'none']);
const verifyWanted = (to, from) => isLang(to) && isLang(from) && to !== 'he' && to !== 'en' && to !== from;

function paintVerify(speaker, tone, text, back, backLang, alt, altLang) {
  const v = verifyOf(speaker);
  const cls = { ok: 'text-emerald-400', warn: 'text-amber-300', info: 'text-slate-400' }[tone] || 'text-slate-400';
  v.className = `text-xs leading-relaxed ${cls}`;
  v.dir = 'rtl';
  v.textContent = text;
  if (back) {
    const lab = document.createElement('span');
    lab.textContent = ` בחזרה ל${LANGUAGES[backLang].nameHe}: `;
    const val = document.createElement('bdi');
    val.className = 'text-slate-200';
    val.textContent = back;
    v.appendChild(lab); v.appendChild(val);
  }
  if (alt) {
    const br = document.createElement('div');
    br.className = 'mt-0.5';
    br.appendChild(document.createTextNode('תרגום חלופי מוצע: '));
    const a = document.createElement('bdi');
    a.className = 'text-sky-200'; a.dir = LANGUAGES[altLang].dir; a.lang = LANGUAGES[altLang].speechCode;
    a.textContent = alt;
    br.appendChild(a); v.appendChild(br);
  }
}

function paintPron(speaker, he, roman) {
  const p = speaker === 'A' ? el.pronA : el.pronB;
  p.dir = 'rtl';
  p.textContent = 'הגייה (משוערת): ';
  const parts = [];
  if (he) { const b = document.createElement('bdi'); b.className = 'text-amber-100'; b.textContent = he; parts.push(b); }
  if (roman) { const b = document.createElement('bdi'); b.dir = 'ltr'; b.className = 'text-slate-300'; b.textContent = roman; parts.push(b); }
  parts.forEach((b, i) => { if (i) p.appendChild(document.createTextNode(' · ')); p.appendChild(b); });
  p.classList.toggle('hidden', !parts.length);
}

async function runVerify(speaker, srcText, from, out, to, source, myReq) {
  const fb = FALLBACK_ENGINE[source];
  const badge = fb ? `⚠ תורגם במנוע גיבוי (${'\u2066' + fb + '\u2069'}), איכות נמוכה יותר. ` : '';
  const wantVerify = verifyWanted(to, from) && !NO_VERIFY_SOURCES.has(source);
  const wantPron = isLang(from) && from !== to && PRON_LANGS.has(to) && source !== 'none' && geminiReady();
  if (!wantVerify && !wantPron) { if (badge) paintVerify(speaker, 'warn', badge.trim()); return; }
  if (wantVerify) paintVerify(speaker, fb ? 'warn' : 'info', badge + 'בודק אמינות...');
  else if (badge) paintVerify(speaker, 'warn', badge.trim());
  // קודם Gemini (בקשה אחת: בדיקה, תרגום חלופי והגייה). אם אין מפתח או שנכשל, השופט הרגיל.
  let g = null;
  if (geminiReady()) { try { g = await geminiReview(srcText, from, out, to, { verify: wantVerify, pron: wantPron }); } catch { g = null; } }
  if (myReq !== state.reqId[speaker]) return;
  if (g && wantPron && (g.he || g.roman)) paintPron(speaker, g.he, g.roman);
  if (!wantVerify) return;
  if (g && g.verdict === 'same') { paintVerify(speaker, 'ok', badge + '✓ אומת ב-Gemini.', g.back, from); return; }
  if (g && g.verdict === 'different') {
    paintVerify(speaker, 'warn', badge + '⚠ ייתכן שהמשמעות השתנתה' + (g.note ? ` (${g.note})` : '') + '. כדאי לנסח מחדש בקצרה.', g.back, from, g.alt, to);
    return;
  }
  try {
    const r = await verifyTranslation(srcText, from, out, to);
    if (myReq !== state.reqId[speaker]) return;
    if (r.status === 'ok') paintVerify(speaker, 'ok', badge + '✓ אומת במנוע נוסף.', r.back, from);
    else if (r.status === 'warn') paintVerify(speaker, 'warn', badge + '⚠ ייתכן שהמשמעות השתנתה' + (r.note ? ` (${r.note})` : '') + '. כדאי לנסח מחדש בקצרה.', r.back, from);
    else paintVerify(speaker, fb ? 'warn' : 'info', badge + 'לא הצלחתי לאמת כרגע.', r.back, from);
  } catch {
    if (myReq === state.reqId[speaker]) paintVerify(speaker, fb ? 'warn' : 'info', badge + 'לא הצלחתי לאמת כרגע.');
  }
}

async function runTranslation(speaker, text, from, to, { forceSpeak = false, rememberLang = from } = {}) {
  const myReq = beginRequest(speaker);
  const current = () => myReq === state.reqId[speaker];
  setOutputStatus(speaker, 'translating');
  reveal(speaker);
  try {
    const r = await translate(text, from, to, { onBackup: () => { if (current()) setOutputStatus(speaker, 'backup'); }, ...translateOpts(speaker) });
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
  const to = isLang(state.lastSourceLang[speaker]) ? state.lastSourceLang[speaker] : langOf(speaker);
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
  if (wState.session && !wState.session.auto) wState.session.stop(); // הקלטת Whisper של כפתור דובר
  resetMicButtons();
}

function toggleMic(speaker) {
  unlockAudio(); // חייב להיקרא מתוך לחיצה, אחרת נייד יחסום את ההקראה
  stopSpeaking();
  keepScreenOn();
  if (wState.engine === 'whisper') { toggleWhisperMic(speaker); return; }
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


/* ---------- זיהוי דיבור עם Whisper: שקט, מסיים לבד, וגם זיהוי אוטומטי של מי מדבר ---------- */
const wState = {
  engine: loadJSON('tvt_stt_engine', 'phone') === 'whisper' ? 'whisper' : 'phone',
  session: null,          // ההקלטה הנוכחית: { speaker, auto, stop() }
  auto: { on: false }
};
const aEl = { btn: $('autoTalkBtn'), label: $('autoTalkLabel'), loop: $('autoTalkLoop'), status: $('autoTalkStatus'), wrap: $('autoTalkWrap') };

function setMicBusyUi(speaker, mode) {
  const btn = speaker === 'A' ? el.micBtnA : el.micBtnB;
  const label = speaker === 'A' ? el.micLabelA : el.micLabelB;
  if (mode === 'rec') {
    btn.classList.remove('bg-sky-600', 'hover:bg-sky-500', 'bg-emerald-600', 'hover:bg-emerald-500');
    btn.classList.add('mic-listening', 'bg-rose-600', 'hover:bg-rose-500');
    label.textContent = micText(speaker, 'listening');
  } else resetMicButton(speaker);
}

const SCRIPT_OF = { he: /[֐-׿]/, ar: /[؀-ۿ]/, th: /[฀-๿]/, ru: /[Ѐ-ӿ]/, el: /[Ͱ-Ͽ]/, hi: /[ऀ-ॿ]/, ko: /[가-힯]/, ja: /[぀-ヿ]/ };
// מי דיבר: לפי השפה ש-Whisper זיהה, ואם הכתב חד-משמעי (עברית, תאית, ערבית...) הכתב מכריע
function decideSpeaker(text, detected) {
  const a = el.langA.value, b = el.langB.value;
  for (const [k, re] of Object.entries(SCRIPT_OF)) {
    if (!re.test(text)) continue;
    if (k === a && b !== a) return { speaker: 'A', from: a };
    if (k === b) return { speaker: 'B', from: b };
  }
  if (detected === a) return { speaker: 'A', from: a };
  if (detected === b) return { speaker: 'B', from: b };
  return { speaker: 'B', from: isLang(detected) ? detected : 'auto' }; // שפה שלישית: מתרגמים לשפה של דובר א׳
}

/* ההקלטה האחרונה של Whisper: מציגים מה נשלח ומה חזר, ומאפשרים להשמיע אותה. כך רואים אם הבעיה בהקלטה עצמה או בזיהוי. */
const lastRec = { url: null, audio: null };
const lrEl = { wrap: $('lastRecWrap'), play: $('lastRecPlay'), info: $('lastRecInfo') };
function setLastRecording({ blob, peak, ms, asked, model, detected, dropped, text, confidence }) {
  if (lastRec.audio) { try { lastRec.audio.pause(); } catch { /* ignore */ } lastRec.audio = null; }
  if (lastRec.url) { try { URL.revokeObjectURL(lastRec.url); } catch { /* ignore */ } }
  lastRec.url = blob ? URL.createObjectURL(blob) : null;
  const ltr = v => `\u2066${v}\u2069`; // מבודד שמות באנגלית ומספרים, כדי שלא יתערבבו בתוך טקסט בעברית
  const pct = Math.round(Math.min(1, peak || 0) * 100);
  const level = pct < 20 ? `⚠ עוצמה חלשה מאוד ${ltr(pct + '%')}` : pct > 97 ? `⚠ עוצמה גבוהה מדי, ייתכן עיוות ${ltr(pct + '%')}` : `עוצמה ${ltr(pct + '%')}`;
  const asLang = asked === 'auto' ? 'זיהוי שפה אוטומטי' : (isLang(asked) ? LANGUAGES[asked].nameHe : asked);
  const parts = [`${ltr((ms / 1000).toFixed(1))} שנ׳`, level, `מודל ${ltr(model || '?')}`, `שפה: ${asLang}`];
  if (detected && asked === 'auto') parts.push(`זוהתה: ${ltr(detected)}`);
  if (confidence != null) parts.push(`ביטחון בזיהוי ${ltr(Math.round(confidence * 100) + '%')}`);
  if (dropped) parts.push(`הושמט קטע שנראה כמו רעש (${dropped})`);
  if (!text) parts.push('לא זוהה טקסט');
  lrEl.info.textContent = parts.join(' · ');
  lrEl.wrap.classList.toggle('hidden', !lastRec.url);
}
lrEl.play.addEventListener('click', () => {
  if (!lastRec.url) return;
  unlockAudio();
  stopSpeaking();
  if (wState.session) return; // באמצע הקלטה לא משמיעים
  if (lastRec.audio) { try { lastRec.audio.pause(); } catch { /* ignore */ } }
  lastRec.audio = new Audio(lastRec.url);
  lastRec.audio.play().catch(() => showBanner('לא ניתן להשמיע את ההקלטה בדפדפן הזה.', 'warn'));
});

// הקשר ל-Whisper: שם המלון ועד 2 משפטים אחרונים מהשיחה (15 דקות). עוזר לשמות ולמונחים נדירים. הניסוי הזה עוד לא נבדק בשטח.
function whisperPrompt() {
  const now = Date.now();
  const recent = state.history
    .filter(h => h && (h.speaker === 'A' || h.speaker === 'B') && h.source !== 'listen' && h.source !== 'camera' && now - h.ts < 15 * 60000)
    .slice(0, 2).reverse().map(h => String(h.originalText || '').slice(0, 120));
  const hotel = el.hotelInput.value.trim().slice(0, 80);
  return [hotel, ...recent].filter(Boolean).join('. ');
}

/** מקליט משפט אחד בשקט ומתמלל. auto=true: זיהוי שפה אוטומטי. מחזיר { text, langKey } או null. */
async function whisperUtterance({ speaker, auto, onState }) {
  if (!getGroqKey()) {
    showBanner('לזיהוי דיבור עם Whisper צריך מפתח Groq (הגדרות ← מפתח Groq).', 'warn');
    return null;
  }
  if (!recorderSupported()) { showBanner('הדפדפן הזה לא תומך בהקלטה.', 'error'); return null; }
  const session = { speaker, auto, stop: () => { session.stopRequested = true; } };
  wState.session = session;
  if (onState) onState('rec');
  let ctl, peak = 0;
  try {
    ctl = await recordUtterance({ onSpeech: () => { if (onState) onState('speech'); }, onLevel: v => { if (v > peak) peak = v; } });
  } catch (e) {
    if (wState.session === session) wState.session = null;
    if (onState) onState('idle');
    const msg = e.code === 'not-allowed' ? MIC_ERRORS['not-allowed'] : 'לא ניתן להפעיל את המיקרופון כרגע.';
    showBanner(msg, 'error');
    return null;
  }
  session.stop = () => ctl.stop();
  if (session.stopRequested) ctl.stop();
  const res = await ctl.done;
  if (wState.session === session) wState.session = null;
  if (!res.blob || (!res.hadSpeech && !res.maybeSpeech && !(res.reason === 'user' && res.ms > 800))) {
    if (onState) onState('empty');
    return { text: '', langKey: null, empty: true };
  }
  if (onState) onState('transcribing');
  try {
    const asked = auto ? 'auto' : langOf(speaker);
    const r = await transcribe(res.blob, { langKey: asked, filename: `speech.${extFor(res.blob.type)}`, models: CONVERSATION_MODELS, filterDubious: true, prompt: whisperPrompt() });
    const text = String(r.text || '').trim();
    setLastRecording({ blob: res.blob, peak, ms: res.ms, asked, model: r.model, detected: r.detectedName, dropped: r.dropped, text, confidence: r.confidence });
    if (onState) onState(text ? 'done' : 'empty');
    return { text, langKey: r.langKey, confidence: r.confidence };
  } catch (e) {
    if (onState) onState('error');
    showBanner(e.message || 'התמלול נכשל.', 'error');
    return null;
  }
}

// זיהוי דיבור לא בטוח בשפה שהמשתמש לא קורא (רומנית, תאית, ערבית): מזהירים לפני שמתרגמים על בסיס טקסט שאולי שגוי.
// הסף עדיין לא מכויל מול שימוש אמיתי, ולכן הביטחון מוצג גם ברצועת "ההקלטה האחרונה".
export const LOW_CONFIDENCE = 0.6;
function warnLowConfidence(confidence, langKey) {
  if (confidence == null || confidence >= LOW_CONFIDENCE) return;
  if (!isLang(langKey) || langKey === 'he' || langKey === 'en') return;
  const pct = `\u2066${Math.round(confidence * 100)}%\u2069`;
  showBanner(`⚠ הזיהוי של ${LANGUAGES[langKey].nameHe} לא בטוח (${pct}). אמת מול הטקסט שזוהה, או חזור על המשפט לאט וברור.`, 'warn');
}

// כפתור מיקרופון של דובר, כשמנוע הזיהוי הוא Whisper
async function toggleWhisperMic(speaker) {
  if (wState.session) {
    const same = wState.session.speaker === speaker && !wState.session.auto;
    wState.session.stop();
    if (same) return; // לחיצה שנייה = עצירה, והמשפט יתומלל
  }
  stopAutoTalk();
  state.activeMic = speaker;
  const interimEl = speaker === 'A' ? el.interimA : el.interimB;
  const inputEl = speaker === 'A' ? el.inputA : el.inputB;
  const r = await whisperUtterance({
    speaker, auto: false,
    onState: st => {
      if (st === 'rec') { setMicBusyUi(speaker, 'rec'); interimEl.textContent = '🎙️ ' + micText(speaker, 'hearing'); }
      else if (st === 'transcribing') { setMicBusyUi(speaker, 'idle'); interimEl.textContent = 'מתמלל...'; }
      else if (st === 'empty') { setMicBusyUi(speaker, 'idle'); interimEl.textContent = 'לא זוהה דיבור. נסה שוב, קרוב יותר לטלפון.'; }
      else { setMicBusyUi(speaker, 'idle'); if (st !== 'done') interimEl.textContent = ''; }
    }
  });
  if (state.activeMic === speaker) state.activeMic = null;
  if (!r || !r.text) return;
  warnLowConfidence(r.confidence, r.langKey || langOf(speaker));
  inputEl.value = r.text;
  if (el.autoTranslateOnStop.checked) { interimEl.textContent = ''; handleTranslate(speaker, r.text); }
  else interimEl.textContent = micText(speaker, 'captured');
}

/* "דברו – האפליקציה תזהה מי מדבר" */
function setAutoTalkUi(mode, note) {
  const busy = mode === 'rec' || mode === 'speech' || mode === 'transcribing';
  aEl.btn.classList.toggle('mic-listening', mode === 'rec' || mode === 'speech');
  aEl.label.textContent = mode === 'transcribing' ? 'מתמלל...' : busy ? '⏹ מאזין... (לחץ לעצירה)' : 'דברו – האפליקציה תזהה מי מדבר';
  if (note !== undefined) aEl.status.textContent = note;
}
function stopAutoTalk() {
  if (!wState.auto.on) return;
  wState.auto.on = false;
  if (wState.session && wState.session.auto) wState.session.stop();
}
async function waitSpeechToEnd(maxMs = 30000) {
  const t0 = Date.now();
  await new Promise(r => setTimeout(r, 300));
  while (isSpeaking() && Date.now() - t0 < maxMs) await new Promise(r => setTimeout(r, 250));
  await new Promise(r => setTimeout(r, 350)); // שהרמקול ישתתק לגמרי לפני שמקליטים שוב
}
async function autoTalkLoop() {
  if (wState.auto.on) { stopAutoTalk(); return; }
  if (!getGroqKey()) {
    aEl.status.textContent = 'צריך מפתח Groq: הגדרות ← "מפתח Groq להקלטה שקטה ולצילום".';
    showBanner('לזיהוי אוטומטי של הדובר צריך מפתח Groq בהגדרות.', 'warn');
    return;
  }
  unlockAudio();
  stopSpeaking();
  if (state.activeMic) stopRecognition();
  if (wState.session) wState.session.stop();
  wState.auto.on = true;
  keepScreenOn();
  let empties = 0;
  while (wState.auto.on) {
    const r = await whisperUtterance({
      auto: true,
      onState: st => {
        if (st === 'rec') setAutoTalkUi('rec', `מאזין... דברו ב${LANGUAGES[el.langA.value].nameHe} או ב${LANGUAGES[el.langB.value].nameHe}.`);
        else if (st === 'speech') setAutoTalkUi('speech');
        else if (st === 'transcribing') setAutoTalkUi('transcribing', 'מתמלל ומזהה שפה...');
        else if (st === 'empty') setAutoTalkUi('idle', 'לא זוהה דיבור.');
        else setAutoTalkUi('idle');
      }
    });
    if (!r) break;                                   // שגיאה: עוצרים
    if (r.empty || !r.text) {
      if (!aEl.loop.checked || ++empties >= 3) break; // במצב רציף: אחרי 3 פעמים בלי דיבור עוצרים
      continue;
    }
    empties = 0;
    const d = decideSpeaker(r.text, r.langKey);
    warnLowConfidence(r.confidence, isLang(d.from) ? d.from : r.langKey);
    const who = d.speaker === 'A' ? 'דובר א׳' : 'דובר ב׳';
    const langName = isLang(d.from) ? LANGUAGES[d.from].nameHe : 'שפה שזוהתה אוטומטית';
    aEl.status.textContent = `זוהה: ${langName} ← ${who}`;
    setActiveTurn(d.speaker);
    const inputEl = d.speaker === 'A' ? el.inputA : el.inputB;
    inputEl.value = r.text;
    const target = langOf(other(d.speaker));
    if (d.from === langOf(d.speaker)) await handleTranslate(d.speaker, r.text);
    else await runTranslation(d.speaker, r.text, d.from, d.speaker === 'B' ? el.langA.value : target);
    if (!wState.auto.on || !aEl.loop.checked) break;
    await waitSpeechToEnd();
  }
  wState.auto.on = false;
  setAutoTalkUi('idle');
}
aEl.btn.addEventListener('click', autoTalkLoop);
aEl.loop.checked = loadJSON('tvt_autotalk_loop', false) === true;
aEl.loop.addEventListener('change', () => saveJSON('tvt_autotalk_loop', aEl.loop.checked));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopAutoTalk(); });

function renderSttEngine() {
  const box = $('sttEngine');
  box.textContent = '';
  [['phone', '📱 של הטלפון', 'מהיר, עם צליל'], ['whisper', '🎙️ Whisper', 'שקט ומדויק, מפתח Groq']].forEach(([id, t, sub]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.engine = id;
    b.className = 'rounded-xl border px-2 py-2 text-sm flex flex-col items-center gap-0.5 transition ' + (wState.engine === id
      ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700');
    const a = document.createElement('span'); a.className = 'font-semibold'; a.textContent = t;
    const c = document.createElement('span'); c.className = 'text-[11px] opacity-80'; c.textContent = sub;
    b.appendChild(a); b.appendChild(c);
    b.addEventListener('click', () => {
      if (id === 'whisper' && !getGroqKey()) { setGroqStatus('text-amber-300', 'כדי להשתמש ב-Whisper, הדבק קודם מפתח Groq כאן למטה.'); }
      wState.engine = id;
      saveJSON('tvt_stt_engine', id);
      renderSttEngine();
    });
    box.appendChild(b);
  });
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
function copyOutput(speaker, btnEl, explicitText) {
  const text = explicitText || state.lastTranslated[speaker];
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
// כפתור "חזור" של אנדרואיד סוגר חלון פתוח (תצוגה גדולה / מצב האזנה) במקום לצאת מהאפליקציה
const overlayPushed = { big: false, listen: false, cam: false };
let ignorePops = 0;
function pushOverlay(name) {
  if (overlayPushed[name]) return;
  try { history.pushState({ tvtOverlay: name }, ''); overlayPushed[name] = true; } catch { /* ignore */ }
}
function popOverlay(name, fromPopState) {
  if (!overlayPushed[name]) return;
  overlayPushed[name] = false;
  if (!fromPopState) { ignorePops++; try { history.back(); } catch { ignorePops--; } }
}
function openBigText(speaker) {
  const text = state.lastTranslated[speaker];
  if (!text) { showBanner('אין עדיין תרגום להגדלה. תרגם משפט קודם.', 'info'); return; }
  // במצב פנים-אל-פנים, הגדלה מהצד של דובר ב׳ מוצגת הפוכה כדי שהוא יוכל לקרוא
  showBigText({ text, langKey: state.lastTargetLang[speaker], src: state.lastSourceText[speaker], srcLang: state.lastSourceLang[speaker], flip: state.faceToFace && speaker === 'A' });
}
function showBigText({ text, langKey: wanted, src, srcLang, flip }) {
  const langKey = isLang(wanted) ? wanted : 'en';
  const cfg = LANGUAGES[langKey];
  bigTextCurrentLang = langKey;
  el.bigTextLangLabel.textContent = `תצוגה ברורה (${cfg.nameHe} · ${cfg.native})`;
  el.bigTextContent.dir = cfg.dir;
  el.bigTextContent.lang = cfg.speechCode;
  const size = text.length > 300 ? 'text-xl sm:text-3xl' : text.length > 140 ? 'text-2xl sm:text-4xl' : 'text-3xl sm:text-5xl';
  el.bigTextContent.className = `${size} font-bold text-white leading-snug break-words w-full`;
  el.bigTextContent.textContent = text;
  el.bigTextOriginal.dir = isLang(srcLang) ? LANGUAGES[srcLang].dir : 'auto';
  el.bigTextOriginal.textContent = src && src !== text ? src : '';
  el.bigTextModal.classList.toggle('face-to-face-flip', !!flip);
  el.bigTextModal.classList.remove('hidden');
  el.bigTextModal.scrollTop = 0;
  placeBanner();
  pushOverlay('big');
  try { el.bigTextCloseBtn.focus({ preventScroll: true }); } catch { /* ignore */ }
  keepScreenOn();
}
function closeBigText(fromPopState) {
  if (el.bigTextModal.classList.contains('hidden')) return;
  el.bigTextModal.classList.add('hidden');
  placeBanner();
  popOverlay('big', fromPopState);
}
window.addEventListener('popstate', () => {
  if (ignorePops > 0) { ignorePops--; return; }
  if (!el.bigTextModal.classList.contains('hidden')) closeBigText(true);
  else if (cm.open) closeCam(true);
  else if (lm.open) closeListen(true);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!el.bigTextModal.classList.contains('hidden')) closeBigText();
  else if (cm.open) closeCam();
  else if (lm.open) closeListen();
});

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


/* ---------- מצב האזנה לשיחה ---------- */
const LISTEN_DURATIONS = [60, 120, 180, 300, 600];
const lEl = {
  modal: $('listenModal'), open: $('listenOpenBtn'), close: $('listenCloseBtn'), lang: $('listenLang'),
  durations: $('listenDurations'), target: $('listenTargetInfo'), setup: $('listenSetup'),
  start: $('listenStartBtn'), timer: $('listenTimer'), status: $('listenStatus'),
  rows: $('listenRows'), empty: $('listenEmpty'), interim: $('listenInterim'),
  copy: $('listenCopyBtn'), share: $('listenShareBtn'), clear: $('listenClearBtn'),
  modes: $('listenModes'), keyHint: $('listenKeyHint'), keyBtn: $('listenKeyBtn'),
  setupToggle: $('listenSetupToggle'), meter: $('listenMeter'), meterBar: $('listenMeterBar'), retry: $('listenRetryBtn'), download: $('listenDownload')
};
const savedSec = Number(loadJSON('tvt_listen_sec', 180));
const lm = {
  open: false, running: false, stopping: false, handle: null, rows: [], session: 0,
  chain: Promise.resolve(), endAt: 0, tick: null, wake: null, lang: 'en', target: 'he',
  sec: savedSec >= 5 && savedSec <= 3600 ? savedSec : 180, historyTs: 0,
  mode: loadJSON('tvt_listen_mode', 'silent') === 'live' ? 'live' : 'silent', // silent = הקלטה שקטה ותרגום בסוף
  recorder: null, lastBlob: null, lastLang: 'auto', downloadUrl: null
};
const LISTEN_MODES = [
  { id: 'silent', label: '🔇 הקלטה שקטה', sub: 'בלי צלילים, תרגום בסוף' },
  { id: 'live', label: '⚡ תרגום חי', sub: 'משפט-משפט, עם צלילי טלפון' }
];
const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function renderListenSetup() {
  if (!lEl.lang.options.length) {
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = '🌐 זיהוי אוטומטי';
    lEl.lang.appendChild(auto);
    for (const [k, L] of Object.entries(LANGUAGES)) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `${L.nameHe} (${L.native})`;
      lEl.lang.appendChild(o);
    }
  }
  const autoOpt = lEl.lang.querySelector('option[value="auto"]');
  autoOpt.disabled = lm.mode === 'live';   // בתרגום חי צריך לבחור שפה
  if (lm.mode === 'live' && lEl.lang.value === 'auto') lEl.lang.value = el.langB.value;
  lEl.modes.textContent = '';
  LISTEN_MODES.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mode = m.id;
    b.disabled = lm.running;
    b.className = 'rounded-xl border px-2 py-2 text-sm flex flex-col items-center gap-0.5 transition ' + (m.id === lm.mode
      ? 'bg-amber-600 border-amber-500 text-white'
      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700');
    const t = document.createElement('span'); t.className = 'font-semibold'; t.textContent = m.label;
    const sub = document.createElement('span'); sub.className = 'text-[11px] opacity-80'; sub.textContent = m.sub;
    b.appendChild(t); b.appendChild(sub);
    b.addEventListener('click', () => {
      if (lm.running) return;
      lm.mode = m.id;
      saveJSON('tvt_listen_mode', m.id);
      if (m.id === 'silent' && !lm.rows.length) lEl.lang.value = 'auto';
      renderListenSetup();
      setListenUi();
      setRecordingTools();
    });
    lEl.modes.appendChild(b);
  });
  lEl.keyHint.classList.toggle('hidden', !(lm.mode === 'silent' && !getGroqKey()));
  lEl.durations.textContent = '';
  LISTEN_DURATIONS.forEach(sec => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.sec = String(sec);
    b.className = 'px-3 py-2 rounded-xl border text-sm transition ' + (sec === lm.sec
      ? 'bg-amber-600 border-amber-500 text-white font-semibold'
      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700');
    b.textContent = `${sec / 60} דק׳`;
    b.disabled = lm.running;
    b.addEventListener('click', () => {
      if (lm.running) return;
      lm.sec = Number(b.dataset.sec) || sec;
      saveJSON('tvt_listen_sec', lm.sec);
      renderListenSetup();
    });
    lEl.durations.appendChild(b);
  });
  if (!lm.running) lEl.timer.textContent = fmtTime(lm.sec);
  const t = LANGUAGES[el.langA.value];
  lEl.target.textContent = lEl.lang.value === el.langA.value
    ? `השפה זהה לשפה שלך (${t.nameHe}), ולכן יוצג רק הטקסט שזוהה.`
    : lm.mode === 'silent'
      ? `בסוף ההקלטה כל השיחה תתומלל ותתורגם ל${t.nameHe}.`
      : `כל משפט יתורגם ל${t.nameHe} (השפה של דובר א׳) ויופיע מיד.`;
}
function setLevel(v) { lEl.meterBar.style.width = `${Math.round(Math.max(0.03, v) * 100)}%`; }
function setRecordingTools() {
  const show = lm.mode === 'silent' && !!lm.lastBlob && !lm.running;
  lEl.download.classList.toggle('hidden', !show);
  if (show) {
    if (lm.downloadUrl) URL.revokeObjectURL(lm.downloadUrl);
    lm.downloadUrl = URL.createObjectURL(lm.lastBlob);
    lEl.download.href = lm.downloadUrl;
    const d = new Date();
    lEl.download.download = `recording-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.${extFor(lm.lastBlob.type)}`;
  }
}

function setListenUi() {
  const busy = lm.running;
  const idle = lm.mode === 'silent' ? '🔴 התחל הקלטה' : '🎧 התחל האזנה';
  lEl.start.textContent = lm.stopping ? 'מסיים...' : busy ? (lm.mode === 'silent' ? '⏹ עצור ותרגם' : '⏹ עצור האזנה') : idle;
  lEl.modes.querySelectorAll('button').forEach(b => { b.disabled = busy; });
  lEl.start.className = 'flex-1 py-3.5 rounded-xl font-semibold text-base text-white shadow-md transition ' +
    (busy ? 'bg-rose-600 hover:bg-rose-500' + (lm.stopping ? '' : ' mic-listening') : 'bg-amber-600 hover:bg-amber-500');
  lEl.lang.disabled = busy;
  lEl.durations.querySelectorAll('button').forEach(b => { b.disabled = busy; });
  // כשמקליטים או כשיש תוצאות, ההגדרות מתקפלות כדי לפנות מקום לתרגום
  const collapse = busy || (lm.rows.length > 0 && !lm.setupOpen);
  lEl.setup.classList.toggle('hidden', collapse);
  lEl.setupToggle.classList.toggle('hidden', busy || !collapse);
  lEl.clear.disabled = busy;
}

function renderListenRow(row) {
  const box = lEl.rows;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  if (!row.el) {
    row.el = document.createElement('div');
    row.el.className = 'rounded-xl bg-slate-950/70 border border-slate-800 p-2.5 flex flex-col gap-1';
    row.el.addEventListener('click', () => {
      if (row.status !== 'failed') return;
      row.status = 'pending';
      renderListenRow(row);
      lm.chain = lm.chain.then(() => translateListenRow(row));
    });
    lEl.empty.classList.add('hidden');
    box.appendChild(row.el);
  }
  row.el.textContent = '';
  const main = document.createElement('p');
  if (row.status === 'pending') { main.className = 'text-sm text-slate-500'; main.textContent = 'מתרגם...'; }
  else if (row.status === 'failed') { main.className = 'text-sm text-rose-300 cursor-pointer'; main.textContent = 'לא תורגם. לחצו כאן כדי לנסות שוב.'; }
  else {
    main.className = 'text-base font-medium text-white leading-relaxed';
    main.dir = LANGUAGES[row.target].dir;
    main.lang = LANGUAGES[row.target].speechCode;
    main.textContent = row.tr;
  }
  row.el.appendChild(main);
  if (row.status !== 'same' || row.t != null) {
    const src = document.createElement('p');
    src.className = 'text-xs text-slate-400 leading-relaxed';
    if (row.t != null) {
      const tm = document.createElement('span');
      tm.dir = 'ltr';
      tm.className = 'inline-block font-mono text-amber-300/80 me-2';
      tm.textContent = fmtTime(row.t);
      src.appendChild(tm);
    }
    src.dir = LANGUAGES[row.lang].dir;
    src.lang = LANGUAGES[row.lang].speechCode;
    if (row.status !== 'same') { const body = document.createElement('bdi'); body.textContent = row.src; src.appendChild(body); }
    row.el.appendChild(src);
  }
  if (nearBottom) box.scrollTop = box.scrollHeight;
}
function renderListenRows() {
  lEl.rows.textContent = '';
  lEl.rows.appendChild(lEl.empty);
  lEl.empty.classList.toggle('hidden', lm.rows.length > 0);
  lm.rows.forEach(r => { r.el = null; renderListenRow(r); });
}

async function translateListenRow(row) {
  if (row.session !== lm.session) return;
  if (row.lang === row.target) { row.tr = row.src; row.status = 'same'; renderListenRow(row); return; }
  try {
    const r = await translate(row.src, row.lang, row.target);
    row.tr = r.text;
    row.status = 'ok';
  } catch (e) {
    row.status = 'failed';
  }
  if (row.session !== lm.session) return;
  renderListenRow(row);
  if (lm.historyTs) saveListenToHistory(); // תרגום שהושלם אחרי הסיום מתעדכן גם בהיסטוריה
}

// כל ההקלטה בכמה בקשות גדולות ל-Groq (המודל רואה את כל השיחה). מה שלא הצליח מתורגם אחר כך קטע-קטע.
async function translateListenBatches(rows, session) {
  if (!rows.length || rows[0].lang === rows[0].target) return;
  const batches = [];
  let cur = [], size = 0;
  rows.forEach(r => {
    if (cur.length && (size + r.src.length > 2000 || cur.length >= 30)) { batches.push(cur); cur = []; size = 0; }
    cur.push(r); size += r.src.length;
  });
  if (cur.length) batches.push(cur);
  for (const batch of batches) {
    if (session !== lm.session) return;
    const outs = await translateBatch(batch.map(r => r.src), batch[0].lang, batch[0].target);
    if (!outs) return; // Groq לא זמין: ממשיכים בדרך הרגילה
    if (session !== lm.session) return;
    batch.forEach((r, i) => { r.tr = outs[i]; r.status = 'ok'; renderListenRow(r); });
  }
}

function addListenRow(text) {
  const row = { src: text, tr: '', status: 'pending', lang: lm.lang, target: lm.target, session: lm.session, el: null };
  lm.rows.push(row);
  renderListenRow(row);
  lm.chain = lm.chain.then(() => translateListenRow(row)); // לפי הסדר, אחד אחרי השני
}

function listenDone(r) { return r.status === 'ok' || r.status === 'same'; }
function saveListenToHistory() {
  if (!lm.rows.some(listenDone)) return;
  const entry = {
    speaker: 'B', sourceLang: lm.rows[0].lang, targetLang: lm.rows[0].target,
    originalText: lm.rows.map(r => r.src).join('\n'),
    translatedText: lm.rows.map(r => (listenDone(r) ? r.tr : '…')).join('\n'),
    ts: lm.historyTs || Date.now(), source: 'listen'
  };
  if (lm.historyTs) state.history = state.history.filter(h => !(h.source === 'listen' && h.ts === lm.historyTs));
  lm.historyTs = entry.ts;
  state.history.unshift(entry);
  if (state.history.length > HISTORY_MAX) state.history.length = HISTORY_MAX;
  saveHistory();
  renderHistory();
}

function tickListen() {
  const left = Math.max(0, Math.ceil((lm.endAt - Date.now()) / 1000));
  lEl.timer.textContent = fmtTime(left);
  if (left <= 0 && lm.running && !lm.stopping) stopListening();
}

function startListening() {
  if (lm.mode === 'silent') { startSilent(); return; }
  if (!speechSupport.stt) { showBanner(MIC_ERRORS.unsupported, 'warn'); return; }
  unlockAudio();
  stopRecognition();
  stopSpeaking();
  lm.lang = lEl.lang.value;
  lm.target = el.langA.value;
  lm.session++;
  lm.rows = [];
  lm.setupOpen = false;
  lm.historyTs = 0;
  lm.chain = Promise.resolve();
  renderListenRows();
  lm.running = true;
  lm.stopping = false;
  lm.endAt = Date.now() + lm.sec * 1000;
  setListenUi();
  lEl.status.textContent = 'מתחיל...';
  lEl.interim.textContent = '';
  lEl.interim.dir = LANGUAGES[lm.lang].dir;
  keepScreenOn();
  lm.wake = setInterval(keepScreenOn, 60000);
  lm.tick = setInterval(tickListen, 250);
  tickListen();
  const session = lm.session;
  lm.handle = listenLoop(lm.lang, {
    onFinal: text => { if (session === lm.session && lm.running) addListenRow(text); },
    onInterim: t => { if (session === lm.session) lEl.interim.textContent = t; },
    onError: (code, fatal) => {
      if (session !== lm.session) return;
      const msg = code === 'network' ? 'אין חיבור לזיהוי הדיבור. מנסה שוב...' : (MIC_ERRORS[code] || `שגיאת זיהוי דיבור: ${code}`);
      lEl.status.textContent = msg;
      if (fatal) { showBanner(msg, 'error'); stopListening(); }
    },
    onState: st => {
      if (session !== lm.session) return;
      if (st === 'listening' && lm.running && !lm.stopping) lEl.status.textContent = `מאזין ל${LANGUAGES[lm.lang].nameHe}... הניחו את הטלפון קרוב לדוברים.`;
      if (st === 'stopped') finishListening(session);
    }
  });
  if (!lm.handle) finishListening(session);
}


/* ---------- הקלטה שקטה: מקליטים בלי צלילים, ובסוף מתמללים (Groq) ומתרגמים ---------- */
async function startSilent() {
  if (!getGroqKey()) {
    lEl.status.textContent = 'להקלטה שקטה צריך קודם מפתח Groq בהגדרות (פעם אחת).';
    lEl.keyHint.classList.remove('hidden');
    return;
  }
  if (!recorderSupported()) { showBanner('הדפדפן הזה לא תומך בהקלטה. אפשר להשתמש ב"תרגום חי".', 'error'); return; }
  unlockAudio();
  stopRecognition();
  stopSpeaking();
  lm.lang = lEl.lang.value;
  lm.target = el.langA.value;
  lm.session++;
  lm.rows = [];
  lm.setupOpen = false;
  lm.historyTs = 0;
  lm.lastBlob = null;
  lEl.retry.classList.add('hidden');
  setRecordingTools();
  renderListenRows();
  lm.running = true;
  lm.stopping = false;
  setListenUi();
  lEl.status.textContent = 'מבקש גישה למיקרופון...';
  const session = lm.session;
  let recorder;
  try {
    recorder = await startRecording({ onLevel: v => { if (session === lm.session) setLevel(v); } });
  } catch (e) {
    if (session !== lm.session) return;
    lm.running = false;
    setListenUi();
    const msg = e.code === 'not-allowed' ? MIC_ERRORS['not-allowed'] : e.code === 'unsupported' ? 'הדפדפן הזה לא תומך בהקלטה.' : 'לא ניתן להפעיל את המיקרופון כרגע.';
    lEl.status.textContent = msg;
    showBanner(msg, 'error');
    return;
  }
  if (session !== lm.session || !lm.running || lm.stopping) { recorder.cancel(); return; }
  lm.recorder = recorder;
  lm.recStart = Date.now();
  lm.endAt = Date.now() + lm.sec * 1000;
  keepScreenOn();
  lm.wake = setInterval(keepScreenOn, 60000);
  lm.tick = setInterval(tickListen, 250);
  tickListen();
  setLevel(0);
  lEl.meter.classList.remove('hidden');
  lEl.status.textContent = '🔴 מקליט בשקט... הניחו את הטלפון קרוב לדוברים. התרגום יופיע בסוף.';
}

async function stopSilent() {
  if (!lm.running || lm.stopping) return;
  const session = lm.session;
  lm.stopping = true;
  clearInterval(lm.tick);
  clearInterval(lm.wake);
  setListenUi();
  lEl.status.textContent = 'מסיים הקלטה...';
  const recorder = lm.recorder;
  lm.recorder = null;
  const blob = recorder ? await recorder.stop() : null;
  if (session !== lm.session) return;
  lm.running = false;
  lm.stopping = false;
  lEl.meter.classList.add('hidden');
  lEl.timer.textContent = fmtTime(lm.sec);
  setListenUi();
  if (!blob || blob.size < 1000) { lEl.status.textContent = 'ההקלטה ריקה. לא נקלט קול.'; return; }
  lm.lastBlob = blob;
  lm.lastLang = lm.lang;
  lm.lastDuration = Math.round((Date.now() - (lm.recStart || Date.now())) / 1000);
  setRecordingTools();
  await transcribeLast(session);
}

async function runPool(items, limit, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function transcribeLast(session) {
  if (!lm.lastBlob) return;
  lEl.retry.classList.add('hidden');
  lEl.status.textContent = `שולח לתמלול (${(lm.lastBlob.size / 1048576).toFixed(1)} MB)...`;
  keepScreenOn();
  try {
    const r = await transcribe(lm.lastBlob, { langKey: lm.lastLang, filename: `recording.${extFor(lm.lastBlob.type)}` });
    if (session !== lm.session) return;
    const groups = groupSegments(r.segments);
    if (!groups.length) { lEl.status.textContent = 'לא זוהה דיבור בהקלטה.'; return; }
    const known = !!r.langKey;
    lm.rows = groups.map(g => ({
      src: g.text, tr: known ? '' : g.text, status: known ? 'pending' : 'same', t: g.start,
      lang: known ? r.langKey : 'en', target: lm.target, session, el: null
    }));
    renderListenRows();
    setListenUi();
    const langName = known ? LANGUAGES[r.langKey].nameHe : (r.detectedName || 'לא מוכרת');
    if (known) {
      lEl.status.textContent = `מתרגם ${groups.length} קטעים מ${langName}...`;
      await translateListenBatches(lm.rows, session);
      if (session !== lm.session) return;
      await runPool(lm.rows.filter(x => x.status === 'pending'), 3, row => translateListenRow(row));
      if (session !== lm.session) return;
    }
    saveListenToHistory();
    const failed = lm.rows.filter(x => x.status === 'failed').length;
    lEl.status.textContent = known
      ? `✓ הסתיים · הקלטה ${fmtTime(lm.lastDuration || 0)} · ${groups.length} קטעים · שפה: ${langName} · נשמר בהיסטוריה.` + (failed ? ` ${failed} קטעים לא תורגמו (לחצו עליהם לנסות שוב).` : '')
      : `✓ תומלל · השפה שזוהתה (${langName}) לא נתמכת לתרגום, ולכן מוצג המקור.`;
  } catch (e) {
    if (session !== lm.session) return;
    lEl.status.textContent = e.message || 'התמלול נכשל.';
    lEl.retry.classList.remove('hidden');
    if (e.code === 'auth' || e.code === 'no-key') lEl.keyHint.classList.remove('hidden');
  }
}

function stopListening() {
  if (!lm.running || lm.stopping) return;
  if (lm.mode === 'silent' || lm.recorder) { stopSilent(); return; }
  lm.stopping = true;
  clearInterval(lm.tick);
  setListenUi();
  lEl.status.textContent = 'מסיים...';
  if (lm.handle) lm.handle.stop(); else finishListening(lm.session);
}

async function finishListening(session) {
  if (session !== lm.session || !lm.running) return;
  lm.running = false;
  lm.stopping = false;
  lm.handle = null;
  clearInterval(lm.tick);
  clearInterval(lm.wake);
  lEl.interim.textContent = '';
  setListenUi();
  lEl.timer.textContent = fmtTime(lm.sec);
  if (lm.rows.length) lEl.status.textContent = 'מסיים לתרגם...';
  await lm.chain;
  if (session !== lm.session) return;
  if (!lm.rows.length) { lEl.status.textContent = 'ההאזנה הסתיימה. לא זוהה דיבור.'; return; }
  saveListenToHistory();
  lEl.status.textContent = `ההאזנה הסתיימה · ${lm.rows.length} משפטים · נשמר בהיסטוריה.`;
}

function openListen() {
  stopRecognition();
  stopSpeaking();
  renderListenSetup(); // יוצר את רשימת השפות בפעם הראשונה
  // בהקלטה שקטה ברירת המחדל היא זיהוי אוטומטי, ובתרגום חי השפה של דובר ב׳
  if (!lm.running && !lm.rows.length) lEl.lang.value = lm.mode === 'silent' ? 'auto' : el.langB.value;
  if (!lEl.lang.value) lEl.lang.value = el.langB.value;
  renderListenSetup();
  setRecordingTools();
  setListenUi();
  lm.open = true;
  lEl.modal.classList.remove('hidden');
  pushOverlay('listen');
  placeBanner();
}
function closeListen(fromPopState) {
  if (!lm.open) return;
  if (lm.running) stopListening();
  lm.open = false;
  lEl.modal.classList.add('hidden');
  placeBanner();
  popOverlay('listen', fromPopState);
}

function listenTranslationText(withOriginal) {
  return lm.rows.filter(listenDone).map(r => (withOriginal && r.status !== 'same' ? `${r.tr}\n(${r.src})` : r.tr)).join('\n');
}

lEl.open.addEventListener('click', openListen);
lEl.setupToggle.addEventListener('click', () => { lm.setupOpen = true; setListenUi(); });
lEl.retry.addEventListener('click', () => { if (!lm.running) transcribeLast(lm.session); });
lEl.keyBtn.addEventListener('click', () => { refreshSettingsInfo(); el.settings.showModal(); placeBanner(); try { $('optGroqKey').focus(); } catch { /* ignore */ } });
lEl.close.addEventListener('click', () => closeListen());
lEl.start.addEventListener('click', () => { if (lm.running) stopListening(); else startListening(); });
lEl.lang.addEventListener('change', renderListenSetup);
lEl.copy.addEventListener('click', () => {
  const text = listenTranslationText(false);
  if (!text) { showBanner('אין עדיין תרגום להעתקה.', 'info'); return; }
  copyOutput(null, lEl.copy, text);
});
if (navigator.share) {
  lEl.share.classList.remove('hidden');
  lEl.share.addEventListener('click', () => {
    const text = listenTranslationText(true);
    if (!text) { showBanner('אין עדיין תרגום לשיתוף.', 'info'); return; }
    navigator.share({ text }).catch(() => { /* בוטל */ });
  });
}
lEl.clear.addEventListener('click', () => {
  if (lm.running || (!lm.rows.length && !lm.lastBlob)) return;
  if (!window.confirm('לנקות את התמלול מהמסך? (מה שנשמר בהיסטוריה נשאר)')) return;
  lm.session++;
  lm.rows = [];
  lm.historyTs = 0;
  lm.lastBlob = null;
  setRecordingTools();
  lEl.retry.classList.add('hidden');
  renderListenRows();
  lEl.status.textContent = '';
});


/* ---------- צילום ותרגום (שלטים, תפריטים, הודעות) + מחירים בשקלים ---------- */
const cEl = {
  section: $('cameraSection'), shoot: $('camShootBtn'), gallery: $('camGalleryBtn'), input: $('camInput'), galleryInput: $('galleryInput'),
  modal: $('camModal'), close: $('camCloseBtn'), keyHint: $('camKeyHint'), keyBtn: $('camKeyBtn'), preview: $('camPreview'),
  status: $('camStatus'), result: $('camResult'), targetTag: $('camTargetTag'), translation: $('camTranslation'), note: $('camNote'),
  big: $('camBigBtn'), speak: $('camSpeakBtn'), copy: $('camCopyBtn'), prices: $('camPrices'), priceList: $('camPriceList'),
  ratesInfo: $('camRatesInfo'), langName: $('camLangName'), original: $('camOriginal'), altBtn: $('camAltBtn'), alt: $('camAlt'),
  retake: $('camRetakeBtn'), pick: $('camPickBtn'), retry: $('camRetryBtn'), share: $('camShareBtn')
};
const cm = { open: false, session: 0, image: null, previewUrl: null, res: null, target: 'he' };

function openCam() {
  if (cm.open) return;
  stopRecognition();
  stopSpeaking();
  cm.open = true;
  cEl.modal.classList.remove('hidden');
  pushOverlay('cam');
  placeBanner();
}
function closeCam(fromPopState) {
  if (!cm.open) return;
  cm.open = false;
  cm.session++; // תשובה שתגיע אחרי הסגירה לא תוצג
  cEl.modal.classList.add('hidden');
  placeBanner();
  popOverlay('cam', fromPopState);
}
function camReset() {
  cEl.result.classList.add('hidden');
  cEl.retry.classList.add('hidden');
  cEl.share.classList.add('hidden');
  cEl.keyHint.classList.add('hidden');
  cEl.note.classList.add('hidden');
  cEl.prices.classList.add('hidden');
  cEl.alt.classList.add('hidden');
  cEl.alt.textContent = '';
  cm.res = null;
}

async function handleImageFile(file) {
  if (!file) return;
  openCam();
  camReset();
  const session = ++cm.session;
  if (cm.previewUrl) URL.revokeObjectURL(cm.previewUrl);
  cm.previewUrl = URL.createObjectURL(file);
  cEl.preview.src = cm.previewUrl;
  cEl.preview.classList.remove('hidden');
  cm.image = null;
  cm.target = el.langA.value;
  if (!getGroqKey()) {
    cEl.status.textContent = 'לקריאת התמונה צריך קודם מפתח Groq בהגדרות.';
    cEl.keyHint.classList.remove('hidden');
    cm.pendingFile = file;
    return;
  }
  cEl.status.textContent = 'מכין את התמונה...';
  try {
    cm.image = await prepareImage(file);
  } catch (e) {
    if (session !== cm.session) return;
    cEl.status.textContent = e.message || 'לא ניתן לקרוא את התמונה.';
    return;
  }
  await readCurrentImage(session);
}

async function readCurrentImage(session) {
  if (!cm.image) return;
  cEl.retry.classList.add('hidden');
  cEl.status.textContent = `קורא ומתרגם ל${LANGUAGES[cm.target].nameHe}...`;
  keepScreenOn();
  let r;
  try {
    r = await readAndTranslate(cm.image.dataUrl, cm.target);
  } catch (e) {
    if (session !== cm.session) return;
    cEl.status.textContent = e.message || 'הקריאה נכשלה.';
    if (e.code === 'auth' || e.code === 'no-key') cEl.keyHint.classList.remove('hidden');
    else cEl.retry.classList.remove('hidden');
    return;
  }
  if (session !== cm.session) return;
  cm.res = r;
  if (!r.translation && !r.original) {
    cEl.status.textContent = r.note || 'לא נמצא טקסט בתמונה. נסה לצלם מקרוב יותר, ישר ובאור טוב.';
    return;
  }
  const srcLang = isLang(r.language) ? r.language : 'auto';
  const translation = r.translation || r.original;
  cEl.status.textContent = '';
  cEl.result.classList.remove('hidden');
  cEl.targetTag.textContent = `תרגום ל${LANGUAGES[cm.target].nameHe}:`;
  cEl.translation.textContent = translation;
  cEl.translation.dir = LANGUAGES[cm.target].dir;
  cEl.translation.lang = LANGUAGES[cm.target].speechCode;
  cEl.note.classList.toggle('hidden', !r.note);
  cEl.note.textContent = r.note;
  cEl.langName.textContent = isLang(srcLang) ? `(${LANGUAGES[srcLang].nameHe})` : '';
  cEl.original.textContent = r.original || '';
  cEl.original.dir = isLang(srcLang) ? LANGUAGES[srcLang].dir : 'auto';
  if (navigator.share) cEl.share.classList.remove('hidden');
  addHistoryEntry('A', srcLang, cm.target, r.original || translation, translation, 'camera');
  if (el.autoSpeakToggle.checked && srcLang !== cm.target) {
    // לא מקריאים אוטומטית טקסט ארוך מצילום; רק משפט קצר
    if (translation.length <= 120) speakText(translation, cm.target, { auto: true });
  }
  renderPrices(r.prices, srcLang, session);
}

async function renderPrices(prices, srcLang, session) {
  cEl.priceList.textContent = '';
  const items = (prices || []).map(p => ({ ...p, code: normalizeCurrency(p.currency, srcLang) })).filter(p => p.code && p.code !== 'ILS');
  if (!items.length) { cEl.prices.classList.add('hidden'); return; }
  cEl.prices.classList.remove('hidden');
  cEl.ratesInfo.textContent = 'טוען שערים...';
  const rates = await getRates();
  if (session !== cm.session) return;
  if (!rates) { cEl.ratesInfo.textContent = 'אין כרגע שערי מטבע (צריך אינטרנט פעם אחת).'; return; }
  for (const p of items.slice(0, 12)) {
    const ils = toILS(p.amount, p.code, rates.rates);
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between gap-3';
    const a = document.createElement('bdi');
    a.className = 'text-slate-300';
    a.textContent = p.text || `${p.amount} ${p.code}`;
    const b = document.createElement('span');
    b.className = 'font-semibold text-emerald-300 whitespace-nowrap';
    b.dir = 'ltr';
    b.textContent = ils == null ? `(${p.code}: אין שער)` : `≈ ₪${formatILS(ils)}`;
    li.appendChild(a);
    li.appendChild(b);
    cEl.priceList.appendChild(li);
  }
  const age = Date.now() - rates.ts;
  const when = new Date(rates.ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  cEl.ratesInfo.textContent = '';
  const t = document.createElement('span');
  t.textContent = `שער יומי, עודכן ${when}${age > 24 * 3600 * 1000 ? ' (ישן, אין חיבור)' : ''} · שערים: `;
  const link = document.createElement('a');
  link.href = RATES_CREDIT.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'underline';
  link.dir = 'ltr';
  link.textContent = RATES_CREDIT.label;
  cEl.ratesInfo.appendChild(t);
  cEl.ratesInfo.appendChild(link);
}

function updateCamKeyHint() { if (getGroqKey()) cEl.keyHint.classList.add('hidden'); }

cEl.shoot.addEventListener('click', () => { unlockAudio(); cEl.input.value = ''; cEl.input.click(); });
cEl.gallery.addEventListener('click', () => { unlockAudio(); cEl.galleryInput.value = ''; cEl.galleryInput.click(); });
cEl.retake.addEventListener('click', () => { cEl.input.value = ''; cEl.input.click(); });
cEl.pick.addEventListener('click', () => { cEl.galleryInput.value = ''; cEl.galleryInput.click(); });
cEl.input.addEventListener('change', () => handleImageFile(cEl.input.files && cEl.input.files[0]));
cEl.galleryInput.addEventListener('change', () => handleImageFile(cEl.galleryInput.files && cEl.galleryInput.files[0]));
cEl.close.addEventListener('click', () => closeCam());
cEl.retry.addEventListener('click', () => {
  if (cm.image) readCurrentImage(cm.session);
  else if (cm.pendingFile) handleImageFile(cm.pendingFile);
});
cEl.keyBtn.addEventListener('click', () => { refreshSettingsInfo(); el.settings.showModal(); placeBanner(); try { $('optGroqKey').focus(); } catch { /* ignore */ } });
el.settings.addEventListener('close', () => {
  // אחרי שהוגדר מפתח, ממשיכים עם התמונה שחיכתה
  updateCamKeyHint();
  if (cm.open && cm.pendingFile && getGroqKey()) { const f = cm.pendingFile; cm.pendingFile = null; handleImageFile(f); }
});
cEl.big.addEventListener('click', () => {
  if (!cm.res) return;
  showBigText({ text: cEl.translation.textContent, langKey: cm.target, src: '', srcLang: '', flip: false });
});
cEl.speak.addEventListener('click', () => { unlockAudio(); if (cEl.translation.textContent) speakText(cEl.translation.textContent, cm.target); });
cEl.copy.addEventListener('click', () => { if (cEl.translation.textContent) copyOutput(null, cEl.copy, cEl.translation.textContent); });
cEl.share.addEventListener('click', () => {
  if (!cm.res) return;
  const text = cEl.translation.textContent + (cm.res.original && cm.res.original !== cEl.translation.textContent ? `\n\n(${cm.res.original})` : '');
  navigator.share({ text }).catch(() => { /* בוטל */ });
});
cEl.altBtn.addEventListener('click', async () => {
  if (!cm.res || !cm.res.original) return;
  const session = cm.session;
  cEl.alt.classList.remove('hidden');
  cEl.alt.dir = 'rtl';
  cEl.alt.textContent = 'מתרגם בדרך נוספת...';
  try {
    const from = isLang(cm.res.language) ? cm.res.language : 'auto';
    const r = await translate(cm.res.original, from, cm.target);
    if (session !== cm.session) return;
    cEl.alt.dir = LANGUAGES[cm.target].dir;
    cEl.alt.textContent = '🔁 ' + r.text;
  } catch (e) {
    if (session !== cm.session) return;
    cEl.alt.textContent = 'התרגום החלופי לא זמין כרגע: ' + (e.message || '');
  }
});

/* ---------- "שתף אל המתורגמן" ---------- */
const HEBREW_CHARS = /[֐-׿]/g;
async function handleSharedText(text) {
  const t = String(text || '').trim().slice(0, 4000);
  if (!t) return;
  const heb = (t.match(HEBREW_CHARS) || []).length;
  const letters = (t.match(/\p{L}/gu) || []).length || 1;
  if (heb / letters > 0.5 && el.langA.value === 'he') {
    // הודעה בעברית: מתרגמים לשפה של דובר ב׳ (למשל כדי לשלוח אותה)
    setActiveTurn('A');
    el.inputA.value = t;
    showBanner('תורגמה הודעה ששותפה אל המתורגמן.', 'info');
    await handleTranslate('A', t);
    return;
  }
  // הודעה בשפה זרה: מזהים את השפה לבד ומתרגמים לעברית (התיבה של דובר ב׳)
  setActiveTurn('B');
  el.inputB.value = t;
  showBanner('תורגמה הודעה ששותפה אל המתורגמן.', 'info');
  await runTranslation('B', t, 'auto', el.langA.value);
}

async function checkSharedInbox() {
  const params = new URLSearchParams(location.search);
  if (!params.has('shared') || !('caches' in window)) return;
  try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
  try {
    const inbox = await caches.open('share-inbox');
    const metaRes = await inbox.match('./__shared-meta');
    const meta = metaRes ? await metaRes.json() : null;
    const imgRes = meta && meta.hasImage ? await inbox.match('./__shared-image') : null;
    const blob = imgRes ? await imgRes.blob() : null;
    await inbox.delete('./__shared-meta');
    await inbox.delete('./__shared-image');
    if (blob && blob.size) {
      await handleImageFile(new File([blob], 'shared-image', { type: blob.type || 'image/jpeg' }));
    } else if (meta && meta.text) {
      await handleSharedText(meta.text);
    } else {
      showBanner('לא התקבל טקסט או תמונה מהשיתוף.', 'warn');
    }
  } catch { showBanner('לא הצלחתי לקרוא את מה ששותף.', 'warn'); }
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

const sEl = { url: $('optServerUrl'), code: $('optServerCode'), save: $('saveServerBtn'), status: $('serverStatus') };
function setServerStatus(cls, msg) { sEl.status.className = `text-xs min-h-[1rem] ${cls}`; sEl.status.textContent = msg; }
function showServerState() {
  const srv = getServer();
  sEl.url.value = srv ? srv.url : '';
  sEl.code.value = srv ? srv.code : '';
  if (!srv) { setServerStatus('text-slate-400', 'לא מחובר. התרגום עובר דרך השירותים הרגילים.'); return; }
  const host = (() => { try { return new URL(srv.url).host; } catch { return srv.url; } })();
  if (lastServerError) setServerStatus('text-amber-300', `מחובר ל-${host}, אבל בתרגום האחרון: ${lastServerError}`);
  else setServerStatus('text-emerald-400', `מחובר ✓ ${host}`);
}
async function saveServer() {
  const url = normalizeServerUrl(sEl.url.value);
  const code = sEl.code.value.trim();
  if (!url) { setServer(''); showServerState(); return; }
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(url)) { setServerStatus('text-amber-300', 'הכתובת צריכה להתחיל ב-https:// (למשל https://xxxx.workers.dev).'); return; }
  if (code.length < 8) { setServerStatus('text-amber-300', 'קוד הגישה צריך להיות לפחות 8 תווים, בדיוק כמו בשרת.'); return; }
  setServerStatus('text-slate-400', 'בודק חיבור לשרת...');
  try {
    const h = await testServer({ url, code });
    setServer(url, code);
    sEl.url.value = url;
    setServerStatus(h.translator ? 'text-emerald-400' : 'text-amber-300',
      h.translator ? '✓ מחובר. התרגום עובר עכשיו דרך השרת שלך (Microsoft).' : 'השרת עונה, אבל לא הוגדר בו מפתח Azure (AZURE_KEY).');
  } catch (e) {
    setServerStatus(e.code === 'bad-code' ? 'text-rose-300' : 'text-amber-300', `${e.message} (לא נשמר)`);
  }
}
sEl.save.addEventListener('click', saveServer);

/* ---------- בדיקת מוכנות לטיול ---------- */
const rEl = { btn: $('readyBtn'), box: $('readyResult'), list: $('readyList'), summary: $('readySummary') };
const READY_ICON = { ok: ['✓', 'text-emerald-400'], warn: ['⚠', 'text-amber-300'], bad: ['✗', 'text-rose-400'], info: ['ℹ', 'text-slate-400'] };
function readyRow(title) {
  const row = document.createElement('div');
  row.className = 'flex items-start gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5';
  const ic = document.createElement('span'); ic.className = 'shrink-0 w-4 text-center'; ic.textContent = '⏳';
  const body = document.createElement('div'); body.className = 'flex flex-col min-w-0';
  const t = document.createElement('span'); t.className = 'text-slate-200 font-semibold'; t.textContent = title;
  const h = document.createElement('span'); h.className = 'text-slate-400 leading-relaxed break-words';
  body.append(t, h); row.append(ic, body); rEl.list.appendChild(row);
  return (level, hint) => {
    const [sym, cls] = READY_ICON[level] || READY_ICON.info;
    ic.textContent = sym; ic.className = `shrink-0 w-4 text-center font-bold ${cls}`;
    row.dataset.level = level;
    h.textContent = '';
    if (hint && typeof hint === 'object') { // משפט ותרגום: כל אחד בכיוון שלו, כדי שעברית ואנגלית לא יתערבבו
      const bd = t => { const x = document.createElement('bdi'); x.dir = 'auto'; x.textContent = `"${t}"`; return x; };
      h.append(bd(hint.src), ' ← ', bd(hint.out));
    } else h.textContent = hint || '';
  };
}
const pause = ms => new Promise(r => setTimeout(r, ms));
async function runReadiness() {
  rEl.btn.disabled = true;
  rEl.box.classList.remove('hidden');
  rEl.list.textContent = '';
  rEl.summary.className = 'font-semibold text-sm text-slate-300';
  rEl.summary.textContent = 'בודק...';
  const a = el.langA.value, bl = el.langB.value;
  const nA = LANGUAGES[a].nameHe, nB = LANGUAGES[bl].nameHe;
  const online = navigator.onLine !== false;
  const key = getGroqKey();
  const tasks = [];
  const add = (title, fn) => {
    const set = readyRow(title);
    tasks.push(Promise.resolve().then(fn).then(([lv, hint]) => set(lv, hint), e => set('warn', (e && e.message) || 'לא ניתן לבדוק כרגע.')));
  };
  const needNet = ['info', 'ייבדק כשיהיה אינטרנט.'];
  const keyCheck = online && key ? testGroqKey(key) : null;
  if (keyCheck) keyCheck.catch(() => {});
  const modelIds = keyCheck ? keyCheck.then(() => availableModels(key, true)).catch(() => null) : Promise.resolve(null);

  add('חיבור לאינטרנט', () => (online ? ['ok', 'יש חיבור.'] : ['bad', 'אין אינטרנט. השיחון והמועדפים עובדים גם בלי רשת.']));
  add('פתיחה בלי אינטרנט', async () => {
    let cached = false;
    try {
      if (window.caches) for (const k of await caches.keys()) if (/^tvt-/.test(k) && await (await caches.open(k)).match('./index.html')) { cached = true; break; }
    } catch { /* ignore */ }
    const ctl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    return ctl && cached ? ['ok', 'האפליקציה שמורה בטלפון ונפתחת גם בלי רשת.'] : ['warn', 'עוד לא נשמרה בטלפון. פתחו אותה פעם אחת עם אינטרנט, סגרו ופתחו שוב.'];
  });
  add('מותקנת כאפליקציה', () => ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone
    ? ['ok', 'מותקנת במסך הבית.'] : ['info', 'לא חובה. התקנה למסך הבית נותנת פתיחה מהירה ואת "שתף אל המתורגמן".']));
  add('מיקרופון', async () => {
    try {
      const p = await navigator.permissions.query({ name: 'microphone' });
      if (p.state === 'granted') return ['ok', 'מאושר.'];
      if (p.state === 'denied') return ['bad', 'חסום. בדפדפן: הגדרות האתר ← מיקרופון ← לאפשר.'];
      return ['warn', 'הדפדפן יבקש אישור בפעם הראשונה. כדאי ללחוץ עכשיו על מיקרופון פעם אחת ולאשר.'];
    } catch { return ['info', 'הדפדפן לא מאפשר לבדוק. לחצו על מיקרופון פעם אחת כדי לוודא.']; }
  });
  add(`קולות הקראה (${nA} ו${nB})`, async () => {
    if (!speechSupport.tts) return ['bad', 'הדפדפן לא תומך בהקראה.'];
    if (!voicesLoaded()) await pause(800);
    const miss = [...new Set([a, bl])].filter(k => !hasVoice(k)).map(k => LANGUAGES[k].nameHe);
    return miss.length ? ['warn', `חסר קול ב${miss.join(' וב')}. איך מתקינים: "קולות הקראה במכשיר" למטה.`] : ['ok', 'יש קול לשתי השפות.'];
  });
  add(`שיחון בלי רשת (${nB})`, () => {
    const n = PHRASES.filter(p => p[a] && p[bl]).length;
    return n ? ['ok', `${n} משפטים מוכנים שעובדים בלי אינטרנט.`] : ['warn', `אין שיחון מוכן ל${nB}. התרגום יעבוד רק עם אינטרנט.`];
  });
  add('מפתח Groq', async () => {
    if (!key) return ['warn', 'אין מפתח. בלעדיו אין הקלטה שקטה, צילום ותרגום ב-Groq. התרגום הרגיל עובד.'];
    if (!online) return needNet;
    try { await keyCheck; return ['ok', 'המפתח עובד.']; } catch (e) { return ['bad', e.message || 'המפתח לא תקין.']; }
  });
  add('הקלטה שקטה (Whisper)', async () => {
    if (!key) return ['info', 'צריך מפתח Groq.'];
    if (!online) return needNet;
    const ids = await modelIds;
    if (!ids) return ['warn', 'לא ניתן לבדוק (המפתח או החיבור).'];
    return ids.some(id => /^whisper-large-v3/.test(id)) ? ['ok', 'זמין.'] : ['warn', 'Groq לא מציע כרגע מודל Whisper.'];
  });
  add('צילום ותרגום', async () => {
    if (!key) return ['info', 'צריך מפתח Groq.'];
    if (!online) return needNet;
    const ids = await modelIds;
    if (!ids) return ['warn', 'לא ניתן לבדוק (המפתח או החיבור).'];
    const m = VISION_CANDIDATES.find(x => ids.includes(x));
    return m ? ['ok', 'מודל קריאת תמונות זמין.'] : ['warn', 'אין כרגע מודל מוכר לקריאת תמונות. האפליקציה תנסה לבחור אחר.'];
  });
  const sample = a === 'he' ? 'סליחה, איפה התחנה הקרובה?' : (LANGUAGES[a].sample || 'Hello').slice(0, 80);
  const probe = async (service, labelFail) => {
    if (!online) return needNet;
    if (a === bl) return ['info', 'בחרו שפה שונה לדובר ב׳ כדי לבדוק.'];
    try { const out = await probeTranslator(service, sample, a, bl); return ['ok', { src: sample, out }]; }
    catch (e) {
      if (e && (e.status === 401 || e.status === 403)) return ['bad', 'המפתח לא תקין.'];
      if (e && e.status === 429) return ['warn', 'הגעת למגבלה של היום. מחר זה יתאפס, ובינתיים יש שירותים אחרים.'];
      return ['warn', labelFail];
    }
  };
  add(`תרגום Groq (${nA} ← ${nB})`, async () => {
    if (!key) return ['info', 'צריך מפתח Groq.'];
    if (!groqTranslateOn()) return ['info', 'כבוי בהגדרות (למטה, ליד מפתח Groq).'];
    return probe('groq', 'לא זמין כרגע. התרגום יעבור לשירותים הרגילים.');
  });
  add('תרגום רגיל (MyMemory)', () => probe('mymemory', 'לא זמין כרגע (אולי נגמרה המכסה היומית). יש שירותים אחרים.'));
  add('גיבוי (Google)', () => probe('google', 'לא זמין כרגע. זה רק גיבוי.'));

  await Promise.allSettled(tasks);
  const levels = [...rEl.list.children].map(r => r.dataset.level);
  const bad = levels.filter(l => l === 'bad').length, warn = levels.filter(l => l === 'warn').length;
  rEl.summary.className = `font-semibold text-sm ${bad ? 'text-rose-400' : 'text-emerald-400'}`;
  rEl.summary.textContent = bad ? `✗ יש ${bad === 1 ? 'דבר אחד' : bad + ' דברים'} לתקן לפני הטיול${warn ? `, ועוד ${warn} הערות` : ''}.`
    : warn ? `✓ מוכן לטיול, עם ${warn === 1 ? 'הערה אחת' : warn + ' הערות'}.` : '✓ הכל מוכן לטיול!';
  rEl.btn.disabled = false;
}
rEl.btn.addEventListener('click', runReadiness);

const gEl = { input: $('optGroqKey'), save: $('saveGroqBtn'), status: $('groqStatus') };
const groqTrBox = $('optGroqTranslate');
groqTrBox.checked = groqTranslateOn();
groqTrBox.addEventListener('change', () => setGroqTranslate(groqTrBox.checked));
$('optGenderA').addEventListener('change', e => setGender('A', e.target.value));
$('optGenderB').addEventListener('change', e => setGender('B', e.target.value));
$('genderBBtn').addEventListener('click', () => setGender('B', gender.B === '' ? 'male' : gender.B === 'male' ? 'female' : ''));
renderGender();
function setGroqStatus(cls, msg) { gEl.status.className = `text-xs min-h-[1rem] ${cls}`; gEl.status.textContent = msg; }
async function saveGroq() {
  const v = gEl.input.value.trim();
  if (!v) { setGroqKey(''); setGroqStatus('text-slate-400', 'לא מוגדר מפתח. הקלטה שקטה לא תהיה זמינה.'); renderListenSetup(); return; }
  if (!looksLikeGroqKey(v)) { setGroqStatus('text-amber-300', 'זה לא נראה כמו מפתח Groq (מתחיל ב-gsk_). בדוק שהעתקת את כולו.'); return; }
  setGroqKey(v);
  renderListenSetup();
  updateCamKeyHint();
  setGroqStatus('text-slate-400', 'נשמר. בודק שהמפתח עובד...');
  try { await testGroqKey(v); setGroqStatus('text-emerald-400', '✓ המפתח עובד. הקלטה שקטה זמינה.'); }
  catch (e) { setGroqStatus(e.code === 'auth' ? 'text-rose-300' : 'text-amber-300', e.message); }
}
gEl.save.addEventListener('click', saveGroq);
gEl.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveGroq(); } });

const mEl = { input: $('optGeminiKey'), save: $('saveGeminiBtn'), status: $('geminiStatus'), assist: $('optGeminiAssist') };
function setGeminiStatus(cls, msg) { mEl.status.className = `text-xs min-h-[1rem] ${cls}`; mEl.status.textContent = msg; }
async function saveGemini() {
  const v = normalizeGeminiKey(mEl.input.value); // בלי רווחים ושורות שנכנסו בהעתקה
  if (!v) { setGeminiKey(''); setGeminiStatus('text-slate-400', 'לא מוגדר מפתח. הבדיקה וההגייה יעבדו בלי Gemini.'); return; }
  if (/^gsk_/.test(v)) { setGeminiStatus('text-amber-300', 'זה מפתח של Groq. מפתח Gemini יוצרים ב-aistudio.google.com ← Get API key.'); return; }
  if (v.length < 24) { setGeminiStatus('text-amber-300', 'המפתח קצר מדי. מפתח Gemini מתחיל ב-AQ. (חדש) או ב-AIza (ישן). בדוק שהעתקת את כולו.'); return; }
  // פורמט לא מוכר לא נחסם: Google משנה פורמטים, והבדיקה מול השירות היא שמכריעה
  mEl.input.value = v;
  setGeminiKey(v);
  setGeminiStatus('text-slate-400', looksLikeGeminiKey(v) ? 'נשמר. בודק שהמפתח עובד...' : 'פורמט לא מוכר, בודק מול Google...');
  try { await testGeminiKey(v); setGeminiStatus('text-emerald-400', '✓ המפתח עובד. הבדיקה וההגייה פעילות.'); }
  catch (e) { setGeminiStatus(e.code === 'auth' ? 'text-rose-300' : 'text-amber-300', e.message); }
}
mEl.save.addEventListener('click', saveGemini);
mEl.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveGemini(); } });
mEl.assist.checked = geminiAssistOn();
mEl.assist.addEventListener('change', () => setGeminiAssist(mEl.assist.checked));

function refreshSettingsInfo() {
  renderSttEngine();
  // השרת האישי (רשות) מוסתר. מוצג רק למי שכבר מחובר אליו (כדי שיוכל להתנתק), או בכתובת עם ?advanced=1
  let advanced = false;
  try { advanced = new URLSearchParams(location.search).has('advanced'); } catch { /* ignore */ }
  $('serverBlock').classList.toggle('hidden', !(getServer() || advanced));
  showServerState();
  mEl.input.value = getGeminiKey();
  if (getGeminiKey()) setGeminiStatus('text-emerald-400', 'מפתח שמור ✓'); else setGeminiStatus('text-slate-400', 'לא מוגדר מפתח (רשות).');
  gEl.input.value = getGroqKey();
  if (getGroqKey()) setGroqStatus('text-emerald-400', 'מפתח שמור ✓'); else setGroqStatus('text-slate-400', 'לא מוגדר מפתח.');
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
checkSharedInbox();
try { sessionStorage.removeItem('tvt_boot_retry'); } catch { /* ignore */ }

if ('serviceWorker' in navigator) {
  // גרסה חדשה נשמרת ברקע בשלמותה. אם באמצע שיחה, שואלים לפני רענון.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  update.reload = () => { if (reloading) return; reloading = true; location.reload(); };
  // מרעננים לבד רק כשבאמת לא משתמשים באפליקציה. אחרת שואלים.
  const busy = () => {
    const a = document.activeElement;
    return !!state.activeMic || state.pending.A || state.pending.B || el.settings.open || isSpeaking() || lm.open || cm.open || wState.auto.on || !!wState.session ||
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

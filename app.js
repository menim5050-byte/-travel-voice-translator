import { LANGS, CATEGORIES, PHRASES } from './phrasebook.js';
import { translate, getMyMemoryEmail } from './translate.js';
import { speak, stopSpeaking, listen, unlockAudio, hasVoice, speechSupport } from './speech.js';

const $ = id => document.getElementById(id);
const SIDES = { A: { other: 'B', color: 'sky', name: 'דובר א׳' }, B: { other: 'A', color: 'emerald', name: 'דובר ב׳' } };

const store = {
  get(k, d) { try { const v = localStorage.getItem('tvt.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tvt.' + k, JSON.stringify(v)); } catch { /* ignore */ } }
};

const state = {
  lang: { A: store.get('langA', 'he'), B: store.get('langB', 'en') },
  turn: 'A',
  face: false,
  opt: { speak: store.get('optSpeak', true), auto: store.get('optAuto', true), sw: store.get('optSwitch', true) },
  mic: { side: null, handle: null },
  incoming: { A: '', B: '' },      // מה שנאמר לדובר הזה (תרגום)
  history: [],
  actor: 'A',
  cat: 'basic'
};

/* ---------- הודעות ---------- */
let toastTimer;
$('toast').addEventListener('click', () => $('toast').classList.add('hidden'));
function toast(msg, kind = 'info') {
  const t = $('toast');
  const cls = { info: 'bg-indigo-950 border-indigo-600 text-indigo-100', warn: 'bg-amber-950 border-amber-600 text-amber-100', error: 'bg-rose-950 border-rose-600 text-rose-100' };
  t.className = 'fixed top-24 inset-x-3 z-50 mx-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-lg border ' + cls[kind];
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), kind === 'error' ? 6000 : 3500);
}

/* ---------- בניית הפאנלים ---------- */
function panelHTML(side) {
  const c = SIDES[side].color;
  return `
  <div class="rounded-2xl border-2 p-3 flex flex-col gap-2.5 bg-slate-900 transition" data-card="${side}">
    <div class="flex items-center justify-between text-xs">
      <span class="font-semibold text-${c}-400">${SIDES[side].name} · <span data-langname="${side}"></span></span>
      <span data-turnflag="${side}" class="px-2 py-0.5 rounded-full bg-${c}-600 text-white hidden">התור שלך</span>
    </div>
    <div class="rounded-xl bg-slate-950 border border-slate-800 p-3 min-h-[4.5rem] flex flex-col gap-1">
      <div class="flex items-center justify-between text-[11px] text-slate-400">
        <span>נאמר לך:</span>
        <button type="button" data-replay="${side}" class="px-2 py-0.5 rounded bg-slate-800 active:bg-slate-700">🔊 השמע שוב</button>
      </div>
      <p data-incoming="${side}" class="text-xl leading-snug font-medium text-${c}-300 break-words select-text">—</p>
    </div>
    <div class="flex gap-2">
      <button type="button" data-mic="${side}" class="shrink-0 w-16 h-16 rounded-full bg-${c}-600 active:bg-${c}-500 text-2xl shadow-lg grid place-items-center" aria-label="דבר">🎤</button>
      <div class="flex-1 min-w-0 flex flex-col gap-1">
        <textarea data-input="${side}" rows="2" dir="auto" placeholder="לחץ על המיקרופון או הקלד" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-base resize-none select-text focus:outline-none focus:ring-2 focus:ring-${c}-500"></textarea>
        <p data-interim="${side}" class="text-xs text-${c}-400 min-h-[1rem] truncate"></p>
      </div>
      <button type="button" data-send="${side}" class="shrink-0 w-16 rounded-xl bg-slate-800 border border-slate-700 active:bg-slate-700 text-xs font-semibold" aria-label="תרגם והשמע">תרגם<br>🔊</button>
    </div>
  </div>`;
}

function q(sel, side) { return document.querySelector(`[${sel}="${side}"]`); }

function buildPanels() {
  $('panelA').innerHTML = panelHTML('A');
  $('panelB').innerHTML = panelHTML('B');
  for (const side of ['A', 'B']) {
    q('data-mic', side).addEventListener('click', () => toggleMic(side));
    q('data-send', side).addEventListener('click', () => { unlockAudio(); sendFrom(side, q('data-input', side).value, true); });
    q('data-replay', side).addEventListener('click', () => { unlockAudio(); replay(side); });
    q('data-input', side).addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); unlockAudio(); sendFrom(side, e.target.value, true); }
    });
  }
}

function langOptions(sel, value) {
  sel.innerHTML = '';
  for (const [k, l] of Object.entries(LANGS)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = `${l.flag} ${l.name} · ${l.native}`;
    sel.appendChild(o);
  }
  sel.value = value;
}

function refreshLangUI() {
  for (const s of ['A', 'B']) {
    const l = LANGS[state.lang[s]];
    q('data-langname', s).textContent = l.name;
    q('data-incoming', s).dir = l.dir;
    q('data-input', s).dir = 'auto';
  }
  store.set('langA', state.lang.A);
  store.set('langB', state.lang.B);
  renderPhrases();
}

function setTurn(t) {
  state.turn = t;
  for (const s of ['A', 'B']) {
    const c = SIDES[s].color;
    const card = q('data-card', s);
    card.classList.toggle(`border-${c}-500`, s === t);
    card.classList.toggle('border-slate-800', s !== t);
    card.classList.toggle('opacity-80', s !== t);
    q('data-turnflag', s).classList.toggle('hidden', s !== t);
  }
}

function setFace(on) {
  state.face = on;
  $('panelB').classList.toggle('rotate-180', on);
  $('faceBtn').setAttribute('aria-pressed', String(on));
  $('faceBtn').classList.toggle('bg-indigo-600', on);
  $('faceBtn').classList.toggle('bg-slate-800', !on);
  $('faceBtn').textContent = on ? '🔄 פנים-אל-פנים: פעיל' : '🔄 פנים-אל-פנים';
}

/* ---------- הקראה ---------- */
function speakIn(text, langKey) {
  if (!text) return;
  if (!speechSupport.tts) { toast('הדפדפן אינו תומך בהקראה קולית. התרגום מוצג בטקסט.', 'warn'); return; }
  if (!hasVoice(langKey)) {
    toast(`לא נמצא קול ${LANGS[langKey].name} במכשיר. יש להתקין קול בהגדרות הטלפון (המרת טקסט לדיבור).`, 'warn');
  }
  speak(text, langKey, { onError: e => toast(`ההקראה נכשלה (${e}). בדוק שהצליל פועל ושאינו במצב שקט.`, 'warn') });
}

function replay(side) {
  const txt = state.incoming[side];
  if (txt) speakIn(txt, state.lang[side]); else toast('אין עדיין תרגום להשמעה.');
}

/* ---------- תרגום ושליחה ---------- */
async function sendFrom(side, rawText, forceSpeak = false) {
  const text = (rawText || '').trim();
  if (!text) { toast('אין טקסט לתרגום.'); return; }
  const other = SIDES[side].other;
  const from = state.lang[side], to = state.lang[other];
  const out = q('data-incoming', other);
  out.textContent = 'מתרגם...';
  try {
    const r = await translate(text, from, to);
    state.incoming[other] = r.text;
    out.textContent = r.text;
    out.dir = LANGS[to].dir;
    addHistory(side, from, to, text, r.text, r.source);
    if (state.opt.speak || forceSpeak) speakIn(r.text, to);
    if (state.opt.sw) setTurn(other);
    q('data-input', side).value = '';
  } catch (e) {
    out.textContent = state.incoming[other] || '—';
    toast(e.message || 'שגיאה בתרגום.', 'error');
  }
}

/* ---------- מיקרופון ---------- */
const MIC_ERRORS = {
  'not-allowed': 'הגישה למיקרופון נחסמה. אשר הרשאה בהגדרות הדפדפן, או הקלד טקסט.',
  'service-not-allowed': 'זיהוי הדיבור חסום בדפדפן הזה. הקלד טקסט או השתמש בדיקטציה של המקלדת.',
  'no-speech': 'לא זוהה דיבור. התקרב למיקרופון ונסה שוב.',
  'network': 'זיהוי הדיבור דורש חיבור לאינטרנט.',
  'language-not-supported': 'שפת הדיבור הזו אינה נתמכת בזיהוי הדיבור של המכשיר.',
  'unsupported': 'זיהוי דיבור אינו נתמך בדפדפן הזה (נתמך ב-Chrome ובאנדרואיד ובחלק מגרסאות Safari). אפשר להקליד או להשתמש בשיחון.',
  'start-failed': 'לא ניתן להפעיל את המיקרופון כרגע.'
};

function setMicUI(side, listening) {
  const c = SIDES[side].color;
  const b = q('data-mic', side);
  b.classList.toggle('mic-listening', listening);
  b.classList.toggle(`bg-${c}-600`, !listening);
  b.classList.toggle('bg-rose-600', listening);
  b.textContent = listening ? '⏹' : '🎤';
}

function stopMic() {
  if (state.mic.handle) state.mic.handle.stop();
  if (state.mic.side) setMicUI(state.mic.side, false);
  state.mic = { side: null, handle: null };
}

function toggleMic(side) {
  unlockAudio(); // חייב להיקרא מתוך לחיצה, אחרת נייד יחסום את ההקראה האוטומטית
  stopSpeaking();
  if (state.mic.side === side) { stopMic(); return; }
  stopMic();
  if (state.turn !== side) setTurn(side);
  const interim = q('data-interim', side);
  const input = q('data-input', side);
  const handle = listen(state.lang[side], {
    onState: s => { if (s === 'listening') { setMicUI(side, true); interim.textContent = 'מאזין...'; } else { setMicUI(side, false); interim.textContent = ''; } },
    onInterim: t => { interim.textContent = t; },
    onFinal: t => {
      input.value = t;
      state.mic = { side: null, handle: null };
      if (state.opt.auto) sendFrom(side, t); else interim.textContent = 'נקלט. לחץ "תרגם" להשמעה.';
    },
    onError: code => { toast(MIC_ERRORS[code] || `שגיאת זיהוי דיבור (${code}).`, code === 'no-speech' ? 'warn' : 'error'); stopMic(); }
  });
  if (handle) state.mic = { side, handle };
}

/* ---------- היסטוריה ---------- */
const SRC_LABEL = { phrasebook: 'שיחון', cache: 'מטמון', mymemory: 'MyMemory', lingva: 'Lingva', same: '' };

function addHistory(side, from, to, original, translated, source) {
  const t = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  state.history.unshift({ side, from, to, original, translated, source, t });
  if (state.history.length > 40) state.history.pop();
  renderHistory();
}

function renderHistory() {
  const box = $('historyList');
  box.innerHTML = '';
  $('histCount').textContent = state.history.length ? `(${state.history.length})` : '';
  if (!state.history.length) {
    const p = document.createElement('p');
    p.className = 'text-xs text-slate-500 py-2';
    p.textContent = 'עדיין אין הודעות.';
    box.appendChild(p);
    return;
  }
  for (const h of state.history) {
    const card = document.createElement('div');
    card.className = 'rounded-lg bg-slate-950 border border-slate-800 p-2.5 flex flex-col gap-1';
    const top = document.createElement('div');
    top.className = 'flex items-center justify-between text-[11px] text-slate-400';
    const meta = document.createElement('span');
    meta.textContent = `${SIDES[h.side].name} · ${LANGS[h.from].name} ← ${LANGS[h.to].name} · ${h.t}${SRC_LABEL[h.source] ? ' · ' + SRC_LABEL[h.source] : ''}`;
    const play = document.createElement('button');
    play.type = 'button'; play.textContent = '🔊';
    play.className = 'px-2 py-0.5 rounded bg-slate-800 active:bg-slate-700';
    play.addEventListener('click', () => { unlockAudio(); speakIn(h.translated, h.to); });
    top.append(meta, play);
    const o = document.createElement('p'); o.className = 'text-xs text-slate-300 select-text'; o.dir = LANGS[h.from].dir; o.textContent = h.original;
    const tr = document.createElement('p'); tr.className = 'text-sm font-medium select-text'; tr.dir = LANGS[h.to].dir; tr.textContent = h.translated;
    card.append(top, o, tr);
    box.appendChild(card);
  }
}

/* ---------- שיחון ---------- */
function renderPhrases() {
  const from = state.lang[state.actor];
  const to = state.lang[SIDES[state.actor].other];
  const aOn = state.actor === 'A';
  $('actorA').className = 'py-2 font-semibold ' + (aOn ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300');
  $('actorB').className = 'py-2 font-semibold ' + (!aOn ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300');

  const chips = $('catChips');
  chips.innerHTML = '';
  for (const c of CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = c.label;
    b.className = 'shrink-0 px-3.5 py-1.5 rounded-full text-sm border ' + (state.cat === c.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300');
    b.addEventListener('click', () => { state.cat = c.id; renderPhrases(); });
    chips.appendChild(b);
  }

  const list = $('phraseList');
  list.innerHTML = '';
  for (const p of PHRASES.filter(p => p.cat === state.cat)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-start rounded-xl bg-slate-900 border border-slate-800 active:bg-slate-800 px-3.5 py-3 flex flex-col gap-0.5';
    const a = document.createElement('span'); a.className = 'text-base font-medium'; a.dir = LANGS[from].dir; a.textContent = p[from];
    const t = document.createElement('span'); t.className = 'text-sm text-slate-400'; t.dir = LANGS[to].dir; t.textContent = p[to];
    b.append(a, t);
    b.addEventListener('click', () => {
      unlockAudio();
      const target = SIDES[state.actor].other;
      state.incoming[target] = p[to];
      q('data-incoming', target).textContent = p[to];
      q('data-incoming', target).dir = LANGS[to].dir;
      addHistory(state.actor, from, to, p[from], p[to], 'phrasebook');
      speakIn(p[to], to);
      toast(`הושמע: ${p[to]}`);
    });
    list.appendChild(b);
  }
}

/* ---------- הגדרות, רשת והתקנה ---------- */
function updateNet() {
  const on = navigator.onLine;
  const b = $('netBadge');
  b.textContent = on ? 'מחובר' : 'אופליין';
  b.className = 'text-[11px] px-2 py-0.5 rounded-full ' + (on ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/60 text-amber-300');
}

function updateVoiceInfo() {
  const parts = Object.entries(LANGS).map(([k, l]) => `${l.name}: ${hasVoice(k) ? '✓' : '✗'}`);
  $('voiceInfo').textContent = speechSupport.tts
    ? `קולות זמינים במכשיר: ${parts.join(' · ')}. סימן ✗ אומר שחסר קול, ויש להתקין אותו בהגדרות הטלפון.`
    : 'הדפדפן אינו תומך בהקראה קולית.';
}

function setupSettings() {
  const dlg = $('settings');
  $('optSpeak').checked = state.opt.speak;
  $('optAuto').checked = state.opt.auto;
  $('optSwitch').checked = state.opt.sw;
  $('optEmail').value = getMyMemoryEmail();
  $('settingsBtn').addEventListener('click', () => { updateVoiceInfo(); dlg.showModal(); });
  $('closeSettings').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('optSpeak').addEventListener('change', e => { state.opt.speak = e.target.checked; store.set('optSpeak', state.opt.speak); });
  $('optAuto').addEventListener('change', e => { state.opt.auto = e.target.checked; store.set('optAuto', state.opt.auto); });
  $('optSwitch').addEventListener('change', e => { state.opt.sw = e.target.checked; store.set('optSwitch', state.opt.sw); });
  $('optEmail').addEventListener('change', e => {
    const v = e.target.value.trim();
    try { v ? localStorage.setItem('tvt.email', v) : localStorage.removeItem('tvt.email'); } catch { /* ignore */ }
  });
  $('testAudioBtn').addEventListener('click', () => {
    unlockAudio();
    const a = state.lang.A, b = state.lang.B;
    const sample = { he: 'בדיקת שמע, שלום', en: 'Audio test, hello', ro: 'Test audio, bună ziua', ar: 'اختبار الصوت، مرحبا', th: 'ทดสอบเสียง สวัสดี' };
    speak(sample[a], a, { onEnd: () => speak(sample[b], b) , onError: e => toast(`ההקראה נכשלה (${e}).`, 'warn') });
    updateVoiceInfo();
  });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) $('iosHint').classList.remove('hidden');
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  $('installBtn').classList.remove('hidden');
});
$('installBtn').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null;
  $('installBtn').classList.add('hidden');
});

/* ---------- טאבים ---------- */
function showTab(name) {
  const chat = name === 'chat';
  $('viewChat').classList.toggle('hidden', !chat);
  $('viewBook').classList.toggle('hidden', chat);
  for (const [id, on] of [['tabChat', chat], ['tabBook', !chat]]) {
    const b = $(id);
    b.setAttribute('aria-selected', String(on));
    b.className = 'py-2 font-semibold border-b-2 ' + (on ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400');
  }
  if (!chat) renderPhrases();
}

/* ---------- אתחול ---------- */
function init() {
  buildPanels();
  langOptions($('langA'), state.lang.A);
  langOptions($('langB'), state.lang.B);
  $('langA').addEventListener('change', e => { state.lang.A = e.target.value; refreshLangUI(); });
  $('langB').addEventListener('change', e => { state.lang.B = e.target.value; refreshLangUI(); });
  $('swapBtn').addEventListener('click', () => {
    [state.lang.A, state.lang.B] = [state.lang.B, state.lang.A];
    $('langA').value = state.lang.A; $('langB').value = state.lang.B;
    refreshLangUI();
  });
  $('turnBtn').addEventListener('click', () => { stopMic(); stopSpeaking(); setTurn(SIDES[state.turn].other); });
  $('faceBtn').addEventListener('click', () => setFace(!state.face));
  $('tabChat').addEventListener('click', () => showTab('chat'));
  $('tabBook').addEventListener('click', () => showTab('book'));
  $('actorA').addEventListener('click', () => { state.actor = 'A'; renderPhrases(); });
  $('actorB').addEventListener('click', () => { state.actor = 'B'; renderPhrases(); });
  $('clearHistBtn').addEventListener('click', () => { state.history = []; renderHistory(); });
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);

  setupSettings();
  refreshLangUI();
  setTurn('A');
  setFace(false);
  renderHistory();
  updateNet();
  if (!speechSupport.stt) toast(MIC_ERRORS.unsupported, 'warn');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* עובד גם בלי SW */ });
  }
}

init();

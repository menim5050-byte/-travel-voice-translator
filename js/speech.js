import { LANGUAGES } from './languages.js';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const IS_ANDROID = /android/i.test(navigator.userAgent);

export const speechSupport = { tts: !!synth, stt: !!SR };

let voices = [];
function refreshVoices() { if (synth) voices = synth.getVoices() || []; }
if (synth) {
  refreshVoices();
  if (synth.addEventListener) synth.addEventListener('voiceschanged', refreshVoices);
}

// חלק מהמכשירים מדווחים על עברית כ-iw ולא he
const normCode = c => String(c || '').toLowerCase().replace(/_/g, '-').replace(/^iw(?=-|$)/, 'he');
const normLang = v => normCode(v.lang);

// קול שמתאים לשפה: קודם התאמה מלאה (he-IL), ואחרת לפי קידומת (he)
export function findVoice(langKey) {
  refreshVoices();
  const code = normCode(LANGUAGES[langKey].ttsCode);
  const prefix = code.split('-')[0];
  return voices.find(v => normLang(v) === code) ||
         voices.find(v => normLang(v).split('-')[0] === prefix) || null;
}

export function hasVoice(langKey) { return !!findVoice(langKey); }
export function voicesLoaded() { refreshVoices(); return voices.length > 0; }

// נייד חוסם הקראה שלא התחילה מלחיצה. קוראים לזה מתוך לחיצה ראשונה.
let unlocked = false;
export function unlockAudio() {
  if (!synth || unlocked) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
    synth.resume();
    unlocked = true;
  } catch { /* ignore */ }
}

let keepAlive = null;
const live = new Set(); // מונע איסוף זבל של ה-utterance ב-Chrome
let speakGen = 0;       // עולה בכל הקראה חדשה או עצירה. הקראה ישנה שממתינה לא תתחיל.

export function isSpeaking() { try { return !!(synth && (synth.speaking || synth.pending)); } catch { return false; } }

export function speak(text, langKey, { onStart, onEnd, onError } = {}) {
  if (!synth || !text) { if (onError) onError('unsupported'); return; }
  const my = ++speakGen;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGUAGES[langKey].ttsCode;
    u.rate = 0.96;
    u.volume = 1;
    const v = findVoice(langKey);
    if (v) u.voice = v;
    live.add(u);
    const done = () => { live.delete(u); if (my === speakGen) { clearInterval(keepAlive); keepAlive = null; } };
    u.onstart = () => { if (onStart) onStart(); };
    // onEnd נקרא רק כשההקראה הסתיימה באמת, לא כשנעצרה או הוחלפה בהקראה אחרת
    u.onend = () => { done(); if (onEnd && my === speakGen) onEnd(); };
    u.onerror = e => {
      done();
      if (e.error && e.error !== 'interrupted' && e.error !== 'canceled' && onError) onError(e.error);
    };
    // Chrome במחשב מפסיק הקראה ארוכה אחרי כ-15 שניות. pause/resume מעיר אותו.
    // באנדרואיד pause לא נתמך ועלול לעצור את ההקראה, ולכן לא משתמשים בו שם.
    clearInterval(keepAlive);
    if (!IS_ANDROID) {
      keepAlive = setInterval(() => {
        if (!synth.speaking) { clearInterval(keepAlive); keepAlive = null; return; }
        synth.pause(); synth.resume();
      }, 10000);
    }
    setTimeout(() => { if (my !== speakGen) { live.delete(u); return; } synth.resume(); synth.speak(u); }, 60);
  } catch (e) { if (onError) onError(String(e)); }
}

export function stopSpeaking() { speakGen++; try { if (synth) synth.cancel(); } catch { /* ignore */ } }

// זמן שקט שאחריו מסיימים לבד. בחלק מהשפות (למשל רומנית) זיהוי הדיבור בטלפון
// לא מחליט לבד שהמשפט נגמר וממשיך להאזין, ולכן האפליקציה מזהה שקט בעצמה.
export const SILENCE_MS = 1800;
const AFTER_FINAL_MS = 400;   // אחרי תוצאה סופית מסיימים כמעט מיד
const MAX_LISTEN_MS = 30000;  // הגבלה לבטיחות
const STOP_GRACE_MS = 1500;   // מכשיר שלא מסיים אחרי stop: מסיימים בעצמנו

/**
 * מאזין פעם אחת.
 * callbacks: onStart(), onInterim(text), onError(code), onEnd(capturedText)
 * onEnd נקרא פעם אחת בדיוק בסיום. הטקסט הוא התוצאה הסופית, ואם אין כזו, האחרונה שזוהתה.
 */
export function listen(langKey, { onStart, onInterim, onError, onEnd }, { silenceMs = SILENCE_MS } = {}) {
  if (!SR) { if (onError) onError('unsupported'); return null; }
  const rec = new SR();
  rec.lang = LANGUAGES[langKey].speechCode;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let lastInterim = '';
  let ended = false, stopping = false;
  let silenceTimer = null, maxTimer = null, graceTimer = null;

  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(silenceTimer); clearTimeout(maxTimer); clearTimeout(graceTimer);
    if (onEnd) onEnd((finalText || lastInterim).trim());
  };
  const stopNow = () => {
    if (ended || stopping) return;
    stopping = true;
    clearTimeout(silenceTimer);
    try { rec.stop(); } catch { /* ignore */ }
    graceTimer = setTimeout(() => { try { rec.abort(); } catch { /* ignore */ } finish(); }, STOP_GRACE_MS);
  };
  const armSilence = ms => { clearTimeout(silenceTimer); silenceTimer = setTimeout(stopNow, ms); };

  rec.onstart = () => {
    maxTimer = setTimeout(stopNow, MAX_LISTEN_MS);
    if (onStart) onStart();
  };
  rec.onresult = ev => {
    let interim = '';
    let gotFinal = false;
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) { finalText += t + ' '; gotFinal = true; } else interim += t;
    }
    lastInterim = interim;
    if (interim && onInterim) onInterim(interim, !finalText.trim());
    if (stopping) return;
    if (gotFinal && !interim) armSilence(AFTER_FINAL_MS);
    else if (interim || gotFinal) armSilence(silenceMs); // כל עוד מגיעות מילים, הזמן מתאפס
  };
  rec.onerror = ev => { if (onError) onError(ev.error); };
  rec.onend = finish;
  try { rec.start(); } catch (e) { if (onError) onError('start-failed'); return null; }
  return { stop: stopNow };
}

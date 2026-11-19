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

const normLang = v => v.lang.toLowerCase().replace('_', '-');

// קול שמתאים לשפה: קודם התאמה מלאה (he-IL), ואחרת לפי קידומת (he)
export function findVoice(langKey) {
  refreshVoices();
  const code = LANGUAGES[langKey].ttsCode.toLowerCase();
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

export function speak(text, langKey, { onStart, onEnd, onError } = {}) {
  if (!synth || !text) { if (onError) onError('unsupported'); return; }
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGUAGES[langKey].ttsCode;
    u.rate = 0.96;
    u.volume = 1;
    const v = findVoice(langKey);
    if (v) u.voice = v;
    live.add(u);
    const done = () => { live.delete(u); clearInterval(keepAlive); keepAlive = null; };
    u.onstart = () => { if (onStart) onStart(); };
    u.onend = () => { done(); if (onEnd) onEnd(); };
    u.onerror = e => {
      done();
      if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') { if (onError) onError(e.error); }
      else if (onEnd) onEnd();
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
    setTimeout(() => { synth.resume(); synth.speak(u); }, 60);
  } catch (e) { if (onError) onError(String(e)); }
}

export function stopSpeaking() { try { if (synth) synth.cancel(); } catch { /* ignore */ } }

/**
 * מאזין פעם אחת.
 * callbacks: onStart(), onInterim(text), onError(code), onEnd(capturedText)
 * onEnd נקרא תמיד בסיום. הטקסט הוא התוצאה הסופית, ואם אין כזו, האחרונה שזוהתה.
 */
export function listen(langKey, { onStart, onInterim, onError, onEnd }) {
  if (!SR) { if (onError) onError('unsupported'); return null; }
  const rec = new SR();
  rec.lang = LANGUAGES[langKey].speechCode;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let lastInterim = '';

  rec.onstart = () => { if (onStart) onStart(); };
  rec.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalText += t + ' '; else interim += t;
    }
    lastInterim = interim;
    if (interim && onInterim) onInterim(interim, !finalText.trim());
  };
  rec.onerror = ev => { if (onError) onError(ev.error); };
  rec.onend = () => { if (onEnd) onEnd((finalText || lastInterim).trim()); };
  try { rec.start(); } catch (e) { if (onError) onError('start-failed'); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* ignore */ } } };
}

import { LANGS } from './phrasebook.js';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const speechSupport = { tts: !!synth, stt: !!SR };

let voices = [];
function refreshVoices() { if (synth) voices = synth.getVoices() || []; }
if (synth) {
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
}

// קול שמתאים לשפה: התאמה מלאה (he-IL), ואחרת לפי קידומת (he)
export function findVoice(langKey) {
  refreshVoices();
  const code = LANGS[langKey].tts.toLowerCase();
  const prefix = code.split('-')[0];
  const norm = v => v.lang.toLowerCase().replace('_', '-');
  return voices.find(v => norm(v) === code) ||
         voices.find(v => norm(v).split('-')[0] === prefix) || null;
}

export function hasVoice(langKey) { return !!findVoice(langKey); }

// חובה לקרוא מתוך לחיצה של המשתמש. נייד חוסם הקראה שלא התחילה מלחיצה.
let unlocked = false;
export function unlockAudio() {
  if (!synth || unlocked) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
    unlocked = true;
  } catch { /* ignore */ }
}

let keepAlive = null;
const live = new Set(); // מונע איסוף זבל של ה-utterance ב-Chrome

export function speak(text, langKey, { onStart, onEnd, onError } = {}) {
  if (!synth || !text) { onError?.('unsupported'); return; }
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[langKey].tts;
    u.rate = 0.95;
    const v = findVoice(langKey);
    if (v) u.voice = v;
    live.add(u);
    const done = () => { live.delete(u); clearInterval(keepAlive); keepAlive = null; };
    u.onstart = () => onStart?.();
    u.onend = () => { done(); onEnd?.(); };
    u.onerror = e => {
      done();
      if (e.error !== 'interrupted' && e.error !== 'canceled') onError?.(e.error || 'error');
      else onEnd?.();
    };
    // Chrome באנדרואיד עלול להפסיק הקראה ארוכה: מעירים את המנוע מדי כמה שניות
    clearInterval(keepAlive);
    keepAlive = setInterval(() => {
      if (!synth.speaking) { clearInterval(keepAlive); keepAlive = null; return; }
      synth.pause(); synth.resume();
    }, 10000);
    setTimeout(() => { synth.resume(); synth.speak(u); }, 60);
  } catch (e) { onError?.(String(e)); }
}

export function stopSpeaking() { try { synth?.cancel(); } catch { /* ignore */ } }

/**
 * מאזין פעם אחת. callbacks: onInterim(text), onFinal(text), onState('listening'|'idle'), onError(code)
 * מחזיר אובייקט עם stop().
 */
export function listen(langKey, { onInterim, onFinal, onState, onError }) {
  if (!SR) { onError?.('unsupported'); return null; }
  const rec = new SR();
  rec.lang = LANGS[langKey].stt;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let errored = false;

  rec.onstart = () => onState?.('listening');
  rec.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalText += t + ' '; else interim += t;
    }
    if (interim) onInterim?.(interim);
  };
  rec.onerror = ev => { errored = true; onError?.(ev.error); };
  rec.onend = () => {
    onState?.('idle');
    const t = finalText.trim();
    if (t && !errored) onFinal?.(t);
  };
  try { rec.start(); } catch (e) { onError?.('start-failed'); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* ignore */ } } };
}

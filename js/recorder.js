// הקלטה שקטה ורציפה מהמיקרופון (בלי זיהוי הדיבור של Google, ולכן בלי צלילים ובלי עצירות).
// התוצאה היא קובץ שמע קטן (Opus), שנשלח לתמלול רק בסוף.

export const recorderSupported = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof window.MediaRecorder !== 'undefined');

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const m of options) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
  return '';
}

export const extFor = mime => (/ogg/.test(mime) ? 'ogg' : /mp4|aac|m4a/.test(mime) ? 'm4a' : 'webm');

/**
 * מתחיל להקליט. onLevel(0..1) נקרא כמה פעמים בשנייה לתצוגת עוצמה.
 * מחזיר { stop(): Promise<Blob>, cancel(), mime }. זורק שגיאה עם code: 'not-allowed' | 'no-mic' | 'unsupported'.
 */
export async function startRecording({ onLevel } = {}) {
  if (!recorderSupported()) { const e = new Error('unsupported'); e.code = 'unsupported'; throw e; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    });
  } catch (err) {
    const e = new Error(err && err.message || 'mic');
    e.code = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError') ? 'not-allowed' : 'no-mic';
    throw e;
  }

  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };

  // מד עוצמה, כדי לראות שההקלטה קולטת
  let ctx = null, meterTimer = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && onLevel) {
      ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      meterTimer = setInterval(() => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        onLevel(Math.min(1, peak / 90));
      }, 120);
    }
  } catch { /* בלי מד עוצמה */ }

  const release = () => {
    clearInterval(meterTimer);
    try { stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    try { if (ctx) ctx.close(); } catch { /* ignore */ }
  };

  rec.start(1000); // חלק כל שנייה, כדי שלא יאבד כלום אם משהו נעצר
  let stopped = false;
  return {
    mime: rec.mimeType || mime || 'audio/webm',
    stop: () => new Promise(resolve => {
      if (stopped) { resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); return; }
      stopped = true;
      const done = () => { release(); resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); };
      rec.onstop = done;
      try { if (rec.state !== 'inactive') rec.stop(); else done(); } catch { done(); }
    }),
    cancel: () => { stopped = true; try { rec.onstop = null; if (rec.state !== 'inactive') rec.stop(); } catch { /* ignore */ } release(); }
  };
}

/**
 * מזהה סוף משפט לפי עוצמת הקול. פונקציה טהורה (בלי מיקרופון), כדי שאפשר לבדוק אותה אוטומטית.
 * push(level 0..1, t ms מתחילת ההקלטה) מחזיר null, { type: 'speech' } או { type: 'end', reason }.
 * - 300ms ראשונים לא נמדדים (המיקרופון "מתעורר" ומחזיר אפסים).
 * - רעש רקע = המינימום ב-1.5 השניות האחרונות, כך שהוא מתעדכן גם ברעש קבוע (רכב, טלוויזיה).
 * - דיבור מאושר רק כש-4 מתוך 6 המדידות האחרונות (כ-0.7 שנייה) מעל הסף. רעש קצר (נקישה, רבע שנייה) לא נחשב.
 * - סוף משפט אחרי 1.8 שניות שקט, כך שהפסקה קצרה באמצע משפט לא חותכת אותו.
 * - קול קצר שאולי היה מילה אחת ("כן"): maybeSpeech=true. אם אחריו 4 שניות שקט, מסיימים ('short') ושולחים לתמלול.
 * - בלי שום קול עד noSpeechMs: מסיימים ('no-speech') בלי לשלוח.
 */
export function createUtteranceDetector({ silenceMs = 1800, noSpeechMs = 8000, maxMs = 30000, warmupMs = 300, floorWindowMs = 1500, minTh = 0.12 } = {}) {
  const hist = [];            // { t, v } לחישוב רעש הרקע
  const recent = [];          // true/false: האם המדידה מעל סף הדיבור (6 אחרונות)
  let hadSpeech = false, maybeSpeech = false, silentFor = 0, lastT = null, measured = 0, ended = false, loudCount = 0, lastLoudT = 0;
  const state = () => ({ hadSpeech, maybeSpeech });
  function push(v, t) {
    if (ended) return null;
    if (t >= maxMs) { ended = true; return { type: 'end', reason: 'max' }; }
    if (t < warmupMs) return null;
    const dt = lastT === null ? 120 : Math.max(0, t - lastT);
    lastT = t;
    hist.push({ t, v });
    while (hist.length && hist[0].t < t - floorWindowMs) hist.shift();
    measured++;
    const floor = Math.min(...hist.map(h => h.v));
    const speakTh = Math.max(minTh, floor * 2.2);
    const quietTh = Math.max(minTh * 0.75, floor * 1.8); // סף נמוך יותר לשקט, כדי שסוף מילה שקט לא ייחשב שתיקה
    const loud = measured >= 3 && v > speakTh;
    recent.push(loud);
    if (recent.length > 6) recent.shift();
    if (loud) { loudCount++; lastLoudT = t; }
    if (!hadSpeech) {
      if (loudCount >= 2) maybeSpeech = true;
      if (recent.filter(Boolean).length >= 4) { hadSpeech = true; silentFor = 0; return { type: 'speech' }; }
      if (maybeSpeech && t - lastLoudT >= 4000 && t >= 4500) { ended = true; return { type: 'end', reason: 'short' }; }
      if (t >= noSpeechMs) { ended = true; return { type: 'end', reason: 'no-speech' }; }
      return null;
    }
    if (v > quietTh) silentFor = 0; else silentFor += dt;
    if (silentFor >= silenceMs) { ended = true; return { type: 'end', reason: 'silence' }; }
    return null;
  }
  return { push, state };
}

/**
 * מקליט משפט אחד בשקט ומזהה לבד מתי הדובר סיים (לפי עוצמת הקול).
 * מחזיר { stop(), cancel(), done } כאשר done מתממש ל-{ blob, hadSpeech, maybeSpeech, reason, ms }.
 * reason: 'silence' (הדובר סיים), 'short' (מילה קצרה ושקט), 'user' (לחיצה), 'no-speech' (לא דיברו), 'max', 'cancel'.
 */
export async function recordUtterance({ onLevel, onSpeech, silenceMs = 1800, noSpeechMs = 8000, maxMs = 30000 } = {}) {
  let finished = false;
  const det = createUtteranceDetector({ silenceMs, noSpeechMs, maxMs });
  const startedAt = Date.now();
  let resolveDone;
  const done = new Promise(r => { resolveDone = r; });
  let rec = null;
  const finish = async reason => {
    if (finished) return;
    finished = true;
    const blob = rec ? await rec.stop() : null;
    resolveDone({ ...det.state(), blob, reason, ms: Date.now() - startedAt });
  };
  rec = await startRecording({
    onLevel: v => {
      if (onLevel) onLevel(v);
      if (finished) return;
      const ev = det.push(v, Date.now() - startedAt);
      if (!ev) return;
      if (ev.type === 'speech') { if (onSpeech) onSpeech(); }
      else finish(ev.reason);
    }
  });
  return {
    stop: () => finish('user'),
    cancel: () => { if (finished) return; finished = true; rec.cancel(); resolveDone({ ...det.state(), blob: null, reason: 'cancel', ms: Date.now() - startedAt }); },
    done
  };
}

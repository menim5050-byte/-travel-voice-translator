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

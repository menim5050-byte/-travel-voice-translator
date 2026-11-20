// בדיקות לזיהוי סוף משפט (createUtteranceDetector), עם מיקרופון מדומה: מדידה כל 120ms כמו באפליקציה.
// כל תרחיש מורץ גם על הלוגיקה הישנה, כדי להראות שהבאג שוחזר ותוקן.
import { createUtteranceDetector } from '../js/recorder.js';

const STEP = 120;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// בונה רצף עוצמות: [משך במילישניות, פונקציה שמחזירה עוצמה]
const quiet = () => 0.02 + rnd() * 0.02;
const tv = () => 0.13 + rnd() * 0.04;              // רעש רקע של טלוויזיה ברקע
const car = () => 0.22 + rnd() * 0.08;             // רעש רכב קבוע
const click = () => 0.6;                            // נקישה / רעש קצר
const zero = () => 0;                               // המיקרופון מתעורר
const speech = () => (rnd() < 0.25 ? 0.18 : 0.6 + rnd() * 0.35); // דיבור עם הפסקות קטנות בין מילים
function signal(parts, total = 31000) {
  const out = [];
  let t = 0;
  for (const [ms, f] of parts) for (const end = t + ms; t < end && t < total; t += STEP) out.push([t, f()]);
  const last = parts[parts.length - 1][1];
  while (t < total) { out.push([t, last()]); t += STEP; }
  return out;
}

function runNew(samples, opts) {
  const det = createUtteranceDetector(opts);
  let speechAt = null;
  for (const [t, v] of samples) {
    const ev = det.push(v, t);
    if (ev && ev.type === 'speech' && speechAt === null) speechAt = t;
    if (ev && ev.type === 'end') return { at: t, reason: ev.reason, speechAt, ...det.state() };
  }
  return { at: null, reason: 'none', speechAt, ...det.state() };
}

// הלוגיקה הקודמת (dd5f25a), להשוואה בלבד
function runOld(samples) {
  let hadSpeech = false, speechRun = 0, silentFor = 0, floor = null, last = null;
  const calib = [];
  for (const [t, v] of samples) {
    const dt = last === null ? 120 : t - last; last = t;
    if (floor === null) { calib.push(v); if (calib.length >= 4) floor = Math.min(0.15, Math.min(...calib)); continue; }
    const th = Math.max(0.12, floor * 2.2);
    if (v > th) { speechRun++; silentFor = 0; if (!hadSpeech && speechRun >= 2) hadSpeech = true; }
    else { speechRun = 0; if (hadSpeech) silentFor += dt; }
    if (hadSpeech && silentFor >= 1400) return { at: t, reason: 'silence' };
    if (!hadSpeech && t >= 8000) return { at: t, reason: 'no-speech' };
    if (t >= 30000) return { at: t, reason: 'max' };
  }
  return { at: null, reason: 'none' };
}

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const s = x => (x === null ? '-' : (x / 1000).toFixed(1) + 's');

// א. רעש קצר אחרי הלחיצה, שתיקה, ודיבור אחרי 3.5 שניות
{
  const sig = signal([[300, quiet], [250, click], [2950, quiet], [2000, speech], [5000, quiet]]);
  const o = runOld(sig), n = runNew(sig);
  ok('A old logic reproduces the bug (closes before the speech)', o.reason === 'silence' && o.at < 3500, `old closed at ${s(o.at)}`);
  ok('A new: does not close before the speech, ends after it', n.reason === 'silence' && n.at > 5500 && n.at < 8000, `new closed at ${s(n.at)}`);
}
// ב. בלי רעש: דיבור ואז שקט
{
  const sig = signal([[1000, quiet], [2000, speech], [5000, quiet]]);
  const n = runNew(sig);
  ok('B clean speech: ends ~1.8s after speaking', n.reason === 'silence' && n.at >= 4700 && n.at <= 5300, `closed at ${s(n.at)}`);
}
// ג. הפסקה של 1.6 שניות באמצע משפט
{
  const sig = signal([[1000, quiet], [1500, speech], [1600, quiet], [1400, speech], [5000, quiet]]);
  const o = runOld(sig), n = runNew(sig);
  ok('C old logic cut the sentence in the middle', o.reason === 'silence' && o.at < 4200, `old closed at ${s(o.at)}`);
  ok('C new: a 1.6s pause does not cut, both halves recorded', n.reason === 'silence' && n.at > 5500, `new closed at ${s(n.at)}`);
}
// ד. רעש רכב קבוע, דיבור אחרי 2 שניות
{
  const sig = signal([[2000, car], [2000, speech], [5000, car]]);
  const n = runNew(sig);
  ok('D car noise: no false start, ends after the speech', n.speechAt >= 2000 && n.reason === 'silence' && n.at > 4000 && n.at < 6500, `speech at ${s(n.speechAt)}, closed at ${s(n.at)}`);
}
// ה. המיקרופון מחזיר אפסים בהתחלה, ואחר כך רעש טלוויזיה
{
  const sig = signal([[300, zero], [9000, tv]]);
  const o = runOld(sig), n = runNew(sig);
  ok('E old logic: mic warm-up + TV noise counted as speech (never stops)', o.reason !== 'no-speech', `old: ${o.reason} at ${s(o.at)}`);
  ok('E new: warm-up skipped, TV noise is not speech', n.reason === 'no-speech' && !n.hadSpeech, `new: ${n.reason} at ${s(n.at)}`);
}
// ו. שקט מלא: "לא זוהה דיבור" אחרי 8 שניות, בלי לשלוח
{
  const n = runNew(signal([[9000, quiet]]));
  ok('F silence only: no-speech at 8s, nothing to send', n.reason === 'no-speech' && !n.hadSpeech && !n.maybeSpeech && n.at >= 8000 && n.at < 8300);
}
// ז. מילה קצרה בלבד ("כן"): לא נזרקת, ונשלחת לתמלול אחרי 4 שניות שקט
{
  const n = runNew(signal([[1500, quiet], [300, click], [8000, quiet]]));
  ok('G one short word: kept (maybeSpeech) and sent after 4s quiet', n.reason === 'short' && n.maybeSpeech && n.at >= 5500 && n.at < 6500, `closed at ${s(n.at)}`);
}
// ז2. נקישה בודדת (מדידה אחת): לא נחשבת למילה
{
  const n = runNew(signal([[1500, quiet], [100, click], [8000, quiet]]));
  ok('G2 a single click is not a word: no-speech, nothing sent', n.reason === 'no-speech' && !n.maybeSpeech);
}
// ח. דיבור ממושך: תקרה של 30 שניות
{
  const n = runNew(signal([[1000, quiet], [31000, speech]]));
  ok('H max length 30s', n.reason === 'max' && n.at >= 30000);
}
// ט. מתחילים לדבר מיד עם הלחיצה
{
  const n = runNew(signal([[100, zero], [2500, speech], [5000, quiet]]));
  ok('I speaking right away is detected and ends after silence', n.speechAt !== null && n.speechAt < 1500 && n.reason === 'silence' && n.at > 2600 && n.at < 5000, `speech at ${s(n.speechAt)}, closed at ${s(n.at)}`);
}

console.log(`${pass}/${pass + fail} passed. FAILED: ${fail ? '[' + fail + ']' : '[]'}`);
process.exit(fail ? 1 : 0);

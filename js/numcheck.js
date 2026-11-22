// בדיקת מספרים: האם הספרות במקור זהות לספרות בתרגום. מתריעה על שגיאה במחיר, בשעה או בטלפון.
// מבדילה בין סימני הפרדה ("1,500" / "1.500" / "1 500" הם אותו מספר), ומתרגמת ספרות ערביות ותאילנדיות.
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩', EXT_ARABIC = '۰۱۲۳۴۵۶۷۸۹', THAI = '๐๑๒๓๔๕๖๗๘๙', DEVANAGARI = '०१२३४५६७८९';

function toAscii(s) {
  return String(s || '').replace(/[٠-٩۰-۹๐-๙०-९]/g, ch => {
    for (const set of [ARABIC_INDIC, EXT_ARABIC, THAI, DEVANAGARI]) { const i = set.indexOf(ch); if (i >= 0) return String(i); }
    return ch;
  });
}

/** מחזיר רשימה ממוינת של המספרים בטקסט, כספרות בלבד. */
export function extractNumbers(text) {
  const t = toAscii(text);
  const found = t.match(/\d+(?:[.,   ]\d{1,3})*(?![\d])/g) || [];
  return found.map(n => n.replace(/\D/g, '')).filter(Boolean).sort();
}

/**
 * משווה מספרים במקור ובתרגום. מחזירה null אם הכול תקין או שאין מה לבדוק (אין ספרות במקור),
 * ואחרת { source, translated } עם המספרים שחסרים או שונים. מספר שנכתב במילים בתרגום ייחשב חסר, ולכן זו אזהרה ולא קביעה.
 */
export function numberMismatch(source, translated) {
  const a = extractNumbers(source);
  if (!a.length) return null;
  const b = extractNumbers(translated);
  const rest = [...b];
  const missing = [];
  for (const n of a) { const i = rest.indexOf(n); if (i >= 0) rest.splice(i, 1); else missing.push(n); }
  if (!missing.length && !rest.length) return null;
  return { source: a, translated: b, missing, extra: rest };
}

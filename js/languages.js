// 22 שפות. mm = קוד ל-MyMemory, lingva = קוד ל-Lingva (שם עברית היא iw ולא he).
const L = (nameHe, native, code, dir, mm, lingva) => ({ nameHe, native, speechCode: code, ttsCode: code, dir, mm, lingva });

// משפט קצר בכל שפה ל"בדיקת שמע" ולכפתור "השמע דוגמה" בהגדרות
const SAMPLES = {
  he: "בדיקת שמע, שלום",
  en: "Audio test, hello",
  ro: "Test audio, bună ziua",
  ar: "اختبار الصوت، مرحبا",
  th: "ทดสอบเสียง สวัสดีครับ",
  ru: "Проверка звука, здравствуйте",
  es: "Prueba de audio, hola",
  fr: "Test audio, bonjour",
  de: "Audiotest, hallo",
  it: "Prova audio, ciao",
  pt: "Teste de áudio, olá",
  el: "Δοκιμή ήχου, γεια σας",
  tr: "Ses testi, merhaba",
  hu: "Hangteszt, helló",
  cs: "Zkouška zvuku, dobrý den",
  pl: "Test dźwięku, dzień dobry",
  nl: "Geluidstest, hallo",
  ja: "音声テスト、こんにちは",
  ko: "음성 테스트, 안녕하세요",
  zh: "语音测试，你好",
  vi: "Kiểm tra âm thanh, xin chào",
  hi: "ऑडियो परीक्षण, नमस्ते"
};

export const LANGUAGES = {
  he: L('עברית', 'עברית', 'he-IL', 'rtl', 'he', 'iw'),
  en: L('אנגלית', 'English', 'en-US', 'ltr', 'en', 'en'),
  ro: L('רומנית', 'Română', 'ro-RO', 'ltr', 'ro', 'ro'),
  ar: L('ערבית', 'العربية', 'ar-SA', 'rtl', 'ar', 'ar'),
  th: L('תאילנדית', 'ไทย', 'th-TH', 'ltr', 'th', 'th'),
  ru: L('רוסית', 'Русский', 'ru-RU', 'ltr', 'ru', 'ru'),
  es: L('ספרדית', 'Español', 'es-ES', 'ltr', 'es', 'es'),
  fr: L('צרפתית', 'Français', 'fr-FR', 'ltr', 'fr', 'fr'),
  de: L('גרמנית', 'Deutsch', 'de-DE', 'ltr', 'de', 'de'),
  it: L('איטלקית', 'Italiano', 'it-IT', 'ltr', 'it', 'it'),
  pt: L('פורטוגזית', 'Português', 'pt-PT', 'ltr', 'pt', 'pt'),
  el: L('יוונית', 'Ελληνικά', 'el-GR', 'ltr', 'el', 'el'),
  tr: L('טורקית', 'Türkçe', 'tr-TR', 'ltr', 'tr', 'tr'),
  hu: L('הונגרית', 'Magyar', 'hu-HU', 'ltr', 'hu', 'hu'),
  cs: L('צ׳כית', 'Čeština', 'cs-CZ', 'ltr', 'cs', 'cs'),
  pl: L('פולנית', 'Polski', 'pl-PL', 'ltr', 'pl', 'pl'),
  nl: L('הולנדית', 'Nederlands', 'nl-NL', 'ltr', 'nl', 'nl'),
  ja: L('יפנית', '日本語', 'ja-JP', 'ltr', 'ja', 'ja'),
  ko: L('קוריאנית', '한국어', 'ko-KR', 'ltr', 'ko', 'ko'),
  zh: L('סינית', '中文', 'zh-CN', 'ltr', 'zh-CN', 'zh'),
  vi: L('וייטנאמית', 'Tiếng Việt', 'vi-VN', 'ltr', 'vi', 'vi'),
  hi: L('הינדית', 'हिन्दी', 'hi-IN', 'ltr', 'hi', 'hi')
};

for (const [k, v] of Object.entries(SAMPLES)) LANGUAGES[k].sample = v;

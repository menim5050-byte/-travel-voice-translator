// שיחון טיולים אופליין. כל משפט קיים בכל חמש השפות, ללא צורך באינטרנט.
export const LANGS = {
  he: { name: 'עברית', native: 'עברית', flag: '🇮🇱', stt: 'he-IL', tts: 'he-IL', dir: 'rtl', mm: 'he', lingva: 'iw' },
  en: { name: 'אנגלית', native: 'English', flag: '🇬🇧', stt: 'en-US', tts: 'en-US', dir: 'ltr', mm: 'en', lingva: 'en' },
  ro: { name: 'רומנית', native: 'Română', flag: '🇷🇴', stt: 'ro-RO', tts: 'ro-RO', dir: 'ltr', mm: 'ro', lingva: 'ro' },
  ar: { name: 'ערבית', native: 'العربية', flag: '🌍', stt: 'ar-SA', tts: 'ar-SA', dir: 'rtl', mm: 'ar', lingva: 'ar' },
  th: { name: 'תאילנדית', native: 'ไทย', flag: '🇹🇭', stt: 'th-TH', tts: 'th-TH', dir: 'ltr', mm: 'th', lingva: 'th' }
};

export const CATEGORIES = [
  { id: 'basic', label: 'בסיסי' },
  { id: 'move', label: 'תחבורה' },
  { id: 'food', label: 'אוכל' },
  { id: 'help', label: 'עזרה' }
];

export const PHRASES = [
  { cat: 'basic', he: 'שלום', en: 'Hello', ro: 'Bună ziua', ar: 'مرحبا', th: 'สวัสดี' },
  { cat: 'basic', he: 'תודה רבה', en: 'Thank you very much', ro: 'Mulțumesc mult', ar: 'شكراً جزيلاً', th: 'ขอบคุณมาก' },
  { cat: 'basic', he: 'בבקשה', en: 'Please', ro: 'Vă rog', ar: 'من فضلك', th: 'กรุณา' },
  { cat: 'basic', he: 'כן', en: 'Yes', ro: 'Da', ar: 'نعم', th: 'ใช่' },
  { cat: 'basic', he: 'לא', en: 'No', ro: 'Nu', ar: 'لا', th: 'ไม่' },
  { cat: 'basic', he: 'סליחה', en: 'Excuse me', ro: 'Scuzați-mă', ar: 'عفواً', th: 'ขอโทษ' },
  { cat: 'basic', he: 'אתה מדבר אנגלית?', en: 'Do you speak English?', ro: 'Vorbiți engleză?', ar: 'هل تتكلم الإنجليزية؟', th: 'คุณพูดภาษาอังกฤษได้ไหม' },
  { cat: 'basic', he: 'לא הבנתי, אפשר שוב?', en: 'I did not understand, can you repeat?', ro: 'Nu am înțeles, puteți repeta?', ar: 'لم أفهم، هل يمكنك الإعادة؟', th: 'ฉันไม่เข้าใจ ช่วยพูดอีกครั้งได้ไหม' },
  { cat: 'basic', he: 'בבקשה דבר לאט', en: 'Please speak slowly', ro: 'Vă rog să vorbiți mai rar', ar: 'من فضلك تكلم ببطء', th: 'กรุณาพูดช้าๆ' },
  { cat: 'basic', he: 'כמה זה עולה?', en: 'How much does this cost?', ro: 'Cât costă?', ar: 'كم يكلف هذا؟', th: 'ราคาเท่าไหร่' },

  { cat: 'move', he: 'איפה השירותים?', en: 'Where is the bathroom?', ro: 'Unde este toaleta?', ar: 'أين الحمام؟', th: 'ห้องน้ำอยู่ที่ไหน' },
  { cat: 'move', he: 'אני צריך מונית', en: 'I need a taxi', ro: 'Am nevoie de un taxi', ar: 'أحتاج إلى سيارة أجرة', th: 'ฉันต้องการแท็กซี่' },
  { cat: 'move', he: 'אפשר לנסוע עם מונה?', en: 'Can you use the meter, please?', ro: 'Puteți folosi taximetrul, vă rog?', ar: 'هل يمكنك تشغيل العداد من فضلك؟', th: 'ช่วยเปิดมิเตอร์ได้ไหม' },
  { cat: 'move', he: 'איפה תחנת הרכבת?', en: 'Where is the train station?', ro: 'Unde este gara?', ar: 'أين محطة القطار؟', th: 'สถานีรถไฟอยู่ที่ไหน' },
  { cat: 'move', he: 'איפה שדה התעופה?', en: 'Where is the airport?', ro: 'Unde este aeroportul?', ar: 'أين المطار؟', th: 'สนามบินอยู่ที่ไหน' },
  { cat: 'move', he: 'אני מחפש את המלון שלי', en: 'I am looking for my hotel', ro: 'Îmi caut hotelul', ar: 'أبحث عن فندقي', th: 'ฉันกำลังหาโรงแรมของฉัน' },
  { cat: 'move', he: 'בבקשה עצור כאן', en: 'Please stop here', ro: 'Vă rog să opriți aici', ar: 'من فضلك توقف هنا', th: 'กรุณาจอดที่นี่' },
  { cat: 'move', he: 'ימינה', en: 'To the right', ro: 'La dreapta', ar: 'إلى اليمين', th: 'ไปทางขวา' },
  { cat: 'move', he: 'שמאלה', en: 'To the left', ro: 'La stânga', ar: 'إلى اليسار', th: 'ไปทางซ้าย' },
  { cat: 'move', he: 'ישר', en: 'Straight ahead', ro: 'Drept înainte', ar: 'إلى الأمام', th: 'ตรงไป' },

  { cat: 'food', he: 'שולחן לשניים, בבקשה', en: 'A table for two, please', ro: 'O masă pentru doi, vă rog', ar: 'طاولة لشخصين من فضلك', th: 'ขอโต๊ะสำหรับสองคน' },
  { cat: 'food', he: 'אפשר תפריט?', en: 'Can I see the menu?', ro: 'Pot vedea meniul?', ar: 'هل يمكنني رؤية القائمة؟', th: 'ขอดูเมนูได้ไหม' },
  { cat: 'food', he: 'אני אלרגי לבוטנים', en: 'I am allergic to peanuts', ro: 'Sunt alergic la arahide', ar: 'عندي حساسية من الفول السوداني', th: 'ฉันแพ้ถั่วลิสง' },
  { cat: 'food', he: 'בלי בשר, בבקשה', en: 'No meat, please', ro: 'Fără carne, vă rog', ar: 'بدون لحم من فضلك', th: 'ไม่ใส่เนื้อสัตว์' },
  { cat: 'food', he: 'לא חריף, בבקשה', en: 'Not spicy, please', ro: 'Fără picant, vă rog', ar: 'بدون حار من فضلك', th: 'ไม่เผ็ด' },
  { cat: 'food', he: 'מים, בבקשה', en: 'Water, please', ro: 'Apă, vă rog', ar: 'ماء من فضلك', th: 'ขอน้ำ' },
  { cat: 'food', he: 'החשבון, בבקשה', en: 'The check, please', ro: 'Nota, vă rog', ar: 'الحساب من فضلك', th: 'ขอเช็คบิล' },
  { cat: 'food', he: 'זה היה טעים מאוד', en: 'It was very delicious', ro: 'A fost foarte gustos', ar: 'كان لذيذاً جداً', th: 'อร่อยมาก' },

  { cat: 'help', he: 'אני צריך עזרה', en: 'I need help', ro: 'Am nevoie de ajutor', ar: 'أحتاج إلى مساعدة', th: 'ฉันต้องการความช่วยเหลือ' },
  { cat: 'help', he: 'תקרא למשטרה', en: 'Call the police', ro: 'Chemați poliția', ar: 'اتصل بالشرطة', th: 'โทรเรียกตำรวจ' },
  { cat: 'help', he: 'תקרא לאמבולנס', en: 'Call an ambulance', ro: 'Chemați o ambulanță', ar: 'اتصل بالإسعاف', th: 'เรียกรถพยาบาล' },
  { cat: 'help', he: 'אני צריך רופא', en: 'I need a doctor', ro: 'Am nevoie de un medic', ar: 'أحتاج إلى طبيب', th: 'ฉันต้องการหมอ' },
  { cat: 'help', he: 'איפה בית המרקחת?', en: 'Where is the pharmacy?', ro: 'Unde este farmacia?', ar: 'أين الصيدلية؟', th: 'ร้านขายยาอยู่ที่ไหน' },
  { cat: 'help', he: 'איבדתי את הדרכון שלי', en: 'I lost my passport', ro: 'Mi-am pierdut pașaportul', ar: 'فقدت جواز سفري', th: 'ฉันทำหนังสือเดินทางหาย' },
  { cat: 'help', he: 'אני מרגיש לא טוב', en: 'I do not feel well', ro: 'Nu mă simt bine', ar: 'لا أشعر أنني بخير', th: 'ฉันรู้สึกไม่สบาย' }
];

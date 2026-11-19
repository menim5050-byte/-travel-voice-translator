// שיחון אופליין בשש השפות העיקריות: he, en, ro, ar, th, ru.
// quick:true = מופיע בשורת "משפטים מהירים" (כמו במקור). השאר תחת "עוד משפטים".
export const CATEGORY_LABELS = { basic: 'בסיסי', move: 'תחבורה ודרכים', food: 'אוכל', help: 'עזרה ובריאות' };

export const PHRASES = [
  // ---- שורת המשפטים המהירים (כמו בגרסת גימיני) ----
  { quick: true, cat: 'basic', label: 'שלום', he: 'שלום', en: 'Hello', ro: 'Bună ziua', ar: 'مرحبا', th: 'สวัสดี', ru: 'Здравствуйте' },
  { quick: true, cat: 'basic', label: 'תודה רבה', he: 'תודה רבה', en: 'Thank you very much', ro: 'Mulțumesc mult', ar: 'شكراً جزيلاً', th: 'ขอบคุณมาก', ru: 'Большое спасибо' },
  { quick: true, cat: 'basic', label: 'כן', he: 'כן', en: 'Yes', ro: 'Da', ar: 'نعم', th: 'ใช่', ru: 'Да' },
  { quick: true, cat: 'basic', label: 'לא', he: 'לא', en: 'No', ro: 'Nu', ar: 'لا', th: 'ไม่', ru: 'Нет' },
  { quick: true, cat: 'basic', label: 'כמה זה עולה?', he: 'כמה זה עולה?', en: 'How much does this cost?', ro: 'Cât costă?', ar: 'كم يكلف هذا؟', th: 'ราคาเท่าไหร่', ru: 'Сколько это стоит?' },
  { quick: true, cat: 'move', label: 'איפה תחנת הרכבת?', he: 'איפה תחנת הרכבת?', en: 'Where is the train station?', ro: 'Unde este gara?', ar: 'أين محطة القطار؟', th: 'สถานีรถไฟอยู่ที่ไหน', ru: 'Где находится вокзал?' },
  { quick: true, cat: 'move', label: 'איפה השירותים?', he: 'איפה השירותים?', en: 'Where is the restroom?', ro: 'Unde este toaleta?', ar: 'أين الحمام؟', th: 'ห้องน้ำอยู่ที่ไหน', ru: 'Где туалет?' },
  { quick: true, cat: 'food', label: 'אפשר חשבון בבקשה?', he: 'אפשר חשבון בבקשה?', en: 'Can I have the bill, please?', ro: 'Nota de plată, vă rog?', ar: 'الحساب من فضلك؟', th: 'ขอเช็คบิลด้วยครับ', ru: 'Счёт, пожалуйста' },
  { quick: true, cat: 'basic', label: 'בבקשה חכה רגע', he: 'בבקשה חכה רגע', en: 'Please wait a moment', ro: 'Vă rog să așteptați un moment', ar: 'من فضلك انتظر لحظة', th: 'กรุณารอสักครู่', ru: 'Пожалуйста, подождите минуту' },
  { quick: true, cat: 'basic', label: 'לא הבנתי, אפשר שוב?', he: 'לא הבנתי, אפשר שוב?', en: 'I did not understand, can you repeat?', ro: 'Nu am înțeles, puteți repeta?', ar: 'لم أفهم، هل يمكنك الإعادة؟', th: 'ฉันไม่เข้าใจ ช่วยพูดอีกครั้งได้ไหม', ru: 'Я не понял, повторите, пожалуйста' },
  { quick: true, cat: 'help', label: 'צריך עזרה', he: 'אני צריך עזרה בבקשה', en: 'I need help, please', ro: 'Am nevoie de ajutor, vă rog', ar: 'أحتاج إلى مساعدة من فضلك', th: 'ขอความช่วยเหลือหน่อยครับ', ru: 'Мне нужна помощь, пожалуйста' },
  { quick: true, cat: 'basic', label: 'הכל בסדר', he: 'הכל בסדר', en: 'Everything is fine', ro: 'Totul este în regulă', ar: 'كل شيء على ما يرام', th: 'ทุกอย่างเรียบร้อยดี', ru: 'Всё хорошо' },

  // ---- עוד משפטים ----
  { cat: 'basic', he: 'בבקשה', en: 'Please', ro: 'Vă rog', ar: 'من فضلك', th: 'กรุณา', ru: 'Пожалуйста' },
  { cat: 'basic', he: 'סליחה', en: 'Excuse me', ro: 'Scuzați-mă', ar: 'عفواً', th: 'ขอโทษ', ru: 'Извините' },
  { cat: 'basic', he: 'אתה מדבר אנגלית?', en: 'Do you speak English?', ro: 'Vorbiți engleză?', ar: 'هل تتكلم الإنجليزية؟', th: 'คุณพูดภาษาอังกฤษได้ไหม', ru: 'Вы говорите по-английски?' },
  { cat: 'basic', he: 'בבקשה דבר לאט', en: 'Please speak slowly', ro: 'Vă rog să vorbiți mai rar', ar: 'من فضلك تكلم ببطء', th: 'กรุณาพูดช้าๆ', ru: 'Пожалуйста, говорите медленнее' },

  { cat: 'move', he: 'אני צריך מונית', en: 'I need a taxi', ro: 'Am nevoie de un taxi', ar: 'أحتاج إلى سيارة أجرة', th: 'ฉันต้องการแท็กซี่', ru: 'Мне нужно такси' },
  { cat: 'move', he: 'אפשר לנסוע עם מונה?', en: 'Can you use the meter, please?', ro: 'Puteți folosi taximetrul, vă rog?', ar: 'هل يمكنك تشغيل العداد من فضلك؟', th: 'ช่วยเปิดมิเตอร์ได้ไหม', ru: 'Включите счётчик, пожалуйста' },
  { cat: 'move', he: 'איפה שדה התעופה?', en: 'Where is the airport?', ro: 'Unde este aeroportul?', ar: 'أين المطار؟', th: 'สนามบินอยู่ที่ไหน', ru: 'Где аэропорт?' },
  { cat: 'move', he: 'אני מחפש את המלון שלי', en: 'I am looking for my hotel', ro: 'Îmi caut hotelul', ar: 'أبحث عن فندقي', th: 'ฉันกำลังหาโรงแรมของฉัน', ru: 'Я ищу свой отель' },
  { cat: 'move', he: 'בבקשה עצור כאן', en: 'Please stop here', ro: 'Vă rog să opriți aici', ar: 'من فضلك توقف هنا', th: 'กรุณาจอดที่นี่', ru: 'Остановитесь здесь, пожалуйста' },
  { cat: 'move', he: 'ימינה', en: 'To the right', ro: 'La dreapta', ar: 'إلى اليمين', th: 'ไปทางขวา', ru: 'Направо' },
  { cat: 'move', he: 'שמאלה', en: 'To the left', ro: 'La stânga', ar: 'إلى اليسار', th: 'ไปทางซ้าย', ru: 'Налево' },
  { cat: 'move', he: 'ישר', en: 'Straight ahead', ro: 'Drept înainte', ar: 'إلى الأمام', th: 'ตรงไป', ru: 'Прямо' },

  { cat: 'food', he: 'שולחן לשניים, בבקשה', en: 'A table for two, please', ro: 'O masă pentru doi, vă rog', ar: 'طاولة لشخصين من فضلك', th: 'ขอโต๊ะสำหรับสองคน', ru: 'Столик на двоих, пожалуйста' },
  { cat: 'food', he: 'אפשר תפריט?', en: 'Can I see the menu?', ro: 'Pot vedea meniul?', ar: 'هل يمكنني رؤية القائمة؟', th: 'ขอดูเมนูได้ไหม', ru: 'Можно меню?' },
  { cat: 'food', he: 'אני אלרגי לבוטנים', en: 'I am allergic to peanuts', ro: 'Sunt alergic la arahide', ar: 'عندي حساسية من الفول السوداني', th: 'ฉันแพ้ถั่วลิสง', ru: 'У меня аллергия на арахис' },
  { cat: 'food', he: 'בלי בשר, בבקשה', en: 'No meat, please', ro: 'Fără carne, vă rog', ar: 'بدون لحم من فضلك', th: 'ไม่ใส่เนื้อสัตว์', ru: 'Без мяса, пожалуйста' },
  { cat: 'food', he: 'לא חריף, בבקשה', en: 'Not spicy, please', ro: 'Fără picant, vă rog', ar: 'بدون حار من فضلك', th: 'ไม่เผ็ด', ru: 'Не острое, пожалуйста' },
  { cat: 'food', he: 'מים, בבקשה', en: 'Water, please', ro: 'Apă, vă rog', ar: 'ماء من فضلك', th: 'ขอน้ำ', ru: 'Воду, пожалуйста' },
  { cat: 'food', he: 'זה היה טעים מאוד', en: 'It was very delicious', ro: 'A fost foarte gustos', ar: 'كان لذيذاً جداً', th: 'อร่อยมาก', ru: 'Было очень вкусно' },

  { cat: 'help', he: 'תקרא למשטרה', en: 'Call the police', ro: 'Chemați poliția', ar: 'اتصل بالشرطة', th: 'โทรเรียกตำรวจ', ru: 'Вызовите полицию' },
  { cat: 'help', he: 'תקרא לאמבולנס', en: 'Call an ambulance', ro: 'Chemați o ambulanță', ar: 'اتصل بالإسعاف', th: 'เรียกรถพยาบาล', ru: 'Вызовите скорую помощь' },
  { cat: 'help', he: 'אני צריך רופא', en: 'I need a doctor', ro: 'Am nevoie de un medic', ar: 'أحتاج إلى طبيب', th: 'ฉันต้องการหมอ', ru: 'Мне нужен врач' },
  { cat: 'help', he: 'איפה בית המרקחת?', en: 'Where is the pharmacy?', ro: 'Unde este farmacia?', ar: 'أين الصيدلية؟', th: 'ร้านขายยาอยู่ที่ไหน', ru: 'Где аптека?' },
  { cat: 'help', he: 'איבדתי את הדרכון שלי', en: 'I lost my passport', ro: 'Mi-am pierdut pașaportul', ar: 'فقدت جواز سفري', th: 'ฉันทำหนังสือเดินทางหาย', ru: 'Я потерял паспорт' },
  { cat: 'help', he: 'אני מרגיש לא טוב', en: 'I do not feel well', ro: 'Nu mă simt bine', ar: 'لا أشعر أنني بخير', th: 'ฉันรู้สึกไม่สบาย', ru: 'Мне нехорошо' }
];

// תבנית ל"קח אותי למלון". הכתובת עצמה מצורפת בסוף ולא מתורגמת, כדי ששם המלון לא ישתבש.
export const HOTEL_TEMPLATE = {
  he: 'בבקשה קח אותי לכתובת הזו: ',
  en: 'Please take me to this address: ',
  ro: 'Vă rog, duceți-mă la această adresă: ',
  ar: 'من فضلك خذني إلى هذا العنوان: ',
  th: 'กรุณาพาฉันไปที่อยู่นี้: ',
  ru: 'Пожалуйста, отвезите меня по этому адресу: '
};

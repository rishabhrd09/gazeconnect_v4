import type {
  ActivityCategory,
  MedicalSection,
  PhraseCategory,
  QuickWordsConfig,
} from '../types/customization';

export const CARE_CONTENT_ARCHITECTURE_VERSION = 3;

export const CARE_PHRASE_CATEGORIES: PhraseCategory[] = [
  {
    id: 'communication',
    name: 'Communication',
    phrases: [
      { en: 'Yes', hi: 'हां' },
      { en: 'No', hi: 'नहीं' },
      { en: 'Wait a moment', hi: 'एक पल रुको' },
      { en: 'Let me think', hi: 'मुझे सोचने दो' },
      { en: "I don't understand", hi: 'समझ नहीं आया' },
      { en: 'Please repeat that', hi: 'कृपया दोहराएं' },
      { en: 'Please ask yes or no', hi: 'कृपया हां या नहीं पूछो' },
      { en: 'Please speak slowly', hi: 'कृपया धीरे बोलो' },
      { en: 'Thank you', hi: 'धन्यवाद' },
      { en: 'Sorry', hi: 'माफ़ी' },
    ],
  },
  {
    id: 'feelings',
    name: 'Feelings & Emotions',
    phrases: [
      { en: 'I am okay', hi: 'मैं ठीक हूं' },
      { en: 'I am scared', hi: 'मुझे डर लग रहा है' },
      { en: 'I am anxious', hi: 'मुझे चिंता है' },
      { en: 'I feel uncomfortable', hi: 'मुझे असहज लग रहा है' },
      { en: 'I am tired', hi: 'मैं थक गया हूं' },
      { en: 'I feel lonely', hi: 'मुझे अकेलापन लग रहा है' },
      { en: 'I am grateful', hi: 'मैं आभारी हूं' },
      { en: 'I love you', hi: 'मैं तुमसे प्यार करता हूं' },
      { en: 'I miss you', hi: 'मैं तुम्हें याद करता हूं' },
      { en: 'Pray for me', hi: 'मेरे लिए प्रार्थना करो' },
    ],
  },
  {
    id: 'people',
    name: 'People & Visitors',
    phrases: [
      { en: 'Call family', hi: 'परिवार को बुलाओ' },
      { en: 'Call nurse', hi: 'नर्स को बुलाओ' },
      { en: 'Call doctor', hi: 'डॉक्टर को बुलाओ' },
      { en: 'Call caretaker', hi: 'केयरटेकर को बुलाओ' },
      { en: 'Who is there?', hi: 'वहां कौन है?' },
      { en: 'Who is at the door?', hi: 'दरवाज़े पर कौन है?' },
      { en: 'I want to video call', hi: 'मैं वीडियो कॉल करना चाहता हूं' },
      { en: "I don't want visitors", hi: 'मुझे कोई नहीं चाहिए' },
      { en: 'Ask them to wait', hi: 'उन्हें रुकने को कहो' },
    ],
  },
];

export const CARE_MEDICAL_SECTIONS: MedicalSection[] = [
  {
    id: 'airway',
    title: 'AIRWAY & VITALS',
    titleHi: 'वायुमार्ग / वाइटल्स',
    items: [
      { en: 'TT Suction needed now', hi: 'TT सक्शन अभी चाहिए', urgent: true },
      { en: 'Oral suction needed', hi: 'ओरल सक्शन चाहिए', urgent: true },
      { en: 'Breathing problem - Ambu bag', hi: 'सांस की तकलीफ', urgent: true },
      { en: 'Breathing discomfort', hi: 'सांस में तकलीफ', urgent: true },
      { en: 'Check vitals - O2, Pulse', hi: 'वाइटल्स चेक करो', urgent: true },
      { en: 'Ventilator alarm - check', hi: 'वेंटिलेटर अलार्म', urgent: true },
      { en: 'Check tube / mask position', hi: 'ट्यूब / मास्क चेक करो', urgent: true },
      { en: 'Call nurse immediately', hi: 'नर्स को तुरंत बुलाओ', urgent: true },
    ],
  },
  {
    id: 'bed',
    title: 'BED & POSITION',
    titleHi: 'बिस्तर / करवट',
    items: [
      { en: 'Turn to Left Side', hi: 'बाईं करवट' },
      { en: 'Turn to Right Side', hi: 'दाईं करवट' },
      { en: 'Raise my head', hi: 'सिर ऊपर करो' },
      { en: 'Lower my head', hi: 'सिर नीचे करो' },
      { en: 'Fix Pillow', hi: 'तकिया ठीक करो' },
      { en: 'Adjust Head / Neck', hi: 'सर ठीक करो' },
      { en: 'Adjust Hands & Legs', hi: 'हाथ-पैर ठीक करो' },
      { en: 'Back care needed', hi: 'बैक केयर' },
    ],
  },
  {
    id: 'daily',
    title: 'DAILY CARE',
    titleHi: 'रोज़ देखभाल',
    items: [
      { en: 'I need Water', hi: 'पानी चाहिए' },
      { en: 'Wet my mouth', hi: 'मुंह गीला करो' },
      { en: 'Clean Face / Eyes', hi: 'चेहरा / आंखें साफ करो' },
      { en: 'Eye Drops', hi: 'आई ड्रॉप्स' },
      { en: 'Toilet / Urine Pot', hi: 'टॉयलेट / पॉट' },
      { en: 'Remove Urine Pot', hi: 'पॉट हटाओ' },
      { en: 'Blanket / Shawl', hi: 'कंबल / शॉल' },
      { en: 'Adjust Fan / AC', hi: 'पंखा / AC' },
    ],
  },
  {
    id: 'symptoms',
    title: 'SYMPTOMS',
    titleHi: 'लक्षण / तकलीफ',
    items: [
      { en: 'I am in severe pain', hi: 'बहुत दर्द हो रहा है', urgent: true },
      { en: 'Chest discomfort', hi: 'छाती में तकलीफ', urgent: true },
      { en: 'Fever', hi: 'बुखार' },
      { en: 'Feeling cold / shivering', hi: 'ठंड / कंपकंपी' },
      { en: 'Feeling hot / sweating', hi: 'गर्मी / पसीना' },
      { en: 'Panic / Anxiety', hi: 'घबराहट हो रही है' },
      { en: 'Itching', hi: 'खुजली हो रही है' },
      { en: 'Too tired / need rest', hi: 'बहुत थकान / आराम चाहिए' },
    ],
  },
];

export const CARE_QUICK_WORDS: QuickWordsConfig = {
  enabled: true,
  highColor: 'muted_maroon',
  mediumColor: 'warm_teal',
  coreWords: [
    { en: 'Yes', hi: 'हां', enabled: true },
    { en: 'No', hi: 'नहीं', enabled: true },
    { en: 'Wait', hi: 'रुको', enabled: true },
    { en: 'Stop', hi: 'रुको', enabled: true },
    { en: 'Help', hi: 'मदद', enabled: true },
    { en: 'Pain', hi: 'दर्द', enabled: true },
  ],
  categories: [
    {
      id: 'emergency',
      heading: 'Airway / Alarm',
      headingHi: 'वायुमार्ग',
      color: '#A64E3F',
      words: [
        { en: 'TT Suction', hi: 'TT सक्शन', enabled: true, priority: 'high' },
        { en: 'Oral Suction', hi: 'ओरल सक्शन', enabled: true, priority: 'high' },
        { en: 'Ambu bag', hi: 'अंबू बैग', enabled: true, priority: 'high' },
        { en: 'Breathing problem', hi: 'सांस की तकलीफ', enabled: true, priority: 'high' },
        { en: 'Check O2 / Pulse', hi: 'ऑक्सीजन / पल्स', enabled: true, priority: 'medium' },
        { en: 'Severe Pain', hi: 'बहुत दर्द', enabled: true, priority: 'high' },
      ],
    },
    {
      id: 'position',
      heading: 'Position',
      headingHi: 'पोज़िशन',
      color: '#C69A45',
      words: [
        { en: 'Turn Left', hi: 'बाईं करवट', enabled: true, priority: 'medium' },
        { en: 'Turn Right', hi: 'दाईं करवट', enabled: true, priority: 'medium' },
        { en: 'Head Up', hi: 'सिर ऊपर', enabled: true, priority: 'medium' },
        { en: 'Head Down', hi: 'सिर नीचे', enabled: true, priority: 'medium' },
        { en: 'Fix Pillow', hi: 'तकिया ठीक करो', enabled: true, priority: 'medium' },
        { en: 'Adjust Hands & Legs', hi: 'हाथ-पैर ठीक करो', enabled: true, priority: 'medium' },
      ],
    },
    {
      id: 'daily',
      heading: 'Comfort / Daily',
      headingHi: 'रोज़',
      color: '#8FAE72',
      words: [
        { en: 'Water / Wet mouth', hi: 'पानी / मुंह गीला', enabled: true, priority: 'medium' },
        { en: 'Eye drops', hi: 'आई ड्रॉप्स', enabled: true, priority: 'medium' },
        { en: 'Blanket', hi: 'कंबल', enabled: true, priority: 'medium' },
        { en: 'Fan / AC', hi: 'पंखा / AC', enabled: true, priority: 'medium' },
        { en: 'Urine pot / Toilet', hi: 'पॉट / टॉयलेट', enabled: true, priority: 'medium' },
        { en: 'Pain', hi: 'दर्द', enabled: true, priority: 'medium' },
      ],
    },
  ],
};

export const CARE_ACTIVITY_CATEGORIES: ActivityCategory[] = [
  {
    id: 'tv',
    name: 'TV Channels',
    items: [
      { label: 'Switch ON TV', num: 'ON', speak: 'Switch on TV' },
      { label: 'Switch OFF TV', num: 'OFF', speak: 'Switch off TV' },
      { label: 'News - 508', num: '508', speak: 'Change to channel 508' },
      { label: 'News - 511', num: '511', speak: 'Change to channel 511' },
      { label: 'News - 521', num: '521', speak: 'Change to channel 521' },
      { label: 'News - 524', num: '524', speak: 'Change to channel 524' },
      { label: 'Movies - 310', num: '310', speak: 'Change to channel 310' },
      { label: 'Tarak Mehta', num: '132', speak: 'Change to channel 132' },
      { label: 'Ramayan', num: '128', speak: 'Change to channel 128' },
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    items: [
      { label: 'Play old songs', sub: 'पुराने गाने', speak: 'Play old songs' },
      { label: 'Play comedy videos', sub: 'कॉमेडी वीडियो', speak: 'Play comedy videos' },
      { label: 'Play devotional music', sub: 'भजन', speak: 'Play devotional music' },
      { label: 'Play news clips', sub: 'न्यूज़ वीडियो', speak: 'Play news clips' },
      { label: 'Pause video', sub: 'वीडियो रोकें', speak: 'Pause video' },
      { label: 'Volume down', sub: 'आवाज़ कम', speak: 'Volume down' },
    ],
  },
  {
    id: 'alexa',
    name: 'Alexa',
    items: [
      { label: 'Om chanting', sub: 'ओम चैंटिंग', speak: 'Alexa play Om chanting' },
      { label: 'Hanuman Chalisa', sub: 'हनुमान चालीसा', speak: 'Alexa play Hanuman Chalisa' },
      { label: 'Kishore Kumar songs', sub: 'किशोर कुमार के गाने', speak: 'Alexa play Kishore Kumar songs' },
      { label: 'Bhajan playlist', sub: 'भजन', speak: 'Alexa play bhajan playlist' },
      { label: 'Stop music', sub: 'संगीत बंद', speak: 'Alexa stop music' },
      { label: 'Set volume low', sub: 'आवाज़ कम', speak: 'Alexa set volume low' },
    ],
  },
];

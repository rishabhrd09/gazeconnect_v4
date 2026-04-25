/**
 * GazeConnect Pro - Default Customization Data
 * =============================================
 * Comprehensive defaults that ship with the app for all users.
 * This serves as the initial data and the reset target.
 *
 * All content is bilingual (English + Hindi) and generalised
 * for ALS/MND patients. Users can customise via Settings.
 *
 * Sections:
 *   - People (9 default contacts)
 *   - Phrase Categories (7 categories, ~80 phrases)
 *   - Medical Sections (3 sections, 27 items)
 *   - Quick Words (3 categories, 7-8 words each)
 *   - Home Quick Actions (sidebar + footer)
 *   - Activity Categories (3 categories)
 *   - AAC Board (8 categories)
 *   - Feelings (20 items)
 *   - Basic Needs (24 items)
 *   - Settings
 */

import type { CustomizationData, Phrase } from '../types/customization';

/** Generate default phrases for a new person */
export function generateDefaultPhrases(name: string, nameHi: string): Phrase[] {
  return [
    { en: `Call ${name}`, hi: `${nameHi} को बुलाओ` },
    { en: `${name} come here`, hi: `${nameHi} यहाँ आओ` },
    { en: `Talk to ${name}`, hi: `${nameHi} से बात करो` },
    { en: `Where is ${name}`, hi: `${nameHi} कहाँ है` },
    { en: `${name} thank you`, hi: `${nameHi} धन्यवाद` },
  ];
}

export const DEFAULT_CUSTOMIZATION: CustomizationData = {
  // ============================================
  // PEOPLE (default contacts)
  // ============================================
  people: [
    {
      name: 'Bhawana', nameHi: 'Bhawana', role: 'Wife',
      phrases: [
        { en: 'Call Bhawana', hi: 'Bhawana को बुलाओ' },
        { en: 'Bhawana come here', hi: 'Bhawana यहाँ आओ' },
        { en: 'Talk to Bhawana', hi: 'Bhawana से बात करो' },
        { en: 'Where is Bhawana', hi: 'Bhawana कहाँ है' },
        { en: 'Bhawana thank you', hi: 'Bhawana धन्यवाद' },
      ],
    },
    {
      name: 'Parakh', nameHi: 'Parakh', role: 'Son',
      phrases: [
        { en: 'Call Parakh', hi: 'Parakh को बुलाओ' },
        { en: 'Parakh come here', hi: 'Parakh यहाँ आओ' },
        { en: 'Talk to Parakh', hi: 'Parakh से बात करो' },
        { en: 'Where is Parakh', hi: 'Parakh कहाँ है' },
        { en: 'Parakh thank you', hi: 'Parakh धन्यवाद' },
      ],
    },
    {
      name: 'Rishabh', nameHi: 'Rishabh', role: 'Son',
      phrases: [
        { en: 'Call Rishabh', hi: 'Rishabh को बुलाओ' },
        { en: 'Rishabh come here', hi: 'Rishabh यहाँ आओ' },
        { en: 'Talk to Rishabh', hi: 'Rishabh से बात करो' },
        { en: 'Where is Rishabh', hi: 'Rishabh कहाँ है' },
        { en: 'Rishabh thank you', hi: 'Rishabh धन्यवाद' },
      ],
    },
    {
      name: 'Nurse', nameHi: 'Nurse', role: 'Nurse',
      phrases: [
        { en: 'Call Nurse', hi: 'Nurse को बुलाओ' },
        { en: 'Nurse come here', hi: 'Nurse यहाँ आओ' },
        { en: 'Talk to Nurse', hi: 'Nurse से बात करो' },
        { en: 'Where is Nurse', hi: 'Nurse कहाँ है' },
        { en: 'Nurse thank you', hi: 'Nurse धन्यवाद' },
      ],
    },
    {
      name: 'Caretaker', nameHi: 'Caretaker', role: 'Son',
      phrases: [
        { en: 'Call Caretaker', hi: 'Caretaker को बुलाओ' },
        { en: 'Caretaker come here', hi: 'Caretaker यहाँ आओ' },
        { en: 'Talk to Caretaker', hi: 'Caretaker से बात करो' },
        { en: 'Where is Caretaker', hi: 'Caretaker कहाँ है' },
        { en: 'Caretaker thank you', hi: 'Caretaker धन्यवाद' },
      ],
    },
    {
      name: 'Nilesh', nameHi: 'Nilesh', role: 'Caretaker',
      phrases: [
        { en: 'Call Nilesh', hi: 'Nilesh को बुलाओ' },
        { en: 'Nilesh come here', hi: 'Nilesh यहाँ आओ' },
        { en: 'Talk to Nilesh', hi: 'Nilesh से बात करो' },
        { en: 'Where is Nilesh', hi: 'Nilesh कहाँ है' },
        { en: 'Nilesh thank you', hi: 'Nilesh धन्यवाद' },
      ],
    },
    {
      name: 'Rahul', nameHi: 'Rahul', role: 'Nurse',
      phrases: [
        { en: 'Call Rahul', hi: 'Rahul को बुलाओ' },
        { en: 'Rahul come here', hi: 'Rahul यहाँ आओ' },
        { en: 'Talk to Rahul', hi: 'Rahul से बात करो' },
        { en: 'Where is Rahul', hi: 'Rahul कहाँ है' },
        { en: 'Rahul thank you', hi: 'Rahul धन्यवाद' },
      ],
    },
    {
      name: 'Durgesh', nameHi: 'Durgesh', role: 'Nurse',
      phrases: [
        { en: 'Call Durgesh', hi: 'Durgesh को बुलाओ' },
        { en: 'Durgesh come here', hi: 'Durgesh यहाँ आओ' },
        { en: 'Talk to Durgesh', hi: 'Durgesh से बात करो' },
        { en: 'Where is Durgesh', hi: 'Durgesh कहाँ है' },
        { en: 'Durgesh thank you', hi: 'Durgesh धन्यवाद' },
      ],
    },
    {
      name: 'Doctor', nameHi: 'Doctor', role: 'Doctor',
      phrases: [
        { en: 'Call Doctor', hi: 'Doctor को बुलाओ' },
        { en: 'Doctor come here', hi: 'Doctor यहाँ आओ' },
        { en: 'Talk to Doctor', hi: 'Doctor से बात करो' },
        { en: 'Where is Doctor', hi: 'Doctor कहाँ है' },
        { en: 'Doctor thank you', hi: 'Doctor धन्यवाद' },
      ],
    },
  ],

  // ============================================
  // PHRASE CATEGORIES (7 consolidated categories)
  // ============================================
  phraseCategories: [
    // ── 1. Emergency & Medical ──
    {
      id: 'emergency', name: 'Emergency & Medical',
      phrases: [
        { en: 'I need help immediately', hi: 'मुझे तुरंत मदद चाहिए' },
        { en: 'I have pain', hi: 'मुझे दर्द है' },
        { en: 'I need suction', hi: 'मुझे सक्शन चाहिए' },
        { en: "I'm having trouble breathing", hi: 'मुझे सांस लेने में तकलीफ हो रही है' },
        { en: 'Check my vitals', hi: 'नब्ज़ देखो' },
        { en: 'I feel dizzy', hi: 'मुझे चक्कर आ रहा है' },
        { en: 'I need my medicine', hi: 'दवा दो' },
      ],
    },
    // ── 2. Position & Bed ──
    {
      id: 'position', name: 'Position & Bed',
      phrases: [
        { en: 'Turn me on my left side', hi: 'मुझे बाईं ओर घुमाओ' },
        { en: 'Turn me on my right side', hi: 'मुझे दाईं ओर घुमाओ' },
        { en: 'Raise my head', hi: 'मेरा सिर उठाओ' },
        { en: 'Lower my head', hi: 'मेरा सिर नीचे करो' },
        { en: 'I want to sit up', hi: 'मैं बैठना चाहता हूँ' },
        { en: 'I want to lie down', hi: 'मैं लेटना चाहता हूँ' },
        { en: 'Massage hands and legs', hi: 'हाथ-पैर मालिश करो' },
      ],
    },
    // ── 3. Daily Care & Comfort ──
    {
      id: 'daily_care', name: 'Daily Care & Comfort',
      phrases: [
        { en: 'I want water', hi: 'पानी दो' },
        { en: "I'm hungry", hi: 'भूख लगी है' },
        { en: 'I need to use the bathroom', hi: 'टॉयलेट जाना है' },
        { en: 'Turn on the fan', hi: 'पंखा चालू करो' },
        { en: 'Turn off the light', hi: 'बत्ती बंद करो' },
        { en: 'I want to sleep', hi: 'नींद आ रही है' },
        { en: 'Clean my face', hi: 'चेहरा साफ करो' },
      ],
    },
    // ── 4. Feelings & Emotions ──
    {
      id: 'feelings', name: 'Feelings & Emotions',
      phrases: [
        { en: 'I am happy', hi: 'मैं खुश हूँ' },
        { en: 'I am sad', hi: 'मैं दुखी हूँ' },
        { en: 'I am in pain', hi: 'मुझे दर्द है' },
        { en: 'I feel uncomfortable', hi: 'मुझे असहजता है' },
        { en: 'I am feeling better', hi: 'अब बेहतर है' },
        { en: 'I am anxious', hi: 'मुझे चिंता है' },
        { en: 'I am frustrated', hi: 'मैं निराश हूँ' },
        { en: 'I am bored', hi: 'मैं ऊब गया हूँ' },
        { en: 'I am grateful', hi: 'मैं आभारी हूँ' },
        { en: "I'm cold", hi: 'मुझे ठंड लग रही है' },
        { en: "I'm hot", hi: 'मुझे गर्मी लग रही है' },
        { en: "I'm tired", hi: 'मैं थक गया हूँ' },
        { en: 'I am okay', hi: 'मैं ठीक हूँ' },
        { en: 'I love you', hi: 'मैं तुमसे प्यार करता हूँ' },
        { en: 'I miss you', hi: 'मैं तुम्हें याद करता हूँ' },
        { en: 'Pray for me', hi: 'मेरे लिए प्रार्थना करो' },
        { en: 'I am scared', hi: 'मुझे डर लग रहा है' },
        { en: 'I feel lonely', hi: 'मुझे अकेलापन लग रहा है' },
      ],
    },
    // ── 5. Communication ──
    {
      id: 'communication', name: 'Communication',
      phrases: [
        { en: 'Yes', hi: 'हाँ' },
        { en: 'No', hi: 'नहीं' },
        { en: 'Wait a moment', hi: 'एक पल रुको' },
        { en: 'Let me think', hi: 'मुझे सोचने दो' },
        { en: "I don't understand", hi: 'समझ नहीं आया' },
        { en: 'Please repeat that', hi: 'कृपया दोहराएं' },
        { en: 'Thank you', hi: 'धन्यवाद' },
        { en: 'Sorry', hi: 'माफ़ी' },
      ],
    },
    // ── 6. People & Visitors ──
    {
      id: 'people', name: 'People & Visitors',
      phrases: [
        { en: 'Call Mummy', hi: 'मम्मी को बुलाओ' },
        { en: 'Call Rishabh', hi: 'ऋषभ को बुलाओ' },
        { en: 'Where is everyone?', hi: 'सब कहाँ हैं?' },
        { en: 'Who is there?', hi: 'वहाँ कौन है?' },
        { en: 'I want to see the family', hi: 'मैं परिवार से मिलना चाहता हूँ' },
        { en: 'Is the doctor coming?', hi: 'क्या डॉक्टर आ रहे हैं?' },
        { en: 'When is the nurse coming?', hi: 'नर्स कब आ रही है?' },
        { en: 'I want to video call', hi: 'मैं वीडियो कॉल करना चाहता हूँ' },
        { en: 'Who is at the door?', hi: 'दरवाज़े पर कौन है?' },
        { en: 'Let them in', hi: 'उन्हें अंदर आने दो' },
        { en: "I don't want visitors", hi: 'मुझे कोई नहीं चाहिए' },
        { en: 'Ask them to wait', hi: 'उनसे रुकने को कहो' },
      ],
    },
    // ── 7. Entertainment ──
    {
      id: 'entertainment', name: 'Entertainment',
      phrases: [
        { en: 'Turn on the TV', hi: 'टीवी चालू करो' },
        { en: 'Turn off the TV', hi: 'टीवी बंद करो' },
        { en: 'Change the channel', hi: 'चैनल बदलो' },
        { en: 'Play some music', hi: 'गाना लगाओ' },
        { en: 'Play old songs', hi: 'पुराने गाने लगाओ' },
        { en: 'Play devotional music', hi: 'भजन लगाओ' },
        { en: 'Volume up', hi: 'आवाज़ बढ़ाओ' },
        { en: 'Volume down', hi: 'आवाज़ कम करो' },
        { en: 'Read something to me', hi: 'मुझे कुछ पढ़कर सुनाओ' },
        { en: 'Play news channel', hi: 'न्यूज़ चैनल लगाओ' },
        { en: 'Stop the music', hi: 'गाना बंद करो' },
      ],
    },
  ],

  // ============================================
  // MEDICAL SECTIONS (from MedicalScreen)
  // ============================================
  medicalSections: [
    {
      id: 'urgent', title: 'URGENT', titleHi: 'इमरजेंसी',
      items: [
        { en: 'TT Suction needed now', hi: 'TT सक्शन अभी चाहिए', urgent: true },
        { en: 'Oral suction needed', hi: 'ओरल सक्शन चाहिए', urgent: true },
        { en: 'Breathing problem - Ambu bag', hi: 'सांस की तकलीफ', urgent: true },
        { en: 'I am in severe pain', hi: 'बहुत दर्द हो रहा है', urgent: true },
        { en: 'Check vitals - O2, Pulse', hi: 'विटल्स चेक करो', urgent: true },
        { en: 'Ventilator alarm - check', hi: 'वेंटिलेटर अलार्म', urgent: true },
        { en: 'Chest discomfort', hi: 'छाती में तकलीफ' },
        { en: 'Feeling cold / shivering', hi: 'ठंड / कंपकंपी' },
        { en: 'Panic / Anxiety', hi: 'घबराहट हो रही है' },
      ],
    },
    {
      id: 'bed', title: 'BED & POSITION', titleHi: 'बिस्तर / करवट',
      items: [
        { en: 'Adjust bed angle up', hi: 'बेड ऊपर करो' },
        { en: 'Adjust bed angle down', hi: 'बेड नीचे करो' },
        { en: 'Turn to Left Side', hi: 'बाईं करवट' },
        { en: 'Turn to Right Side', hi: 'दाईं करवट' },
        { en: 'Adjust Head / Neck', hi: 'सर ठीक करो' },
        { en: 'Adjust Legs', hi: 'पैर ठीक करो' },
        { en: 'Fix Pillow', hi: 'तकिया ठीक करो' },
        { en: 'Massage Hands/Legs', hi: 'मालिश करो' },
        { en: 'Back care needed', hi: 'बैक केयर' },
      ],
    },
    {
      id: 'daily', title: 'DAILY CARE', titleHi: 'रोज की देखभाल',
      items: [
        { en: 'I need Water', hi: 'पानी चाहिए' },
        { en: 'Clean Face / Eyes', hi: 'चेहरा साफ करो' },
        { en: 'Eye Drops', hi: 'आई ड्रॉप्स' },
        { en: 'Lip Balm', hi: 'लिप बाम' },
        { en: 'Toilet / Urine Pot', hi: 'टॉयलेट / पॉट' },
        { en: 'Remove Urine Pot', hi: 'पॉट हटाओ' },
        { en: 'Adjust Fan / AC', hi: 'पंखा / AC' },
        { en: 'Lights On/Off', hi: 'लाइट्स' },
        { en: 'Open/Close Curtains', hi: 'पर्दे' },
      ],
    },
  ],

  // ============================================
  // QUICK WORDS (3 categories — expanded to 7-8 each)
  // ============================================
  quickWords: {
    enabled: true,
    highColor: 'muted_maroon',
    mediumColor: 'warm_teal',
    coreWords: [
      { en: 'Yes', hi: 'हाँ', enabled: true },
      { en: 'No', hi: 'नहीं', enabled: true },
      { en: 'Help', hi: 'मदद', enabled: true },
      { en: 'Stop', hi: 'रुको', enabled: true },
      { en: 'More', hi: 'और', enabled: true },
      { en: 'Want', hi: 'चाहिए', enabled: true },
      { en: 'Pain', hi: 'दर्द', enabled: true },
      { en: 'Water', hi: 'पानी', enabled: true },
    ],
    categories: [
      {
        id: 'emergency', heading: 'Emergency', headingHi: 'आपातकालीन', color: '#EF4444',
        words: [
          { en: 'TT Suction', hi: 'TT सक्शन', enabled: true, priority: 'high' },
          { en: 'Ambu bag', hi: 'अंबू बैग', enabled: true, priority: 'high' },
          { en: 'Oral Suction', hi: 'ओरल सक्शन', enabled: true, priority: 'high' },
          { en: 'Breathing Discomfort', hi: 'सांस की तकलीफ', enabled: true, priority: 'high' },
          { en: 'Check O₂', hi: 'ऑक्सीजन', enabled: true, priority: 'medium' },
          { en: 'Severe Pain', hi: 'बहुत दर्द', enabled: true, priority: 'high' },
          { en: 'Help Now', hi: 'अभी मदद', enabled: true, priority: 'high' },
        ],
      },
      {
        id: 'position', heading: 'Position Change', headingHi: 'पोजीशन', color: '#4B8BDB',
        words: [
          { en: 'Turn Left', hi: 'बाईं करवट', enabled: true, priority: 'medium' },
          { en: 'Turn Right', hi: 'दाईं करवट', enabled: true, priority: 'medium' },
          { en: 'Head Up', hi: 'सर ऊपर', enabled: true, priority: 'medium' },
          { en: 'Head Down', hi: 'सर नीचे', enabled: true, priority: 'medium' },
          { en: 'Adjust Hands', hi: 'हाथ-पैर ठीक करो', enabled: true, priority: 'medium' },
          { en: 'Adjust Legs', hi: 'पैर ठीक करो', enabled: true, priority: 'medium' },
          { en: 'Adjust pillows', hi: 'तकिया ठीक करो', enabled: true, priority: 'medium' },
          { en: 'Adjust neck support', hi: 'गर्दन ठीक करो', enabled: true, priority: 'medium' },
        ],
      },
      {
        id: 'daily', heading: 'Daily Care', headingHi: 'रोज़', color: '#4CAF7D',
        words: [
          { en: 'Water', hi: 'पानी', enabled: true, priority: 'medium' },
          { en: 'Blanket / Shawl', hi: 'कंबल / शॉल', enabled: true, priority: 'medium' },
          { en: 'Fan', hi: 'पंखा', enabled: true, priority: 'medium' },
          { en: 'AC', hi: 'AC', enabled: true, priority: 'medium' },
          { en: 'TV', hi: 'TV', enabled: true, priority: 'medium' },
          { en: 'Alexa', hi: 'अलेक्सा', enabled: true, priority: 'medium' },
          { en: 'Fever', hi: 'बुखार', enabled: true, priority: 'medium' },
          { en: 'Pain', hi: 'दर्द', enabled: true, priority: 'medium' },
        ],
      },
    ],
  },

  // ============================================
  // HOME QUICK ACTIONS (from HomeScreen)
  // ============================================
  homeQuickActions: {
    leftSidebar: [
      { label: 'TT Suction' },
      { label: 'Ambu bag' },
      { label: 'Oral Suction' },
      { label: 'Breathing Discomfort' },
      { label: 'Check O2' },
    ],
    rightSidebar: [],
    footerActions: [
      { label: 'Family' },
      { label: 'Nurse' },
    ],
  },

  // ============================================
  // HOME EMERGENCY CARDS (independent from Quick Words)
  // ============================================
  homeEmergencyCards: [
    { en: 'TT Suction', hi: 'TT सक्शन', enabled: true, priority: 'high' },
    { en: 'Ambu bag', hi: 'अंबू बैग', enabled: true, priority: 'high' },
    { en: 'Oral Suction', hi: 'ओरल सक्शन', enabled: true, priority: 'high' },
    { en: 'Breathing Discomfort', hi: 'सांस की तकलीफ', enabled: true, priority: 'high' },
  ],

  // ============================================
  // ACTIVITY CATEGORIES (from ActivitiesScreen)
  // ============================================
  activityCategories: [
    {
      id: 'tv', name: 'TV Channels',
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
      id: 'youtube', name: 'YouTube',
      items: [
        { label: 'Play old songs', sub: 'पुराने गाने', speak: 'Play old songs' },
        { label: 'Play comedy videos', sub: 'कॉमेडी वीडियो', speak: 'Play comedy videos' },
        { label: 'Play devotional music', sub: 'भजन', speak: 'Play devotional music' },
      ],
    },
    {
      id: 'alexa', name: 'Alexa',
      items: [
        { label: 'Om chanting', sub: 'ओम चैंटिंग', speak: 'Alexa play Om chanting' },
        { label: 'Hanuman Chalisa', sub: 'हनुमान चालीसा', speak: 'Alexa play Hanuman Chalisa' },
        { label: 'Kishore Kumar songs', sub: 'किशोर कुमार के गाने', speak: 'Alexa play Kishore Kumar songs' },
      ],
    },
  ],

  // ============================================
  // AAC BOARD CATEGORIES (simplified single-word interface)
  // ============================================
  aacCategories: [
    {
      id: 'family', name: 'FAMILY & PEOPLE', nameHi: 'परिवार', colorKey: 'people',
      items: [
        { en: 'Rishabh', hi: 'ऋषभ' }, { en: 'Mummy', hi: 'मम्मी' },
        { en: 'Nurse', hi: 'नर्स' }, { en: 'Doctor', hi: 'डॉक्टर' },
        { en: 'Caretaker', hi: 'केयरटेकर' },
      ],
    },
    {
      id: 'emergency', name: 'EMERGENCY', nameHi: 'आपातकाल', colorKey: 'medical',
      items: [
        { en: 'Help', hi: 'मदद' }, { en: 'Pain', hi: 'दर्द' },
        { en: 'Suction', hi: 'सक्शन' }, { en: 'Medicine', hi: 'दवाई' },
        { en: 'Breathing Problem', hi: 'सांस की तकलीफ' },
        { en: 'Emergency', hi: 'आपातकाल' },
      ],
    },
    {
      id: 'basic_needs', name: 'BASIC NEEDS', nameHi: 'ज़रूरतें', colorKey: 'needs',
      items: [
        { en: 'Water', hi: 'पानी' }, { en: 'Bathroom', hi: 'बाथरूम' },
        { en: 'Position', hi: 'पोज़ीशन' }, { en: 'Hot', hi: 'गर्मी' },
        { en: 'Cold', hi: 'ठंड' }, { en: 'Diet/Food', hi: 'खाना' },
      ],
    },
    {
      id: 'responses', name: 'RESPONSES', nameHi: 'जवाब', colorKey: 'responses',
      items: [
        { en: 'Yes', hi: 'हाँ' }, { en: 'No', hi: 'नहीं' },
        { en: 'Maybe', hi: 'शायद' }, { en: 'OK', hi: 'ठीक' },
        { en: 'Wait', hi: 'रुको' },
      ],
    },
    {
      id: 'courtesy', name: 'COURTESY', nameHi: 'शिष्टाचार', colorKey: 'courtesy',
      items: [
        { en: 'Please', hi: 'कृपया' }, { en: 'Thank you', hi: 'धन्यवाद' },
        { en: 'Sorry', hi: 'माफ़ी' }, { en: 'Excuse me', hi: 'सुनिए' },
      ],
    },
    {
      id: 'feelings', name: 'FEELINGS', nameHi: 'भावनाएं', colorKey: 'feelings',
      items: [
        { en: 'Happy', hi: 'खुश' }, { en: 'Sad', hi: 'दुखी' },
        { en: 'Tired', hi: 'थका' }, { en: 'Uncomfortable', hi: 'असहज' },
        { en: 'Scared', hi: 'डर' }, { en: 'Lonely', hi: 'अकेला' },
      ],
    },
    {
      id: 'actions', name: 'ACTIONS', nameHi: 'क्रियाएं', colorKey: 'actions',
      items: [
        { en: 'Turn on TV', hi: 'टीवी चालू करो' },
        { en: 'Adjust Bed', hi: 'बेड ठीक करो' },
        { en: 'Fan Speed', hi: 'पंखे की स्पीड' },
        { en: 'AC Temperature', hi: 'AC तापमान' },
        { en: 'Light On/Off', hi: 'लाइट' },
      ],
    },
    {
      id: 'activities', name: 'ACTIVITIES', nameHi: 'गतिविधि', colorKey: 'activities',
      items: [
        { en: 'TV', hi: 'टीवी' }, { en: 'Music', hi: 'संगीत' },
        { en: 'Now', hi: 'अभी' }, { en: 'Later', hi: 'बाद में' },
      ],
    },
  ],

  // ============================================
  // FEELINGS (expanded — 20 items)
  // ============================================
  feelings: [
    { en: 'I am happy', hi: 'मैं खुश हूँ' },
    { en: 'I am sad', hi: 'मैं दुखी हूँ' },
    { en: 'I am tired', hi: 'मैं थक गया हूँ' },
    { en: 'I am in pain', hi: 'मुझे दर्द है' },
    { en: 'I feel uncomfortable', hi: 'मुझे असहजता है' },
    { en: 'I am feeling better', hi: 'अब बेहतर है' },
    { en: 'I am anxious', hi: 'मुझे चिंता है' },
    { en: 'I am frustrated', hi: 'मैं निराश हूँ' },
    { en: 'I am bored', hi: 'मैं ऊब गया हूँ' },
    { en: 'I am grateful', hi: 'मैं आभारी हूँ' },
    { en: 'I am cold', hi: 'मुझे ठंड लग रही है' },
    { en: 'I am hot', hi: 'मुझे गर्मी लग रही है' },
    { en: 'I am hungry', hi: 'भूख लगी है' },
    { en: 'I am thirsty', hi: 'मुझे प्यास लगी है' },
    { en: 'I need rest', hi: 'मुझे आराम चाहिए' },
    { en: 'I am okay', hi: 'मैं ठीक हूँ' },
    { en: 'I love you', hi: 'मैं तुमसे प्यार करता हूँ' },
    { en: 'I miss you', hi: 'मैं तुम्हें याद करता हूँ' },
    { en: 'I am scared', hi: 'मुझे डर लग रहा है' },
    { en: 'I feel lonely', hi: 'मुझे अकेलापन लग रहा है' },
  ],

  // ============================================
  // BASIC NEEDS (expanded — 24 items)
  // ============================================
  basicNeeds: [
    { en: 'I need water', hi: 'पानी चाहिए' },
    { en: 'I need food', hi: 'खाना चाहिए' },
    { en: 'I need bathroom', hi: 'बाथरूम जाना है' },
    { en: 'Urine pot', hi: 'यूरिन पॉट' },
    { en: 'Remove urine pot', hi: 'यूरिन पॉट हटाओ' },
    { en: 'I am cold', hi: 'ठंड लग रही है' },
    { en: 'I am hot', hi: 'गर्मी लग रही है' },
    { en: 'Need blanket', hi: 'कंबल चाहिए' },
    { en: 'Adjust pillow', hi: 'तकिया ठीक करो' },
    { en: 'Change position', hi: 'करवट बदलो' },
    { en: 'Adjust bed up', hi: 'बेड ऊपर करो' },
    { en: 'Adjust bed down', hi: 'बेड नीचे करो' },
    { en: 'Adjust fan speed', hi: 'पंखे की स्पीड' },
    { en: 'Adjust AC', hi: 'AC तापमान' },
    { en: 'Close window', hi: 'खिड़की बंद करो' },
    { en: 'Lip balm', hi: 'लिप बाम' },
    { en: 'Eye drops', hi: 'आई ड्रॉप्स' },
    { en: 'Head massage', hi: 'सिर की मालिश' },
    { en: 'Clean face', hi: 'चेहरा साफ करो' },
    { en: 'Shawl please', hi: 'शॉल चाहिए' },
    { en: 'Scratch my nose', hi: 'नाक खुजाओ' },
    { en: 'Wipe my face', hi: 'मुंह पोंछो' },
    { en: 'Mosquito', hi: 'मच्छर' },
    { en: 'Itching', hi: 'खुजली हो रही है' },
  ],

  // ============================================
  // SETTINGS
  // ============================================
  settings: {
    isDarkMode: true,
    showHindi: false,
    dwellTime: 900,
    filterPreset: 'normal',
    gazeOnNavigate: 'smart-pause',
    ttsRate: 1.0,
    ttsVolume: 0.25,
    breakReminderInterval: 20,
    emergencyDwellTime: 1200,
    ttsLanguage: 'english',
    gazeCursorSize: 'medium',
    soundEffects: true,
    userName: 'Papa',
    emergencyPhraseEn: 'I need help immediately! This is an emergency!',
    emergencyPhraseHi: 'मुझे तुरंत मदद चाहिए! यह एक आपातकालीन स्थिति है!',
    gazeOffsetX: 0,
    gazeOffsetY: 0,
    gazeDebugOverlay: false,
    homeEmergencyLaunchMode: 'cards',
  },

  // ============================================
  // ALERT MODE CARDS (AlertModeScreen — 5 customizable)
  // ============================================
  alertModeCards: [
    { label: 'TT Suction', enabled: true },
    { label: 'Oral Suction', enabled: true },
    { label: 'Position Change', enabled: true },
    { label: 'Pain', enabled: true },
    { label: 'Ambu Bag', enabled: true },
  ],

  version: 1,
};

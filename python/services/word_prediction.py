"""
GazeConnect Pro - Enhanced Word Prediction Engine v2
=====================================================
Improvements over v1:
- 3000+ word vocabulary (was ~200)
- Patient chat history vocabulary (Tobii_Papa)
- Min 3-letter word filter
- Max 5 predictions displayed
- Better n-gram training with richer corpus
- Context-aware scoring with bigram/trigram priority
- Frequency-ranked common English vocabulary
- Medical/ALS-specific terms
- App screen vocabulary (activities, people, medical, feelings)
- Smarter prefix matching with edit-distance fallback
"""

import re
import json
import time
import math
from datetime import datetime
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Set
from pathlib import Path

from prediction_guardrails import (
    is_blocked_prediction_word,
    is_valid_prediction_token,
    normalize_prediction_word,
)

# ===========================================================================
# MINIMUM WORD LENGTH — only predict words with 3+ characters
# ===========================================================================
MIN_WORD_LENGTH = 3

# ===========================================================================
# CORE VOCABULARY — Top 500 most frequent English words (3+ letters)
# Research: 250 core words = 78-85% of all speech
# ===========================================================================

CORE_VOCABULARY = {
    # ---------- Pronouns & Determiners ----------
    'you', 'she', 'him', 'her', 'its', 'our', 'them',
    'his', 'they', 'this', 'that', 'these', 'those',
    'who', 'what', 'which', 'where', 'when', 'why', 'how',
    'the', 'and', 'for', 'are', 'but', 'not', 'with', 'has', 'was',
    'all', 'any', 'can', 'had', 'may', 'did', 'get', 'let',
    'say', 'she', 'too', 'use', 'way', 'own', 'boy', 'old',
    'also', 'just', 'than', 'them', 'very', 'when', 'come', 'make',
    'like', 'long', 'look', 'many', 'some', 'time', 'been', 'will',
    'each', 'have', 'more', 'your', 'into', 'from', 'here', 'know',
    'mine', 'yours', 'ours', 'theirs', 'myself', 'yourself',

    # ---------- Common Verbs ----------
    'are', 'was', 'were', 'been', 'being',
    'have', 'has', 'had', 'does', 'did', 'will', 'would', 'could',
    'should', 'might', 'must', 'can', 'shall',
    'going', 'went', 'gone', 'come', 'came', 'coming',
    'get', 'got', 'getting', 'make', 'made', 'making',
    'take', 'took', 'taken', 'taking',
    'see', 'saw', 'seen', 'seeing',
    'know', 'knew', 'known', 'knowing',
    'want', 'wanted', 'wanting',
    'need', 'needed', 'needing',
    'like', 'liked', 'liking',
    'love', 'loved', 'loving',
    'help', 'helped', 'helping',
    'think', 'thought', 'thinking',
    'feel', 'felt', 'feeling',
    'say', 'said', 'saying',
    'tell', 'told', 'telling',
    'give', 'gave', 'given', 'giving',
    'find', 'found', 'finding',
    'put', 'putting',
    'ask', 'asked', 'asking',
    'try', 'tried', 'trying',
    'call', 'called', 'calling',
    'keep', 'kept', 'keeping',
    'let', 'start', 'started', 'starting',
    'stop', 'stopped', 'stopping',
    'turn', 'turned', 'turning',
    'open', 'opened', 'opening',
    'close', 'closed', 'closing',
    'move', 'moved', 'moving',
    'run', 'running', 'play', 'playing', 'played',
    'work', 'worked', 'working',
    'live', 'lived', 'living',
    'believe', 'bring', 'brought', 'happen', 'happened',
    'hear', 'heard', 'leave', 'left', 'read', 'seem', 'show',
    'showed', 'stand', 'stood', 'understand', 'understood',
    'learn', 'change', 'changed', 'follow', 'watch', 'watched',
    'remember', 'speak', 'speaking', 'sit', 'sitting',
    'eat', 'eating', 'drink', 'drinking', 'sleep', 'sleeping',
    'wait', 'waiting', 'send', 'sent', 'stay', 'stayed',
    'check', 'checked', 'raise', 'raised',

    # ---------- Adjectives ----------
    'good', 'bad', 'new', 'old', 'big', 'small', 'little',
    'great', 'long', 'short', 'high', 'low', 'young',
    'right', 'wrong', 'same', 'different', 'important',
    'large', 'next', 'early', 'late', 'hard', 'easy',
    'possible', 'better', 'best', 'happy', 'ready',
    'sure', 'nice', 'fine', 'real', 'clear', 'free',
    'full', 'special', 'enough', 'able', 'available',
    'whole', 'strong', 'beautiful', 'wonderful', 'comfortable',
    'uncomfortable', 'tired', 'hungry', 'thirsty', 'sick',
    'warm', 'cold', 'hot', 'cool', 'safe', 'sorry',
    'worried', 'scared', 'frustrated', 'bored', 'excited',
    'careful', 'quiet', 'loud', 'dark', 'clean', 'dirty',

    # ---------- Adverbs ----------
    'very', 'really', 'also', 'just', 'only', 'too',
    'much', 'more', 'well', 'still', 'already', 'always',
    'never', 'often', 'sometimes', 'usually', 'again',
    'here', 'there', 'now', 'then', 'today', 'tomorrow',
    'yesterday', 'soon', 'later', 'please', 'maybe',
    'probably', 'actually', 'quickly', 'slowly', 'finally',
    'together', 'away', 'back', 'enough', 'else',

    # ---------- Prepositions & Conjunctions ----------
    'about', 'after', 'before', 'between', 'during', 'through',
    'without', 'around', 'against', 'along', 'until',
    'because', 'since', 'while', 'although', 'however',
    'instead', 'also', 'either', 'neither',

    # ---------- Nouns: Time ----------
    'time', 'day', 'night', 'morning', 'afternoon', 'evening',
    'week', 'month', 'year', 'today', 'tomorrow', 'yesterday',
    'minute', 'hour', 'second', 'moment', 'monday', 'tuesday',
    'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'june', 'july',
    'august', 'september', 'october', 'november', 'december',

    # ---------- Nouns: People ----------
    'people', 'person', 'man', 'woman', 'child', 'children',
    'family', 'friend', 'friends', 'mother', 'father',
    'mom', 'dad', 'mummy', 'papa', 'brother', 'sister',
    'son', 'daughter', 'husband', 'wife', 'baby',
    'doctor', 'nurse', 'helper', 'caregiver', 'staff',
    'patient', 'everyone', 'someone', 'anyone', 'nobody',
    'sir', 'madam', 'uncle', 'aunt', 'nephew', 'cousin',
    'neighbor', 'guest', 'visitor',

    # ---------- Nouns: Places & Things ----------
    'thing', 'something', 'nothing', 'everything', 'anything',
    'water', 'food', 'bed', 'chair', 'room', 'house', 'home',
    'door', 'window', 'phone', 'television', 'light', 'fan',
    'medicine', 'pillow', 'blanket', 'table', 'floor',
    'bathroom', 'kitchen', 'hospital', 'market', 'school',
    'office', 'place', 'world', 'country', 'city',
    'car', 'money', 'book', 'paper', 'letter',
    'news', 'music', 'movie', 'picture', 'photo',
    'clothes', 'shoes', 'bag', 'key', 'glass',

    # ---------- Body & Health ----------
    'body', 'head', 'eye', 'eyes', 'hand', 'hands', 'arm', 'arms',
    'leg', 'legs', 'back', 'neck', 'face', 'mouth', 'nose',
    'ear', 'ears', 'chest', 'stomach', 'shoulder', 'knee',
    'foot', 'feet', 'finger', 'skin', 'throat', 'tongue',
    'pain', 'hurt', 'ache', 'fever', 'cough', 'cold',
    'breath', 'breathing', 'blood', 'pressure', 'pulse',
    'swallow', 'saliva', 'suction', 'oxygen', 'medicine',
    'tablet', 'injection', 'treatment', 'therapy',
    'exercise', 'position', 'posture', 'rest', 'sleep',

    # ---------- Food & Drink ----------
    'breakfast', 'lunch', 'dinner', 'meal', 'snack',
    'tea', 'coffee', 'milk', 'juice', 'soup',
    'rice', 'bread', 'fruit', 'vegetable',
    'sweet', 'sugar', 'salt', 'oil', 'butter',

    # ---------- Actions & States ----------
    'yes', 'okay', 'hello', 'goodbye', 'bye',
    'thanks', 'thank', 'welcome', 'please', 'sorry',
    'problem', 'question', 'answer', 'idea', 'plan',
    'need', 'want', 'wish', 'hope', 'worry',
    'name', 'number', 'part', 'side', 'point',
    'end', 'life', 'story', 'case', 'reason',

    # ---------- Common Phrases Starters ----------
    'can', 'could', 'would', 'should', 'will', 'shall',
    'may', 'might', 'must', 'let', 'please',
}

# ===========================================================================
# MEDICAL / ALS VOCABULARY — domain-specific terms
# ===========================================================================
MEDICAL_VOCABULARY = {
    # ALS-specific
    'als', 'mnd', 'motor', 'neuron', 'disease',
    'weakness', 'muscle', 'muscles', 'spasm',
    'bulbar', 'respiratory',
    'ventilator', 'bipap', 'tracheostomy', 'feeding', 'tube',
    'gastrostomy', 'peg', 'nebulizer', 'nebulization',

    # Care terms
    'suction', 'suctioning', 'ambu', 'oxygen', 'saturation',
    'catheter', 'drainage', 'dressing', 'bandage', 'wound',
    'physiotherapy', 'occupational', 'speech', 'therapy',
    'rehabilitation',

    # Symptoms
    'pain', 'numbness', 'tingling', 'cramp', 'spasticity',
    'fatigue', 'exhaustion', 'insomnia', 'anxiety',
    'dysphagia', 'dysarthria', 'drooling', 'choking',
    'nausea',
    'swelling', 'inflammation', 'infection', 'allergy',
    'dizziness', 'headache', 'backache', 'stiffness',
    'itching', 'rash', 'bleeding', 'bruise',

    # Body positions
    'supine', 'prone', 'lateral', 'upright', 'reclined',
    'elevated', 'lowered', 'supported', 'cushion',

    # Medication
    'medication', 'prescription', 'dosage', 'dose',
    'tablet', 'capsule', 'syrup', 'inhaler', 'cream',
    'antibiotic', 'painkiller', 'laxative', 'antacid',
    'glycolate', 'glycopyrrolate', 'riluzole',

    # Vitals
    'temperature', 'blood', 'pressure', 'pulse', 'heart',
    'rate', 'sugar', 'glucose', 'cholesterol', 'weight',

    # Equipment
    'wheelchair', 'walker', 'bed', 'mattress', 'rail',
    'call', 'bell', 'monitor', 'pump', 'machine',
    'battery', 'charger', 'remote', 'switch',

    # Medical equipment (expanded)
    'percussion', 'ointment', 'secretion', 'supplement',
    'glycopyrolate', 'postural',

    # Body position words (expanded)
    'elevate', 'recline', 'tilt', 'straighten',
    'support', 'roll', 'angle', 'slide',

    # Daily care (expanded)
    'sponging', 'brushing', 'combing', 'feeding',
    'schedule', 'routine', 'alarm', 'alert', 'duty',

    # Food texture (critical for ALS swallowing)
    'blend', 'smooth', 'liquid', 'semi', 'puree',
    'thicken', 'swallow', 'chew', 'portion', 'reheat',

    # Family/social (expanded)
    'grandchildren', 'blessings', 'anniversary', 'birthday', 'paperwork',
    'insurance', 'property', 'transfer', 'appointment', 'regards',
}

# ===========================================================================
# PATIENT CHAT HISTORY VOCABULARY — extracted from Tobii_Papa pages
# Real words this patient actually uses (weighted higher)
# ===========================================================================
PATIENT_VOCABULARY = {
    # ---- People: Family & Close ----
    'mummy', 'papa', 'rishabh', 'parakh', 'bhawana', 'paribhav',
    'pari', 'nilesh', 'akhil', 'anand', 'rahul', 'chetan',

    # ---- People: Caregivers & Medical ----
    'durgesh', 'rajesh', 'sharma', 'girish', 'shukla', 'shuklaji',
    'jatav', 'karan', 'vishnu', 'vishnuji', 'pinakin', 'salman',
    'raghav', 'daddu', 'pintoo', 'ani',

    # ---- People: Roles ----
    'staff', 'caretaker', 'caregiver', 'trainer', 'nurse', 'doctor',
    'guest', 'guests', 'visitors', 'visitor', 'helper',

    # ---- Medical: TT & Suction (highest priority) ----
    'suction', 'suctioning', 'oral', 'saliva', 'sliva',
    'ambu', 'nebulization', 'nebulizatin',
    'glycolate', 'glycopyrrolate', 'glct', 'nityam',

    # ---- Medical: Respiratory & Vitals ----
    'breathing', 'respiratory', 'ventilator', 'oxygen', 'saturation',
    'blood', 'pressure', 'vitals', 'pulse', 'temperature',
    'cough', 'choking', 'swallowing',

    # ---- Medical: Care & Treatment ----
    'dressing', 'sponging', 'massage', 'exercise', 'exercises',
    'treatment', 'medicine', 'medicines', 'injection', 'therapy',
    'physiotherapy', 'back', 'care', 'motion', 'karvat',

    # ---- Medical: TT specific ----
    'tracheostomy', 'management', 'settings', 'bleeding',
    'comfortable', 'uncomfortable', 'discomfort',

    # ---- Body & Symptoms ----
    'sliding', 'itching', 'etching', 'injury', 'swelling',
    'pain', 'severe', 'panic', 'anxiety', 'shivering',
    'neck', 'ears', 'mouth', 'tongue', 'chest', 'body',
    'legs', 'hands', 'arms', 'head', 'knee',

    # ---- Daily Life: Food & Drink ----
    'tea', 'black', 'masala', 'desi', 'diet', 'diets',
    'food', 'water', 'milk', 'breakfast', 'lunch', 'dinner',
    'meals', 'snack', 'warm',

    # ---- Daily Life: Routine ----
    'morning', 'evening', 'night', 'today', 'tomorrow',
    'sleeping', 'rest', 'position', 'pillow', 'blanket',
    'bath', 'lotion', 'oil', 'shampoo',

    # ---- Activities & Interests ----
    'music', 'songs', 'movie', 'news', 'channel',
    'laptop', 'phone', 'television', 'synthesizer',
    'cricket', 'weather', 'videos', 'comedy', 'devotional',

    # ---- Property & Planning ----
    'plot', 'house', 'ghar', 'construction', 'bahu',
    'disposal', 'location', 'facing', 'planning',
    'tirumala', 'bombay', 'hospital',

    # ---- Emotional & Social ----
    'happy', 'worried', 'hopeful', 'improving', 'fine',
    'love', 'miss', 'family', 'friends',
    'birthday', 'diwali', 'deepawali', 'deewali', 'festival',
    'congratulations', 'welcome', 'goodbye', 'goodnight',
    'dreams', 'passion', 'focused', 'loyal', 'calm',

    # ---- Common Phrases Patient Uses ----
    'please', 'looking', 'ahead', 'enough', 'discuss',
    'update', 'progress', 'decide', 'check', 'arrange',
    'prepare', 'remind', 'tell', 'show', 'call',
    'daily', 'weekly', 'regularly', 'properly',
    'quickly', 'immediately', 'carefully', 'gently',

    # ---- Caregiver Instructions ----
    'clean', 'wash', 'apply', 'change', 'adjust',
    'cover', 'support', 'turn', 'raise', 'lower',
    'bring', 'take', 'give', 'put', 'remove',
    'start', 'stop', 'continue', 'avoid', 'delegate',
    'train', 'respect', 'behave', 'work', 'handle',
    'stay', 'learn', 'tolerate', 'order',

    # ---- Misc from chat history ----
    'enough', 'lafada', 'badhai', 'photo', 'saree',
    'shirt', 'gift', 'exchange', 'offer', 'available',
    'confirm', 'parallel', 'opportunity', 'professional',
    'system', 'technical', 'effective', 'results',

    # ---- Added by User ----
    'bhilat', 'baba', 'nityam', 'sharma', 'nilesh', 'ani', 'pari', 'paribhav',
    'sky', 'park', 'tirumala', 'hundai', 'exter', 'tata', 'suv', 'voxwagan',
    'maruti', 'arena', 'rgpv', 'synthesire', 'durgesh', 'pinakin', 'vishnuji',
    'karvat', 'sponging', 'dressing',
    'plot', 'plan', 'play', 'plus', 'part', 'past', 'port', 'post', 'pure',
    'push', 'pull', 'pick', 'pack', 'path', 'pass',
}

# ===========================================================================
# NATIVE HINDI VOCABULARY — Devanagari terms for Hindi Users
# ===========================================================================
HINDI_VOCABULARY = {
    # ── Existing core words ──
    'नमस्ते', 'धन्यवाद', 'मदद', 'चाहिए', 'पानी', 'खाना', 'दर्द', 'सांस', 'थकान', 'सुखद', 'तकलीफ',
    'मुझे', 'मेरा', 'तुम्हारा', 'उनका', 'हमारा', 'आप', 'तुम', 'वह', 'यह', 'कौन', 'क्या', 'कहाँ', 'कब', 'कैसे', 'क्यों',
    'हाँ', 'नहीं', 'शायद', 'ठीक', 'अच्छा', 'बुरा', 'जल्दी', 'धीरे', 'बहुत', 'कम', 'ज़्यादा',
    'आज', 'कल', 'अभी', 'बाद', 'सुबह', 'शाम', 'रात', 'दिन', 'समय', 'घंटा', 'मिनट',
    'माँ', 'पापा', 'भाई', 'बहन', 'बेटा', 'बेटी', 'दोस्त', 'डॉक्टर', 'नर्स', 'परिवार',
    'टीवी', 'गाना', 'फिल्म', 'समाचार', 'किताब', 'चश्मा', 'फोन', 'लाइट', 'पंखा', 'बिस्तर', 'कुर्सी',
    'करो', 'जाओ', 'आओ', 'बैठो', 'सो', 'खा', 'पी', 'देख', 'सुन', 'बोल', 'रुक', 'चल',
    # ALS/Care specific
    'सक्शन', 'करवट', 'दवा', 'गोली', 'नेबुलाइज़र', 'ऑक्सीजन', 'बुखार', 'खांसी', 'कफ', 'लार', 'सोना',
    'खुजली', 'पेशाब', 'शौच', 'सिरदर्द', 'पेटदर्द', 'गला', 'सूजन', 'बेचैनी', 'गर्मी', 'सर्दी', 'ठंड', 'पसीना',
    'तकिया', 'कंबल', 'मसाज', 'व्यायाम', 'आराम', 'पोजीशन', 'बदलो', 'ऊपर', 'नीचे', 'दाएं', 'बाएं', 'सीधा',
    'भगवान', 'हनुमान', 'राम', 'कृष्णा', 'शिव', 'मंदिर', 'पूजा', 'भजन', 'आरती', 'प्रसाद',
    'इंदौर', 'भोपाल', 'उज्जैन', 'अस्पताल', 'घर',
    'कृपया', 'माफ़', 'करना', 'लगेगा', 'चाहता', 'रहा', 'रही', 'रहे', 'गया', 'गई', 'गए', 'होगा', 'होगी', 'होंगे',

    # ── Medical/Care (expanded) ──
    'वेंटिलेटर', 'बीपी', 'तापमान', 'एम्बुलेंस', 'दवाई', 'इंजेक्शन',
    'छाती', 'पेट', 'कमर', 'गर्दन', 'कंधा', 'घुटना', 'एड़ी', 'उंगली', 'जीभ',
    'होंठ', 'दांत', 'कान', 'नाक', 'माथा',
    'फिजियोथेरेपी', 'मालिश', 'स्पंजिंग', 'सफाई', 'पट्टी', 'क्रीम', 'लोशन', 'तेल', 'साबुन',

    # ── Family/People (expanded) ──
    'मम्मी', 'भैया', 'दीदी', 'पत्नी', 'पति', 'दादी', 'दादा',
    'नानी', 'नाना', 'मामा', 'मामी', 'चाचा', 'चाची', 'भाभी',
    'स्टाफ', 'केयरटेकर', 'मेहमान', 'पड़ोसी', 'रिश्तेदार', 'बच्चे',

    # ── Food/Drink (expanded) ──
    'चाय', 'दूध', 'जूस', 'लस्सी', 'रोटी', 'चावल', 'दाल', 'सब्जी', 'खिचड़ी',
    'दलिया', 'हलवा', 'बिस्किट', 'फल', 'केला', 'सेब', 'संतरा', 'अंडा', 'दही', 'घी',
    'मक्खन', 'शक्कर', 'नमक', 'मिर्च', 'हल्दी', 'सूप', 'खीर', 'पराठा', 'पूरी', 'इडली',

    # ── Actions/Verbs (expanded) ──
    'दीजिए', 'देना', 'लाना', 'हटाओ', 'रखो',
    'उठाओ', 'बैठाओ', 'सुलाओ', 'जगाओ', 'खिलाओ',
    'पिलाओ', 'सुनो', 'देखो', 'बोलो', 'पढ़ो',
    'लिखो', 'भेजो', 'बुलाओ', 'बताओ', 'समझाओ',
    'चालू', 'बंद', 'खोलो', 'धोओ', 'पोंछो', 'सुखाओ',

    # ── Comfort/Position (expanded) ──
    'चादर', 'गद्दा', 'एसी', 'पर्दा', 'खिड़की', 'दरवाज़ा', 'रिमोट', 'अखबार', 'रेडियो',

    # ── Time/Greetings (expanded) ──
    'दोपहर', 'परसों', 'पहले', 'हमेशा', 'कभी', 'फिर',
    'शुभरात्रि', 'शुभप्रभात', 'अलविदा', 'नाश्ता',

    # ── Feelings/States (expanded) ──
    'खुश', 'दुखी', 'थका', 'भूखा', 'प्यासा', 'डर', 'चिंता',
    'परेशान', 'कमज़ोर', 'मज़बूत', 'बेहतर', 'सुधार', 'उम्मीद',

    # ── Common phrases as single predictions ──
    'बस', 'और', 'कितना', 'ज़रूरी', 'ज़रूर',
}

# ===========================================================================
# HINGLISH VOCABULARY — Common transliterated Hindi words
# ===========================================================================
HINGLISH_VOCABULARY = {
    # ---------- Essentials / Greetings ----------
    'namaste', 'namaskar', 'kya', 'hai', 'haa', 'nahi', 'aur', 'bas',
    'theek', 'thik', 'accha', 'achha', 'shukriya', 'dhanyavaad', 'maaf',
    'kripya', 'please', 'sorry', 'bilkul', 'zaroor', 'zaruri',

    # ---------- Pronouns / Common Words ----------
    'mujhe', 'mera', 'meri', 'mere', 'humara', 'hamara', 'aapka', 'aapki',
    'tumhara', 'tumhari', 'uska', 'uski', 'unka', 'unki', 'sabka', 'sabko',
    'yeh', 'woh', 'koi', 'kuch', 'sab', 'bahut', 'thoda', 'zyada', 'kam',
    'abhi', 'baad', 'pehle', 'phir', 'fir', 'tab', 'jab', 'agar',

    # ---------- Questions ----------
    'kya', 'kab', 'kahan', 'kaise', 'kyun', 'kaun', 'kitna', 'kitni', 'kitne',
    'kidhar', 'kisko', 'kisliye', 'konsa', 'konsi',

    # ---------- Verbs (Common Actions) ----------
    'karo', 'karna', 'kiya', 'karenge', 'karunga', 'kijiye',
    'bolo', 'bolna', 'bola', 'boliye', 'batao', 'batana', 'bataya', 'bataiye',
    'dekho', 'dekhna', 'dekha', 'dekhiye', 'dikhao', 'dikhana', 'dikha',
    'suno', 'sunna', 'suna', 'suniye', 'sunaao',
    'jao', 'jaana', 'gaya', 'gayi', 'gaye', 'jaiye', 'jayenge',
    'aao', 'aana', 'aaya', 'aayi', 'aaye', 'aaiye', 'aayenge',
    'khao', 'khaana', 'khaya', 'khayi', 'khilao', 'khana',
    'piyo', 'peena', 'piya', 'pilaao', 'pilao',
    'soye', 'sona', 'soya', 'soyi', 'sulao',
    'utho', 'uthna', 'utha', 'uthai', 'uthao',
    'baitho', 'baithna', 'baitha', 'baithiye',
    'chalo', 'chalna', 'chala', 'chali', 'chaliye',
    'ruko', 'rukna', 'ruka', 'ruki', 'rukiye', 'ruko',
    'lao', 'laana', 'laya', 'layi', 'laiye',
    'do', 'dena', 'diya', 'diyi', 'dijiye', 'dedo',
    'lo', 'lena', 'liya', 'liyi', 'lijiye', 'lelo',
    'rakho', 'rakhna', 'rakha', 'rakhiye', 'rakhdo',
    'bhejo', 'bhejna', 'bheja', 'bhejiye', 'bhejdo',
    'padho', 'padhna', 'padha', 'padhiye',
    'likho', 'likhna', 'likha', 'likhiye',
    'samjho', 'samajhna', 'samjha', 'samjhi', 'samajh',
    'poocho', 'poochna', 'poocha', 'poochiye',
    'rona', 'roya', 'royi', 'hansa', 'hansi',
    'milna', 'mila', 'mili', 'milenge',
    'chahiye', 'chaahiye', 'chahte', 'chahti',
    'lagta', 'lagti', 'lagte', 'laga', 'lagi',
    'hona', 'hua', 'huyi', 'hogi', 'hoga', 'honge',
    'rehna', 'raha', 'rahi', 'rahe', 'rahiye', 'rehte',
    'dhoye', 'dhona', 'dhoya', 'dhoyi',
    'bandh', 'kholo', 'kholna', 'khola',

    # ---------- Body / Medical (Caregiving) ----------
    'dard', 'takleef', 'taklif', 'dawa', 'dawai', 'goli', 'tablet',
    'injection', 'doctor', 'nurse', 'hospital',
    'sar', 'sir', 'pet', 'pair', 'haath', 'kamar', 'peeth',
    'gala', 'aankh', 'aankhen', 'naak', 'kaan', 'mooh', 'muh',
    'daant', 'seena', 'ghutna', 'ungli', 'gardan',
    'bukhar', 'khasi', 'khansi', 'ulti', 'dast', 'chakkar',
    'kamzori', 'thakan', 'neend', 'nind', 'saans', 'sans',
    'suction', 'machine', 'oxygen', 'mask',
    'blood', 'pressure', 'sugar', 'temperature',
    'bistar', 'palang', 'gadda', 'chaadar', 'chadar', 'takia',
    'karvat', 'karwat',

    # ---------- Food / Drink ----------
    'paani', 'pani', 'chai', 'doodh', 'dudh', 'lassi', 'juice',
    'roti', 'paratha', 'dal', 'daal', 'chawal', 'rice',
    'sabzi', 'sabji', 'aloo', 'gobhi', 'paneer', 'dahi', 'curd',
    'khichdi', 'kheer', 'halwa', 'ladoo', 'barfi',
    'nashta', 'breakfast', 'lunch', 'dinner', 'khana',
    'namak', 'mirch', 'cheeni', 'masala', 'tel', 'ghee',
    'garam', 'thanda', 'taza', 'basi', 'meetha', 'teekha', 'namkeen',
    'phal', 'fruit', 'kela', 'seb', 'aam', 'santra',
    'nimbu', 'adrak', 'haldi', 'jeera',

    # ---------- Home / Environment ----------
    'ghar', 'kamra', 'room', 'kitchen', 'bathroom',
    'darwaza', 'khidki', 'window', 'door',
    'bijli', 'light', 'pankha', 'fan', 'cooler',
    'fridge', 'almirah', 'sofa', 'kursi', 'chair', 'table', 'mez',
    'safai', 'saaf', 'ganda', 'dhool', 'kapda', 'kapde',
    'towel', 'sabun', 'soap', 'tel', 'cream',
    'baarish', 'dhoop', 'thand', 'garmi', 'hawa',

    # ---------- Family / People ----------
    'papa', 'mummy', 'beta', 'beti', 'bhai', 'behen', 'didi',
    'chacha', 'chachi', 'mama', 'mami', 'nana', 'nani',
    'dada', 'dadi', 'sasur', 'saas', 'bahu', 'damad',
    'pati', 'patni', 'baccha', 'bachche', 'bacchi',
    'dost', 'friend', 'padosi', 'neighbour',
    'naukar', 'kaamwali', 'driver', 'watchman',

    # ---------- Feelings / States ----------
    'khush', 'dukhi', 'pareshan', 'gussa', 'naraz',
    'darr', 'dar', 'akela', 'bored', 'thaka', 'thaki',
    'bhookh', 'bhook', 'pyaas', 'pyaas', 'nind', 'neend',
    'sukoon', 'aaram', 'shanti', 'tasalli', 'umeed',
    'fikr', 'chinta', 'tension', 'stress',
    'theek', 'badiya', 'mast', 'zabardast', 'shandar',

    # ---------- Time / Days ----------
    'aaj', 'kal', 'parso', 'abhi', 'baad', 'pehle',
    'subah', 'dopahar', 'shaam', 'raat',
    'somvar', 'mangalvar', 'budhvar', 'guruvar', 'shukravar', 'shanivar', 'ravivar',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'mahina', 'saal', 'hafta', 'week', 'month', 'year',
    'ghanta', 'minute', 'second', 'samay', 'waqt',

    # ---------- Numbers / Quantities ----------
    'ek', 'do', 'teen', 'char', 'paanch', 'chhe', 'saat', 'aath', 'nau', 'das',
    'gyarah', 'barah', 'bees', 'pachas', 'sau', 'hazaar', 'lakh',
    'aadha', 'pauna', 'saada', 'dedh', 'dhai',
    'pehla', 'doosra', 'teesra', 'chautha',

    # ---------- Common Phrases (single words) ----------
    'chalo', 'chaliye', 'acha', 'waah', 'arre', 'oye', 'haan',
    'matlab', 'yaani', 'lekin', 'magar', 'isliye', 'kyunki', 'toh',
    'waise', 'warna', 'nahi', 'mat', 'kabhi', 'hamesha', 'aksar',
    'sirf', 'sach', 'jhooth', 'galat', 'sahi', 'theek',
    'pakka', 'shayad', 'lagbhag', 'kareeb',
    'bahut', 'bohot', 'zyada', 'thoda', 'kam', 'kaafi',
    'andar', 'bahar', 'upar', 'neeche', 'aage', 'peeche',
    'idhar', 'udhar', 'yahan', 'wahan', 'paas', 'door',

    # ---------- Religious / Cultural ----------
    'bhagwan', 'bhagavan', 'prabhu', 'ishwar',
    'pooja', 'puja', 'aarti', 'mandir',
    'prarthana', 'prayer', 'ashirwad', 'blessing',
    'tyohar', 'festival', 'diwali', 'holi',
    'vrat', 'upvas', 'prasad', 'tirth',
}

# ===========================================================================
# CULTURAL VOCABULARY — Regional & Religious terms
# ===========================================================================
CULTURAL_VOCABULARY = {
    'indore', 'bhopal', 'madhya', 'pradesh', 'hanumanji', 'chalisa', 'aarti',
    'mandir', 'prasad', 'mahakal', 'rajwada', 'sarafa',
}

# ===========================================================================
# APP SCREEN VOCABULARY — words from Activities, People, Medical screens
# ===========================================================================
APP_SCREEN_VOCABULARY = {
    # ---- Activities screen ----
    'switch', 'channel', 'volume', 'play', 'pause',
    'songs', 'devotional', 'chanting', 'hanuman', 'chalisa',
    'kishore', 'kumar', 'comedy', 'videos', 'alexa',
    'ramayan', 'tarak', 'mehta',

    # ---- People screen ----
    'family', 'doctor', 'nurse', 'caregiver', 'staff',
    'visitor', 'neighbor', 'friend', 'rishabh', 'mummy',
    'caretaker',

    # ---- Medical / Assistance screen: URGENT ----
    'urgent', 'suction', 'oral', 'breathing', 'problem',
    'severe', 'pain', 'vitals', 'pulse', 'ventilator',
    'alarm', 'chest', 'discomfort', 'shivering', 'panic',
    'anxiety', 'ambu',

    # ---- Medical / Assistance screen: BED & POSITION ----
    'bed', 'angle', 'adjust', 'turn', 'left', 'right',
    'head', 'neck', 'legs', 'pillow', 'massage',
    'back', 'care', 'needed', 'hands',

    # ---- Medical / Assistance screen: DAILY CARE ----
    'water', 'clean', 'face', 'eyes', 'drops',
    'balm', 'toilet', 'urine', 'pot', 'fan',
    'lights', 'curtains', 'open', 'close',

    # ---- Home screen ----
    'emergency', 'assistance', 'keyboard', 'home',
    'speak', 'settings', 'customize',
    'communication', 'phrases', 'browsing',
    'fever', 'position', 'change',

    # ---- Feelings screen ----
    'happy', 'sad', 'angry', 'scared', 'tired',
    'bored', 'excited', 'frustrated', 'grateful',
    'lonely', 'anxious', 'peaceful', 'hopeful',
    'uncomfortable', 'better', 'hungry', 'thirsty',
    'cold', 'hot', 'okay', 'rest',

    # ---- Basic Needs screen ----
    'food', 'bathroom', 'blanket', 'shawl',
    'speed', 'temperature', 'window', 'pillows', 'mosquito',

    # ---- AAC Board categories ----
    'help', 'medicine', 'yes', 'maybe', 'wait',
    'please', 'thank', 'sorry', 'excuse',
    'later', 'now',
}

# ===========================================================================
# EXPANDED COMMON ENGLISH WORDS — fill gaps for natural typing
# Top 500 most used English words not already covered (3+ letters)
# ===========================================================================
EXPANDED_VOCABULARY = {
    # High frequency missing words
    'able', 'above', 'accept', 'across', 'add', 'admit',
    'afraid', 'age', 'ago', 'agree', 'ahead', 'air',
    'allow', 'almost', 'alone', 'among', 'amount',
    'appear', 'area', 'art', 'attention', 'away',
    'bad', 'bank', 'base', 'beat', 'become', 'begin',
    'behind', 'believe', 'below', 'beside', 'bit',
    'black', 'blue', 'board', 'born', 'both', 'bottom',
    'box', 'break', 'brother', 'brown', 'build', 'burn',
    'business', 'busy', 'buy', 'card', 'care', 'carry',
    'catch', 'cause', 'center', 'certain', 'chance',
    'character', 'choice', 'church', 'class', 'clear',
    'clothes', 'cold', 'college', 'color', 'common',
    'community', 'company', 'complete', 'concern',
    'condition', 'consider', 'continue', 'control',
    'cost', 'couple', 'course', 'cover', 'create',
    'cross', 'cup', 'current', 'cut', 'dark', 'data',
    'daughter', 'dead', 'deal', 'death', 'decide',
    'decision', 'deep', 'degree', 'describe', 'design',
    'develop', 'die', 'difficult', 'dinner', 'direction',
    'discover', 'discuss', 'doctor', 'dog', 'door',
    'down', 'draw', 'dream', 'drive', 'drop', 'drug',
    'dry', 'during', 'each', 'east', 'edge', 'education',
    'effect', 'effort', 'eight', 'enjoy', 'entire',
    'environment', 'especially', 'evening', 'event',
    'ever', 'every', 'everybody', 'everyone', 'everything',
    'evidence', 'exactly', 'example', 'except', 'exist',
    'expect', 'experience', 'explain', 'eye', 'face',
    'fact', 'fail', 'fall', 'far', 'fast', 'father',
    'fear', 'feeling', 'few', 'field', 'fight', 'figure',
    'fill', 'final', 'financial', 'fire',
    'five', 'floor', 'fly', 'follow', 'force',
    'foreign', 'forget', 'form', 'forward', 'four',
    'free', 'friend', 'front', 'future', 'game',
    'garden', 'general', 'generation', 'girl', 'glass',
    'god', 'gold', 'gone', 'government', 'green',
    'ground', 'group', 'grow', 'growth', 'guess',
    'guy', 'hair', 'half', 'hang', 'happy', 'hard',
    'hat', 'head', 'health', 'heart', 'heat', 'heavy',
    'herself', 'himself', 'history', 'hit', 'hold',
    'hole', 'hope', 'hot', 'hotel', 'hour', 'human',
    'hundred', 'husband', 'idea', 'image', 'imagine',
    'impact', 'include', 'increase', 'indeed', 'indicate',
    'individual', 'industry', 'information', 'inside',
    'interest', 'international', 'interview', 'involve',
    'issue', 'item', 'itself', 'job', 'join', 'joy',
    'kid', 'kill', 'kind', 'kitchen', 'knowledge',
    'land', 'language', 'large', 'last', 'late',
    'laugh', 'law', 'lay', 'lead', 'leader', 'least',
    'left', 'less', 'level', 'lie', 'line', 'list',
    'listen', 'lose', 'loss', 'lot', 'low', 'machine',
    'magazine', 'main', 'major', 'manage', 'manager',
    'market', 'material', 'matter', 'mean', 'measure',
    'media', 'medical', 'meet', 'meeting', 'member',
    'memory', 'mention', 'message', 'method', 'middle',
    'military', 'million', 'mind', 'miss', 'model',
    'modern', 'moment', 'money', 'month', 'mother',
    'mouth', 'movement', 'mrs', 'music', 'name',
    'nation', 'national', 'natural', 'nature', 'near',
    'nearly', 'necessary', 'network', 'nice', 'none',
    'nor', 'north', 'note', 'notice', 'now', 'number',
    'occur', 'offer', 'officer', 'official', 'oil',
    'once', 'one', 'only', 'onto', 'operation', 'opportunity',
    'option', 'order', 'organization', 'other', 'others',
    'outside', 'over', 'own', 'owner', 'page', 'pain',
    'painting', 'pair', 'paper', 'parent', 'particular',
    'partner', 'party', 'pass', 'past', 'patient', 'pattern',
    'pay', 'peace', 'per', 'perform', 'perhaps', 'period',
    'pick', 'piece', 'plan', 'plant', 'player', 'point',
    'police', 'policy', 'political', 'poor', 'popular',
    'population', 'positive', 'possible', 'power', 'practice',
    'prepare', 'present', 'president', 'pretty', 'prevent',
    'price', 'private', 'probably', 'problem', 'process',
    'produce', 'product', 'professional', 'program', 'project',
    'property', 'protect', 'prove', 'provide', 'public',
    'pull', 'purpose', 'push', 'quality', 'question',
    'quick', 'quickly', 'quite', 'race', 'radio',
    'raise', 'range', 'rate', 'rather', 'reach',
    'real', 'reality', 'realize', 'reason', 'receive',
    'recent', 'recently', 'recognize', 'record', 'red',
    'reduce', 'reflect', 'region', 'relate', 'relationship',
    'religious', 'remain', 'remember', 'remove', 'report',
    'represent', 'require', 'research', 'resource', 'respond',
    'response', 'result', 'return', 'rich', 'right',
    'rise', 'risk', 'road', 'rock', 'role', 'rule',
    'run', 'safe', 'save', 'scene', 'season', 'seat',
    'second', 'section', 'security', 'seek', 'seem',
    'sell', 'sense', 'serious', 'serve', 'service',
    'set', 'seven', 'several', 'shake', 'shall', 'shape',
    'share', 'shoot', 'short', 'shot', 'shoulder',
    'sign', 'significant', 'similar', 'simple', 'simply',
    'sing', 'single', 'sister', 'sit', 'site',
    'situation', 'six', 'size', 'skill', 'smile',
    'social', 'society', 'soldier', 'somebody', 'son',
    'song', 'sound', 'source', 'south', 'southern',
    'space', 'special', 'spend', 'sport', 'spring',
    'stage', 'standard', 'star', 'state', 'statement',
    'station', 'step', 'story', 'strategy', 'street',
    'structure', 'student', 'study', 'stuff', 'style',
    'subject', 'success', 'successful', 'such', 'suffer',
    'suggest', 'summer', 'support', 'surface', 'system',
    'talk', 'task', 'tax', 'teach', 'teacher', 'team',
    'technology', 'ten', 'tend', 'term', 'test', 'the',
    'theory', 'third', 'though', 'thousand', 'threat',
    'three', 'throw', 'thus', 'tonight', 'top', 'total',
    'tough', 'toward', 'town', 'trade', 'traditional',
    'training', 'travel', 'tree', 'trial', 'trip',
    'trouble', 'true', 'truth', 'turn', 'two', 'type',
    'under', 'unit', 'upon', 'using', 'value', 'various',
    'view', 'violence', 'visit', 'voice', 'vote',
    'walk', 'wall', 'war', 'watch', 'way', 'weapon',
    'wear', 'week', 'west', 'western', 'whatever',
    'whether', 'white', 'whole', 'whom', 'whose',
    'wide', 'wife', 'win', 'wind', 'window', 'winter',
    'wish', 'within', 'wonder', 'wood', 'word',
    'worker', 'write', 'writer', 'wrong', 'yard',
    'yeah', 'yet', 'young',
}

# ===========================================================================
# EVERYDAY ENGLISH — high-frequency words people type daily (v15 expansion)
# Covers: daily activities, technology, weather, emotions, conversational
# ===========================================================================
EVERYDAY_VOCABULARY = {
    # ---------- Daily Verbs (common but missing) ----------
    'accept', 'achieve', 'add', 'allow', 'answer', 'appear', 'arrive',
    'attend', 'avoid', 'bake', 'bathe', 'begin', 'belong', 'borrow',
    'brush', 'cancel', 'carry', 'celebrate', 'choose', 'climb', 'collect',
    'compare', 'complain', 'complete', 'cook', 'correct', 'count', 'create',
    'dance', 'deliver', 'depend', 'describe', 'destroy', 'develop', 'dry',
    'earn', 'empty', 'encourage', 'enjoy', 'enter', 'escape', 'examine',
    'exchange', 'explain', 'explore', 'express', 'face', 'fail', 'feed',
    'fight', 'fill', 'finish', 'fix', 'float', 'fold', 'follow', 'forgive',
    'freeze', 'gather', 'greet', 'grow', 'guess', 'hang', 'happen',
    'hate', 'hide', 'hit', 'hold', 'hug', 'hurry', 'imagine', 'improve',
    'include', 'increase', 'inform', 'invite', 'join', 'joke', 'judge',
    'jump', 'kick', 'kiss', 'knock', 'land', 'laugh', 'lend', 'lift',
    'lock', 'lose', 'manage', 'mark', 'match', 'measure', 'mend',
    'mention', 'mix', 'notice', 'obey', 'offer', 'organize', 'owe',
    'own', 'paint', 'park', 'pay', 'perform', 'permit', 'phone',
    'plant', 'pour', 'practice', 'pray', 'prefer', 'pretend', 'print',
    'promise', 'protect', 'provide', 'publish', 'punish', 'push',
    'reach', 'realize', 'receive', 'recognize', 'recommend', 'record',
    'reduce', 'refuse', 'regret', 'reject', 'relate', 'relax', 'release',
    'rely', 'remain', 'repair', 'repeat', 'replace', 'reply', 'request',
    'require', 'rescue', 'resist', 'retire', 'return', 'ring', 'roll',
    'rush', 'satisfy', 'save', 'search', 'select', 'sell', 'separate',
    'serve', 'settle', 'share', 'shout', 'shut', 'sign', 'sing', 'slip',
    'smell', 'solve', 'sort', 'spend', 'spread', 'squeeze', 'steal',
    'stretch', 'strike', 'succeed', 'suggest', 'supply', 'suppose',
    'surprise', 'survive', 'suspect', 'swim', 'taste', 'teach', 'tear',
    'test', 'throw', 'tie', 'touch', 'translate', 'travel', 'trust',
    'type', 'unite', 'visit', 'volunteer', 'warn', 'waste', 'whisper',
    'win', 'wonder', 'wrap', 'yell',

    # ---------- Technology & Modern Life ----------
    'internet', 'wifi', 'website', 'email', 'message', 'app', 'video',
    'camera', 'screen', 'computer', 'laptop', 'tablet', 'battery',
    'charger', 'bluetooth', 'update', 'download', 'upload', 'search',
    'google', 'youtube', 'whatsapp', 'instagram', 'facebook', 'online',
    'offline', 'password', 'account', 'notification', 'setting',

    # ---------- Weather & Nature ----------
    'weather', 'sunny', 'cloudy', 'windy', 'rainy', 'stormy', 'foggy',
    'humid', 'dry', 'temperature', 'warm', 'cool', 'heat', 'freeze',
    'snow', 'rain', 'wind', 'cloud', 'sky', 'sun', 'moon', 'star',
    'garden', 'flower', 'tree', 'grass', 'river', 'mountain', 'beach',

    # ---------- Emotions & States (extended) ----------
    'annoyed', 'ashamed', 'awkward', 'calm', 'confident', 'confused',
    'curious', 'depressed', 'desperate', 'disappointed', 'disgusted',
    'embarrassed', 'emotional', 'empty', 'energetic', 'enthusiastic',
    'guilty', 'helpless', 'horrible', 'impressed', 'independent',
    'insecure', 'inspired', 'irritated', 'jealous', 'joyful',
    'lazy', 'nervous', 'nostalgic', 'optimistic', 'overwhelmed',
    'patient', 'pleasant', 'pleased', 'positive', 'proud', 'relaxed',
    'relieved', 'satisfied', 'sensitive', 'shocked', 'silly',
    'stressed', 'surprised', 'suspicious', 'sympathetic', 'tense',
    'terrified', 'thankful', 'thrilled', 'touched', 'troubled',
    'upset', 'vulnerable', 'weak',

    # ---------- Common Adjectives & Descriptors ----------
    'amazing', 'awful', 'brilliant', 'busy', 'cheap', 'comfortable',
    'complicated', 'convenient', 'correct', 'crazy', 'cute', 'dangerous',
    'delicious', 'excellent', 'expensive', 'extra', 'fair', 'familiar',
    'famous', 'fantastic', 'fast', 'favorite', 'flat', 'foreign',
    'fresh', 'funny', 'gentle', 'glad', 'gorgeous', 'huge',
    'impossible', 'incredible', 'interesting', 'lovely', 'lucky',
    'massive', 'modern', 'narrow', 'necessary', 'normal', 'obvious',
    'original', 'perfect', 'plain', 'polite', 'poor', 'powerful',
    'precious', 'previous', 'proper', 'proud', 'rare', 'raw',
    'reasonable', 'regular', 'rough', 'round', 'rude', 'serious',
    'sharp', 'simple', 'slim', 'smart', 'smooth', 'soft', 'solid',
    'spare', 'straight', 'strange', 'strict', 'suitable', 'super',
    'sweet', 'tall', 'terrible', 'thick', 'thin', 'tight', 'tiny',
    'total', 'tough', 'ugly', 'unique', 'unusual', 'useful', 'usual',
    'valuable', 'various', 'vast', 'wet', 'wide', 'wild', 'wonderful',
    'worth',

    # ---------- Time & Scheduling ----------
    'appointment', 'calendar', 'daily', 'deadline', 'early', 'holiday',
    'immediate', 'midnight', 'noon', 'recent', 'regular', 'routine',
    'schedule', 'shift', 'sometime', 'urgent', 'weekend',

    # ---------- Food & Cooking (extended) ----------
    'biscuit', 'cake', 'cereal', 'cheese', 'chocolate',
    'cream', 'curry', 'dessert', 'dough', 'flour', 'garlic',
    'ginger', 'honey', 'ice', 'jam', 'lemon', 'mango',
    'mushroom', 'noodles', 'onion', 'orange', 'pasta', 'pepper',
    'pizza', 'potato', 'roti', 'sabzi', 'salad', 'samosa', 'sandwich',
    'sauce', 'spice', 'tomato', 'yogurt',

    # ---------- Relationships & Social ----------
    'anniversary', 'apology', 'argument', 'blessing', 'celebration',
    'company', 'conversation', 'couple', 'date', 'engagement',
    'forgiveness', 'friendship', 'gathering', 'invitation', 'marriage',
    'meeting', 'neighbor', 'partner', 'party', 'relationship',
    'reunion', 'trust', 'wedding',
}

# ===========================================================================
# ALS COMMUNICATION VOCABULARY — words for advanced-stage AAC users
# Eye-gaze specific, communication partner phrases, daily care instructions
# ===========================================================================
ALS_COMMUNICATION_VOCABULARY = {
    # ---------- Eye Gaze & AAC Specific ----------
    'calibrate', 'calibration', 'cursor', 'dwell', 'gaze', 'glance',
    'keyboard', 'prediction', 'recalibrate', 'screen', 'select',
    'symbol', 'toggle', 'tracker', 'tracking',

    # ---------- Communication Partner Phrases ----------
    'agree', 'disagree', 'correct', 'incorrect', 'exactly', 'almost',
    'repeat', 'slower', 'faster', 'louder', 'quieter', 'understand',
    'misunderstand', 'clarify', 'confirm', 'deny', 'interrupt',
    'continue', 'finish', 'pause', 'resume', 'skip', 'next',
    'previous', 'above', 'below', 'within',

    # ---------- Decision Making ----------
    'accept', 'allow', 'approve', 'cancel', 'choose', 'decline',
    'delay', 'ignore', 'postpone', 'prefer', 'promise', 'refuse',
    'reject', 'require', 'select', 'settle', 'suggest',

    # ---------- Daily Care Instructions (extended) ----------
    'bandage', 'catheter', 'clamp', 'compress', 'cream', 'cushion',
    'drainage', 'drip', 'elastic', 'foam', 'gauge', 'glove',
    'humidifier', 'liner', 'mattress', 'ointment', 'pad', 'pillow',
    'pump', 'rinse', 'sanitizer', 'splint', 'strap', 'suction',
    'syringe', 'tape', 'thermometer', 'tissue', 'tube', 'valve',
    'wheelchair', 'wipe',

    # ---------- Comfort & Position ----------
    'comfortable', 'cramped', 'elevated', 'flat', 'inclined',
    'leaning', 'propped', 'reclined', 'shifted', 'slouching',
    'stretched', 'supported', 'tilted', 'twisted', 'upright',

    # ---------- Urgency Levels ----------
    'asap', 'critical', 'emergency', 'immediate', 'important',
    'minor', 'normal', 'priority', 'routine', 'severe', 'urgent',
}

# ===========================================================================
# Merge all vocabularies into one master set
# ===========================================================================
ALL_VOCABULARY = (
    CORE_VOCABULARY
    | MEDICAL_VOCABULARY
    | PATIENT_VOCABULARY
    | APP_SCREEN_VOCABULARY
    | EXPANDED_VOCABULARY
    | HINGLISH_VOCABULARY
    | CULTURAL_VOCABULARY
    | EVERYDAY_VOCABULARY
    | ALS_COMMUNICATION_VOCABULARY
    | HINDI_VOCABULARY
)

# Remove words shorter than MIN_WORD_LENGTH if they are English
ALL_VOCABULARY = {
    w for w in ALL_VOCABULARY
    if (len(w) >= MIN_WORD_LENGTH or re.search(r'[\u0900-\u097F]', w))
    and not is_blocked_prediction_word(w)
}

# ============================================
# AAC PHRASE LIBRARY
# ============================================

AAC_PHRASES = {
    'emergency': [
        "I need help immediately",
        "Call emergency services",
        "I'm having trouble breathing",
        "I need my medication now",
        "Something is wrong",
        "I'm in severe pain",
        "Call the doctor",
        "I need suction now",
        "TT suction needed now",
        "Breathing problem ambu bag",
        "मुझे तुरंत मदद चाहिए",
    ],
    'medical': [
        "I need suction",
        "Change my position",
        "I have pain",
        "I need my medicine",
        "Check my vitals",
        "I feel dizzy",
        "I'm having trouble swallowing",
        "Adjust my oxygen",
        "Give me nebulization",
        "Start ambu bag",
        "Oral suction needed",
        "Check vitals O2 pulse",
        "Ventilator alarm check",
        "Chest discomfort",
        "Check blood pressure",
        "I need glycolate",
        "Saliva is thick",
        "Breathing is difficult",
        "मुझे सक्शन चाहिए",
        "मेरी स्थिति बदलो",
        "मुझे दर्द है",
    ],
    'position': [
        "Turn me on my left side",
        "Turn me on my right side",
        "Raise my head",
        "Lower my head",
        "I want to sit up",
        "I want to lie down",
        "Adjust my pillow",
        "Fix pillow",
        "Adjust bed angle up",
        "Adjust bed angle down",
        "Adjust head and neck",
        "Straighten my legs",
        "Bend my knees",
        "Support my arms",
        "I keep sliding down",
        "Cover my body properly",
        "Back care needed",
    ],
    'basic_needs': [
        "I want water",
        "I need water",
        "I'm hungry",
        "I need to use the bathroom",
        "I'm cold",
        "I'm hot",
        "I'm tired",
        "I want to sleep",
        "Turn on the fan",
        "Turn off the light",
        "Give me black tea",
        "Apply body lotion",
        "I need sponging",
        "Warm water please",
        "Give me medicine",
        "Eye drops",
        "Lip balm",
        "Remove urine pot",
        "Adjust fan speed",
        "Open close curtains",
        "Mosquito is bothering me",
        "मुझे पानी चाहिए",
        "मुझे भूख लगी है",
    ],
    'comfort': [
        "I'm comfortable",
        "I'm not comfortable",
        "That's better",
        "A little more",
        "That's enough",
        "Perfect",
        "Not quite right",
        "Try again",
        "Gently please",
        "Be careful",
    ],
    'feelings': [
        "I'm happy",
        "I'm sad",
        "I'm frustrated",
        "I'm scared",
        "I'm bored",
        "I'm excited",
        "Thank you",
        "I appreciate you",
        "I am improving",
        "I am hopeful",
        "I am worried",
        "I miss you",
        "Rest is fine",
        "मैं खुश हूं",
        "मैं तुमसे प्यार करता हूं",
    ],
    'communication': [
        "Wait a moment",
        "Let me think",
        "I don't understand",
        "Please repeat that",
        "Speak slower please",
        "Yes",
        "No",
        "Maybe",
        "I don't know",
        "Tell me more",
        "Enough for today",
        "What else",
        "Any update",
        "Good night",
        "Good morning",
        "रुको",
        "हाँ",
        "नहीं",
    ],
    'caregiver': [
        "Clean my neck area properly",
        "Apply lotion on body",
        "Start black masala tea",
        "Give me fruit at morning",
        "Delegate work to staff",
        "Train the new person",
        "Tell staff to stay",
        "Be gentle with me",
        "Handle carefully",
        "Don't leave me alone",
        "Check on me regularly",
        "Put warm water here",
    ],
    'social': [
        "Good morning",
        "Good night",
        "Good evening",
        "How are you?",
        "I'm fine",
        "What's happening?",
        "Tell me about your day",
        "I missed you",
        "Come sit with me",
        "Let's talk",
        "Happy birthday",
        "Happy Diwali",
        "All the best",
        "Keep it up",
        "Call Rishabh",
        "Call Parakh",
        "Call Bhawana",
        "Call Nilesh",
        "Call Durgesh",
        "Call Rahul",
        "सुप्रभात",
        "शुभ रात्रि",
    ],
    'entertainment': [
        "Turn on the TV",
        "Change the channel",
        "Play some music",
        "Play old songs",
        "Read to me",
        "What's on the news?",
        "Let's watch a movie",
        "Volume up",
        "Volume down",
        "Play devotional music",
        "Play Kishore Kumar songs",
        "Alexa play Om chanting",
        "Alexa play Hanuman Chalisa",
        "Switch on TV",
        "Switch off TV",
        "टीवी चालू करो",
    ],
}

# ============================================
# ABBREVIATION EXPANSIONS
# ============================================

ABBREVIATIONS = {
    # ---- Greetings & Social ----
    'gm': 'Good morning',
    'gn': 'Good night',
    'ga': 'Good afternoon',
    'ge': 'Good evening',
    'hw': 'Hello, how are you?',
    'ty': 'Thank you',
    'tyvm': 'Thank you very much',
    'tyh': 'Thank you for helping',
    'tyc': 'Thank you for taking care',
    'yw': "You're welcome",
    'np': 'No problem',
    'pls': 'Please',
    'plz': 'Please',
    'sry': 'Sorry',
    'gnsd': 'Good night sweet dreams',
    'hbd': 'Happy birthday',
    'atb': 'All the best',
    'tcy': 'Take care of yourself',

    # ---- Quick Responses ----
    'idk': "I don't know",
    'idu': "I don't understand",
    'brb': 'Be right back',
    'lmk': 'Let me know',
    'ttyl': 'Talk to you later',
    'wbf': 'Everything will be fine',
    'dwm': 'Do not worry about me',
    'iaf': 'I am fine',

    # ---- Basic Needs (high frequency) ----
    'inh': 'I need help',
    'inw': 'I want water',
    'iww': 'I want warm water',
    'iwc': 'I want cold water',
    'ins': 'I need suction',
    'inp': 'I have pain',
    'inm': 'I need my medicine',
    'int': 'I need to go to the toilet',
    'inr': 'I need rest',
    'inb': 'I need blanket',
    'iwt': 'I want black tea',
    'iwe': 'I want to eat',
    'iws': 'I want to sleep',
    'iwp': 'I want my phone',
    'iwm': 'I want milk',
    'iwsu': 'I want to sit up',

    # ---- Position & Comfort (10-20x per day) ----
    'cmp': 'Change my position',
    'cpl': 'Change my position to left',
    'cpr': 'Change my position to right',
    'pil': 'Adjust my pillow please',
    'blk': 'Give me blanket',
    'rhd': 'Raise my head',
    'lhd': 'Lower my head',
    'imb': 'I need ambu bag',
    'tcs': 'Too cold in here',
    'ths': 'Too hot in here',
    'tml': 'Turn me to left side',
    'tmr': 'Turn me to right side',

    # ---- Medical (time-sensitive) ----
    'bpr': 'Please check my BP',
    'bpc': 'Check my blood pressure',
    'doc': 'Call the doctor',
    'nrs': 'Call the nurse',
    'med': 'Give me medicine',
    'mdt': 'Medicine time now',
    'mdf': 'Medicine is finished',
    'neb': 'Give me nebulization',
    'gly': 'I need glycolate',
    'sal': 'Saliva is thick',
    'suc': 'Please do suction',
    'oxy': 'Check oxygen level',
    'amb': 'Start ambu please',
    'ctp': 'Check my temperature',
    'asap': 'As soon as possible',
    'brp': 'Breathing problem',
    'pnb': 'Pain in my back',
    'pnn': 'Pain in my neck',
    'pni': 'Pain is increasing',
    'pnl': 'Pain is less today',

    # ---- Commands (devices) ----
    'tvon': 'Turn on the TV',
    'tvoff': 'Turn off the TV',
    'lon': 'Turn on the light',
    'loff': 'Turn off the light',
    'fon': 'Turn on the fan',
    'foff': 'Turn off the fan',
    'acon': 'Turn on the AC',
    'acoff': 'Turn off the AC',
    'vup': 'Volume up',
    'vdn': 'Volume down',

    # ---- Feelings & Emotions ----
    'imh': "I'm happy",
    'ims': "I'm sad",
    'imt': "I'm tired",
    'imf': "I'm fine",
    'imy': 'I miss you',
    'imw': "I'm worried",
    'imc': "I'm comfortable",
    'imu': "I'm uncomfortable",
    'imb2': 'I am feeling better today',
    'iip': 'I am in pain',
    'ihb': 'I am having trouble breathing',
    'ifw': 'I am feeling weak',
    'ipoy': 'I am proud of you',

    # ---- Family & People ----
    'clm': 'Call mummy',
    'cld': 'Call the doctor',
    'cln': 'Call the nurse',
    'clb': 'Call bhaiya',
    'cla': 'Call ambulance',
    'tif': 'Tell them I am fine',
    'tmtk': 'Tell mummy to take rest',
    'tsc': 'Tell staff to come',
    'tdp': 'Tell the doctor about pain',
    'wim': 'Where is mummy',
    'wip': 'Where is my phone',
    'wir': 'Where is the remote',
    'wie': 'Where is everyone',

    # ---- Staff Instructions ----
    'gmot': 'Give medicine on time',
    'col': 'Check oxygen level',
    'cbs': 'Change the bedsheet',
    'mlg': 'Massage my legs gently',
    'sbp': 'Support my back properly',
    'teth': 'Turn me every two hours',

    # ---- Daily Routines ----
    'swt': 'Start with tea and medicine',
    'sbb': 'Give sponge bath before breakfast',
    'tfp': 'Time for physiotherapy',
    'abl': 'Apply body lotion on body',

    # ---- Hinglish Shortcuts ----
    'mkb': 'Mummy ko bulao',
    'pdc': 'Pani de do please',
    'pgk': 'Pani garam karo',
    'dkt': 'Dawa ka time ho gaya',
    'ddd': 'Dawa de do please',
    'cdd': 'Chai de do please',
    'mpc': 'Mujhe pani chahiye',
    'mdh': 'Mujhe dard ho raha hai',
    'mna': 'Mujhe neend aa rahi hai',
    'skb': 'Staff ko bulao',
    'dkc': 'Doctor ko call karo',
    'skd': 'Suction kar do',
    'pck': 'Position change karo',
    'kgk': 'Khana garam karo',
    'fbk': 'Fan band karo',
    'lbk': 'Light band karo',

    # ---- Hindi (Devanagari) ----
    'nmst': 'नमस्ते',
    'dhny': 'धन्यवाद',
    'mddc': 'मदद चाहिए',
    'pnic': 'पानी चाहिए',
}

# Custom abbreviations loaded from disk at runtime (merged into ABBREVIATIONS)
_CUSTOM_ABBREVIATIONS: Dict[str, str] = {}

# ============================================
# TRAINING CORPUS — rich sentences for n-gram model
# ============================================

TRAINING_CORPUS = [
    # Common sentence patterns (high weight)
    "I want to", "I need to", "I would like", "I am feeling",
    "Can you please", "Could you please", "Please help me",
    "Thank you for", "I don't want", "Let me know",
    "Tell me about", "I think we should", "I want you to",
    "Please check my", "Please give me", "Please bring me",
    "Please tell them", "Please come here", "Please call",
    "I am doing fine", "I am comfortable", "I am not comfortable",
    "I am improving", "I am hopeful", "I am worried about",
    "I am happy with", "I am tired of",
    "Please turn on the", "Please turn off the",
    "Change my position", "Adjust my pillow",
    "I need suction", "I need water", "I need medicine",
    "Check my blood pressure", "Check my temperature",
    "Give me nebulization", "Start the ambu",
    "Turn me on my left side", "Turn me on my right side",
    "Raise my head", "Lower my head",
    "Apply body lotion", "Give me sponging",
    "Good morning", "Good night", "Good evening",
    "How are you", "I miss you",
    "Happy birthday", "All the best",
    "Rest is fine", "Enough for today", "Good bye",
    "What else", "Any update", "Any news",
    "Tell them to", "Remind them about",
    "Call the doctor", "Call mummy", "Call papa",
    "Play some music", "Play old songs",
    "Turn on the TV", "Change the channel",
    "I am feeling cold", "I am feeling hot",
    "I am feeling hungry", "I am feeling thirsty",
    "The staff is good", "The caretaker needs to work",
    "Please delegate work", "Train the new person",
    "Be careful with me", "Handle me gently",
    "Don't leave me alone", "Stay with me",
    "I want to sleep", "I want to rest",
    "I want black tea", "I want warm water",

    # From patient's actual chat history (high weight — repeat for boost)
    "Tell mummy to take rest",
    "Tell mummy to take sufficient rest and care for health",
    "I am worried about health",
    "I am worried about nilesh going on leave",
    "Staff is good and picking up fast",
    "New man is picking up fast",
    "Please check my blood pressure medicine",
    "Saliva is thick",
    "Saliva is thick as if glycolate",
    "Respiratory system has become weak",
    "Ambu is needed every time",
    "Clean my neck and ears properly",
    "Apply body lotion on body everywhere",
    "Start black masala tea in morning",
    "Give me fruit at ten morning",
    "Give me desi nashta alternate day",
    "Delegate some more work to staff",
    "Put some warm water and medicines here",
    "Tell both staff to stay for long time",
    "Tell both staff to stay for long time and respect each other",
    "I am improving and hopeful",
    "Rest is fine looking ahead",
    "Enough for today good night",
    "Happy Diwali",
    "Happy Deepawali",
    "I keep sliding give me support",
    "Cover my body properly",
    "Cover my body to avoid embarrassment",
    "Suction is in control",
    "I will require glycolate",
    "I will require glycolate for two three days",
    "Back care is important",
    "TT management is also an issue",
    "Please take quick decisions",
    "Please take quick decisions about house and plot",
    "Any progress regarding plot",
    "What about music show",
    "I am enjoying all diets and services",
    "I am busy in sleeping diet and sponging",
    "Come out of my worries",
    "Good night and sweet dreams",
    "Keep your passion live",
    "I am doing fine with your efforts",
    "I am doing fine with your efforts and durgesh",

    # More from chat history — people context
    "Call rishabh", "Call parakh", "Call mummy", "Call nilesh",
    "Call durgesh", "Call akhil", "Call anand", "Call rahul",
    "Call chetan", "Call girish", "Call rajesh",
    "Tell rishabh about", "Tell parakh about",
    "Pari your jobs are good",
    "Pari must prepare",
    "Parakh all the best and badhai",
    "Parakh be focused punctual and loyal",
    "Tell ani also to be calm",
    "Akhil any update about",
    "Anand and pintoo assign work",
    "Assign my work to anand pintoo and staff",
    "Nilesh is here for me",
    "Please see nilesh status",
    "Worried about nilesh going on leave",
    "Durgesh resolved our issues very nicely",
    "Durgesh is working hard",
    "Durgesh is over exerting",
    "Share my view with durgesh also",
    "Show him salman photo",
    "Keep connected with shuklaji and jatav",
    "Gift them deepawali saree and shirt",
    "Girish is also good person",
    "Train the new person about back care",
    "The caretaker is over smart",
    "He does not want to work",

    # More from chat history — medical context
    "TT suction needed now",
    "Oral suction needed",
    "This time TT is not comfortable",
    "Bombay wala much better",
    "Clear and no bleeding",
    "They are trial and error",
    "Give me nityam daily irrespective of motion",
    "I am requiring glycolate also due to excessive saliva",
    "Nebulization twice a day with ambu",
    "Exercises are in full mood",
    "Side suction band",
    "Breathing problem ambu bag",
    "Check vitals oxygen pulse",
    "Ventilator alarm check",
    "Chest discomfort",
    "Feeling cold shivering",

    # More from chat history — daily life
    "I want a list of works for new staff with time table",
    "He should come a day earlier for proper training",
    "About black tea order daddu to do it",
    "He will do it with pleasure",
    "Pink is very good we will use when guests are there",
    "Nilesh was to bring a massage oil",
    "Mummy greet elders for diwali including badi mummy",
    "Enough for today come out of my lafada",
    "Start about construction and bahu",
    "What about my black tea and nashta",
    "Your music program was good keep it up",
    "He is busy in chatting tobacco toilet and meals",
    "Not learning inspite of such a good trainer like durgesh",
    "Keep connected with shuklaji",
    "I am busy in karvat for eight hours a day",
    "Sleeping diet and sponging TV",

    # More from chat history — property & planning
    "Check exact location of sky park plot",
    "Plot near play ground east facing is fine",
    "I have already started planning but disposal first",
    "West facing ka plan also ready",
    "Any progress regarding plot and medical bill",
    "Hundai and tata have come with good SUVs",
    "Bahu laane ka please jaldi",

    # More from chat history — emotional & social
    "Happy birthday month to your mummy",
    "My dear boss",
    "I am enjoying all diets and services",
    "I am comfortable",
    "I am not comfortable",
    "Rest is okay",
    "I can not tolerate him",
    "He treats me like an object not as a human",
    "Don't leave me alone",
    "Stay with me",
    "I am feeling itching in whole body",
    "Vishnuji welcome",
    "What else anything else",
    "Any news from anywhere",

    # =========================================================================
    # GENERAL ENGLISH SENTENCE PATTERNS — for natural sentence completion
    # =========================================================================

    # "I want to ..." patterns
    "I want to go", "I want to eat", "I want to sleep", "I want to know",
    "I want to see", "I want to talk", "I want to read", "I want to watch",
    "I want to hear", "I want to rest", "I want to try", "I want to sit",
    "I want to learn", "I want to play", "I want to call", "I want to tell",
    "I want to ask", "I want to meet", "I want to help", "I want to stay",
    "I want to leave", "I want to think", "I want to drink", "I want to write",
    "I want to speak", "I want to understand", "I want to change",

    # "I need to ..." patterns
    "I need to rest", "I need to eat", "I need to sleep", "I need to talk",
    "I need to think", "I need to go", "I need to see", "I need to tell",
    "I need to ask", "I need to know", "I need to check", "I need to call",
    "I need to take", "I need to find", "I need to stop", "I need to start",

    # "Can you ..." patterns
    "Can you help me", "Can you please come", "Can you bring me",
    "Can you turn on the", "Can you turn off the", "Can you check",
    "Can you call", "Can you tell me", "Can you give me", "Can you show me",
    "Can you open the", "Can you close the", "Can you move",
    "Can you read to me", "Can you play some music", "Can you wait",

    # "Could you ..." patterns
    "Could you please help", "Could you bring me water",
    "Could you turn the light on", "Could you close the window",
    "Could you call the doctor", "Could you check my temperature",
    "Could you please come here", "Could you move the pillow",

    # "Please ..." patterns
    "Please help me with", "Please bring me some", "Please turn on",
    "Please turn off", "Please come here", "Please wait a moment",
    "Please tell them", "Please call the", "Please check my",
    "Please give me", "Please don't go", "Please be careful",
    "Please sit down", "Please close the door", "Please open the window",
    "Please bring my", "Please remind me", "Please show me",

    # "I am ..." / "I feel ..." patterns
    "I am fine today", "I am feeling better", "I am feeling worse",
    "I am feeling tired", "I am feeling cold", "I am feeling hot",
    "I am feeling hungry", "I am feeling thirsty", "I am feeling sick",
    "I am feeling happy", "I am feeling sad", "I am feeling lonely",
    "I am doing well", "I am okay", "I am ready",
    "I am not feeling well", "I am not hungry", "I am not tired",
    "I feel much better today", "I feel a little pain",
    "I feel like watching something", "I feel like listening to music",

    # "I think ..." / "I believe ..." patterns
    "I think we should", "I think it is time", "I think that is",
    "I think you are right", "I think he should", "I think she is",
    "I think they will", "I think we need to", "I think it would be",
    "I believe it will", "I believe we can",

    # "It is ..." / "That is ..." patterns
    "It is very cold today", "It is too hot", "It is getting late",
    "It is time for medicine", "It is time for dinner",
    "It is time to sleep", "It is raining outside",
    "That is very good", "That is not right", "That is enough",
    "That is what I want", "That was nice",

    # "There is ..." / "There are ..." patterns
    "There is something wrong", "There is too much noise",
    "There is a problem", "There is no need to worry",
    "There are people coming", "There are some things I want to say",

    # Question patterns
    "What time is it", "What is happening", "What do you think",
    "What did the doctor say", "What is the weather like",
    "What should we do", "What else is there",
    "Where is my phone", "Where is everyone", "Where did they go",
    "When will they come", "When is the appointment", "When is dinner",
    "Who is at the door", "Who called", "Who is coming today",
    "How are you doing", "How is the weather", "How long will it take",
    "How much does it cost", "How is everything",
    "Why is it taking so long", "Why did they leave",

    # "The ..." common noun patterns
    "The weather is nice today", "The food is good",
    "The doctor will come", "The nurse is here",
    "The medicine is working", "The pain is less today",
    "The family is coming", "The children are playing",
    "The morning was nice", "The evening was peaceful",
    "The water is warm", "The room is cold",

    # Time-related patterns
    "In the morning I want", "In the evening we can",
    "Tomorrow I want to", "Yesterday was a good day",
    "Today I am feeling", "This morning I had",
    "This evening I want", "Tonight I want to",
    "Every day I need", "Every morning they should",
    "Last night I could not sleep", "Last week was better",

    # Conversational patterns
    "Tell me about your day", "Tell me what happened",
    "Let me know when", "Let me think about it",
    "I am looking forward to", "I was thinking about",
    "We should talk about", "We need to discuss",
    "They should come and visit", "He said that he would",
    "She told me that", "It seems like the",
    "I would like to know", "I would like to have",
    "I should have told you", "I could not sleep",
    "We can try again tomorrow", "We will see what happens",

    # Emotional/social extended patterns
    "Thank you for everything", "Thank you for coming",
    "Thank you for your help", "Thank you so much",
    "I appreciate what you do", "I appreciate your effort",
    "I am sorry for the trouble", "I am sorry about that",
    "I am grateful for your support", "I am blessed to have you",
    "You are doing a great job", "You are very kind",
    "Take care of yourself", "Take some rest please",
    "Don't worry about me", "Don't forget to eat",
    "I will be fine", "Everything will be okay",
    "Life is getting better", "Things are improving",
    "I have been thinking about the future",
    "I want to spend time with family",
    "Send my regards to everyone",
    "I miss being outside",
    "The world is a beautiful place",

    # =========================================================================
    # HINGLISH PATTERNS — natural bilingual speech
    # =========================================================================
    "Mummy ko bulao", "Pani de do", "Dawa ka time ho gaya", "Chai de do please",
    "Mujhe dard ho raha hai", "Mujhe neend aa rahi hai", "Position change karo",
    "AC chalu karo", "Fan band karo", "Light band karo", "TV chalu karo",
    "Khana garam karo", "Khana halka chahiye", "Doodh garam karo",
    "Staff ko bulao", "Doctor ko call karo", "Suction kar do",
    "Sab theek hai", "Koi baat nahi", "Aaram se karo",
    "Dawai de do time pe", "Pani thanda chahiye", "Garam pani lao",
    "Kambal de do", "Takiya adjust karo", "Light off karo",
    "Phone lao", "Remote kidhar hai", "Nurse ko bulao",
    "Mujhe uthao", "Side change karo", "Kamar mein dard hai",
    "Pair mein dard hai", "Sar mein dard hai", "Pet mein taklif hai",

    # =========================================================================
    # QUESTION COMPLETIONS — what, where, when, who, how, why
    # =========================================================================
    "What time is it now", "What is for dinner today", "What did the doctor say",
    "Where is my phone", "Where is mummy", "Where is the remote",
    "When will doctor come", "When is medicine time", "When will they come",
    "Who is at the door", "Who called just now", "How are you feeling",
    "How is the weather today", "How long will it take", "Why is it taking so long",
    "What channel is this", "What happened today", "What is wrong",
    "Where did everyone go", "Where is my glasses", "Where is the wheelchair",
    "When is breakfast ready", "When is physiotherapy", "When will nurse come",
    "Who is coming today", "Who is on duty today", "Who will stay tonight",
    "How is papa doing", "How much medicine left", "Why is it so cold",

    # =========================================================================
    # EMOTIONAL PATTERNS — feelings, encouragement, gratitude
    # =========================================================================
    "I am feeling much better today", "I am not feeling well",
    "I am grateful for your help", "I miss talking to everyone",
    "I am proud of you", "Take care of yourself also",
    "Do not worry about me", "Everything will be fine",
    "I am feeling hopeful today", "I am feeling a bit low",
    "You make me happy",
    "I am sorry for the trouble", "I wish I could do more",
    "Keep up the good work", "You are doing great",
    "I feel safe with you", "I trust you completely",
    "God bless you all", "I pray for everyone",

    # =========================================================================
    # STAFF/CARE INSTRUCTIONS — medical and daily care
    # =========================================================================
    "Give medicine on time", "Check oxygen level", "Change the bedsheet",
    "Massage my legs gently", "Support my back properly",
    "Do not rush the sponging", "Be careful with the tube",
    "Check blood pressure twice daily", "Record the temperature",
    "Suction every two hours", "Nebulization before meals",
    "Give water through the funnel", "Elevate the bed head",
    "Apply cream on pressure areas", "Turn me every two hours",
    "Check the oxygen concentrator", "Replace the nasal cannula",
    "Prepare the ambu bag", "Keep emergency medicines ready",
    "Monitor breathing pattern", "Report any skin redness",

    # =========================================================================
    # DAILY ROUTINES — morning, afternoon, evening, night
    # =========================================================================
    "Start with tea and medicine", "Give sponge bath before breakfast",
    "Time for physiotherapy exercises", "Read the newspaper to me",
    "Put on some devotional music", "Lunch should be light today",
    "Afternoon rest time now", "Wake me at four o clock",
    "Evening walk in wheelchair", "Family video call after dinner",
    "Check everything before night", "Set the bed properly for sleep",
    "Morning prayer time", "Brush my teeth please", "Shave my face today",
    "Cut my nails please", "Clean my ears gently", "Wash my face please",

    # =========================================================================
    # SOCIAL & FAMILY — conversations, visitors, events
    # =========================================================================
    "How is everyone at home", "Tell the children I said hello",
    "I want to talk to bhaiya", "Ask didi to visit this weekend",
    "Send birthday wishes to him", "Congratulations to the family",
    "I remember the old days", "Those were good times",
    "Tell me about the grandchildren", "How is school going",
    "Is there any function coming", "Wedding preparations going well",
    "Tell them not to worry", "I am managing well here",
    "Send photos of the family", "Show me the video from yesterday",

    # =========================================================================
    # COMFORT & ENVIRONMENT — room, temperature, equipment
    # =========================================================================
    "Room is too cold please warm it", "Room is too hot turn on AC",
    "The noise is disturbing me", "Please close the window",
    "Open the curtains for sunlight", "The bed is uncomfortable",
    "Pillow needs to be higher", "Blanket is too heavy",
    "The light is too bright", "Keep a small light on",
    "Air freshener please", "The room smells bad",
    "Clean the floor please", "Arrange my things properly",
    "Keep water bottle within reach", "Put the call bell near me",

    # =========================================================================
    # FOOD & NUTRITION — specific requests
    # =========================================================================
    "I want something sweet", "I want something salty",
    "Make dal and rice for lunch", "I want soup for dinner",
    "Fruit juice please", "Give me banana shake",
    "No spicy food today", "I want soft food only",
    "Warm milk before sleep", "Give me curd rice",
    "I want boiled vegetables", "Make porridge for breakfast",
    "No oil in the food", "Add less salt please",
    "I want ice cream", "Give me coconut water",

    # =========================================================================
    # DAILY ROUTINE & SCHEDULE
    # =========================================================================
    "Wake me up at six", "Time for morning medicine",
    "Give me my morning tea first", "Start with sponging today",
    "Brush my teeth please", "Wash my face", "Comb my hair",
    "Time for breakfast now", "Give me my vitamins", "Check my blood sugar",
    "Time for physiotherapy", "Lunch should be light today",
    "I want to take a nap", "Wake me up after one hour",
    "Time for evening medicine", "What is for dinner tonight",
    "Give me warm milk before sleep", "Turn off all lights",
    "Today was a good day", "Ready for bed now",
    "Check everything before sleeping", "Keep water bottle near me",
    "Keep the bell near my hand", "Keep phone on charging",
    "Set the room temperature", "Night duty person should stay alert",
    "Morning staff should come on time", "Prepare my schedule for tomorrow",

    # =========================================================================
    # BODY POSITION & COMFORT
    # =========================================================================
    "Raise my head a little", "Lower my head please",
    "Tilt me slightly to the left", "Tilt me slightly to the right",
    "Straighten my legs", "Bend my knees a little",
    "Put support behind my back", "Support under my arms please",
    "My hand is sliding down", "Fix my hand position",
    "My foot is hanging off the bed", "Elevate my legs please",
    "I am sliding down on the bed", "Pull me up on the bed",
    "Adjust the bed angle", "Recline the bed more", "Make the bed flat",
    "My neck needs more support", "Put a roll under my neck",
    "My shoulder is hurting from this position",
    "I have been in this position too long",
    "Change me to the other side",
    "I want to sit in the wheelchair", "I want to go back to bed",
    "Put cushion under my knees",

    # =========================================================================
    # MEDICAL CARE INSTRUCTIONS
    # =========================================================================
    "Suction is needed now", "Oral suction first then TT",
    "Be gentle with the suction", "How much secretion came out",
    "Secretion is thick today", "Secretion is thin and clear",
    "Give nebulization before suction", "Start ambu bag for five minutes",
    "Check ventilator settings", "Oxygen saturation is dropping",
    "Increase the oxygen flow", "Check the tube position",
    "The tube is uncomfortable", "Tracheostomy site needs cleaning",
    "Apply ointment on the site", "Check for any redness or swelling",
    "Give me glycopyrolate for saliva", "Saliva is too much today",
    "I need mouth suctioning more often", "Give me the inhaler",
    "My chest feels congested", "Do chest physiotherapy",
    "Percussion on both sides", "Postural drainage needed",
    "Record my vitals now", "Write down the readings",
    "Show me my vitals chart", "Compare with yesterday readings",
    "Inform the doctor about this", "Schedule a doctor visit",

    # =========================================================================
    # FOOD & NUTRITION SPECIFICS
    # =========================================================================
    "I want something warm to eat", "I want something cold to drink",
    "Make it less spicy", "Add more salt", "No sugar in this",
    "Blend it smooth for me", "It should be easy to swallow",
    "Cut it into very small pieces", "Make it semi liquid",
    "I want curd rice today", "Give me dal with ghee",
    "Moong dal soup please", "Banana shake for me",
    "Apple juice without sugar", "Warm honey water",
    "Give me protein shake", "Ensure or supplement drink",
    "I want home cooked food", "No outside food today",
    "Give me a small portion", "I am full now thank you",
    "Save the rest for later", "Reheat my food please",
    "Feed me slowly please",

    # =========================================================================
    # FAMILY COMMUNICATION
    # =========================================================================
    "How are the children doing", "Show me their school photos",
    "Tell the children to study well",
    "I want to see the grandchildren", "Record a message for them",
    "Play the voice message again", "Tell them not to worry about me",
    "Send my blessings to everyone", "Plan a family video call",
    "I want to talk to my brother", "I want to talk to my sister",
    "Wish them happy birthday from me", "Wish them happy anniversary",
    "Help them with the paperwork", "Pay the bills on time",
    "Check the bank account", "Review the insurance papers",
    "Follow up on pending work", "Remind them about the appointment",

    # =========================================================================
    # EMOTIONAL EXPRESSION (positive and constructive)
    # =========================================================================
    "I appreciate everything you do", "You are doing a wonderful job",
    "I am proud of this family", "Your support means everything",
    "I feel blessed to have you", "Today I am in a good mood",
    "Let us talk about something nice", "Tell me some good news",
    "Play my favorite songs", "Show me family photos",
    "Read something inspiring to me", "I want to hear a story",
    "Tell me about your day", "What is happening in the world",
    "I want to express my gratitude", "Life is precious",
    "Every day is a gift",

    # =========================================================================
    # VISITORS & SOCIAL
    # =========================================================================
    "Who is visiting today", "I am ready for visitors now",
    "I need thirty minutes to rest first", "Please keep the visit short",
    "Tell them I enjoyed the visit", "Thank them for coming",
    "I do not want visitors right now", "Let only family come today",
    "Prepare tea for the guests", "Ask them to come again",

    # =========================================================================
    # TECHNOLOGY & ENTERTAINMENT
    # =========================================================================
    "Change the TV channel", "Put on the news channel",
    "Play cricket highlights", "Open YouTube on the TV",
    "Play devotional songs", "Play classical music",
    "Play old Hindi songs", "Increase the volume a little",
    "Decrease the volume", "Put on subtitles",
    "Read my messages to me", "Check my WhatsApp",
    "Show me today newspaper", "Read the headlines to me",

    # =========================================================================
    # WEATHER & ENVIRONMENT
    # =========================================================================
    "What is the weather outside", "Is it raining today",
    "Open the curtains I want to see outside",
    "The room is too dark", "The room needs fresh air",
    "Spray some room freshener", "Clean the room please",
    "Change the bed cover", "Put fresh flowers in the room",

    # =========================================================================
    # HOSPITAL AAC RESEARCH — Validated by speech therapists
    # Sources: OSU Medical Center boards, Patient Provider Communication
    # =========================================================================

    # Hospital/ICU Comfort
    "I am stuck in this position", "Pull me up in bed",
    "Adjust the footrest", "Adjust the recline",
    "Raise the head of the bed", "Lower the head of the bed",
    "I need a heating pad", "I need an ice pack",
    "I need lip balm", "I need lotion on my skin",
    "I feel nauseous", "I feel light headed", "I feel dizzy",
    "I have a headache", "I have a stomach ache",
    "My throat is sore", "I feel stiff all over", "I have a rash",

    # Personal Hygiene (hospital patient boards)
    "Wash my hair please", "Give me a shave",
    "Clip my nails", "Give me a bath", "Clean me up please",
    "I need a fresh gown", "I need clean clothes",
    "Get my glasses please", "Wipe my mouth",
    "Wipe my eyes", "Clean my nose",

    # Medical Status Communication
    "My breathing feels different", "Something does not feel right",
    "The pain is getting worse", "The pain is in a new place",
    "I feel better than yesterday", "I feel the same as yesterday",
    "I feel worse than yesterday", "The medicine is helping",
    "The medicine is not helping", "My mouth is very dry",
    "My eyes are very dry", "I feel very weak today",
    "I feel stronger today", "My throat feels tight",
    "I am having trouble swallowing", "I choked a little",

    # Communication About Communication
    "Wait I am not finished", "Let me finish my sentence",
    "I made a mistake start over", "You did not understand me",
    "Please read what I typed", "Say that again please",
    "Speak slower please", "Come closer I cannot see you",
    "I cannot hear you", "Move to my other side",
    "Look at the screen", "Read the screen please",

    # Time and Schedule Awareness
    "What day is it today", "What is the date today",
    "What time is it now", "How long have I been sleeping",
    "How long until my next medicine", "When is the doctor coming",
    "When is my next meal", "Is it morning or evening",
    "What is happening today",

    # Emotional Needs (ALS communication research)
    "I need some quiet time alone", "I want company please",
    "I am feeling lonely", "I am feeling anxious", "I feel overwhelmed",
    "I need to rest my eyes", "Can we just sit together quietly",
    "Hold my hand please", "I want to listen to something calming",
    "I need a break from talking", "I want to see the sky outside",
    "Open the window I want fresh air",

    # Safety and Alerts
    "Something is beeping", "The alarm is going off",
    "Check the machine", "I cannot reach the call button",
    "My tube feels wrong", "Something is leaking",
    "I am about to cough", "I need suctioning right now",
    "Hold my head please", "Support my neck",

    # Night Time Specific
    "I cannot sleep", "I need to change position again",
    "Check on me in thirty minutes", "Do not wake me unless urgent",
    "Leave a small light on", "Play soft music for me",
    "I am comfortable now thank you", "Good night see you in the morning",

    # Gratitude and Positive (message banking guidelines)
    "You are very kind", "I appreciate your patience",
    "That was exactly what I needed", "You understood me perfectly",
    "That feels much better now", "You make my day better",
    "I am lucky to have such good care", "Please thank everyone for me",
    "You are getting better at understanding me",
    "I feel safe with you here",
]

# ============================================
# HINDI TRAINING CORPUS — Devanagari sentences for n-gram model
# ============================================

HINDI_TRAINING_CORPUS = [
    # Basic Needs
    "मुझे पानी चाहिए", "मुझे पानी दो", "मुझे ठंडा पानी चाहिए", "मुझे गरम पानी चाहिए",
    "मुझे दवा दो", "मुझे दवाई का समय हो गया", "मुझे खाना खिलाओ",
    "मुझे भूख लगी है", "मुझे प्यास लगी है", "मुझे नींद आ रही है",
    "मुझे टॉयलेट जाना है", "मुझे सक्शन चाहिए", "मुझे नेबुलाइज़र चाहिए",

    # Position/Comfort
    "मेरी पोज़ीशन बदलो", "मुझे बाएँ करवट करो", "मुझे दाएँ करवट करो", "मुझे सीधा करो",
    "तकिया ठीक करो", "कंबल ठीक करो", "चादर बदलो",
    "पंखा चालू करो", "पंखा बंद करो", "एसी चालू करो", "एसी बंद करो",
    "लाइट बंद करो", "लाइट चालू करो", "बहुत ठंड है", "बहुत गर्मी है",

    # Pain/Medical
    "दर्द हो रहा है", "पीठ में दर्द है", "गर्दन में दर्द है", "पेट में दर्द है",
    "सीने में तकलीफ है", "सांस लेने में तकलीफ", "बीपी चेक करो", "तापमान चेक करो",
    "ऑक्सीजन चेक करो", "दवाई काम नहीं कर रही", "दर्द बढ़ रहा है", "दर्द कम है आज",
    "डॉक्टर को बुलाओ", "नर्स को बुलाओ",

    # Family/Communication
    "मम्मी को बुलाओ", "मम्मी कहाँ है", "मम्मी से बात करनी है", "मम्मी को आराम करने दो",
    "पापा को फोन करो", "भैया को बुलाओ", "दीदी को बताओ", "बच्चों को बुलाओ",
    "सबको नमस्ते बोलो", "मैं ठीक हूँ सबको बताओ", "मुझे अकेला मत छोड़ो", "मेरे पास रहो",

    # Food/Drink
    "चाय दो", "काली चाय दो", "चाय में चीनी कम", "दूध गरम करो", "दूध ठंडा चाहिए",
    "खाना गरम करो", "हल्का खाना चाहिए", "दलिया बनाओ", "खिचड़ी बनाओ",
    "फल काटो", "जूस दो", "सूप दो", "अंडा दो", "रोटी दो",

    # Staff Instructions
    "स्टाफ को बुलाओ", "स्टाफ को बताओ", "सावधानी से करो", "धीरे करो", "जल्दी करो",
    "ध्यान से करो", "समय पर दवा दो", "समय पर खाना दो", "सफाई करो",
    "स्पंजिंग का समय है", "मालिश करो", "व्यायाम का समय है",

    # Emotions/Social
    "मैं ठीक हूँ", "मैं खुश हूँ", "मैं परेशान हूँ", "मैं चिंतित हूँ", "मैं थक गया हूँ",
    "मैं बेहतर महसूस कर रहा हूँ", "आज अच्छा दिन है", "सब ठीक है",
    "चिंता मत करो", "भगवान का शुक्र है", "धन्यवाद आपकी मदद के लिए",
    "शुभरात्रि", "शुभप्रभात",

    # Questions
    "क्या समय हुआ", "खाने में क्या है", "डॉक्टर कब आएंगे", "कौन आया है",
    "बाहर मौसम कैसा है", "आज कौन सा दिन है", "दवाई कब देनी है",

    # Time Patterns
    "सुबह की चाय दो", "सुबह की दवाई दो", "दोपहर का खाना", "शाम की चाय",
    "रात की दवाई", "सोने का समय हो गया", "सुबह का व्यायाम", "रात को नींद नहीं आई",

    # Jellow-Inspired: Hygiene & Body Care
    "मुँह साफ करो", "दांत साफ करो", "नाखून काटो", "दाढ़ी बनाओ", "कान साफ करो",
    "शरीर पर लोशन लगाओ", "डायपर बदलो", "कपड़े बदलो", "तौलिया लाओ",

    # Jellow-Inspired: Environment Control
    "खिड़की खोलो", "खिड़की बंद करो", "पर्दे खोलो", "पर्दे बंद करो",
    "दरवाज़ा बंद करो", "शोर कम करो", "टीवी बंद करो", "म्यूज़िक चालू करो",

    # Jellow-Inspired: Emergency (ALS)
    "जल्दी आओ", "सांस नहीं आ रही", "एम्बुलेंस बुलाओ", "सबको बुलाओ",
    "वेंटिलेटर का अलार्म देखो", "ऑक्सीजन कम हो रही है",

    # Jellow-Inspired: Daily Schedule
    "दवाई का समय हो गया", "खाना खिलाओ अब", "सोने का समय हो गया",
    "बीपी चेक करने का समय है", "सक्शन करने का समय है", "नेबुलाइज़र देने का समय है",

    # Jellow-Inspired: Visitor/Social
    "फोन पर बात करवाओ", "वीडियो कॉल करो", "फोन उठाओ", "फोटो दिखाओ",

    # Jellow-Inspired: Spiritual
    "आरती का समय हो गया", "भजन सुनाओ", "प्रसाद लाओ", "भगवान का शुक्र है",

    # Jellow-Inspired: Caregiver Management
    "स्टाफ को ट्रेनिंग दो", "स्टाफ अच्छा काम कर रहा है",
    "रात की ड्यूटी किसकी है", "स्टाफ को सावधान रहने बोलो",
]

# ============================================
# PREFIX TRIE — O(k) prefix lookup
# ============================================

class PrefixTrie:
    """
    Trie for fast prefix-based word lookup.
    Built once at startup, queried on every keystroke.

    Instead of scanning 3000 words: O(n) per keystroke
    Walk k tree nodes where k = prefix length: O(k) per keystroke

    For prefix "wa" with 3000 words: ~750x faster lookup.
    Supports Unicode (Devanagari) — dict keys work with any characters.
    """

    __slots__ = ('children', 'words')

    def __init__(self):
        self.children: Dict[str, 'PrefixTrie'] = {}
        self.words: List[str] = []  # all words passing through this node

    def insert(self, word: str):
        """Insert a word. O(len(word))."""
        node = self
        w_lower = word.lower()
        for ch in w_lower:
            if ch not in node.children:
                node.children[ch] = PrefixTrie()
            node = node.children[ch]
            node.words.append(word)

    def search(self, prefix: str, limit: int = 50) -> List[str]:
        """Find all words matching prefix. O(k) where k = len(prefix)."""
        node = self
        for ch in prefix.lower():
            if ch not in node.children:
                return []
            node = node.children[ch]
        return node.words[:limit]

    def __contains__(self, prefix: str) -> bool:
        """Check if any word starts with this prefix. O(k)."""
        node = self
        for ch in prefix.lower():
            if ch not in node.children:
                return False
            node = node.children[ch]
        return len(node.words) > 0

    @classmethod
    def build(cls, words) -> 'PrefixTrie':
        """Build a trie from an iterable of words."""
        root = cls()
        for word in words:
            if word:  # skip empty strings
                root.insert(word)
        return root


# ============================================
# N-GRAM LANGUAGE MODEL
# ============================================

class NGramModel:
    """N-gram language model with interpolation smoothing."""

    def __init__(self, n: int = 3):
        self.n = n
        self.unigrams: Dict[str, int] = defaultdict(int)
        self.bigrams: Dict[Tuple[str, str], int] = defaultdict(int)
        self.trigrams: Dict[Tuple[str, str, str], int] = defaultdict(int)
        self.total_unigrams = 0
        self.total_bigrams = 0
        self.total_trigrams = 0
        self.bigram_contexts: Dict[str, Set[str]] = defaultdict(set)
        self.trigram_contexts: Dict[Tuple[str, str], Set[str]] = defaultdict(set)

    def _tokenize(self, text: str) -> List[str]:
        """Word tokenization — alphabetic and Devanagari words."""
        # \u0900-\u097F covers the Devanagari Unicode block
        return [w for w in re.findall(r'[a-zA-Z\u0900-\u097F]+', text.lower())
                if (len(w) >= MIN_WORD_LENGTH or w in {'i', 'a'} or re.search(r'[\u0900-\u097F]', w))
                and not is_blocked_prediction_word(w)]

    def train(self, text: str):
        """Train model on text."""
        words = self._tokenize(text)
        for i, word in enumerate(words):
            self.unigrams[word] += 1
            self.total_unigrams += 1
            if i > 0:
                prev = words[i - 1]
                self.bigrams[(prev, word)] += 1
                self.bigram_contexts[prev].add(word)
                self.total_bigrams += 1
            if i > 1:
                prev2, prev1 = words[i - 2], words[i - 1]
                self.trigrams[(prev2, prev1, word)] += 1
                self.trigram_contexts[(prev2, prev1)].add(word)
                self.total_trigrams += 1

    def train_sentences(self, sentences: List[str]):
        for s in sentences:
            self.train(s)

    def get_probability(self, word: str, context: Tuple[str, ...] = ()) -> float:
        """Interpolated probability: unigram + bigram + trigram."""
        w1, w2, w3 = 0.15, 0.35, 0.50
        vocab_size = max(len(self.unigrams), 1)

        # Unigram
        p1 = (self.unigrams.get(word, 0) + 1) / (self.total_unigrams + vocab_size)

        # Bigram
        p2 = p1
        if len(context) >= 1:
            prev = context[-1]
            ctx_total = sum(self.bigrams[(prev, w)] for w in self.bigram_contexts.get(prev, set()))
            if ctx_total > 0:
                p2 = (self.bigrams.get((prev, word), 0) + 1) / (ctx_total + vocab_size)

        # Trigram
        p3 = p2
        if len(context) >= 2:
            key = (context[-2], context[-1])
            ctx_total = sum(self.trigrams[(key[0], key[1], w)]
                           for w in self.trigram_contexts.get(key, set()))
            if ctx_total > 0:
                p3 = (self.trigrams.get((context[-2], context[-1], word), 0) + 1) / (ctx_total + vocab_size)

        return w1 * p1 + w2 * p2 + w3 * p3

    def predict(self, context: Tuple[str, ...], prefix: str = '',
                top_k: int = 5) -> List[Tuple[str, float]]:
        """Predict next words given context and prefix."""
        candidates = {}
        # Score all known words that match prefix
        if prefix:
            # Trie lookup: O(k) where k = len(prefix), vs O(n) set scan
            search_set = set(self._trie.search(prefix, limit=50)) if hasattr(self, '_trie') else \
                         {w for w in (set(self.unigrams.keys()) | ALL_VOCABULARY) if w.startswith(prefix.lower())}
        else:
            search_set = set(self.unigrams.keys()) | ALL_VOCABULARY
        # Enforce min length on English words (Devanagari words pass regardless of length)
        search_set = {
            w for w in search_set
            if is_valid_prediction_token(w, min_length=MIN_WORD_LENGTH)
        }

        for word in search_set:
            candidates[word] = self.get_probability(word, context)

        return sorted(candidates.items(), key=lambda x: -x[1])[:top_k]

    def load_smart_bigrams(self, path: str):
        """
        Load pre-computed bigram frequencies from smart_bigrams.json.
        Merges additively into existing n-gram data — does NOT replace
        patient-learned data, only adds to it.
        """
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            bigrams_data = data.get('bigrams', {})
            unigrams_data = data.get('unigrams', {})

            # Merge unigrams
            for word, count in unigrams_data.items():
                self.unigrams[word] += count
                self.total_unigrams += count

            # Merge bigrams
            for w1, followers in bigrams_data.items():
                for w2, count in followers.items():
                    self.bigrams[(w1, w2)] += count
                    self.bigram_contexts[w1].add(w2)
                    self.total_bigrams += count
                    # Also ensure both words are in unigrams (if not already)
                    if w1 not in self.unigrams:
                        self.unigrams[w1] = 1
                        self.total_unigrams += 1
                    if w2 not in self.unigrams:
                        self.unigrams[w2] = 1
                        self.total_unigrams += 1

            print(f"[SmartBigrams] Loaded {sum(len(v) for v in bigrams_data.values())} "
                  f"bigram pairs from {len(bigrams_data)} context words")
        except FileNotFoundError:
            print(f"[SmartBigrams] File not found: {path} (skipping)")
        except Exception as e:
            print(f"[SmartBigrams] Error loading: {e} (skipping)")


# ============================================
# RECENCY TRACKER — Time-decay word frequency
# ============================================

class RecencyTracker:
    """Time-decay word frequency. Words used recently score higher, boost fades over 72h."""

    def __init__(self, data_dir: Path, half_life_hours: float = 72.0):
        self.usage: Dict[str, List[float]] = defaultdict(list)
        self._half_life = half_life_hours * 3600.0
        self._path = data_dir / "recency_scores.json"
        self._dirty = False
        self._load()

    def record_sentence(self, sentence: str):
        words = re.findall(r'[a-zA-Z\u0900-\u097F]+', sentence.lower())
        now = time.time()
        cutoff = now - (30 * 86400)  # prune > 30 days
        for w in words:
            if is_valid_prediction_token(w, min_length=2):
                self.usage[w] = [t for t in self.usage[w] if t > cutoff]
                self.usage[w].append(now)
        self._dirty = True

    def score(self, word: str) -> float:
        timestamps = self.usage.get(word.lower(), [])
        if not timestamps:
            return 0.0
        now = time.time()
        return sum(math.exp(-0.693 * (now - t) / self._half_life) for t in timestamps)

    def save(self):
        if not self._dirty:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, 'w', encoding='utf-8') as f:
            json.dump(dict(self.usage), f, ensure_ascii=False)
        self._dirty = False

    def _load(self):
        if self._path.exists():
            try:
                with open(self._path, 'r', encoding='utf-8') as f:
                    raw_usage = json.load(f)
                sanitized = {}
                for raw_word, timestamps in raw_usage.items():
                    word = normalize_prediction_word(raw_word)
                    if not is_valid_prediction_token(word, min_length=2):
                        continue
                    sanitized[word] = timestamps
                self.usage = defaultdict(list, sanitized)
            except Exception:
                pass


# ============================================
# PATIENT BIGRAM TRACKER — Learn word pairs
# ============================================

class PatientBigramTracker:
    """Learn word pairs from patient's actual typing. Biggest accuracy gain."""

    def __init__(self, data_dir: Path):
        self.pairs: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._path = data_dir / "patient_bigrams.json"
        self._dirty = False
        self._load()

    def learn(self, sentence: str):
        words = [
            w.lower()
            for w in re.findall(r'[a-zA-Z\u0900-\u097F]+', sentence)
            if is_valid_prediction_token(w, min_length=2)
        ]
        for i in range(len(words) - 1):
            self.pairs[words[i]][words[i + 1]] += 1
        self._dirty = True

    def next_word_scores(self, prev_word: str, prefix: str = '') -> Dict[str, float]:
        prev = prev_word.lower()
        if prev not in self.pairs:
            return {}
        cands = self.pairs[prev]
        if prefix:
            cands = {w: c for w, c in cands.items() if w.startswith(prefix.lower())}
        total = sum(cands.values())
        return {w: c / total for w, c in cands.items()} if total else {}

    def save(self):
        if not self._dirty:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # Prune: keep only pairs with count >= 2 if total > 5000
        data = {k: dict(v) for k, v in self.pairs.items()}
        total = sum(len(v) for v in data.values())
        if total > 5000:
            data = {k: {w: c for w, c in v.items() if c >= 2} for k, v in data.items()}
            data = {k: v for k, v in data.items() if v}
        with open(self._path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        self._dirty = False

    def _load(self):
        if self._path.exists():
            try:
                with open(self._path, 'r', encoding='utf-8') as f:
                    raw = json.load(f)
                for k, v in raw.items():
                    prev = normalize_prediction_word(k)
                    if not is_valid_prediction_token(prev, min_length=2):
                        continue
                    for k2, v2 in v.items():
                        nxt = normalize_prediction_word(k2)
                        if not is_valid_prediction_token(nxt, min_length=2):
                            continue
                        self.pairs[prev][nxt] = v2
            except Exception:
                pass


# ============================================
# EDIT DISTANCE — Typo tolerance for gaze typing
# ============================================

def _levenshtein(s1: str, s2: str) -> int:
    """
    Levenshtein edit distance. O(m*n) time, O(min(m,n)) space.

    Used for gaze-typing typo tolerance:
    "watee" → "water" = distance 1 (substitute e→r)
    "positon" → "position" = distance 1 (insert i)
    """
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)

    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            cost = 0 if c1 == c2 else 1
            curr.append(min(
                curr[j] + 1,      # insert
                prev[j + 1] + 1,  # delete
                prev[j] + cost    # substitute
            ))
        prev = curr
    return prev[-1]


def _fuzzy_word_matches(prefix: str, vocabulary, max_distance: int = 1, limit: int = 10) -> List[str]:
    """
    Find words in vocabulary that are within edit distance of prefix.
    Used as fallback when exact prefix matching returns too few results.

    Only checks words of similar length (±2 chars) to avoid wasting time
    on obviously different words.

    Args:
        prefix: What the patient typed (possibly with typos)
        vocabulary: Set of valid words to check against
        max_distance: Maximum edit distance (1 = single typo)
        limit: Max results to return

    Returns:
        List of words within edit distance, sorted by distance then word length
    """
    prefix_lower = prefix.lower()
    prefix_len = len(prefix_lower)

    # Only check words of similar length — huge speedup
    min_len = max(MIN_WORD_LENGTH, prefix_len - 2)
    max_len = prefix_len + 2

    matches = []
    for word in vocabulary:
        w_lower = word.lower()
        w_len = len(w_lower)

        # Length filter — skip words that can't possibly match within max_distance
        if w_len < min_len or w_len > max_len:
            continue

        # Compute edit distance
        dist = _levenshtein(prefix_lower, w_lower)
        if dist <= max_distance:
            matches.append((word, dist))

    # Sort: exact matches first (dist=0), then by word length (shorter = more common)
    matches.sort(key=lambda x: (x[0], len(x[0])))
    return [w for w, d in matches[:limit]]


# ============================================
# TIME-OF-DAY BOOST
# ============================================

_MORNING = {'breakfast','tea','chai','medicine','dawa','tablet','morning','milk','doodh',
            'bath','sponging','exercise','physiotherapy','nebulizer','bp','sugar','dalia','roti','toast',
            'चाय','दूध','दवा','दवाई','सुबह','व्यायाम','नाश्ता','गोली','फिजियोथेरेपी',
            'स्पंजिंग','नेबुलाइज़र','बीपी','दलिया','रोटी','पराठा','शुभप्रभात'}
_AFTERNOON = {'lunch','khana','rest','aram','sleep','nap','water','pani','position','dal','rice','soup','juice',
              'खाना','दाल','चावल','आराम','नींद','पानी','सूप','जूस','दोपहर'}
_EVENING = {'dinner','evening','shaam','news','tv','family','call','phone','visitor','snack',
            'शाम','खबर','टीवी','फोन','मेहमान','बिस्किट','परिवार'}
_NIGHT = {'sleep','neend','blanket','kambal','position','comfortable','pillow','takiya','dark','quiet',
          'night','raat','pain','dard','toilet','goodnight','turn','cover','cold','warm','garam',
          'नींद','कंबल','तकिया','अंधेरा','शांत','रात','दर्द','टॉयलेट','शुभरात्रि','ठंड','गर्मी'}

def _time_boost(word: str) -> float:
    h = datetime.now().hour
    w = word.lower()
    if 5 <= h < 11 and w in _MORNING: return 1.8
    if 11 <= h < 16 and w in _AFTERNOON: return 1.5
    if 16 <= h < 21 and w in _EVENING: return 1.5
    if (h >= 21 or h < 5) and w in _NIGHT: return 1.8
    return 1.0


# ============================================
# WORD PREDICTION ENGINE
# ============================================

@dataclass
class PredictionResult:
    """Result from word prediction."""
    word: str
    score: float
    source: str  # 'ngram', 'core', 'recent', 'patient', 'abbreviation'


class WordPredictionEngine:
    """
    Enhanced word prediction with:
    - Rich n-gram model (3000+ vocab)
    - Core vocabulary boosting
    - Patient history boosting
    - Recency and frequency weighting
    - Abbreviation expansion
    - Min 3-letter filter
    - Max 5 predictions
    """

    # Boost factors
    CORE_BOOST = 1.5
    PATIENT_BOOST = 2.0       # Patient's own words get highest boost
    RECENT_BOOST = 2.5
    FREQUENCY_BOOST = 1.4
    MEDICAL_BOOST = 1.3
    HINGLISH_BOOST = 1.6      # High priority for natural speech
    CULTURAL_BOOST = 1.7
    TOPIC_BOOST_CAP = 0.28


    # Display limits
    MAX_PREDICTIONS = 12
    MIN_WORD_LENGTH = MIN_WORD_LENGTH  # 3

    def __init__(self, data_dir: str = './data'):
        self.ngram = NGramModel(n=3)
        self.user_frequencies: Dict[str, int] = defaultdict(int)
        self.recent_words: List[str] = []
        self.max_recent = 100
        self.custom_words: Set[str] = set()
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.dictionary_file = self.data_dir / 'custom_dictionary.json'

        # Patient-specific trackers for improved accuracy
        self._patient_data_dir = Path(self.dictionary_file).parent / 'patient_data'
        self._patient_data_dir.mkdir(parents=True, exist_ok=True)
        self.recency = RecencyTracker(self._patient_data_dir)
        self.bigrams = PatientBigramTracker(self._patient_data_dir)
        self._topic_word_sets = self._build_topic_word_sets()

        self._initialize()
        self._load_custom_abbreviations()
        self.load()  # Load saved words on startup

        # ---- GazeConnect Neural Language Model (CIFG-LSTM) ----
        # Provides deep semantic predictions fused with n-gram results
        self._neural_predictor = None
        self._neural_fusion = None
        self._init_neural_model()

    def _normalize_topic(self, category: Optional[str]) -> Optional[str]:
        if not category:
            return None
        mapping = {
            'basic': 'basic',
            'basic_needs': 'basic',
            'medical': 'medical',
            'position': 'comfort',
            'comfort': 'comfort',
            'caregiver': 'comfort',
            'feelings': 'emotion',
            'emotion': 'emotion',
            'social': 'greet',
            'communication': 'greet',
            'greet': 'greet',
            'emergency': 'emergency',
            'family': 'family',
        }
        return mapping.get(category)

    def _build_topic_word_sets(self) -> Dict[str, Set[str]]:
        topic_words: Dict[str, Set[str]] = {
            'basic': set(),
            'medical': set(),
            'comfort': set(),
            'family': set(),
            'emotion': set(),
            'greet': set(),
            'emergency': set(),
        }

        for category, phrases in AAC_PHRASES.items():
            normalized = self._normalize_topic(category)
            if not normalized:
                continue
            for phrase in phrases:
                topic_words[normalized].update(
                    re.findall(r'[a-zA-Z\u0900-\u097F]+', phrase.lower())
                )

        topic_words['medical'].update(MEDICAL_VOCABULARY)
        topic_words['basic'].update({
            'water', 'food', 'bathroom', 'toilet', 'rest', 'sleep',
            'tea', 'hungry', 'thirsty', 'paani', 'pani', 'khana',
            'neend', 'bathroom', 'bath', 'juice',
        })
        topic_words['comfort'].update({
            'turn', 'position', 'pillow', 'blanket', 'comfortable', 'bed',
            'support', 'adjust', 'left', 'right', 'fan', 'light',
            'karvat', 'aaram', 'sit', 'stand',
        })
        topic_words['family'].update({
            'family', 'mother', 'father', 'mom', 'dad', 'mummy', 'papa',
            'son', 'daughter', 'brother', 'sister', 'wife', 'husband',
            'bhaiya', 'didi', 'home',
        })
        topic_words['emotion'].update({
            'happy', 'sad', 'worried', 'scared', 'frustrated', 'hopeful',
            'better', 'miss', 'love', 'calm', 'upset', 'khush',
        })
        topic_words['greet'].update({
            'hello', 'hi', 'good', 'morning', 'evening', 'night',
            'thank', 'thanks', 'please', 'namaste', 'suprabhat',
            'bye', 'yes', 'no',
        })
        topic_words['emergency'].update({
            'help', 'urgent', 'emergency', 'immediately', 'breathe',
            'breathing', 'oxygen', 'ambulance', 'doctor', 'suction',
            'jaldi', 'abhi',
        })

        return {
            topic: {
                token for token in words
                if len(token) >= 2 or re.search(r'[\u0900-\u097F]', token)
            }
            for topic, words in topic_words.items()
        }

    def _topic_multiplier(self, word: str, topic_boosts: Optional[Dict[str, float]]) -> float:
        if not topic_boosts:
            return 1.0

        best_strength = 0.0
        for topic, words in self._topic_word_sets.items():
            if topic not in topic_boosts:
                continue
            if word in words:
                best_strength = max(best_strength, float(topic_boosts.get(topic, 0.0)))

        if best_strength <= 0:
            return 1.0

        return 1.0 + min(self.TOPIC_BOOST_CAP, 0.22 * best_strength)

    def _initialize(self):
        """Initialize n-gram model with rich training data."""
        # 1. Train on AAC phrases
        for category, phrases in AAC_PHRASES.items():
            self.ngram.train_sentences(phrases)

        # 2. Train on expanded corpus (high weight — repeat 3×)
        for _ in range(3):
            self.ngram.train_sentences(TRAINING_CORPUS)

        # 3. Train Hindi corpus (same 3× weight)
        for _ in range(3):
            self.ngram.train_sentences(HINDI_TRAINING_CORPUS)

        # 4. Seed all vocabulary words into unigrams (so they're findable)
        for word in ALL_VOCABULARY:
            if word not in self.ngram.unigrams:
                self.ngram.unigrams[word] = 1
                self.ngram.total_unigrams += 1

        # 5. Load smart bigrams (pre-computed large corpus data)
        smart_bigrams_path = self.data_dir / 'smart_bigrams.json'
        if not smart_bigrams_path.exists():
            # Also check relative to this source file (installed location)
            smart_bigrams_path = Path(__file__).parent.parent / 'data' / 'smart_bigrams.json'
        self.ngram.load_smart_bigrams(str(smart_bigrams_path))

        # 6. Seed critical context bigrams that the corpus misses.
        # Words like "me", "my" appear in many sentences but their followers
        # get diluted across too many contexts. These hand-seeded pairs ensure
        # Google-keyboard-style context predictions work for common AAC phrases.
        _context_seeds = {
            # "turn me ___"
            ('turn', 'me'): ['left', 'right', 'over', 'back', 'slowly', 'carefully'],
            ('me', 'on'): ['left', 'right', 'back', 'side'],
            ('me', 'to'): ['left', 'right', 'side', 'back', 'bed', 'wheelchair'],
            # "check my ___"
            ('check', 'my'): ['vitals', 'blood', 'pressure', 'temperature', 'oxygen', 'sugar', 'pulse'],
            # "change my ___"
            ('change', 'my'): ['position', 'clothes', 'diaper', 'sheet', 'pillow', 'mask'],
            # "give me ___"
            ('give', 'me'): ['water', 'medicine', 'food', 'time', 'pillow', 'blanket'],
            # "raise my ___"
            ('raise', 'my'): ['head', 'legs', 'bed', 'back', 'arm'],
            # "lower my ___"
            ('lower', 'my'): ['head', 'legs', 'bed', 'back'],
            # "the pain is ___"
            ('pain', 'is'): ['getting', 'worse', 'better', 'bad', 'severe', 'less', 'unbearable'],
            # "I am ___"
            ('i', 'am'): ['tired', 'hungry', 'thirsty', 'cold', 'hot', 'pain', 'uncomfortable', 'feeling', 'having', 'fine', 'okay'],
            # "I want ___"
            ('i', 'want'): ['to', 'water', 'food', 'tea', 'rest', 'sleep', 'help', 'medicine'],
            # "can you ___"
            ('can', 'you'): ['help', 'come', 'turn', 'call', 'check', 'bring', 'give', 'open', 'close', 'adjust'],
            # "can I ___"
            ('can', 'i'): ['have', 'get', 'go', 'rest', 'call', 'see', 'talk', 'ask'],
            # "I need ___"
            ('i', 'need'): ['to', 'help', 'water', 'suction', 'medicine', 'rest', 'oxygen', 'pillow', 'blanket'],
            # "need to ___" / "want to ___"
            ('need', 'to'): ['change', 'rest', 'sit', 'sleep', 'call', 'talk', 'use', 'breathe'],
            ('want', 'to'): ['rest', 'sleep', 'sit', 'eat', 'drink', 'talk', 'call', 'go'],
            # "I cannot ___"
            ('i', 'cannot'): ['breathe', 'swallow', 'sleep', 'move', 'speak', 'see', 'hear'],
            ('cannot', 'breathe'): ['properly', 'well', 'please', 'help'],
            # Symptom phrasing
            ('my', 'breathing'): ['is', 'feels'],
            ('breathing', 'is'): ['difficult', 'better', 'worse', 'okay', 'not'],
            ('my', 'pain'): ['is', 'medicine'],
            ('my', 'back'): ['hurts', 'painful'],
            # "the food is ___"
            ('food', 'is'): ['good', 'hot', 'cold', 'spicy', 'salty', 'bland', 'thick', 'enough'],
            # "my breathing is ___"
            ('breathing', 'is'): ['difficult', 'hard', 'better', 'worse', 'normal', 'labored'],
            # "I have ___"
            ('i', 'have'): ['pain', 'headache', 'fever', 'cramps', 'difficulty', 'acidity'],
            # "my legs are ___"
            ('legs', 'are'): ['cramping', 'hurting', 'numb', 'stiff', 'cold', 'swollen'],
            # "my back ___"
            ('my', 'back'): ['hurts', 'pain', 'needs', 'support', 'itching'],
            # "room is ___"
            ('room', 'is'): ['hot', 'cold', 'dark', 'bright', 'noisy', 'dusty'],
            # "what time ___"
            ('what', 'time'): ['is', 'will', 'did', 'should'],
            ('time', 'is'): ['it', 'the', 'my', 'next'],
            # "help me ___"
            ('help', 'me'): ['sit', 'stand', 'turn', 'eat', 'drink', 'move', 'please', 'up'],
            # "it is ___"
            ('it', 'is'): ['time', 'hot', 'cold', 'painful', 'better', 'okay', 'fine', 'hurting'],
            # "too much ___"
            ('too', 'much'): ['pain', 'saliva', 'noise', 'light', 'pressure'],

            # ---------- More conversation patterns ----------
            # "please turn ___"
            ('please', 'turn'): ['me', 'off', 'on', 'down', 'left', 'right'],
            # "please give ___"
            ('please', 'give'): ['me', 'water', 'medicine', 'food', 'time'],
            # "please check ___"
            ('please', 'check'): ['my', 'the', 'vitals', 'temperature', 'oxygen'],
            # "please call ___"
            ('please', 'call'): ['doctor', 'nurse', 'family', 'son', 'daughter'],
            # "please bring ___"
            ('please', 'bring'): ['water', 'medicine', 'food', 'pillow', 'blanket'],
            # "please adjust ___"
            ('please', 'adjust'): ['pillow', 'bed', 'blanket', 'oxygen', 'bipap', 'mask'],
            # "please clean ___"
            ('please', 'clean'): ['face', 'mouth', 'hands', 'neck', 'nose', 'eyes'],
            # "want to ___"
            ('want', 'to'): ['sleep', 'rest', 'eat', 'drink', 'talk', 'watch', 'sit', 'stand', 'go'],
            # "need to ___"
            ('need', 'to'): ['rest', 'eat', 'drink', 'sleep', 'talk', 'use', 'see', 'go'],
            # "how are ___"
            ('how', 'are'): ['you', 'things', 'children', 'everyone'],
            # "how is ___"
            ('how', 'is'): ['everyone', 'work', 'weather', 'health', 'baby'],
            # "when is ___"
            ('when', 'is'): ['doctor', 'lunch', 'dinner', 'medicine', 'next', 'the'],
            # "where is ___"
            ('where', 'is'): ['my', 'the', 'everyone', 'doctor', 'nurse'],
            # "who is ___"
            ('who', 'is'): ['there', 'coming', 'that', 'calling', 'outside'],
            # "tell them ___"
            ('tell', 'them'): ['not', 'please', 'about', 'everything', 'okay'],
            # "tell the ___"
            ('tell', 'the'): ['doctor', 'nurse', 'family', 'staff', 'caretaker'],
            # "don't ___"
            ("don't", 'worry'): ['about', 'please'],
            # "I will ___"
            ('i', 'will'): ['rest', 'eat', 'sleep', 'try', 'wait', 'tell', 'call'],
            # "I can ___"
            ('i', 'can'): ['not', 'feel', 'see', 'hear', 'try', 'eat', 'breathe'],
            # "bring me ___"
            ('bring', 'me'): ['water', 'food', 'medicine', 'pillow', 'blanket', 'phone'],
            # "put the ___"
            ('put', 'the'): ['pillow', 'blanket', 'medicine', 'phone', 'remote', 'fan'],
            # "open the ___"
            ('open', 'the'): ['window', 'door', 'curtain', 'curtains'],
            # "close the ___"
            ('close', 'the'): ['window', 'door', 'curtain', 'curtains', 'light'],
            # "turn on ___"
            ('turn', 'on'): ['the', 'fan', 'light', 'tv', 'ac'],
            # "turn off ___"
            ('turn', 'off'): ['the', 'fan', 'light', 'tv', 'ac'],
            # "switch on ___"
            ('switch', 'on'): ['the', 'fan', 'light', 'tv', 'ac'],
            # "switch off ___"
            ('switch', 'off'): ['the', 'fan', 'light', 'tv', 'ac'],
            # "on my ___"
            ('on', 'my'): ['left', 'right', 'back', 'side', 'body', 'face', 'head', 'legs'],
            # "is very ___"
            ('is', 'very'): ['hot', 'cold', 'painful', 'difficult', 'good', 'bad', 'important'],
            # "am very ___"
            ('am', 'very'): ['tired', 'hungry', 'thirsty', 'cold', 'hot', 'uncomfortable', 'happy'],
            # "is not ___"
            ('is', 'not'): ['working', 'good', 'right', 'enough', 'fitting', 'comfortable'],
            # "do not ___"
            ('do', 'not'): ['worry', 'touch', 'move', 'leave', 'forget', 'stop'],
            # "thank you ___"
            ('thank', 'you'): ['for', 'very', 'so'],
            ('you', 'for'): ['helping', 'everything', 'coming', 'taking', 'your'],
            # "good morning ___" / "good night ___"
            ('good', 'morning'): ['everyone', 'dear', 'how'],
            ('good', 'night'): ['dear', 'everyone', 'sleep', 'take'],
            # "I love ___"
            ('i', 'love'): ['you', 'everyone', 'family'],
            # "I miss ___"
            ('i', 'miss'): ['you', 'everyone', 'home', 'family'],
            # "very much ___"
            ('very', 'much'): ['please', 'thank', 'better', 'pain'],

            # ---------- Hinglish context seeds ----------
            ('mujhe', 'chahiye'): ['paani', 'dawai', 'aaram', 'khana', 'madad', 'neend', 'suction'],
            ('mujhe', 'dard'): ['hai', 'hora', 'bahut'],
            ('mera', 'sir'): ['dard', 'hora', 'bhaari'],
            ('dawai', 'ka'): ['time', 'samay', 'dose'],
            ('chai', 'do'): ['please', 'jaldi', 'thodi'],
            ('paani', 'do'): ['please', 'jaldi', 'thoda', 'garam', 'thanda'],
            ('karvat', 'do'): ['please', 'left', 'right', 'dheere'],
            ('suction', 'karo'): ['please', 'jaldi', 'abhi', 'dheere'],
            ('light', 'band'): ['karo', 'kardo', 'please'],
            ('fan', 'chalu'): ['karo', 'kardo', 'please'],
            ('bahut', 'dard'): ['hai', 'hora', 'pet', 'sir', 'pair', 'kamar'],
        }
        for (w1, w2), followers in _context_seeds.items():
            for w3 in followers:
                seed_count = 5  # moderate weight
                self.ngram.trigrams[(w1, w2, w3)] += seed_count
                if (w1, w2) not in self.ngram.trigram_contexts:
                    self.ngram.trigram_contexts[(w1, w2)] = set()
                self.ngram.trigram_contexts[(w1, w2)].add(w3)
                self.ngram.total_trigrams += seed_count

        # 7. Build prefix trie from all known words (one-time, at startup)
        all_words = set(self.ngram.unigrams.keys()) | ALL_VOCABULARY
        self._trie = PrefixTrie.build(all_words)
        self.ngram._trie = self._trie  # Share trie with NGramModel for predict()

    def _init_neural_model(self):
        """
        Initialize GazeConnect CIFG-LSTM neural predictor.
        Loads the trained ONNX model if available; degrades gracefully if not.
        """
        try:
            import sys
            ml_path = str(Path(__file__).parent.parent / 'ml')
            if ml_path not in sys.path:
                sys.path.insert(0, str(Path(__file__).parent.parent))

            from ml.inference import NeuralPredictor
            from ml.fusion import PredictionFusion

            self._neural_predictor = NeuralPredictor()
            loaded = self._neural_predictor.load()
            if loaded:
                self._neural_fusion = PredictionFusion()
                info = self._neural_predictor.get_info()
                print(f"[Neural LM] Loaded: {info['model']} "
                      f"({info['model_size_mb']}MB, vocab={info['vocab_size']})")
            else:
                print("[Neural LM] Model not found — using n-gram only.")
                print("[Neural LM] Train with: cd python && python -m ml.train")
                self._neural_predictor = None
        except Exception as e:
            print(f"[Neural LM] Initialization skipped: {e}")
            self._neural_predictor = None
            self._neural_fusion = None

    # ... (existing methods) ...

    def add_custom_word(self, word: str) -> bool:
        """
        Manually add a word from Settings.
        Returns True if added, False if invalid or already exists.
        """
        word = normalize_prediction_word(word)
        if not is_valid_prediction_token(word, min_length=2):  # Allow 2-letter words if user really wants
            return False

        # Add to custom words set
        if word in self.custom_words:
            # Already exists, just boost freq
            self.user_frequencies[word] += 5
        else:
            self.custom_words.add(word)
            self.user_frequencies[word] = 10  # Give it a good starting weight

        # Ensure it's in the n-gram model so it can be predicted
        if word not in self.ngram.unigrams:
            self.ngram.unigrams[word] = 10
            self.ngram.total_unigrams += 10
        else:
             self.ngram.unigrams[word] += 10

        # Keep trie in sync with new words
        if hasattr(self, '_trie') and word.lower() not in self._trie:
            self._trie.insert(word)

        # Also add to recent words so it shows up quickly
        if word in self.recent_words:
            self.recent_words.remove(word)
        self.recent_words.insert(0, word)
        if len(self.recent_words) > self.max_recent:
            self.recent_words.pop()

        # Save immediately
        self.save()
        return True

    def save(self):
        """Save learned data."""
        data = {
            'user_frequencies': {
                word: freq
                for word, freq in self.user_frequencies.items()
                if is_valid_prediction_token(word, min_length=MIN_WORD_LENGTH)
            },
            'recent_words': [
                word for word in self.recent_words
                if is_valid_prediction_token(word, min_length=MIN_WORD_LENGTH)
            ],
            'custom_words': sorted(
                word for word in self.custom_words
                if is_valid_prediction_token(word, min_length=MIN_WORD_LENGTH)
            ),
        }
        try:
            with open(self.dictionary_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving dictionary: {e}")
        self.recency.save()
        self.bigrams.save()

    def load(self):
        """Load learned data."""
        try:
            if not self.dictionary_file.exists():
                return
            
            with open(self.dictionary_file, 'r') as f:
                data = json.load(f)
            
            # Load frequencies
            dirty = False

            loaded_freqs = data.get('user_frequencies', {})
            for raw_word, freq in loaded_freqs.items():
                w = normalize_prediction_word(raw_word)
                if not is_valid_prediction_token(w, min_length=MIN_WORD_LENGTH):
                    dirty = True
                    continue
                self.user_frequencies[w] = freq
                # Also boost n-gram if not present
                if w not in self.ngram.unigrams:
                    self.ngram.unigrams[w] = freq

            # Load recent words
            self.recent_words = []
            for raw_word in data.get('recent_words', []):
                w = normalize_prediction_word(raw_word)
                if not is_valid_prediction_token(w, min_length=MIN_WORD_LENGTH):
                    dirty = True
                    continue
                if w not in self.recent_words:
                    self.recent_words.append(w)

            # Load custom words set
            self.custom_words = set()
            for raw_word in data.get('custom_words', []):
                w = normalize_prediction_word(raw_word)
                if not is_valid_prediction_token(w, min_length=MIN_WORD_LENGTH):
                    dirty = True
                    continue
                self.custom_words.add(w)
            
            # Ensure all custom words are in n-gram
            for w in self.custom_words:
                if w not in self.ngram.unigrams:
                    self.ngram.unigrams[w] = 5

        except Exception as e:
            print(f"Error loading dictionary: {e}")

        # Refresh recency and bigram trackers from disk
        self.recency._load()
        self.bigrams._load()

        if 'dirty' in locals() and dirty:
            self.save()


    def _get_context(self, text: str) -> Tuple[str, ...]:
        """Extract last 2 context words from text."""
        words = re.findall(r'[a-zA-Z\u0900-\u097F]+', text.lower())
        words = [w for w in words if len(w) >= 2 or re.search(r'[\u0900-\u097F]', w)]  # keep short context words or any hindi char
        return tuple(words[-2:]) if len(words) >= 2 else tuple(words)

    def _get_prefix(self, text: str) -> str:
        """Extract current word prefix being typed."""
        match = re.search(r'([a-zA-Z\u0900-\u097F]+)$', text)
        return match.group(1).lower() if match else ''

    def predict(
        self,
        text: str,
        top_k: int = 5,
        lang: str = 'english',
        topic_boosts: Optional[Dict[str, float]] = None,
    ) -> List[PredictionResult]:
        """
        Get word predictions.

        Args:
            text: Current input text
            top_k: Max predictions (default 5)
            lang: Language mode ('english' or 'hindi')

        Returns:
            List of PredictionResult, max 5 items, all words ≥ 3 letters
        """
        return self._predict_logic(
            text, top_k, length_hint=None, lang=lang, topic_boosts=topic_boosts
        )

    def predict_spatial(
        self,
        text: str,
        length_hint: Optional[int] = None,
        top_k: int = 5,
        lang: str = 'english',
        topic_boosts: Optional[Dict[str, float]] = None,
    ) -> Dict[str, List[str]]:
        """
        Specialized prediction for Spatial Mode.
        - Top Row: Exact length matches ONLY (if length_hint provided).
        - Bottom Row: Smart/General logic (CORE + PATIENT).
        """
        # Top Row: Exact Length Matches
        top_row = []
        if length_hint and length_hint > 0:
            # Force strict length filtering for top row
            raw_top = self._predict_logic(
                text,
                top_k=10,
                length_hint=length_hint,
                strict_length=True,
                lang=lang,
                topic_boosts=topic_boosts,
            )
            top_row = [p.word for p in raw_top][:5]

        # Bottom Row: General Context Aware (Ignore length hint, providing fallback/smart suggestions)
        raw_bottom = self._predict_logic(
            text, top_k=5, length_hint=None, lang=lang, topic_boosts=topic_boosts
        )
        bottom_row = [p.word for p in raw_bottom]

        return {
            "top_row": top_row,
            "bottom_row": bottom_row
        }

    def _predict_logic(
        self,
        text: str,
        top_k: int = 5,
        length_hint: Optional[int] = None,
        strict_length: bool = False,
        lang: str = 'english',
        topic_boosts: Optional[Dict[str, float]] = None,
    ) -> List[PredictionResult]:
        """Core prediction logic."""
        top_k = min(top_k, self.MAX_PREDICTIONS)
        context = self._get_context(text)
        prefix = self._get_prefix(text)

        candidates: Dict[str, PredictionResult] = {}
        context_supported_words: Set[str] = set()

        # 1. Abbreviation expansion (instant, highest priority)
        # Skip abbreviations if strict length filtering is on (they likely won't match)
        if not strict_length and prefix:
            expansion = _CUSTOM_ABBREVIATIONS.get(prefix) or ABBREVIATIONS.get(prefix)
            if expansion:
                return [PredictionResult(word=expansion, score=10.0, source='abbreviation')]

        # 1b. CONTEXT-FIRST: When no prefix (user pressed space), look up what
        # words are known to follow the last 1-2 words. This gives Google-keyboard-
        # style context-aware suggestions like "turn me " → left, right, over.
        # These are injected BEFORE the generic n-gram scan so they get priority.
        if not prefix and context and not strict_length:
            # Trigram followers: ("turn","me") → {left, right, over, ...}
            # These get a high fixed score to guarantee they appear above generic words.
            if len(context) >= 2:
                tri_key = (context[-2], context[-1])
                tri_followers = {
                    w for w in self.ngram.trigram_contexts.get(tri_key, set())
                    if not is_blocked_prediction_word(w)
                }
                context_supported_words.update(tri_followers)
                base_score = 0.5  # Well above generic n-gram scores (~0.02-0.04)
                for i, next_word in enumerate(sorted(tri_followers,
                        key=lambda w: self.ngram.trigrams.get((tri_key[0], tri_key[1], w), 0), reverse=True)):
                    if len(next_word) < self.MIN_WORD_LENGTH or next_word in candidates:
                        continue
                    is_hindi = next_word in HINDI_VOCABULARY
                    if lang == 'hindi' and not is_hindi:
                        continue
                    if lang != 'hindi' and is_hindi:
                        continue
                    score = base_score * (0.9 ** i)  # Rank by frequency within followers
                    if next_word in PATIENT_VOCABULARY:
                        score *= self.PATIENT_BOOST
                    score *= self._topic_multiplier(next_word, topic_boosts)
                    source = 'patient' if next_word in PATIENT_VOCABULARY else \
                             'medical' if next_word in MEDICAL_VOCABULARY else \
                             'core' if next_word in CORE_VOCABULARY else 'ngram'
                    candidates[next_word] = PredictionResult(word=next_word, score=score, source=source)

            # Bigram followers: "me" → {left, right, water, ...}
            if len(context) >= 1 and len(candidates) < top_k * 2:
                prev = context[-1]
                bi_followers = {
                    w for w in self.ngram.bigram_contexts.get(prev, set())
                    if not is_blocked_prediction_word(w)
                }
                context_supported_words.update(bi_followers)
                base_score = 0.3
                for i, next_word in enumerate(sorted(bi_followers,
                        key=lambda w: self.ngram.bigrams.get((prev, w), 0), reverse=True)):
                    if len(next_word) < self.MIN_WORD_LENGTH or next_word in candidates:
                        continue
                    is_hindi = next_word in HINDI_VOCABULARY
                    if lang == 'hindi' and not is_hindi:
                        continue
                    if lang != 'hindi' and is_hindi:
                        continue
                    score = base_score * (0.9 ** i)
                    if next_word in PATIENT_VOCABULARY:
                        score *= self.PATIENT_BOOST
                    score *= self._topic_multiplier(next_word, topic_boosts)
                    source = 'patient' if next_word in PATIENT_VOCABULARY else \
                             'medical' if next_word in MEDICAL_VOCABULARY else \
                             'core' if next_word in CORE_VOCABULARY else 'ngram'
                    candidates[next_word] = PredictionResult(word=next_word, score=score, source=source)

            if context:
                context_supported_words.update(
                    {
                        word for word in self.bigrams.next_word_scores(context[-1], prefix).keys()
                        if not is_blocked_prediction_word(word)
                    }
                )

        # 2. N-gram predictions (context-aware)
        ngram_preds = self.ngram.predict(context, prefix, top_k=50) # Fetch more to allow for filtering
        for word, prob in ngram_preds:
            if is_blocked_prediction_word(word):
                continue
            if len(word) < self.MIN_WORD_LENGTH:
                continue

            # Length Filtering
            if length_hint and strict_length:
                if len(word) != length_hint:
                    continue
            
            score = prob
            source = 'ngram'

            # --- LANGUAGE FILTERING ---
            is_hindi_word = word in HINDI_VOCABULARY
            if lang == 'hindi':
                if not is_hindi_word:
                    continue  # Skip English words in Hindi mode
                score *= self.PATIENT_BOOST if word in HINDI_VOCABULARY else 1.0
                source = 'hindi'
            else:
                if is_hindi_word:
                    continue # Skip Hindi words in English mode

                # Boost patient vocabulary
                if word in PATIENT_VOCABULARY:
                    score *= self.PATIENT_BOOST
                    source = 'patient'
                # Boost core vocabulary
                elif word in CORE_VOCABULARY:
                    score *= self.CORE_BOOST
                    source = 'core'
                # Boost medical vocabulary
                elif word in MEDICAL_VOCABULARY:
                    score *= self.MEDICAL_BOOST
                    source = 'medical'
                elif word in HINGLISH_VOCABULARY:
                    score *= self.HINGLISH_BOOST
                    source = 'hinglish'
                elif word in CULTURAL_VOCABULARY:
                    score *= self.CULTURAL_BOOST
                    source = 'cultural'

            # Boost by user frequency
            if word in self.user_frequencies:
                freq_boost = min(self.FREQUENCY_BOOST,
                                 1 + self.user_frequencies[word] / 50)
                score *= freq_boost

            # Boost recent words
            if word in self.recent_words:
                recency_idx = len(self.recent_words) - self.recent_words.index(word)
                recency_factor = recency_idx / len(self.recent_words)
                score *= 1 + (self.RECENT_BOOST - 1) * recency_factor
                source = 'recent'

            # Recency decay boost
            rec = self.recency.score(word)
            if rec > 0:
                score *= (1.0 + rec * 0.5)

            # Patient bigram boost (highest impact)
            if context:
                bg = self.bigrams.next_word_scores(context[-1], prefix)
                if word in bg:
                    score *= (1.0 + bg[word] * 3.0)
                    source = 'patient_bigram'

            # When the context already strongly suggests likely followers,
            # de-emphasize generic unigram-style words that do not fit the sentence.
            if (
                not prefix
                and context
                and len(context_supported_words) >= 3
                and word not in context_supported_words
            ):
                score *= 0.55

            # Time-of-day boost
            score *= _time_boost(word)
            score *= self._topic_multiplier(word, topic_boosts)

            candidates[word] = PredictionResult(word=word, score=score, source=source)

        # 3. Fill from vocabulary if prefix matches and we have few candidates
        if prefix and len(candidates) < top_k:
            for word in ALL_VOCABULARY:
                if is_blocked_prediction_word(word):
                    continue
                # Length check for fallback
                if strict_length and length_hint and len(word) != length_hint:
                    continue

                if (word.startswith(prefix) and word not in candidates
                        and len(word) >= self.MIN_WORD_LENGTH):
                    
                    is_hindi_word = word in HINDI_VOCABULARY
                    if lang == 'hindi':
                        if not is_hindi_word:
                            continue
                        candidates[word] = PredictionResult(word=word, score=0.15, source='hindi')
                        continue
                    else:
                        if is_hindi_word:
                            continue

                    base_score = 0.05
                    if word in PATIENT_VOCABULARY:
                        base_score = 0.15
                    elif word in CORE_VOCABULARY:
                        base_score = 0.10
                    elif word in MEDICAL_VOCABULARY:
                        base_score = 0.08
                    elif word in HINGLISH_VOCABULARY:
                        base_score = 0.12
                    elif word in CULTURAL_VOCABULARY:
                        base_score = 0.13
                    base_score *= self._topic_multiplier(word, topic_boosts)
                    candidates[word] = PredictionResult(
                        word=word, score=base_score, source='core')

        # 3b. FUZZY FALLBACK — typo tolerance for gaze typing errors
        # If exact prefix matching produced fewer than top_k results,
        # search for words within edit distance 1 of the prefix.
        # Only triggers for prefixes of 4+ chars (shorter prefixes are too ambiguous)
        if prefix and len(prefix) >= 4 and len(candidates) < top_k:
            fuzzy_matches = _fuzzy_word_matches(
                prefix, ALL_VOCABULARY, max_distance=1, limit=top_k - len(candidates)
            )
            for word in fuzzy_matches:
                if word in candidates:
                    continue  # Already found by exact match
                if is_blocked_prediction_word(word):
                    continue

                # Language filter
                is_hindi_word = word in HINDI_VOCABULARY
                if lang == 'hindi' and not is_hindi_word:
                    continue
                if lang != 'hindi' and is_hindi_word:
                    continue

                # Length filter
                if strict_length and length_hint and len(word) != length_hint:
                    continue

                # Fuzzy matches get a lower base score (less confident than exact prefix)
                base_score = 0.03  # Below exact prefix fallback (0.05-0.15)
                if word in PATIENT_VOCABULARY:
                    base_score = 0.08
                elif word in CORE_VOCABULARY:
                    base_score = 0.05
                elif word in MEDICAL_VOCABULARY:
                    base_score = 0.04
                base_score *= self._topic_multiplier(word, topic_boosts)

                candidates[word] = PredictionResult(
                    word=word, score=base_score, source='fuzzy')

        # 4. Smart no-prefix suggestions: use n-gram context to predict next word
        if not prefix and len(candidates) < top_k and not strict_length:
            # Get all words the n-gram model knows follow the current context
            if context:
                # Try trigram context first
                if len(context) >= 2:
                    tri_key = (context[-2], context[-1])
                    for next_word in self.ngram.trigram_contexts.get(tri_key, set()):
                        if is_blocked_prediction_word(next_word):
                            continue
                        if next_word not in candidates and len(next_word) >= self.MIN_WORD_LENGTH:
                            is_hindi_word = next_word in HINDI_VOCABULARY
                            prob = self.ngram.get_probability(next_word, context)
                            if lang == 'hindi':
                                if not is_hindi_word:
                                    continue
                                prob *= self.PATIENT_BOOST
                                source = 'hindi'
                            else:
                                if is_hindi_word:
                                    continue
                                source = 'ngram'
                                if next_word in PATIENT_VOCABULARY:
                                    prob *= self.PATIENT_BOOST
                                    source = 'patient'
                                elif next_word in CORE_VOCABULARY:
                                    prob *= self.CORE_BOOST
                                    source = 'core'
                                elif next_word in MEDICAL_VOCABULARY:
                                    prob *= self.MEDICAL_BOOST
                                    source = 'medical'
                            prob *= self._topic_multiplier(next_word, topic_boosts)
                            candidates[next_word] = PredictionResult(
                                word=next_word, score=prob, source=source)

                # Try bigram context
                if len(context) >= 1 and len(candidates) < top_k:
                    prev = context[-1]
                    for next_word in self.ngram.bigram_contexts.get(prev, set()):
                        if is_blocked_prediction_word(next_word):
                            continue
                        if next_word not in candidates and len(next_word) >= self.MIN_WORD_LENGTH:
                            is_hindi_word = next_word in HINDI_VOCABULARY
                            prob = self.ngram.get_probability(next_word, context)
                            if lang == 'hindi':
                                if not is_hindi_word:
                                    continue
                                prob *= self.PATIENT_BOOST
                                source = 'hindi'
                            else:
                                if is_hindi_word:
                                    continue
                                source = 'ngram'
                                if next_word in PATIENT_VOCABULARY:
                                    prob *= self.PATIENT_BOOST
                                    source = 'patient'
                                elif next_word in CORE_VOCABULARY:
                                    prob *= self.CORE_BOOST
                                    source = 'core'
                            prob *= self._topic_multiplier(next_word, topic_boosts)
                            candidates[next_word] = PredictionResult(
                                word=next_word, score=prob, source=source)

            # Final fallback if still empty
            if not candidates:
                if lang == 'hindi':
                    common_next = ['है', 'नहीं', 'हाँ', 'मुझे', 'आप', 'क्या', 'चाहिए']
                else:
                    common_next = ['please', 'want', 'need', 'the', 'help', 'thank', 'can', 'will']
                for w in common_next:
                    prob = self.ngram.get_probability(w, context) if context else 0.05
                    prob = max(prob, 0.05) * self._topic_multiplier(w, topic_boosts)
                    candidates[w] = PredictionResult(word=w, score=prob, source='core' if lang != 'hindi' else 'hindi')

        # ---- NEURAL MODEL FUSION ----
        # Fuse n-gram candidates with CIFG-LSTM neural predictions.
        # Only activates when we have existing n-gram candidates to fuse with.
        # Neural model reuses cached probs for same context (fast on repeat calls).
        if (self._neural_predictor and self._neural_fusion
                and not strict_length and candidates):
            try:
                # Get context text (everything before current prefix)
                context_text = text
                if prefix:
                    context_text = text[:len(text) - len(prefix)].strip()

                # Need at least one complete context word for meaningful neural predictions
                if context_text and len(context_text.split()) >= 1:
                    # Get neural predictions (with prefix filter if typing)
                    neural_preds = self._neural_predictor.predict(
                        context_text, prefix=prefix, top_k=10
                    )

                    if neural_preds:
                        # Build n-gram prediction list for fusion
                        ngram_list = [(r.word, r.score) for r in candidates.values()]

                        # Filter neural predictions by language and min length
                        filtered_neural = []
                        for word, prob in neural_preds:
                            if is_blocked_prediction_word(word):
                                continue
                            if len(word) < self.MIN_WORD_LENGTH:
                                continue
                            is_hindi = word in HINDI_VOCABULARY
                            if lang == 'hindi' and not is_hindi:
                                continue
                            if lang != 'hindi' and is_hindi:
                                continue
                            filtered_neural.append((word, prob))

                        if filtered_neural:
                            # Patient words get boosted in fusion
                            patient_words = PATIENT_VOCABULARY | self.custom_words

                            # Track which words came from n-gram
                            ngram_words = {r.word for r in candidates.values()}

                            # Fuse predictions
                            fused = self._neural_fusion.fuse(
                                ngram_list, filtered_neural,
                                patient_words=patient_words
                            )

                            # Rebuild candidates from fused results
                            candidates.clear()
                            for word, score in fused:
                                if is_blocked_prediction_word(word):
                                    continue
                                if len(word) < self.MIN_WORD_LENGTH:
                                    continue

                                is_from_neural_only = word not in ngram_words

                                # Neural-only words must be in our known vocabulary
                                # to prevent low-quality suggestions from leaking in.
                                # The neural model boosts/reranks n-gram words (main value)
                                # and only adds new words if they're recognized terms.
                                if is_from_neural_only and word not in ALL_VOCABULARY:
                                    continue

                                if is_from_neural_only:
                                    source = 'neural_fused'
                                elif word in PATIENT_VOCABULARY:
                                    source = 'patient'
                                elif word in CORE_VOCABULARY:
                                    source = 'core'
                                elif word in MEDICAL_VOCABULARY:
                                    source = 'medical'
                                else:
                                    source = 'ngram'
                                score *= self._topic_multiplier(word, topic_boosts)
                                candidates[word] = PredictionResult(
                                    word=word, score=score, source=source
                                )
            except Exception:
                # Neural model errors never break predictions — silent fallback
                pass

        # Sort by score, return top_k
        sorted_results = sorted(candidates.values(), key=lambda x: -x.score)
        return sorted_results[:top_k]

    def get_phrase_suggestions(self, category: Optional[str] = None) -> List[str]:
        """Get phrase suggestions, optionally by category."""
        if category and category in AAC_PHRASES:
            return AAC_PHRASES[category]
        phrases = []
        for cat_phrases in AAC_PHRASES.values():
            phrases.extend(cat_phrases[:3])
        return phrases[:15]

    def expand_abbreviation(self, abbrev: str) -> Optional[str]:
        """Expand abbreviation if known (checks custom first, then built-in)."""
        key = abbrev.lower()
        return _CUSTOM_ABBREVIATIONS.get(key) or ABBREVIATIONS.get(key)

    def learn_word(self, word: str):
        """Learn a word from user input (English + Hindi/Devanagari)."""
        word = normalize_prediction_word(word)
        if not is_valid_prediction_token(word, min_length=MIN_WORD_LENGTH):
            return
        self.user_frequencies[word] += 1
        if word in self.recent_words:
            self.recent_words.remove(word)
        self.recent_words.append(word)
        if len(self.recent_words) > self.max_recent:
            self.recent_words.pop(0)
        self.custom_words.add(word)

        # Keep trie in sync with new words
        if hasattr(self, '_trie') and word.lower() not in self._trie:
            self._trie.insert(word)

    def learn_sentence(self, sentence: str):
        """Learn from a complete sentence (English + Hindi/Devanagari)."""
        words = re.findall(r'[a-zA-Z\u0900-\u097F]+', sentence.lower())
        for word in words:
            self.learn_word(word)
        self.ngram.train(sentence)
        self.recency.record_sentence(sentence)
        self.bigrams.learn(sentence)

    def add_custom_abbreviation(self, abbrev: str, expansion: str) -> bool:
        """Add a custom abbreviation. Persisted to disk."""
        abbrev = abbrev.strip().lower()
        expansion = expansion.strip()
        if not abbrev or not expansion or len(abbrev) < 2:
            return False
        _CUSTOM_ABBREVIATIONS[abbrev] = expansion
        self._save_custom_abbreviations()
        return True

    def remove_custom_abbreviation(self, abbrev: str) -> bool:
        """Remove a custom abbreviation."""
        key = abbrev.strip().lower()
        if key in _CUSTOM_ABBREVIATIONS:
            del _CUSTOM_ABBREVIATIONS[key]
            self._save_custom_abbreviations()
            return True
        return False

    def get_all_abbreviations(self) -> Dict[str, str]:
        """Return all abbreviations (built-in + custom) for UI display."""
        merged = dict(ABBREVIATIONS)
        merged.update(_CUSTOM_ABBREVIATIONS)
        return merged

    def get_custom_abbreviations(self) -> Dict[str, str]:
        """Return only custom abbreviations."""
        return dict(_CUSTOM_ABBREVIATIONS)

    def get_dictionary_data(self) -> Dict:
        """Return all prediction data for Settings UI display."""
        return {
            'custom_words': sorted(self.custom_words),
            'abbreviations': self.get_all_abbreviations(),
            'custom_abbreviations': self.get_custom_abbreviations(),
            'recent_words': self.recent_words[-50:],
            'word_count': len(self.custom_words),
            'abbreviation_count': len(ABBREVIATIONS) + len(_CUSTOM_ABBREVIATIONS),
        }

    def get_builtin_data(self) -> Dict:
        """Return built-in vocabulary and training data for Settings UI (on-demand only)."""
        return {
            'core_vocabulary': sorted(CORE_VOCABULARY),
            'medical_vocabulary': sorted(MEDICAL_VOCABULARY),
            'patient_vocabulary': sorted(PATIENT_VOCABULARY),
            'hindi_vocabulary': sorted(HINDI_VOCABULARY),
            'hinglish_vocabulary': sorted(HINGLISH_VOCABULARY),
            'cultural_vocabulary': sorted(CULTURAL_VOCABULARY),
            'training_corpus': TRAINING_CORPUS,
            'hindi_corpus': HINDI_TRAINING_CORPUS,
        }

    def get_neural_model_info(self) -> Dict:
        """Return neural model status for Settings UI."""
        if self._neural_predictor:
            return self._neural_predictor.get_info()
        return {"status": "not_loaded", "reason": "Model not trained or onnxruntime not installed"}

    def predict_sentence_neural(self, context: str, num_words: int = 4) -> str:
        """
        Generate a neural sentence continuation.
        Only called when context ends with space (not mid-word typing).
        Kept lightweight: max 4 words, hard timeout.
        """
        if not self._neural_predictor or not self._neural_predictor.is_available:
            return ""
        try:
            return self._neural_predictor.predict_sentence_continuation(
                context, num_words=num_words
            )
        except Exception:
            return ""

    def suggest_abbreviation(self, sentence: str) -> Optional[Dict]:
        """Suggest an abbreviation for a frequently-spoken sentence."""
        s = sentence.strip()
        if len(s) < 5:
            return None
        # Generate abbreviation from first letters of each word
        words = s.split()
        if len(words) < 2:
            return None
        abbrev = ''.join(w[0].lower() for w in words if w)
        # Shorten to 2-4 chars if too long
        if len(abbrev) > 4:
            abbrev = abbrev[:3]
        # Check conflict with existing abbreviations
        all_abbrevs = self.get_all_abbreviations()
        if abbrev in all_abbrevs:
            # Try first letter + last letter of key words
            abbrev = words[0][0].lower() + words[-1][0].lower() + words[-1][-1].lower() if len(words[-1]) > 1 else abbrev + '2'
        if abbrev in all_abbrevs:
            return None  # Can't find a unique abbreviation
        return {'sentence': s, 'suggested_abbrev': abbrev}

    def _save_custom_abbreviations(self):
        """Persist custom abbreviations to disk."""
        path = self._patient_data_dir / 'custom_abbreviations.json'
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(_CUSTOM_ABBREVIATIONS, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving custom abbreviations: {e}")

    def _load_custom_abbreviations(self):
        """Load custom abbreviations from disk."""
        path = self._patient_data_dir / 'custom_abbreviations.json'
        if path.exists():
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                _CUSTOM_ABBREVIATIONS.update(data)
            except Exception:
                pass

    def learn_from_chat_history(self, chat_dir: str):
        """
        Read all chat_YYYY-MM-DD.txt files from chat_history folder
        and train the prediction engine on the patient's actual spoken messages.

        Each line format: [HH:MM:SS] message text here
        Newer files get higher weight (more recent = more relevant).
        """
        chat_path = Path(chat_dir)
        if not chat_path.exists():
            return

        # Use only keyboard chat logs; spoken logs are intentionally excluded.
        # Keep learning bounded to the latest 5 chat files.
        chat_files = sorted(chat_path.glob('chat_*.txt'))
        all_files = chat_files[-5:]
        if not all_files:
            return

        total_messages = 0
        total_words_learned = 0

        for file_idx, chat_file in enumerate(all_files):
            try:
                with open(chat_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()

                # Weight: newer files trained more times (1x for oldest, up to 3x for newest)
                file_weight = 1 + int(2 * file_idx / max(len(all_files) - 1, 1))

                for line in lines:
                    line = line.strip()
                    if not line:
                        continue

                    # Parse "[HH:MM:SS] message" format
                    message = line
                    if line.startswith('[') and ']' in line:
                        bracket_end = line.index(']')
                        message = line[bracket_end + 1:].strip()

                    if not message:
                        continue

                    # Train n-gram model (weighted by recency)
                    for _ in range(file_weight):
                        self.ngram.train(message)

                    # Learn individual words, including Hindi/Devanagari chat history.
                    words = re.findall(r'[a-zA-Z\u0900-\u097F]+', message.lower())
                    for word in words:
                        is_devanagari = bool(re.search(r'[\u0900-\u097F]', word))
                        if len(word) >= MIN_WORD_LENGTH or is_devanagari:
                            self.user_frequencies[word] += file_weight
                            self.custom_words.add(word)
                            # Add to vocabulary if new
                            if word not in self.ngram.unigrams:
                                self.ngram.unigrams[word] = file_weight
                                self.ngram.total_unigrams += file_weight
                            if hasattr(self, '_trie') and word.lower() not in self._trie:
                                self._trie.insert(word)
                            total_words_learned += 1

                    total_messages += 1

            except Exception:
                continue

        if total_messages > 0:
            import logging
            logging.getLogger('GazeConnect').info(
                f"Chat history loaded: {len(all_files)} files, "
                f"{total_messages} messages, {total_words_learned} words learned"
            )


# ============================================
# EXPORTS
# ============================================

__all__ = [
    'WordPredictionEngine',
    'PredictionResult',
    'CORE_VOCABULARY',
    'MEDICAL_VOCABULARY',
    'HINGLISH_VOCABULARY',
    'CULTURAL_VOCABULARY',
    'PATIENT_VOCABULARY',
    'ALL_VOCABULARY',
    'AAC_PHRASES',
    'ABBREVIATIONS',
    'MIN_WORD_LENGTH',
]

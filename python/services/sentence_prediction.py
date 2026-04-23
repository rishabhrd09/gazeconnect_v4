"""
GazeConnect Pro — Local Sentence Prediction
Predicts complete sentences from partial input. 100% offline, < 100ms.

Sources (priority order):
1. Patient's own previously spoken sentences
2. Template bank (common ALS patterns)
3. Fuzzy substring match
"""

import re, json, time, math
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Set
from dataclasses import dataclass
from datetime import datetime

from prediction_guardrails import contains_blocked_prediction_word


@dataclass
class SentencePrediction:
    text: str
    score: float
    source: str  # 'history', 'template', 'fuzzy'


class SentencePredictor:
    MAX_PREDICTIONS = 3
    MIN_INPUT = 2
    HISTORY_BOOST = 3.0
    HALF_LIFE = 48 * 3600  # 48 hours
    MAX_HISTORY = 500

    def __init__(self, data_dir: Path):
        self._path = data_dir / 'patient_sentences.json'
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self.history: List[Dict] = []
        self.templates: List[Dict] = self._build_templates()
        self._topic_keywords = self._build_topic_keywords()
        self._load_history()
        self._dirty = False

    def predict(self, typed: str, top_k: int = 3, topic_boosts: Optional[Dict[str, float]] = None) -> List[SentencePrediction]:
        text = typed.strip()
        if len(text) < self.MIN_INPUT:
            return []
        tl = text.lower()
        now = time.time()
        scored: List[Tuple[float, str, str]] = []

        # 1. Patient history — boost scales with how much of the sentence is typed
        for item in self.history:
            s = item['text']
            if contains_blocked_prediction_word(s):
                continue
            sl = s.lower()
            if sl.startswith(tl):
                count = item.get('count', 1)
                age = now - item.get('last_used', 0)
                recency = math.exp(-0.693 * age / self.HALF_LIFE)
                # Scale boost by coverage: typing "I" for "I want medicine" = low boost
                # typing "I want med" = high boost (close to full match)
                coverage = min(1.0, len(tl) / max(len(sl) * 0.5, 1))
                boost = 1.0 + (self.HISTORY_BOOST - 1.0) * coverage
                base_score = (count * 0.3 + recency * 1.0) * boost
                scored.append((self._topic_score(base_score, s, None, topic_boosts), s, 'history'))

        # 2. Templates — match when typed text overlaps with prefix
        for tmpl in self.templates:
            pat = tmpl['p']
            if tl.startswith(pat):
                # User typed the full prefix or more (e.g., "i want w" matches "i want")
                tb = self._time_cat_boost(tmpl.get('c', ''))
                for s in tmpl['s']:
                    if contains_blocked_prediction_word(s):
                        continue
                    if s.lower().startswith(tl):
                        scored.append((self._topic_score(1.0 * tb, s, tmpl.get('c', ''), topic_boosts), s, 'template'))
            elif pat.startswith(tl) and len(tl) >= 3:
                # User typed start of the prefix (e.g., "plea" matches "please")
                tb = self._time_cat_boost(tmpl.get('c', ''))
                for s in tmpl['s']:
                    if contains_blocked_prediction_word(s):
                        continue
                    if s.lower().startswith(tl):
                        scored.append((self._topic_score(0.8 * tb, s, tmpl.get('c', ''), topic_boosts), s, 'template'))

        # 3. Keyword match: typed word appears INSIDE template sentences (not just at start)
        #    e.g., typing "back" matches "Pain in my back", "Put support behind my back"
        #    Only the last typed word is used as keyword, must be 3+ chars
        last_word = tl.split()[-1] if ' ' in tl else tl
        if len(last_word) >= 3 and len(scored) < top_k * 2:
            seen_texts = {s[1].lower() for s in scored}  # already matched sentences
            for tmpl in self.templates:
                tb = self._time_cat_boost(tmpl.get('c', ''))
                for s in tmpl['s']:
                    if contains_blocked_prediction_word(s):
                        continue
                    sl = s.lower()
                    if sl in seen_texts:
                        continue
                    # Check if any word in the sentence starts with the keyword
                    words_in_sentence = sl.split()
                    if any(w.startswith(last_word) for w in words_in_sentence):
                        # Lower score than prefix match — keyword is weaker signal
                        scored.append((self._topic_score(0.6 * tb, s, tmpl.get('c', ''), topic_boosts), s, 'keyword'))
                        seen_texts.add(sl)

            # Also check history for keyword matches
            for item in self.history:
                sl = item['text'].lower()
                if sl in seen_texts:
                    continue
                    if any(w.startswith(last_word) for w in sl.split()):
                        count = item.get('count', 1)
                        base_score = 0.5 * min(count, 5)
                        scored.append((self._topic_score(base_score, item['text'], None, topic_boosts), item['text'], 'keyword'))
                    seen_texts.add(sl)

        # 4. Fuzzy: match last typed word in middle of history sentences
        #    Only triggers for meaningful input (3+ char last word, 2+ count)
        if len(scored) < top_k:
            if len(last_word) >= 3:
                for item in self.history:
                    if item.get('count', 1) < 2:
                        continue  # skip single-use sentences
                    sl = item['text'].lower()
                    if sl.startswith(tl):
                        continue  # already matched in source 1
                    if any(w.startswith(last_word) for w in sl.split()):
                        scored.append((self._topic_score(0.3, item['text'], None, topic_boosts), item['text'], 'fuzzy'))

        # Deduplicate, sort, return
        scored.sort(key=lambda x: -x[0])
        seen, results = set(), []
        for sc, txt, src in scored:
            k = txt.lower()
            if k not in seen:
                seen.add(k)
                results.append(SentencePrediction(text=txt, score=sc, source=src))
                if len(results) >= top_k:
                    break
        return results

    def learn(self, sentence: str):
        s = sentence.strip()
        if len(s) < 3 or contains_blocked_prediction_word(s):
            return
        for item in self.history:
            if item['text'].lower() == s.lower():
                item['count'] = item.get('count', 0) + 1
                item['last_used'] = time.time()
                self._dirty = True
                return
        self.history.append({'text': s, 'count': 1, 'last_used': time.time()})
        self._dirty = True

    def save(self):
        if not self._dirty:
            return
        # Prune to MAX_HISTORY
        if len(self.history) > self.MAX_HISTORY:
            self.history.sort(key=lambda x: x.get('count', 0) + x.get('last_used', 0) * 0.001, reverse=True)
            self.history = self.history[:self.MAX_HISTORY]
        with open(self._path, 'w', encoding='utf-8') as f:
            json.dump(self.history, f, ensure_ascii=False, indent=1)
        self._dirty = False

    def _load_history(self):
        if self._path.exists():
            try:
                with open(self._path, 'r', encoding='utf-8') as f:
                    raw_history = json.load(f)
                self.history = [
                    item for item in raw_history
                    if not contains_blocked_prediction_word(item.get('text', ''))
                ]
            except Exception:
                self.history = []

    def _time_cat_boost(self, cat: str) -> float:
        h = datetime.now().hour
        if 5 <= h < 11:   return {'medical': 1.5, 'basic': 1.3, 'greet': 1.5}.get(cat, 1.0)
        if 11 <= h < 16:  return {'basic': 1.2, 'comfort': 1.3}.get(cat, 1.0)
        if 16 <= h < 21:  return {'family': 1.3, 'greet': 1.2}.get(cat, 1.0)
        return {'comfort': 1.5, 'greet': 1.3, 'emergency': 1.3}.get(cat, 1.0)  # night

    def _normalize_topic(self, cat: Optional[str]) -> Optional[str]:
        if not cat:
            return None
        mapping = {
            'basic': 'basic',
            'medical': 'medical',
            'comfort': 'comfort',
            'family': 'family',
            'emotion': 'emotion',
            'greet': 'greet',
            'emergency': 'emergency',
        }
        return mapping.get(cat)

    def _build_topic_keywords(self) -> Dict[str, Set[str]]:
        topic_keywords: Dict[str, Set[str]] = {
            'basic': set(),
            'medical': set(),
            'comfort': set(),
            'family': set(),
            'emotion': set(),
            'greet': set(),
            'emergency': set(),
        }

        for tmpl in self.templates:
            topic = self._normalize_topic(tmpl.get('c', ''))
            if not topic:
                continue
            for sentence in tmpl['s']:
                topic_keywords[topic].update(re.findall(r'[a-zA-Z\u0900-\u097F]+', sentence.lower()))

        topic_keywords['family'].update({'mummy', 'papa', 'bhaiya', 'didi', 'family'})
        topic_keywords['medical'].update({'pain', 'medicine', 'doctor', 'nurse', 'oxygen', 'suction', 'dard', 'dawai'})
        topic_keywords['comfort'].update({'pillow', 'blanket', 'position', 'turn', 'left', 'right', 'fan', 'light'})
        topic_keywords['basic'].update({'water', 'food', 'bathroom', 'toilet', 'rest', 'sleep', 'pani', 'khana'})
        topic_keywords['emergency'].update({'help', 'breathe', 'ambulance', 'urgent'})
        topic_keywords['greet'].update({'thank', 'thanks', 'hello', 'good', 'morning', 'night'})
        return topic_keywords

    def _topic_score(
        self,
        base_score: float,
        sentence: str,
        category: Optional[str],
        topic_boosts: Optional[Dict[str, float]],
    ) -> float:
        if not topic_boosts:
            return base_score

        best_strength = 0.0
        normalized_category = self._normalize_topic(category)
        if normalized_category:
            best_strength = max(best_strength, float(topic_boosts.get(normalized_category, 0.0)))

        if best_strength < 1.0:
            tokens = set(re.findall(r'[a-zA-Z\u0900-\u097F]+', sentence.lower()))
            for topic, keywords in self._topic_keywords.items():
                if topic not in topic_boosts:
                    continue
                if tokens & keywords:
                    best_strength = max(best_strength, float(topic_boosts.get(topic, 0.0)))

        if best_strength <= 0:
            return base_score

        return base_score * (1.0 + min(0.35, 0.35 * best_strength))

    def _build_templates(self) -> List[Dict]:
        """Compact template bank. p=pattern prefix, s=sentence list, c=category."""
        return [
            # Basic needs
            {'p': 'i want', 'c': 'basic', 's': [
                'I want warm water', 'I want cold water', 'I want to change position',
                'I want medicine', 'I want to rest', 'I want to eat',
                'I want to go to toilet', 'I want black tea', 'I want to sleep',
                'I want to sit up', 'I want milk', 'I want my phone',
            ]},
            {'p': 'i need', 'c': 'basic', 's': [
                'I need water', 'I need suction', 'I need help',
                'I need medicine', 'I need to change position',
                'I need rest', 'I need bathroom', 'I need blanket',
            ]},
            {'p': 'i am', 'c': 'emotion', 's': [
                'I am in pain', 'I am feeling better', 'I am uncomfortable',
                'I am cold', 'I am hot', 'I am tired', 'I am thirsty',
                'I am hungry', 'I am fine', 'I am having trouble breathing',
                'I am worried', 'I am happy today', 'I am feeling weak',
            ]},
            # Requests
            {'p': 'please', 'c': 'basic', 's': [
                'Please do suction', 'Please change my position',
                'Please call the doctor', 'Please give me medicine',
                'Please turn on the fan', 'Please close the door',
                'Please turn off the light', 'Please give me water',
                'Please check my BP', 'Please adjust pillow',
                'Please come here', 'Please help me', 'Please wait',
            ]},
            {'p': 'can you', 'c': 'basic', 's': [
                'Can you adjust my pillow', 'Can you check my BP',
                'Can you call someone', 'Can you turn me',
                'Can you give me water', 'Can you bring my phone',
            ]},
            {'p': 'can i', 'c': 'basic', 's': [
                'Can I have water', 'Can I get medicine',
                'Can I rest now', 'Can I talk to mummy',
                'Can I see my phone', 'Can I go to toilet',
            ]},
            {'p': 'could you', 'c': 'basic', 's': [
                'Could you help me please', 'Could you adjust my pillow',
                'Could you check my oxygen', 'Could you call the doctor',
                'Could you turn me slowly',
            ]},
            {'p': 'help', 'c': 'emergency', 's': [
                'Help me change position', 'Help me sit up',
                'Help me please', 'Help me breathe', 'Help me with suction',
            ]},
            # Family
            {'p': 'tell', 'c': 'family', 's': [
                'Tell mummy to take rest', 'Tell them I am fine',
                'Tell the doctor about pain', 'Tell staff to come',
                'Tell bhaiya to call me', 'Tell Rishabh to call me',
                'Tell Parakh to come here', 'Tell Bhawana to come here',
                'Tell Nurse to come here', 'Tell Caretaker to come here',
            ]},
            {'p': 'call', 'c': 'family', 's': [
                'Call Rishabh', 'Call mummy', 'Call the doctor',
                'Call the nurse', 'Call Parakh', 'Call Bhawana',
                'Call Nilesh', 'Call Durgesh', 'Call Rahul',
                'Call Caretaker', 'Call bhaiya', 'Call ambulance', 'Call didi',
            ]},
            {'p': 'talk to', 'c': 'family', 's': [
                'Talk to Rishabh', 'Talk to Parakh', 'Talk to Bhawana',
                'Talk to Nurse', 'Talk to Doctor', 'Talk to Caretaker',
            ]},
            {'p': 'come here', 'c': 'family', 's': [
                'Rishabh come here', 'Parakh come here', 'Bhawana come here',
                'Nurse come here', 'Doctor come here', 'Caretaker come here',
            ]},
            {'p': 'where', 'c': 'question', 's': [
                'Where is mummy', 'Where is my phone',
                'Where is the remote', 'Where is everyone',
                'Where is my medicine', 'Where is the nurse',
                'Where is Rishabh', 'Where is Bhawana', 'Where is Parakh',
            ]},
            # Medical
            {'p': 'pain', 'c': 'medical', 's': [
                'Pain in my back', 'Pain in my neck', 'Pain is increasing',
                'Pain is less today', 'Pain medicine not working',
            ]},
            {'p': 'medicine', 'c': 'medical', 's': [
                'Medicine time now', 'Medicine is finished',
                'Medicine is not working', 'Give me pain medicine',
            ]},
            # Comfort
            {'p': 'turn', 'c': 'comfort', 's': [
                'Turn me to left side', 'Turn me to right side',
                'Turn on the fan', 'Turn off the light', 'Turn on the AC',
                'Turn on the TV',
            ]},
            {'p': 'too', 'c': 'comfort', 's': [
                'Too cold in here', 'Too hot in here', 'Too loud please reduce',
                'Too much pain right now', 'Too tired to talk',
            ]},
            # Greetings
            {'p': 'good', 'c': 'greet', 's': [
                'Good morning', 'Good night sweet dreams',
                'Good afternoon', 'Good evening',
            ]},
            {'p': 'thank', 'c': 'greet', 's': [
                'Thank you so much', 'Thank you for helping',
                'Thank you for taking care', 'Thank you everyone',
            ]},
            # Hinglish
            {'p': 'mummy', 'c': 'family', 's': [
                'Mummy ko bulao', 'Mummy se baat karni hai',
                'Mummy kahan hai', 'Mummy ko rest karne do',
            ]},
            {'p': 'pani', 'c': 'basic', 's': [
                'Pani dena please', 'Pani garam karo',
                'Pani thanda chahiye', 'Pani mein dawa dalo',
            ]},
            {'p': 'dawa', 'c': 'medical', 's': [
                'Dawa ka time ho gaya', 'Dawa de do please',
                'Dawa khatam ho gayi', 'Dawa change karni hai',
            ]},
            {'p': 'chai', 'c': 'basic', 's': [
                'Chai de do please', 'Chai mein cheeni kam',
                'Black chai chahiye', 'Chai ka time ho gaya',
            ]},
            {'p': 'mujhe', 'c': 'basic', 's': [
                'Mujhe pani chahiye', 'Mujhe dard ho raha hai',
                'Mujhe neend aa rahi hai', 'Mujhe doctor se milna hai',
            ]},

            # ── FROM APP SCREENS (BasicNeeds, Feelings, Phrases, Activities) ──

            # Comfort & bed
            {'p': 'adjust', 'c': 'comfort', 's': [
                'Adjust my pillow', 'Adjust bed angle up', 'Adjust bed angle down',
                'Adjust my legs', 'Adjust fan speed', 'Adjust the AC',
                'Adjust my neck support', 'Adjust my hands',
                'Adjust head and neck', 'Adjust pillows', 'Adjust fan and AC',
            ]},
            {'p': 'change', 'c': 'comfort', 's': [
                'Change my position', 'Change the channel', 'Change the bedsheet',
            ]},
            {'p': 'change to', 'c': 'basic', 's': [
                'Change to channel 508', 'Change to channel 511',
                'Change to channel 521', 'Change to channel 524',
                'Change to channel 310', 'Change to channel 132',
                'Change to channel 128',
            ]},
            {'p': 'raise', 'c': 'comfort', 's': [
                'Raise my head', 'Raise my legs',
            ]},
            {'p': 'lower', 'c': 'comfort', 's': [
                'Lower my head', 'Lower the bed',
            ]},
            {'p': 'massage', 'c': 'comfort', 's': [
                'Massage hands and legs', 'Massage my legs gently',
            ]},
            {'p': 'clean', 'c': 'basic', 's': [
                'Clean my face', 'Clean my neck area properly',
                'Clean face and eyes',
            ]},
            {'p': 'wipe', 'c': 'basic', 's': [
                'Wipe my face', 'Wipe my mouth', 'Wipe my eyes',
            ]},
            {'p': 'fix', 'c': 'comfort', 's': [
                'Fix pillow', 'Fix my pillow', 'Fix my neck support',
            ]},
            {'p': 'give', 'c': 'basic', 's': [
                'Give me water', 'Give me medicine', 'Give me black tea',
                'Give me blanket', 'Give me nebulization', 'Give me sponging',
                'Give me eye drops', 'Give me lip balm',
            ]},
            {'p': 'need', 'c': 'basic', 's': [
                'Need blanket', 'Need water', 'Need bathroom',
                'Need sponging', 'Need suction',
            ]},
            {'p': 'scratch', 'c': 'basic', 's': [
                'Scratch my nose', 'Scratch my back',
            ]},
            {'p': 'remove', 'c': 'basic', 's': [
                'Remove urine pot', 'Remove the blanket', 'Remove the pillow',
            ]},
            {'p': 'cover', 'c': 'comfort', 's': [
                'Cover my body properly', 'Cover me with blanket',
            ]},

            # Feelings & emotions
            {'p': 'i feel', 'c': 'emotion', 's': [
                'I feel uncomfortable', 'I feel dizzy', 'I feel lonely',
                'I feel better today', 'I feel overwhelmed',
                'I feel safe with you here', 'I feel stiff all over',
            ]},
            {'p': 'i need to', 'c': 'basic', 's': [
                'I need to change position', 'I need to rest now',
                'I need to use the bathroom', 'I need to call mummy',
                'I need to sit up', 'I need to cough',
            ]},
            {'p': 'i want to', 'c': 'basic', 's': [
                'I want to rest', 'I want to sleep',
                'I want to sit up', 'I want to talk to family',
                'I want to listen to music', 'I want to go outside',
            ]},
            {'p': 'my', 'c': 'medical', 's': [
                'My breathing is difficult', 'My back hurts',
                'My neck hurts', 'My mouth is dry',
                'My chest feels tight', 'My position is uncomfortable',
            ]},
            {'p': 'i miss', 'c': 'emotion', 's': [
                'I miss you', 'I miss being outside',
            ]},

            # Communication
            {'p': 'wait', 'c': 'basic', 's': [
                'Wait a moment', 'Wait I am not finished',
            ]},
            {'p': 'let', 'c': 'basic', 's': [
                'Let me think', 'Let me finish my sentence',
                'Let them in', 'Let only family come today',
            ]},
            {'p': 'speak', 'c': 'basic', 's': [
                'Speak slower please',
            ]},
            {'p': 'read', 'c': 'basic', 's': [
                'Read something to me', 'Read the screen please',
                'Read the headlines to me', 'Read my messages to me',
            ]},

            # Entertainment & activities
            {'p': 'play', 'c': 'basic', 's': [
                'Play some music', 'Play old songs', 'Play devotional music',
                'Play classical music', 'Play cricket highlights',
                'Play soft music for me', 'Play news channel',
                'Play Kishore Kumar songs', 'Play comedy videos',
            ]},
            {'p': 'alexa', 'c': 'basic', 's': [
                'Alexa play Om chanting', 'Alexa play Hanuman Chalisa',
                'Alexa play Kishore Kumar songs',
            ]},
            {'p': 'volume', 'c': 'basic', 's': [
                'Volume up', 'Volume down',
            ]},
            {'p': 'switch', 'c': 'basic', 's': [
                'Switch ON TV', 'Switch OFF TV',
            ]},
            {'p': 'lights', 'c': 'comfort', 's': [
                'Lights on', 'Lights off', 'Lights on off',
            ]},
            {'p': 'curtains', 'c': 'comfort', 's': [
                'Open curtains', 'Close curtains', 'Open close curtains',
            ]},
            {'p': 'open', 'c': 'comfort', 's': [
                'Open the curtains', 'Open the window I want fresh air',
            ]},
            {'p': 'close', 'c': 'comfort', 's': [
                'Close the window', 'Close the door', 'Close the curtains',
            ]},

            # People & visitors
            {'p': 'who', 'c': 'question', 's': [
                'Who is there', 'Who is at the door', 'Who is visiting today',
                'Who called just now', 'Who is on duty today',
            ]},
            {'p': 'when', 'c': 'question', 's': [
                'When is the doctor coming', 'When is the nurse coming',
                'When is medicine time', 'When is my next meal',
            ]},
            {'p': 'what', 'c': 'question', 's': [
                'What time is it now', 'What is for dinner tonight',
                'What is the weather outside', 'What is happening today',
                'What day is it today', 'What did the doctor say',
            ]},
            {'p': 'how', 'c': 'question', 's': [
                'How are you', 'How are the children doing',
                'How long until my next medicine', 'How is the weather outside',
            ]},
            {'p': 'is', 'c': 'question', 's': [
                'Is the doctor coming', 'Is it morning or evening',
                'Is it raining today',
            ]},

            # Caregiver instructions
            {'p': 'check', 'c': 'medical', 's': [
                'Check my vitals', 'Check oxygen level', 'Check my BP',
                'Check my temperature', 'Check the machine',
                'Check on me in thirty minutes', 'Check everything before sleeping',
                'Check vitals O2 pulse', 'Check ventilator alarm',
            ]},
            {'p': 'do not', 'c': 'basic', 's': [
                'Do not worry about me', 'Do not rush',
                'Do not wake me unless urgent',
            ]},
            {'p': 'keep', 'c': 'basic', 's': [
                'Keep water bottle near me', 'Keep the bell near my hand',
                'Keep phone on charging', 'Keep a small light on',
            ]},
            {'p': 'be', 'c': 'basic', 's': [
                'Be careful', 'Be gentle with me',
            ]},
            {'p': 'set', 'c': 'basic', 's': [
                'Set the room temperature', 'Set my alarm for morning',
            ]},

            # Safety & alerts
            {'p': 'something', 'c': 'emergency', 's': [
                'Something is wrong', 'Something is beeping',
                'Something does not feel right',
            ]},
            {'p': 'tt', 'c': 'emergency', 's': [
                'TT suction needed now',
            ]},
            {'p': 'oral', 'c': 'medical', 's': [
                'Oral suction needed',
            ]},
            {'p': 'ambu', 'c': 'emergency', 's': [
                'Ambu bag needed now', 'Breathing problem ambu bag',
            ]},
            {'p': 'breathing', 'c': 'emergency', 's': [
                'Breathing problem', 'Breathing discomfort',
                'Breathing problem ambu bag',
            ]},
            {'p': 'mosquito', 'c': 'comfort', 's': [
                'Mosquito is bothering me',
            ]},
            {'p': 'my', 'c': 'medical', 's': [
                'My throat is sore', 'My throat feels tight',
                'My mouth is very dry', 'My eyes are very dry',
                'My chest feels congested', 'My breathing feels different',
                'My neck needs more support', 'My hand is sliding down',
            ]},

            # Gratitude & positive
            {'p': 'you', 'c': 'greet', 's': [
                'You are very kind', 'You are doing a wonderful job',
                'You understood me perfectly', 'You make my day better',
            ]},
            {'p': 'that', 'c': 'basic', 's': [
                'That is better', 'That is enough',
                'That was exactly what I needed', 'That feels much better now',
            ]},

            # Night time
            {'p': 'leave', 'c': 'basic', 's': [
                'Leave a small light on',
            ]},
            {'p': 'hold', 'c': 'basic', 's': [
                'Hold my hand please', 'Hold my head please',
            ]},
            {'p': 'support', 'c': 'comfort', 's': [
                'Support my neck', 'Support my back properly',
                'Support under my arms please',
            ]},
            {'p': 'pull', 'c': 'comfort', 's': [
                'Pull me up on the bed', 'Pull me up in bed',
            ]},

            # ── HINDI (Devanagari) SENTENCE TEMPLATES ──
            {'p': '\u092e\u0941\u091d\u0947', 'c': 'basic', 's': [  # मुझे
                '\u092e\u0941\u091d\u0947 \u092a\u093e\u0928\u0940 \u091a\u093e\u0939\u093f\u090f',  # मुझे पानी चाहिए
                '\u092e\u0941\u091d\u0947 \u0926\u0935\u093e \u0926\u094b',  # मुझे दवा दो
                '\u092e\u0941\u091d\u0947 \u092d\u0942\u0916 \u0932\u0917\u0940 \u0939\u0948',  # मुझे भूख लगी है
                '\u092e\u0941\u091d\u0947 \u092a\u094d\u092f\u093e\u0938 \u0932\u0917\u0940 \u0939\u0948',  # मुझे प्यास लगी है
                '\u092e\u0941\u091d\u0947 \u0928\u0940\u0902\u0926 \u0906 \u0930\u0939\u0940 \u0939\u0948',  # मुझे नींद आ रही है
                '\u092e\u0941\u091d\u0947 \u0926\u0930\u094d\u0926 \u0939\u094b \u0930\u0939\u093e \u0939\u0948',  # मुझे दर्द हो रहा है
                '\u092e\u0941\u091d\u0947 \u0938\u0915\u094d\u0936\u0928 \u091a\u093e\u0939\u093f\u090f',  # मुझे सक्शन चाहिए
                '\u092e\u0941\u091d\u0947 \u091f\u0949\u092f\u0932\u0947\u091f \u091c\u093e\u0928\u093e \u0939\u0948',  # मुझे टॉयलेट जाना है
            ]},
            {'p': '\u0926\u0930\u094d\u0926', 'c': 'medical', 's': [  # दर्द
                '\u0926\u0930\u094d\u0926 \u0939\u094b \u0930\u0939\u093e \u0939\u0948',  # दर्द हो रहा है
                '\u0926\u0930\u094d\u0926 \u092c\u0922\u093c \u0930\u0939\u093e \u0939\u0948',  # दर्द बढ़ रहा है
                '\u0926\u0930\u094d\u0926 \u0915\u092e \u0939\u0948 \u0906\u091c',  # दर्द कम है आज
                '\u0926\u0930\u094d\u0926 \u0915\u0940 \u0926\u0935\u093e \u0926\u094b',  # दर्द की दवा दो
            ]},
            {'p': '\u092e\u092e\u094d\u092e\u0940', 'c': 'family', 's': [  # मम्मी
                '\u092e\u092e\u094d\u092e\u0940 \u0915\u094b \u092c\u0941\u0932\u093e\u0913',  # मम्मी को बुलाओ
                '\u092e\u092e\u094d\u092e\u0940 \u0915\u0939\u093e\u0901 \u0939\u0948',  # मम्मी कहाँ है
                '\u092e\u092e\u094d\u092e\u0940 \u0938\u0947 \u092c\u093e\u0924 \u0915\u0930\u0928\u0940 \u0939\u0948',  # मम्मी से बात करनी है
                '\u092e\u092e\u094d\u092e\u0940 \u0915\u094b \u0906\u0930\u093e\u092e \u0915\u0930\u0928\u0947 \u0926\u094b',  # मम्मी को आराम करने दो
            ]},
            {'p': '\u0921\u0949\u0915\u094d\u091f\u0930', 'c': 'medical', 's': [  # डॉक्टर
                '\u0921\u0949\u0915\u094d\u091f\u0930 \u0915\u094b \u092c\u0941\u0932\u093e\u0913',  # डॉक्टर को बुलाओ
                '\u0921\u0949\u0915\u094d\u091f\u0930 \u0915\u092c \u0906\u090f\u0902\u0917\u0947',  # डॉक्टर कब आएंगे
                '\u0921\u0949\u0915\u094d\u091f\u0930 \u0938\u0947 \u092c\u093e\u0924 \u0915\u0930\u094b',  # डॉक्टर से बात करो
            ]},
            {'p': '\u092a\u093e\u0928\u0940', 'c': 'basic', 's': [  # पानी
                '\u092a\u093e\u0928\u0940 \u0926\u094b',  # पानी दो
                '\u092a\u093e\u0928\u0940 \u0917\u0930\u092e \u0915\u0930\u094b',  # पानी गरम करो
                '\u092a\u093e\u0928\u0940 \u0920\u0902\u0921\u093e \u091a\u093e\u0939\u093f\u090f',  # पानी ठंडा चाहिए
            ]},
            {'p': '\u091a\u093e\u092f', 'c': 'basic', 's': [  # चाय
                '\u091a\u093e\u092f \u0926\u094b',  # चाय दो
                '\u0915\u093e\u0932\u0940 \u091a\u093e\u092f \u0926\u094b',  # काली चाय दो
                '\u091a\u093e\u092f \u092e\u0947\u0902 \u091a\u0940\u0928\u0940 \u0915\u092e',  # चाय में चीनी कम
            ]},
            {'p': '\u0926\u0935\u093e', 'c': 'medical', 's': [  # दवा
                '\u0926\u0935\u093e\u0908 \u0915\u093e \u0938\u092e\u092f \u0939\u094b \u0917\u092f\u093e',  # दवाई का समय हो गया
                '\u0926\u0935\u093e \u0926\u094b',  # दवा दो
                '\u0926\u0935\u093e\u0908 \u0915\u093e\u092e \u0928\u0939\u0940\u0902 \u0915\u0930 \u0930\u0939\u0940',  # दवाई काम नहीं कर रही
            ]},
            {'p': '\u092e\u0948\u0902', 'c': 'emotion', 's': [  # मैं
                '\u092e\u0948\u0902 \u0920\u0940\u0915 \u0939\u0942\u0901',  # मैं ठीक हूँ
                '\u092e\u0948\u0902 \u0916\u0941\u0936 \u0939\u0942\u0901',  # मैं खुश हूँ
                '\u092e\u0948\u0902 \u092a\u0930\u0947\u0936\u093e\u0928 \u0939\u0942\u0901',  # मैं परेशान हूँ
                '\u092e\u0948\u0902 \u0925\u0915 \u0917\u092f\u093e \u0939\u0942\u0901',  # मैं थक गया हूँ
                '\u092e\u0948\u0902 \u092c\u0947\u0939\u0924\u0930 \u092e\u0939\u0938\u0942\u0938 \u0915\u0930 \u0930\u0939\u093e \u0939\u0942\u0901',  # मैं बेहतर महसूस कर रहा हूँ
            ]},
            {'p': '\u092c\u0939\u0941\u0924', 'c': 'comfort', 's': [  # बहुत
                '\u092c\u0939\u0941\u0924 \u0920\u0902\u0921 \u0939\u0948',  # बहुत ठंड है
                '\u092c\u0939\u0941\u0924 \u0917\u0930\u094d\u092e\u0940 \u0939\u0948',  # बहुत गर्मी है
                '\u092c\u0939\u0941\u0924 \u0926\u0930\u094d\u0926 \u0939\u0948',  # बहुत दर्द है
            ]},
            {'p': '\u091c\u0932\u094d\u0926\u0940', 'c': 'emergency', 's': [  # जल्दी
                '\u091c\u0932\u094d\u0926\u0940 \u0906\u0913',  # जल्दी आओ
                '\u091c\u0932\u094d\u0926\u0940 \u0938\u0915\u094d\u0936\u0928 \u0915\u0930\u094b',  # जल्दी सक्शन करो
                '\u091c\u0932\u094d\u0926\u0940 \u0921\u0949\u0915\u094d\u091f\u0930 \u092c\u0941\u0932\u093e\u0913',  # जल्दी डॉक्टर बुलाओ
            ]},
            {'p': '\u0938\u094d\u091f\u093e\u092b', 'c': 'basic', 's': [  # स्टाफ
                '\u0938\u094d\u091f\u093e\u092b \u0915\u094b \u092c\u0941\u0932\u093e\u0913',  # स्टाफ को बुलाओ
                '\u0938\u094d\u091f\u093e\u092b \u0905\u091a\u094d\u091b\u093e \u0915\u093e\u092e \u0915\u0930 \u0930\u0939\u093e \u0939\u0948',  # स्टाफ अच्छा काम कर रहा है
            ]},
            {'p': '\u0938\u093e\u0902\u0938', 'c': 'emergency', 's': [  # सांस
                '\u0938\u093e\u0902\u0938 \u0932\u0947\u0928\u0947 \u092e\u0947\u0902 \u0924\u0915\u0932\u0940\u092b',  # सांस लेने में तकलीफ
                '\u0938\u093e\u0902\u0938 \u0928\u0939\u0940\u0902 \u0906 \u0930\u0939\u0940',  # सांस नहीं आ रही
            ]},
            {'p': '\u0938\u092e\u092f', 'c': 'basic', 's': [  # समय
                '\u0926\u0935\u093e\u0908 \u0915\u093e \u0938\u092e\u092f \u0939\u094b \u0917\u092f\u093e',  # दवाई का समय हो गया
                '\u0916\u093e\u0928\u0947 \u0915\u093e \u0938\u092e\u092f \u0939\u094b \u0917\u092f\u093e',  # खाने का समय हो गया
                '\u0938\u094b\u0928\u0947 \u0915\u093e \u0938\u092e\u092f \u0939\u094b \u0917\u092f\u093e',  # सोने का समय हो गया
            ]},
        ]

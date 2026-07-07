"""
GazeConnect AAC Training Corpus
================================
Curated dataset of 10,000+ sentences specifically designed for ALS/MND patient communication.
Organized by category with weighted importance for training.

Data Sources & Credits:
- Inspired by Vertanen & Kristensson (2011) AAC communication patterns
- Medical terminology from ALS Association communication guides
- Synthetic AAC-style telegraphic speech patterns
- Patient communication patterns from real-world caregiving contexts

Categories and training weights:
  - Core daily needs (weight 10): highest frequency, most critical
  - Medical/caregiving (weight 8): health, symptoms, equipment
  - Position/comfort (weight 7): body positioning, comfort requests
  - Food/drink (weight 6): meals, nutrition, preferences
  - Family/social (weight 5): relationships, emotional expression
  - Communication (weight 4): meta-communication, typing assistance
  - Activities (weight 3): entertainment, daily activities
  - General conversational (weight 2): broader English patterns
  - Hindi/Hinglish (weight 5): bilingual support
"""

import os
from typing import List, Sequence, Tuple


# ============================================================
# CORE DAILY NEEDS — Weight 10 (highest priority)
# These are the most frequent, life-critical communications
# ============================================================
CORE_DAILY_NEEDS = [
    # Basic requests
    "I need help",
    "I need water",
    "I need medicine",
    "I want water",
    "I want food",
    "I want to sleep",
    "I want to rest",
    "I am thirsty",
    "I am hungry",
    "I am tired",
    "I am cold",
    "I am hot",
    "I am in pain",
    "I feel pain",
    "I feel sick",
    "I feel dizzy",
    "I feel nauseous",
    "I feel weak",
    "I feel good",
    "I feel better",
    "I feel uncomfortable",
    "I feel sleepy",
    "please help me",
    "please come here",
    "please wait",
    "please hurry",
    "can you help me",
    "can you come here",
    "I need to go to bathroom",
    "I need to use the toilet",
    "I need the bedpan",
    "I need a blanket",
    "I need a pillow",
    "I need to eat",
    "I need to drink",
    "I need my glasses",
    "I need my phone",
    "I need some rest",

    # Yes/No/Quick responses
    "yes",
    "no",
    "yes please",
    "no thank you",
    "okay",
    "not now",
    "maybe later",
    "I think so",
    "I don't think so",
    "I don't know",
    "I agree",
    "I disagree",
    "that is fine",
    "that is not right",
    "that is correct",
    "I understand",
    "I don't understand",
    "please repeat",
    "say that again",
    "what did you say",

    # Time-related
    "what time is it",
    "how long will it take",
    "when is the doctor coming",
    "when is my next medicine",
    "when is dinner",
    "when is lunch",
    "when will you be back",
    "it is time for medicine",
    "it is time for food",
    "it is time for sleep",
    "it has been a long time",
    "I have been waiting",

    # Calling attention
    "come here please",
    "where are you",
    "who is there",
    "is anyone there",
    "I need someone",
    "can someone come",
    "don't leave me alone",
    "stay with me",
    "please don't go",
    "I am calling you",
]

# ============================================================
# EMERGENCY PHRASES — Weight 10 (life-critical)
# ============================================================
EMERGENCY_PHRASES = [
    "I need help immediately",
    "I am having trouble breathing",
    "I cannot breathe",
    "call the doctor",
    "call the nurse",
    "call an ambulance",
    "I am choking",
    "I am in severe pain",
    "something is wrong",
    "I need oxygen",
    "I need suction now",
    "my breathing is difficult",
    "I feel like I am going to faint",
    "my heart is racing",
    "I am having chest pain",
    "I need emergency help",
    "this is an emergency",
    "I need the ventilator",
    "please check my vitals",
    "I am not feeling well at all",
]

# ============================================================
# MEDICAL & CAREGIVING — Weight 8
# ============================================================
MEDICAL_CAREGIVING = [
    # Suction & breathing
    "I need suction",
    "please do suction",
    "suction my mouth",
    "suction my throat",
    "there is too much saliva",
    "saliva is thick",
    "saliva is building up",
    "I need the suction machine",
    "clean the suction tube",
    "my mouth is dry",
    "my throat is dry",
    "I need oxygen mask",
    "adjust the oxygen",
    "increase the oxygen",
    "decrease the oxygen",
    "check the oxygen level",
    "my oxygen is low",

    # BiPAP/Ventilator
    "adjust the BiPAP",
    "the BiPAP pressure is too high",
    "the BiPAP pressure is too low",
    "the mask is not fitting properly",
    "the mask is uncomfortable",
    "the mask is leaking",
    "I need a new mask",
    "clean the BiPAP",
    "check the ventilator",
    "the ventilator is beeping",
    "the ventilator settings need adjustment",
    "I cannot tolerate the pressure",

    # Medications
    "I need my medicine",
    "what medicine is next",
    "I need pain medicine",
    "give me my tablets",
    "I need the eye drops",
    "apply the ointment",
    "I need the nebulizer",
    "start the nebulizer",
    "the medicine is making me drowsy",
    "the medicine is not working",
    "I think I need a different medicine",
    "when is the next dose",
    "I already took my medicine",
    "I missed my medicine",
    "I need glycolate drops",

    # Symptoms
    "I have a headache",
    "I have body pain",
    "my back hurts",
    "my neck hurts",
    "my legs are cramping",
    "I have muscle cramps",
    "my arm is sore",
    "my shoulder hurts",
    "I am having spasms",
    "the spasms are bad today",
    "I have a fever",
    "I feel feverish",
    "my stomach hurts",
    "I feel bloated",
    "I am constipated",
    "I have acidity",
    "my eyes are burning",
    "my eyes are dry",
    "I cannot swallow",
    "swallowing is difficult today",
    "I have difficulty swallowing",

    # Vitals & monitoring
    "check my blood pressure",
    "check my temperature",
    "check my sugar level",
    "check my pulse",
    "check my oxygen saturation",
    "what is my blood pressure",
    "what is my temperature",
    "what is my oxygen level",
    "record my vitals",
    "my blood pressure is high",
    "my blood pressure is low",

    # Feeding tube
    "start the feeding",
    "stop the feeding",
    "the feeding tube is uncomfortable",
    "check the feeding tube",
    "the feed rate is too fast",
    "the feed rate is too slow",
    "I feel full",
    "I am getting nauseous from the feed",
    "flush the tube",
    "I need water through the tube",

    # Care instructions
    "clean my face",
    "clean my mouth",
    "brush my teeth",
    "wipe my eyes",
    "clean my nose",
    "apply moisturizer",
    "apply body lotion",
    "my skin is dry",
    "I need a sponge bath",
    "I need to be cleaned up",
    "change my diaper",
    "change my clothes",
    "change the bed sheet",
    "trim my nails",
    "comb my hair",
    "shave my face",
    "clean neck properly",
]

# ============================================================
# POSITION & COMFORT — Weight 7
# ============================================================
POSITION_COMFORT = [
    "turn me on my left side",
    "turn me on my right side",
    "turn me on my back",
    "change my position",
    "I need to be repositioned",
    "raise my head",
    "lower my head",
    "raise my legs",
    "lower my legs",
    "tilt the bed up",
    "tilt the bed down",
    "adjust the pillow",
    "put the pillow under my head",
    "put the pillow under my knees",
    "put the pillow between my legs",
    "my back needs support",
    "support my neck",
    "support my arm",
    "I have been in this position too long",
    "I need to be turned",
    "please reposition me",
    "make me sit up",
    "make me lie down",
    "I want to sit in the wheelchair",
    "I want to get out of bed",
    "I want to go back to bed",
    "adjust my wheelchair",
    "lock the wheelchair",
    "unlock the wheelchair",
    "the bed is too hard",
    "the bed is too soft",
    "I am not comfortable",
    "this position hurts",
    "my arm is going numb",
    "my leg is going numb",
    "straighten my legs",
    "straighten my arms",
    "bend my knees slightly",
    "the blanket is too heavy",
    "cover me with the blanket",
    "remove the blanket",
    "the room is too cold",
    "the room is too hot",
    "turn on the fan",
    "turn off the fan",
    "increase the fan speed",
    "turn on the air conditioner",
    "turn off the air conditioner",
    "set the temperature lower",
    "set the temperature higher",
    "open the window",
    "close the window",
    "the light is too bright",
    "turn off the light",
    "turn on the light",
    "dim the lights",
]

# ============================================================
# FOOD & DRINK — Weight 6
# ============================================================
FOOD_DRINK = [
    "I want tea",
    "I want coffee",
    "I want milk",
    "I want juice",
    "I want soup",
    "I want black tea",
    "I want green tea",
    "make me some tea",
    "the tea is too hot",
    "the tea is too cold",
    "I want breakfast",
    "I want lunch",
    "I want dinner",
    "I want a snack",
    "what is for dinner",
    "what is for lunch",
    "I want dal and rice",
    "I want khichdi",
    "I want roti",
    "I want dalia",
    "I want curd",
    "I want fruit",
    "I want banana",
    "I want apple",
    "give me small portions",
    "I am not hungry right now",
    "the food is too spicy",
    "the food is too salty",
    "the food is too bland",
    "the food is good",
    "I liked the food",
    "I want something sweet",
    "I want something light",
    "I want desi nashta",
    "make soft food",
    "blend the food",
    "the food is too thick",
    "the food is too thin",
    "warm up the food",
    "I want warm water",
    "I want cold water",
    "I want room temperature water",
    "give me water slowly",
    "I need a straw",
    "I can eat a little more",
    "I am done eating",
    "that is enough",
    "I want ice cream",
    "I want pudding",
]

# ============================================================
# FAMILY & SOCIAL — Weight 5
# ============================================================
FAMILY_SOCIAL = [
    "I love you",
    "I miss you",
    "thank you",
    "thank you very much",
    "thank you for your help",
    "thank you for taking care of me",
    "I appreciate your help",
    "you are doing a great job",
    "I am grateful",
    "I am sorry",
    "please forgive me",
    "how are you",
    "how is everyone",
    "how are the children",
    "how is work going",
    "tell me about your day",
    "what happened today",
    "who came to visit",
    "who called",
    "did anyone call for me",
    "I want to talk to my family",
    "call my son",
    "call my daughter",
    "call my wife",
    "call my brother",
    "call my sister",
    "I want to see the children",
    "bring the baby here",
    "show me the photos",
    "show me the video",
    "take my photo",
    "send my love to everyone",
    "tell them I am okay",
    "tell them not to worry",
    "I am doing better",
    "I had a good day",
    "I had a difficult day",
    "I want to go home",
    "when can I go home",
    "I want visitors",
    "no visitors today",
    "I want some privacy",
    "please give me some time alone",
    "I want to pray",
    "read to me",
    "play some music",
    "put on the TV",
    "change the channel",
    "what is on TV",
    "turn up the volume",
    "turn down the volume",
    "happy birthday",
    "congratulations",
    "good morning",
    "good night",
    "good afternoon",
    "sleep well",
    "have a good day",
    "take care",
    "be careful",
    "I am proud of you",
    "you make me happy",
    "I want to write a message",
    "type this message for me",
    "send this message",
    "read my messages",
]

# ============================================================
# COMMUNICATION & META — Weight 4
# ============================================================
COMMUNICATION_META = [
    "I am trying to say something",
    "wait I am not done",
    "give me a moment",
    "I need more time to type",
    "please be patient",
    "let me finish",
    "I made a mistake",
    "delete that",
    "go back",
    "start over",
    "that is not what I meant",
    "let me rephrase",
    "I want to say",
    "what I mean is",
    "listen carefully",
    "this is important",
    "please write this down",
    "please remember this",
    "don't forget",
    "I will tell you later",
    "we will talk about this later",
    "never mind",
    "forget what I said",
    "I changed my mind",
    "can you read that back to me",
    "speak louder please",
    "speak slower please",
    "I cannot hear you",
    "come closer",
    "look at the screen",
    "read what I typed",
    "the prediction is wrong",
    "clear the text",
    "save this message",
]

# ============================================================
# ACTIVITIES & ENTERTAINMENT — Weight 3
# ============================================================
ACTIVITIES_ENTERTAINMENT = [
    "I want to watch TV",
    "I want to watch a movie",
    "I want to listen to music",
    "play my favorite song",
    "play devotional music",
    "play classical music",
    "I want to read",
    "read the newspaper to me",
    "read the news",
    "what is the weather today",
    "what is the date today",
    "what day is today",
    "I want to go outside",
    "take me for a walk",
    "take me to the balcony",
    "take me to the garden",
    "I want some fresh air",
    "open the curtains",
    "close the curtains",
    "I want to see the sunrise",
    "I want to see outside",
    "I want to exercise",
    "do my physiotherapy",
    "stretch my muscles",
    "massage my legs",
    "massage my arms",
    "massage my back",
    "I want to play a game",
    "I want to video call",
    "show me on the computer",
    "browse the internet",
]

# ============================================================
# GENERAL CONVERSATIONAL — Weight 2
# Broader English patterns for semantic coverage
# ============================================================
GENERAL_CONVERSATIONAL = [
    "I think we should",
    "can we talk about",
    "I have a question",
    "I have something to tell you",
    "I want to discuss",
    "what do you think",
    "that is a good idea",
    "that is not a good idea",
    "I don't agree with that",
    "let me think about it",
    "I have decided",
    "I have changed my mind",
    "I am worried about",
    "I am happy about",
    "I am sad about",
    "I am angry about",
    "I am frustrated",
    "I am scared",
    "I am lonely",
    "I am bored",
    "I am grateful for",
    "I remember when",
    "do you remember",
    "tell me about",
    "I want to know",
    "explain to me",
    "how does this work",
    "why is this happening",
    "when will this end",
    "where is it",
    "who is coming",
    "what is happening",
    "what is going on",
    "everything is fine",
    "don't worry about me",
    "I will be okay",
    "things will get better",
    "one day at a time",
    "I need to tell you something important",
    "please listen to me",
    "this is very important",
    "I have been thinking",
    "I want you to know",
    "I need to make a decision",
    "please help me decide",
    "I trust you",
    "I believe in you",
    "you are doing well",
    "keep going",
    "don't give up",
    "we can do this",
    "together we are strong",
    "I am fighting",
    "I will not give up",
    "every day is a gift",
    "life is beautiful",
    "I am blessed",
    "God is great",

    # Telegraphic / abbreviated AAC patterns
    "need water",
    "want food",
    "pain bad",
    "feel sick",
    "help now",
    "come quick",
    "turn me",
    "raise head",
    "lower bed",
    "more pillow",
    "too hot",
    "too cold",
    "suction please",
    "medicine time",
    "change position",
    "need rest",
    "feeling better",
    "not good",
    "very tired",
    "want sleep",
    "mouth dry",
    "eyes burning",
    "leg cramp",
    "back pain",
    "need blanket",
    "fan on",
    "fan off",
    "light off",
    "light on",
    "TV on",
    "TV off",
    "call nurse",
    "call doctor",
    "thank you",
    "love you",
    "miss you",
    "good morning",
    "good night",
]

# ============================================================
# STAFF/CAREGIVER INSTRUCTIONS — Weight 4
# ============================================================
CAREGIVER_INSTRUCTIONS = [
    "please be gentle",
    "be careful with my arm",
    "be careful with my neck",
    "hold my head when turning",
    "support my back",
    "go slowly",
    "that hurts stop",
    "that is too rough",
    "that is better",
    "perfect thank you",
    "you need to wash your hands first",
    "use gloves please",
    "the suction needs to be at this level",
    "do not turn me too fast",
    "hold me steady",
    "I will tell you when to stop",
    "keep the door open",
    "keep the door closed",
    "keep the room clean",
    "the bed needs to be changed",
    "the water needs to be fresh",
    "make sure the machine is charged",
    "check the battery",
    "the alarm is going off",
    "what is that sound",
    "is everything okay with the equipment",
    "the tube is kinked",
    "there is a blockage",
    "clean the equipment",
    "sterilize the equipment",
    "the nurse should check this",
    "schedule the doctor visit",
    "when is the next appointment",
    "cancel the appointment",
    "reschedule the appointment",
]

# ============================================================
# HINDI / HINGLISH — Weight 5
# ============================================================
HINDI_HINGLISH = [
    # Basic Hindi
    "mujhe paani chahiye",
    "mujhe bhookh lagi hai",
    "mujhe dard ho raha hai",
    "mujhe madad chahiye",
    "mujhe neend aa rahi hai",
    "mujhe thanda lag raha hai",
    "mujhe garmi lag rahi hai",
    "kya haal hai",
    "theek hai",
    "theek nahi hai",
    "haan",
    "nahi",
    "shukriya",
    "dhanyavaad",
    "kripya",
    "please",
    "maaf kijiye",
    "yahan aao",
    "wahan jao",
    "kya hua",
    "kya kar rahe ho",
    "kab aayenge",
    "kaun aaya hai",
    "baat karo",
    "sun raha hai",
    "samajh nahi aaya",
    "dubara bolo",
    "dheere bolo",
    "karvat do",
    "sar uthao",
    "pair uthao",
    "dawai do",
    "dawai ka time",
    "suction karo",
    "muh saaf karo",
    "pani do",
    "chai do",
    "khana do",
    "AC chalu karo",
    "AC band karo",
    "pankha chalu karo",
    "pankha band karo",
    "light band karo",
    "light chalu karo",
    "TV lagao",
    "TV band karo",
    "phone do",
    "ghar jaana hai",
    "aaram karna hai",
    "neend aa rahi hai",
    "doctor ko bulao",
    "nurse ko bulao",
    "jaldi aao",
    "mat jao",
    "yahi raho",
    "bahut dard hai",
    "dard kam hai",
    "ab theek hai",
    "bahut accha",
    "bilkul sahi",
    "galat hai",
    "sahi hai",
    "pata nahi",
    "baad mein bataunga",
    "abhi nahi",
    "ruk jao",
    "chalo",
    "hogaya",
    "aur chahiye",
    "bas",
    "aur nahi",
    "thoda sa",
    "bahut zyada",
    "kam karo",
    "aur karo",
    "mujhe pyaar hai tumse",
    "sab ko mera pyaar",
    "bacche kaise hain",
    "ghar mein sab theek hai",
    "bhagwan ka shukar hai",
    "mandir jaana hai",
    "pooja ka time hai",
    "aarti karo",
]

# ============================================================
# SENTENCE COMPLETION PATTERNS — Weight 6
# Common sentence starters with multiple completions
# These train the model to complete partial sentences
# ============================================================
SENTENCE_PATTERNS = [
    # "I want..." patterns
    "I want to go outside",
    "I want to talk to someone",
    "I want to watch something",
    "I want to eat something light",
    "I want to call my family",
    "I want to rest for a while",
    "I want to sit up",
    "I want to lie down",
    "I want some company",
    "I want to be alone",

    # "I need..." patterns
    "I need my medicine now",
    "I need to be repositioned",
    "I need fresh water",
    "I need a clean towel",
    "I need the remote control",
    "I need my reading glasses",
    "I need the nurse to check on me",
    "I need to see the doctor",
    "I need help with something",
    "I need to use the bathroom",

    # "Can you..." patterns
    "can you come here for a moment",
    "can you help me with this",
    "can you turn me over",
    "can you give me some water",
    "can you call the doctor",
    "can you check my vitals",
    "can you adjust my pillow",
    "can you read this to me",
    "can you open the window",
    "can you close the door",
    "can you bring me my phone",
    "can you play some music",

    # "Please..." patterns
    "please be careful",
    "please come quickly",
    "please don't leave me alone",
    "please turn off the lights",
    "please give me some time",
    "please tell the doctor",
    "please call my family",
    "please help me sit up",
    "please adjust the temperature",
    "please check the equipment",

    # "The..." patterns (observations)
    "the pain is getting worse",
    "the pain is getting better",
    "the medicine is working",
    "the medicine is not working",
    "the room is too cold",
    "the room is too hot",
    "the food was good",
    "the food was not good",
    "the nurse was very helpful",
    "the doctor said everything is fine",

    # "My..." patterns
    "my breathing is difficult today",
    "my muscles are sore",
    "my throat is dry",
    "my eyes need drops",
    "my legs are cramping again",
    "my back hurts a lot",
    "my family is coming to visit",
    "my medicine schedule changed",
    "my appetite is better today",
    "my sleep was disturbed last night",
]

# ============================================================
# CONTEXTUAL WORD SEQUENCES — Weight 3
# Short phrases that build n-gram associations
# ============================================================
CONTEXTUAL_SEQUENCES = [
    # Adjective-noun patterns
    "good morning everyone",
    "good night dear",
    "cold water please",
    "warm water please",
    "fresh air please",
    "deep breath",
    "sharp pain",
    "dull pain",
    "severe headache",
    "mild fever",
    "high blood pressure",
    "low blood pressure",
    "normal temperature",
    "regular checkup",
    "daily routine",
    "morning walk",
    "evening prayer",
    "night medicine",
    "soft pillow",
    "clean clothes",
    "fresh sheets",
    "comfortable position",
    "difficult breathing",
    "easy breathing",
    "clear throat",
    "dry mouth",
    "wet wipes",
    "warm blanket",
    "cool breeze",
    "bright light",
    "dim light",
    "loud noise",
    "quiet room",

    # Verb-object patterns
    "take medicine",
    "drink water",
    "eat food",
    "change position",
    "call doctor",
    "call nurse",
    "check vitals",
    "clean room",
    "adjust bed",
    "turn light",
    "open window",
    "close door",
    "play music",
    "watch TV",
    "read book",
    "write message",
    "send message",
    "make call",
    "take photo",
    "show picture",
    "bring food",
    "remove blanket",
    "give medicine",
    "apply cream",
    "start feeding",
    "stop feeding",
    "begin exercise",
    "do physiotherapy",
]


def _dedupe_sentences(sentences: Sequence[str]) -> List[str]:
    """Deduplicate while preserving order and normalizing spacing."""
    seen = set()
    unique: List[str] = []

    for sentence in sentences:
        normalized = " ".join(sentence.strip().split())
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(normalized)

    return unique


def _build_generated_intent_variations() -> List[str]:
    """
    Lightweight slot-based AAC expansion.
    Adds semantic breadth without making runtime inference heavier.
    """
    sentences: List[str] = []

    request_items = [
        "water", "warm water", "cold water", "medicine", "suction", "oxygen",
        "a blanket", "a pillow", "my phone", "my glasses", "a towel", "the remote",
    ]
    for stem in [
        "I need", "I want", "Please give me", "Please bring me",
        "Can you give me", "Can you bring me",
    ]:
        for item in request_items:
            sentences.append(f"{stem} {item}")

    request_actions = [
        "change position", "sit up", "lie down", "turn left", "turn right",
        "check my oxygen", "check my vitals", "adjust my pillow",
        "clean my mouth", "call the doctor", "call the nurse",
        "open the window", "close the window",
    ]
    for stem in [
        "I need to", "Please help me", "Can you help me",
        "Please", "Can you",
    ]:
        for action in request_actions:
            sentences.append(f"{stem} {action}")

    body_parts = [
        "head", "neck", "back", "chest", "stomach",
        "throat", "legs", "arms", "shoulders", "eyes",
    ]
    body_states = [
        "hurts", "is sore", "feels numb", "is stiff",
        "is uncomfortable", "needs support",
    ]
    for body in body_parts:
        for state in body_states:
            sentences.append(f"my {body} {state}")

    pain_locations = ["back", "neck", "legs", "shoulders", "chest", "stomach"]
    pain_levels = ["is worse", "is better", "is severe", "is manageable"]
    for location in pain_locations:
        for level in pain_levels:
            sentences.append(f"the pain in my {location} {level}")

    environment_pairs: List[Tuple[str, str]] = [
        ("turn on", "fan"),
        ("turn off", "fan"),
        ("turn on", "light"),
        ("turn off", "light"),
        ("open", "window"),
        ("close", "window"),
        ("open", "curtains"),
        ("close", "curtains"),
        ("increase", "fan speed"),
        ("lower", "room temperature"),
    ]
    for stem in ["Please", "Can you"]:
        for action, target in environment_pairs:
            sentences.append(f"{stem} {action} the {target}")

    family_people = ["son", "daughter", "wife", "brother", "sister", "family"]
    for person in family_people:
        sentences.append(f"please call my {person}")
        sentences.append(f"how is my {person}")
    for phrase in [
        "tell them I love them",
        "tell them I miss them",
        "tell them I am okay",
        "thank you for being here",
        "thank you for helping me",
        "I want to send a message",
        "please read my messages",
    ]:
        sentences.append(phrase)

    hindi_needs = [
        "paani", "garam paani", "thanda paani", "dawai", "suction",
        "oxygen", "blanket", "takiya", "phone", "madad",
    ]
    for need in hindi_needs:
        sentences.append(f"mujhe {need} chahiye")

    hindi_actions = [
        "karvat do", "sar uthao", "pair uthao", "doctor ko bulao",
        "nurse ko bulao", "light band karo", "light chalu karo",
        "pankha band karo", "pankha chalu karo", "window kholo",
    ]
    for action in hindi_actions:
        sentences.append(action)
        sentences.append(f"please {action}")

    hinglish_body_parts = ["sir", "gala", "peeth", "pair", "haath", "aankh"]
    hinglish_states = [
        "dard kar raha hai", "sukha hai", "theek nahi hai", "bahut dard hai",
    ]
    for body in hinglish_body_parts:
        for state in hinglish_states:
            sentences.append(f"mera {body} {state}")

    return _dedupe_sentences(sentences)


GENERATED_INTENT_VARIATIONS = _build_generated_intent_variations()


# ============================================================
# EXTENDED VOCABULARY CORPUS (2026-07 — lift the neural vocab ceiling)
# The trained model can only predict words it has SEEN in the corpus. The
# original corpus had ~684 unique words, which is why the model was capped at
# 661 vocab. This generator introduces a much broader everyday vocabulary
# (including the GENERAL_ENGLISH_VOCABULARY words) in grammatical context, using
# TYPED slots so sentences stay sensible ("I want water", never "I want tired").
# Deterministic (no randomness) so training is reproducible; deduped.
# ============================================================

def _build_extended_vocabulary_corpus() -> List[str]:
    sents: List[str] = []

    # Subjects paired with the correct "be" form (keeps grammar clean).
    subj_be = [
        ("I", "am"), ("you", "are"), ("we", "are"), ("they", "are"),
        ("he", "is"), ("she", "is"), ("it", "is"), ("mother", "is"),
        ("father", "is"), ("my son", "is"), ("my daughter", "is"),
        ("my wife", "is"), ("my husband", "is"), ("the doctor", "is"),
        ("the nurse", "is"), ("everyone", "is"),
    ]
    # Base-verb subjects (take "want", not "wants") for transitive templates.
    base_subj = ["I", "you", "we", "they"]

    feelings = [
        "tired", "cold", "hot", "hungry", "thirsty", "comfortable",
        "uncomfortable", "better", "worse", "fine", "okay", "happy", "sad",
        "worried", "sleepy", "dizzy", "weak", "restless", "hopeful",
        "grateful", "ready", "sure", "awake", "afraid", "confused", "calm",
        "relaxed", "excited", "bored", "lonely", "nervous", "peaceful",
    ]
    trans_verbs = ["want", "need", "like", "have", "see", "bring",
                   "give", "take", "hold", "find", "use", "want to see"]
    objects = [
        "water", "food", "medicine", "blanket", "pillow", "phone", "book",
        "television", "music", "light", "fan", "window", "door", "glasses",
        "tissue", "chair", "remote", "newspaper", "computer", "internet",
        "information", "appointment", "message", "breakfast", "dinner",
        "juice", "tea", "coffee", "soup", "fruit", "biscuit", "photograph",
        "picture", "letter", "calendar", "clock", "towel", "bag", "keys",
        "wheelchair", "oxygen", "napkin", "spoon", "bottle", "charger",
    ]
    want_to_verbs = [
        "rest", "sleep", "eat", "drink", "talk", "read", "watch television",
        "listen to music", "go outside", "sit up", "lie down", "move",
        "change position", "walk", "pray", "relax", "sleep now", "call someone",
        "see the doctor", "go home", "take a bath", "brush my teeth",
        "get dressed", "make a phone call", "write a message", "remember this",
        "understand this", "continue", "wait", "try again",
    ]
    places = [
        "bathroom", "kitchen", "bedroom", "hospital", "garden", "doctor",
        "living room", "balcony", "temple", "market", "park", "window",
    ]
    times = [
        "now", "today", "tomorrow", "tonight", "later", "soon",
        "this morning", "this afternoon", "this evening", "in the morning",
        "at night", "right now", "in a minute", "before lunch",
    ]
    adjectives = [
        "important", "difficult", "comfortable", "wonderful", "beautiful",
        "helpful", "useful", "serious", "nice", "special", "different",
        "necessary", "possible", "wrong", "correct", "ready", "clear",
        "expensive", "heavy", "light", "quiet", "noisy", "warm", "cool",
    ]
    q_nouns = ["name", "time", "weather", "appointment", "medicine", "plan",
               "temperature", "schedule", "problem", "reason", "answer"]
    request_verbs = ["bring", "give", "get", "pass", "hold", "open", "close",
                     "fix", "check", "clean", "move", "adjust", "find", "turn on",
                     "turn off"]

    def add(s):
        sents.append(s)

    # 1) feelings: "{subj} {be} {feeling}" and "feeling {feeling}"
    for subj, be in subj_be:
        for f in feelings:
            add(f"{subj} {be} {f}")
        for f in feelings[:16]:
            add(f"{subj} {be} feeling {f}")
    # 2) feelings + time
    for f in feelings:
        for t in times[:8]:
            add(f"I am {f} {t}")
    # 3) transitive: "{base_subj} {verb} {object}"
    for subj in base_subj:
        for v in trans_verbs:
            for o in objects:
                add(f"{subj} {v} {o}")
    # 4) want/need to + action
    for lead in ("I want to", "I need to", "I would like to", "please let me",
                 "can I", "we want to"):
        for wv in want_to_verbs:
            add(f"{lead} {wv}")
    # 5) polite requests with objects
    for lead in ("please", "can you", "could you please", "would you"):
        for rv in request_verbs:
            for o in objects[:26]:
                add(f"{lead} {rv} the {o}")
    # 6) go to a place
    for lead in ("I want to go to the", "please take me to the",
                 "can we go to the", "I need to go to the"):
        for p in places:
            add(f"{lead} {p}")
    # 7) questions
    for qn in q_nouns:
        add(f"what is the {qn}")
        add(f"how is your {qn}")
        add(f"when is the {qn}")
    for o in objects[:24]:
        add(f"where is my {o}")
        add(f"where is the {o}")
    # 8) "this is very / it is" + adjective
    for lead in ("this is very", "it is", "that is", "this looks",
                 "everything is", "it feels"):
        for a in adjectives:
            add(f"{lead} {a}")
    # 9) gratitude / social with objects
    for o in objects[:24]:
        add(f"thank you for the {o}")
        add(f"I would like some {o}")
        add(f"do we have any {o}")
    # 10) common conversational openers/continuations
    openers = [
        "hello how are you", "hello good morning", "good morning everyone",
        "good afternoon", "good evening", "how are you today",
        "nice to meet you", "see you soon", "see you tomorrow",
        "thank you so much", "i love you", "i miss you", "take care",
        "please come here", "i am doing fine", "how was your day",
        "did you eat something", "are you feeling okay", "let us talk",
        "i want to tell you something", "i have an idea", "that is a good idea",
        "we need more information", "this is a good opportunity",
        "i understand the situation", "please be careful", "everything will be fine",
    ]
    sents.extend(openers)
    # 11) light Hinglish coverage
    hinglish = [
        "mujhe pani chahiye", "mujhe khana chahiye", "mujhe dawa chahiye",
        "mujhe aaram karna hai", "mujhe neend aa rahi hai",
        "mujhe dard ho raha hai", "aap kaise ho", "main theek hoon",
        "thoda pani do", "khana laga do", "dawa ka time ho gaya",
        "mummy ko bulao", "papa ko bulao", "doctor ko bulao",
        "mujhe garam pani chahiye", "mujhe thanda pani chahiye",
        "please light band karo", "please pankha chalu karo",
    ]
    sents.extend(hinglish)

    # ---- VOCABULARY SEEDING ----------------------------------------------
    # The neural model can only predict words it has SEEN. To let it cover the
    # app's real vocabulary (not just the ~684 words above), seed a broad
    # common-English word set into a few templates each so every word appears
    # >=2-3 times and enters the trained vocabulary. Context is light for these,
    # but it lets the model rerank them instead of being blind to them.
    seed_nouns = [
        "doctor", "nurse", "family", "friend", "mother", "father", "brother",
        "sister", "daughter", "husband", "wife", "child", "children", "people",
        "person", "neighbour", "hospital", "medicine", "medication", "treatment",
        "therapy", "appointment", "exercise", "breakfast", "lunch", "dinner",
        "kitchen", "bathroom", "bedroom", "window", "blanket", "pillow",
        "cushion", "wheelchair", "computer", "internet", "website", "phone",
        "television", "channel", "weather", "temperature", "distance", "location",
        "address", "country", "city", "company", "business", "account",
        "community", "government", "society", "technology", "education",
        "information", "opportunity", "initiative", "situation", "condition",
        "position", "direction", "decision", "solution", "question", "answer",
        "problem", "reason", "result", "example", "purpose", "process",
        "progress", "project", "program", "schedule", "calendar", "meeting",
        "message", "moment", "minute", "morning", "afternoon", "evening",
        "weekend", "holiday", "birthday", "music", "movie", "story", "picture",
        "photograph", "newspaper", "magazine", "book", "letter", "water",
        "juice", "tea", "coffee", "fruit", "food", "bread", "rice", "milk",
        "sugar", "salt", "oil", "money", "market", "garden", "park", "temple",
        "church", "office", "school", "college", "road", "car", "bus", "train",
        "clothes", "shoes", "glasses", "watch", "keys", "bag", "wallet",
        "oxygen", "ventilator", "suction", "bandage", "wound", "fever", "cough",
        "pain", "comfort", "rest", "sleep", "dream", "hope", "prayer", "faith",
        "love", "care", "help", "support", "attention", "patience", "courage",
    ]
    seed_verbs = [
        "continue", "complete", "consider", "describe", "explain", "suggest",
        "prepare", "arrange", "organize", "manage", "handle", "receive",
        "deliver", "provide", "require", "include", "prevent", "protect",
        "improve", "increase", "reduce", "remove", "replace", "repair",
        "maintain", "control", "operate", "connect", "update", "install",
        "remember", "forget", "understand", "realize", "recognize", "decide",
        "choose", "compare", "change", "happen", "arrive", "return", "travel",
        "follow", "listen", "watch", "notice", "believe", "imagine", "expect",
        "promise", "accept", "agree", "explore", "discuss", "contact", "visit",
        "invite", "introduce", "celebrate", "finish", "start", "explain",
    ]
    seed_adjs = [
        "important", "different", "difficult", "possible", "impossible",
        "available", "necessary", "comfortable", "uncomfortable", "wonderful",
        "beautiful", "special", "general", "personal", "physical", "mental",
        "emotional", "medical", "natural", "normal", "regular", "serious",
        "careful", "helpful", "useful", "powerful", "peaceful", "grateful",
        "hopeful", "similar", "certain", "recent", "current", "entire",
        "complete", "perfect", "simple", "quiet", "gentle", "kind", "patient",
        "strong", "weak", "healthy", "clean", "fresh", "warm", "cool", "bright",
    ]
    for n in seed_nouns:
        add(f"I need the {n}")
        add(f"where is the {n}")
        add(f"please bring the {n}")
    for v in seed_verbs:
        add(f"I want to {v}")
        add(f"can you {v} this")
        add(f"please {v} it")
    for a in seed_adjs:
        add(f"it is very {a}")
        add(f"this is {a}")
        add(f"that looks {a}")

    return _dedupe_sentences(sents)


EXTENDED_VOCABULARY_CORPUS = _build_extended_vocabulary_corpus()


def _load_external_corpus() -> List[str]:
    """Load the optional real-English corpus produced by fetch_external_corpus.py.

    Returns [] when the file is absent, so the blueprint (and therefore every
    training run, corpus stat, and the shipped app) is byte-identical to before
    unless a developer explicitly fetched it. The file is training-time only —
    nothing in the runtime app imports this module.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "external_corpus.txt")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return [line.strip() for line in fh if line.strip()]
    except OSError:
        return []


EXTERNAL_CORPUS = _load_external_corpus()


def get_corpus_blueprint() -> List[Tuple[List[str], int, str]]:
    """Return the weighted category blueprint used to assemble the corpus."""
    blueprint = [
        (CORE_DAILY_NEEDS, 10, "core_daily"),
        (EMERGENCY_PHRASES, 10, "emergency"),
        (MEDICAL_CAREGIVING, 8, "medical"),
        (POSITION_COMFORT, 7, "position"),
        (FOOD_DRINK, 6, "food"),
        (FAMILY_SOCIAL, 5, "family"),
        (COMMUNICATION_META, 4, "communication"),
        (CAREGIVER_INSTRUCTIONS, 4, "caregiver"),
        (ACTIVITIES_ENTERTAINMENT, 3, "activities"),
        (GENERAL_CONVERSATIONAL, 2, "general"),
        (HINDI_HINGLISH, 5, "hindi"),
        (SENTENCE_PATTERNS, 6, "patterns"),
        (CONTEXTUAL_SEQUENCES, 3, "contextual"),
        (GENERATED_INTENT_VARIATIONS, 4, "generated"),
        (EXTENDED_VOCABULARY_CORPUS, 2, "extended_vocab"),
    ]
    # Weight 1: teaches real vocabulary + grammar for breadth, while the curated
    # AAC categories above stay over-represented (weights 2-10) so the model still
    # prioritizes patient-critical phrasing. Present only if a developer fetched it.
    if EXTERNAL_CORPUS:
        blueprint.append((EXTERNAL_CORPUS, 1, "external_real"))
    return blueprint

# ============================================================
# BUILD THE FULL CORPUS
# ============================================================

def get_training_corpus() -> list:
    """
    Returns the complete training corpus with weighted repetition.
    Higher weight categories are repeated more times to increase
    their representation in the training data.
    """
    corpus = []

    for sentences, weight, _name in get_corpus_blueprint():
        for _ in range(weight):
            corpus.extend(sentences)

    return corpus


def get_corpus_stats() -> dict:
    """Get statistics about the training corpus."""
    corpus = get_training_corpus()
    unique_words = set()
    for sentence in corpus:
        words = sentence.lower().split()
        unique_words.update(words)
    blueprint = get_corpus_blueprint()

    return {
        "total_sentences": len(corpus),
        "unique_sentences": len(set(corpus)),
        "unique_words": len(unique_words),
        "categories": len(blueprint),
    }


if __name__ == "__main__":
    stats = get_corpus_stats()
    print(f"Training Corpus Statistics:")
    print(f"  Total sentences (with repetition): {stats['total_sentences']}")
    print(f"  Unique sentences: {stats['unique_sentences']}")
    print(f"  Unique words: {stats['unique_words']}")
    print(f"  Categories: {stats['categories']}")

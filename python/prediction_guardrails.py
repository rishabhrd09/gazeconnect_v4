import re
from typing import Iterable, List


WORD_TOKEN_RE = re.compile(r"[a-zA-Z\u0900-\u097F]+")
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")

# Blocked prediction words: never surface these as word suggestions.
# These are inappropriate for an ALS/AAC patient communication context.
# NOTE: Words like war, fight, guilty, horrible, hate, stressed, suspicious,
# upset, troubled, nervous are intentionally NOT blocked — patients may need
# them to express feelings or describe situations.
BLOCKED_PREDICTION_WORDS = {
    "supplies",

    # --- Violent / harmful ---
    "dead", "death", "die", "dying", "kill", "killed", "killing",
    "murder", "suicide", "shoot", "shooting", "shot",
    "stab", "stabbing", "violence", "violent",
    "weapon", "weapons", "bomb", "attack",
    "kick", "kicked", "kicking",
    "hit",  # too ambiguous/violent as a suggestion
    "punch", "punched", "slap", "slapped",
    "destroy", "destroyed",

    # --- Profanity / vulgar ---
    "damn", "hell", "crap", "suck", "sucks",
    "idiot", "stupid", "dumb", "moron", "fool",
    "jerk", "loser", "freak", "creep",
    "bastard", "scum", "trash",
    "slutty", "perverted", "obscene",

    # --- Harmful to ALS patient mental health ---
    "helpless", "hopeless", "worthless", "useless",
    "pathetic", "pitiful", "miserable",
    "depressed", "suicidal",
    "desperate", "despair",
    "terrified", "horrified",
    "disgusted", "disgusting", "repulsive",
    "lazy",         # offensive for someone who physically cannot move
    "ugly",         # inappropriate for patient dignity
    "fat", "skinny", # body-shaming
    "disfigured", "deformed",
    "burden",       # ALS patients often feel like a burden — don't reinforce
    "empty",        # existential/depressing
    "insecure",     # undermines patient confidence
    "vulnerable",   # erodes patient sense of safety

    # --- Inappropriate / cringy ---
    "sexy", "seductive", "flirty",
    "drunk", "wasted", "stoned", "intoxicated",
    "gambling", "betting",
    "revenge", "betray", "betrayal",
    "liar", "cheat", "cheater", "fraud",
    "slave", "slavery",
    "racist", "racism",
    "torture", "torment",

    # --- Too negative as proactive suggestion ---
    "awful", "terrible", "dreadful", "atrocious",
    "tense",
    "jealous",
    "embarrassed", "embarrassing", "humiliated", "humiliating",
    "overwhelmed",
}

BLOCKED_PREDICTION_PHRASES = {
    "rishabh more",
    "rishabh more supplies",
}


def normalize_prediction_word(word: str) -> str:
    return word.strip().lower()


def tokenize_prediction_text(text: str) -> List[str]:
    return WORD_TOKEN_RE.findall(text.lower())


def is_blocked_prediction_word(word: str) -> bool:
    return normalize_prediction_word(word) in BLOCKED_PREDICTION_WORDS


def contains_blocked_prediction_word(text: str) -> bool:
    normalized = text.strip().lower()
    if normalized in BLOCKED_PREDICTION_PHRASES:
        return True
    return any(token in BLOCKED_PREDICTION_WORDS for token in tokenize_prediction_text(text))


def is_valid_prediction_token(word: str, min_length: int = 3) -> bool:
    normalized = normalize_prediction_word(word)
    if not normalized or is_blocked_prediction_word(normalized):
        return False
    if any(ch.isspace() for ch in normalized):
        return False
    if not WORD_TOKEN_RE.fullmatch(normalized):
        return False
    return len(normalized) >= min_length or bool(DEVANAGARI_RE.search(normalized))


def filter_prediction_words(words: Iterable[str], min_length: int = 3) -> List[str]:
    return [
        normalize_prediction_word(word)
        for word in words
        if is_valid_prediction_token(word, min_length=min_length)
    ]

"""
GazeConnect Vocabulary Builder
Builds and manages the word-to-index mapping for the neural language model.
Optimized for AAC communication patterns with medical + caregiving focus.
"""

import json
import os
import re
from collections import Counter
from typing import Dict, List, Optional, Tuple


# Special tokens
PAD_TOKEN = "<PAD>"
UNK_TOKEN = "<UNK>"
BOS_TOKEN = "<BOS>"
EOS_TOKEN = "<EOS>"

SPECIAL_TOKENS = [PAD_TOKEN, UNK_TOKEN, BOS_TOKEN, EOS_TOKEN]


class Vocabulary:
    """Word-level vocabulary with frequency-based pruning."""

    def __init__(self, max_size: int = 12000):
        self.max_size = max_size
        self.word2idx: Dict[str, int] = {}
        self.idx2word: Dict[int, str] = {}
        self.word_freq: Counter = Counter()
        self._built = False

        # Initialize special tokens
        for i, token in enumerate(SPECIAL_TOKENS):
            self.word2idx[token] = i
            self.idx2word[i] = token

    @property
    def size(self) -> int:
        return len(self.word2idx)

    @property
    def pad_idx(self) -> int:
        return self.word2idx[PAD_TOKEN]

    @property
    def unk_idx(self) -> int:
        return self.word2idx[UNK_TOKEN]

    @property
    def bos_idx(self) -> int:
        return self.word2idx[BOS_TOKEN]

    @property
    def eos_idx(self) -> int:
        return self.word2idx[EOS_TOKEN]

    def tokenize(self, text: str) -> List[str]:
        """Simple whitespace + punctuation tokenizer for AAC text."""
        text = text.lower().strip()
        # Split on whitespace, keep common punctuation as separate tokens
        tokens = re.findall(r"[a-zA-Z\u0900-\u097F]+|[.,!?;:]", text)
        return tokens

    def add_corpus(self, sentences: List[str], weight: int = 1):
        """Count word frequencies from a list of sentences."""
        for sentence in sentences:
            tokens = self.tokenize(sentence)
            for token in tokens:
                self.word_freq[token] += weight

    def build(self, min_freq: int = 2):
        """Build vocabulary from collected frequencies."""
        # Start after special tokens
        idx = len(SPECIAL_TOKENS)

        # Sort by frequency (descending), take top max_size - special_tokens
        available_slots = self.max_size - len(SPECIAL_TOKENS)
        most_common = self.word_freq.most_common(available_slots)

        for word, freq in most_common:
            if freq >= min_freq and word not in self.word2idx:
                self.word2idx[word] = idx
                self.idx2word[idx] = word
                idx += 1

        self._built = True

    def encode(self, text: str, add_bos: bool = True, add_eos: bool = True) -> List[int]:
        """Convert text to list of token indices."""
        tokens = self.tokenize(text)
        indices = []
        if add_bos:
            indices.append(self.bos_idx)
        for token in tokens:
            indices.append(self.word2idx.get(token, self.unk_idx))
        if add_eos:
            indices.append(self.eos_idx)
        return indices

    def decode(self, indices: List[int], skip_special: bool = True) -> str:
        """Convert list of token indices back to text."""
        words = []
        for idx in indices:
            word = self.idx2word.get(idx, UNK_TOKEN)
            if skip_special and word in SPECIAL_TOKENS:
                continue
            words.append(word)
        return " ".join(words)

    def encode_word(self, word: str) -> int:
        """Encode a single word."""
        return self.word2idx.get(word.lower().strip(), self.unk_idx)

    def decode_idx(self, idx: int) -> str:
        """Decode a single index."""
        return self.idx2word.get(idx, UNK_TOKEN)

    def save(self, path: str):
        """Save vocabulary to JSON file."""
        data = {
            "max_size": self.max_size,
            "word2idx": self.word2idx,
            "word_freq": dict(self.word_freq.most_common(self.max_size)),
            "version": "1.0",
        }
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @classmethod
    def load(cls, path: str) -> "Vocabulary":
        """Load vocabulary from JSON file."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        vocab = cls(max_size=data.get("max_size", 12000))
        vocab.word2idx = data["word2idx"]
        # Convert string keys back to int for idx2word
        vocab.idx2word = {int(v): k for k, v in vocab.word2idx.items()}
        vocab.word_freq = Counter(data.get("word_freq", {}))
        vocab._built = True
        return vocab

    def get_top_words(self, n: int = 100) -> List[Tuple[str, int]]:
        """Get the n most frequent words."""
        return self.word_freq.most_common(n)

"""
GazeConnect Training Dataset
Prepares tokenized sequences for CIFG-LSTM training.
"""

import random
from typing import List, Optional, Tuple

import torch
from torch.utils.data import Dataset

from .vocabulary import Vocabulary


class AACTextDataset(Dataset):
    """
    Dataset for next-word prediction training.

    Each sample is a (input_seq, target_seq) pair where:
      input  = [BOS, w1, w2, ..., w_{n-1}]
      target = [w1,  w2, w3, ..., w_n]

    The model learns to predict each next word given the preceding context.
    """

    def __init__(
        self,
        sentences: List[str],
        vocab: Vocabulary,
        seq_length: int = 32,
        augment: bool = True,
    ):
        self.vocab = vocab
        self.seq_length = seq_length
        self.augment = augment

        # Encode all sentences
        self.encoded_sentences = []
        for sentence in sentences:
            encoded = vocab.encode(sentence, add_bos=True, add_eos=True)
            if len(encoded) >= 3:  # At least BOS + one word + EOS
                self.encoded_sentences.append(encoded)

        # Create training sequences
        self.sequences = self._create_sequences()

    def _create_sequences(self) -> List[Tuple[List[int], List[int]]]:
        """Create input-target pairs from encoded sentences."""
        sequences = []

        for encoded in self.encoded_sentences:
            # For short sentences (most AAC), use the whole sentence
            if len(encoded) <= self.seq_length + 1:
                input_seq = encoded[:-1]
                target_seq = encoded[1:]
                sequences.append((input_seq, target_seq))
            else:
                # For longer sequences, create sliding windows
                for i in range(0, len(encoded) - self.seq_length, self.seq_length // 2):
                    chunk = encoded[i : i + self.seq_length + 1]
                    input_seq = chunk[:-1]
                    target_seq = chunk[1:]
                    sequences.append((input_seq, target_seq))

        return sequences

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        input_seq, target_seq = self.sequences[idx]
        return torch.tensor(input_seq, dtype=torch.long), torch.tensor(
            target_seq, dtype=torch.long
        )


def collate_fn(batch: List[Tuple[torch.Tensor, torch.Tensor]]) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Pad sequences in batch to same length.
    PAD_TOKEN index = 0.
    """
    inputs, targets = zip(*batch)

    # Find max length in batch
    max_len = max(x.size(0) for x in inputs)

    # Pad sequences
    padded_inputs = torch.zeros(len(inputs), max_len, dtype=torch.long)
    padded_targets = torch.zeros(len(targets), max_len, dtype=torch.long)

    for i, (inp, tgt) in enumerate(zip(inputs, targets)):
        padded_inputs[i, : inp.size(0)] = inp
        padded_targets[i, : tgt.size(0)] = tgt

    return padded_inputs, padded_targets

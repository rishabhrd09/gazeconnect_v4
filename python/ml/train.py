"""
GazeConnect CIFG-LSTM Training Script
=======================================
Trains the custom neural language model and exports to ONNX for inference.

Usage:
  python -m ml.train                    # Train with defaults
  python -m ml.train --epochs 30        # Custom epochs
  python -m ml.train --resume           # Resume from checkpoint

Output:
  python/ml/trained_models/
    ├── gazeconnect_lm.onnx            # ONNX model for inference
    ├── gazeconnect_lm.pt              # PyTorch checkpoint
    ├── vocabulary.json                 # Word-to-index mapping
    └── training_log.json              # Training metrics

Credits:
  - PyTorch by Meta AI (https://pytorch.org/)
  - ONNX by Linux Foundation (https://onnx.ai/)
"""

import argparse
import json
import math
import os
import random
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader

from .model import GazeConnectLM
from .vocabulary import Vocabulary
from .dataset import AACTextDataset, collate_fn
from .training_data.aac_corpus import get_training_corpus, get_corpus_stats


# Paths
SCRIPT_DIR = Path(__file__).parent
MODEL_DIR = SCRIPT_DIR / "trained_models"
CHECKPOINT_PATH = MODEL_DIR / "gazeconnect_lm.pt"
ONNX_PATH = MODEL_DIR / "gazeconnect_lm.onnx"
VOCAB_PATH = MODEL_DIR / "vocabulary.json"
LOG_PATH = MODEL_DIR / "training_log.json"


# Hyperparameters
class Config:
    vocab_size = 12000       # Max vocabulary size
    embed_dim = 128          # Embedding dimension
    hidden_size = 512        # CIFG-LSTM hidden units
    dropout = 0.2            # Dropout rate
    seq_length = 32          # Max sequence length
    batch_size = 64          # Training batch size
    learning_rate = 0.002    # Initial learning rate
    epochs = 25              # Training epochs
    min_word_freq = 1        # Minimum word frequency for vocabulary
    val_split = 0.1          # Validation set ratio
    clip_grad = 5.0          # Gradient clipping norm
    lr_decay = 0.95          # Learning rate decay per epoch
    tie_weights = True       # Share embedding and output weights
    temperature = 0.8        # Inference temperature


def build_vocabulary(corpus: list, config: Config) -> Vocabulary:
    """Build vocabulary from training corpus."""
    print("Building vocabulary...")
    vocab = Vocabulary(max_size=config.vocab_size)
    vocab.add_corpus(corpus)
    vocab.build(min_freq=config.min_word_freq)
    print(f"  Vocabulary size: {vocab.size}")
    print(f"  Top 20 words: {[w for w, _ in vocab.get_top_words(20)]}")
    return vocab


def _normalize_sentence(sentence: str) -> str:
    return " ".join(sentence.lower().split())


def split_corpus_sentences(
    corpus: List[str],
    val_split: float = 0.1,
    seed: int = 42,
) -> Tuple[List[str], List[str], Dict[str, int]]:
    """
    Split at the sentence level so repeated weighted sentences never leak
    across train/validation.
    """
    buckets: Dict[str, List[str]] = {}
    for sentence in corpus:
        buckets.setdefault(_normalize_sentence(sentence), []).append(sentence)

    keys = list(buckets.keys())
    rng = random.Random(seed)
    rng.shuffle(keys)

    val_size = max(1, int(len(keys) * val_split))
    if val_size >= len(keys):
        val_size = max(1, len(keys) - 1)

    val_keys = set(keys[:val_size])
    train_corpus: List[str] = []
    val_corpus: List[str] = []

    for key, weighted_sentences in buckets.items():
        if key in val_keys:
            val_corpus.extend(weighted_sentences)
        else:
            train_corpus.extend(weighted_sentences)

    split_stats = {
        "train_unique_sentences": len(keys) - len(val_keys),
        "val_unique_sentences": len(val_keys),
        "train_weighted_sentences": len(train_corpus),
        "val_weighted_sentences": len(val_corpus),
        "overlap_unique_sentences": 0,
    }
    return train_corpus, val_corpus, split_stats


def create_datasets(
    train_corpus: List[str],
    val_corpus: List[str],
    vocab: Vocabulary,
    config: Config,
):
    """Create training and validation datasets from sentence-level splits."""
    print("Creating datasets...")
    train_dataset = AACTextDataset(train_corpus, vocab, seq_length=config.seq_length)
    val_dataset = AACTextDataset(val_corpus, vocab, seq_length=config.seq_length)
    print(f"  Train sequences: {len(train_dataset)}")
    print(f"  Val sequences: {len(val_dataset)}")

    train_loader = DataLoader(
        train_dataset,
        batch_size=config.batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        num_workers=0,
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=config.batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=0,
    )

    return train_loader, val_loader


def train_epoch(model, train_loader, criterion, optimizer, config, device):
    """Train for one epoch."""
    model.train()
    total_loss = 0
    total_tokens = 0

    for batch_idx, (inputs, targets) in enumerate(train_loader):
        inputs = inputs.to(device)
        targets = targets.to(device)

        optimizer.zero_grad()

        # Forward pass
        logits, _ = model(inputs)

        # Reshape for loss computation
        # logits: [batch, seq_len, vocab_size] → [batch*seq_len, vocab_size]
        # targets: [batch, seq_len] → [batch*seq_len]
        loss = criterion(
            logits.reshape(-1, logits.size(-1)),
            targets.reshape(-1)
        )

        # Backward pass
        loss.backward()

        # Gradient clipping (prevents exploding gradients in LSTM)
        torch.nn.utils.clip_grad_norm_(model.parameters(), config.clip_grad)

        optimizer.step()

        # Count non-padding tokens
        mask = targets != 0
        n_tokens = mask.sum().item()
        total_loss += loss.item() * n_tokens
        total_tokens += n_tokens

    avg_loss = total_loss / max(total_tokens, 1)
    perplexity = math.exp(min(avg_loss, 100))
    return avg_loss, perplexity


def evaluate(model, val_loader, criterion, device):
    """Evaluate on validation set."""
    model.eval()
    total_loss = 0
    total_tokens = 0

    with torch.no_grad():
        for inputs, targets in val_loader:
            inputs = inputs.to(device)
            targets = targets.to(device)

            logits, _ = model(inputs)
            loss = criterion(
                logits.reshape(-1, logits.size(-1)),
                targets.reshape(-1)
            )

            mask = targets != 0
            n_tokens = mask.sum().item()
            total_loss += loss.item() * n_tokens
            total_tokens += n_tokens

    avg_loss = total_loss / max(total_tokens, 1)
    perplexity = math.exp(min(avg_loss, 100))
    return avg_loss, perplexity


def export_to_onnx(model, vocab, config, device):
    """Export trained model to ONNX format for inference."""
    print("\nExporting to ONNX...")
    model.eval()

    # Create dummy inputs
    batch_size = 1
    seq_len = 1  # Single token at a time for inference
    dummy_input = torch.randint(0, vocab.size, (batch_size, seq_len)).to(device)

    # Initial hidden state
    dummy_h = torch.zeros(batch_size, config.hidden_size).to(device)
    dummy_c = torch.zeros(batch_size, config.hidden_size).to(device)

    # Wrap model for ONNX export
    class OnnxWrapper(nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        def forward(self, input_ids, h_in, c_in):
            logits, (h_out, c_out) = self.model(input_ids, state=(h_in, c_in))
            probs = torch.softmax(logits[:, -1, :] / config.temperature, dim=-1)
            return probs, h_out, c_out

    wrapper = OnnxWrapper(model).to(device)

    os.makedirs(MODEL_DIR, exist_ok=True)

    torch.onnx.export(
        wrapper,
        (dummy_input, dummy_h, dummy_c),
        str(ONNX_PATH),
        input_names=["input_ids", "h_in", "c_in"],
        output_names=["probs", "h_out", "c_out"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "seq_len"},
            "h_in": {0: "batch_size"},
            "c_in": {0: "batch_size"},
            "probs": {0: "batch_size"},
            "h_out": {0: "batch_size"},
            "c_out": {0: "batch_size"},
        },
        opset_version=14,
        do_constant_folding=True,
    )

    # Get file size
    onnx_size = os.path.getsize(ONNX_PATH)
    print(f"  ONNX model saved: {ONNX_PATH}")
    print(f"  ONNX model size: {onnx_size / (1024*1024):.2f} MB")

    return onnx_size


def quantize_onnx():
    """Apply INT8 quantization to reduce model size by ~4x."""
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType

        quantized_path = MODEL_DIR / "gazeconnect_lm_quantized.onnx"
        quantize_dynamic(
            str(ONNX_PATH),
            str(quantized_path),
            weight_type=QuantType.QInt8,
        )
        q_size = os.path.getsize(quantized_path)
        print(f"  Quantized model saved: {quantized_path}")
        print(f"  Quantized model size: {q_size / (1024*1024):.2f} MB")
        return q_size
    except ImportError:
        print("  [SKIP] onnxruntime.quantization not available, skipping quantization")
        return None


def test_predictions(model, vocab, device, config):
    """Test the model with sample inputs."""
    print("\n--- Sample Predictions ---")
    model.eval()

    test_prompts = [
        "I need",
        "I want",
        "please help",
        "can you",
        "the pain is",
        "I feel",
        "turn me",
        "call the",
        "I am",
        "good",
    ]

    for prompt in test_prompts:
        tokens = vocab.encode(prompt, add_bos=True, add_eos=False)
        input_tensor = torch.tensor([tokens], dtype=torch.long).to(device)

        state = None
        # Process all context tokens
        logits, state = model(input_tensor, state)

        # Get predictions from last position
        last_logits = logits[0, -1, :] / config.temperature
        probs = torch.softmax(last_logits, dim=-1)
        top_probs, top_indices = torch.topk(probs, 5)

        predictions = []
        for idx, prob in zip(top_indices.tolist(), top_probs.tolist()):
            word = vocab.decode_idx(idx)
            predictions.append(f"{word}({prob:.3f})")

        print(f'  "{prompt}" -> {", ".join(predictions)}')


def main():
    parser = argparse.ArgumentParser(description="Train GazeConnect CIFG-LSTM")
    parser.add_argument("--epochs", type=int, default=25, help="Training epochs")
    parser.add_argument("--lr", type=float, default=0.002, help="Learning rate")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size")
    parser.add_argument("--hidden", type=int, default=512, help="LSTM hidden size")
    parser.add_argument("--embed", type=int, default=128, help="Embedding dimension")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--no-export", action="store_true", help="Skip ONNX export")
    args = parser.parse_args()

    # Apply args to config
    config = Config()
    config.epochs = args.epochs
    config.learning_rate = args.lr
    config.batch_size = args.batch_size
    config.hidden_size = args.hidden
    config.embed_dim = args.embed

    # Device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Get corpus
    print("\n=== GazeConnect CIFG-LSTM Training ===\n")
    corpus = get_training_corpus()
    stats = get_corpus_stats()
    print(f"Corpus: {stats['total_sentences']} sentences, {stats['unique_words']} unique words")

    train_corpus, val_corpus, split_stats = split_corpus_sentences(
        corpus, val_split=config.val_split, seed=42
    )
    print(
        "Split: "
        f"{split_stats['train_unique_sentences']} train unique / "
        f"{split_stats['val_unique_sentences']} val unique sentences"
    )

    # Build vocabulary
    vocab = build_vocabulary(train_corpus, config)

    # Create datasets
    train_loader, val_loader = create_datasets(train_corpus, val_corpus, vocab, config)

    # Create model
    model = GazeConnectLM(
        vocab_size=vocab.size,
        embed_dim=config.embed_dim,
        hidden_size=config.hidden_size,
        dropout=config.dropout,
        tie_weights=config.tie_weights,
    ).to(device)

    param_info = model.get_param_count()
    print(f"\nModel: {param_info['total']:,} parameters")
    print(f"  FP32 size: {param_info['total_mb_fp32']:.2f} MB")
    print(f"  INT8 size: {param_info['total_mb_int8']:.2f} MB")

    # Loss function (ignore padding token)
    criterion = nn.CrossEntropyLoss(ignore_index=0)

    # Optimizer
    optimizer = optim.Adam(model.parameters(), lr=config.learning_rate)
    scheduler = optim.lr_scheduler.ExponentialLR(optimizer, gamma=config.lr_decay)

    # Resume from checkpoint
    start_epoch = 0
    if args.resume and CHECKPOINT_PATH.exists():
        checkpoint = torch.load(CHECKPOINT_PATH, map_location=device)
        model.load_state_dict(checkpoint["model_state_dict"])
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        start_epoch = checkpoint.get("epoch", 0)
        print(f"\nResumed from epoch {start_epoch}")

    # Training loop
    print(f"\nTraining for {config.epochs} epochs...")
    print("-" * 60)

    training_log = []
    best_val_loss = float("inf")

    for epoch in range(start_epoch, config.epochs):
        t0 = time.time()

        # Train
        train_loss, train_ppl = train_epoch(
            model, train_loader, criterion, optimizer, config, device
        )

        # Validate
        val_loss, val_ppl = evaluate(model, val_loader, criterion, device)

        # Learning rate decay
        scheduler.step()
        lr = optimizer.param_groups[0]["lr"]

        elapsed = time.time() - t0

        print(
            f"Epoch {epoch+1:3d}/{config.epochs} | "
            f"Train Loss: {train_loss:.4f} PPL: {train_ppl:.1f} | "
            f"Val Loss: {val_loss:.4f} PPL: {val_ppl:.1f} | "
            f"LR: {lr:.5f} | {elapsed:.1f}s"
        )

        # Log
        training_log.append({
            "epoch": epoch + 1,
            "train_loss": round(train_loss, 4),
            "train_perplexity": round(train_ppl, 2),
            "val_loss": round(val_loss, 4),
            "val_perplexity": round(val_ppl, 2),
            "learning_rate": round(lr, 6),
            "elapsed_seconds": round(elapsed, 1),
        })

        # Save best model
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            os.makedirs(MODEL_DIR, exist_ok=True)
            torch.save({
                "epoch": epoch + 1,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_loss": val_loss,
                "config": {
                    "vocab_size": vocab.size,
                    "embed_dim": config.embed_dim,
                    "hidden_size": config.hidden_size,
                    "dropout": config.dropout,
                    "tie_weights": config.tie_weights,
                },
            }, CHECKPOINT_PATH)

    print("-" * 60)
    print(f"Best validation loss: {best_val_loss:.4f}")

    # Save vocabulary
    vocab.save(str(VOCAB_PATH))
    print(f"Vocabulary saved: {VOCAB_PATH}")

    # Save training log
    with open(LOG_PATH, "w") as f:
        json.dump({
            "config": {
                "vocab_size": vocab.size,
                "embed_dim": config.embed_dim,
                "hidden_size": config.hidden_size,
                "dropout": config.dropout,
                "epochs": config.epochs,
                "learning_rate": config.learning_rate,
                "batch_size": config.batch_size,
            },
            "corpus_stats": stats,
            "split_stats": split_stats,
            "param_count": param_info["total"],
            "best_val_loss": round(best_val_loss, 4),
            "training_log": training_log,
        }, f, indent=2)

    # Test predictions
    test_predictions(model, vocab, device, config)

    # Export to ONNX
    if not args.no_export:
        export_to_onnx(model, vocab, config, device)
        quantize_onnx()

    print("\n=== Training Complete ===")
    print(f"  Model: {CHECKPOINT_PATH}")
    print(f"  ONNX:  {ONNX_PATH}")
    print(f"  Vocab: {VOCAB_PATH}")
    print(f"  Log:   {LOG_PATH}")


if __name__ == "__main__":
    main()

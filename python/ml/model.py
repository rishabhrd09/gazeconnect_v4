"""
GazeConnect CIFG-LSTM Neural Language Model
============================================
Coupled Input-Forget Gate LSTM for lightweight next-word prediction.

Architecture:
  Input → Embedding(128) → CIFG-LSTM(512) → Dropout(0.2) → Linear → Softmax

The CIFG modification couples the input and forget gates:
  input_gate = 1 - forget_gate
This reduces parameters by 25% while maintaining prediction accuracy.

Credits:
  - Greff et al. (2017) "LSTM: A Search Space Odyssey" for CIFG variant
  - PyTorch framework by Meta AI
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


class CIFGLSTMCell(nn.Module):
    """
    Coupled Input-Forget Gate LSTM Cell.

    Standard LSTM has 3 independent gates (input, forget, output).
    CIFG couples input = 1 - forget, reducing parameters by 25%.

    Math:
      f_t = σ(W_f · [h_{t-1}, x_t] + b_f)     # forget gate
      i_t = 1 - f_t                              # input gate (coupled)
      g_t = tanh(W_g · [h_{t-1}, x_t] + b_g)    # candidate cell
      o_t = σ(W_o · [h_{t-1}, x_t] + b_o)       # output gate
      c_t = f_t * c_{t-1} + i_t * g_t            # cell state
      h_t = o_t * tanh(c_t)                      # hidden state
    """

    def __init__(self, input_size: int, hidden_size: int):
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size

        # Combined weight matrix for forget, candidate, output gates (3 instead of 4)
        # This is the key CIFG optimization: no separate input gate weights
        self.weight_ih = nn.Linear(input_size, 3 * hidden_size)
        self.weight_hh = nn.Linear(hidden_size, 3 * hidden_size)

        self._init_weights()

    def _init_weights(self):
        """Xavier uniform initialization + forget gate bias = 1.0 for stable training."""
        for name, param in self.named_parameters():
            if "weight" in name and param.dim() >= 2:
                nn.init.xavier_uniform_(param.data)
            elif "bias" in name:
                nn.init.zeros_(param.data)
                # Set forget gate bias to 1.0 (first hidden_size elements)
                if param.size(0) >= self.hidden_size:
                    param.data[:self.hidden_size].fill_(1.0)

    def forward(
        self, x: torch.Tensor, state: Optional[Tuple[torch.Tensor, torch.Tensor]] = None
    ) -> Tuple[torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        """
        Forward pass for single timestep.

        Args:
            x: Input tensor [batch_size, input_size]
            state: Tuple of (h, c) each [batch_size, hidden_size]

        Returns:
            h_new: New hidden state [batch_size, hidden_size]
            (h_new, c_new): New state tuple
        """
        batch_size = x.size(0)

        if state is None:
            h = torch.zeros(batch_size, self.hidden_size, device=x.device, dtype=x.dtype)
            c = torch.zeros(batch_size, self.hidden_size, device=x.device, dtype=x.dtype)
        else:
            h, c = state

        # Compute all gates in one matrix multiply (efficient)
        gates_i = self.weight_ih(x)
        gates_h = self.weight_hh(h)
        gates = gates_i + gates_h

        # Split into 3 gates: forget, candidate, output
        f_gate, g_gate, o_gate = gates.chunk(3, dim=1)

        f_t = torch.sigmoid(f_gate)      # forget gate
        i_t = 1.0 - f_t                   # input gate (CIFG coupling)
        g_t = torch.tanh(g_gate)          # candidate cell state
        o_t = torch.sigmoid(o_gate)       # output gate

        # Update cell state and hidden state
        c_new = f_t * c + i_t * g_t
        h_new = o_t * torch.tanh(c_new)

        return h_new, (h_new, c_new)


class GazeConnectLM(nn.Module):
    """
    GazeConnect Language Model — Custom CIFG-LSTM for AAC prediction.

    Architecture:
      Embedding(vocab_size, 128) → CIFG-LSTM(128, 512) → Dropout(0.2) → Linear(512, vocab_size)

    Designed for:
      - Vocabulary: 10,000-12,000 words (AAC + medical + Hindi)
      - Model size: ~5MB FP32, ~1.5MB INT8 quantized
      - Inference: <20ms per token on CPU
      - Context: processes word-by-word, maintains hidden state across sentence
    """

    def __init__(
        self,
        vocab_size: int,
        embed_dim: int = 128,
        hidden_size: int = 512,
        dropout: float = 0.2,
        tie_weights: bool = True,
    ):
        super().__init__()
        self.vocab_size = vocab_size
        self.embed_dim = embed_dim
        self.hidden_size = hidden_size

        # Embedding layer
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)

        # Optional projection if embed_dim != hidden_size
        self.needs_projection = embed_dim != hidden_size
        if self.needs_projection:
            self.input_proj = nn.Linear(embed_dim, hidden_size)

        # CIFG-LSTM cell
        lstm_input_size = hidden_size if self.needs_projection else embed_dim
        self.lstm = CIFGLSTMCell(lstm_input_size, hidden_size)

        # Dropout for regularization
        self.dropout = nn.Dropout(dropout)

        # Output projection
        if tie_weights and embed_dim == hidden_size:
            # Weight tying: share embedding and output weights (saves memory)
            self.output_proj = nn.Linear(hidden_size, vocab_size)
            self.output_proj.weight = self.embedding.weight
        elif tie_weights and self.needs_projection:
            # With projection: output → project down → tie with embedding
            self.output_down_proj = nn.Linear(hidden_size, embed_dim)
            self.output_proj = nn.Linear(embed_dim, vocab_size)
            self.output_proj.weight = self.embedding.weight
        else:
            self.output_proj = nn.Linear(hidden_size, vocab_size)

        self._init_embeddings()

    def _init_embeddings(self):
        """Initialize embedding weights with scaled uniform distribution."""
        nn.init.uniform_(self.embedding.weight, -0.1, 0.1)
        # Keep padding embedding as zeros
        self.embedding.weight.data[0].zero_()

    def forward(
        self,
        input_ids: torch.Tensor,
        state: Optional[Tuple[torch.Tensor, torch.Tensor]] = None,
    ) -> Tuple[torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        """
        Forward pass for sequence prediction.

        Args:
            input_ids: Token indices [batch_size, seq_len]
            state: Optional LSTM state tuple

        Returns:
            logits: Prediction scores [batch_size, seq_len, vocab_size]
            state: Final LSTM state tuple
        """
        batch_size, seq_len = input_ids.shape

        # Embed input tokens
        embeds = self.embedding(input_ids)  # [batch, seq_len, embed_dim]
        embeds = self.dropout(embeds)

        # Project if needed
        if self.needs_projection:
            embeds = self.input_proj(embeds)  # [batch, seq_len, hidden_size]

        # Process sequence through CIFG-LSTM
        outputs = []
        for t in range(seq_len):
            x_t = embeds[:, t, :]  # [batch, hidden_size]
            h_t, state = self.lstm(x_t, state)
            outputs.append(h_t)

        # Stack outputs
        output = torch.stack(outputs, dim=1)  # [batch, seq_len, hidden_size]
        output = self.dropout(output)

        # Project to vocabulary
        if hasattr(self, "output_down_proj"):
            output = self.output_down_proj(output)

        logits = self.output_proj(output)  # [batch, seq_len, vocab_size]

        return logits, state

    def predict_next(
        self,
        input_ids: torch.Tensor,
        state: Optional[Tuple[torch.Tensor, torch.Tensor]] = None,
        temperature: float = 0.8,
        top_k: int = 10,
    ) -> Tuple[torch.Tensor, torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        """
        Predict next word probabilities (inference mode).

        Args:
            input_ids: Token indices [batch_size, 1] (single token)
            state: LSTM state from previous prediction
            temperature: Softmax temperature (lower = more confident)
            top_k: Number of top predictions to return

        Returns:
            top_indices: Top-k word indices [batch_size, top_k]
            top_probs: Top-k probabilities [batch_size, top_k]
            state: Updated LSTM state
        """
        with torch.no_grad():
            logits, state = self.forward(input_ids, state)

            # Get last timestep logits
            logits = logits[:, -1, :] / temperature  # [batch, vocab_size]

            # Apply softmax to get probabilities
            probs = F.softmax(logits, dim=-1)

            # Get top-k predictions
            top_probs, top_indices = torch.topk(probs, top_k, dim=-1)

        return top_indices, top_probs, state

    def get_param_count(self) -> dict:
        """Get parameter count breakdown."""
        counts = {}
        total = 0
        for name, param in self.named_parameters():
            counts[name] = param.numel()
            total += param.numel()
        counts["total"] = total
        counts["total_mb_fp32"] = total * 4 / (1024 * 1024)
        counts["total_mb_int8"] = total * 1 / (1024 * 1024)
        return counts

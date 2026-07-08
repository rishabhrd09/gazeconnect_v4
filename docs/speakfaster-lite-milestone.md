# SpeakFaster-lite — Next Milestone Spec (offline, lean)

**Status:** proposed / not started · **Date:** 2026-07-08

Goal: capture most of Google *SpeakFaster*'s ergonomic win for eye-gaze ALS users **without** shipping a heavy model — building on the existing offline stack (n-gram + smart bigrams + 1.8 MB CIFG-LSTM + patient personalization). This is the lean, on-device answer to "can we adopt SpeakFaster?". Footprint constraints and the "no heavy LLM" decision live in [`footprint-and-llm-decision.md`](footprint-and-llm-decision.md).

---

## Why we can't just ship "the SpeakFaster model"
- SpeakFaster's quality comes from two fine-tuned models (**KeywordAE**, **FillMask**) on a **64-billion-parameter cloud LaMDA**, served on ~16 TPU chips. It is **cloud-hosted and requires internet**; the fine-tuned weights are **proprietary and unreleased**.
- Only the **front-end app + analysis scripts** are open-source (MIT, `github.com/TeamGleason/SpeakFaster`). There is nothing to drop on-device.
- A context-aware expander that preserves its disambiguation quality realistically needs a **~1–3B** model → hundreds of MB–GB disk and **1–2 GB+ RAM even quantized** — exactly the footprint we're avoiding.
- **Reported benefit (Nature Communications 2024, `s41467-024-53873-3`):** ~**57% more motor actions saved** vs. Gboard baseline (offline sim KSR 0.657 vs 0.482); eye-gaze ALS users **+28–61% WPM**. The win concentrates precisely where each keystroke is expensive — **eye-gaze AAC, our exact use case.**

**Verdict:** adopt the *paradigm*, not the model. **PARTIAL** adoption offline + optional online for hard cases.

---

## The paradigm to adopt
User types the **initials** of intended words (optionally a partial/full keyword to disambiguate) → app proposes **full-phrase** candidates, using recent conversation as context. Example: `ishpit bedr` → *"I saw him playing in the bedroom."*

---

## Offline build path (default, no new heavy deps)

1. **Initials → phrase candidate UI.** The biggest ergonomic win is the *interaction*, and it's model-agnostic. Add a mode where a short initials string yields full-phrase suggestions in the existing prediction strip.
2. **Personalized phrase cache (highest ROI).** AAC users repeat phrases heavily. Store the user's own *sent* phrases keyed by their initials (e.g. `"iwtgh" → "I want to go home"`), recalled instantly. Near-zero footprint; reuse the existing personalization storage under `python/services/word_prediction.py` (`custom_dictionary` / `patient_data`), and respect the existing prune/caps.
3. **Offline candidate generation from existing components.** Expand initials against the n-gram/phrase lexicon and `AAC_PHRASES`; use the CIFG-LSTM for next-word and smart bigrams to re-rank word pairs; constrain candidates to match the typed initial pattern.
4. **Cheap "conversational context" proxy.** Keep the last N turns; bias ranking toward context words via lexical overlap (no embeddings needed). Captures a slice of the paper's context benefit at ~zero cost.
5. **FillMask-lite.** For a near-miss phrase, offer same-initial alternates for the wrong word straight from the lexicon/LSTM — no LLM.
6. **Safety:** route every candidate through the existing guardrails in `python/prediction_guardrails.py` (English + Hindi/Hinglish), same as all other prediction paths.

## Optional online enrichment (opt-in, default OFF)
For hard/novel expansions only, allow an **online-only** call to a hosted LLM (your Claude/Gemini/GPT), gated behind **connectivity + explicit consent**, with graceful fallback to the offline path when offline. This honestly mirrors SpeakFaster's real cloud architecture while the **default stays lean and fully offline**. Model it on the existing `enable_datamuse=False` opt-in online pattern (default off, background timeout, never blocks the gaze pipeline).

---

## Footprint expectation
Offline pieces (1–6) add only code + small per-user data → negligible RAM/disk; keeps the app inside the ~700 MB peak-RAM ceiling. The optional online path adds **zero** local footprint (network only, opt-in).

## Non-goals
- No bundled multi-hundred-MB / multi-GB local LLM.
- No dependency on SpeakFaster's unreleased models or restricted datasets.
- No change to the shipped default behavior until this is built and verified behind a default-safe flag.

## Sources
- Nature Communications 2024: https://www.nature.com/articles/s41467-024-53873-3 (full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC11530652/)
- arXiv 2312.01532 · Google Research blog: https://research.google/blog/speakfaster-revolutionizing-communication-for-people-with-severe-motor-impairments/
- Code (front-end only, MIT): https://github.com/TeamGleason/SpeakFaster

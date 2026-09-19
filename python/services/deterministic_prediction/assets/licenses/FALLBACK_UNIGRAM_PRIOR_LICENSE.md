# Fallback unigram prior — provenance and licence

`fallbackUnigramPrior.v1.ts` is derived from the **ImagineVille December 2019
AAC word language models** (Medium, KenLM binary), by Keith Vertanen, Haythem
A. Memmi, Justin Emge, Shyam Reyal and Per Ola Kristensson — the same model
and the same attribution as `DISTILLED_CONTINUATIONS_LICENSE.md`
(source page, scheme omitted deliberately: `imagineville.org/software/lm/dec19/`).

**Licence of the model:** Creative Commons Attribution 4.0 International (CC BY 4.0).

**What was done (the "changes made" CC BY asks us to state):** the model was
not shipped. Every word of the shipped lexicon was scored once against the
model's 1-gram table offline (`kenlm.Model.score(word, bos=False, eos=False)`,
no context, no sentence marker), and the log10 probability of each word that
the shipped unigram table does NOT know was mapped onto the shipped unigram
feature scale by a monotone quantile map fitted on the words both tables
contain. Words the shipped table knows, words outside the lexicon, words the
model does not know and words on the never-suggested list were dropped. The
result is a frozen table of a few hundred values; no language model runs on
the device. It is not an unconditional frequency of English; it is the model's
1-gram estimate placed on this app's own scale.

**Attribution obligation:** covered by the ImagineVille entry already present
in `src/thirdPartyNotices.ts` (added for the distilled continuations).

Model file: medium.kenlm, sha256 `860b3bcf8cb9fd75377cf4cb5a304047372493f1e1c68cba054ecf874fba806a`,
163,086,699 bytes (recorded in docs/evaluation/imagineville-2026-09-14/models.json).
Scoring script: docs/evaluation/prediction-tracks-ab-2026-09-14/scripts/kenlm-unigram-prior.py;
scored JSON and its metrics: docs/evaluation/prediction-tracks-ab-2026-09-14/track-a/.

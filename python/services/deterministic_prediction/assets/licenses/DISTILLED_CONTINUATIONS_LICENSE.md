# Distilled continuations — provenance and licence

`distilledContinuations.v1.ts` is a table derived from the **ImagineVille
December 2019 AAC word language models** (Medium, KenLM binary), by Keith
Vertanen, Haythem A. Memmi, Justin Emge, Shyam Reyal and Per Ola Kristensson.
Source page (scheme omitted deliberately; shipped source may not carry URLs):
`imagineville.org/software/lm/dec19/`.

**Licence of the model:** Creative Commons Attribution 4.0 International (CC BY 4.0).

**What was done (the "changes made" CC BY asks us to state):** the model was
not shipped. For each two-word context the engine already knows, every word of
the shipped lexicon was scored against the model offline with KenLM (beginning
of sentence, the two context words, no end of sentence), and the eight most
probable lexicon words were kept with their log10 conditional probability
rounded to one decimal. Words outside the lexicon or on the never-suggested
list were dropped. The result is a frozen table; no language model runs on the
device.

**Extended 2026-09-14** (docs/evaluation/prediction-tracks-ab-2026-09-14): the
context list grew from 47,787 to 52,111 keys — two-word contexts observed in
the licence-clear training collection of that folder (Tatoeba CC BY 2.0 FR /
CC0 and Intel ACAT Apache-2.0 sentences; the collection's own provenance is in
its manifest) and 2,934 three-word question frames (a wh-word, an auxiliary and
a subject, e.g. "where are you"), scored the same way with three context
words. The three-word rows let a question head override an auxiliary+subject
pair; nothing else about the derivation changed.

**Attribution obligation:** the notices screen must credit the ImagineVille AAC
language models (CC BY 4.0) alongside the existing AAC corpus credit before any
build that includes this table ships.

Model file: medium.kenlm, sha256 `860b3bcf8cb9fd75377cf4cb5a304047372493f1e1c68cba054ecf874fba806a`,
163,086,699 bytes (recorded in docs/evaluation/imagineville-2026-09-14/models.json).

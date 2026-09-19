# Context priors — sources, licences and obligations

`contextPriors.v1.ts` is generated from six third-party dialogue corpora by
`scripts/vocabulary/build-context-priors.mjs`. URLs live here rather than in the
generated TypeScript because `privacyOffline.test.ts` scans shipped source for
`http(s)://` while proving the app makes no network calls — the same arrangement as
`AAC_CORPUS_LICENSE.md` and `SYMSPELL_DATA_LICENSE.md`.

What ships is a derived aggregate: word-pair and word-triple successor lists filtered
to this app's own lexicon, capped at 8 successors per context, minimum count 2. **No
corpus utterance is shipped in the application.**

## The excluded seventh source

**Schema-Guided Dialogue (SGD) is CC BY-SA 4.0 and is deliberately not used.**

The source package's own rights record states:

> Special gate: do not promote or distribute an SGD-trained model until legal review
> determines how ShareAlike applies to the filtered corpus, embedded n-grams, and
> model weights. Always benchmark and retain a no-SGD rebuild path.

GazeCompass is closed-source. ShareAlike on embedded n-grams would require releasing
the adaptation under CC BY-SA, so SGD is excluded and the build script raises if its
partition is ever read. This file is the no-SGD rebuild path that record requires.

Measured cost of that choice: fusing all seven sources is worth **+8.27 points** of
held-out AAC top-5 at zero typed letters. Six sources are worth **+4.01**. Roughly half
the available gain is given up to stay distributable.

Revisiting requires a written ShareAlike determination, not a code change.

## Included sources

| Source | Licence | Notice |
|---|---|---|
| Taskmaster-1 (2019) | CC BY 4.0 | Byrne, Krishnamoorthi, Sankar, Neelakantan, Dubey, Kim, Cedilnik — Google LLC |
| Taskmaster-2 (2020) | CC BY 4.0 | Byrne, Krishnamoorthi, Ganesh, Dubey, Kim, Cedilnik — Google LLC |
| PRESTO V1 English | CC BY 4.0 | Google Research Datasets |
| MASSIVE 1.1 English | CC BY 4.0 | Amazon.com, Inc. or its affiliates; English seed derived from SLURP |
| CCPE-M | CC BY 4.0 | Radlinski, Balog, Byrne, Krishnamoorthi — Google LLC |
| CLINC150 (in-scope) | CC BY 3.0 | clinc/oos-eval, with the designated paper authors |
| MultiWOZ 2.4 | MIT | Copyright (c) 2022 Fanghua Ye; training set inherited unchanged from MultiWOZ 2.1 |
| **Tatoeba English sentences** | **CC BY 2.0 FR** | The Tatoeba Project contributors |

- Taskmaster: https://github.com/google-research-datasets/Taskmaster
- PRESTO: https://github.com/google-research-datasets/presto
- MASSIVE: https://github.com/alexa/massive
- CCPE-M: https://github.com/google-research-datasets/ccpe
- CLINC150: https://github.com/clinc/oos-eval
- MultiWOZ 2.4: https://github.com/smartyfh/MultiWOZ2.4 — original: https://github.com/budzianowski/multiwoz
- Tatoeba: https://tatoeba.org — export https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2 — licence https://creativecommons.org/licenses/by/2.0/fr/

## Tatoeba, and why it was added

The six dialogue corpora are task-oriented — booking restaurants, setting alarms.
They have nothing to say about the register this app is actually written in: the
contexts `my life`, `life is`, `story of` and `been thinking` were absent from all
six, and the reflective register scored 28 points below everyday because of it.

Tatoeba's English export is two million sentences of ordinary written English,
14.7M tokens against the six partitions' 634k. It is **CC BY 2.0 FR** —
attribution, no share-alike — so it is usable in a closed application. Attribution
is carried here and in the generated table's header.

**250 sentences are excluded by id.** They are the frozen independent evaluation
set, itself drawn from Tatoeba. Training n-grams over the sentences you are
scored on turns the measurement into a memorisation test; the build asserts the
exclusion count rather than assuming it, and fails if it is not exactly 250.

## Obligations carried

Each CC BY licence requires attribution, a link to the licence and source, and a notice
of changes. **Changes made:** utterances were normalized and tokenized upstream; this
build filters both ends of every pair to the app's lexicon, discards pairs seen fewer
than twice, keeps at most 8 successors per context, and emits counts as ordered lists
with the counts discarded. MASSIVE's `NOTICE.md` and the MultiWOZ 2.1/2.4 notice chain
must travel with any redistribution of the corpus itself; they are not reproduced in the
app because no corpus text is shipped.

## What this data is, and is not

Six task-oriented dialogue corpora: booking restaurants, setting alarms, asking about
films. Good evidence about ordinary English sentence flow, and **no evidence about care
communication** — the words `suction`, `breathe`, `oxygen` and `choking` have no
successors anywhere in it.

That is exactly why fusion is gated. A ranked list this corpus cannot inform must never
be allowed to displace one the care vocabulary already answered; see the three gates in
`predictionService.ts` and the floor asserted in `predictionQuality.bench.ts`.

## Rights status inherited from the source package

The package classifies its own governed inventory as `INTERNAL_RIGHTS_UNRESOLVED` and
marks all of it experimental-only. Nothing from that inventory is used here — only the
six public corpora above, each with a published licence.

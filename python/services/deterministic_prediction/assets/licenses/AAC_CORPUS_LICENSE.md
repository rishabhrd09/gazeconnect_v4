# AAC-like communications corpus — source and licence

`aacContextEdges.v1.ts` is generated from this corpus by
`scripts/vocabulary/build-aac-context-edges.mjs`. `scripts/benchmark/aacEvalSentences.ts`
holds its held-out evaluation split.

The URLs live in this file rather than in the generated TypeScript because
`privacyOffline.test.ts` scans shipped source for `http(s)://` as part of proving the
app makes no network calls. That guard is worth more than the convenience of an inline
link, so attribution is carried here — exactly as `SYMSPELL_DATA_LICENSE.md` does.

## Attribution

> Keith Vertanen and Per Ola Kristensson.
> "The Imagination of Crowds: Conversational AAC Language Modeling using Crowdsourcing
> and Large Data Sources." *Proceedings of EMNLP 2011*, pages 700–711.

- Project page: https://aactext.org/imagine/
- Paper: https://www.keithv.com/pub/imagine/imagine_aac_lm.pdf

## Licence

**Creative Commons Attribution 4.0 International (CC BY 4.0)** —
https://creativecommons.org/licenses/by/4.0/

The project page states that the listed resources are licensed CC BY 4.0 **with the
exception of `lm_test_switch.txt` and `lm_test_comm.txt`**. Those two are borrowed from
Switchboard and from H. Venkatagiri's keyboard-layout study respectively, are outside
the corpus licence, and are **not used by this project at all** — not for training, not
for evaluation.

## What is used, and what is held out

| File | Sentences | Use |
|---|---:|---|
| `sent_train_aac.txt` | 5,019 | Context edges in `aacContextEdges.v1.ts` |
| `sent_dev_aac.txt` + `sent_test_aac.txt` | 1,123 | Held out; 838 survive filtering into the evaluation set |
| `lm_test_switch.txt`, `lm_test_comm.txt` | — | **Never read.** Outside the licence |

The corpus splits by worker rather than by sentence, so short common utterances occur
on both sides — `i love you`, `i am hungry`. 110 held-out sentences also appeared in
training and were dropped, because scoring those would measure memorisation. The
evaluation set has zero overlap with the training split.

## What this corpus is, and is not

Crowdworkers on Mechanical Turk were asked to invent communications **as if** they were
using a scanning-style AAC interface. It is fictional text written by people imagining
AAC use, not text produced by people who use AAC.

That makes it good evidence about the *register* — its most frequent trigrams are
`i need to`, `i want to`, `i love you`, `how are you`, `can i have` — and no evidence
at all about any real user, including this project's. Nothing derived from it should be
described as observed AAC use.

## Redistribution

CC BY 4.0 permits redistribution, including inside a commercial application, with
attribution. What ships is a derived aggregate: 1,479 word-pair counts filtered to the
app's own lexicon. No corpus sentence is shipped in the application. The evaluation
sentences in `scripts/benchmark/` are not bundled into the app.

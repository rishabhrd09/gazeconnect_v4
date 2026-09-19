# Third-party vocabulary data notices

The generated practical-vocabulary data files in this directory combine reviewed GazeCompass AAC additions with filtered and reorganized data derived from the sources below. Changes include vocabulary selection, exclusions, AAC and regional additions, lemma-family mapping, frequency filtering, and bounded context edges.

The NGSL-derived vocabulary artifacts in this directory are distributed under the Creative Commons Attribution-ShareAlike 4.0 International licence (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/. This data licence does not relicense the GazeCompass application code.

## New General Service List 1.2

- Authors: Charles Browne, Brent Culligan, and Joseph Phillips
- Official site: https://www.newgeneralservicelist.com/new-general-service-list
- Used for: daily-English lemmas, ranks, teaching surface forms, and supplementary date/number words
- Licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- Licence text: https://creativecommons.org/licenses/by-sa/4.0/

## New General Service List - Spoken 1.2

- Authors: Charles Browne and Brent Culligan
- Official site: https://www.newgeneralservicelist.com/ngsl-spoken
- Used for: spoken-core tags and audit evidence
- Licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- Licence text: https://creativecommons.org/licenses/by-sa/4.0/

## SymSpell frequency dictionaries

- Author: Wolf Garbe
- Project: https://github.com/wolfgarbe/SymSpell
- Used for: local frequency counts, conservative surface-family evidence, and filtered bigram context edges
- Licence: MIT
- Existing full notice: ../SYMSPELL_DATA_LICENSE.md

## GazeCompass reviewed additions

Protected care terms, urgent phrases, regional overrides, exclusions, and family decisions are maintained in scripts/vocabulary. They are product curation, not medical advice or a claim that every regional term is appropriate for every person. Caregiver customization remains essential.

## Sibling-project harvest (v2 layers)

The v2 expansion layers (allowlists/practical-expansion.v2.json, allowlists/protected-care.v2.json, allowlists/urgent-phrases.v2.json, allowlists/everyday-phrases.v1.json) were harvested from two sibling GazeCompass projects. Both derive their licensed vocabulary from the same sources already attributed above, so this harvest adds no new third-party licence surface:

- gaze_spell: src/prediction/data/coreLexicon.ts and importedLexicon.ts, ml/curated_phrase_additions.json, ml/training_data/english_global/{vocabulary.json,corpus.txt}. First-party AAC vocabulary, except for NGSL 1.2 / NGSL-Spoken 1.2 derived entries, which remain under CC BY-SA 4.0 as recorded above.
- GazeCompass_ML_Final_Audited: data/english/vocabulary.json, data/english/*_phrase_pack.json, data/seed_phrases.json. First-party AAC vocabulary plus NGSL (CC BY-SA 4.0) and SymSpell (MIT) lineage, both already attributed above. Its data/english/vocabulary.json is in part a round trip of this repository's own generated artifacts.

Some NGSL 1.2 and NGSL-Spoken 1.2 derived lemmas therefore re-entered this directory by way of those projects, which had adapted this repository's version-locked NGSL snapshot. The attribution, change indication, and share-alike terms above are unchanged and continue to apply.

### Deliberately excluded sources

The following were reviewed and NOT imported. They are recorded here so the exclusion is auditable rather than invisible:

- GazeCompass_ML_Final_Audited/data/ALS_Eye_Tracking_Vocabulary_and_Phrase_Dataset.pdf and every derivative under data/staging (als_aac_pdf_*, pals_aac_real_*). Its source registry records licence_status private_authorization_not_public_licence, with public_dataset_release and redistribution among prohibited_uses.
- gaze_spell/src/prediction/data/alsCorpus{Phrases,Vocabulary,Review}. Same underlying document; the two sibling projects disagree about its status, so it is treated as blocked.
- GazeCompass_ML_Final_Audited/data/english/local_reviewed_additions.json and data/curation/model_lab_change_log.jsonl. First-party, but marked release_allowed=false on every row.
- All Hinglish assets (gaze_spell/ml/training_data/english_hinglish/*, GazeCompass_ML_Final_Audited/data/hinglish/*). Either consent-gated or derived from the blocked PDF, and both sibling projects enforce a hard English/Hinglish separation. Romanized-Hindi vocabulary remains a separate, unaddressed gap.

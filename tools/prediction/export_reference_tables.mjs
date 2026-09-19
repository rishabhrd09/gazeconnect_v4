#!/usr/bin/env node
/**
 * Export the pinned GazeCompass deterministic prediction tables for the Python
 * port in python/services/deterministic_prediction.
 *
 * Development tooling only. The installed application never reads the
 * reference repository, never runs Node and never downloads anything: it loads
 * the JSON files this script writes.
 *
 *   node tools/prediction/export_reference_tables.mjs --reference <gazecompass clone>
 *   node tools/prediction/export_reference_tables.mjs --reference <clone> --check
 *
 * Reproducibility:
 *   - the reference is read with `git archive <pinned commit>`, so uncommitted
 *     or later experimental work in that clone can never leak into the export;
 *   - pinned source hashes (reference_pin.json) are verified before anything runs;
 *   - output contains no timestamps, so an unchanged input gives byte-identical
 *     files and `--check` can prove the committed assets are current.
 *
 * Why the reference code computes the lexicon index: the index (frequency order,
 * capped prefix buckets, lemma families, successor rows, POS rows, reviewed-phrase
 * transitions) is data preparation. Dumping what getPredictionIndex() built
 * guarantees the Python engine ranks over exactly the same candidate supply.
 * Scoring, selection, fusion and slot logic are ported in Python and verified
 * against the same pinned build (tools/prediction/oracle).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PIN, PROJECT_ROOT, bundleAndLoad, extractSpellTree, sha256, verifyPinnedSources,
} from './lib/reference.mjs';

const DEFAULT_OUT = path.join(PROJECT_ROOT, 'python', 'services', 'deterministic_prediction', 'assets');
const ASSET_VERSION = 'v1';

/** Internal (non-exported) names the Python port needs, appended to scratch copies only. */
const PREDICTION_SERVICE_EXPORTS = `
// ---- appended by export_reference_tables.mjs to a temporary copy; not part of the reference ----
export {
  AAC_DOMAIN_WORDS, AAC_CONTEXT, AAC_TWO_WORD_CONTEXT, AAC_TWO_WORD_CONTEXT_V2, AAC_CONTEXT_V2,
  CONTRACTION_EXPANSIONS, APOSTROPHE_WORDS, GRAMMAR_EXPECTATION, SENTENCE_OPENERS, SESSION_OPENERS,
  FALLBACK, JUNK_RESIDUE_TOKENS, FINITE_VERBS, MODAL_AUXILIARIES, COPULAS, DEGREE_ADVERBS, WH_WORDS,
  SUBJECT_PRONOUNS, OBJECT_PRONOUNS, PREPOSITION_OBJECT_CONTEXTS, COPULA_LIKE,
  SENSITIVE_COMMUNICATION_CONTEXT, CARE_CONTEXT_WORDS, CLINICAL_SOFT_BOOST_WORDS,
  UNINFORMATIVE_CONTEXT_WORDS, WH_OVERRIDABLE_PAIRS, CURATED_TIERS, WORD_BOUNDARY_RANKER_WEIGHTS,
  GRAMMATICAL_ROLE_FORMS, CAPPED_FUNCTION_CLASSES, EVIDENCE_TIER_SCORES, getPredictionIndex,
};
export const EXPORTED_NUMERIC_CONSTANTS = {
  MAX_WORD_CANDIDATES, MAX_WORD_SLOTS, MAX_GENERIC_PREFIX_BUCKET, MAX_CONTEXT_SUCCESSORS,
  MAX_NGRAM_SUPPLY, MAX_GRAMMAR_SUPPLY, GRAMMAR_SWAP_SCAN_LIMIT, GRAMMAR_SWAP_MAX_SCORE_GAP,
  FAMILY_SECOND_FORM_MAX_INDEX, GRAMMAR_VIOLATION_PENALTY, COPULA_THIRD_SINGULAR_PENALTY,
  MAX_PERSONAL_COUNT, MAX_PRIORITY_WORDS, MAX_CACHED_PHRASE_MODELS, PROTECTED_CARE_MIN_PREFIX,
  DERIVED_VOCABULARY_MIN_PREFIX, MAX_COMPLETION_LETTERS, MAX_AAC_DOMAIN_BOOST,
  AAC_EMPHASIS_MIN_PREFIX, AAC_EMPHASIS_MAX_PREFIX, AAC_SHORT_PREFIX_EMPHASIS,
  MAX_PHRASE_WORD_BOOST, MAX_RECENCY_BOOST, MAX_PRIORITY_BOOST, PERSONAL_USE_SHARE,
  CAREGIVER_BASE_STRENGTH, CAREGIVER_PRIORITY_SHARE, CAREGIVER_USE_SHARE, CAREGIVER_RECENCY_SHARE,
  CAREGIVER_PINNED_SHARE, MAX_CAREGIVER_TRANSITION_COUNT, CAREGIVER_CONTEXT_WORD_STRENGTH,
  CAREGIVER_CONTEXT_PAIR_STRENGTH, TYPO_MIN_PREFIX, TYPO_MAX_RESULTS, MAX_LEGAL_CANDIDATES,
  MAX_FUSION_PRIOR_SUPPLY, SENSITIVE_CONTEXT_AAC_STRENGTH, MAX_SENSITIVE_CONTEXT_SHORTLIST,
  CONTEXT_HISTORY_WORDS, POS_SECONDARY_STRENGTH, KN_LOG_DECADES, AAC_DOMAIN_MISFIT_FLOOR,
  AAC_DOMAIN_CONTEXT_GATE_MAX_PREFIX, MAX_UNEVIDENCED_FUNCTION_WORDS, RRF_K, HOUSEHOLD_PAIR_SLOTS,
  HOUSEHOLD_PAIR_RANK, DISTILLED_ROW_CACHE_LIMIT, DISTILLED_LOG_DECADES, CURATED_RANK_SLOTS,
  CURATED_SLOT_COUNT, PERSONAL_MISFIT_FLOOR, AAC_MISFIT_FLOOR, CAREGIVER_MISFIT_FLOOR,
  SEMANTIC_GATE_REJECTED, SEMANTIC_GATE_ALLOWED,
};
`;

const PLACE_CONTEXT_EXPORTS = `
// ---- appended by export_reference_tables.mjs to a temporary copy; not part of the reference ----
export { PLACE_STARTS, PLACE_PAIRS, PLACE_PREVIOUS };
`;

const ENTRY_SOURCE = `
export * as ENGINE from './predictionService';
export * as NGRAM from './data/vocabulary/sharedEnglishNgram.v1';
export * as GRAMMAR from './data/vocabulary/sharedEnglishGrammar.v1';
export * as SEMANTIC from './data/vocabulary/sharedEnglishSemantic.v1';
export * as SAFETY from './data/vocabulary/predictionSafety.v1';
export * as PERSON_CENTRED from './data/vocabulary/personCenteredPrefixContext.v1';
export * as PLACE from './placeContext';
export * as CONTENT_POLICY from './communicationContentPolicy';
`;

/** Notices travel with the data they describe. Copied verbatim from the pinned commit. */
const LICENCE_FILES = [
  'THIRD_PARTY_DATA_NOTICES.md',
  'AAC_CORPUS_LICENSE.md',
  'CONTEXT_PRIORS_LICENSE.md',
  'DISTILLED_CONTINUATIONS_LICENSE.md',
  'FALLBACK_UNIGRAM_PRIOR_LICENSE.md',
  'SYMSPELL_DATA_LICENSE.md',
  'sharedEnglishProvenance.v1.json',
  'vocabularyManifest.v1.json',
];

function parseArgs(argv) {
  const args = { check: false, out: DEFAULT_OUT, reference: process.env.GAZECOMPASS_REFERENCE || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--reference') args.reference = argv[++i];
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.reference) throw new Error('Pass --reference <path to the GazeCompass clone> (or set GAZECOMPASS_REFERENCE).');
  return args;
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out;
}

/** Maps become ordered [key, value] pairs: insertion order is part of the ranking contract. */
const pairs = (map, mapValue = (value) => value) => [...map.entries()].map(([key, value]) => [key, mapValue(value)]);
const objectPairs = (object) => Object.keys(object).map((key) => [key, object[key]]);

function sourceHashes(spellRoot) {
  const hashes = {};
  const base = path.join(spellRoot, '..', '..');
  const runtimeFiles = [
    'predictionService.ts', 'sharedEnglishModel.ts', 'semanticModel.ts', 'spellTypes.ts',
    'personalContinuations.ts', 'placeContext.ts', 'communicationContentPolicy.ts',
  ].map((name) => path.join(spellRoot, name));
  const dataFiles = listFiles(path.join(spellRoot, 'data', 'vocabulary'));
  for (const file of [...runtimeFiles, ...dataFiles]) {
    hashes[path.relative(base, file).split(path.sep).join('/')] = sha256(fs.readFileSync(file));
  }
  return hashes;
}

function bundle(spellRoot, destination) {
  fs.appendFileSync(path.join(spellRoot, 'predictionService.ts'), PREDICTION_SERVICE_EXPORTS);
  fs.appendFileSync(path.join(spellRoot, 'placeContext.ts'), PLACE_CONTEXT_EXPORTS);
  const entry = path.join(spellRoot, '__exportEntry.ts');
  fs.writeFileSync(entry, ENTRY_SOURCE);
  return bundleAndLoad(entry, path.join(destination, 'reference-bundle.cjs'));
}

/**
 * TAIL_RERANK_RESIDUAL and RERANK_PROTECTED_TIERS are declared inside
 * buildPredictionSnapshot (function scope, unindented), so they cannot be
 * exported. Both are plain literals of identifiers and numbers; read them from
 * the verified pinned source text and refuse anything else.
 */
function functionScopedLiterals(spellRoot) {
  const source = fs.readFileSync(path.join(spellRoot, 'predictionService.ts'), 'utf8');
  const literal = (pattern, name) => {
    const match = source.match(pattern);
    if (!match) throw new Error(`Could not locate ${name} in predictionService.ts`);
    const body = match[1].replace(/\/\/[^\n]*/g, '');
    if (!/^[\s\w.:,'\-[\]{}]*$/.test(body)) throw new Error(`${name} is no longer a plain literal`);
    return Function(`"use strict"; return (${body});`)();
  };
  return {
    tailRerankResidual: literal(
      /const TAIL_RERANK_RESIDUAL: Partial<Record<RankerFeature, number>> = (\{[\s\S]*?\n\});/,
      'TAIL_RERANK_RESIDUAL'
    ),
    rerankProtectedTiers: literal(
      /const RERANK_PROTECTED_TIERS: readonly RankerFeature\[\] = (\[[\s\S]*?\]);/,
      'RERANK_PROTECTED_TIERS'
    ),
  };
}

function assertDefined(value, where) {
  if (value === undefined) throw new Error(`Undefined value at ${where}`);
  if (Array.isArray(value)) value.forEach((item, index) => assertDefined(item, `${where}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertDefined(item, `${where}.${key}`);
  }
}

function buildAssets(ref, scoped) {
  const E = ref.ENGINE;
  const index = E.getPredictionIndex();
  const setList = (set) => [...set];
  const assets = {};

  assets['index'] = {
    entries: index.entries.map((entry) => [entry.word, entry.count]),
    lemmaByWord: pairs(index.lemmaByWord),
    prefixBuckets: pairs(index.prefixBuckets, (bucket) => bucket.map((entry) => entry.word)),
    bigrams: pairs(index.bigrams, (row) => row.map(([word, count]) => [word, count])),
    aacBigrams: pairs(index.aacBigrams, (row) => row.map(([word, count]) => [word, count])),
    partOfSpeech: pairs(index.partOfSpeech, (tags) => [...tags]),
    protectedPrefixBuckets: pairs(index.protectedPrefixBuckets, (bucket) => [...bucket]),
    protectedCare: setList(index.protectedCare),
    wordsByPos: pairs(index.wordsByPos, (row) => [...row]),
    urgentTransitions: pairs(index.urgentTransitions, (row) => [...row]),
    urgentPairTransitions: pairs(index.urgentPairTransitions, (row) => [...row]),
    fallbackUnigram: pairs(index.fallbackUnigram),
  };
  assets['context_priors'] = {
    bigrams: pairs(index.contextPriorBigrams, (row) => [...row]),
    trigrams: pairs(index.contextPriorTrigrams, (row) => [...row]),
  };
  assets['distilled_continuations'] = { rows: pairs(index.distilledContinuations) };

  const N = ref.NGRAM;
  const G = ref.GRAMMAR;
  assets['shared_english'] = {
    ngramMeta: N.SHARED_ENGLISH_NGRAM_META,
    trigramShards: N.SHARED_TRIGRAM_SHARDS,
    bigramShards: N.SHARED_BIGRAM_SHARDS,
    unigramShards: N.SHARED_UNIGRAM_SHARDS,
    continuationShards: N.SHARED_CONTINUATION_SHARDS,
    grammarMeta: G.SHARED_GRAMMAR_META,
    grammarClassesPacked: G.SHARED_GRAMMAR_CLASSES_PACKED,
    grammarEdges: objectPairs(G.SHARED_GRAMMAR_EDGES),
  };
  const S = ref.SEMANTIC;
  assets['semantic'] = {
    meta: S.SHARED_SEMANTIC_META,
    classes: [...S.SHARED_SEMANTIC_CLASSES],
    classUnigram: [...S.SHARED_CLASS_UNIGRAM],
    classMaxMembership: [...S.SHARED_CLASS_MAX_MEMBERSHIP],
    classIsFunction: [...S.SHARED_CLASS_IS_FUNCTION],
    classBigramPacked: S.SHARED_CLASS_BIGRAM_PACKED,
    classTrigramPacked: S.SHARED_CLASS_TRIGRAM_PACKED,
    wordShards: S.SHARED_SEMANTIC_WORD_SHARDS,
  };

  const P = ref.SAFETY;
  assets['engine_tables'] = {
    aacDomainWords: E.AAC_DOMAIN_WORDS.map(([word, boost]) => [word, boost]),
    aacContext: objectPairs(E.AAC_CONTEXT),
    aacTwoWordContext: objectPairs(E.AAC_TWO_WORD_CONTEXT),
    aacTwoWordContextV2: objectPairs(E.AAC_TWO_WORD_CONTEXT_V2),
    aacContextV2: objectPairs(E.AAC_CONTEXT_V2),
    contractionExpansions: objectPairs(E.CONTRACTION_EXPANSIONS),
    apostropheWords: [...E.APOSTROPHE_WORDS],
    grammarExpectation: objectPairs(E.GRAMMAR_EXPECTATION),
    sentenceOpeners: [...E.SENTENCE_OPENERS],
    sessionOpeners: [...E.SESSION_OPENERS],
    fallback: [...E.FALLBACK],
    junkResidueTokens: setList(E.JUNK_RESIDUE_TOKENS),
    finiteVerbs: setList(E.FINITE_VERBS),
    modalAuxiliaries: setList(E.MODAL_AUXILIARIES),
    copulas: setList(E.COPULAS),
    degreeAdverbs: setList(E.DEGREE_ADVERBS),
    whWords: setList(E.WH_WORDS),
    subjectPronouns: setList(E.SUBJECT_PRONOUNS),
    objectPronouns: setList(E.OBJECT_PRONOUNS),
    prepositionObjectContexts: setList(E.PREPOSITION_OBJECT_CONTEXTS),
    copulaLike: setList(E.COPULA_LIKE),
    sensitiveCommunicationContext: setList(E.SENSITIVE_COMMUNICATION_CONTEXT),
    careContextWords: setList(E.CARE_CONTEXT_WORDS),
    clinicalSoftBoostWords: setList(E.CLINICAL_SOFT_BOOST_WORDS),
    uninformativeContextWords: setList(E.UNINFORMATIVE_CONTEXT_WORDS),
    whOverridablePairs: setList(E.WH_OVERRIDABLE_PAIRS),
    curatedTiers: [...E.CURATED_TIERS],
    rankerWeights: objectPairs(E.RANKER_WEIGHTS),
    wordBoundaryRankerWeights: objectPairs(E.WORD_BOUNDARY_RANKER_WEIGHTS),
    tailRerankResidual: objectPairs(scoped.tailRerankResidual),
    rerankProtectedTiers: [...scoped.rerankProtectedTiers],
    grammaticalRoleForms: setList(E.GRAMMATICAL_ROLE_FORMS),
    cappedFunctionClasses: setList(E.CAPPED_FUNCTION_CLASSES),
    evidenceTierScores: objectPairs(E.EVIDENCE_TIER_SCORES),
    numericConstants: objectPairs(E.EXPORTED_NUMERIC_CONSTANTS),
    personCenteredPrefixPairContext: objectPairs(ref.PERSON_CENTRED.PERSON_CENTERED_PREFIX_PAIR_CONTEXT),
    placeStarts: [...ref.PLACE.PLACE_STARTS],
    placePairs: setList(ref.PLACE.PLACE_PAIRS),
    placePrevious: setList(ref.PLACE.PLACE_PREVIOUS),
    reservedNavigationLabels: [...ref.CONTENT_POLICY.RESERVED_COMMUNICATION_NAVIGATION_LABELS],
    neverSuggestedWords: [...P.NEVER_SUGGESTED_WORDS],
    clinicalOrSafeguardingWords: [...P.CLINICAL_OR_SAFEGUARDING_WORDS],
    personalExpressionWords: [...P.PERSONAL_EXPRESSION_WORDS],
  };
  for (const [name, value] of Object.entries(assets)) assertDefined(value, name);
  return assets;
}

function serialise(assets) {
  const files = {};
  for (const [name, value] of Object.entries(assets)) {
    files[`${name}.${ASSET_VERSION}.json`] = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  }
  return files;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gazeconnect-prediction-export-'));
  try {
    const { spellRoot } = extractSpellTree(args.reference, scratch);
    verifyPinnedSources(spellRoot);
    const sources = sourceHashes(spellRoot);
    const licences = Object.fromEntries(LICENCE_FILES.map((name) => [
      name, fs.readFileSync(path.join(spellRoot, 'data', 'vocabulary', name)),
    ]));
    const scoped = functionScopedLiterals(spellRoot);
    const reference = bundle(spellRoot, scratch);
    const files = serialise(buildAssets(reference, scoped));
    const manifest = {
      schemaVersion: 1,
      assetVersion: ASSET_VERSION,
      engine: 'gazecompass-deterministic-word-prediction',
      reference: { commit: PIN.commit, subject: PIN.commitSubject },
      generator: 'tools/prediction/export_reference_tables.mjs',
      sources,
      assets: Object.fromEntries(Object.entries(files).map(([name, buffer]) => [name, { sha256: sha256(buffer), bytes: buffer.length }])),
      licenceFiles: Object.fromEntries(Object.entries(licences).map(([name, buffer]) => [`licenses/${name}`, sha256(buffer)])),
    };
    files['manifest.json'] = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    for (const [name, buffer] of Object.entries(licences)) files[`licenses/${name}`] = buffer;

    if (args.check) {
      const stale = Object.entries(files).filter(([name, buffer]) => {
        const target = path.join(args.out, name);
        return !fs.existsSync(target) || sha256(fs.readFileSync(target)) !== sha256(buffer);
      }).map(([name]) => name);
      if (stale.length) {
        console.error(`Assets are stale or missing: ${stale.join(', ')}`);
        process.exit(1);
      }
      console.log(`Assets in ${args.out} match pinned reference ${PIN.commit}.`);
      return;
    }
    fs.mkdirSync(path.join(args.out, 'licenses'), { recursive: true });
    for (const [name, buffer] of Object.entries(files)) fs.writeFileSync(path.join(args.out, name), buffer);
    for (const [name, info] of Object.entries(manifest.assets)) console.log(`${name.padEnd(40)} ${String(info.bytes).padStart(9)} bytes  ${info.sha256}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();

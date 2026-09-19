#!/usr/bin/env node
/**
 * Freeze the reference repository's evaluation sentence sets (pinned commit)
 * into tools/prediction/eval_sets/reference_eval_sets.v1.json.
 *
 * Evaluation data only: never imported by the application and never bundled.
 * Split used by tools/prediction/evaluate.py:
 *   development - goldenDrafts, ksrDrafts, nextWordProbes, evalSentences,
 *                 contextEvalSentences (the reference tuned against several of
 *                 these; integration decisions in this port may look at them);
 *   held-out    - aacEvalSentences (CC BY 4.0 dev/test split), independent
 *                 Tatoeba set (CC BY 2.0 FR), second independent set. Reported
 *                 only; nothing in this port was chosen by looking at them.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PIN, PROJECT_ROOT, bundleAndLoad, sha256 } from './lib/reference.mjs';

const OUT = path.join(PROJECT_ROOT, 'tools', 'prediction', 'eval_sets', 'reference_eval_sets.v1.json');

const ENTRY = `
export { GOLDEN_DRAFTS } from './goldenDrafts';
export { KSR_DRAFTS } from './ksrDrafts';
export { NEXT_WORD_PROBES } from './nextWordProbes';
export { EVAL_SENTENCES } from './evalSentences';
export { CONTEXT_EVAL_SENTENCES } from './contextEvalSentences';
export { AAC_EVAL_SENTENCES } from './aacEvalSentences';
export { INDEPENDENT_EVAL_SENTENCES } from './independentEvalSentences.mjs';
export { SECOND_INDEPENDENT_EVAL_SENTENCE_SOURCE } from './secondIndependentEvalSentences.mjs';
`;

function main() {
  const reference = process.argv[process.argv.indexOf('--reference') + 1];
  if (!reference || process.argv.indexOf('--reference') < 0) throw new Error('--reference <clone> is required');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gazeconnect-eval-sets-'));
  try {
    const tarPath = path.join(scratch, 'bench.tar');
    execFileSync('git', ['-C', reference, 'archive', '--format=tar', '-o', tarPath, PIN.commit, 'scripts/benchmark']);
    execFileSync('tar', ['-xf', tarPath, '-C', scratch]);
    const bench = path.join(scratch, 'scripts', 'benchmark');
    const sources = {};
    for (const name of ['goldenDrafts.ts', 'ksrDrafts.ts', 'nextWordProbes.ts', 'evalSentences.ts', 'contextEvalSentences.ts',
      'aacEvalSentences.ts', 'independentEvalSentences.mjs', 'secondIndependentEvalSentences.mjs']) {
      sources[`scripts/benchmark/${name}`] = sha256(fs.readFileSync(path.join(bench, name)));
    }
    const entry = path.join(bench, '__evalEntry.ts');
    fs.writeFileSync(entry, ENTRY);
    const sets = bundleAndLoad(entry, path.join(scratch, 'eval.cjs'));
    const payload = {
      schemaVersion: 1,
      reference: { commit: PIN.commit },
      generator: 'tools/prediction/export_eval_sets.mjs',
      sources,
      notice: 'Evaluation-only text. aacEvalSentences: Vertanen & Kristensson (EMNLP 2011) crowdsourced AAC corpus dev/test split, CC BY 4.0. independent: Tatoeba English sentences (List 907), CC BY 2.0 FR, ids/owners retained. Other sets were written by the GazeCompass author for evaluation. Never bundled with the application.',
      development: {
        goldenDrafts: [...sets.GOLDEN_DRAFTS],
        ksrDrafts: [...sets.KSR_DRAFTS],
        nextWordProbes: sets.NEXT_WORD_PROBES.map((probe) => ({ ...probe, also: probe.also ? [...probe.also] : [] })),
        evalSentences: sets.EVAL_SENTENCES.map((entry) => ({ text: entry.text, theme: entry.theme })),
        contextEvalSentences: sets.CONTEXT_EVAL_SENTENCES.map((entry) => ({ text: entry.text, register: entry.register })),
      },
      heldOut: {
        aacEvalSentences: [...sets.AAC_EVAL_SENTENCES],
        independentTatoeba: sets.INDEPENDENT_EVAL_SENTENCES.map((entry) => ({ ...entry })),
        secondIndependent: sets.SECOND_INDEPENDENT_EVAL_SENTENCE_SOURCE.map((entry) => (Array.isArray(entry) ? { text: entry[0], group: entry[1] } : entry)),
      },
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);
    const counts = Object.fromEntries(Object.entries({ ...payload.development, ...payload.heldOut }).map(([k, v]) => [k, v.length]));
    console.log(JSON.stringify(counts));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();

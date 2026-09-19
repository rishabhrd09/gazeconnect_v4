#!/usr/bin/env node
/**
 * Parity oracle: run the pinned GazeCompass buildPredictionSnapshot over a case
 * file and write every stage the Python port must reproduce.
 *
 *   node tools/prediction/oracle.mjs --reference <clone> --cases cases.json --out results.json
 *        [--compact] [--commit <sha>]   (--commit is only for neutrality checks against newer commits)
 *
 * Case file: { "cases": [
 *   { "id": "...", "input": { "draft": "...", ...PredictionBuildInput fields }, "slotCounts": [5, 10] },
 *   { "id": "...", "sequence": [ { "draft": "...", "lineage": true, ... }, ... ], "slotCount": 10 }
 * ] }
 *
 * Every single case starts from a cold statistics cache (a throwaway snapshot
 * with a unique context runs first), because the reference memoises statistics
 * per context history and the port deliberately keys that cache more tightly.
 * Steps of a sequence run back to back, as keystrokes would.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundleAndLoad, extractSpellTree, verifyPinnedSources } from './lib/reference.mjs';

function parseArgs(argv) {
  const args = { compact: false, commit: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reference') args.reference = argv[++i];
    else if (arg === '--cases') args.cases = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--compact') args.compact = true;
    else if (arg === '--commit') args.commit = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const key of ['reference', 'cases', 'out']) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
}

function letters(n) {
  let out = '';
  let value = n + 1;
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(97 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

function stageView(snapshot, compact) {
  const out = { prefix: snapshot.prefix, candidates: snapshot.candidates, candidateSlots: snapshot.candidateSlots };
  const d = snapshot.diagnostics;
  if (!d) return out;
  if (compact) {
    out.ranked = d.ranked.slice(0, 24);
    out.diverse = d.diverse;
    out.fused = d.fused;
    return out;
  }
  out.diagnostics = {
    sourceUnion: d.sourceUnion,
    pool: d.pool,
    scoredUnion: d.scoredUnion,
    ranked: d.ranked,
    diverse: d.diverse,
    diversityDecisions: d.diversityDecisions,
    fused: d.fused,
    expectedPartsOfSpeech: d.expectedPartsOfSpeech,
    recoveredCandidates: d.recoveredCandidates,
    features: d.features,
  };
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gazeconnect-prediction-oracle-'));
  try {
    const { spellRoot, commit } = extractSpellTree(args.reference, scratch, args.commit, { requirePin: !args.commit });
    if (!args.commit) verifyPinnedSources(spellRoot);
    const engine = bundleAndLoad(path.join(spellRoot, 'predictionService.ts'), path.join(scratch, 'oracle.cjs'));
    const { cases } = JSON.parse(fs.readFileSync(args.cases, 'utf8'));
    const results = [];
    let throwaway = 0;
    const cold = () => {
      const token = letters(throwaway++);
      engine.buildPredictionSnapshot({ id: -1, draft: `xq${token} jq${token} `, phraseTexts: [], acceptedWords: {} });
    };
    const build = (input, slotCount, previousSnapshot) => engine.buildPredictionSnapshot({
      phraseTexts: [],
      acceptedWords: {},
      ...input,
      id: 1,
      slotCount,
      previousSnapshot,
      diagnostics: true,
    });
    for (const testCase of cases) {
      if (testCase.sequence) {
        cold();
        let previous;
        const steps = [];
        for (const step of testCase.sequence) {
          const { lineage, ...input } = step;
          const snapshot = build(input, testCase.slotCount, lineage && previous ? previous : undefined);
          previous = { prefix: snapshot.prefix, candidates: snapshot.candidates, candidateSlots: snapshot.candidateSlots };
          steps.push(stageView(snapshot, true));
        }
        results.push({ id: testCase.id, steps });
        continue;
      }
      const outputs = {};
      for (const slotCount of testCase.slotCounts ?? [5]) {
        cold();
        outputs[String(slotCount)] = stageView(build(testCase.input, slotCount, testCase.input.previousSnapshot), args.compact);
      }
      results.push({ id: testCase.id, outputs });
    }
    fs.writeFileSync(args.out, JSON.stringify({ commit, results }));
    console.log(`oracle ${commit.slice(0, 7)}: ${results.length} cases -> ${args.out}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();

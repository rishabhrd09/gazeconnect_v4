#!/usr/bin/env node
// Prints the household prediction context a fresh install sends to the backend:
// src/utils/predictionContext.ts applied to CustomizationService's default data.
// Development tooling for tools/prediction/evaluate.py; nothing here ships.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_ROOT, bundleAndLoad } from './lib/reference.mjs';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gazeconnect-household-context-'));
try {
  const entry = path.join(scratch, 'entry.ts');
  const source = (relative) => JSON.stringify(path.join(PROJECT_ROOT, relative));
  fs.writeFileSync(entry, [
    `import { CustomizationService } from ${source('src/services/CustomizationService')};`,
    `import { collectPredictionContext } from ${source('src/utils/predictionContext')};`,
    'export const householdContext = () => collectPredictionContext(new CustomizationService().getData());',
  ].join('\n'));
  const { householdContext } = bundleAndLoad(entry, path.join(scratch, 'entry.cjs'));
  process.stdout.write(`${JSON.stringify(householdContext())}\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

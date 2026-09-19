/**
 * Shared helpers for reading the pinned GazeCompass reference: extract an
 * immutable `git archive` of one commit, verify the pinned source hashes and
 * bundle the TypeScript with esbuild. Development tooling only.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, '..', '..', '..');
export const PIN = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'reference_pin.json'), 'utf8'));

export const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/** Extract src/spell of `commit` into `destination`; returns the spell directory. */
export function extractSpellTree(reference, destination, commit = PIN.commit, { requirePin = true } = {}) {
  const resolved = execFileSync('git', ['-C', reference, 'rev-parse', '--verify', `${commit}^{commit}`], { encoding: 'utf8' }).trim();
  if (requirePin && resolved !== PIN.commit) {
    throw new Error(`Reference commit ${resolved} does not match the pin ${PIN.commit}`);
  }
  const tarPath = path.join(destination, 'reference.tar');
  execFileSync('git', ['-C', reference, 'archive', '--format=tar', '-o', tarPath, resolved, 'src/spell']);
  const tree = path.join(destination, 'tree');
  fs.mkdirSync(tree, { recursive: true });
  execFileSync('tar', ['-xf', tarPath, '-C', tree]);
  return { spellRoot: path.join(tree, 'src', 'spell'), commit: resolved };
}

export function verifyPinnedSources(spellRoot) {
  for (const [relative, expected] of Object.entries(PIN.sourceSha256)) {
    const actual = sha256(fs.readFileSync(path.join(spellRoot, '..', '..', relative)));
    if (actual !== expected) throw new Error(`Pinned source hash mismatch for ${relative}: ${actual}`);
  }
}

/** Bundle `entry` (inside the extracted tree) to CommonJS and load it. */
export function bundleAndLoad(entry, outfile) {
  const require = createRequire(path.join(PROJECT_ROOT, 'package.json'));
  const esbuild = require('esbuild');
  esbuild.buildSync({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', target: 'node18',
    outfile, logLevel: 'error', tsconfigRaw: '{}',
  });
  return createRequire(outfile)(outfile);
}

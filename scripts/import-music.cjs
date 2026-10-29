// Music: add a folder of songs to the music library, as Settings > Music > "Add a folder of songs" does
// (29 Oct 2026; electron/music/musicStore.ts does the work for both).
//
//   node scripts/import-music.cjs "D:\music_aac_songs\music_aac_songs"                 (into Music\GazeConnect Pro)
//   node scripts/import-music.cjs "<folder>" --library "D:\elsewhere\GazeConnect Pro"  (another library)
//   node scripts/import-music.cjs "<folder>" --dry-run                                 (show what would be added)
//
// Each folder inside the source is one playlist (bollywood, krishna, ...) and fills the playlist that
// already has its name or id ("krishna" fills "Shri Krishna"); others are created. Titles come from the
// source folder's library.json when it has one (fullTitle, else title), then the file's ID3 tags, then
// its file name. Songs are copied into <library>\songs; the source folder is never changed, and a song
// already in its playlist is skipped, so running it twice adds nothing twice.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const store = require(path.join(__dirname, '..', 'electron', 'music', 'musicStore.ts'));

/** Windows' Music folder, where the app keeps its library (it may be moved, e.g. into OneDrive). */
function windowsMusicFolder() {
  if (process.platform === 'win32') {
    const reg = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'My Music'],
      { encoding: 'utf8', windowsHide: true });
    const match = /My Music\s+REG_(?:EXPAND_)?SZ\s+(.+)/.exec(reg.stdout || '');
    if (match) {
      const folder = match[1].trim().replace(/%([^%]+)%/g, (all, name) => process.env[name] ?? all);
      if (path.isAbsolute(folder)) return folder;
    }
  }
  return path.join(os.homedir(), 'Music');
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const at = args.indexOf('--library');
  const libraryArg = at >= 0 ? args[at + 1] : null;
  const source = args.find((arg, index) => !arg.startsWith('--') && (at < 0 || index !== at + 1));
  if (!source || (at >= 0 && !libraryArg)) {
    console.error('Usage: node scripts/import-music.cjs "<music folder>" [--library "<library folder>"] [--dry-run]');
    process.exit(2);
  }
  const src = path.resolve(source);
  if (!fs.statSync(src, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Not a folder: ${src}`);
    process.exit(2);
  }
  const root = path.resolve(libraryArg || path.join(windowsMusicFolder(), 'GazeConnect Pro'));
  const library = store.loadLibrary(root);
  const plan = store.planFolderImport(library, src);

  console.log(`Library: ${root}`);
  for (const playlist of plan.playlists) {
    const count = plan.songs.filter((song) => song.playlistId === playlist.id).length;
    console.log(`${playlist.title} (${playlist.isNew ? 'new playlist' : 'existing'}): ${count} song${count === 1 ? '' : 's'}`);
  }
  if (plan.skipped.length) console.log(`Not songs, skipped: ${plan.skipped.join(', ')}`);
  if (dryRun) {
    console.log('Dry run: nothing written.');
    return;
  }

  store.applyPlanPlaylists(library, plan);
  store.saveLibrary(root, library);
  let added = 0;
  const skipped = [];
  for (const item of plan.songs) {
    const result = store.addSongFile(root, library, item.playlistId, item.source, item.details);
    if (result.song) {
      added += 1;
      store.saveLibrary(root, library);
      console.log(`  + ${result.song.title}${result.song.artist ? ` - ${result.song.artist}` : ''}  -> songs\\${result.song.file}`);
    } else {
      skipped.push(`${path.basename(item.source)} (${result.skipped})`);
    }
  }
  if (skipped.length) console.log(`Skipped: ${skipped.join(', ')}`);
  console.log(`Added ${added} song${added === 1 ? '' : 's'}.`);
}

if (require.main === module) main();
module.exports = { windowsMusicFolder };

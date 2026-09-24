// Music: copy a local music folder into the project and write the song list the Music screens read.
//
//   node scripts/import-music.cjs "D:\music_aac_songs\music_aac_songs"            (import)
//   node scripts/import-music.cjs "D:\music_aac_songs\music_aac_songs" --dry-run  (show what would change)
//
// Each sub-folder of the source is one category (bollywood, krishna, ...); its supported audio files
// are its songs. Audio is copied to public/music/<category>/ (served beside the built interface, so
// playback needs no network and never reads the source folder at run time; it is kept out of git by
// public/music/.gitignore). The song list is written to src/components/music/musicLibrary.json.
// Titles come from the source folder's library.json when it has one (fullTitle, else title), then
// from the file's ID3 tags, then from the file name; nothing is invented. The source path itself is
// not written anywhere.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'public', 'music');
const MANIFEST = path.join(ROOT, 'src', 'components', 'music', 'musicLibrary.json');
// What Chromium (and so Electron) plays.
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac', '.webm']);

const slug = (text) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** "01-mere-sapnon-ki-rani.mp3" -> "Mere Sapnon Ki Rani". */
function titleFromFileName(fileName) {
  const words = path.parse(fileName).name
    .replace(/^\s*\d{1,3}\s*[-_. ]\s*/, '')
    .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Folder name -> category title: "devotional" -> "Devotional". */
function titleFromFolder(name) {
  return name.replace(/[-_]+/g, ' ').trim().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** The TIT2 (title), TPE1 (artist) and TLEN (length) frames of an ID3v2.3/2.4 tag, if present. */
function readId3(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(10);
    if (fs.readSync(fd, head, 0, 10, 0) < 10 || head.toString('latin1', 0, 3) !== 'ID3') return {};
    const version = head[3];
    const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    const tag = Buffer.alloc(Math.min(size, 1 << 20));
    fs.readSync(fd, tag, 0, tag.length, 10);
    const out = {};
    let at = 0;
    while (at + 10 <= tag.length) {
      const id = tag.toString('latin1', at, at + 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const frameSize = version === 4
        ? (tag[at + 4] << 21) | (tag[at + 5] << 14) | (tag[at + 6] << 7) | tag[at + 7]
        : tag.readUInt32BE(at + 4);
      const body = tag.subarray(at + 10, at + 10 + frameSize);
      at += 10 + frameSize;
      if (!['TIT2', 'TPE1', 'TLEN'].includes(id) || body.length < 2) continue;
      const encoding = body[0];
      let text;
      if (encoding === 1 || encoding === 2) {
        let data = body.subarray(1);
        let bigEndian = encoding === 2;
        if (data[0] === 0xfe && data[1] === 0xff) { bigEndian = true; data = data.subarray(2); }
        else if (data[0] === 0xff && data[1] === 0xfe) { bigEndian = false; data = data.subarray(2); }
        const even = Buffer.from(data.subarray(0, data.length - (data.length % 2)));
        if (bigEndian) even.swap16();
        text = even.toString('utf16le');
      } else {
        text = body.subarray(1).toString(encoding === 3 ? 'utf8' : 'latin1');
      }
      text = text.replace(/\u0000.*$/s, '').trim();
      if (text) out[id] = text;
    }
    return {
      title: out.TIT2,
      artist: out.TPE1,
      seconds: out.TLEN && Number(out.TLEN) > 0 ? Math.round(Number(out.TLEN) / 1000) : undefined,
    };
  } catch {
    return {};
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const source = args.find((a) => !a.startsWith('--'));
  if (!source) {
    console.error('Usage: node scripts/import-music.cjs "<music folder>" [--dry-run]');
    process.exit(2);
  }
  const src = path.resolve(source);
  if (!fs.statSync(src, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Not a folder: ${src}`);
    process.exit(2);
  }

  // The folder's own song list, when it has one (library.json: categories and songs, in order).
  const given = readJson(path.join(src, 'library.json'));
  const givenSongs = new Map((given?.songs || []).filter((s) => s && typeof s.file === 'string')
    .map((s) => [s.file.replace(/\\/g, '/'), s]));
  const givenOrder = (given?.categories || []).map((c) => c && c.id).filter(Boolean);

  const folders = fs.readdirSync(src, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);
  folders.sort((a, b) => {
    const ia = givenOrder.indexOf(a), ib = givenOrder.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
    return a.localeCompare(b);
  });

  const categories = [];
  const skipped = [];
  const usedIds = new Set();
  for (const folder of folders) {
    const files = fs.readdirSync(path.join(src, folder), { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => d.name);
    const audio = files.filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()));
    skipped.push(...files.filter((f) => !AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase())).map((f) => `${folder}/${f}`));
    // The folder's list decides the order; files it does not mention follow by name.
    const listed = [...givenSongs.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1));
    audio.sort((a, b) => {
      const ia = listed.indexOf(a), ib = listed.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
      return a.localeCompare(b, undefined, { numeric: true });
    });
    const songs = [];
    for (const name of audio) {
      const rel = `${folder}/${name}`;
      const entry = givenSongs.get(rel) || {};
      const tags = readId3(path.join(src, folder, name));
      const title = String(entry.fullTitle || entry.title || tags.title || titleFromFileName(name)).trim();
      const artist = String(entry.artist || tags.artist || '').trim() || undefined;
      const seconds = Number(entry.seconds) > 0 ? Math.round(Number(entry.seconds)) : tags.seconds;
      let id = slug(`${folder}-${path.parse(name).name}`) || `song-${usedIds.size + 1}`;
      while (usedIds.has(id)) id += '-2';
      usedIds.add(id);
      songs.push({ id, title, ...(artist ? { artist } : {}), ...(seconds ? { seconds } : {}), file: `${slug(folder) || folder}/${name}` });
    }
    if (songs.length) categories.push({ id: slug(folder) || folder, title: titleFromFolder(folder), songs, source: folder });
  }

  // Copy the audio (unchanged files are left alone) and drop copies an earlier import made that
  // are no longer in the folder.
  const previous = readJson(MANIFEST);
  const keep = new Set(categories.flatMap((c) => c.songs.map((s) => s.file)));
  const stale = (previous?.categories || []).flatMap((c) => (c.songs || []).map((s) => s.file))
    .filter((file) => typeof file === 'string' && !keep.has(file));
  let copied = 0, unchanged = 0;
  for (const category of categories) {
    for (const song of category.songs) {
      const from = path.join(src, category.source, path.basename(song.file));
      const to = path.join(DEST, ...song.file.split('/'));
      const a = fs.statSync(from);
      const b = fs.statSync(to, { throwIfNoEntry: false });
      if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) { unchanged++; continue; }
      copied++;
      if (!dryRun) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
  }
  for (const file of stale) {
    const target = path.join(DEST, ...file.split('/'));
    if (!target.startsWith(DEST + path.sep)) continue;
    if (!dryRun && fs.existsSync(target)) fs.unlinkSync(target);
  }

  const manifest = {
    version: 1,
    note: 'Written by scripts/import-music.cjs. Audio: public/music/<file> (local only, not in git). Titles from the music folder\'s library.json, else ID3 tags, else file names.',
    categories: categories.map(({ source, ...category }) => category),
  };
  if (!dryRun) {
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2).replace(/\n/g, '\r\n') + '\r\n');
  }

  for (const category of manifest.categories) {
    console.log(`${category.title} (${category.id}): ${category.songs.length} song${category.songs.length === 1 ? '' : 's'}`);
    for (const song of category.songs) console.log(`  ${song.title}${song.artist ? ` - ${song.artist}` : ''}${song.seconds ? ` (${song.seconds}s)` : ''}  <- ${song.file}`);
  }
  if (skipped.length) console.log(`Not audio, skipped: ${skipped.join(', ')}`);
  console.log(`${dryRun ? 'Would copy' : 'Copied'} ${copied}, unchanged ${unchanged}, ${dryRun ? 'would remove' : 'removed'} ${stale.length} stale.`);
  console.log(dryRun ? 'Dry run: nothing written.' : `Wrote ${path.relative(ROOT, MANIFEST)}.`);
}

if (require.main === module) main();
module.exports = { titleFromFileName, titleFromFolder, readId3, AUDIO_EXTENSIONS };

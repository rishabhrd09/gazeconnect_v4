// Music (24 Sep 2026): the imported song list, the rules the Music screens follow, the importer's
// title fallbacks, and that every Music style stays on the Music screens.
//   node scripts/check-music.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true },
  }).outputText, filename);
};

const root = path.resolve(__dirname, '..');
const lib = require(path.join(root, 'src/components/music/musicLibrary.ts'));
const importer = require(path.join(root, 'scripts/import-music.cjs'));
const manifestText = fs.readFileSync(path.join(root, 'src/components/music/musicLibrary.json'), 'utf8');
const manifest = JSON.parse(manifestText);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('the song list is well formed, and names no folder on this computer', () => {
  const library = lib.readLibrary(manifest);
  assert.equal(library.length, manifest.categories.length, 'every playlist survives validation');
  const ids = new Set();
  for (const category of library) {
    assert.ok(category.songs.length > 0, `${category.id} has songs`);
    for (const song of category.songs) {
      assert.ok(!ids.has(song.id), `unique id ${song.id}`); ids.add(song.id);
      assert.ok(song.title.trim(), `${song.id} has a title`);
      assert.ok(song.file.startsWith(`${category.id}/`), `${song.file} is in its playlist's folder`);
    }
  }
  assert.doesNotMatch(manifestText, /[a-z]:[\\/]|music_aac_songs|\\\\/i, 'no absolute or source path');
});

test('every song in the list was imported beside the interface (public/music)', () => {
  const missing = manifest.categories.flatMap(c => c.songs).map(s => s.file)
    .filter(file => !fs.existsSync(path.join(root, 'public', 'music', ...file.split('/'))));
  if (missing.length) console.log(`  note: ${missing.length} audio file(s) not imported on this computer; run scripts/import-music.cjs`);
  assert.ok(missing.length === 0 || !fs.existsSync(path.join(root, 'public', 'music', manifest.categories[0].id)), `missing: ${missing.join(', ')}`);
});

test('a damaged or hand-edited list cannot bring in a made-up or outside file', () => {
  const library = lib.readLibrary({ categories: [
    { id: 'bollywood', title: 'Bollywood', songs: [
      { id: 'a', title: 'Real', file: 'bollywood/a.mp3', seconds: 61.4 },
      { id: 'b', title: '', file: 'bollywood/b.mp3' },
      { id: 'c', title: 'Outside', file: 'C:/Users/x/c.mp3' },
      { id: 'd', title: 'Up', file: '../d.mp3' },
      { title: 'No id', file: 'bollywood/e.mp3' },
    ] },
    { id: 'bollywood', title: 'Twice', songs: [] },
    { title: 'No id', songs: [] },
  ] });
  assert.deepEqual(library.map(c => c.id), ['bollywood']);
  assert.deepEqual(library[0].songs, [{ id: 'a', title: 'Real', seconds: 61, file: 'bollywood/a.mp3' }]);
  assert.deepEqual(lib.readLibrary(null), []);
  assert.deepEqual(lib.readLibrary({ categories: 'x' }), []);
});

test('Indian Music offers Bollywood and Krishna; More holds only the other playlists that have songs', () => {
  const library = lib.readLibrary(manifest);
  assert.deepEqual(lib.PRIMARY_INDIAN.map(c => c.id), ['bollywood', 'krishna']);
  const more = lib.morePlaylists(library).map(c => c.id);
  assert.ok(!more.includes('bollywood') && !more.includes('krishna'));
  assert.deepEqual(more, library.filter(c => !['bollywood', 'krishna'].includes(c.id)).map(c => c.id));
  // No other playlists: no More.
  assert.deepEqual(lib.morePlaylists([{ id: 'bollywood', title: 'Bollywood', songs: [{ id: 'x', title: 'X', file: 'bollywood/x.mp3' }] },
    { id: 'empty', title: 'Empty', songs: [] }]), []);
  // A primary playlist the folder lacks is shown empty, never invented.
  assert.deepEqual(lib.findCategory([], 'krishna'), { id: 'krishna', title: 'Krishna', songs: [] });
  assert.equal(lib.findCategory([], 'unknown'), null);
});

test('four songs a page; Leave returns to the page of the song that was playing', () => {
  assert.equal(lib.SONGS_PER_PAGE, 4);
  assert.equal(lib.pageCount(16, 4), 4);
  assert.equal(lib.pageCount(3, 4), 1);
  assert.equal(lib.pageCount(0, 4), 1);
  const songs = Array.from({ length: 10 }, (_, i) => i);
  assert.deepEqual(lib.pageItems(songs, 0, 4), [0, 1, 2, 3]);
  assert.deepEqual(lib.pageItems(songs, 2, 4), [8, 9]);
  assert.deepEqual(lib.pageItems(songs, 9, 4), [8, 9], 'a page past the end shows the last page');
  assert.deepEqual(lib.pageItems(songs, -3, 4), [0, 1, 2, 3]);
  assert.equal(lib.pageOfSong(0), 0);
  assert.equal(lib.pageOfSong(12), 3);
  assert.equal(lib.pageOfSong(15), 3);
});

test('times read as the player shows them', () => {
  assert.equal(lib.formatTime(0), '0:00');
  assert.equal(lib.formatTime(301), '5:01');
  assert.equal(lib.formatTime(3725), '1:02:05');
  assert.equal(lib.formatTime(undefined), '--:--');
  assert.equal(lib.formatTime(Number.NaN), '--:--');
});

test('the importer takes titles from the file when the folder has no list of its own', () => {
  assert.equal(importer.titleFromFileName('01-mere-sapnon-ki-rani.mp3'), 'Mere Sapnon Ki Rani');
  assert.equal(importer.titleFromFileName('12 yeh_jo_mohabbat hai.MP3'), 'Yeh Jo Mohabbat Hai');
  assert.equal(importer.titleFromFolder('devotional'), 'Devotional');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-music-'));
  try {
    // ID3v2.3 with a UTF-16 title, ID3v2.4 with a UTF-8 title and a length.
    const frame = (id, body, v4) => {
      const head = Buffer.alloc(10); head.write(id, 0, 'latin1');
      if (v4) { const n = body.length; head[4] = (n >> 21) & 127; head[5] = (n >> 14) & 127; head[6] = (n >> 7) & 127; head[7] = n & 127; }
      else head.writeUInt32BE(body.length, 4);
      return Buffer.concat([head, body]);
    };
    const tag = (version, frames) => {
      const body = Buffer.concat(frames); const head = Buffer.from([0x49, 0x44, 0x33, version, 0, 0, 0, 0, 0, 0]);
      const n = body.length; head[6] = (n >> 21) & 127; head[7] = (n >> 14) & 127; head[8] = (n >> 7) & 127; head[9] = n & 127;
      return Buffer.concat([head, body, Buffer.alloc(64)]);
    };
    const utf16 = (s) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
    fs.writeFileSync(path.join(dir, 'a.mp3'), tag(3, [frame('TIT2', utf16('Musafir Hoon Yaaron')), frame('TPE1', utf16('Kishore Kumar'))]));
    fs.writeFileSync(path.join(dir, 'b.mp3'), tag(4, [frame('TIT2', Buffer.concat([Buffer.from([3]), Buffer.from('Gayatri Mantra', 'utf8')]), true),
      frame('TLEN', Buffer.concat([Buffer.from([0]), Buffer.from('290000', 'latin1')]), true)]));
    fs.writeFileSync(path.join(dir, 'c.mp3'), Buffer.from('no tag at all'));
    assert.deepEqual(importer.readId3(path.join(dir, 'a.mp3')), { title: 'Musafir Hoon Yaaron', artist: 'Kishore Kumar', seconds: undefined });
    assert.deepEqual(importer.readId3(path.join(dir, 'b.mp3')), { title: 'Gayatri Mantra', artist: undefined, seconds: 290 });
    assert.deepEqual(importer.readId3(path.join(dir, 'c.mp3')), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every Music style is scoped to the Music screen', () => {
  const css = fs.readFileSync(path.join(root, 'src/components/music/music.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  let depth = 0, start = 0, inRule = [];
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      const prelude = css.slice(start, i).trim();
      const isGroup = prelude.startsWith('@media');
      if (!isGroup) selectors.push(...prelude.split(',').map(s => s.trim()).filter(Boolean));
      inRule.push(isGroup); depth++; start = i + 1;
    } else if (css[i] === '}') { depth--; inRule.pop(); start = i + 1; }
    else if (css[i] === ';' && inRule[inRule.length - 1] === true) start = i + 1;
  }
  assert.ok(selectors.length > 40, `found ${selectors.length} selectors`);
  const loose = selectors.filter(s => !/^(:root\[data-theme='warm'\] )?#music-view\b/.test(s));
  assert.deepEqual(loose, []);
});

test('Home gains one Music tile, below Design Home, in the slot that was empty', () => {
  const home = fs.readFileSync(path.join(root, 'src/screens/HomeScreen.tsx'), 'utf8');
  const right = home.slice(home.indexOf('const rightPanelTiles'), home.indexOf('];', home.indexOf('const rightPanelTiles')));
  assert.deepEqual([...right.matchAll(/\{ id: '(\w+)'/g)].map(m => m[1]), ['web', 'fp', 'music']);
  assert.match(right, /screen: 'music', cardClass: 'grid-card-music'/);
  const column = home.slice(home.indexOf('{rightPanelTiles.map('), home.indexOf('{/* FOOTER'));
  assert.doesNotMatch(column, /minHeight: 0 \}\} \/>/, 'the empty placeholder is gone, so the three rows stay as they were');
});

console.log(`${passed} music checks passed.`);

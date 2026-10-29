// Music (24 Sep 2026; the library of 29 Oct 2026): the music library a caregiver fills in Settings >
// Music (electron/music/musicStore.ts, on throwaway folders), the gcmusic:// addresses the player
// plays, the rules the Music screens follow, that the app ships no songs, and that every Music style
// stays on the Music screens.
//   npm run check:music
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
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const store = require(path.join(root, 'electron/music/musicStore.ts'));
const lib = require(path.join(root, 'src/components/music/musicLibrary.ts'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-music-'));

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

let folderCount = 0;
const folder = (name = 'dir') => { const dir = path.join(tmp, `${name}-${++folderCount}`); fs.mkdirSync(dir, { recursive: true }); return dir; };
const write = (dir, name, data) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), data); return path.join(dir, name); };

// ID3v2.3 with a UTF-16 title and artist, ID3v2.4 with a UTF-8 title and a length.
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
const taggedV3 = (title, artist) => tag(3, [frame('TIT2', utf16(title)), frame('TPE1', utf16(artist))]);
const taggedV4 = (title, ms) => tag(4, [frame('TIT2', Buffer.concat([Buffer.from([3]), Buffer.from(title, 'utf8')]), true),
  frame('TLEN', Buffer.concat([Buffer.from([0]), Buffer.from(String(ms), 'latin1')]), true)]);

try {
  test('a new library is four empty playlists, Shri Krishna among them, and reading it writes nothing', () => {
    const dir = folder('library');
    const listed = store.listLibrary(dir);
    assert.deepEqual(listed.map(p => [p.id, p.title, p.songs.length]),
      [['bollywood', 'Bollywood', 0], ['krishna', 'Shri Krishna', 0], ['chalisa', 'Chalisa', 0], ['devotional', 'Devotional', 0]]);
    assert.deepEqual(fs.readdirSync(dir), [], 'listing created nothing');
    assert.equal(lib.playablePlaylists(lib.readLibrary({ playlists: listed })).length, 0, 'Papa sees no empty playlist');
  });

  test('songs are copied into songs\\, keep their file names, and take titles from the tags, else the file name', () => {
    const dir = folder('library');
    const src = folder('source');
    const library = store.loadLibrary(dir);
    const a = store.addSongFile(dir, library, 'krishna', write(src, '01-radha-krishna-naamawali.mp3', Buffer.from('audio one')));
    const b = store.addSongFile(dir, library, 'krishna', write(src, 'b.mp3', taggedV3('Musafir Hoon Yaaron', 'Kishore Kumar')));
    const c = store.addSongFile(dir, library, 'bollywood', write(src, 'c.MP3', taggedV4('Gayatri Mantra', 290000)));
    assert.deepEqual(a.song && [a.song.title, a.song.file], ['Radha Krishna Naamawali', '01-radha-krishna-naamawali.mp3']);
    assert.deepEqual(b.song && [b.song.title, b.song.artist], ['Musafir Hoon Yaaron', 'Kishore Kumar']);
    assert.deepEqual(c.song && [c.song.title, c.song.seconds, c.song.file], ['Gayatri Mantra', 290, 'c.mp3']);
    store.saveLibrary(dir, library);
    assert.equal(fs.readFileSync(path.join(dir, 'songs', '01-radha-krishna-naamawali.mp3'), 'utf8'), 'audio one', 'the bytes are copied');
    assert.ok(fs.existsSync(path.join(src, 'b.mp3')), 'the source is left where it was');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['library.json', 'songs'], 'the library is one list and one folder (no temporary file left)');
    const again = store.listLibrary(dir);
    assert.deepEqual(again.find(p => p.id === 'krishna').songs.map(s => s.title), ['Radha Krishna Naamawali', 'Musafir Hoon Yaaron']);
  });

  test('what is not a song is skipped, and the same song is never added to a playlist twice', () => {
    const dir = folder('library');
    const src = folder('source');
    const library = store.loadLibrary(dir);
    assert.deepEqual(store.addSongFile(dir, library, 'bollywood', write(src, 'notes.txt', 'x')), { skipped: 'not-audio' });
    assert.deepEqual(store.addSongFile(dir, library, 'bollywood', write(src, 'empty.mp3', '')), { skipped: 'unreadable' });
    assert.deepEqual(store.addSongFile(dir, library, 'bollywood', path.join(src, 'gone.mp3')), { skipped: 'unreadable' });
    assert.deepEqual(store.addSongFile(dir, library, 'nowhere', write(src, 'x.mp3', 'x')), { skipped: 'no-playlist' });
    const song = write(src, 'Kesariya.mp3', 'one');
    assert.ok(store.addSongFile(dir, library, 'bollywood', song).song);
    assert.deepEqual(store.addSongFile(dir, library, 'bollywood', song), { skipped: 'already-there' });
    // Another recording with the same name: a second file, never an overwrite.
    const other = store.addSongFile(dir, library, 'bollywood', write(folder('other'), 'Kesariya.mp3', 'two, longer'));
    assert.equal(other.song.file, 'Kesariya (2).mp3');
    assert.equal(fs.readFileSync(path.join(dir, 'songs', 'Kesariya.mp3'), 'utf8'), 'one');
    // The same file in another playlist is fine.
    assert.ok(store.addSongFile(dir, library, 'devotional', song).song);
    assert.ok(store.MAX_SONG_BYTES >= 300 * 1024 * 1024, 'a long recording still fits');
  });

  test('a folder: each folder inside is a playlist, filling the one of the same id or name, with the folder\'s own titles', () => {
    const dir = folder('library');
    const src = folder('music_aac_songs');
    write(src, 'library.json', JSON.stringify({
      categories: [{ id: 'krishna' }, { id: 'bollywood' }],
      songs: [
        { file: 'bollywood/02-roop.mp3', title: 'Roop', fullTitle: 'Roop Tera Mastana', artist: 'Kishore Kumar', seconds: 225 },
        { file: 'bollywood/01-mere.mp3', title: 'Mere Sapnon', fullTitle: 'Mere Sapnon Ki Rani', seconds: 301 },
      ],
    }));
    write(src, 'bollywood/01-mere.mp3', 'a');
    write(src, 'bollywood/02-roop.mp3', 'b');
    write(src, 'bollywood/cover.jpg', 'not a song');
    write(src, 'krishna/01-mere-man-radhe-krishna.mp3', 'c');
    write(src, 'ghazals/chupke-chupke.mp3', 'd');
    write(src, 'empty-folder/readme.txt', 'nothing');
    const library = store.loadLibrary(dir);
    const plan = store.planFolderImport(library, src);
    assert.deepEqual(plan.playlists.map(p => [p.id, p.title, p.isNew]),
      [['krishna', 'Shri Krishna', false], ['bollywood', 'Bollywood', false], ['ghazals', 'Ghazals', true]]);
    assert.deepEqual(plan.skipped.sort(), ['bollywood/cover.jpg', 'empty-folder/readme.txt']);
    store.applyPlanPlaylists(library, plan);
    for (const item of plan.songs) store.addSongFile(dir, library, item.playlistId, item.source, item.details);
    store.saveLibrary(dir, library);
    const listed = store.listLibrary(dir);
    const titles = (id) => listed.find(p => p.id === id).songs.map(s => s.title);
    // The folder's list decides the order (02 before 01 here) and the full titles.
    assert.deepEqual(titles('bollywood'), ['Roop Tera Mastana', 'Mere Sapnon Ki Rani']);
    assert.equal(listed.find(p => p.id === 'bollywood').songs[0].artist, 'Kishore Kumar');
    assert.deepEqual(titles('krishna'), ['Mere Man Radhe Krishna']);
    assert.deepEqual(listed.map(p => p.title), ['Bollywood', 'Shri Krishna', 'Chalisa', 'Devotional', 'Ghazals']);
    // Adding the same folder again adds nothing twice.
    const second = store.planFolderImport(library, src);
    const results = second.songs.map(item => store.addSongFile(dir, library, item.playlistId, item.source, item.details));
    assert.ok(results.every(r => r.skipped === 'already-there'), JSON.stringify(results));
    // A folder of songs with no folders inside is one playlist named after it.
    const flat = folder('flat');
    write(flat, 'one.mp3', '1');
    const flatPlan = store.planFolderImport(library, flat);
    assert.equal(flatPlan.playlists.length, 1);
    assert.match(flatPlan.playlists[0].title, /^Flat/);
  });

  test('playlists are added, renamed, reordered and removed; two cannot share a name', () => {
    const library = store.defaultLibrary();
    assert.deepEqual(store.createPlaylist(library, '   '), { error: 'empty-title' });
    assert.deepEqual(store.createPlaylist(library, 'bollywood'), { error: 'duplicate-title' });
    const made = store.createPlaylist(library, '  Old   Ghazals ');
    assert.deepEqual(made, { id: 'old-ghazals' });
    assert.equal(library.playlists.at(-1).title, 'Old Ghazals');
    assert.equal(store.renamePlaylist(library, 'krishna', 'Chalisa'), 'duplicate-title');
    assert.equal(store.renamePlaylist(library, 'krishna', 'Shri Krishna Bhajans'), null);
    assert.equal(store.renamePlaylist(library, 'nope', 'X'), 'not-found');
    assert.equal(store.movePlaylist(library, 'bollywood', -1), false, 'the first cannot go earlier');
    assert.equal(store.movePlaylist(library, 'old-ghazals', -1), true);
    assert.deepEqual(library.playlists.map(p => p.id), ['bollywood', 'krishna', 'chalisa', 'old-ghazals', 'devotional']);
    assert.ok(store.cleanTitle('x'.repeat(200)).length <= store.MAX_TITLE_LENGTH);
    assert.equal(store.cleanTitle('a\nb\tc'), 'a b c');
  });

  test('songs are renamed, reordered, moved to another playlist and removed; a removed file goes only when no entry plays it', () => {
    const library = store.normalizeLibrary({ playlists: [
      { id: 'a', title: 'A', songs: [{ id: 's1', title: 'One', file: 'one.mp3' }, { id: 's2', title: 'Two', file: 'two.mp3' }] },
      { id: 'b', title: 'B', songs: [{ id: 's3', title: 'One again', file: 'one.mp3' }] },
    ] });
    assert.equal(store.renameSong(library, 's2', ''), 'empty-title');
    assert.equal(store.renameSong(library, 's2', 'Two (live)'), null);
    assert.equal(store.moveSong(library, 's2', -1), true);
    assert.deepEqual(library.playlists[0].songs.map(s => s.id), ['s2', 's1']);
    assert.equal(store.moveSong(library, 's2', -1), false);
    assert.equal(store.setSongPlaylist(library, 's2', 'b'), true);
    assert.deepEqual(library.playlists[1].songs.map(s => s.id), ['s3', 's2']);
    assert.equal(store.setSongPlaylist(library, 's2', 'b'), false, 'already there');
    assert.deepEqual(store.removeSong(library, 's1'), [], 'one.mp3 is still played by s3');
    assert.deepEqual(store.removeSong(library, 's3'), ['one.mp3']);
    assert.deepEqual(store.removePlaylist(library, 'b'), ['two.mp3']);
    assert.equal(store.removePlaylist(library, 'b'), null);
    assert.deepEqual(library.playlists.map(p => p.id), ['a']);
  });

  test('a damaged or hand-edited library cannot bring in an outside file or break the screens, and a broken file is kept', () => {
    const library = store.normalizeLibrary({ playlists: [
      { id: 'a', title: 'A', songs: [
        { id: 'ok', title: 'Real', file: 'real.mp3', seconds: 61.4 },
        { id: 'up', title: 'Up', file: '../up.mp3' },
        { id: 'abs', title: 'Abs', file: 'C:\\Users\\x\\a.mp3' },
        { id: 'sub', title: 'Sub', file: 'sub/a.mp3' },
        { id: 'exe', title: 'Exe', file: 'tool.exe' },
        { id: 'ok', title: 'Twice', file: 'twice.mp3' },
        { id: 'blank', title: '  ', file: 'blank.mp3' },
      ] },
      { id: 'a', title: 'Again', songs: [] },
      { title: 'No id', songs: [] },
    ] });
    assert.deepEqual(library.playlists.map(p => p.id), ['a']);
    assert.deepEqual(library.playlists[0].songs, [{ id: 'ok', title: 'Real', seconds: 61, file: 'real.mp3' }]);
    assert.deepEqual(store.normalizeLibrary(null), store.defaultLibrary());
    const dir = folder('library');
    fs.writeFileSync(path.join(dir, 'library.json'), '{ not json');
    assert.deepEqual(store.loadLibrary(dir), store.defaultLibrary());
    const kept = path.join(dir, 'library.damaged.json');
    assert.ok(fs.existsSync(kept) && fs.readFileSync(kept, 'utf8') === '{ not json', 'the damaged list is kept');
    // The interface's own reading of main's answer is as strict.
    assert.deepEqual(lib.readLibrary({ playlists: [{ id: 'x', title: 'X', songs: [{ id: 'a', title: 'A', file: '../a.mp3' }, { id: 'b', title: 'B', file: 'b.mp3', missing: true }] }] }),
      [{ id: 'x', title: 'X', songs: [{ id: 'b', title: 'B', file: 'b.mp3', missing: true }] }]);
    assert.deepEqual(lib.readLibrary(null), []);
  });

  test('a song whose file is gone is marked in Settings and left out of what Papa sees', () => {
    const dir = folder('library');
    const src = folder('source');
    const library = store.loadLibrary(dir);
    store.addSongFile(dir, library, 'bollywood', write(src, 'one.mp3', '1'));
    store.addSongFile(dir, library, 'bollywood', write(src, 'two.mp3', '2'));
    store.addSongFile(dir, library, 'chalisa', write(src, 'three.mp3', '3'));
    store.saveLibrary(dir, library);
    fs.rmSync(path.join(dir, 'songs', 'two.mp3'));
    fs.rmSync(path.join(dir, 'songs', 'three.mp3'));
    const listed = store.listLibrary(dir);
    assert.deepEqual(listed.find(p => p.id === 'bollywood').songs.map(s => [s.title, s.missing === true]), [['One', false], ['Two', true]]);
    const seen = lib.playablePlaylists(lib.readLibrary({ playlists: listed }));
    assert.deepEqual(seen.map(p => [p.id, p.songs.map(s => s.title)]), [['bollywood', ['One']]], 'Chalisa (all missing) and Two are not shown');
  });

  test('gcmusic://songs/<file> serves only a song file in songs\\, with byte ranges', () => {
    const dir = folder('library');
    write(dir, 'songs/Shri Hanuman Chalisa.mp3', 'x'.repeat(1000));
    write(dir, 'songs/notes.txt', 'x');
    write(dir, 'secret.mp3', 'x');
    const resolve = (address) => store.resolveSongAddress(dir, address);
    assert.equal(resolve(`gcmusic://songs/${encodeURIComponent('Shri Hanuman Chalisa.mp3')}`), path.join(dir, 'songs', 'Shri Hanuman Chalisa.mp3'));
    assert.equal(resolve('gcmusic://songs/..%2Fsecret.mp3'), null, 'no way out of songs');
    assert.equal(resolve('gcmusic://songs/..%5Csecret.mp3'), null);
    assert.equal(resolve('gcmusic://songs/sub%2Fa.mp3'), null);
    assert.equal(resolve('gcmusic://songs/notes.txt'), null, 'songs only');
    assert.equal(resolve('gcmusic://songs/missing.mp3'), null);
    assert.equal(resolve(`gcmusic://other/${encodeURIComponent('Shri Hanuman Chalisa.mp3')}`), null, 'only the songs address');
    assert.equal(resolve('gcmusic://songs/Shri%20Hanuman%20Chalisa.mp3?x=1'), null);
    assert.equal(resolve('not a url'), null);
    assert.deepEqual(store.parseRange('bytes=0-', 1000), { start: 0, end: 999 });
    assert.deepEqual(store.parseRange('bytes=100-199', 1000), { start: 100, end: 199 });
    assert.deepEqual(store.parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
    assert.deepEqual(store.parseRange('bytes=-100', 1000), { start: 900, end: 999 });
    assert.equal(store.parseRange(null, 1000), null);
    for (const bad of ['bytes=1000-', 'bytes=5-2', 'bytes=-', 'bytes=-0', 'items=0-1', 'bytes=0-1,5-6']) {
      assert.equal(store.parseRange(bad, 1000), 'invalid', bad);
    }
    assert.equal(store.songType('a.mp3'), 'audio/mpeg');
    assert.equal(store.songType('a.M4A'), 'audio/mp4');
    assert.equal(lib.songUrl({ id: 'x', title: 'X', file: 'Shri Hanuman Chalisa (2).mp3' }), 'gcmusic://songs/Shri%20Hanuman%20Chalisa%20(2).mp3');
  });

  test('two playlists a page, four songs a page; Leave returns to the page of the song that was playing', () => {
    assert.equal(lib.PLAYLISTS_PER_PAGE, 2);
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
    assert.equal(store.titleFromFileName('12 yeh_jo_mohabbat hai.MP3'), 'Yeh Jo Mohabbat Hai');
    assert.equal(store.titleFromFileName('Kesariya (2).mp3'), 'Kesariya');
    assert.equal(store.titleFromFolder('devotional'), 'Devotional');
  });

  test('the app ships no songs and no song list: Music shows only what the caregiver added', () => {
    assert.ok(!fs.existsSync(path.join(root, 'src/components/music/musicLibrary.json')), 'no bundled song list');
    const screen = read('src/screens/MusicScreen.tsx') + read('src/components/music/musicLibrary.ts') + read('src/components/music/MusicPlayer.tsx');
    assert.doesNotMatch(screen, /\.json'|BASE_URL|public\/music/, 'nothing read from the app bundle');
    assert.match(read('src/screens/MusicScreen.tsx'), /playablePlaylists\(library\?\.playlists \?\? \[\]\)/, 'the screen shows only playable playlists');
    const files = JSON.parse(read('package.json')).build.files;
    assert.ok(files.includes('!dist/music${/*}'), `the installer leaves out a local public/music: ${files}`);
    assert.match(read('electron/music/musicService.ts'), /if \(!app\.isPackaged && override && path\.isAbsolute\(override\)\) return override;/,
      'only a development run can move the library');
  });

  test('main registers the music address before ready, answers it for the interface, and takes requests from the main window only', () => {
    const main = read('electron/main.ts');
    const scheme = main.indexOf('registerMusicScheme();');
    assert.ok(scheme > 0 && scheme < main.indexOf('app.whenReady()'), 'the scheme is registered before the app is ready');
    assert.match(main, /app\.whenReady\(\)\.then\(\(\) => \{[\s\S]*?musicService\.registerProtocol\(\);[\s\S]*?createWindow\(\);/, 'answered before the window loads');
    assert.match(main, /function setupIpcHandlers\(\): void \{[\s\S]*?musicService\.registerIpc\(\);/);
    const service = read('electron/music/musicService.ts');
    assert.match(service, /if \(!fromMainWindow\(event, this\.mainWindow\(\)\)\) throw new Error/);
    assert.match(service, /shell\.trashItem\(target\)/, 'removed songs go to the Recycle Bin');
    assert.doesNotMatch(service + read('electron/music/musicStore.ts'), /fs\.promises|createReadStream|readFile\(/, 'no work on Node\'s thread pool in main');
  });

  test('Settings has a Music page in both layouts', () => {
    const pages = read('src/components/settings/grouped/settingsPages.ts');
    assert.match(pages, /page\('music', 'Music', /);
    const settings = read('src/screens/SettingsScreen.tsx');
    assert.match(settings, /case 'music': return <MusicPanel isDarkMode=\{isDarkMode\} \/>;/);
    assert.match(settings, /\{ id: 'music', label: 'Music', icon: MusicNoteIcon \}/);
  });

  test('every Music style is scoped to the Music screen', () => {
    const css = read('src/components/music/music.css').replace(/\/\*[\s\S]*?\*\//g, '');
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

  test('the approved Home retains exactly one Music tile wired through its gaze button', () => {
    const home = read('src/screens/HomeScreen.tsx');
    const tiles = home.slice(home.indexOf('const HOME_TILES'), home.indexOf('];', home.indexOf('const HOME_TILES')));
    assert.equal([...tiles.matchAll(/id: 'music'/g)].length, 1);
    assert.match(tiles, /id: 'music', label: 'Music', screen: 'music', icon: MusicNoteIcon/);
    assert.match(home, /HOME_TILES\.map\(tile => <GazeButton[^>]*id=\{tile\.id\}/);
    assert.match(home, /dwellCategory="homeScreenTile" onClick=\{\(\) => onNavigate\(tile\.screen\)\}/);
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} music checks passed.`);

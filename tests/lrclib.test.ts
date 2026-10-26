import test from 'node:test';
import assert from 'node:assert/strict';
import { LrclibProvider, LrclibRecord, chooseRecord, isLatin, parseLrc, rankRecords, recordLyrics, recordingVersion, validateRecord } from '../src/lyrics/LrclibProvider';
import { ProviderError, Song } from '../src/model';

const song: Song = { title: 'Test Song', artist: 'Test Artist', version: '', duration: 180 };
const record = (overrides: Partial<LrclibRecord> = {}): LrclibRecord => ({ id: 800001, trackName: song.title, artistName: song.artist, albumName: 'Test Album', duration: 180, instrumental: false, plainLyrics: 'Synthetic first line\nSynthetic second line', syncedLyrics: '[00:01.00]Synthetic first line\n[00:08.50]Synthetic second line', ...overrides });
const errorCode = (code: string) => (error: unknown) => error instanceof ProviderError && error.code === code;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('LRC expands multiple timestamps and sorts repeated lines with fractions', () => {
  assert.deepEqual(parseLrc('[00:10.250][00:02.50]Synthetic refrain\n[00:04:5]Synthetic verse'), [
    { text: 'Synthetic refrain', time: 2.5 }, { text: 'Synthetic verse', time: 4.5 }, { text: 'Synthetic refrain', time: 10.25 },
  ]);
});

test('LRC applies offsets, removes metadata and excludes negative or invalid seconds', () => {
  assert.deepEqual(parseLrc('[ar:Test Artist]\n[offset:+1000]\n[00:00.50]before zero\n[00:03.00]Synthetic line\n[00:65.00]invalid'), [{ text: 'Synthetic line', time: 2 }]);
  assert.equal(parseLrc('[offset:-500]\n[00:00]Synthetic line')[0].time, .5);
});

test('LRC blank timestamps close instrumental gaps and same-time voices combine once', () => {
  assert.deepEqual(parseLrc('[00:01]Synthetic line\n[00:01]Synthetic line\n[00:01]Another voice\n[00:05]\n[00:09]Next line'), [
    { text: 'Synthetic line / Another voice', time: 1, endTime: 5 }, { text: 'Next line', time: 9 },
  ]);
  assert.deepEqual(parseLrc('[00:00]\n[00:01]<00:01.00>Synthetic line'), [{ text: 'Synthetic line', time: 1 }]);
});

test('LRC rejects HTML and excessive input or line count', () => {
  assert.throws(() => parseLrc('[00:01]<script>bad</script>'), errorCode('invalid-response'));
  assert.throws(() => parseLrc('x'.repeat(150001)), errorCode('invalid-response'));
  assert.throws(() => parseLrc(Array.from({ length: 1001 }, (_, i) => `[${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}]Synthetic ${i}`).join('\n')), errorCode('invalid-response'));
});

test('record validation rejects malformed identities and lyric payloads', () => {
  for (const value of [null, {}, record({ id: NaN }), record({ id: 0 }), record({ id: 1.5 }), record({ trackName: ' ' }), record({ artistName: '' }), { ...record(), plainLyrics: 123 }, record({ syncedLyrics: 'x'.repeat(150001) })]) assert.equal(validateRecord(value), null);
  assert.equal(validateRecord({ ...record(), duration: Infinity, albumName: null })?.duration, undefined);
  assert.equal(validateRecord({ ...record(), duration: Infinity, albumName: null })?.albumName, '');
});

test('script detection distinguishes existing Latin text from Japanese, Korean and Hindi', () => {
  assert.equal(isLatin('Synthetic café señor 123'), true);
  for (const value of ['さくら', '안녕', 'नमस्ते', 'Latin 日本']) assert.equal(isLatin(value), false);
  assert.equal(recordingVersion('Live Remix Live Sped   Up'), 'live remix sped up');
});

test('ranking favors existing Latin lyrics when recording evidence is equal', () => {
  const rows = [record({ id: 800002, syncedLyrics: '[00:01]架空の行' }), record()];
  assert.equal(rankRecords(song, rows)[0].id, 800001);
  assert.equal(chooseRecord(song, rows)?.romanized, true);
  assert.equal(rows[0].id, 800002);
});

test('record matching rejects wrong artist, recording version and materially different duration', () => {
  for (const row of [record({ artistName: 'Someone Else' }), record({ albumName: 'Live' }), record({ trackName: 'Test Song Remix' }), record({ duration: 230 })]) assert.equal(chooseRecord(song, [row]), null);
  assert.equal(chooseRecord(song, []) , null);
  assert.equal(chooseRecord(song, [record({ albumName: 'Live' }), record()])?.id, 800001);
});

test('close artist alternatives remain ambiguous and no match is forced', () => {
  assert.equal(chooseRecord(song, [record({ artistName: 'Test Artist A' }), record({ id: 800002, artistName: 'Test Artist B' })]), null);
});

test('record conversion retains real timing/source and distinguishes original script', () => {
  const converted = recordLyrics(record());
  assert.equal(converted.sourceUrl, 'https://lrclib.net/api/get/800001');
  assert.equal(converted.provenance, 'lrclib');
  assert.equal(converted.lines[1].time, 8.5);
  assert.equal(converted.romanized, true);
  const plain = recordLyrics(record({ syncedLyrics: null, plainLyrics: '[Verse]\n架空の行\n\n次の行' }));
  assert.equal(plain.romanized, false);
  assert.deepEqual(plain.lines, [{ text: '架空の行' }, { text: '次の行' }]);
});

test('instrumentals, absent lyrics and invalid fallback markup have explicit failures', () => {
  assert.throws(() => recordLyrics(record({ instrumental: true })), errorCode('instrumental'));
  assert.throws(() => recordLyrics(record({ syncedLyrics: null, plainLyrics: null })), errorCode('not-found'));
  assert.throws(() => recordLyrics(record({ syncedLyrics: null, plainLyrics: '<b>bad</b>' })), errorCode('invalid-response'));
});

test('provider resolves, caches, aborts, validates errors and respects rate limits', async t => {
  await t.test('exact response resolves and reuses search cache with identification header', async () => {
    let count = 0;
    const provider = new LrclibProvider(async (url, init) => {
      count++;
      assert.match(String(url), /^https:\/\/lrclib.net\/api\/search\?/);
      assert.match((init?.headers as Record<string, string>)['Lrclib-Client'], /LyricFlow/);
      assert.equal(init?.credentials, 'omit');
      return response([record({ id: 800010 })]);
    });
    assert.equal((await provider.resolve(song, new AbortController().signal)).kind, 'ready');
    assert.equal(count, 1);
  });
  await t.test('empty searches retry broad query and return not-found', async () => {
    const urls: string[] = [];
    const provider = new LrclibProvider(async url => { urls.push(String(url)); return response([]); });
    assert.equal((await provider.resolve(song, new AbortController().signal)).kind, 'not-found');
    assert.equal(urls.length, 2);
    assert.match(urls[1], /\?q=/);
  });
  await t.test('nonmatching search returns manual candidates', async () => {
    const provider = new LrclibProvider(async () => response([record({ id: 800011, artistName: 'Wrong Artist' })]));
    assert.equal((await provider.resolve(song, new AbortController().signal)).kind, 'ambiguous');
  });
  await t.test('aborted operation never sends a network request', async () => {
    let calls = 0;
    const provider = new LrclibProvider(async () => { calls++; return response([]); });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(provider.resolve(song, controller.signal), error => error instanceof DOMException && error.name === 'AbortError');
    assert.equal(calls, 0);
  });
  await t.test('invalid search shape is rejected', async () => {
    const provider = new LrclibProvider(async () => response({ unexpected: true }));
    await assert.rejects(provider.resolve(song, new AbortController().signal), errorCode('invalid-response'));
  });
  await t.test('missing record and invalid ID are rejected', async () => {
    const provider = new LrclibProvider(async () => new Response('', { status: 404 }));
    await assert.rejects(provider.getById(800099, new AbortController().signal), errorCode('not-found'));
    await assert.rejects(provider.getById(NaN, new AbortController().signal), errorCode('invalid-input'));
  });
  await t.test('HTTP failure and malformed JSON do not become lyric results', async () => {
    await assert.rejects(new LrclibProvider(async () => new Response('', { status: 500 })).resolve(song, new AbortController().signal), errorCode('network'));
    await assert.rejects(new LrclibProvider(async () => new Response('{')).resolve(song, new AbortController().signal), SyntaxError);
  });
  await t.test('429 blocks following requests without another fetch', async () => {
    let calls = 0;
    const provider = new LrclibProvider(async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '60' } }); });
    await assert.rejects(provider.resolve(song, new AbortController().signal), errorCode('rate-limit'));
    await assert.rejects(provider.resolve(song, new AbortController().signal), errorCode('rate-limit'));
    assert.equal(calls, 1);
  });
});

# SeekTune recognition audit

Audited 2026-10-26 against [cgzirim/seek-tune](https://github.com/cgzirim/seek-tune), commit `a6507e8f1e4a3dce1053eb8ff4c57144d698966f`. Source was cloned into a temporary directory outside this project. No song was downloaded, captured, indexed, or played during this audit. Graphify code extraction and a scoped recognition query guided source inspection; conclusions below were checked against source.

## Decision

Use metadata identification for the working prototype. Keep an explicit, unavailable-by-default audio recognizer boundary. SeekTune provides a reusable fingerprint algorithm and a matcher against a database **you populate**; it does not provide a global song-recognition catalogue or a hosted recognition API. A fresh database cannot identify arbitrary YouTube recordings.

Do not import or run the complete upstream application. Its default server enables download operations, raw recording persistence, and unrestricted origin checks. Adapt only a separately reviewed fingerprint/matching subset after a rights-cleared corpus and real accuracy tests exist. No SeekTune source is copied by this audit.

## Files and behavior examined

All links below pin the inspected revision.

| Source | Observed behavior and consequence |
| --- | --- |
| [README.md](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/README.md) | Standalone React/Go application; documented `serve`, `download`, `save`, `find`, and `erase` commands. Requires indexing songs first. |
| [server/main.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/main.go) | CLI command dispatch and flags. Not an extension-specific service. |
| [server/cmdHandlers.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/cmdHandlers.go#L118-L197) | `serve` accepts all origins, registers `newDownload`, `newRecording`, `newFingerprint`, `totalSongs`; HTTP serves `/socket.io/` and static files. No REST `/recognize` endpoint. Binds `:<port>`, rather than loopback only. |
| [server/socketHandlers.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/socketHandlers.go#L181-L250) | `handleNewFingerprint` parses a JSON string containing a `fingerprint` map, calls `FindMatchesFGP`, emits at most ten matches as a JSON **string**. `handleNewRecording` writes WAV files under `recordings/`; it is not the recognition endpoint. |
| [server/shazam/shazam.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/shazam/shazam.go) | `FindMatches([]float64, durationSeconds, sampleRate)` produces a fingerprint; `FindMatchesFGP(map[uint32]uint32)` queries stored hash/time couples and ranks timing-offset consistency. |
| [server/shazam/spectrogram.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/shazam/spectrogram.go), [fingerprint.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/shazam/fingerprint.go) | Low-pass filtering, downsampling by four, 1024-sample windows, 512-sample hop, FFT and peak pairs. Fingerprint hashes pack two frequency bins and a time delta into 32 bits. Values contain anchor time in milliseconds and song ID. Map representation retains one couple per hash per extraction. |
| [wasm/wasm_main.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/wasm/wasm_main.go) | Exposes `generateFingerprint(audioArray, sampleRate, channels)` in JS; returns `{error, data}` with `{address, anchorTime}` entries or error text. Supports mono or interleaved stereo. Separate Go module replaces `song-recognition` with `../server`. |
| [server/db/client.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/db/client.go), `sqlite.go`, `mongo.go` | SQLite is actual code default at relative `db/db.sqlite3`; MongoDB optional. `GetCouples` retrieves candidates; song table supplies title, artist, YouTube ID. DB and corpus provisioning remain operator responsibilities. |
| [server/spotify/downloader.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/spotify/downloader.go), `spotify/youtube.go` | Spotify metadata, YouTube search, download workflows and `ProcessAndSaveSong` combine catalogue acquisition with fingerprint indexing. `downloadYTaudio` invokes `yt-dlp`. Exclude these paths entirely. |
| [server/wav/convert.go](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/server/wav/convert.go#L14-L65), `wav.go` | FFmpeg conversion to 44.1 kHz PCM WAV; FFprobe metadata. **Conversion defers deletion of a non-WAV input file.** Never reuse this on original user media. CLI save also moves converted files. |
| [client/src/App.js](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/client/src/App.js) | Microphone recording and browser FFmpeg/WASM, 20-second stop, Socket.IO emission, optional audio upload/download. Not suitable for extension reuse. |
| `server/.env.example`, `client/.env.example`, `server/go.mod`, `wasm/go.mod`, `client/package.json`, `Dockerfile`, `docker-compose.yml`, [LICENSE](https://github.com/cgzirim/seek-tune/blob/a6507e8f1e4a3dce1053eb8ff4c57144d698966f/LICENSE) | Configuration, runtime, dependency and license review described below. |

## Actual recognition contracts

Upstream Socket.IO event `newFingerprint` takes a string representing:

```json
{"fingerprint":{"123456":120,"789012":340}}
```

Keys are unsigned 32-bit hash addresses; values are unsigned 32-bit sample anchor times in milliseconds. The outgoing `matches` event contains stringified JSON with capitalized Go fields: `SongID`, `SongTitle`, `SongArtist`, `YouTubeID`, `Timestamp`, `Score`. No match may serialize as `null`; normalize to an empty list.

`Score` is the largest count in 100 ms offset buckets, **not** a probability. The threshold-based filter is commented out. `Timestamp` is the earliest database anchor among matched hashes, **not** an estimated recording offset. Do not use it as lyric alignment or playback offset. Arbitrary positive scores must not trigger automatic song selection.

## Proposed minimal adapter boundary

This is a proposed contract, not a claimed upstream endpoint or an implemented service:

```ts
type RecognitionRequest = {
  requestId: string;
  videoId: string;
  fingerprintVersion: string;
  sampleRateHz: 44100;
  channels: 1;
  durationMs: number;
  hashes: Array<{ address: number; anchorTimeMs: number }>;
};
type RecognitionResult = {
  requestId: string;
  videoId: string;
  status: 'matched' | 'ambiguous' | 'no-match' | 'unavailable';
  reason?: string;
  candidates: Array<{
    corpusSongId: string;
    title: string;
    artist: string;
    score: number;
    source: 'seek-tune-local-corpus';
  }>;
};
```

Keep this behind `SongRecognizer`. Produce fingerprints locally from only a bounded, explicitly activated tab sample; send hashes rather than raw audio if a local service is later configured. Bind any service to loopback, require an installation token and allowlisted origins, set payload/hash limits and a timeout, propagate errors, and expose recognition only. Keep corpus IDs distinct from Genius IDs. Cancel stale video requests; never retain audio or start capture on navigation. Explicitly return `unavailable` when the engine or corpus is absent. Version the fingerprint pipeline and ingest/probe with the same resampling settings.

No Chrome capture is enabled by this audit. A future implementation must separately verify extension activation, offscreen audio lifetime, audible playback routing, volume preservation, stop control, and browser permission behavior. A passing matcher test cannot verify these browser requirements.

## Reliability findings

- `FindMatches` ignores the error from `FindMatchesFGP` at line 41. A wrapper must propagate database failures instead of turning them into no-match.
- `handleNewFingerprint` logs matching failure but continues response emission. There is no typed per-request error envelope or request ID.
- WASM calls `.Int()` on the channels argument before validating its type, and stereo indexing assumes an even-length array. Validate outside or adapt the bridge.
- Browser code passes channel zero only, yet may label it stereo; browser `decodeAudioData` uses its audio context sample rate, potentially different from indexed 44.1 kHz audio. Explicit mono/resampling is required for reproducible comparisons.
- The local `save` path calls YouTube-ID lookup even with `--force`; that flag tolerates lookup failure rather than making ingestion fully offline. Implement a separate explicit-metadata importer if adapting recognition.
- No tracked `*_test.go`, `*.test.*`, or `*.spec.*` files were found. Existing package test scripts/dependencies are not evidence of coverage. Recognition accuracy, noise tolerance, false positives, remixes, and corpus scale are unverified.

## Runtime, configuration and licenses

Upstream modules declare Go 1.23.0 and toolchain Go 1.24.3. SQLite uses `github.com/mattn/go-sqlite3` and normally requires CGO/a C compiler; MongoDB is optional. Native full-app conversion needs FFmpeg/FFprobe, download paths need yt-dlp/Python, and its frontend needs Node/npm. A small in-memory fingerprint path need not inherit those application workflows or their deployment stack.

Actual DB selector is `DB_TYPE` (`sqlite` default or `mongo`). Mongo reads `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DB_PORT`; Compose instead declares `DB_PASSWORD`, a mismatch. Conversion uses `FINGERPRINT_STEREO`; TLS uses `CERT_KEY`/`CERT_FILE`; frontend backend address uses `REACT_APP_BACKEND_URL`. Code frontend fallback is port 5500 while example config/CLI point to 5000. Spotify credentials belong exclusively to excluded workflows.

Compose specifies a 2 CPU / 2 GB limit and 512 MB reservation; these are deployment configuration, **not measured recognition requirements**. No CPU, RAM, latency, coverage or accuracy benchmark was performed. Browser FFmpeg/WASM adds significant packaging and startup work; avoid importing it for a metadata-first prototype.

Upstream is MIT, copyright 2024 Chigozirim Igweamaka. Any later copied substantial portions must retain that copyright and permission notice, record the pinned revision and modifications, and review the licenses of retained dependencies. Inspected manifests include SQLite, MongoDB, Socket.IO, YouTube, Google API, Gonum, error/logging packages and browser FFmpeg. This audit does not establish that every dependency, codec build, song, lyric, service or corpus is covered by MIT. A source-code license grants no music-catalogue or platform access rights.

## Verification boundary

Executed source inspection and graph-guided navigation. Upstream `go test ./...` from `server/` completed with exit code 0: all seven packages reported `[no test files]`. This verifies compilation with the installed Go environment, not matching accuracy or functional coverage. Dependencies were fetched for that compilation; no song or media download occurred. No full upstream frontend/server was launched. No external recognition catalogue was provisioned. No claim of successful real-song recognition or Chrome tab-audio capture is made.

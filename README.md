# LyricFlow

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Lyrics for YouTube, with local Romanization, synchronized playback when timestamps are available, and a resizable fullscreen reading panel.

## Features

- Automatic song detection, including collaborations and song-first video titles.
- LRCLIB lyrics and timestamps, with Genius as a readable-lyrics fallback.
- Search Genius inside the sidebar when lyrics are missing. Enter a song/artist or paste a Genius song link, then choose the result.
- Compact red, blue, green and dark-yellow themes.
- Fullscreen lyrics beside the video. Drag the divider to change the space given to lyrics; hide or show the panel whenever needed.
- Click a timestamped lyric to jump to that part of the song and resume playback.
- Timing adjustment from **−10 to +10 seconds**, in **0.1-second steps**, saved for each recording.
- **Match a line to the music** corrects larger intro offsets without moving playback. Fine delay can then refine the match.
- Optional matching YouTube captions can supply actual video timestamps when every lyric line has a matching caption boundary.
- Local Romanization for Korean, Japanese, Mandarin and nine Indic scripts. Existing Latin text stays unchanged.
- Readable Hindi spellings with familiar nasal sounds and vowel handling, instead of academic accent marks. A literal Devanagari option supports readings that retain inherent vowels.
- Optional tab-audio song identification through AudD, activated explicitly from the toolbar.

**Timing is source-dependent.** Genius usually supplies plain text. When no matching timestamps exist, lyrics remain readable without fabricated timing. Generated Romanization is labeled and is not a translation.

## Quick install

Download and extract the extension ZIP from [Releases](https://github.com/rachitkothadia/lyricflow-youtube/releases/latest). Open your browser's Extensions page, enable Developer mode, choose **Load unpacked**, and select the extracted `dist` folder. Keep the extracted files in place.

LRCLIB works without Node.js. Genius fallback needs Node.js and the included local reader: on macOS, run `Install Genius Reader.command`; on Linux, run `node scripts/install-native.mjs` from the extracted folder. Reload YouTube after installation.

## Install from source

Requirements: Node.js 22 or newer, npm, and a current Chromium-based desktop browser. Development checks currently use Chromium and Opera GX on macOS.

```bash
git clone https://github.com/rachitkothadia/lyricflow-youtube.git
cd lyricflow-youtube
npm ci
npm run build
```

1. Open `chrome://extensions` or `opera://extensions`.
2. Enable **Developer mode**, choose **Load unpacked**, and select the generated `dist` folder.
3. Reload YouTube and open a music video.

After rebuilding, click the extension's **Reload** control and refresh YouTube. The local development server is a test fixture, not the installed extension.

### Enable Genius fallback

```bash
npm run install:reader
```

This installs a small local reader that the browser launches only when needed. It has no listening server and accepts only this extension's public Genius requests. Node.js must remain installed. The installer supports macOS and Linux; Windows native-host registration is not implemented yet. LRCLIB does not require this helper or an API key.

## Use

Open the **three-dot menu** for song correction, source details, color, language and timing controls. Positive timing values delay lyrics; negative values bring them earlier. Corrections are saved locally for the same YouTube video, lyric source, timestamps and recording length. Other recordings start with their own correction. **Reset** clears both alignment and fine delay. Wheel, touch and keyboard browsing temporarily pause automatic following.

When lyrics cannot load, **Find lyrics on Genius** appears directly in the panel. Search by song or artist and select a result to load its lyrics here; the same input also accepts a Genius song URL. Search stays available after empty results or errors, and can be used before automatic song detection. It uses the existing Genius reader and requires no Genius API token. **Search Genius** is also available in the menu for correcting an already loaded song.

For a large intro offset, play the song, choose **Match a line to the music**, then click the line you hear. This aligns the source clock to playback without seeking. Normal lyric clicks still seek. A constant correction cannot repair missing verses or a different song edit.

If only plain lyrics are available, options may offer a **timed edition** of the same song. A different-length edition requires your explicit selection and alignment. **Use matching video captions** reads the current video's available captions through YouTube; it keeps existing timing if the text or line boundaries differ. Automatic captions are labeled. It does not generate, stretch or distribute timestamps.

Fullscreen uses the same lyrics and playback state. Drag the left divider or focus it and use Left/Right arrows; Home/End choose the size limits. Exit fullscreen to return to the regular sidebar.

For audio identification, play music and click the extension toolbar icon, or press **Command+Shift+Y** on macOS / **Ctrl+Shift+Y** elsewhere. This explicitly sends up to ten seconds of current-tab audio to AudD. No microphone is used. The shared public test token has limited quota; a personal token can be stored in extension Options.

## Development

```bash
npm test
npm run test:browser
npm run test:lifecycle
npm run test:product
npm run test:fullscreen
npm run test:playlist
npm run test:controls
npm run test:sync
npm run test:sync-sources
npm run test:genius-search
```

Install test Chromium with `npx playwright install chromium`. Live provider checks require network access and, for Genius, the local reader. See [verification](docs/VERIFICATION.md), [architecture](docs/ARCHITECTURE.md), and [provider behavior](docs/PROVIDER_COMPLIANCE.md) for tested scope and limitations.

This is an actively maintained extension. Provider availability, incorrect community metadata and timing, and recent songs without timestamps can affect results. Source timestamps are community data, not a guarantee of accuracy for every video. Tracks without usable source or matching caption timestamps remain untimed.

## Privacy and permissions

Song titles and artists are sent to the selected lyric providers. Romanization runs locally. Timing corrections store only a video/source fingerprint, adjustment and update time; up to 100 are retained locally. Caption timing uses an ordinary same-origin YouTube request already issued by its player; signed request parameters are not saved as source links. Audio is sent to AudD only after explicit activation and is discarded locally after completion or cancellation. Personal API tokens stay in browser local storage; none are shipped in this repository.

The Genius reader performs ordinary public-page requests. It does not supply account cookies, solve challenges or use proxies. An upstream denial is reported as an error.

## Contributing

Bug reports and pull requests are welcome. Include the YouTube URL, detected artist/title, browser version, and the error shown in the menu. Never include API tokens, browser-profile data or full copyrighted lyric dumps. Keep fixes general rather than adding song-specific exceptions, and retain regression coverage for matching, navigation and playback.

## License

LyricFlow's original source is available under the [MIT License](LICENSE), copyright © 2026 Rachit Kothadia. Dependencies and dictionaries retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

The MIT license does **not** license lyrics, recordings, artwork, or provider catalogues. No copyrighted lyric corpus is bundled. This project is not affiliated with YouTube, Spotify, Genius, LRCLIB or AudD.

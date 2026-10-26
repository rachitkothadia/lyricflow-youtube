# LyricFlow

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Lyrics for YouTube, with local Romanization, synchronized playback when timestamps are available, and a resizable fullscreen reading panel.

## Features

- Automatic song detection, including collaborations and song-first video titles.
- LRCLIB lyrics and timestamps, with Genius as a readable-lyrics fallback.
- Compact red, blue, green and dark-yellow themes.
- Fullscreen lyrics beside the video. Drag the divider to change the space given to lyrics; hide or show the panel whenever needed.
- Click a timestamped lyric to jump to that part of the song and resume playback.
- Per-song timing adjustment from **−10 to +10 seconds**, in **0.1-second steps**.
- Local Romanization for Korean, Japanese, Mandarin and nine Indic scripts. Existing Latin text stays unchanged.
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

Open the **three-dot menu** for song correction, source details, color, language and timing controls. Positive timing values delay lyrics; negative values bring them earlier. A new song resets the adjustment. Wheel, touch and keyboard browsing temporarily pause automatic following.

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
```

Install test Chromium with `npx playwright install chromium`. Live provider checks require network access and, for Genius, the local reader. See [verification](docs/VERIFICATION.md), [architecture](docs/ARCHITECTURE.md), and [provider behavior](docs/PROVIDER_COMPLIANCE.md) for tested scope and limitations.

This is an actively maintained extension. Provider availability, incorrect community metadata and timing, and recent songs without timestamps can affect results. The latest fixes cover playlist priority, shared Genius links, decimal delay entry and recovery from partial provider failures.

## Privacy and permissions

Song titles and artists are sent to the selected lyric providers. Romanization runs locally. Audio is sent to AudD only after explicit activation and is discarded locally after completion or cancellation. Personal API tokens stay in browser local storage; none are shipped in this repository.

The Genius reader performs ordinary public-page requests. It does not supply account cookies, solve challenges or use proxies. An upstream denial is reported as an error.

## Contributing

Bug reports and pull requests are welcome. Include the YouTube URL, detected artist/title, browser version, and the error shown in the menu. Never include API tokens, browser-profile data or full copyrighted lyric dumps. Keep fixes general rather than adding song-specific exceptions, and retain regression coverage for matching, navigation and playback.

## License

LyricFlow's original source is available under the [MIT License](LICENSE), copyright © 2026 Rachit Kothadia. Dependencies and dictionaries retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

The MIT license does **not** license lyrics, recordings, artwork, or provider catalogues. No copyrighted lyric corpus is bundled. This project is not affiliated with YouTube, Spotify, Genius, LRCLIB or AudD.

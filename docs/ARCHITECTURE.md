# Architecture — 0.6

`matching/identity.ts` supplies bounded identity hypotheses, creator-credit parsing, title normalization, search plans and match evidence to both lyric providers. Metadata keeps raw title/channel and all explicitly named performers. Genius preserves structured co-primary/featured credits; LRCLIB serialized credits use the same identity checks. Queries find candidates; separate strict evidence gates decide automatic selection. An identity key includes complete credits so updated metadata triggers a fresh lookup. No song-specific catalogue or lyrics are bundled.

Metadata → LRCLIB → Genius fallback through a fixed-origin native reader → inert HTML parser → local Romanization → compact Shadow DOM panel. Genius source URLs can also be supplied in options. Channel identity resolves song-first video titles. The existing direct LRCLIB timing pipeline remains unchanged.

Chrome native messaging starts one local Node process per Genius request. No server runs in the background. The registered host accepts only the extension origin and read-only public Genius search/song URLs; it has bounded frames, payloads and timeouts. The stable public manifest key preserves the packaged extension identity across folders.

The UI renders only the song name, lyrics and options affordance by default. Settings and attribution are inside a bounded menu. Actual currentTime drives active lines; a 580ms requestAnimationFrame scroll retargets to the current line's geometry. Ordinary clicks do not disable following. Manual browsing pauses it for six seconds; reduced motion uses immediate positioning. Animation frames and timers are cancelled on state changes/disposal.


YouTube metadata → background LRCLIB lookup → conservative recording match or candidate choice → source-native lyrics and optional real timestamps → local Romanization → Shadow DOM panel → video-time synchronization.

Toolbar action → tabCapture stream ID → offscreen tab-only recording → single AudioContext output connection → release tracks and output context → AudD upload → recognized metadata → same lyric pipeline.

Every video change aborts/stales prior content requests, resets offsets and disposes synchronization. Background provider work has timeouts and serialized rate control; stale replies cannot overwrite the new video's UI. Audio has separate session IDs, cancellation on navigation/tab closure, bounded clip size, capture and request deadlines. Secret values are read only in trusted extension contexts. Dictionary data is bundled; no remote executable code is loaded.

UI uses native keyboard-accessible controls, normal-flow placement, reduced-motion support, manual scroll/follow recovery, light/dark themes and safe text rendering. Source attribution and generated-text notices remain visible. The sidebar does not overlay the video or remove recommendations.

`FullscreenLyrics` moves the existing Shadow DOM host into the current fullscreen player, reserves a bounded video area with scoped temporary CSS, and exposes a pointer-captured/keyboard-accessible divider and hide/show control. Fullscreen exit, navigation and disposal remove player attributes/styles and restore regular placement. Resize does not reload lyrics or replace the video.

Timed lines are native buttons. Their callback adds the current offset to the source timestamp, clamps into actual media seekable ranges (or finite recording duration), seeks and resumes playback/following. Untimed text stays non-interactive. The synchronizer tolerates browser microsecond rounding at timestamp boundaries. Delay input is clamped and rounded to tenths; no timestamps are fabricated or rewritten.

Playlist priority is enforced in the outer sidebar on every layout reconciliation, including late insertions and container replacement. Manual Genius links use page-derived identity after fixed-origin URL normalization; automatic matching stays strict. Delay editing separates live application from committed formatting. Optional provider failures preserve useful existing results, while query-specific overload and explicit global rate limits have different recovery behavior.

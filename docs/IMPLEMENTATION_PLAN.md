# Release 0.6 delivery update

Completed and checked: persistent playlist priority; verified-timing preference and fallback searches; provider-error recovery without false global cooldowns; canonical/manual Genius URLs and Enter submission; character-safe decimal delay editing; clean-source setup verification; public MIT repository and release packaging. Untimed sources remain explicit, with no estimated timing, as requested.

# Release 0.5 delivery update

Completed: fullscreen lyrics with a bounded drag/keyboard divider, scoped video/control layout, hide/show, exit restoration and SPA cleanup; per-song delay from -10 to +10 seconds in exact tenths; offset-aware lyric seeking and playback; actual seekable/DVR range bounds; browser microsecond timestamp precision handling. Untimed text remains readable with seeking unavailable. Verification includes installed-extension fixtures and actual YouTube fullscreen on timed and untimed sources.

# Release 0.4 delivery update

Completed systemic discovery repair: shared performer identities, complete provider credits, normalized bounded search fallbacks, featured-artist parsing on either side of the title, uncertain title-order hypotheses, strict wrong-artist/version rejection and metadata-change refresh. Validation combines generated structural cases, replay of the shipped matcher, independent live collaborations and previous reported-song regressions. See VERIFICATION.md for evidence and remaining provider limits.

# Release 0.3 delivery update

Completed: compact colored reading view; options menu; current-line growth, color and eased scrolling; temporary manual-follow pause; verified reversed-title matching; live public Genius fallback through a scoped native reader; safe text extraction; local Mac installation; source-specific and UI acceptance checks. The public stable extension identity is introduced in this version, so disable the older extension before loading the new dist folder.

The source cannot supply missing line timestamps. Untimed Genius text remains readable, and exact synchronization is available only when verified timestamp data exists. Future catalogue availability remains controlled by providers.

# Revised delivery roadmap — 0.2

1. Research and audit: preserve Seek-Tune technical audit and ten-site design research.
2. Foundation: MV3 extension, native sidebar, options and isolated test fixtures.
3. Recognition: automatic metadata plus explicit AudD tab-audio recognition; no dependency on a nonexistent Seek-Tune public catalogue.
4. Lyrics: LRCLIB public API replaces the gated primary Genius text path. Manual candidate choice and correction remain available.
5. Romanization: existing Latin preferred; labeled local Korean, Japanese, Mandarin and Indic conversion; dictionary bundled with licenses.
6. Timing: preserve real timestamps from the same lyric record; no fabricated timing, confidence-aware legacy alignment retained for imports.
7. Integration: SPA cleanup, stale-response rejection, audio stop/cleanup, accessibility, source provenance, errors and rate-limit recovery.
8. Release: build, unit/browser/live checks, verification report, unpacked extension and zip.

Implementation status is governed by VERIFICATION.md. Third-party catalogue availability, quotas, community timing accuracy and unsupported writing systems are external limits, never hidden success states. Store publication and guaranteed universal song coverage are not claimed.

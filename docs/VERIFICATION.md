# Release 0.7.0 — recording alignment and timing recovery, 2026-10-26

Passed: build, 105 unit tests, 22 new browser synchronization checks, 4 live LRCLIB source-edition checks, 37 fullscreen checks, 20 browser checks, 21 lifecycle checks, 19 product checks, 12 manual-control/shared-Genius checks, and 8 playlist checks. Browser clock checks use generated silent media and explicitly synthetic words. They verify immediate highlight changes during pause/play, combined base/fine seeking, a 20-second line alignment without seeking, actual extension storage persistence/reset/isolation, late recording duration updates, preview/ad exclusion, caption boundary transfer, mismatch/cancellation safety and stale profile rejection.

Root causes: source feature credits embedded in titles were rejected; terminal player-status suffixes hid timed editions; duration arriving after initial metadata could leave an earlier edition selected; a ten-second fine control could not correct larger intro differences. The patch fixes these general paths and adds recording-specific local corrections. Source words are not hardcoded.

Live source checks found compatible timestamped Still Here editions for 270- and 285-second requests. RED's approximately 304-second album edition has source timestamps; the approximately 363-second video edition returns plain lyrics and offers that timed edition explicitly. Duration difference alone does not prove where an intro/skit occurs, so no automatic 59-second shift or proportional timing is generated. Source availability tests do not certify the community timestamps against audible playback.

Caption recovery is verified with deterministic same-origin browser responses, including actual JSON3 cue/word boundaries, exact lyric matching, retained attribution and cancellation. Live playback/caption verification for the named recordings remains blocked: automated YouTube playback requests sign-in, and the user's Mac is locked. No claim of verified recording-specific audio alignment or successful installed-Opera update is made for 0.7. Songs without suitable source timestamps or matching caption boundaries stay untimed.

Evidence: `output/reliability/sync.json`, `sync-sources.json`, `manual-controls.json`, plus the existing browser/fullscreen/playlist/product report paths below. Public reports contain metadata and checks, not lyric corpora or signed caption URLs.

# Release 0.6.0 — playlist priority and loading/control recovery, 2026-10-26

Passed: build and 97 unit tests; 8 playlist checks; 12 manual-source/keyboard checks; 37 fullscreen, 20 browser, 21 lifecycle and 19 product checks. A clean source copy with no generated outputs passed npm ci, build, unit, lifecycle, playlist and manual-control checks.

Lyrics mount as the first child of the outer sidebar with priority in flex layouts. Late modules, outer and inner playlists, container replacement and reordering preserve placement and the existing lyrics. Real YouTube mixes for Spring Day and Buzz placed lyrics above the playlist; fullscreen resizing and exit restoration also passed. Four earlier reported songs still loaded automatically with live sources.

Shared Genius links accept www, tracking parameters, fragments and trailing slashes. Enter submits the link. Explicit links read the selected page's identity and work before metadata detection; automatic matches retain identity validation. Real Genius/network checks loaded Buzz from a shared link while the playing fixture had a different detected title. Parser checks also confirmed inert content and wrong-host/automatic identity rejection; three other real Genius pages were rechecked.

Delay entry now applies valid tenths without rewriting the field/caret during each keystroke; formatting and bounds commit on blur. Real character-by-character negative and positive decimal entry changed actual video seek positions. Timing search prefers safely matched source timestamps, expands past plain or irrelevant early results, and preserves readable lyrics on optional search failure. A query-specific 503 no longer imposes a global undocumented minute-long cooldown; actual 429/Retry-After backoff remains enforced. Genius follow-up failures preserve plausible choices instead of discarding them.

Per user preference, no estimated timings are generated. Buzz returned no matching LRCLIB timing record in the checked searches; its Genius text remains readable with a visible No line timing available notice and disabled timing controls. A declared YouTube auto-caption track returned no caption payload to the ordinary request; no caption-based synchronization is claimed. Community timing and future upstream availability remain external limits.

Evidence is generated under output/reliability, output/playlist, output/fullscreen, output/fixes, output/playwright and output/product. Reports retain metadata/counts only. The repository was published publicly under MIT as base commit d6a644a before the follow-up fixes. Original-source MIT terms and dependency/dictionary notices are included separately.

# Release 0.5.0 — fullscreen lyrics, timing delay and replay, 2026-10-26

Passed: TypeScript/bundled build; 87 unit tests; 37 focused fullscreen/playback checks; existing 20 browser, 21 lifecycle and 19 product checks. New coverage includes actual browser fullscreen entry/exit, direct-player and anonymous nested wrappers, pointer and keyboard resizing, minimum-width settings overflow, bounded video/control placement, hide/show, viewport changes, exact tenths from -10 to +10, delay-aware lyric seeking, automatic playback/follow recovery, Enter/Space, untimed handling and navigation cleanup. Seek targets are bounded to real seekable ranges; unit cases include live DVR windows and discontinuities.

Actual YouTube fullscreen controls were exercised through the installed MV3 extension on Spring Day (50 real LRCLIB timed lines) and Buzz (127 real Genius untimed lines). Dragging enlarged the panel from 432px to 584px while the video and its controls remained to the left. Timed lyric clicks sought and started the real video with a +0.6-second adjustment; fullscreen exit preserved lyrics and returned the sidebar. YouTube rounded an actual seek down by a microsecond; the synchronizer now tolerates that precision loss at line boundaries, with a regression case.

The user's Opera GX installation was reloaded and reported version 0.5.0 enabled. Its existing Buzz tab was refreshed, fullscreen lyrics and the 384px resize divider and hide control were verified through native accessibility, then normal view was restored with lyrics intact. No other extension or permission was changed.

Evidence: `output/fullscreen/results.json`, `live.json`, `opera.json`, `release-checks.json`; screenshots in the same folder; existing `output/playwright/` and `output/product/results.json`. Package integrity and byte parity were checked against the current dist. Extension identity, permissions and local native-reader contents remain unchanged.

Delay and click-to-seek require source timestamps. Plain Genius text remains readable in both views, with timing disabled and no invented seek targets. Live DVR bounds are unit-tested; live-stream audio identification or dynamic song changes within a stream were not added by this fullscreen feature.

# Release 0.4.0 — systemic song identity fix, 2026-10-26

Replayed the shipped 0.3.1 background matcher against the same live Genius response as current source. The raw collaboration query returned zero hits. The old parser dropped coartists, so the correct candidate scored 0.69 and was rejected. Normalized search and complete provider credits produce a verified 0.90 match. Production source contains no song-specific rules, source URL overrides or lyric corpus. Evidence: `output/matching/replay.json`; repeat with `node scripts/matching-replay.mjs` while the 0.3.1 ZIP is present.

Passed on this release:
- Build and 82 unit tests, including 192 generated collaboration/title-order combinations, featured artists on either side, styled/accented names, bounded alternate identities and queries, wrong-artist/group-name collision and wrong-version negatives.
- 20 browser, 21 lifecycle, 19 product, 18 metadata DOM checks. Layout, playback, active-line size/color, intermediate animated scroll, manual-follow recovery, navigation cleanup and untimed behavior remain covered.
- Four actual YouTube collaboration videos with installed extension and live sources, without manual choice or source URL: Buzz 127 Genius lines; Die With A Smile 53 Genius lines; APT. 80 Genius lines; No Church In The Wild 74 LRCLIB lines. Evidence: `output/matching/live-collaborations.json`.
- Four earlier actual YouTube failures with injected SponsorBlock-style controls: Underpressure 74 Genius lines, 101 82 Genius lines, Baby 59 Genius lines, Not Like Us 105 LRCLIB lines. Evidence: `output/fixes/reported-songs.json`.
- User's existing Opera GX extension restarted; version 0.4.0 and enabled status confirmed. Refreshed the existing Buzz tab and confirmed heading `Buzz · Seedhe Maut & KR$NA`, 101 lyric text nodes in its accessibility reading region, options present and no missing-lyrics message. No other extension was changed. Evidence: `output/matching/opera-update.json`.

The structural test matrix and unrelated live cases validate the matching logic beyond the reported song. They do not establish universal upstream catalogue availability, perfect community lyrics or timestamps for plain Genius text. Native-reader transport, permissions and stable extension identity are unchanged. Reports retain metadata/counts only, with no lyric text.

# Release 0.3.1 — missing-lyrics regression fix

The reported failure was reproduced as title contamination by injected SponsorBlock/category controls. This polluted either the song title or the artist sent to both lyric sources. A second parser issue failed to split the exact `101- KARMA` format. The reader now clones and filters native title/channel text, uses matching canonical metadata to recover added prefixes, rejects stale recording IDs, and observes text-node/video-ID changes during navigation. No other extension is modified or disabled.

Passed: 71 unit tests; 18 DOM cases covering all four example songs with injected buttons, category spans and plain labels (including labels joined without spaces); five observer checks; existing 20 browser and 21 lifecycle checks. Actual YouTube pages with injected SponsorBlock-style controls loaded automatically: Underpressure 74 lines, 101 82 lines, Baby 59 lines, Not Like Us 105 lines. Sources were real Genius/LRCLIB responses, with no lyric content copied to reports.

Evidence: output/fixes/reported-songs.json, metadata-dom.json, metadata-observer.json. The user's Opera installation was inspected: SponsorBlock 6.1.6 and LyricFlow 0.3.0 were enabled, with LyricFlow loaded from this project's dist folder. The existing extension was restarted through its enabled switch and Opera reported 0.3.1. Site permissions and extension identity remain unchanged. The active Opera YouTube tab was refreshed. Its post-refresh rendered lyrics could not be confirmed by the accessibility capture, which returned a loading frame; the four complete live-song results above were verified in an isolated real Chromium extension profile.

# Release 0.3 verification — 2026-10-26

Current implementation passed:
- 69 unit tests, including reversed YouTube titles, Genius matching, native host origin/URL restrictions and framed-message bounds.
- 20 browser regression checks and 21 lifecycle checks.
- 19 product checks for the compact 354px panel, hidden utilities, 22px/26px type hierarchy, actual video seek/scroll, intermediate animation positions, six-second follow recovery, four palette colors, reduced motion and Genius integration.
- Six browser parser checks for line/section preservation, inert scripts, malformed pages, wrong hosts and wrong song identity.
- Actual Genius pages through Chrome native messaging: Underpressure (74 lines), Bohemian Rhapsody (52), Not Like Us (104). No full lyric text is saved in these reports.
- Actual Karma YouTube video bkshVU8FN4Q: reversed song/artist title recognized automatically; 74 Genius lines displayed, normal-flow height 354px, options closed by default. Evidence: output/product/live-karma.json.
- Five-language live LRCLIB lookup and local Romanization rechecked in the updated UI.
- Real audio capture cancellation rechecked with the updated menu.
- Actual YouTube Spring Day seek/highlight rechecked in the updated panel: passed, with 50 timed lines.
- Packaged archive integrity and native-reader/source parity checked.
- Dependency audit during lockfile update: zero reported vulnerabilities.

The local Genius reader has been installed on this Mac. It runs on demand without a listening server. Chrome extension requests were denied by the website while ordinary Node requests succeeded; no challenge solving, identity spoofing, cookies or proxy transport was introduced. If the upstream service denies the reader, the extension reports the error. Public access does not establish catalogue redistribution rights.

Genius text does not contain line timestamps for the three tested songs. It is deliberately untimed, with no fabricated active line or synchronization. The animated following path is verified on timestamped lyrics. Universal catalogue coverage and exact timing for every Genius song cannot be claimed. Opera-specific UI execution, Windows native-host installation, store publication and acoustic volume measurement were not performed.

Evidence: output/product/results.json, genius-reader.json, live-karma.json, red.png, blue.png, green.png, gold.png; output/playwright/results.json and lifecycle-results.json; output/live/provider-smoke.json and audio-cancel.json. The old report below records earlier acceptance and is historical where superseded.

# Verification — 2026-10-26, release 0.2

## Executed and passed
- TypeScript check and bundled MV3 build.
- 60 unit tests: metadata including quoted bilingual titles, conservative matching, LRC offsets/repeats/gaps, invalid records, error/quota handling, imports, alignment, playback boundaries and local Romanization.
- 20 Chromium browser checks: normal-flow layout, one panel, no player overlap, playback/seek/speed/pause, timing offset, manual-follow controls, reduced motion, narrow layout, navigation, recovery and real extension injection.
- 21 Chromium lifecycle/state checks: teardown, stale search rejection, fallback placement, all panel states, keyboard access, focus and untimed behavior.
- Five songs through the installed MV3 extension, actual LRCLIB network responses and local Romanization: Husn (Hindi, 39 lines), Spring Day (Korean, 50), Hikaru Nara (Japanese, 51), Mojito (Mandarin, 34), Despacito (Spanish, 77). All returned real timestamps and Latin-script output. Japanese dictionary was loaded from the bundled extension assets. These five provider checks used a routed YouTube-layout fixture, not five independent live YouTube playbacks. No full lyric text was persisted in the report.
- Real YouTube Spring Day page: automatically recovered artist/title, fetched 50 lines, generated Korean Romanization, inserted once in secondary-inner with recommendations below and no player overlap. Seeking the real video to the fourth provider timestamp activated exactly that line. `output/playwright/live-layout.json` records this acceptance result.
- Real Chrome tab capture through a native Command+Shift+Y action: generated tone recorded, capture indicator ended, normal audio-playing state returned, AudD responded no-match. A second test streamed AudD's official public example into the test tab, captured it through the extension and received `Song identified from audio by AudD.` These were actual MediaRecorder/AudioContext/offscreen/API paths, not mocked recognition. The native shortcut was activated using computer-use automation; simulated Playwright key events alone did not invoke Chrome's action.
- Real capture cancellation also passed: a Chrome browser-level action started capture, the panel Stop control ended it, and the UI reported Audio recognition stopped. Evidence: `output/live/audio-cancel.json`.
- Dependency audit: zero reported vulnerabilities after updating the transitive TOML dependency; TOML is build tooling and is not included in the content bundle.
- Graphify code index refreshed.

## Evidence
`output/playwright/results.json`, `lifecycle-results.json` (where generated), `live-layout.json`; `output/live/provider-smoke.json`, `audio-browser.json`, `audio-song.json`. Tests save metadata, counts and statuses, not copyrighted lyric dumps. Earlier unsuccessful probe outputs are superseded by these final receipts.

## Limits that tests do not establish
These checks prove the tested implementation paths, not universal catalogue coverage, perfect community lyrics/timing or native pronunciation quality. Existing Romanized text is preferred; generated transliteration is labeled. Han-only Japanese may require the Japanese selector. Unsupported scripts remain original with a notice. A constant offset can correct an intro, but not an edited or unrelated recording. Genius full-text access remains deliberately gated; LRCLIB is the active replacement. AudD's shared public test quota may be unavailable, requiring the user's own token. Browser-store publication and installation into the user's everyday browser profile are not claimed.

No human listening study or frame-level lip-sync accuracy study was performed. Actual audio capture/output state and provider responses were verified; perceived audio volume was not measured acoustically.

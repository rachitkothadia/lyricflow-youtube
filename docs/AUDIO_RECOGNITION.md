# Optional tab audio recognition

Implemented 2026-10-26. This is a separate AudD path; metadata lookup is not audio recognition, and the unconfigured SeekTune adapter remains independent.

## User flow and integration

Before capture, explain that clicking the extension toolbar action sends up to ten seconds of the current YouTube tab audio to AudD. `chrome.action.onClicked` is the sole start entry point; call `startRecognition(tab.id)`. Do not call it automatically from content-script initialization or navigation. A panel button may explain how to invoke the toolbar action, but cannot silently obtain a capture grant.

The background imports `startRecognition`, `stopRecognition`, `handleCaptureMessage` from `src/recognition/CaptureService.ts`. Its runtime listener calls `handleCaptureMessage(message, sender)` for offscreen status events; it must not intercept offscreen messages with an unrelated response. UI Stop forwards a validated tab-origin request to `stopRecognition(sender.tab.id)`. The module also stops sessions on tab URL change, loading, or close. Parent UI must call Stop on detected YouTube video changes, including SPA changes, and reset prior results.

Manifest integration: `activeTab`, `tabCapture`, `offscreen`, `storage` permissions; `https://api.audd.io/*` host permission; a toolbar `action` without `default_popup`; minimum Chrome 120 is sufficient. Build `src/recognition/offscreen.ts` into `dist/offscreen.js`, copy `fixtures/offscreen.html` to `dist/offscreen.html`. Do not add offscreen files as content scripts or expose them as web-accessible resources.

Events to the captured tab have type `LYRICFLOW_AUDIO_STATUS`, requestId, tabId, status, message and optional song `{title, artist, version}`. Status is one of `starting`, `capturing`, `recognizing`, `matched`, `no-match`, `stopped`, `error`. Incoming offscreen events are restricted to the extension's own offscreen URL, request ID, and tab ID. Late results from stopped sessions are ignored. The UI must show a capture indicator and Stop while capturing/recognizing. Errors/quota exhaustion remain visible and recoverable. No automatic retry is performed.

## Processing and privacy

Capture runs in the bundled offscreen document using Chrome's tab stream ID. Its getUserMedia constraints specify `chromeMediaSource: tab` and that exact ID; there is no microphone fallback or video capture. The stream connects once to an AudioContext destination without adding gain, preserving audible tab playback while Chrome redirects its captured output. The same stream is encoded as WebM/Opus at 96 kbit/s. Recording stops after ten seconds or a 2 MB limit. All media tracks and the audio context are released before the upload.

The offscreen document sends the short blob in a multipart POST to `https://api.audd.io/` with a fifteen-second timeout. It requests recognition metadata only. No YouTube URL, cookies, full recording, local audio file, lyric text, or account identifier is sent by this module. AudD necessarily receives the audio clip, API token, network address and normal request metadata, and handles it under its own service policies; this project does not claim control over AudD retention. Local chunks are transient and are discarded after completion/cancellation. Stop aborts the network request and discards the local buffer; data already transmitted cannot be recalled.

The background reads optional `chrome.storage.local.auddToken` and passes it directly to the offscreen process. Without a configured token, the documented public `test` token is used. Do not put project credentials in the distributed extension. AudD's [official glossary](https://www.audd.io/resources/reference/glossary) documents ten requests/day for `test`, standard endpoint only; availability is not guaranteed and this is not a guaranteed per-user allowance. Users can configure their own token for local use; extension code/storage is inspectable, so a distributed developer token must instead stay on a separately deployed backend. No universal language coverage, song coverage or recognition accuracy claim is made.

## Official documentation reviewed

[Chrome tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) requires extension invocation, documents the audible-output rerouting requirement, and supports service-worker stream IDs in an offscreen document from Chrome 116. [Chrome offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) requires a bundled HTML page and runtime messaging; this implementation uses USER_MEDIA and AUDIO_PLAYBACK reasons.

[AudD standard recognition documentation](https://docs.audd.io/) documents multipart file submission to the standard endpoint and a public `api_token=test` example. Its result includes artist/title and can be null for no match. The documentation does not establish universal multilingual coverage or a production entitlement for the shared token.

## Executed live provider check

One official example request was executed on 2026-10-26: POST to `https://api.audd.io/`, form `url=https://audd.tech/example.mp3`, `api_token=test`. Audio was not downloaded locally. Response: `status=success`, artist **Tears For Fears**, title **Everybody Wants To Rule The World**, album **Songs From The Big Chair**, provider timecode **00:56**, canonical result link [AudD result](https://lis.tn/NbkVb). Only metadata was printed. This verifies this public example recognition request at that time; it does not prove tab capture, output volume, random songs or live quota availability.

`npx tsc --noEmit` passed. A bundled offscreen lifecycle test with mocked Chrome/media objects passed checks for tab-only constraints, exactly one output connection, track/context release before upload, matched metadata, cancellation without upload, and cleanup exactly once. This caught and fixed a race between recorder stop and cancellation cleanup. Real Chrome capture and playback-preservation acceptance checks must be performed with an extension invocation; these supplementary checks do not replace those browser checks. A recognition result's provider timecode is not automatically used as a lyric offset.

## Final browser acceptance
Actual Chrome action invocation, tab capture, offscreen encoding and live AudD upload passed. A generated tone yielded the expected no-match; the streamed official example yielded a matched song. Chrome's tab indicator returned from shared-content to audio-playing after capture. See output/live/audio-browser.json and audio-song.json. Earlier mocked tests remain supplementary; the prior real-capture pending note above is superseded by this result.

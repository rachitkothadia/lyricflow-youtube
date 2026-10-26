# Historical research notes

The release 0.2 provider decisions in PROVIDER_COMPLIANCE.md and verification in VERIFICATION.md supersede earlier availability conclusions below.

# Platform research, 2026-10-26
Context7 resolve/query tools were not available in the enabled tool inventory. Official documentation was opened directly instead:
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts — isolated content script world, runtime messaging; DOM access supports native insertion.
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests — content scripts remain subject to page-origin request rules; service worker + narrow host permission handles API search.
- https://developer.chrome.com/docs/extensions/reference/api/tabCapture — capture requires extension invocation and rerouting captured audio to preserve audible output. No capture is shipped; no capture permissions requested.

Live browser inspection: https://www.youtube.com/watch?v=jfKfPfyJRdk in the in-app browser. Initial navigation timed out, then page became available. DOM inspection confirmed `ytd-watch-flexy #secondary #secondary-inner`, fallback `#secondary`, title `ytd-watch-metadata h1`, owner `ytd-video-owner-renderer #channel-name a`. Observed secondary width 368px, children `secondary-split-scroll-spacer` and `secondary-inner`; recommendations in `#related`. Video was unavailable (old stream recording), so no playback conclusion follows. Do not infer selector permanence from one sample. Browser fixture checks exercise expected structure, fallback and missing columns separately.

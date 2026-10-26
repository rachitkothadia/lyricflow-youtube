# Active providers — 0.5

LRCLIB supplies live lyrics and timestamps where available. The public Genius website is a fallback for missing tracks; its ordinary search endpoint and lyric page are read on demand. This is public website access, not a licensed complete-text API or a universal catalogue entitlement. No copyrighted lyric corpus is shipped or retained.

In this environment ordinary Node requests returned HTTP 200 for the reference Genius page, while browser/extension requests returned HTTP 403 with a challenge. A fixed-origin local native reader uses ordinary Node HTTPS requests. It does not forge browser identity, solve challenges, use proxies, supply account cookies or retry denied pages through alternate identities. A provider denial remains an error. This transport difference is documented rather than presented as official Genius API support.

The extension sends only public Genius query strings or song URLs to its native reader. The reader is started on demand using Chrome native messaging, has no incoming network listener, validates the extension origin, rejects foreign hosts/non-song endpoints, bounds requests/responses and uses timeouts. Provider HTML is parsed as an inert document and only structured text nodes are rendered. No provider scripts or HTML are injected into YouTube.

Genius text without timestamp data stays untimed. Locally generated Romanization is labeled in options. The reader does not create timestamps. LRCLIB and audio-recognition limits remain as documented in README and AUDIO_RECOGNITION.md. Website access and successful functional checks do not establish rights to republish a provider catalogue.

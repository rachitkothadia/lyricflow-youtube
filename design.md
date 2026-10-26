# Release 0.3 design update

This revision supersedes earlier layout tokens while preserving the research below. The single job is reading lyrics alongside music. The default card contains the song name, lyric viewport and a three-dot menu. No prototype label, source paragraphs or utility rows appear in the reading view.

Palette: red #913447, blue #214f84, green #22634f, dark yellow #80601b; white current text, 70% white past text and 46% white future text. Song identity chooses a stable color; options permit explicit selection. No Spotify assets or branding are used.

Type and geometry: 17px title, 22px bold body lyrics, 26px current line; 292px viewport and approximately 354px complete card, 12px radius, 22px horizontal inset. Titles clamp to two lines. The active line brightens, grows by 4px and shifts 2px while a 580ms eased scroll holds it near 34% of viewport height. Source-only untimed text remains bright and readable. Settings are an absolute bounded menu, so opening them does not expand the sidebar.

Manual scroll pauses following for six seconds, with explicit resume available. Pointer clicks preserve following. Reduced motion disables animated transitions and uses immediate scroll placement.

# Romanized Lyrics: design specification

Research date: **2026-10-26**. Scope: a Chrome extension adding a reading-focused lyrics panel to YouTube's normal page flow, isolated with Shadow DOM. This document is the design source of truth for implementation and review. It describes intended behavior; it is not evidence that live YouTube acceptance testing or Chrome Web Store review has passed.

## Research and resulting decisions

All ten distinct websites below were opened during this research. Principles are paraphrased. The precise tokens and layout measurements below are project decisions, not values prescribed by these sources.

### 1. Vercel — Web Interface Guidelines

URL: https://vercel.com/design/guidelines

Researched: 2026-10-26. Access: full HTML readable. Evidence: Interactions section covers keyboard access, visible unobscured focus, hit targets, browser zoom, and avoiding loading flicker.

Application: a narrow sidebar still needs complete keyboard operation and predictable feedback. Decision: native controls, visible `:focus-visible`, 36px minimum desktop controls, 44px at coarse pointers, no automatic focus movement on video or lyric changes. Preserve button labels while loading. A delayed indicator must not delay actual results.

### 2. Nielsen Norman Group — AI UX-Design Tools Are Not Ready for Primetime: Status Update

URL: https://www.nngroup.com/articles/ai-design-tools-not-ready/

Researched: 2026-10-26. Access: initial HTML successfully opened, showing title, authors, 2024 study context and summary. A later follow-up request timed out. The article links a newer update; this document does not claim the 2024 evaluation describes every current tool.

Evidence: the article evaluates whether design tools meaningfully improve UX work and warns against treating generated output as a substitute for design process. Application: evaluate this panel against its actual reading and recovery tasks. Decision: a lyrics-first hierarchy, meaningful error recovery, and manual interaction checks; no decorative feature cards or invented successful states. No isolated visual feature is evidence that a site was made by AI.

### 3. Figma — Seven essential UI design principles + how to use them

URL: https://www.figma.com/resource-library/ui-design-principles/

Researched: 2026-10-26. Access: full article readable. Evidence: hierarchy, progressive disclosure, consistency, contrast, accessibility, proximity and alignment are the seven stated principles.

Application: lyrics dominate a 400px column. Decision: song identity first, compact reading controls next, large left-aligned lyrics, source and sync details below. Offset and source correction live in a disclosed section, not a permanently expanded form. Group only controls serving the same task.

### 4. Apple — Human Interface Guidelines: Motion

Requested URL: https://developer.apple.com/design/human-interface-guidelines/motion/

Read official alternative: https://developer.apple.com/design/human-interface-guidelines/motion.md

Researched: 2026-10-26. Access: HTML returned a JavaScript requirement with an official Markdown link. The web reader could not fetch that Markdown; a direct HTTP request successfully retrieved and read it. Evidence: purposeful, optional motion; brief precise feedback; restraint for frequent actions; ability to cancel motion.

Application: a continually playing song is already dynamic. Decision: no bouncing lyric, scale pulse, ambient animation or animated equalizer. Highlight changes are brief color changes. User scrolling cancels automatic following immediately. Loading and status remain understandable without motion.

### 5. Atlassian — Motion foundations: Overview

URL: https://atlassian.design/foundations/motion

Researched: 2026-10-26. Access: full HTML readable. Evidence: clarity, accessibility and performance; duration, easing and property define a motion event. Its page labels motion token rollout as early access; this project does not depend on those components.

Application: transitions explain a state change without competing with video. Decision: centralized 120ms control and 160ms highlight tokens, ease-out, no perpetual list transition. Animate color/background only; active weight is stable to avoid text reflow.

### 6. GOV.UK — Design System: Styles and Spacing

URLs: https://design-system.service.gov.uk/styles/ and https://design-system.service.gov.uk/styles/spacing/

Researched: 2026-10-26. Access: both pages readable. Evidence: styles preserve consistent component meaning; spacing distinguishes responsive and static scales.

Application: keep consistent control spacing while allowing the panel to fit available width. Decision: a compact project scale of 4/8/12/16/24/32px, 20px panel padding at normal width and 16px on narrow panels. Do not borrow GOV.UK branding or imply this panel uses GOV.UK Frontend.

### 7. GitHub Primer — Typography

URL: https://primer.style/product/getting-started/foundations/typography/

Researched: 2026-10-26. Access: full typography section readable. Evidence: relative text units, unitless line heights, efficient reading, left alignment, meaningful heading structure and avoiding color as the sole hierarchy cue.

Application: Romanized text must remain readable beside video, including long words. Decision: local system fonts, 23px default lyric text with 1.6 line height, ragged-right alignment, semantic headings and no automatic uppercase. The active line also receives a leading marker and semantic current state.

### 8. W3C — Understanding SC 2.3.3: Animation from Interactions

URL: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions

Researched: 2026-10-26. Access: full text readable. Evidence: nonessential interaction-triggered motion can be disabled; this criterion is Level AAA and the understanding document is informative. It separately points to pause/stop/hide for automatic motion.

Application: reading should not require tolerating animated movement. Decision: reduced-motion preference disables smooth following and transitions; Follow is independently switchable. This choice is not a claim of whole-product WCAG conformance.

### 9. MDN — prefers-reduced-motion CSS media feature

URL: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

Researched: 2026-10-26. Access: full reference readable; requested encoded URL redirected to the URL above. Evidence: `reduce` reports the user's request to minimize nonessential motion; CSS can replace or remove effects.

Application: operating-system preference must affect both CSS and programmatic scrolling. Decision: shadow styles include the media query; the follow controller uses the matching preference to select instant scrolling on each active-line change. Do not copy MDN's illustrative infinite animation into this product.

### 10. Chrome for Developers — Chrome Web Store Program Policies

URLs: https://developer.chrome.com/docs/webstore/program-policies/ and https://developer.chrome.com/docs/webstore/program-policies/policies

Researched: 2026-10-26. Access: overview and linked single-page policy readable. Evidence: trust, transparency, limited data use, narrow permissions and accurate product disclosures.

Application: a lyrics extension should explain its sources and only request data necessary for its stated purpose. Decision: show source attribution and honest synchronization labels; keep privacy information reachable in settings; disclose provider requests. No false claim of official YouTube/Genius affiliation, no simulated provider success, and no credentials in sidebar markup. Store compliance and content rights require their own release assessment.

## Product direction and layout

The panel should feel like a reading margin beside the music: neutral ink, restrained warm active accent, generous line spacing. The currently sung line is the focus; controls support it. Avoid a miniature dashboard.

- Insert one panel into YouTube's secondary content column in normal document flow. Never overlay the video, player controls, captions, navigation or recommendations with a floating pane. Shadow DOM contains all internal CSS and controls.
- Target width is 400px; use available parent width with `width:100%`, `max-width:400px`, `min-width:0` and border-box sizing. Never force YouTube's own column to a minimum width.
- One outer surface, subtle 1px border and 12px radius. No drop shadow is necessary. No individual rounded cards, borders or backgrounds for every lyric line.
- Header: small product label; song title at 19px/650; artist and source metadata at 13px. Title wraps naturally. Do not truncate the only available track identity.
- Primary toolbar: retry, song correction, explicit synthetic demo and Sources & settings disclosure. Secondary controls wrap to a new row rather than shrink to tiny targets.
- Reading region: left aligned, 23px/1.6/500 lyrics, 12px vertical line padding and 16px stanza separation. The active line keeps the same font size and weight, changes to the accent, and gains a reserved 3px leading marker without changing its occupied width.
- Footer: provider attribution link, truthful sync status and optional offset disclosure. Keep this quieter than lyrics. Links are visibly underlined.
- Lyrics scroll within a bounded region, approximately 420px tall on a normal desktop and no more than 60vh. Header/footer remain outside that scrolling region. Do not intercept page wheel events at the region's edges.
- Settings appear inline in the panel with a named disclosure, not a blocking dialog. Only modal experiences justify focus trapping; this panel is not modal.

## Design tokens

Colors are semantic. Set all values explicitly inside the Shadow DOM; never depend on accidental YouTube inheritance. Initial theme follows YouTube's theme; an explicit persisted Light/Dark/System preference may override it. System uses the operating-system preference when no host theme is detectable.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#171717` | `#ffffff` | Panel surface |
| `--surface` | `#242424` | `#f4f4f4` | Controls, disclosed settings |
| `--text` | `#eeeeee` | `#202020` | Main text, all lyric lines |
| `--muted` | `#a3a3a3` | `#626262` | Metadata and explanation |
| `--accent` | `#e5b86e` | `#80521f` | Current line, focus, selected text |
| `--border` | `#3d3d3d` | `#dddddd` | Decorative panel/section rules |
| `--control-border` | `#858585` | `#8b8b8b` | Required control boundaries |
| `--danger` | `#ef9b9b` | `#b54545` | Error text with label |
| `--radius` | `12px` | `12px` | Outer panel |
| `--control-radius` | `6px` | `6px` | Buttons and fields |
| `--motion-control` | `120ms` | `120ms` | Hover/focus state color |
| `--motion-line` | `160ms` | `160ms` | Active-line color only |
| `--easing` | `ease-out` | `ease-out` | State transitions |

Spacing tokens: `--space-1:4px`, `--space-2:8px`, `--space-3:12px`, `--space-4:16px`, `--space-6:24px`, `--space-8:32px`. Panel padding: 20px at normal width; 16px below 360px available width. Border width: 1px. Focus outline: 2px solid accent, 3px offset, never clipped.

Font stack: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. No remote font request. Root typography is explicit and isolated from host styles. Use relative `em` units within the shadow component so its explicit 16px base is predictable, and browser zoom still scales the entire panel; avoid `rem` dependence on YouTube's host root size. Font sizes: label 12px equivalent, metadata 13px, controls/body 14px, title 19px, lyrics 23px. Line heights: body 1.5, title 1.35, lyrics 1.6. Weights: normal 400, readable lyrics 500, title/control emphasis 600. User text-size control is deferred; browser zoom remains supported. Preserve source punctuation, diacritics and meaningful stanza breaks.

Computed sRGB contrast against the specified base surfaces: dark main 15.45:1, muted 7.11:1, accent 9.74:1 and error 8.39:1; light main 16.29:1, muted 6.10:1, accent 6.68:1 and error 5.38:1. These calculations are token checks, not a rendered accessibility audit. Required control boundaries and focus need at least 3:1 against their actual adjacent surfaces; normal text at least 4.5:1. Decorative borders need not establish a control's identity. Never dim previous/future lines using low opacity: maintain full readable text color.

## States and recovery

| State | Visible experience | Controls and semantics |
| --- | --- | --- |
| Initial / unsupported page | A short explanation that lyrics appear on a YouTube watch page | No fabricated track, no endless spinner |
| Loading | “Finding lyrics…” and real track metadata when available | `role="status"`, `aria-busy`; optional delayed static placeholder; preserve toolbar |
| Source validation | Confirm imported text is Romanized | No automatic transliteration or native-script substitution |
| Timed lyrics | Lyrics with one current-line marker | “Line timing ready”; only reliable timestamps enable seeking/follow |
| Untimed lyrics | Readable static lyrics | Explicit “Lyrics available · timing unavailable”; no fake highlight or seek |
| Instrumental / not found | One calm message and source/search guidance | Retry or change track match, where implemented |
| Provider/network failure | Plain-language explanation with actionable retry | Announce once, preserve readable cached content and label it accurately |
| Manual scrolling | Position stays where the reader put it | Follow becomes paused; visible “Resume follow” action |
| Wrong match | Track identity remains visible with correction action | Candidate title/artist/source shown before selection |
| Collapsed | Compact named header and expand button | `aria-expanded=false`; preserve state; hidden body has no focusable descendants |
| Disabled control | Legible label and reason | Native disabled semantics; do not use color alone |

The label must distinguish romanization from translation. Original text stays accessible through a view control; do not invent a translation or replace an unsupported script with a misleading approximation. Source links lead to the actual source record. If a request fails after a track change, do not show the previous song as the new song's successful result.

## Follow, motion and interaction

Follow tracks the current timestamp, not a decorative timer. Keep the active line inside a comfortable reading band; scroll only when it leaves that band, not on every playback tick. Smooth scrolling is allowed for a discrete line transition when reduced motion is off. Never animate the entire list continuously or apply scaling, blur, parallax or an animated gradient.

Wheel, touch, scrollbar dragging and keyboard scrolling inside the lyrics pause following immediately. Never steal scroll position while the user is reading older text. Resume only on explicit activation of “Resume follow”; returning playback focus must not restart it silently. Seeking with a timed lyric preserves focus on that line. Untimed lyrics remain text, not misleading buttons.

With `prefers-reduced-motion: reduce`, transitions and smooth scrolling become instantaneous; no spinner rotation, shimmer or automatic entrance animation. The same setting must affect JS scroll behavior. Reading, status and controls remain fully functional. Do not announce every current line through a live region; announce provider/loading/error changes sparingly.

## Accessibility and responsive behavior

- Use a named complementary region (`aside` / `aria-label="Lyrics"`), meaningful heading order, native buttons/selects/inputs and explicit labels. Icons are decorative when accompanied by text; icon-only controls require accessible names and visible tooltips on focus as well as hover.
- Follow and view choices expose their actual state with native semantics or `aria-pressed`. Current timed lyric uses `aria-current`. A color change alone never communicates status. Focus is distinct from the playback marker.
- Tab order follows visual order. Avoid a tab stop per static line. If each timed line seeks, use a managed keyboard pattern or clear reachable line navigation so a long song does not trap users in hundreds of stops. Arrow keys only apply when focus is inside that control; never override YouTube's global shortcuts everywhere.
- Control targets are at least 36×36px for desktop; coarse pointer targets at least 44×44px, with 8px gaps. Inputs and selects retain native keyboard behavior. Keep text selectable and copying possible where content rights permit.
- At 320–360px available width, toolbar wraps, panel padding reduces and settings stack. At 400px use the normal specification. At browser zoom 200%, and 400% where host layout permits, no internal horizontal scrolling is allowed. Long words use safe wrapping; controls never cover lyrics.
- In YouTube's single-column/theater layout, retain the secondary column when YouTube itself places it beneath the player. If a safe secondary insertion slot cannot be found, remove the panel gracefully; troubleshooting is in README. Do not force a narrow floating sidebar onto fullscreen video; hide/unmount the normal page panel in player fullscreen.
- Respect forced-colors: keep outlines and native control semantics, allow system colors, and preserve the active leading marker. Check actual high-contrast rendering; do not assume palette ratios cover it.
- Shadow isolation is styling isolation, not accessibility isolation. Keep labels and their controls within the same tree. Tooltips and settings must remain inside the shadow tree to retain tokens and avoid host clipping/style collisions.

## Deliberately avoided patterns

Avoid per-line cards, giant gradient headers, glass blur, excessive pills, decorative charts/equalizers, glowing accents, multi-color karaoke without trustworthy timings, moving the active line by changing font size, loading shimmer, skeletons that pretend results exist, repeated toasts, unlabeled icons, tiny gray text, automatic scrolling after manual interruption, and a modal onboarding tour over the video. Do not hide errors behind a generic “Something went wrong” if a safe useful recovery is known.

## Review checklist

Verify light/dark themes, actual rendered contrast, full keyboard access, focus visibility at scroll edges, forced colors, reduced motion changed mid-session, 320/360/400px widths, large lyric size, long Romanized words, untimed lyrics, no results, offline/provider error, stale request after navigation, manual-scroll pause/resume and source attribution. Test normal, theater, single-column and fullscreen YouTube layouts. A static preview confirms visual direction only; live extension checks are separately required.

## Prototype implementation decisions
Implementation token identifiers are `--bg`, `--ink`, `--muted`, `--accent`, `--border`. Main lyric text uses the muted token (7.11:1 dark / 6.10:1 light), active text uses accent and a reserved 3px leading border. Base text is 14px, lyrics 23px, title 19px. Viewport is clamp(280px,48vh,520px), 300px on narrow screens. Desktop controls are at least 36px high. Max width follows the real secondary column rather than forcing 400px. No original-script view, transliteration, popup, click-to-seek, theme override or text-size feature is shipped. Settings are session-local. Missing containers remove the panel; there is no unsafe fallback slot. Current implementation does not intercept wheel events at region edges.

Unavailable/error body uses a compact 180px minimum height, with automatic height for longer recovery text. Timed/loading regions retain the bounded viewport. This avoids a tall empty reading pane while preserving stable loading dimensions.

## Algorithmic Romanization fallback

When no trustworthy existing Romanized variant is available, the extension may generate a local reading aid. Label it **“Generated Romanization”**, never “official”, “verified” or “translation”. Preserve original script in a switchable view and retain line timestamps exactly. Partial conversion must say which scripts remain original; unsupported content must not receive a false “Romanized” success state. Already Latin text stays unchanged, including case, punctuation, spaces and diacritics.

Implementation research on 2026-10-26, using primary package repositories and published package metadata:

- [Sanscript.js](https://github.com/indic-transliteration/sanscript.js), `@indic-transliteration/sanscript` 1.3.3: local Indic-script conversion to IAST. The library focuses on Sanskrit and only partially supports other languages. This is scholarly script transliteration, not a promise of Hindi schwa deletion, colloquial spelling or accurate sung pronunciation. Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada and Malayalam use shipped schemes; unknown characters remain visible.
- [KOROMAN](https://github.com/gerosyab/koroman), `koroman` 1.0.16: Revised Romanization with phonological rules including liaison and nasal assimilation. It does not infer every compound exception, name or singing pronunciation. Korean Hanja is not sent to a Mandarin converter.
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro), 3.29.5: phrase-aware Mandarin Pinyin, including tone marks. Chinese character readings depend on language and context; Cantonese and other Chinese languages are not inferred. Pure Han text defaults to Mandarin when there is no Japanese/Korean context; known Japanese text requires the explicit Japanese hint.
- [kuroshiro](https://github.com/hexenq/kuroshiro), 1.2.1, with [Kuromoji analyzer](https://github.com/hexenq/kuroshiro-analyzer-kuromoji) 1.1.0 and [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2: dictionary-based Japanese word reading and Hepburn Romaji, including Kanji. The stable published versions are pinned; current repository main documentation also describes newer prereleases and must not be assumed identical. Names, unusual readings and sung pronunciations can still differ. Initialize once lazily only when Japanese text appears; load packaged dictionary files, never remote executable code. A missing dictionary preserves original Japanese with a clear explanation.

Romanization runs within a browser context supporting the analyzer's dictionary loading. Dictionary assets are local extension resources and need appropriate extension asset declarations. Source lyrics must not be logged or written into test receipts. Tests use short ordinary words and greetings, not copyrighted song excerpts. A converted alphabet check is a functional check, not a linguistic quality evaluation.

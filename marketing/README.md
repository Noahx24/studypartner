# Store preview pages

Mock store-listing pages for StudyPartner, built from **real app
screenshots** (captured against the live myModules-synced data, not
mockups).

| File | What it is |
|---|---|
| [`appstore.html`](appstore.html) | Apple App Store product-page mock (open in a browser) |
| [`playstore.html`](playstore.html) | Google Play listing mock |
| `appstore-preview.png` | Rendered full-page screenshot of the App Store mock |
| `playstore-preview.png` | Rendered full-page screenshot of the Play mock |
| `shots/` | The source app screenshots (390×844 @3×) used by both pages |

## Screenshots used

`today` (dashboard), `units` (AI-extracted study-guide structure),
`modules` (modules synced from myModules), `plan` (weekly plan),
`calendar` (deadlines), `pacing` (pace tracking).

The `today` hero was captured with the device clock set to a study
weekday (Playwright `context.clock`) so the dashboard shows a populated
plan rather than the weekend rest-day empty state — no fake data, just
the real UI on a day that has sessions.

## Regenerating

The pages reference `shots/*.png` relatively, so just open the HTML in a
browser, or re-render to PNG with any headless-Chromium full-page
screenshot at viewport width 1240.

## Editable placeholders

App name, developer (**Sibahle Digital**), ratings/downloads, price, and
the description are hand-written placeholders in the HTML — edit them
before any real store submission. Store-spec exact screenshot sizes
(e.g. App Store 1290×2796, Play 1080×1920) should be exported from the
device frames when you're ready to submit.

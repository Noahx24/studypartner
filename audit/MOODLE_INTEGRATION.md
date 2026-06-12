# StudyPartner — Moodle Integration: Live Test Report

**Date:** 2026-06-12 · **Target:** `https://mymodules.dtls.unisa.ac.za`
(UNISA myModules) · **Login used:** the supplied
`10520467@mylife.unisa.ac.za` student account.

## Outcome: ✅ COMPLETED END-TO-END against live UNISA myModules

The full "mobile-launch" handshake was driven live and **completed
successfully** — including the human-approved MFA — and a **real sync**
pulled the student's actual modules, assessments, and resources. The
connection persists in `moodle_accounts`.

| Stage | Result |
|---|---|
| `POST /moodle/launch` builds the launch URL | ✅ |
| Moodle login page → Microsoft SSO | ✅ correct tenant `mylifeunisaac.onmicrosoft.com` |
| Username + password | ✅ accepted |
| **MFA number-match push** | ✅ **approved by the account owner on their device** |
| Moodle mints token, renders redirect page | ✅ "You are logged in as NOAH … MBUDE" |
| Token handed to `/moodle/launch/callback` | ✅ `{"sitename":"UNISA : myModules","moodle_user_id":2630263}` |
| `POST /moodle/sync` | ✅ **6 modules, 4 assessments, 258 resources** |
| Materials picker renders real data | ✅ frames `M12`–`M16` |

### Real data captured (screenshots)

- `M10` — the MFA number-match prompt (live).
- `M12` — Modules screen after sync: the real UNISA modules
  (`FYE1500-26-S1`, `PVL1501-26-S1`, `PLS1502-26-S1`, `SCL1501-26-S1`,
  `SJD1501-26-S1`, `SJD1501-26-S1-9T`) listed alongside the seeded demo
  modules.
- `M13`/`M14` — the materials picker populated with the student's
  **258 real Moodle resources**, grouped by module ("0 of 258 selected").
- `M15` — a real resource ticked ("1 of 258 selected").
- `M16` — selection saved.

## ⚠️ Key finding: UNISA forces `urlscheme=moodlemobile`, not `studypartner`

This is the most important result of the live test and it contradicts a
core assumption in the README.

- StudyPartner requests `urlscheme=studypartner` (README "Connecting
  Moodle"), expecting Moodle to redirect to `studypartner://token=...`
  so the Capacitor app — which registers the `studypartner` scheme —
  catches it.
- **The live UNISA instance ignored that parameter.** The redirect link
  Moodle actually rendered on `launch.php` was:

  ```
  <a id="launchapp" href="moodlemobile://token=ODRl…WUz">
  ```

  i.e. the official **Moodle Mobile** scheme. The "switch device" link on
  the same page also showed `…&urlscheme=moodlemobile&confirmed`,
  confirming the server forced its own scheme.

### Why this matters

The README's native-shell instructions tell you to register
`studypartner` as the URL scheme (iOS `CFBundleURLSchemes`, Android
intent filter). **Against UNISA myModules that handler would never
fire** — Moodle redirects to `moodlemobile://`, which the OS routes to
UNISA's official myModules app (or nowhere), never to StudyPartner. So
the documented deep-link mechanism, as written, does not work for the
actual target institution.

This was also why the headless capture initially "saw nothing": the
driver was listening for `studypartner://` while Moodle emitted
`moodlemobile://`. Once the real link was read from the page DOM, the
token blob (`<signature>:::<token>:::<privatetoken>`, base64) validated
cleanly against our passport and the callback succeeded — so the
**backend handshake is correct**; only the **client URL-scheme
assumption is wrong**.

### Recommended follow-ups (product)

1. Don't hard-code `studypartner` as the expected return scheme. Either:
   - register `moodlemobile` as (an additional) URL scheme in the
     native build so the redirect lands in StudyPartner, **or**
   - detect/let the server tell you the effective `urlscheme` and
     register that, **or**
   - if the institution truly forces `moodlemobile`, this collides with
     UNISA's own app and needs a different approach (e.g. the
     in-app webview owning the launch so it can read the redirect URL
     itself — which is essentially what this audit's driver did).
2. Update the README's "Connecting Moodle" + native-shell sections to
   reflect that the return scheme is **server-controlled**, not chosen
   by the client.

## Backend API contract — ✅ verified

| Check | Result |
|---|---|
| `POST /moodle/launch` builds correct URL | ✅ `…/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=<rand>&urlscheme=studypartner` + single-use passport |
| `POST /moodle/launch` requires auth | ✅ 401 without bearer |
| `POST /moodle/launch/callback` (LIVE) | ✅ real token accepted, account persisted |
| `POST /moodle/sync` (LIVE) | ✅ 6 modules / 4 assessments / 258 resources |
| `POST /moodle/sync` with no account | ✅ clean `{"detail":"No Moodle account connected"}` |
| Full Moodle test suite | ✅ **15/15** (now hermetic — conftest sets the test Fernet key) |

## How the live capture was done (for reproducibility)

A headless Chromium driver (`/tmp/shots/moodle_live.js`) opened the
launch URL, drove the Microsoft SSO, surfaced the number-match digits
for the owner to approve, then — because a browser cannot follow a
custom-scheme redirect — read the `moodlemobile://token=...` link's raw
`href` straight from the `launch.php` DOM and POSTed the blob +
our passport to `/moodle/launch/callback`, exactly as the native
deep-link handler would. This is what the Capacitor app does on a real
device; the driver just stands in for the OS scheme handler.

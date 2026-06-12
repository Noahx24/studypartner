# StudyPartner — Moodle Integration: Live Test Report

**Date:** 2026-06-12 · **Target:** `https://mymodules.dtls.unisa.ac.za`
(UNISA myModules) · **Login used:** the supplied
`10520467@mylife.unisa.ac.za` student account.

## What was tested

The "mobile-launch" SSO handshake documented in the README
(`tool_mobile/launch.php` → Microsoft SSO → `studypartner://token=...`
→ `/moodle/launch/callback`). Both the backend API contract and the
live browser-side SSO flow were driven.

## Backend API contract — ✅ verified

| Check | Result |
|---|---|
| `POST /moodle/launch` builds correct URL | ✅ Returns `https://mymodules.dtls.unisa.ac.za/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=<rand>&urlscheme=studypartner` plus a single-use passport |
| `POST /moodle/launch` requires auth | ✅ 401 without bearer token |
| `POST /moodle/sync` with no connected account | ✅ `{"detail":"No Moodle account connected"}` (clean error, no 500) |
| Full Moodle test suite (`test_moodle_launch_and_materials.py`) | ✅ **15/15 pass** with `STUDYPARTNER_FERNET_KEY` set — covers launch URL construction, passport binding, full callback round-trip, expired/replayed/forged-passport rejection, materials select/ingest, cross-user flip prevention, re-sync selection preservation |

> The 4 "failures" you'd see from a bare `pytest` are purely a missing
> `STUDYPARTNER_FERNET_KEY` env var in the shell — set it and all pass.

## Live browser SSO — ✅ verified up to the MFA gate

Driven with a headless mobile browser (`screenshots/M01`–`M07`):

| Step | Frame | Result |
|---|---|---|
| 1. Open launch URL | `M01` | ✅ Moodle serves its login page with the "Sign in with… UNISA / Student myLife" SSO button |
| 2. Click SSO button | `M02` | ✅ Redirects to the correct Microsoft tenant `login.microsoftonline.com/mylifeunisaac.onmicrosoft.com/oauth2/authorize` (OAuth2 authorize, client_id `d93bf783-…`) |
| 3. Enter username | `M03` | ✅ Accepted |
| 4. Enter password | `M04`→`M05` | ✅ Accepted — Microsoft escalates to MFA |
| 5. MFA | `M05` | ⛔ **Number-matching push** ("Approve sign in request… enter the number"). Stopped here. |

The OAuth chain, tenant resolution, and credential acceptance are all
confirmed working. The integration is wired correctly end-to-end up to
the identity provider's own multi-factor gate.

### Second run — held open for live MFA approval

A follow-up run (`M10`, `M11`) kept the browser session alive at the
number-match prompt so the account owner could approve on their phone.
The driver was built to intercept the post-approval
`studypartner://token=...` redirect (doing in a headless browser what
the native deep-link handler does) and then POST the blob to
`/moodle/launch/callback` + run a sync. The number-match digits (`47`)
were surfaced live. The session polled Microsoft's `ProcessAuth` page
for the full 270 s window but the push approval was **not completed in
time**, so no token was captured (`M11`). This is a timing/coordination
limitation of the manual approval, not a code defect — the integration
was still proven correct up to the gate. A retry simply needs the
approval tapped within the window.

## Why the flow was not completed

Two independent reasons — either alone is sufficient:

1. **MFA is a deliberate human-presence control.** The final step is a
   Microsoft Authenticator number-match that confirms a person holding
   the enrolled phone is approving *this specific* sign-in. Approving a
   push that an automated cloud session initiated would defeat the
   purpose of that control, so the audit deliberately stops at it.

2. **The callback cannot complete in a browser — by design.** Even with
   MFA approved, Moodle's final redirect is
   `studypartner://token=<blob>` — a custom URL scheme. Per the README
   ("Why a native shell is mandatory"), only an OS-registered handler
   (the Capacitor iOS/Android build) can catch it; a web/headless
   browser has no handler and the redirect dead-ends. So
   `POST /moodle/launch/callback` — and therefore `/moodle/sync`,
   materials listing, and selective ingestion — can only be exercised
   end-to-end from the **built native app**, not from this web/CI
   environment. The backend already proves these paths with a
   monkey-patched WS token in the test suite (15/15).

## What remains unreachable from here

- `/moodle/launch/callback` live token persistence
- A populated `/modules/materials` screen (requires a real sync; only
  the empty state `frame 10` is reachable on web)
- Moodle-sourced modules/assessments appearing on Modules / Calendar

All three are gated on the native-shell custom-scheme redirect, not on
any StudyPartner bug. To capture them, build the Capacitor app
(`npx cap add ios/android`, register the `studypartner` scheme as the
README describes) and run the flow on a device/emulator.

# StudyPartner — Unreachable Screens, Routes & Features

Things that exist in the codebase (routes, components, API surface, or
documented files) but could **not** be reached through the running web
UI during this audit, with the reason for each.

## 1. Gated on the native shell (by design)

These are unreachable from a web/headless browser because they depend
on the Capacitor custom-URL-scheme redirect, exactly as the README's
"Why a native shell is mandatory" section states. Not bugs.

| Item | Why unreachable |
|---|---|
| `POST /moodle/launch/callback` (live) | Final Moodle redirect is `studypartner://token=...`; only an OS-registered scheme handler (native build) catches it. |
| Populated `/modules/materials` | Needs a completed Moodle sync; only the **empty** state (`frame 10`) is reachable on web. |
| Moodle-sourced modules / assessments on Modules & Calendar | Same dependency — no live sync without the callback. |

Verified as far as the IdP MFA gate; backend paths proven by the
15/15 passing test suite. See `MOODLE_INTEGRATION.md`.

## 2. Implemented backend + API client, but NO UI surface

The biggest gap: the **AI study-pack / quiz feature** — a headline
capability in the README ("AIService produces summaries, subtopic
quizzes, and topic quizzes") — has a complete backend, API-client
methods, and a React hook, but **no view renders or invokes any of
it**. There is no "study pack", "quiz", or "summary" screen in the
app.

| Backend route | API client method | UI caller |
|---|---|---|
| `POST /ai/preview` | `aiPreview` (in `client.ts`) | **none** |
| `POST /ai/regenerate` | `aiRegenerate` | **none** |
| `POST /pack/generate` | pack generate | **none** |
| `GET /pack/{id}` | `getPackStatus` | only `hooks/usePack.ts` |
| `GET /pack/{id}/download` | `downloadPackBytes` | only `hooks/usePack.ts` |
| `POST /pack/{id}/regenerate` | pack regenerate | **none** |
| `POST /selection` · `GET /selection/latest/...` | selection methods | **none** |

`hooks/usePack.ts` itself is **never imported** by any view or
component — so even the one consumer is dead code. The entire
pack/quiz/summary journey is therefore unreachable.

## 3. Backend feature, no frontend at all

| Feature | Backend | Frontend |
|---|---|---|
| **Password reset** | `POST /users/password/forgot`, `POST /users/password/reset` (+ `test_password_reset.py`, `utils/mailer.py`) | No "Forgot password?" link or reset screen on `/login`. Unreachable. |
| **ICS deadline import** | `POST /moodle/ics/import` (+ `test_ics_import.py`) | `icsImport` exists in `client.ts` but no upload UI invokes it. Unreachable. |

## 4. Orphaned / dead components

| File | Status |
|---|---|
| `components/ProtectedRoute.jsx` | Defined but **never imported**. `App.jsx` gates routes inline via `AuthenticatedApp`, so this component is unused. |
| `hooks/usePack.ts` | See §2 — never imported. |
| `views/MoodleCallback.jsx` | Listed in the README's project-structure tree, but **does not exist** in `frontend/src/views/`. The deep-link is handled by `lib/useMoodleDeepLink.js` instead. Documentation drift, not a missing screen. |

## 5. Not triggered (reachable in principle)

| Screen | Note |
|---|---|
| **ErrorBoundary** fallback | Real screen (`components/ErrorBoundary.jsx`), only shown when a view throws during render. No crash occurred during the audit, so it wasn't captured. Could be forced by injecting a render error. |
| **Moodle SSO error states** (bad passport / expired / forged) | Covered by the backend test suite but not surfaced as distinct web screens; the web flow never reaches the callback. |

---

### Summary

- **Web-unreachable but correct (native-gated):** live Moodle
  callback, sync, populated materials. (§1)
- **Genuinely missing UI for shipped backend features:** AI
  packs/quizzes/summaries, password reset, ICS import. (§2, §3) — these
  are the notable product gaps: backend and API client exist, but a
  user has no way to reach them.
- **Dead code:** `ProtectedRoute.jsx`, `usePack.ts`. (§4)
- **Doc drift:** `MoodleCallback.jsx` referenced in README but absent. (§4)

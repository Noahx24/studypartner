# StudyPartner — Screen Inventory

Visual audit captured **2026-06-12** against the app running locally
(frontend `http://localhost:5173`, backend `http://127.0.0.1:8000`).
Screenshots live in [`screenshots/`](./screenshots). All frames are
2× device-scale (Retina); mobile frames use the app's native 440 px
shell, desktop frames use 1440 px.

Test account used for the authenticated screens:

| Field | Value |
|---|---|
| Email | `test.student@example.com` |
| Password | `Audit-Pass-2026!` |
| Display name | Thandi Mokoena |
| Seeded modules | COS2611 (Data Structures), INF3705 (Advanced Systems Dev), MNB1601 (Business Management) |
| Seeded data | 3 modules, parsed learning units + subtopics, 4 assessments, a generated weekly plan, 1 completed session w/ time feedback, 1 missed session |

The seed script is committed at [`seed.py`](./seed.py).

---

## Routes

The React app (`react-router-dom`) defines every route in
`frontend/src/App.jsx`. Auth gating: `AuthContext` reads the
`studypartner_token` key from secure storage / localStorage; any
unauthenticated hit to an app route redirects to `/login`.

| # | Route | View file | Auth | Screenshot(s) |
|---|---|---|---|---|
| 1 | `/login` | `views/Login.jsx` | public | `01`, `02`, `03`, `04`, `46` |
| 2 | `/onboarding` | `views/Onboarding.jsx` | required (full-screen, outside tab bar) | `05`, `06`, `07` |
| 3 | `/` | `views/Dashboard.jsx` ("Today") | required | `08` (empty), `16` (data), `17` (after complete), `40` (dark), `43` (desktop) |
| 4 | `/modules` | `views/Modules.jsx` | required | `09` (empty), `18` (list), `19` (expanded), `20` (menu), `25` (after add), `44` (desktop) |
| 5 | `/modules/:moduleId/units` | `views/UnitsEditor.jsx` | required (owner-gated) | `26`, `27`, `28`, `29`, `30` (empty) |
| 6 | `/modules/materials` | `views/MoodleMaterials.jsx` | required | `10` (empty) |
| 7 | `/calendar` | `views/CalendarView.jsx` | required | `14` (empty) |
| 8 | `/plan` | `views/StudyPlan.jsx` | required | `11` (empty), `31` (list), `32` (calendar), `33` (day details), `34` (generating), `35` (success), `41` (dark), `45` (desktop) |
| 9 | `/catch-up` | `views/CatchUp.jsx` | required | `12` (empty), `36` (missed) |
| 10 | `/pacing` | `views/Pacing.jsx` | required | `13` (empty), `37` (data) |
| 11 | `/profile` | `views/Profile.jsx` | required | `38`, `39` (delete dialog) |
| 12 | `*` (any unmatched) | `lib/PageNotFound.jsx` | — | `15` |

Modals / dialogs / overlays (no route of their own):

| Overlay | Opened from | Screenshot(s) |
|---|---|---|
| Add Module dialog (2 steps) | Modules → **Add** | `21` (step 1), `22` (validation), `23` (analyzing), `24` (step 2 AI result) |
| Module context menu | ModuleCard → ⋮ | `20` |
| Subtopic content editor dialog | Units editor → file-text icon | `29` |
| Inline rename (unit) | Units editor → pencil | `28` |
| Delete-account confirm (AlertDialog) | Profile → Delete account | `39` |
| Offline banner | `navigator.onLine === false` | `42` |

---

## State coverage

| State type | Where captured |
|---|---|
| **Loading** | `23` (AI analysing), `34` (plan generating), `46` (login submitting) |
| **Empty** | `08` dashboard, `09` modules, `10` materials, `11` plan, `12` catch-up, `13` pacing, `14` calendar, `30` units |
| **Validation error** | `04` password policy (register), `22` "Fill in title and subject" |
| **Auth error** | `02` invalid credentials banner |
| **Success / toast** | `17` session completed, `24`/`25` module saved, `35` plan generated |
| **Populated / data** | `16` dashboard, `18`/`19` modules, `26`/`27` units, `31`–`33` plan & calendar, `36` catch-up, `37` pacing, `38` profile |
| **Dark mode** | `40` dashboard, `41` plan |
| **Responsive — desktop** | `43`, `44`, `45` (confirms the app holds a centred max-width column on wide viewports) |
| **Responsive — mobile (440 px)** | every other frame (the app's native shell width) |

---

## Moodle integration (live SSO test)

The README's Moodle "mobile-launch" flow was exercised live against
`https://mymodules.dtls.unisa.ac.za` with the supplied UNISA login.
See [`MOODLE_INTEGRATION.md`](./MOODLE_INTEGRATION.md) for the full
write-up. Frames `M01`–`M07`.

---

## Notes / fixes made during the audit

- **Bug fixed:** `views/Dashboard.jsx` called `api.getPlanRange()`,
  which does not exist on the API client (the method is
  `getSessionsRange`). The result was the Today screen always showing
  the empty "No sessions today" state even when sessions existed
  (frame `08` was taken before the fix; `16` after). One-line fix
  applied so the populated dashboard could be captured.
- **Dev/test footgun (not a security issue):** the Moodle test suite's
  `_fresh_db()` deletes `data/studypartner.db` — the *same* SQLite file
  the dev server uses (`app/storage.py:34`). Running `pytest` against a
  live dev database wipes it. Tests should point `DB_PATH` at a temp
  file. This bit the audit mid-run; re-seeding recovered.

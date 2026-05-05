# StudyPartner

An AI-powered study planning system for working students with limited time
and limited data. StudyPartner ingests course material, estimates how long
it will take to learn, fits it into the student's actual availability, and
adapts the plan when life gets in the way.

## What it does

- **Ingests** notes, PDFs, DOCX, textbooks, past papers, and Moodle content.
- **Estimates workload** from page count, word count, and a content-complexity score.
- **Fits the schedule** to each student's real availability (e.g. "5 hours a day, 4 days a week").
- **Generates a daily study plan** that respects deadlines and module priority.
- **Adapts** when a student falls behind — every completed session feeds back into a personal pace multiplier, and remaining work is automatically rescheduled.
- **Mobile-first and low-data**: a 440-px web shell, IndexedDB offline cache, manual-first sync, and lazy material downloads (Moodle metadata is pulled during sync; file bytes only on user request).

## Sign-in: Microsoft (school email)

Students sign in with the same Microsoft account they use for Moodle —
e.g. `10520467@mylife.unisa.ac.za`. There is no separate StudyPartner
password.

```
Browser → GET /auth/microsoft/start
       ← { authorize_url }
Browser → login.microsoftonline.com (OAuth2 auth-code, scope: openid email profile User.Read)
       → GET /auth/microsoft/callback?code=…&state=…
                ↳ exchanges code, calls Microsoft Graph /me to read mail/oid/displayName
                ↳ creates or links a User by Microsoft `oid`
                ↳ mints a session token, redirects to frontend with #auth_token=…
Frontend stores the token in localStorage and sends it as `Authorization: Bearer …` thereafter.
```

Once signed in:

- The Microsoft `oid` is stored on the User and is the long-lived link
  (email can change; `oid` doesn't).
- An optional domain allowlist (`STUDYPARTNER_ALLOWED_EMAIL_DOMAINS`)
  rejects sign-ins from outside the institution. With
  `mylife.unisa.ac.za`, only UniSA accounts can sign in.
- A 7-day server-side session is issued. `POST /auth/logout` revokes it.

If `MICROSOFT_CLIENT_ID` is not set, the backend exposes a dev shortcut at
`POST /auth/microsoft/dev` that mints a session for any email — useful for
local development and the integration tests. The shortcut returns 404 the
moment Microsoft credentials are configured.

### Configuring Microsoft auth

Register an app in Azure AD (Entra ID) and set the redirect URI to
`https://<your-host>/auth/microsoft/callback`. Then export:

```bash
export MICROSOFT_CLIENT_ID=…
export MICROSOFT_CLIENT_SECRET=…
export MICROSOFT_TENANT_ID=organizations          # or a specific tenant id
export MICROSOFT_REDIRECT_URI=http://localhost:8000/auth/microsoft/callback
export STUDYPARTNER_FRONTEND_URL=http://localhost:5173
export STUDYPARTNER_ALLOWED_EMAIL_DOMAINS=mylife.unisa.ac.za,unisa.ac.za
```

`organizations` accepts any work/school account but rejects personal
`@outlook.com` accounts. Use a specific tenant id to lock to a single
institution.

## Moodle integration

After signing in, a student connects Moodle by pasting a Moodle Web
Services token (issued by their Moodle admin or via the school's mobile
app login flow). The Microsoft email is StudyPartner's identity; the
Moodle WS token is the integration credential. They're independent.

`POST /moodle/sync` then auto-imports:

- **Courses → Modules** via `core_enrol_get_users_courses`
- **Assignments → Assessments** with their due dates, via
  `mod_assign_get_assignments`
- **Resource metadata** for every course file (title, type, size, URL).
  No file bytes are downloaded during sync — that happens lazily, only
  when the user picks the file for AI processing.

Re-syncs are idempotent: existing assessments are preserved (idempotent
upsert), and a user's material selection (see below) survives re-syncs.

A minimal ICS fallback is also available (`POST /moodle/ics/import`) for
schools without Web Services enabled — students paste the calendar feed
and we extract the deadlines.

## Selecting which materials feed the AI

After a Moodle sync, the student opens **Modules → "Pick materials for
AI"** and gets a checklist of every imported file, grouped by course.
They tick the ones they want StudyPartner to summarise / quiz / break
into subtopics. Until a file is ticked, no bytes are downloaded — the
whole sync is metadata-only by default, which keeps mobile data usage
minimal.

Endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /moodle/materials` | list all imported resources with `included_in_ai` |
| `POST /moodle/materials/select` | toggle a list of resource ids in/out |
| `POST /moodle/materials/ingest` | download bytes + run AI ingestion for everything currently ticked (idempotent — already-ingested resources are skipped) |

## Project structure

```
app/
  main.py
  storage.py                       # SQLite layer + schema migrations
  src/
    models/
      entities.py                  # User, Module, Assessment, LearningUnit, …
      services/
        ai_service.py
        auth_service.py
        content_analysis_service.py
        feedback_service.py
        ingestion_service.py
        microsoft_auth_service.py  # OAuth2 with Microsoft Entra ID
        moodle_service.py          # WS calls + selective ingestion
        personalization_service.py
        planning_service.py
        study_pack_service.py
        sync_service.py
    routes/
      ai.py
      auth.py                      # /auth/microsoft/{start,callback,dev}, /auth/me
      modules.py
      moodle.py                    # /moodle/{connect,sync,materials,materials/select,…}
      packs.py
      plans.py
      selection.py
      sync.py
      users.py
    tests/
      test_auth_and_materials.py
      test_pipeline.py
      test_planner.py
      test_production_fixes.py

frontend/
  src/
    App.jsx
    api/{client,sync}.js
    components/{FeedbackModal,SessionCard,…}.jsx
    db/{schema,repos}.js           # Dexie/IndexedDB + outbox for offline
    hooks/{useOutboxCount,usePack}.js
    ui/{Icon,TabBar,primitives,tokens}.{jsx,js}
    utils/date.js
    views/
      LoginView.jsx                # Microsoft sign-in
      LandingView.jsx              # Onboarding (availability, modules)
      DashboardView.jsx
      TodayView.jsx
      WeekView.jsx
      CalendarView.jsx
      ModulesView.jsx              # entry point for materials picker
      ModuleDetailView.jsx
      MaterialsView.jsx            # checklist of Moodle files for AI
      UploadView.jsx
      SelectionView.jsx
      StudyPacksView.jsx
      PackReaderView.jsx
      AssessmentsView.jsx
      TimerView.jsx
      SettingsView.jsx
```

## Running locally

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e app/.[dev,pdf]
uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`. Override the API base URL
with `VITE_API_BASE_URL` if the backend is elsewhere.

## API surface (selected)

**Auth**

- `GET /auth/microsoft/start` — returns the Microsoft authorize URL
- `GET /auth/microsoft/callback` — OAuth2 callback (browser-only)
- `POST /auth/microsoft/dev` — dev shortcut (404 in production)
- `GET /auth/me` — current user from `Authorization: Bearer …`
- `POST /auth/logout`

**Users / planning**

- `POST /users` · `GET /users/{id}` · `PATCH /users/{id}`
- `POST /modules` · `POST /assessments`
- `POST /upload` (multipart .pdf/.docx/.txt)
- `POST /plans/generate` · `GET /plans/daily/{user_id}/{date}`
- `POST /plans/sessions/{id}/complete` · `POST /plans/session/feedback`
- `POST /plans/reschedule`

**Moodle**

- `POST /moodle/connect` (auth required)
- `POST /moodle/sync`
- `POST /moodle/ics/import`
- `GET /moodle/materials`
- `POST /moodle/materials/select`
- `POST /moodle/materials/ingest`

**AI / packs / sync**

- `POST /selection` · `GET /selection/latest/{user_id}/{module_id}`
- `POST /ai/preview` · `POST /ai/regenerate`
- `POST /pack/generate` · `GET /pack/{id}` · `GET /pack/{id}/download`
- `POST /sync` (manual-first delta sync for offline)

## Time feedback + personalization

- Each completed session collects an estimated-vs-actual ratio.
- The user's `pace_multiplier` is updated with EMA smoothing
  (`0.9·old + 0.1·ratio` for the first 3 samples, `0.8·old + 0.2·ratio`
  thereafter), clamped to `[0.7, 1.5]`, with outliers (`<0.3` or `>3.0`)
  ignored.
- The multiplier is applied to all future estimates only — past plans
  are not retroactively rewritten.

## Tests

```bash
pytest -q
```

27 tests cover the planner, ingestion pipeline, study-pack generation,
Microsoft sign-in (dev fallback), and material selection (incl. the
"user A can't flip user B's resources" case).

## Threat model notes

- Moodle WS tokens are stored under a base64 envelope today —
  replace `encrypt_token` / `decrypt_token` in
  `microsoft_auth_service.py`'s sibling `moodle_service.py` with
  Fernet (cryptography package) before going to production.
- Session tokens are opaque and stored server-side. Logging out deletes
  the row. Expired states/sessions are purged on each auth flow.
- Material selection updates are scoped to the current user via
  `WHERE module_id IN (SELECT id FROM modules WHERE user_id = ?)` —
  a stolen session can't flip another user's resources.

# StudyPartner

An AI-powered study planning system for working students with limited
time and limited data. StudyPartner ingests course material, estimates
how long it will take to learn, fits it into the student's actual
availability, and adapts the plan when life gets in the way.

## What it does

- **Ingests** notes, PDFs, DOCX, textbooks, past papers, and Moodle content.
- **Estimates workload** from page count, word count, and a content-complexity score.
- **Fits the schedule** to each student's real availability (e.g. "5 hours a day, 4 days a week").
- **Generates a daily study plan** that respects deadlines and module priority.
- **Adapts** when a student falls behind — completed sessions feed a personal pace multiplier and remaining work is rescheduled.
- **Mobile-first and low-data**: a 440-px web shell, IndexedDB offline cache, manual-first sync, and lazy material downloads (Moodle metadata is pulled at sync time; bytes only when the user picks a file for AI).

## Authentication

Two separate concerns:

| | Mechanism | Where |
|---|---|---|
| **StudyPartner login** | Email + password, PBKDF2 hashed, HMAC-signed JWT | `app/src/models/services/auth_service.py` · `POST /users/register` · `POST /users/login` · `GET /users/me` |
| **Moodle connection** | Moodle's mobile-launch flow — student is signed into the school's existing SSO (Microsoft) and Moodle hands us back a Web Services token | `app/src/models/services/moodle_service.py` · `POST /moodle/launch` · `POST /moodle/launch/callback` |

Microsoft sign-in is **not** a StudyPartner identity. It's just where
the student already is when they sign into Moodle. The launch flow
piggybacks on that existing SSO so we receive a Moodle WS token
without ever seeing the Microsoft password and without asking the
student to paste a token manually.

## Connecting Moodle (mobile-launch flow)

```
1. Student clicks "Fetch from myModules" in StudyPartner
2. Frontend  → POST /moodle/launch { urlscheme: "https://app/moodle/callback?" }
   Backend   → mints a single-use passport (10-min TTL, server-side)
              → returns
                <MOODLE>/admin/tool/mobile/launch.php
                  ?service=moodle_mobile_app
                  &passport=<random>
                  &urlscheme=https://app/moodle/callback?
3. Frontend stashes the passport in localStorage and navigates the
   browser to launch_url.
4. Moodle sees the user isn't signed in → redirects to the school's
   Microsoft tenant.
5. Microsoft authenticates the student → asserts identity back to Moodle.
6. Moodle creates a WS token for that user, redirects to:
        https://app/moodle/callback?token=<base64-blob>
7. The /moodle/callback page in StudyPartner reads `token` from the
   URL, reads `passport` from localStorage, POSTs both to
   /moodle/launch/callback.
8. Backend:
        - claims the passport (single-use; CSRF guard)
        - decodes blob → <signature>:::<token>:::<privatetoken>
        - calls Moodle to fetch siteid (also validates the token works)
        - verifies signature == md5(siteid + passport)
        - persists the WS token against the StudyPartner user
9. Frontend automatically calls /moodle/sync, then routes to the
   materials picker.
```

The blob format and the signed-passport handshake are exactly what
Moodle's official mobile app uses — no scraping, no cookie reuse, no
manual paste.

### Required Moodle config

UniSA's Moodle (or any Moodle running `tool_mobile`) needs to accept
the `urlscheme` we send. For an `https://` callback, the site admin
must allow web-app launches. If the site rejects our callback URL the
launch fails — **there is no manual-paste fallback** by design. To
guarantee acceptance, wrap StudyPartner in Capacitor and use a custom
`studypartner://` scheme.

### Required env var

```bash
export STUDYPARTNER_MOODLE_BASE_URL=https://mymodules.dtls.unisa.ac.za
```

The frontend doesn't need to know the URL — the backend resolves it.

## Selecting which materials feed the AI

After a Moodle sync, every imported resource shows up in
`/modules/materials` with an `included_in_ai` flag. The student ticks
the files they actually want StudyPartner to summarise, quiz, or break
into subtopics — typically the study guide and tutorial letters. Until
a file is ticked, **no bytes are downloaded** from Moodle.

| Endpoint | Purpose |
|---|---|
| `GET /moodle/materials` | list all imported resources, grouped by module, with `included_in_ai` |
| `POST /moodle/materials/select` | toggle a list of resource ids in/out (scoped to current user) |
| `POST /moodle/materials/ingest` | download bytes + run AI ingestion for everything currently ticked (idempotent) |

Re-syncs preserve the user's selection — `upsert_moodle_resources`
uses `ON CONFLICT DO UPDATE` and explicitly leaves `included_in_ai`
and `ingested_at` alone.

## Editing parsed units (and feeding back into the AI)

After a study guide is uploaded or pulled from Moodle, the structural
parser (`content_analysis_service.detect_learning_units` /
`detect_subtopics`) produces a tree of Learning Units → Subtopics.
The student opens **Modules → ⋯ → Edit parsed units** to:

- **Rename** a unit or subtopic the AI got wrong
- **Add** a missing unit or subtopic
- **Delete** noise the parser picked up
- **Edit content** — word count and effort score are recomputed so the
  planner re-estimates study time on the next plan generation

Every edit is logged to `parsing_feedback` server-side, capturing the
delta `(before, after)`. The next AI call on the same module folds the
five most recent corrections into the prompt as a few-shot preamble:

```
Use the following user corrections from earlier in this module as guidance:
- Unit was renamed from 'Complexity' to 'Time Complexity'
- Subtopic was renamed from 'Big-O' to 'Asymptotic Big-O'
---
<actual prompt>
```

The corrections are folded into the artifact cache key so flipping the
list does **not** silently serve a stale pre-correction artifact.

| Endpoint | Purpose |
|---|---|
| `POST /modules/{module_id}/learning-units` | add a unit (auto-assigns ordinal) |
| `PATCH /learning-units/{unit_id}` | rename / reorder a unit |
| `DELETE /learning-units/{unit_id}` | delete unit + cascade to subtopics |
| `POST /learning-units/{unit_id}/subtopics` | add a subtopic |
| `PATCH /subtopics/{subtopic_id}` | rename, edit content, reorder; effort_score auto-recomputed on content edits |
| `DELETE /subtopics/{subtopic_id}` | delete a single subtopic |
| `GET /modules/{module_id}/parsing-feedback` | full audit log of structural corrections (used for debugging and as future fine-tuning data) |

Ownership is enforced at the route layer via `get_module_owner` — a
stolen session can't edit another student's parsed units.

## How units feed the planner

The same `effort_score = word_count/500 + resource_weight` that
underpins the parsed tree is what the planner converts to minutes
(`compute_plan_from_subtopics` in `planning_service.py`), so:

- A subtopic the user **edits** (shorter content) takes less time on the
  next plan.
- A subtopic the user **deletes** disappears from the plan entirely.
- A subtopic the user **adds** gets folded in with its full effort.

Assessments drive the **priority** side: `calculate_priority(deadline,
current_day, remaining_minutes, started)` weights modules with closer
deadlines higher. Assessment due dates come from Moodle (auto-imported
by `mod_assign_get_assignments`) or manual entry on the Calendar page.
Together: pace × pages × word count × complexity × deadline → the
daily plan you see on the Today screen.

## Project structure

```
app/
  main.py
  storage.py
  src/
    models/
      entities.py
      services/
        ai_service.py
        auth_service.py            # PBKDF2 + JWT (StudyPartner login)
        content_analysis_service.py
        feedback_service.py
        ingestion_service.py
        moodle_service.py          # Mobile-launch flow + selective ingestion
        personalization_service.py
        planning_service.py
        study_pack_service.py
        sync_service.py
    routes/
      ai.py
      modules.py
      moodle.py                    # /moodle/{launch,launch/callback,sync,materials,…}
      packs.py
      plans.py
      selection.py
      sync.py
      users.py                     # /users/{register,login,me}
    tests/
      test_moodle_launch_and_materials.py
      test_pipeline.py
      test_planner.py
      test_production_fixes.py
    utils/
      auth.py                      # get_current_user dependency
      time.py

frontend/
  src/
    App.jsx
    api/{client,sync}.ts
    components/
      modules/
        FetchFromMyModulesButton.jsx
        ModuleCard.jsx
        AddModuleDialog.jsx
      ui/                           # shadcn primitives
    db/{schema,repos}.js            # Dexie/IndexedDB outbox for offline
    lib/{AuthContext,query-client,utils}.{jsx,ts}
    views/
      Login.jsx
      Dashboard.jsx
      Modules.jsx
      MoodleMaterials.jsx
      MoodleCallback.jsx
      CalendarView.jsx
      StudyPlan.jsx
      Profile.jsx
```

## Running locally

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e app/.[dev,pdf]
export STUDYPARTNER_MOODLE_BASE_URL=https://mymodules.dtls.unisa.ac.z
uvicorn app.main:app --reload
```

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e "app/.[dev,pdf]"
$env:STUDYPARTNER_MOODLE_BASE_URL="https://mymodules.dtls.unisa.ac.z"
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend defaults to `http://localhost:5173`, backend to
`http://localhost:8000`. Override with `VITE_API_BASE_URL` if either
moves.

## API surface (selected)

**Users / auth**

- `POST /users/register` · `POST /users/login` · `GET /users/me`
- `GET /users/{id}` · `PATCH /users/{id}` (self-only)

**Planning**

- `POST /modules` · `POST /assessments`
- `POST /upload` (multipart .pdf/.docx/.txt)
- `POST /plans/generate` · `GET /plans/daily/{user_id}/{date}`
- `POST /plans/sessions/{id}/complete` · `POST /plans/session/feedback`
- `POST /plans/reschedule`

**Moodle (mobile-launch flow)**

- `POST /moodle/launch` — start the SSO handshake
- `POST /moodle/launch/callback` — finish the handshake
- `POST /moodle/sync` — pull modules + assignments + resource metadata
- `POST /moodle/ics/import` — minimal ICS fallback for deadlines
- `GET  /moodle/materials` — list resources with AI selection state
- `POST /moodle/materials/select` — toggle which resources feed AI
- `POST /moodle/materials/ingest` — download + ingest the ticked ones

**AI / packs / sync**

- `POST /selection` · `GET /selection/latest/{user_id}/{module_id}`
- `POST /ai/preview` · `POST /ai/regenerate`
- `POST /pack/generate` · `GET /pack/{id}` · `GET /pack/{id}/download`
- `POST /sync` — manual-first delta sync

## AI backend

`AIService` produces summaries, subtopic quizzes, and topic quizzes.
Outputs are cached by `(scope, ref_id, content_hash, prompt_hash)` so
the same prompt never invokes the LLM twice.

Selector via `STUDYPARTNER_LLM_BACKEND`:

| Value | Behaviour |
|---|---|
| unset / `stub` | deterministic templates derived from the source content — no network calls. Default; keeps tests + demos hermetic. |
| `ollama` | local Ollama daemon (default `http://localhost:11434`). For local development against a real LLM. |
| `anthropic` | placeholder; not wired yet. Currently still defers to the stub. |

### Running against Ollama (local)

Install and start Ollama, then pull a small model:

```bash
# Linux / macOS
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull llama3.2          # ~2 GB — fits on a laptop, fast enough for testing
```

Tell StudyPartner to use it:

```bash
export STUDYPARTNER_LLM_BACKEND=ollama
export OLLAMA_MODEL=llama3.2          # default; override for any pulled model
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_TIMEOUT=60               # seconds — first call is slow as the model loads
uvicorn app.main:app --reload
```

The integration uses Ollama's `/api/generate` with `format: "json"` so
even small local models reliably return JSON we can parse.

If Ollama is unreachable mid-request, `AIService` logs a warning and
falls back to the deterministic stub for that single call — the user
still gets a usable response. Cached artifacts are tagged with the
model that produced them, so a stub-fallback response will be
re-generated against Ollama on the next call once it's back.

## Time feedback + personalization

- Each completed session collects an estimated-vs-actual ratio.
- The user's `pace_multiplier` is updated with EMA smoothing
  (`0.9·old + 0.1·ratio` for the first 3 samples, `0.8·old + 0.2·ratio`
  thereafter), clamped to `[0.7, 1.5]`, with outlier ratios (`<0.3` or
  `>3.0`) ignored.
- The multiplier is applied to all future estimates only — past plans
  are not retroactively rewritten.

## Tests

```bash
pytest -q
```

`test_moodle_launch_and_materials.py` covers:

- Launch URL construction and passport binding
- Auth-required launch endpoint (401 without bearer)
- Full callback round trip with a monkey-patched WS
- Bad/expired passport rejection
- Replay rejection (single-use passport)
- Signature mismatch rejection (forged blob)
- Materials listing/selection round trip
- Cross-user resource flip prevention
- Re-sync preserving the user's selection

## Threat model notes

- **Moodle WS tokens** are stored under a base64 envelope today —
  replace `encrypt_token` / `decrypt_token` in `moodle_service.py`
  with Fernet (cryptography package) before going to production.
- **Launch passports** are single-use, server-side, 10-minute TTL,
  and bound to the StudyPartner user that initiated the launch. The
  signature on the returned blob is verified against the Moodle
  siteid to detect forgery.
- **JWT** is HMAC-SHA256-signed with `STUDYPARTNER_SECRET` — change
  this from `dev-secret-change-me` in production. JWTs are stateless;
  there's no server-side revocation table yet.
- **Material selection writes** are scoped to the current user via
  `WHERE module_id IN (SELECT id FROM modules WHERE user_id = ?)` —
  a stolen session can't flip another user's resources.

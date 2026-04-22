# StudyPartner — an AI-powered study planning system for busy students balancing work, life, and deadlines.

## CORE OBJECTIVE

Help users consistently make progress in their studies by:

Turning unstructured study material into structured plans
Allocating realistic study time based on their availability
Adapting when users fall behind
Prioritizing what matters most (deadlines, workload, pace)


# StudyPartner Backend Service

## Project structure

```text
app/
  main.py
  models/
    __init__.py
    entities.py
  routes/
    users.py
    modules.py
    plans.py
  services/
    planning_service.py
    ingestion_service.py
    personalization_service.py
  storage.py
tests/
  test_planner.py
```

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload
```

## Implemented data models

- User
- Module
- Assessment
- StudyTopic
- StudyUnit
- Session
- SessionFeedback (storage table)
- WeeklyPlan / WeeklyModuleSummary

## Implemented core services

`app/services/planning_service.py`
- `content_to_units()`
- `estimate_time()`
- `calculate_priority()`
- `allocate_time()`
- `generate_sessions()`
- `reschedule()`

`app/services/ingestion_service.py`
- deterministic extraction (`.txt`, `.pdf`)
- cleaning, topic parsing, upload+ingest pipeline

`app/services/personalization_service.py`
- pace multiplier update via session feedback
- smoothing, clamping, outlier filtering

## API endpoints

- `POST /users` create user
- `GET /users/{user_id}` get user
- `POST /modules` add module
- `POST /assessments` add assessment
- `POST /upload` upload content and generate units
- `POST /plans/generate` generate weekly plan
- `GET /plans/daily/{user_id}/{for_date}` get daily plan
- `POST /plans/sessions/{session_id}/complete` mark session complete
- `POST /plans/session/feedback` submit estimated vs actual feedback
- `POST /plans/reschedule` trigger reschedule
- `GET /modules/{id}/content` content summary
- `GET /modules/{id}/study-units` units summary

## Time feedback + personalization

- Feedback payload stores:
  - `study_unit_id`
  - `estimated_time_minutes`
  - `actual_time_minutes`
  - timestamp
- User has `pace_multiplier` with default `1.0`
- Update rule:
  - `ratio = actual / estimated`
  - `new = old*0.8 + ratio*0.2` (or gentler `0.9/0.1` before 3 samples)
- Outlier guard: ignore ratio `<0.3` or `>3.0`
- Clamp multiplier between `0.7` and `1.5`
- Multiplier is applied to future estimates only

Example:
- Before estimate: `45`
- User multiplier after feedback: `1.3`
- New estimate: `58.5 ≈ 60`

## Example flow

1. Create user
2. Add module + assessment
3. Upload content
4. Generate weekly plan
5. Complete a session
6. Submit feedback:
```json
POST /plans/session/feedback
{
  "user_id":"u1",
  "session_id":"s1",
  "actual_time_minutes":120
}
```
7. Regenerate/reschedule and future estimates reflect learned pace

## Rescheduling demo

Run:
```bash
python -m app.utils.example_flow
```

The demo:
- generates a plan
- marks first session complete
- sends feedback
- updates multiplier
- reschedules remaining work

## Tests

```bash
pytest -q
```

## Frontend app (React + Tailwind)

A full web frontend is available in `frontend/` and integrates with the backend endpoints.

### Run frontend

```bash
cd frontend
npm install
npm run dev
```

Set API base URL (optional):

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Frontend structure

```text
frontend/
  src/
    api/client.js
    components/
    lib/date.js
    pages/
      LandingPage.jsx
      DashboardPage.jsx
      TodayPage.jsx
      WeekPage.jsx
      ModulesPage.jsx
      SettingsPage.jsx

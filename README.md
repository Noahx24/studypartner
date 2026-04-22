# StudyPartner Backend Service

Multi-user backend with strict user-level data isolation, authenticated access, and per-user pace personalization.

## Project structure

```text
app/
  main.py
  models/
    __init__.py
    entities.py
  routes/
    users.py        # register/login/me
    modules.py      # module + assessment + upload
    plans.py        # plan generation + completion + feedback + reschedule
  services/
    auth_service.py
    planning_service.py
    ingestion_service.py
    feedback_service.py
  storage.py
  utils/
    auth.py
    example_flow.py
tests/
  test_planner.py
```

## User model

`User` includes:
- `id`, `name`, `email`
- `password_hash`
- `pace_setting` (`slow|normal|fast|custom`)
- `pace_multiplier` (default `1.0`)
- `created_at`

## Data isolation

All access is scoped by authenticated `user_id`:
- modules
- uploads/content
- assessments
- study units
- sessions
- feedback

Storage methods enforce ownership checks (`module_belongs_to_user`, user-scoped `get_session`, `get_unit`, `get_module_content`, etc.).

## Auth flow

- `POST /auth/register` → creates user + returns token
- `POST /auth/login` → returns token
- `GET /auth/me` → returns current user profile

All protected endpoints require:
- `Authorization: Bearer <token>`

## Personalization loop (per user)

`POST /plans/session/feedback`
- Stores: `study_unit_id`, `estimated_time_minutes`, `actual_time_minutes`, timestamp
- Ratio: `actual / estimated`
- Update:
  - `new = old*0.8 + ratio*0.2`
  - warm-up first 3 samples uses alpha `0.1`
- Clamp: `[0.7, 1.5]`
- Ignore outliers `<0.3` or `>3.0`
- Applies only to that user’s open units

## Example

User A:
- estimate 45, actual 90
- ratio 2.0
- multiplier moves toward ~1.3

User B:
- estimate 45, actual 30
- ratio 0.67
- multiplier moves toward ~0.85

Future estimates/plans diverge by user because
`estimate = base_estimate * user.pace_multiplier`.

## API endpoints

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /modules`
- `POST /assessments`
- `POST /upload`
- `POST /plans/generate`
- `GET /plans/daily/{for_date}`
- `POST /plans/sessions/{session_id}/complete`
- `POST /plans/session/feedback`
- `POST /plans/reschedule`
- `GET /modules/{id}/content`
- `GET /modules/{id}/study-units`

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload
```

## Test

```bash
pytest -q
```

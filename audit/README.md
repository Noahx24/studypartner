# StudyPartner — Visual Audit (2026-06-12)

A complete screenshot audit of the running application. Every accessible
screen, modal, empty/loading/error/success state, dark mode, and
responsive layout was captured against the live app
(Vite frontend + FastAPI backend, seeded with a real test account).

## Deliverables

| Document | Contents |
|---|---|
| [`SCREEN_INVENTORY.md`](./SCREEN_INVENTORY.md) | Every screen + route/URL, view file, auth gating, and which screenshot covers each state |
| [`NAVIGATION_MAP.md`](./NAVIGATION_MAP.md) | How users move between screens (tab bar + screen graph) |
| [`MOODLE_INTEGRATION.md`](./MOODLE_INTEGRATION.md) | Live UNISA Moodle SSO test — what passed, where it stops, and why |
| [`UNREACHABLE.md`](./UNREACHABLE.md) | Routes/components/features in the code that couldn't be reached, with reasons |
| [`screenshots/`](./screenshots) | 53 full-resolution 2× PNGs (`01`–`46` app states, `M01`–`M07` Moodle flow) |
| [`seed.py`](./seed.py) | Reproducible test-data seeder |

## How to reproduce

```bash
# backend
python -m venv .venv && .venv/bin/pip install -e "app/.[dev,pdf]"
STUDYPARTNER_MOODLE_BASE_URL=https://mymodules.dtls.unisa.ac.za \
STUDYPARTNER_FERNET_KEY=<generate via python -m app.src.utils.crypto generate-key> \
STUDYPARTNER_SECRET=<32+ char secret> STUDYPARTNER_ENV=development \
STUDYPARTNER_CORS_ORIGINS=http://localhost:5173 \
.venv/bin/uvicorn app.main:app --port 8000 &

# frontend
cd frontend && npm install && npm run dev &

# seed + screenshot (Playwright)
curl -X POST localhost:8000/users/register -H 'Content-Type: application/json' \
  -d '{"email":"test.student@example.com","password":"Audit-Pass-2026!","name":"Thandi Mokoena"}'
.venv/bin/python audit/seed.py
```

## Headlines

- **Coverage:** all 12 routes, all 6 overlays/dialogs, all empty +
  loading + validation + success states, dark mode, and the desktop
  responsive layout were captured.
- **Bug found & fixed:** the Today dashboard called a non-existent API
  method (`getPlanRange`), so it always showed "No sessions today".
  One-line fix in `Dashboard.jsx` (`getSessionsRange`).
- **Moodle:** the SSO handshake is wired correctly all the way to the
  Microsoft MFA gate; the final token callback is native-only by design
  and can't complete in a browser. Backend Moodle suite: 15/15.
- **Product gaps:** the AI study-pack / quiz / summary feature, password
  reset, and ICS import all have backend + API client code but **no UI**
  to reach them. See `UNREACHABLE.md`.
- **Dev footgun:** the Moodle test suite shares the dev SQLite file and
  wipes it on run — flagged in `SCREEN_INVENTORY.md`.

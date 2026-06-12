# StudyPartner — Navigation Map

How a user moves between screens. The app is a mobile-first single-page
app with a persistent 4-item bottom tab bar (`AppLayout.jsx`) wrapping
every authenticated screen except `/onboarding` (full-screen).

## Entry & auth

```
                 ┌─────────────┐
   first visit → │   /login    │
                 │  ┌────────┐ │
                 │  │Sign in │ │──(valid creds)──────────────┐
                 │  ├────────┤ │                             │
                 │  │Create  │ │──(register)──► /onboarding   │
                 │  │account │ │                  │           │
                 │  └────────┘ │           (3 steps:          │
                 └─────────────┘            availability →    │
                        ▲                    connect Moodle → │
   no token / 401 ──────┘                    done) ──► /  ◄───┘
```

`AuthContext` redirects any app route to `/login` when no valid
`studypartner_token` is present. `logout()` (Profile) and account
deletion both clear the token and return to `/login`.

## Bottom tab bar (always visible when authenticated)

```
  ┌──────────┬──────────┬──────────┬──────────┐
  │  Today   │   Plan   │ Modules  │ Profile  │
  │   "/"    │  /plan   │ /modules │ /profile │
  └──────────┴──────────┴──────────┴──────────┘
```

## Screen graph

```
/  (Today / Dashboard)
├── tap progress header ───────────► /pacing
├── "Get Started" (empty state) ───► /modules
├── SessionCard ✓ complete ─────────► (stays; updates streak + pacing)
├── SessionCard "Skip" ─────────────► (marks missed → surfaces in /catch-up)
└── UpcomingPreview "View all" ─────► /plan

/plan  (Study Plan)
├── "Plan my week" ─────────────────► (generates plan, stays)
├── List ⇄ Calendar toggle ─────────► embeds /calendar
├── catch-up alert (if missed > 0) ─► /catch-up
└── SessionCard complete / skip ────► (same as Dashboard)

/modules
├── "Add" / empty "Add Module" ─────► Add Module dialog
│      step 1 (details + file) ─► step 2 (AI analysis) ─► saves, back to list
├── "Fetch from myModules" ─────────► Moodle SSO launch (see MOODLE_INTEGRATION.md)
├── "Choose study materials" ───────► /modules/materials
└── ModuleCard ⋮
       ├── "Edit parsed units" ──────► /modules/:moduleId/units
       └── "Delete" ─────────────────► (removes module, stays)

/modules/:moduleId/units  (Units Editor)
├── expand unit ─► subtopic rows
├── pencil ──────► inline rename (unit / subtopic)
├── file-text ───► subtopic content editor dialog (Save & Recompute)
├── "Add unit" / "Add subtopic" ────► inline create
└── back ─────────────────────────► /modules

/modules/materials  (Moodle Materials)
├── checkboxes ─► local selection
├── "Save my choices" ──────────────► persists included_in_ai
├── "Use X for studying" ───────────► downloads + ingests bytes
├── Resync ─────────────────────────► /moodle/sync, refetch
└── back ──────────────────────────► /modules

/catch-up
├── "Reschedule all (N)" ───────────► refits missed sessions, stays
└── back ──────────────────────────► previous (Plan / Dashboard)

/pacing   (read-only stats) ── back ─► /  (Dashboard)

/profile
├── day toggles + sliders ─► "Save Schedule" (re-fits future plans)
├── "Sign out" ─────────────────────► /login
└── "Delete account" ─► confirm dialog ─► /login
```

## Cross-cutting overlays

- **OfflineBanner** — sticky top, appears on any screen when the
  browser goes offline (`frame 42`).
- **ErrorBoundary** — replaces the whole screen if a view throws during
  render; offers "Reload". (Not triggered during this audit — see
  UNREACHABLE.md.)
- **Toasts (sonner)** — transient bottom overlays for success/error on
  most mutations (`frames 17, 24, 25, 35`).

# GitHub Copilot – Repository Instructions (Portfolio pilot)

Goal: give an AI coding agent the key, discoverable knowledge to be productive immediately in this repo.

Quick architecture
- Frontend: `frontend/` (Vite + React + TypeScript). SPA. Build-time API base: `VITE_API_URL`. Runtime override: `frontend/public/config.json`.
- Backend: `backend/` (Flask). App factory in `backend/api/app.py`; blueprints in `backend/api/routes.py`. Firestore access in `backend/db/firestore_client.py`.
- Data flow: Frontend -> Backend (/api/*) -> Firestore or external services (`backend/services/*`, `core/*`).

Key files & patterns (concrete examples)
- `backend/api/app.py`: create_app(), intentional lazy imports to avoid side effects; registers blueprint `api.routes`; exposes `/api/health` and a dev-only `/api/debug/firestore/summary` endpoint.
- `backend/db/firestore_client.py`: centralized collection names and EMULATOR_HOST detection — search for `EMULATOR_HOST` when working with local emulator logic.
- `backend/services/data_fetcher.py`: canonical cached fetch pattern; reuse it for new external integrations.
- `core/`: business logic (portfolio aggregation, report generation). Keep heavy logic here; routes should be thin wrappers.
- `frontend/src/apiBase.ts`, `withQueryClient.tsx`, `AuthContext.tsx`: frontend patterns for API calls, React Query, and auth. Reuse contexts/hooks rather than adding ad-hoc fetches.

Developer workflows (copyable commands)
- Backend (venv):
  - cd backend
  - python -m venv .venv
  - .venv/bin/pip install -r requirements.txt
  - FLASK_APP=api.app FLASK_ENV=development flask run --port=5000
- Frontend dev:
  - cd frontend && npm install && npm run dev  # Vite dev server (package.json uses port 8000)
- Backend tests:
  - cd backend && python -m unittest discover
- Firestore emulator (local dev):
  - export FIRESTORE_EMULATOR_HOST=localhost:8085
  - export GOOGLE_CLOUD_PROJECT=demo-project
  - backend will detect emulator via `EMULATOR_HOST` in `firestore_client.py`.

Conventions & gotchas (project-specific)
- Modular layering: core = business logic, db = persistence, services = external API wrappers, api/ = Flask wiring. Keep this separation.
- Lazy imports in `api/app.py` are deliberate — they prevent expensive side effects during import-time used by tests and tools.
- Frontend: API base is injected at build-time (`VITE_API_URL`). For runtime swappable endpoints, use `public/config.json` pattern already present.
- Docker/Cloud Run: backend Dockerfile binds to 8080. For Cloud Run make Gunicorn respect `$PORT` (README shows the recommended change).
- Security: `/api/debug/firestore/summary` is intentionally unsecured for local debugging — do not enable in production.

Testing & quality gate
- When changing backend logic, add/update tests under `backend/tests/` and run `python -m unittest discover` before committing.
- Prefer adding small, focused unit tests in `backend/tests/` that import core modules directly (avoid starting Flask server in unit tests).

UI & responsiveness (important)
- The UI must be responsive and usable on both desktop and mobile. Follow mobile-first, responsive design and standard UX best-practices.
- Concrete places to look: `frontend/src/components/PageShell.tsx` (page layout wrapper), `frontend/src/index.css` (global typography and base styles), and component files in `frontend/src/components/`.
- Practical guidelines for changes or new components:
  - Design mobile-first: prefer a single responsive component using CSS utilities / media queries (`sm:`, `md:` breakpoints) rather than separate mobile/desktop code paths.
  - Keep touch targets >= 40–48px and ensure modals & menus are accessible on small screens (example: `EditTransactionModal.tsx`, `TickerResolutionModal.tsx`).
  - Use stacking and collapsible sections on small screens (see `CollapsibleTransactionsSection.tsx`) and richer multi-column layouts on larger screens (use `sm:`/`md:` utilities).
  - Avoid fixed-width containers; prefer percentage, max-width, and responsive padding (see `PageShell.tsx` padding classes `px-3 sm:px-4`).
  - Ensure charts and tables are responsive: use container-based sizing or provide alternate summarized views on narrow screens (see `charts/` and `TickerReturnsTable.tsx`).
  - Test in narrow viewport (320px) and common mobile widths; follow progressive enhancement (desktop gets more details, mobile keeps core actions visible).
- When updating UI, add or update a small visual smoke test (manual steps in a PR description) that lists viewports checked (e.g., 360x800, 412x915, 768x1024, 1366x768).

Modularity & reusable UI components (frontend)
- The modularity of the code and the structuring of reusable graphical components is fundamental. The frontend is component-driven; prefer small, focused components that are easy to test and compose.
- Concrete examples to follow: `frontend/src/components/KpiCard.tsx`, `PageShell.tsx`, `CollapsibleTransactionsSection.tsx`, `PerformanceChart.tsx`, `TickerReturnsTable.tsx` and individual modal components like `EditTransactionModal.tsx` and `TickerResolutionModal.tsx`.
- Practical rules:
  - Single responsibility: each component should do one thing (render a card, a chart wrapper, a table row). If it grows, split into presentation + container or into smaller subcomponents.
  - Props-driven: make components configurable through props (callbacks, data, loading/error states) rather than reading global state directly. Use contexts (`AuthContext.tsx`, `SelectedPortfolioContext.tsx`) only for truly cross-cutting concerns.
  - Accessibility & touch: add semantic HTML, aria attributes where appropriate, and keep touch targets >= 40–48px. Ensure keyboard focus states are visible (see global styles in `index.css`).
  - Styling: use the existing theme / global CSS variables (see `index.css` and `theme/`) and prefer responsive utility classes (the project uses mobile-first breakpoints like `sm:` / `md:` in components).
  - Responsiveness: components must render well on narrow viewports; provide summarized or collapsed variants when space is constrained (see `CollapsibleTransactionsSection.tsx`).
  - Avoid duplicated markup: create small shared presentational components for repeated patterns (KPI row, loading card, empty state).
  - Charts & tables: wrap charts/tables in responsive containers (resize observers or container queries) and provide fallback summarized views for very small screens.
  - Tests & smoke checks: add focused unit tests for components (React Testing Library) and include a visual smoke test list in PR descriptions describing viewport sizes checked.

- When adding new UI components, also add or update:
  - A unit test exercising the main render states (loading, empty, success, error).
  - A short PR checklist entry listing viewports and accessibility checks.

Authentication for API calls
- All API calls must be authenticated by default. The backend enforces this in `backend/api/routes.py` via a `before_request` handler which validates Google ID tokens using helpers in `backend/api/auth.py`.
- Key helpers:
  - `api.auth.require_google_token()` - decorator for route-level enforcement and detailed validation.
  - `api.auth.get_request_user_id_or_error()` - returns `(uid, error_response)` and is used by the global before_request.
- To make a specific endpoint public (e.g., a public ticker search), either:
  - handle `OPTIONS` preflight explicitly and return early, and implement custom logic to bypass auth, or
  - apply a custom `@allow_public` pattern (not present by default) that should perform explicit checks. Prefer making endpoints explicit rather than implicit.
- Configure `GOOGLE_CLIENT_ID`, and optionally `ALLOWED_EMAILS` / `ALLOWED_DOMAINS` environment variables for authorization checks.

If something is missing
- Ask which area (frontend hooks, a specific service, or DB schema) and I will expand this doc with examples and file references.

Please review and tell me any additional repo-specific rules or files you want highlighted.
# PortfolioPilot

PortfolioPilot is a full-stack application for portfolio management, analysis, and reporting. It features a Python backend for data processing and a modern React/TypeScript frontend for user interaction.

## Features

- Portfolio tracking and performance analysis
- Integration with market data sources
- KPI and report generation
- Interactive charts and visualizations
- User authentication and settings management

## Demo

### Videos

![Portfolio Overview](https://drive.google.com/file/d/1K5dMAa60Cw8ra5tfL7vbQO-3zEmvZgc6/view?usp=drive_link)

![Portfolio Report]([https://drive.google.com/file/d/1K5dMAa60Cw8ra5tfL7vbQO-3zEmvZgc6/view?usp=drive_link](https://drive.google.com/file/d/1xS9220xQtTgULe8qvE714PDpvw1m_yfl/view?usp=drive_link))

![Asset Report]([https://drive.google.com/file/d/1K5dMAa60Cw8ra5tfL7vbQO-3zEmvZgc6/view?usp=drive_link](https://drive.google.com/file/d/1YnAKZlb-c1PLWwSPOZWYSa2tZiBa5Dw8/view?usp=drive_link))


### Screenshots

*Portfolio Overview*
![Dashboard Screenshot](demo/Screenshot%202025-07-10%20alle%2009.42.32.png)

*Asset Allocation*
![Portfolio KPIs](demo/Screenshot%202025-07-10%20alle%2009.42.40.png)

*Portfolio Performance & Benchmark Comparison*
![Performance Chart](demo/Screenshot%202025-07-10%20alle%2009.43.08.png)

*Asset Comparison*
![Asset Allocation](demo/Screenshot%202025-07-10%20alle%2009.43.31.png)

*Asset Performance Overview*
![Portfolio Details](demo/Screenshot%202025-07-10%20alle%2009.45.21.png)


---

## Project Structure

```
/portfolio-pilot
├── backend/                # Python backend (Flask API, services, db modules)
│   ├── api/                # Flask application factory & blueprints
│   ├── core/               # Portfolio + ingestion logic
│   ├── services/           # Gemini & data fetcher services
│   ├── db/                 # Firestore + persistence layer
│   └── requirements.txt    # Backend Python dependencies
├── frontend/               # Vite + React + TypeScript SPA
│   ├── src/                # Components, pages, contexts
│   ├── public/             # Static assets & PWA manifest (+ optional config.json)
├── firestore-access.json   # Service account (NOT committed; example only)
├── .env.example            # Sample env vars
├── requirements.txt        # Root convenience (may mirror backend)
└── README.md               # Project documentation
```

---

## Backend Setup (Python)

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
2. **Set up environment variables:**
   - Place API keys or secrets in `backend/key` as needed.
3. **Run the backend server:**
   ```bash
   python app.py
   ```

---

## Frontend Setup (React/TypeScript)

1. **Install dependencies:**
   ```bash
   cd my-portfolio-app
   npm install
   ```
2. **Start the development server:**
   ```bash
   npm run dev
   ```
3. **Access the app:**
   - Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Usage
### PWA Features

The frontend is installable as a Progressive Web App:
* `public/manifest.json` defines metadata (name, theme, icons).
* `public/sw.js` implements a basic caching strategy (cache-first for static, network-first for `/api/`).
* `index.html` registers the service worker on load.

You can improve offline support by expanding the precache list in `sw.js` and handling fallback pages (e.g., an offline.html). After deploying, Chrome’s Lighthouse can audit PWA compliance.


- Log in and connect your portfolio.
- View performance charts, KPIs, and reports.
- Use the chat interface for portfolio insights.
- Adjust settings and manage your account.

---

## Testing

- **Backend:**
  ```bash
  cd backend
  python -m unittest discover
  ```
- **Frontend:**
  ```bash
  cd my-portfolio-app
  npm test
  ```

---

## Contributing

1. Fork the repo and create your branch.
2. Make changes and add tests.
3. Submit a pull request.

---

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3).

By using, modifying, or distributing this software, you agree to the terms and conditions of the GPLv3. See the [LICENSE](./LICENSE) file for details.

---

## Contact
---

## Deployment Guide

This section covers multiple deployment targets. Choose the one matching your infrastructure maturity.

### Firebase Hosting (Frontend) + Google Cloud Run (Backend)

Fast global CDN hosting for static frontend. Requires a Firebase project (can be same GCP project).

Steps:
```bash
firebase login
firebase use --add your-firebase-project-id  # or set in .firebaserc
cd frontend
npm ci
VITE_API_URL=https://YOUR_CLOUD_RUN_URL/api npm run build
cd ..
firebase deploy --only hosting
```

Runtime override (optional): place `frontend/public/config.json` with:
```json
{ "API_BASE_URL": "https://YOUR_CLOUD_RUN_URL/api" }
```
and deploy again; the SPA will consume it before boot.


Cloud Run runs containers with automatic scaling. Architecture:
* Backend on Cloud Run (public or behind IAP)
* Frontend static assets on Firebase Hosting (global CDN)
* Firestore (native) for persistence

Build & Deploy Backend:
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/portfolio-backend ./backend
gcloud run deploy portfolio-backend \
  --image gcr.io/YOUR_PROJECT_ID/portfolio-backend \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars FIRESTORE_DATABASE=(default),GEMINI_API_KEY=YOUR_KEY
```

Note: The backend Dockerfile already starts Gunicorn bound to `0.0.0.0:8080`. Cloud Run injects `PORT`, but our CMD pins 8080; you can modify the Dockerfile to use `$PORT` for portability:
```dockerfile
CMD ["gunicorn", "--bind", "0.0.0.0:${PORT}", "api.app:app"]
```
And change the module reference from `app:app` (root) to `api.app:app` because within `backend/` the Flask instance lives in `api/app.py`.

Frontend Build & Hosting (Cloud Storage + CDN):
```bash
cd frontend
npm ci
npm run build
gsutil mb -l europe-west1 gs://YOUR_BUCKET_NAME
gsutil -m rsync -r dist gs://YOUR_BUCKET_NAME
gsutil iam ch allUsers:objectViewer gs://YOUR_BUCKET_NAME   # public
```
Then set up a Cloud CDN-backed HTTPS Load Balancer (optional) for custom domain.

### Firestore Emulator (Local Dev)

If you wish to avoid real Firestore usage locally, enable the emulator service in `docker-compose.yml` and set:
```bash
export FIRESTORE_EMULATOR_HOST=localhost:8085
export GOOGLE_CLOUD_PROJECT=demo-project
```
The backend will detect `FIRESTORE_EMULATOR_HOST` and route operations to the emulator.

### Environment Variables Summary

| Variable | Purpose |
|----------|---------|
| GEMINI_API_KEY | Access Gemini API for AI portfolio features |
| GOOGLE_CLOUD_PROJECT | Firestore project / emulator project id |
| FIRESTORE_DATABASE | Firestore database name (often `(default)`) |
| FIRESTORE_EMULATOR_HOST | Host:port for emulator (auto-activates emulator mode) |
| GOOGLE_APPLICATION_CREDENTIALS | Path to service account JSON (avoid if using Workload Identity) |
| VITE_API_URL | Build-time injection of backend API base into frontend |
| GOOGLE_OAUTH_AUDIENCE | Validation of Google-issued tokens in `api.auth` |

### Production Hardening Checklist

* Remove or secure `/api/debug/firestore/summary` endpoint.
* Enforce HTTPS (Cloud Run or LB) and set HSTS via Nginx if self-hosted.
* Configure proper CORS allowlist.
* Rotate API keys & service accounts; prefer Workload Identity on GCP.
* Add structured logging & monitoring (Cloud Logging, Error Reporting).
* Set up CI pipeline for tests (`pytest` + frontend build) prior to deploy.
* Add healthcheck alerting (Cloud Monitoring uptime checks).

### Updating Backend (Cloud Run)

After changes:
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/portfolio-backend ./backend
gcloud run deploy portfolio-backend --image gcr.io/YOUR_PROJECT_ID/portfolio-backend
```

---

## Troubleshooting

| Symptom | Possible Cause | Fix |
|---------|----------------|-----|
| 502 from Nginx `/api/` | Backend container not healthy | `docker compose logs backend` and check Gunicorn binding |
| Firestore permission errors | Invalid / missing credentials | Ensure service account JSON mounted; check IAM roles (Datastore User) |
| Frontend requests hitting localhost:5000 in prod | Missing `VITE_API_URL` at build | Rebuild frontend with correct env; set `VITE_API_URL` ARG |
| CORS errors | Missing CORS configuration in Flask | Add `flask-cors` init or restrict origins appropriately |

For additional support open an issue.


For questions or support, please open an issue or contact the maintainer.


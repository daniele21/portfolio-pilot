# PortfolioPilot Backend

This folder contains the backend code for PortfolioPilot.

## Structure
- `api/` - Flask API application and routes
- `core/` - Core business logic (portfolio, reports, Gemini integration)
- `db/` - Database models and access logic
- `services/` - Integrations with external APIs (e.g., Yahoo Finance)
- `config/` - Configuration files and secrets (do not commit real secrets)
- `scripts/` - Utility scripts and CLI tools
- `tests/` - Unit tests for backend modules

## Setup
1. Install dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
2. Set up environment variables and secrets as needed in `config/key` or `.env` files.
3. Run the backend server:
   ```bash
   python api/app.py
   ```

## Testing
Run all backend tests:
```bash
cd backend/tests
python -m unittest discover
```

---

See the main project README for more details.

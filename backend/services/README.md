# Backend Services

This folder contains integrations with external services and APIs used by the backend.

## Structure
- `data_fetcher.py`: Handles fetching and caching of market/ticker data from external APIs (e.g., Yahoo Finance).

## How to Add a New Service
1. Create a new Python file for your service (e.g., `my_service.py`).
2. Implement your integration logic.
3. Import and use your service in the relevant backend modules.

## Example Usage
See `data_fetcher.py` for an example of how to structure a service integration.

---

**Note:** Do not store API keys or secrets in this folder. Use the `backend/config/key` directory for secrets and environment variables.
